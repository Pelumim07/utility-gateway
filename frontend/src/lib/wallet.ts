import { ethers } from "ethers";
import { MONAD_CHAIN_ID, MONAD_RPC } from "./contract";

declare global {
  interface Window {
    ethereum?: any;
  }
}

export function hasWallet(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

const MONAD_CHAIN_ID_HEX = "0x" + MONAD_CHAIN_ID.toString(16);

/** Adds/switches MetaMask to Monad Testnet if it isn't already there. */
async function ensureMonadTestnet() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: MONAD_CHAIN_ID_HEX }],
    });
  } catch (switchError: any) {
    // 4902 = chain not added to MetaMask yet
    if (switchError.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: MONAD_CHAIN_ID_HEX,
            chainName: "Monad Testnet",
            nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
            rpcUrls: [MONAD_RPC],
            blockExplorerUrls: ["https://testnet.monadexplorer.com"],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}

export async function connectWallet(): Promise<{
  provider: ethers.BrowserProvider;
  signer: ethers.Signer;
  address: string;
}> {
  if (!hasWallet()) {
    throw new Error("No wallet found. Install MetaMask to continue.");
  }

  await window.ethereum.request({ method: "eth_requestAccounts" });
  await ensureMonadTestnet();

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  return { provider, signer, address };
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
