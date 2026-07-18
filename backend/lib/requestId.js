/**
 * VTpass requires every purchase to carry a unique `request_id` that:
 *  - is 12+ characters
 *  - starts with today's date + hour + minute, in Africa/Lagos time (GMT+1)
 *    formatted as YYYYMMDDHHII
 *  - can have any alphanumeric suffix appended
 *
 * Docs: https://vtpass.com/documentation/how-to-generate-request-id/
 */

function pad(n) {
  return String(n).padStart(2, "0");
}

/**
 * @param {number} [orderId] optional onchain orderId to make the suffix
 *        traceable back to a specific order
 * @returns {string} a VTpass-compliant request_id
 */
function generateRequestId(orderId) {
  // Africa/Lagos is a fixed UTC+1 offset with no DST, so this is safe
  // to compute directly instead of depending on a timezone library.
  const now = new Date(Date.now() + 60 * 60 * 1000); // shift UTC -> Lagos (+1h)

  const datePart =
    now.getUTCFullYear().toString() +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes());

  const randomSuffix = Math.random().toString(36).slice(2, 10);
  const orderSuffix = orderId !== undefined ? `o${orderId}` : "";

  return `${datePart}${orderSuffix}${randomSuffix}`;
}

module.exports = { generateRequestId };
