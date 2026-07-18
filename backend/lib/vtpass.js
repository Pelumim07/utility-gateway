const axios = require("axios");
const { generateRequestId } = require("./requestId");

const BASE_URL = process.env.VTPASS_BASE_URL || "https://sandbox.vtpass.com/api";

function postHeaders() {
  return {
    "api-key": process.env.VTPASS_API_KEY,
    "secret-key": process.env.VTPASS_SECRET_KEY,
    "Content-Type": "application/json",
  };
}

function getHeaders() {
  return {
    "api-key": process.env.VTPASS_API_KEY,
    "public-key": process.env.VTPASS_PUBLIC_KEY,
  };
}

/**
 * Buy MTN airtime.
 * VTpass sandbox test numbers (see docs):
 *   08011111111        -> always succeeds
 *   any other number    -> simulates a failure (useful for testing markFailed)
 *
 * @param {object} params
 * @param {string} params.phone      Nigerian phone number, e.g. "08011111111"
 * @param {number} params.amountNgn  Naira amount to top up
 * @param {number} [params.orderId]  onchain orderId, folded into request_id for traceability
 */
async function buyMtnAirtime({ phone, amountNgn, orderId }) {
  const request_id = generateRequestId(orderId);

  const { data } = await axios.post(
    `${BASE_URL}/pay`,
    {
      request_id,
      serviceID: "mtn",
      amount: amountNgn,
      phone,
    },
    { headers: postHeaders() }
  );

  return { request_id, response: data };
}

/**
 * Buy an MTN data bundle.
 * @param {object} params
 * @param {string} params.phone          Nigerian phone number
 * @param {string} params.variationCode  e.g. "mtn-100mb-1000" (see VTpass service-variations for mtn-data)
 * @param {number} [params.orderId]
 */
async function buyMtnData({ phone, variationCode, orderId }) {
  const request_id = generateRequestId(orderId);

  const { data } = await axios.post(
    `${BASE_URL}/pay`,
    {
      request_id,
      serviceID: "mtn-data",
      billersCode: phone,
      variation_code: variationCode,
      phone,
    },
    { headers: postHeaders() }
  );

  return { request_id, response: data };
}

/**
 * Pay an electricity bill / vend a prepaid token.
 * VTpass sandbox test meter numbers (see docs):
 *   1111111111111  -> prepaid, always succeeds
 *   1010101010101  -> postpaid, always succeeds
 *   any other number -> simulates failure
 *
 * @param {object} params
 * @param {string} params.discoServiceId  e.g. "ikeja-electric", "eko-electric", "abuja-electric"
 * @param {string} params.meterNumber
 * @param {"prepaid"|"postpaid"} params.meterType
 * @param {number} params.amountNgn
 * @param {string} params.phone
 * @param {number} [params.orderId]
 */
async function buyElectricity({ discoServiceId, meterNumber, meterType, amountNgn, phone, orderId }) {
  const request_id = generateRequestId(orderId);

  const { data } = await axios.post(
    `${BASE_URL}/pay`,
    {
      request_id,
      serviceID: discoServiceId,
      billersCode: meterNumber,
      variation_code: meterType,
      amount: amountNgn,
      phone,
    },
    { headers: postHeaders() }
  );

  return { request_id, response: data };
}

/**
 * Pay a cable TV subscription (DSTV / GOTV / Startimes).
 * VTpass sandbox test smartcard number: 1212121212 -> always succeeds.
 *
 * @param {object} params
 * @param {string} params.cableServiceId  e.g. "dstv", "gotv"
 * @param {string} params.smartcardNumber
 * @param {string} params.variationCode   bouquet code, e.g. "dstv-padi"
 * @param {number} [params.amountNgn]     optional - omit to use the bouquet's list price
 * @param {string} params.phone
 * @param {"change"|"renew"} [params.subscriptionType]
 * @param {number} [params.orderId]
 */
async function buyCableTv({
  cableServiceId,
  smartcardNumber,
  variationCode,
  amountNgn,
  phone,
  subscriptionType = "change",
  orderId,
}) {
  const request_id = generateRequestId(orderId);

  const payload = {
    request_id,
    serviceID: cableServiceId,
    billersCode: smartcardNumber,
    variation_code: variationCode,
    phone,
    subscription_type: subscriptionType,
  };
  if (amountNgn) payload.amount = amountNgn;

  const { data } = await axios.post(`${BASE_URL}/pay`, payload, { headers: postHeaders() });
  return { request_id, response: data };
}

/** Fetch available bouquet variation codes + prices for a cable provider ("dstv" | "gotv"). */
async function getCableVariations(cableServiceId) {
  const { data } = await axios.get(
    `${BASE_URL}/service-variations?serviceID=${cableServiceId}`,
    { headers: getHeaders() }
  );
  return data;
}

/** Fetch available MTN data bundle variation codes + prices. */
async function getMtnDataVariations() {
  const { data } = await axios.get(
    `${BASE_URL}/service-variations?serviceID=mtn-data`,
    { headers: getHeaders() }
  );
  return data;
}

/** Re-check a transaction's status by its request_id. Useful if the first call times out. */
async function requeryTransaction(request_id) {
  const { data } = await axios.post(
    `${BASE_URL}/requery`,
    { request_id },
    { headers: postHeaders() }
  );
  return data;
}

/**
 * VTpass responses use `code: "000"` + `content.transactions.status: "delivered"`
 * for a confirmed success. Anything else should be treated as failed/pending.
 */
function isDelivered(vtpassResponse) {
  return (
    vtpassResponse?.code === "000" &&
    vtpassResponse?.content?.transactions?.status === "delivered"
  );
}

module.exports = {
  buyMtnAirtime,
  buyMtnData,
  buyElectricity,
  buyCableTv,
  getMtnDataVariations,
  getCableVariations,
  requeryTransaction,
  isDelivered,
};
