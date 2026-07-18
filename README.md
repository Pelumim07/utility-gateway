# Utility Gateway — Pay MON, Get Real Nigerian Utilities

Built for the **BuildAnything Spark** hackathon (Monad). Pay MON onchain, get
**airtime, a data bundle, an electricity token, or a cable TV subscription**
delivered — with payment, fulfillment status, and refund logic all verifiable
onchain.

⚠️ **Note on how this was built:** this scaffold was written without live
network access (no `npm install`, no deploy, no API calls were run from this
side). Every file is internally consistent and the VTpass field names come
directly from their current docs — but you'll be the first to actually run
it. Budget time for normal first-run hiccups.

## Scope decision: no MON ↔ Naira exchange

This build does **not** include converting MON to Naira (or vice versa).
That's a deliberate cut, not an oversight:
- It's a fundamentally different problem — it needs real liquidity and a
  payout rail (a bank transfer API, etc.), not a VTU-style API call like
  everything else here.
- You're demoing on **testnet MON**, which has no real market value.
  "Exchanging" free faucet tokens for real naira doesn't mean anything -
  there's nothing genuine to demo.
- Crypto-to-fiat cash-out brushes real money-transmission territory, which
  is out of scope for a few days of solo hackathon work.
- Faking it would look exactly like the "vaporware button that doesn't
  actually do anything" pattern the hackathon's AI judge is built to catch.

What's in scope instead: **Airtime, Data, Electricity, Cable TV** — all real,
all working, all onchain. That's still a strong, complete pitch: "one
gateway that turns your MON into everyday Nigerian utility spend."

## Architecture

```
Frontend  →  UtilityGateway.sol (Monad testnet)  →  emits PaymentReceived
                                                            ↓
                backend/index.js  ←───────────────────────┘
                      ↓
                VTpass sandbox API (MTN / DISCOs / DSTV / GOTV)
                      ↓
                markFulfilled() / markFailed()  →  back onchain
```

The phone/meter/smartcard number is **never sent onchain in the clear** —
the frontend hashes it (`keccak256(accountId:salt)`) for the onchain tx, then
separately POSTs the real value + salt to the backend. The backend
recomputes the hash and checks it matches what's onchain before calling
VTpass — an integrity check even though the identifier itself stays off-chain.

## How the 4 services share one contract

The contract doesn't hardcode "airtime" - it just stores four generic
strings per order: `serviceType`, `provider`, `productCode`, plus the hashed
`accountId`. The backend decides what to do with them:

| serviceType   | provider example | productCode format              | accountId is a...      |
|---------------|-------------------|----------------------------------|-------------------------|
| `AIRTIME`     | `MTN`             | naira amount, e.g. `"200"`       | phone number             |
| `DATA`        | `MTN`             | VTpass variation_code            | phone number             |
| `ELECTRICITY` | `IKEDC` (DISCO)   | `"PREPAID:2000"` / `"POSTPAID:2000"` | meter number        |
| `CABLE_TV`    | `DSTV` / `GOTV`   | VTpass variation_code (bouquet)  | smartcard number         |

Data and Cable TV bundle prices are fetched **live** from VTpass
(`/api/plans/data`, `/api/plans/cable`) rather than hardcoded, so pricing
can't go stale.

**Electricity DISCO coverage:** `IKEDC` (Ikeja Electric) is fully confirmed
against VTpass's docs, including exact sandbox test meter numbers. The other
11 DISCOs use VTpass's standard serviceID naming pattern but weren't
individually re-verified here — **use IKEDC for your demo**, and spot-check
any other DISCO before relying on it live.

## Day 1 setup — do this in order

### 1. Get a wallet + testnet MON
Any EVM wallet (MetaMask etc.) works. Get free testnet MON:
https://faucet.monad.xyz — Monad Testnet RPC: `https://testnet-rpc.monad.xyz/`, Chain ID `10143`.

### 2. Deploy the contract
```bash
cd airtime-gateway
npm install
cp .env.example .env
# edit .env: paste your PRIVATE_KEY (with 0x prefix)
npx hardhat compile
npm run deploy:testnet
```
Copy the printed contract address.

### 3. Get VTpass sandbox keys
Sign up free at https://sandbox.vtpass.com/account → API Keys tab →
generate + copy your `api-key` and `secret-key`.

### 4. Start the backend
```bash
cd backend
npm install
cp .env.example .env
# fill in CONTRACT_ADDRESS, OPERATOR_PRIVATE_KEY, VTPASS_API_KEY, VTPASS_SECRET_KEY
node index.js
```

### 5. Run the end-to-end test
```bash
# also add CONTRACT_ADDRESS to the ROOT .env for this script
npx hardhat run scripts/test-purchase.js --network monadTestnet
```
Tests the AIRTIME flow by default (edit the `CASE` constant in the script to
try `ELECTRICITY` or `CABLE_TV` instead — sandbox test IDs are included).
Watch for `status: "Fulfilled"`.

## Day 2 — Frontend

React + TypeScript + Vite + Tailwind. Dark editorial theme, near-black
background, teal-green (`#00FFAA`) accent, with a signal-bar status tracker
as the signature element. Four tabs — Airtime / Data / Electricity / Cable
TV — swap the form fields shown (phone+amount, phone+bundle,
meter+type+amount, smartcard+bouquet), each with a "Verify" button that
checks the meter/smartcard with VTpass **before** any MON leaves the wallet.

```bash
cd frontend
npm install
cp .env.example .env
# VITE_CONTRACT_ADDRESS = same address from Day 1
# VITE_BACKEND_URL = http://localhost:4000
npm run dev
```
Opens at http://localhost:5173. Needs MetaMask installed in the browser.

**Demo pricing note:** naira→MON conversion uses a fixed demo rate
(`src/lib/pricing.ts`) since testnet MON has no real value to peg to.

## What's left before submission
- Deploy frontend + backend somewhere public (not just localhost)
- Contract verification on the Monad explorer (`docs.monad.xyz/guides/verify-smart-contract`)
- Spot-check any electricity DISCO other than IKEDC before demoing it live
- 3-min demo video (show at least 2 of the 4 services working, live), GitHub
  repo cleanup, submission form, social post

## Testing failure/refund paths
VTpass sandbox test values that simulate failure: any airtime/meter/smartcard
number other than the documented success values (see comments in
`backend/lib/vtpass.js` and `scripts/test-purchase.js`). A failed order lets
the buyer call `claimRefund()` to get their MON back - no admin needed.

## Files
```
contracts/UtilityGateway.sol    the onchain order contract (all 4 services)
scripts/deploy.js                deploys it to Monad testnet
scripts/test-purchase.js         simulates a purchase end-to-end (no UI needed)
backend/index.js                 Express API + event listener + VTpass routing
backend/lib/vtpass.js            VTpass sandbox API client (all 4 services)
backend/lib/hash.js              accountHash helper (frontend must match this exactly)
backend/lib/store.js             tiny JSON-file store for pending order details
backend/lib/requestId.js         VTpass-compliant request_id generator
frontend/src/App.tsx             wallet connect + purchase flow + status tracker
frontend/src/components/         ServiceTabs, PurchaseForm, SignalStatus, WalletButton
frontend/src/lib/                contract ABI, hashing, pricing, backend API client
```
