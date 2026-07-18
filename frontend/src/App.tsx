import React, { useCallback, useState } from "react";
import { ethers } from "ethers";
import WalletButton from "./components/WalletButton";
import ServiceTabs from "./components/ServiceTabs";
import PurchaseForm, { PurchasePayload } from "./components/PurchaseForm";
import SignalStatus, { PipelineStep } from "./components/SignalStatus";
import { connectWallet } from "./lib/wallet";
import { computeAccountHash, randomSalt } from "./lib/hash";
import { registerOrder, fetchOrder } from "./lib/api";
import { UTILITY_GATEWAY_ABI, CONTRACT_ADDRESS, ServiceType } from "./lib/contract";

type Phase = "idle" | "in_progress" | "done";

export default function App() {
  const [service, setService] = useState<ServiceType>("AIRTIME");

  const [address, setAddress] = useState<string | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [connecting, setConnecting] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState<PipelineStep>(0);
  const [failed, setFailed] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const conn = await connectWallet();
      setAddress(conn.address);
      setSigner(conn.signer);
      setStep((s) => (s < 1 ? 1 : s));
    } catch (err: any) {
      setError(err.message || "Could not connect wallet");
    } finally {
      setConnecting(false);
    }
  }, []);

  const pollOrder = useCallback(async (id: string) => {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const order = await fetchOrder(id);
        if (order.status === "Fulfilled") {
          setStep(4);
          setPhase("done");
          return;
        }
        if (order.status === "Failed") {
          setFailed(true);
          setPhase("done");
          return;
        }
      } catch {
        // order not indexed yet on backend side - keep polling
      }
    }
    setError("Still pending after a while - check the backend logs.");
  }, []);

  const handlePurchase = useCallback(
    async (payload: PurchasePayload) => {
      setError(null);
      setFailed(false);
      setSummary(payload.summary);
      setPhase("in_progress");

      try {
        let activeSigner = signer;

        if (!activeSigner) {
          const conn = await connectWallet();
          setAddress(conn.address);
          setSigner(conn.signer);
          activeSigner = conn.signer;
        }
        setStep(1);

        if (!CONTRACT_ADDRESS) {
          throw new Error("VITE_CONTRACT_ADDRESS is not set - check your .env file.");
        }

        const contract = new ethers.Contract(CONTRACT_ADDRESS, UTILITY_GATEWAY_ABI, activeSigner);

        const salt = randomSalt();
        const accountHash = computeAccountHash(payload.accountId, salt);

        const tx = await contract.purchaseService(
          accountHash,
          payload.serviceType,
          payload.provider,
          payload.productCode,
          { value: ethers.parseEther(payload.monAmount) }
        );
        setStep(2);

        const receipt = await tx.wait();
        setTxHash(receipt.hash);

        const parsedLog = receipt.logs
          .map((log: any) => {
            try {
              return contract.interface.parseLog(log);
            } catch {
              return null;
            }
          })
          .find((p: any) => p && p.name === "PaymentReceived");

        if (!parsedLog) throw new Error("PaymentReceived event not found in receipt");
        const newOrderId = parsedLog.args.orderId.toString();
        setOrderId(newOrderId);
        setStep(3);

        await registerOrder({
          orderId: newOrderId,
          accountId: payload.accountId,
          salt,
          serviceType: payload.serviceType,
          provider: payload.provider,
          productCode: payload.productCode,
          phone: payload.phone,
          subscriptionType: payload.subscriptionType,
        });

        await pollOrder(newOrderId);
      } catch (err: any) {
        setError(err.shortMessage || err.message || "Something went wrong");
        setPhase("idle");
        setStep(address ? 1 : 0);
      }
    },
    [signer, address, pollOrder]
  );

  const handleReset = () => {
    setPhase("idle");
    setStep(address ? 1 : 0);
    setFailed(false);
    setOrderId(null);
    setTxHash(null);
    setSummary(null);
    setError(null);
  };

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-10">
      <header className="flex w-full max-w-md items-center justify-between">
        <span className="font-mono text-xs tracking-wider text-text-secondary">$ pay --with mon</span>
        <WalletButton address={address} connecting={connecting} onConnect={handleConnect} />
      </header>

      <main className="mt-10 flex w-full max-w-md flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="font-display text-3xl font-semibold text-text-primary sm:text-4xl">
            Pay MON.
            <br />
            Get real utility.
          </h1>
          <p className="mt-3 font-body text-sm text-text-secondary">
            Airtime, data, electricity, cable TV - onchain, delivered in seconds.
          </p>
        </div>

        {phase === "idle" && (
          <ServiceTabs active={service} disabled={connecting} onChange={setService} />
        )}

        <div className="w-full rounded-2xl border border-border bg-surface p-6 shadow-2xl shadow-black/40">
          {phase === "idle" && (
            <PurchaseForm service={service} disabled={connecting} onSubmit={handlePurchase} />
          )}

          {phase !== "idle" && (
            <div className="flex flex-col items-center gap-6 py-4">
              <SignalStatus step={step} failed={failed} />

              {summary && (
                <p className="text-center font-body text-sm text-text-secondary">{summary}</p>
              )}

              {orderId && (
                <div className="w-full rounded-lg border border-border bg-bg px-4 py-3 font-mono text-xs text-text-secondary">
                  <div className="flex justify-between">
                    <span>Order</span>
                    <span className="text-text-primary">#{orderId}</span>
                  </div>
                  {txHash && (
                    <a
                      href={`https://testnet.monadexplorer.com/tx/${txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block truncate text-accent hover:underline"
                    >
                      View transaction ↗
                    </a>
                  )}
                </div>
              )}

              {phase === "done" && (
                <button
                  onClick={handleReset}
                  className="rounded-lg border border-border px-5 py-2 font-body text-sm text-text-primary hover:border-accent"
                >
                  {failed ? "Try another order" : "Make another purchase"}
                </button>
              )}
            </div>
          )}

          {error && (
            <p className="mt-4 font-mono text-xs text-danger" role="alert">
              {error}
            </p>
          )}
        </div>

        {CONTRACT_ADDRESS && (
          <p className="font-mono text-[11px] text-text-secondary">
            Contract:{" "}
            <a
              href={`https://testnet.monadexplorer.com/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {CONTRACT_ADDRESS}
            </a>
          </p>
        )}
      </main>
    </div>
  );
}
