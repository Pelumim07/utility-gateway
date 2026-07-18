// Minimal human-readable ABI - only what the frontend actually calls.
// Must stay in sync with contracts/UtilityGateway.sol.
export const UTILITY_GATEWAY_ABI = [
  "function purchaseService(bytes32 accountHash, string serviceType, string provider, string productCode) external payable returns (uint256 orderId)",
  "function claimRefund(uint256 orderId) external",
  "function getOrder(uint256 orderId) external view returns (tuple(address buyer, bytes32 accountHash, string serviceType, string provider, string productCode, uint256 amount, uint256 timestamp, uint8 status))",
  "event PaymentReceived(uint256 indexed orderId, address indexed buyer, bytes32 accountHash, string serviceType, string provider, string productCode, uint256 amount, uint256 timestamp)",
] as const;

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS as string;
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string;
export const MONAD_RPC = import.meta.env.VITE_MONAD_RPC as string;
export const MONAD_CHAIN_ID = Number(import.meta.env.VITE_MONAD_CHAIN_ID || 10143);

export const ORDER_STATUS = ["Pending", "Fulfilled", "Failed", "Refunded"] as const;

export type ServiceType = "AIRTIME" | "DATA" | "ELECTRICITY" | "CABLE_TV";
