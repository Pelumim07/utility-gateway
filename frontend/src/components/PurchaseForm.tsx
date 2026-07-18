import React, { useEffect, useState } from "react";
import { ServiceType } from "../lib/contract";
import { nairaToMon } from "../lib/pricing";
import {
  Plan,
  Disco,
  fetchDataPlans,
  fetchCablePlans,
  fetchDiscos,
  verifyMeter,
  verifySmartcard,
} from "../lib/api";

export interface PurchasePayload {
  accountId: string;
  serviceType: ServiceType;
  provider: string;
  productCode: string;
  phone?: string;
  subscriptionType?: "change" | "renew";
  nairaAmount: number;
  monAmount: string;
  summary: string; // human-readable line for the status card
}

const PHONE_PATTERN = /^0\d{10}$/;
const AIRTIME_PRESETS = [100, 200, 500, 1000];

function fieldLabel(text: string) {
  return <label className="font-mono text-xs uppercase tracking-wider text-text-secondary">{text}</label>;
}

function textInputClass() {
  return "w-full rounded-lg border border-border bg-surface px-4 py-3 font-mono text-base text-text-primary outline-none placeholder:text-text-secondary/50 focus:border-accent disabled:opacity-50";
}

interface Props {
  service: ServiceType;
  disabled: boolean;
  onSubmit: (payload: PurchasePayload) => void;
}

export default function PurchaseForm({ service, disabled, onSubmit }: Props) {
  // Shared
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);

  // Airtime
  const [airtimeAmount, setAirtimeAmount] = useState(AIRTIME_PRESETS[0]);

  // Data
  const [dataPlans, setDataPlans] = useState<Plan[]>([]);
  const [selectedDataPlan, setSelectedDataPlan] = useState<Plan | null>(null);
  const [dataPlansError, setDataPlansError] = useState<string | null>(null);

  // Electricity
  const [discos, setDiscos] = useState<Disco[]>([{ code: "IKEDC", verified: true }]);
  const [disco, setDisco] = useState("IKEDC");
  const [meterNumber, setMeterNumber] = useState("");
  const [meterType, setMeterType] = useState<"prepaid" | "postpaid">("prepaid");
  const [electricityAmount, setElectricityAmount] = useState(2000);
  const [meterVerify, setMeterVerify] = useState<{ name?: string; error?: string } | null>(null);
  const [verifyingMeter, setVerifyingMeter] = useState(false);

  // Cable TV
  const [cableProvider, setCableProvider] = useState<"DSTV" | "GOTV">("DSTV");
  const [cablePlans, setCablePlans] = useState<Plan[]>([]);
  const [selectedCablePlan, setSelectedCablePlan] = useState<Plan | null>(null);
  const [smartcardNumber, setSmartcardNumber] = useState("");
  const [smartcardVerify, setSmartcardVerify] = useState<{ name?: string; error?: string } | null>(null);
  const [verifyingSmartcard, setVerifyingSmartcard] = useState(false);
  const [cablePlansError, setCablePlansError] = useState<string | null>(null);

  useEffect(() => {
    setTouched(false);
    if (service === "DATA" && dataPlans.length === 0) {
      fetchDataPlans()
        .then((plans) => {
          setDataPlans(plans);
          setSelectedDataPlan(plans[0] ?? null);
        })
        .catch(() => setDataPlansError("Could not load live data plans - check the backend is running."));
    }
    if (service === "ELECTRICITY" && discos.length <= 1) {
      fetchDiscos()
        .then(setDiscos)
        .catch(() => {
          /* fall back to the default IKEDC-only list already in state */
        });
    }
    if (service === "CABLE_TV") {
      setCablePlansError(null);
      fetchCablePlans(cableProvider.toLowerCase() as "dstv" | "gotv")
        .then((plans) => {
          setCablePlans(plans);
          setSelectedCablePlan(plans[0] ?? null);
        })
        .catch(() => setCablePlansError("Could not load live bouquets - check the backend is running."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, cableProvider]);

  const phoneValid = PHONE_PATTERN.test(phone);

  function handleVerifyMeter() {
    setVerifyingMeter(true);
    setMeterVerify(null);
    verifyMeter(disco, meterNumber, meterType)
      .then((res) => {
        if (res?.code === "000") {
          setMeterVerify({ name: res.content?.Customer_Name || "Verified" });
        } else {
          setMeterVerify({ error: "Could not verify this meter number" });
        }
      })
      .catch(() => setMeterVerify({ error: "Verification request failed" }))
      .finally(() => setVerifyingMeter(false));
  }

  function handleVerifySmartcard() {
    setVerifyingSmartcard(true);
    setSmartcardVerify(null);
    verifySmartcard(cableProvider.toLowerCase(), smartcardNumber)
      .then((res) => {
        if (res?.code === "000") {
          setSmartcardVerify({ name: res.content?.Customer_Name || "Verified" });
        } else {
          setSmartcardVerify({ error: "Could not verify this smartcard number" });
        }
      })
      .catch(() => setSmartcardVerify({ error: "Verification request failed" }))
      .finally(() => setVerifyingSmartcard(false));
  }

  function buildPayload(): PurchasePayload | null {
    if (service === "AIRTIME") {
      if (!phoneValid) return null;
      return {
        accountId: phone,
        serviceType: "AIRTIME",
        provider: "MTN",
        productCode: String(airtimeAmount),
        nairaAmount: airtimeAmount,
        monAmount: nairaToMon(airtimeAmount),
        summary: `₦${airtimeAmount} MTN airtime to ${phone}`,
      };
    }

    if (service === "DATA") {
      if (!phoneValid || !selectedDataPlan) return null;
      const naira = Number(selectedDataPlan.variation_amount);
      return {
        accountId: phone,
        serviceType: "DATA",
        provider: "MTN",
        productCode: selectedDataPlan.variation_code,
        nairaAmount: naira,
        monAmount: nairaToMon(naira),
        summary: `${selectedDataPlan.name} to ${phone}`,
      };
    }

    if (service === "ELECTRICITY") {
      if (!meterNumber || !phoneValid || electricityAmount <= 0) return null;
      return {
        accountId: meterNumber,
        serviceType: "ELECTRICITY",
        provider: disco,
        productCode: `${meterType.toUpperCase()}:${electricityAmount}`,
        phone,
        nairaAmount: electricityAmount,
        monAmount: nairaToMon(electricityAmount),
        summary: `₦${electricityAmount} ${disco} (${meterType}) - meter ${meterNumber}`,
      };
    }

    if (service === "CABLE_TV") {
      if (!smartcardNumber || !phoneValid || !selectedCablePlan) return null;
      const naira = Number(selectedCablePlan.variation_amount);
      return {
        accountId: smartcardNumber,
        serviceType: "CABLE_TV",
        provider: cableProvider,
        productCode: selectedCablePlan.variation_code,
        phone,
        subscriptionType: "change",
        nairaAmount: naira,
        monAmount: nairaToMon(naira),
        summary: `${selectedCablePlan.name} - ${cableProvider} card ${smartcardNumber}`,
      };
    }

    return null;
  }

  const payload = buildPayload();

  return (
    <form
      className="flex w-full flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (payload) onSubmit(payload);
      }}
    >
      {/* Contact / delivery phone - used by every service type */}
      <div className="flex flex-col gap-2">
        {fieldLabel(service === "AIRTIME" || service === "DATA" ? "Phone number" : "Contact phone")}
        <input
          type="tel"
          inputMode="numeric"
          placeholder="080XXXXXXXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value.trim())}
          disabled={disabled}
          className={textInputClass()}
        />
        {touched && !phoneValid && (
          <span className="font-mono text-xs text-danger">Enter an 11-digit number starting with 0</span>
        )}
      </div>

      {service === "AIRTIME" && (
        <div className="flex flex-col gap-2">
          {fieldLabel("Amount")}
          <div className="grid grid-cols-4 gap-2">
            {AIRTIME_PRESETS.map((amt) => (
              <button
                type="button"
                key={amt}
                disabled={disabled}
                onClick={() => setAirtimeAmount(amt)}
                className={[
                  "rounded-lg border px-2 py-3 font-display text-sm font-semibold transition-colors disabled:opacity-50",
                  airtimeAmount === amt
                    ? "border-accent bg-surface-raised text-text-primary"
                    : "border-border bg-surface text-text-secondary hover:border-text-secondary",
                ].join(" ")}
              >
                ₦{amt}
              </button>
            ))}
          </div>
        </div>
      )}

      {service === "DATA" && (
        <div className="flex flex-col gap-2">
          {fieldLabel("Data bundle (live MTN pricing)")}
          {dataPlansError && <span className="font-mono text-xs text-danger">{dataPlansError}</span>}
          <select
            disabled={disabled || dataPlans.length === 0}
            value={selectedDataPlan?.variation_code || ""}
            onChange={(e) =>
              setSelectedDataPlan(dataPlans.find((p) => p.variation_code === e.target.value) || null)
            }
            className={textInputClass()}
          >
            {dataPlans.length === 0 && <option>Loading plans...</option>}
            {dataPlans.map((p) => (
              <option key={p.variation_code} value={p.variation_code}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {service === "ELECTRICITY" && (
        <>
          <div className="flex flex-col gap-2">
            {fieldLabel("Distribution company")}
            <select
              disabled={disabled}
              value={disco}
              onChange={(e) => setDisco(e.target.value)}
              className={textInputClass()}
            >
              {discos.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code}
                  {!d.verified ? " (verify before demo)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            {fieldLabel("Meter number")}
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 1111111111111"
                value={meterNumber}
                onChange={(e) => {
                  setMeterNumber(e.target.value.trim());
                  setMeterVerify(null);
                }}
                disabled={disabled}
                className={textInputClass()}
              />
              <button
                type="button"
                disabled={disabled || !meterNumber || verifyingMeter}
                onClick={handleVerifyMeter}
                className="shrink-0 rounded-lg border border-border px-4 font-body text-sm text-text-primary hover:border-accent disabled:opacity-50"
              >
                {verifyingMeter ? "..." : "Verify"}
              </button>
            </div>
            {meterVerify?.name && (
              <span className="font-mono text-xs text-accent">✓ {meterVerify.name}</span>
            )}
            {meterVerify?.error && <span className="font-mono text-xs text-danger">{meterVerify.error}</span>}
          </div>

          <div className="flex flex-col gap-2">
            {fieldLabel("Meter type")}
            <div className="grid grid-cols-2 gap-2">
              {(["prepaid", "postpaid"] as const).map((t) => (
                <button
                  type="button"
                  key={t}
                  disabled={disabled}
                  onClick={() => setMeterType(t)}
                  className={[
                    "rounded-lg border py-2 font-body text-sm capitalize transition-colors disabled:opacity-50",
                    meterType === t
                      ? "border-accent bg-surface-raised text-text-primary"
                      : "border-border bg-surface text-text-secondary",
                  ].join(" ")}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {fieldLabel("Amount (₦)")}
            <input
              type="number"
              min={500}
              step={100}
              value={electricityAmount}
              onChange={(e) => setElectricityAmount(Number(e.target.value))}
              disabled={disabled}
              className={textInputClass()}
            />
          </div>
        </>
      )}

      {service === "CABLE_TV" && (
        <>
          <div className="flex flex-col gap-2">
            {fieldLabel("Provider")}
            <div className="grid grid-cols-2 gap-2">
              {(["DSTV", "GOTV"] as const).map((p) => (
                <button
                  type="button"
                  key={p}
                  disabled={disabled}
                  onClick={() => setCableProvider(p)}
                  className={[
                    "rounded-lg border py-2 font-body text-sm transition-colors disabled:opacity-50",
                    cableProvider === p
                      ? "border-accent bg-surface-raised text-text-primary"
                      : "border-border bg-surface text-text-secondary",
                  ].join(" ")}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {fieldLabel("Smartcard number")}
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 1212121212"
                value={smartcardNumber}
                onChange={(e) => {
                  setSmartcardNumber(e.target.value.trim());
                  setSmartcardVerify(null);
                }}
                disabled={disabled}
                className={textInputClass()}
              />
              <button
                type="button"
                disabled={disabled || !smartcardNumber || verifyingSmartcard}
                onClick={handleVerifySmartcard}
                className="shrink-0 rounded-lg border border-border px-4 font-body text-sm text-text-primary hover:border-accent disabled:opacity-50"
              >
                {verifyingSmartcard ? "..." : "Verify"}
              </button>
            </div>
            {smartcardVerify?.name && (
              <span className="font-mono text-xs text-accent">✓ {smartcardVerify.name}</span>
            )}
            {smartcardVerify?.error && (
              <span className="font-mono text-xs text-danger">{smartcardVerify.error}</span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {fieldLabel("Bouquet (live pricing)")}
            {cablePlansError && <span className="font-mono text-xs text-danger">{cablePlansError}</span>}
            <select
              disabled={disabled || cablePlans.length === 0}
              value={selectedCablePlan?.variation_code || ""}
              onChange={(e) =>
                setSelectedCablePlan(cablePlans.find((p) => p.variation_code === e.target.value) || null)
              }
              className={textInputClass()}
            >
              {cablePlans.length === 0 && <option>Loading bouquets...</option>}
              {cablePlans.map((p) => (
                <option key={p.variation_code} value={p.variation_code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={disabled || !payload}
        className="rounded-lg bg-accent py-4 font-display text-base font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {disabled ? "Processing..." : payload ? `Pay ${payload.monAmount} MON` : "Fill in the details above"}
      </button>
    </form>
  );
}
