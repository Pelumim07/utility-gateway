const { ethers } = require("ethers");

/**
 * Must produce byte-identical output to frontend/src/lib/hash.ts's
 * computeAccountHash. "accountId" is whatever identifier the delivery needs:
 * a phone number (airtime/data), a meter number (electricity), or a
 * smartcard number (cable TV) - never sent onchain in the clear, only its hash.
 *
 * @param {string} accountId
 * @param {string} salt a random string generated client-side per order
 * @returns {string} bytes32 hash, e.g. "0xabc123..."
 */
function computeAccountHash(accountId, salt) {
  return ethers.keccak256(ethers.toUtf8Bytes(`${accountId}:${salt}`));
}

module.exports = { computeAccountHash };
