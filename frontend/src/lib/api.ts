import { BACKEND_URL, ORDER_STATUS, ServiceType } from "./contract";

export type OrderStatus = (typeof ORDER_STATUS)[number];

export interface OrderView {
  buyer: string;
  serviceType: string;
  provider: string;
  productCode: string;
  amount: string;
  timestamp: string;
  status: OrderStatus;
}

export interface RegisterOrderParams {
  orderId: string;
  accountId: string; // phone / meter number / smartcard number
  salt: string;
  serviceType: ServiceType;
  provider: string;
  productCode: string;
  phone?: string; // contact phone, required by VTpass even for electricity/cable
  subscriptionType?: "change" | "renew";
}

export async function registerOrder(params: RegisterOrderParams): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to register order with backend: ${body}`);
  }
}

export async function fetchOrder(orderId: string): Promise<OrderView> {
  const res = await fetch(`${BACKEND_URL}/api/orders/${orderId}`);
  if (!res.ok) throw new Error("Order not found");
  return res.json();
}

export interface Plan {
  variation_code: string;
  name: string;
  variation_amount: string;
  fixedPrice: string;
}

export async function fetchDataPlans(): Promise<Plan[]> {
  const res = await fetch(`${BACKEND_URL}/api/plans/data`);
  if (!res.ok) throw new Error("Failed to load data plans");
  return res.json();
}

export async function fetchCablePlans(provider: "dstv" | "gotv"): Promise<Plan[]> {
  const res = await fetch(`${BACKEND_URL}/api/plans/cable?provider=${provider}`);
  if (!res.ok) throw new Error("Failed to load cable plans");
  return res.json();
}

export interface Disco {
  code: string;
  verified: boolean;
}

export async function fetchDiscos(): Promise<Disco[]> {
  const res = await fetch(`${BACKEND_URL}/api/discos`);
  if (!res.ok) throw new Error("Failed to load DISCO list");
  return res.json();
}

export async function verifyMeter(
  provider: string,
  billersCode: string,
  meterType: "prepaid" | "postpaid"
): Promise<any> {
  const res = await fetch(`${BACKEND_URL}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "meter", provider, billersCode, meterType }),
  });
  if (!res.ok) throw new Error("Meter verification failed");
  return res.json();
}

export async function verifySmartcard(provider: string, billersCode: string): Promise<any> {
  const res = await fetch(`${BACKEND_URL}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "smartcard", provider, billersCode }),
  });
  if (!res.ok) throw new Error("Smartcard verification failed");
  return res.json();
}
