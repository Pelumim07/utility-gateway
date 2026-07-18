const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "pending-orders.json");

function readAll() {
  if (!fs.existsSync(DB_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeAll(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

/**
 * Register the off-chain details for an order the frontend just submitted
 * onchain. Called right after the purchaseService() tx confirms and we know
 * the real orderId.
 *
 * @param {string} orderId
 * @param {object} details
 * @param {string} details.accountId    phone / meter number / smartcard number
 * @param {string} details.salt
 * @param {string} details.serviceType  "AIRTIME" | "DATA" | "ELECTRICITY" | "CABLE_TV"
 * @param {string} details.provider     "MTN" | "IKEDC" | "DSTV" | ...
 * @param {string} details.productCode
 * @param {string} [details.phone]      contact phone, required by VTpass even for
 *                                      electricity/cable purchases (billing contact)
 */
function registerOrder(orderId, details) {
  const all = readAll();
  all[orderId] = { ...details, registeredAt: new Date().toISOString() };
  writeAll(all);
}

function getOrderMeta(orderId) {
  const all = readAll();
  return all[orderId] || null;
}

function markProcessed(orderId) {
  const all = readAll();
  if (all[orderId]) {
    all[orderId].processedAt = new Date().toISOString();
    writeAll(all);
  }
}

module.exports = { registerOrder, getOrderMeta, markProcessed };
