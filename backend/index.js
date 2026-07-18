require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { ethers } = require("ethers");

const vtpass = require("./lib/vtpass");
const { computeAccountHash } = require("./lib/hash");
const { registerOrder, getOrderMeta, markProcessed } = require("./lib/store");

const PORT = process.env.PORT || 4000;

// ---------- Load the compiled contract ABI ----------
// Run `npm install && npx hardhat compile` from the PROJECT ROOT first.
const artifactPath = path.join(
  __dirname,
  "..",
  "artifacts",
  "contracts",
  "UtilityGateway.sol",
  "UtilityGateway.json"
);

if (!fs.existsSync(artifactPath)) {
  console.error(
    "\nCould not find compiled contract artifact at:\n  " +
      artifactPath +
      "\n\nRun this first, from the project root:\n  npm install\n  npx hardhat compile\n"
  );
  process.exit(1);
}

const { abi } = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

// ---------- Connect to Monad testnet ----------
const provider = new ethers.JsonRpcProvider(
  process.env.MONAD_TESTNET_RPC || "https://testnet-rpc.monad.xyz/"
);

if (!process.env.OPERATOR_PRIVATE_KEY) {
  console.error("Missing OPERATOR_PRIVATE_KEY in backend/.env");
  process.exit(1);
}
if (!process.env.CONTRACT_ADDRESS) {
  console.error("Missing CONTRACT_ADDRESS in backend/.env");
  process.exit(1);
}

const operatorWallet = new ethers.Wallet(process.env.OPERATOR_PRIVATE_KEY, provider);
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, abi, operatorWallet);

// ---------- Electricity DISCO -> VTpass serviceID map ----------
// "ikeja-electric" is confirmed directly against VTpass's docs (incl. the
// sandbox test meter numbers below). The rest follow VTpass's standard
// naming pattern but haven't been individually verified here - spot-check
// with GET /api/service-variations (or a test purchase) before demoing any
// DISCO other than IKEDC.
const DISCO_SERVICE_IDS = {
  IKEDC: "ikeja-electric", // confirmed - use this one for the demo
  EKEDC: "eko-electric",
  KEDCO: "kano-electric",
  PHED: "portharcourt-electric",
  JED: "jos-electric",
  IBEDC: "ibadan-electric",
  KAEDCO: "kaduna-electric",
  AEDC: "abuja-electric",
  EEDC: "enugu-electric",
  BEDC: "benin-electric",
  ABA: "aba-electric",
  YEDC: "yola-electric",
};

// ---------- productCode parsing per serviceType ----------
// AIRTIME     -> productCode is a naira amount string, e.g. "200"
// DATA        -> productCode is a VTpass variation_code, e.g. "mtn-1gb-30days"
// ELECTRICITY -> productCode is "PREPAID:2000" or "POSTPAID:2000"
// CABLE_TV    -> productCode is a VTpass variation_code, e.g. "dstv-padi"

async function deliverOrder({ orderId, serviceType, provider: providerName, productCode, meta }) {
  switch (serviceType) {
    case "AIRTIME":
      return vtpass.buyMtnAirtime({
        phone: meta.accountId,
        amountNgn: Number(productCode),
        orderId,
      });

    case "DATA":
      return vtpass.buyMtnData({
        phone: meta.accountId,
        variationCode: productCode,
        orderId,
      });

    case "ELECTRICITY": {
      const [meterType, amountStr] = productCode.split(":");
      const discoServiceId = DISCO_SERVICE_IDS[providerName];
      if (!discoServiceId) throw new Error(`Unknown electricity provider: ${providerName}`);
      return vtpass.buyElectricity({
        discoServiceId,
        meterNumber: meta.accountId,
        meterType: meterType.toLowerCase(),
        amountNgn: Number(amountStr),
        phone: meta.phone || meta.accountId,
        orderId,
      });
    }

    case "CABLE_TV":
      return vtpass.buyCableTv({
        cableServiceId: providerName.toLowerCase(),
        smartcardNumber: meta.accountId,
        variationCode: productCode,
        phone: meta.phone || meta.accountId,
        subscriptionType: meta.subscriptionType || "change",
        orderId,
      });

    default:
      throw new Error(`Unknown serviceType: ${serviceType}`);
  }
}

// ---------- Order fulfillment ----------
async function fulfillOrder({ orderId, accountHashOnchain, serviceType, provider: providerName, productCode }) {
  console.log(`\n[order ${orderId}] PaymentReceived - ${serviceType} / ${providerName} / ${productCode}`);

  // Frontend calls POST /api/orders right after the purchase tx confirms.
  // Give it a little time in case the event beats the API call.
  let meta = getOrderMeta(orderId);
  for (let attempt = 0; !meta && attempt < 10; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    meta = getOrderMeta(orderId);
  }

  if (!meta) {
    console.error(`[order ${orderId}] No account details registered in time - marking failed.`);
    await contract.markFailed(orderId, "no account details registered");
    return;
  }

  const expectedHash = computeAccountHash(meta.accountId, meta.salt);
  if (expectedHash.toLowerCase() !== accountHashOnchain.toLowerCase()) {
    console.error(`[order ${orderId}] account hash mismatch - refusing to deliver.`);
    await contract.markFailed(orderId, "account hash mismatch");
    return;
  }

  try {
    console.log(`[order ${orderId}] Calling VTpass sandbox...`);
    const result = await deliverOrder({ orderId, serviceType, provider: providerName, productCode, meta });

    if (vtpass.isDelivered(result.response)) {
      console.log(`[order ${orderId}] Delivered. Marking fulfilled onchain...`);
      const tx = await contract.markFulfilled(orderId);
      await tx.wait();
    } else {
      const reason = result.response?.response_description || "vtpass did not confirm delivery";
      console.log(`[order ${orderId}] Not delivered (${reason}). Marking failed onchain...`);
      const tx = await contract.markFailed(orderId, String(reason).slice(0, 200));
      await tx.wait();
    }
  } catch (err) {
    const reason = err?.response?.data?.response_description || err.message || "unknown error";
    console.error(`[order ${orderId}] VTpass call threw:`, reason);
    const tx = await contract.markFailed(orderId, String(reason).slice(0, 200));
    await tx.wait();
  } finally {
    markProcessed(orderId);
  }
}

// ---------- Start listening for onchain payments (POLLING - Monad's RPC
// doesn't support eth_newFilter, so we can't use contract.on() directly) ----------
function startListener() {
  console.log("Listening for PaymentReceived on", process.env.CONTRACT_ADDRESS, "(polling mode)");

  let lastBlock = null;
  const processedOrders = new Set();

  async function poll() {
    try {
      const currentBlock = await provider.getBlockNumber();
      if (lastBlock === null) {
        lastBlock = currentBlock;
      }
      if (currentBlock > lastBlock) {
        const filter = contract.filters.PaymentReceived();
        const events = await contract.queryFilter(filter, lastBlock + 1, currentBlock);
        for (const event of events) {
          const { orderId: orderIdBn, accountHash, serviceType, provider: providerName, productCode } = event.args;
          const orderId = orderIdBn.toString();
          if (processedOrders.has(orderId)) continue;
          processedOrders.add(orderId);
          fulfillOrder({ orderId, accountHashOnchain: accountHash, serviceType, provider: providerName, productCode }).catch(
            (e) => console.error(`[order ${orderId}] fulfillOrder crashed:`, e)
          );
        }
        lastBlock = currentBlock;
      }
    } catch (err) {
      console.error("Polling error:", err.message);
    } finally {
      setTimeout(poll, 4000);
    }
  }

  poll();
}

// ---------- HTTP API (talks to the frontend) ----------
const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

// Frontend calls this immediately after purchaseService() confirms onchain,
// passing the SAME accountId + salt it used to compute accountHash.
app.post("/api/orders", (req, res) => {
  const { orderId, accountId, salt, serviceType, provider: providerName, productCode, phone, subscriptionType } =
    req.body || {};
  if (!orderId || !accountId || !salt || !serviceType || !providerName || !productCode) {
    return res.status(400).json({
      error: "orderId, accountId, salt, serviceType, provider and productCode are all required",
    });
  }
  registerOrder(String(orderId), {
    accountId,
    salt,
    serviceType,
    provider: providerName,
    productCode,
    phone,
    subscriptionType,
  });
  res.json({ ok: true });
});

// Frontend polls this to show live status ("Pending" -> "Fulfilled"/"Failed")
app.get("/api/orders/:orderId", async (req, res) => {
  try {
    const order = await contract.getOrder(req.params.orderId);
    res.json({
      buyer: order.buyer,
      serviceType: order.serviceType,
      provider: order.provider,
      productCode: order.productCode,
      amount: order.amount.toString(),
      timestamp: order.timestamp.toString(),
      status: ["Pending", "Fulfilled", "Failed", "Refunded"][Number(order.status)],
    });
  } catch (err) {
    res.status(404).json({ error: "order not found" });
  }
});

// Live MTN data bundle prices, straight from VTpass (no stale hardcoded list)
app.get("/api/plans/data", async (_req, res) => {
  try {
    const data = await vtpass.getMtnDataVariations();
    res.json(data.content?.variations || []);
  } catch (err) {
    res.status(502).json({ error: "failed to fetch data plans" });
  }
});

// Live DSTV/GOTV bouquet prices, straight from VTpass
app.get("/api/plans/cable", async (req, res) => {
  const providerParam = String(req.query.provider || "dstv").toLowerCase();
  try {
    const data = await vtpass.getCableVariations(providerParam);
    res.json(data.content?.variations || []);
  } catch (err) {
    res.status(502).json({ error: "failed to fetch cable plans" });
  }
});

// Static list of supported electricity DISCOs (no live lookup endpoint exists for this in VTpass)
app.get("/api/discos", (_req, res) => {
  res.json(Object.keys(DISCO_SERVICE_IDS).map((code) => ({ code, verified: code === "IKEDC" })));
});

// Verify a meter or smartcard number BEFORE charging - matches VTpass's own
// recommended flow and means typos get caught before any MON leaves the wallet.
app.post("/api/verify", async (req, res) => {
  const { kind, billersCode, meterType } = req.body || {};
  try {
    if (kind === "meter") {
      const discoServiceId = DISCO_SERVICE_IDS[req.body.provider];
      const { data } = await axios.post(
        `${process.env.VTPASS_BASE_URL || "https://sandbox.vtpass.com/api"}/merchant-verify`,
        { billersCode, serviceID: discoServiceId, type: meterType },
        {
          headers: {
            "api-key": process.env.VTPASS_API_KEY,
            "secret-key": process.env.VTPASS_SECRET_KEY,
            "Content-Type": "application/json",
          },
        }
      );
      return res.json(data);
    }
    if (kind === "smartcard") {
      const { data } = await axios.post(
        `${process.env.VTPASS_BASE_URL || "https://sandbox.vtpass.com/api"}/merchant-verify`,
        { billersCode, serviceID: req.body.provider },
        {
          headers: {
            "api-key": process.env.VTPASS_API_KEY,
            "secret-key": process.env.VTPASS_SECRET_KEY,
            "Content-Type": "application/json",
          },
        }
      );
      return res.json(data);
    }
    res.status(400).json({ error: "kind must be 'meter' or 'smartcard'" });
  } catch (err) {
    res.status(502).json({ error: "verification failed", detail: err?.response?.data });
  }
});

app.listen(PORT, () => {
  console.log(`Utility Gateway backend listening on http://localhost:${PORT}`);
  startListener();
});
