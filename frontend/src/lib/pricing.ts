/**
 * Testnet MON has no real market value, so there's no real exchange rate to
 * peg to. This is a fixed DEMO conversion used only so the app has a
 * consistent, sensible-looking price across airtime/data/electricity/cable.
 * A live version would replace this with a real price feed.
 */
export const DEMO_MON_PER_NGN = 0.00001; // ₦100,000 = 1 MON (demo peg)

export function nairaToMon(nairaAmount: number): string {
  return (nairaAmount * DEMO_MON_PER_NGN).toFixed(6);
}
