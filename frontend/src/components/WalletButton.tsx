import React from "react";
import { shortenAddress } from "../lib/wallet";

interface Props {
  address: string | null;
  connecting: boolean;
  onConnect: () => void;
}

export default function WalletButton({ address, connecting, onConnect }: Props) {
  if (address) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 font-mono text-sm text-text-primary">
        <span className="h-2 w-2 rounded-full bg-accent" />
        {shortenAddress(address)}
      </div>
    );
  }

  return (
    <button
      onClick={onConnect}
      disabled={connecting}
      className="rounded-full bg-accent px-5 py-2 font-display text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {connecting ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}
