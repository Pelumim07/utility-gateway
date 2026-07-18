import { ethers } from "ethers";

/**
 * Must produce byte-identical output to backend/lib/hash.js's computeAccountHash.
 * "accountId" is whatever identifier the delivery needs: a phone number
 * (airtime/data), a meter number (electricity), or a smartcard number
 * (cable TV) - never sent onchain in the clear, only its hash.
 */
export function computeAccountHash(accountId: string, salt: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(`${accountId}:${salt}`));
}

export function randomSalt(): string {
  return crypto.randomUUID();
}
