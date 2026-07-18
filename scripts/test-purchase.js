/**
 * Simulates what the frontend does, so you can verify the contract + backend
 * + VTpass integration works before touching any UI.
 *
 * Usage:
 *   1. Make sure the backend is running:  cd backend && node index.js
 *   2. In another terminal, from the project root:
 *        npx hardhat run scripts/test-purchase.js --network monadTestnet
 *
 * Tests the AIRTIME flow by default (simplest, fully confirmed against
 * VTpass docs). Edit the CASE constant below to test DATA / ELECTRICITY /
 * CABLE_TV instead - see the productCode convention in backend/index.js.
 */

const hre = require("hardhat");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

// Change this to "DATA" | "ELECTRICITY" | "CABLE_TV" to test other flows.
const CASE = "AIRTIME";

const CASES = {
  AIRTIME: {
    accountId: "08011111111", // VTpass sandbox: always succeeds
    serviceType: "AIRTIME",
    provider: "MTN",
    productCode: "100",
    monAmount: "0.001",
    phone: undefined,
  },
  ELECTRICITY: {
    accountId: "1111111111111", // VTpass sandbox: IKEDC prepaid, always succeeds
    serviceType: "ELECTRICITY",
    provider: "IKEDC",
    productCode: "PREPAID:2000",
    monAmount: "0.02",
    phone: "08011111111",
  },
  CABLE_TV: {
    accountId: "1212121212", // VTpass sandbox: always succeeds
    serviceType: "CABLE_TV",
    provider: "DSTV",
    productCode: "dstv-padi",
    monAmount: "0.0185",
    phone: "08011111111",
    subscriptionType: "change",
  },
  // DATA requires a live variation_code from GET /api/plans/data - fetch one
  // first (or just test DATA through the actual frontend instead).
};

function randomSalt() {
  return Math.random().toString(36).slice(2, 15);
}

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error("Set CONTRACT_ADDRESS in your root .env first (from the deploy step).");
  }

  const testCase = CASES[CASE];
  const [buyer] = await hre.ethers.getSigners();
  console.log(`Buying as: ${buyer.address}  (case: ${CASE})`);

  const gateway = await hre.ethers.getContractAt("UtilityGateway", contractAddress, buyer);

  const salt = randomSalt();
  const accountHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`${testCase.accountId}:${salt}`));

  console.log("Sending purchaseService tx...");
  const tx = await gateway.purchaseService(
    accountHash,
    testCase.serviceType,
    testCase.provider,
    testCase.productCode,
    { value: hre.ethers.parseEther(testCase.monAmount) }
  );
  const receipt = await tx.wait();

  const event = receipt.logs
    .map((log) => {
      try {
        return gateway.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed && parsed.name === "PaymentReceived");

  if (!event) throw new Error("PaymentReceived event not found in receipt");
  const orderId = event.args.orderId.toString();
  console.log("✅ Onchain order created. orderId =", orderId);
  console.log("Explorer:", `https://testnet.monadexplorer.com/tx/${receipt.hash}`);

  console.log("\nRegistering account details with backend...");
  const registerRes = await fetch(`${BACKEND_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId,
      accountId: testCase.accountId,
      salt,
      serviceType: testCase.serviceType,
      provider: testCase.provider,
      productCode: testCase.productCode,
      phone: testCase.phone,
      subscriptionType: testCase.subscriptionType,
    }),
  });
  if (!registerRes.ok) {
    throw new Error(`Backend register call failed: ${await registerRes.text()}`);
  }
  console.log("✅ Registered with backend.");

  console.log("\nPolling order status...");
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(`${BACKEND_URL}/api/orders/${orderId}`);
    const status = await statusRes.json();
    console.log(`  [${i + 1}] status:`, status.status);
    if (status.status === "Fulfilled" || status.status === "Failed") {
      console.log("\nFinal status:", status);
      return;
    }
  }
  console.log("\nStill pending after ~45s - check the backend logs.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
