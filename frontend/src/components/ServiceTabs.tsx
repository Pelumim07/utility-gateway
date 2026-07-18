import React from "react";
import { ServiceType } from "../lib/contract";

const SERVICES: { key: ServiceType; label: string }[] = [
  { key: "AIRTIME", label: "Airtime" },
  { key: "DATA", label: "Data" },
  { key: "ELECTRICITY", label: "Electricity" },
  { key: "CABLE_TV", label: "Cable TV" },
];

interface Props {
  active: ServiceType;
  disabled: boolean;
  onChange: (service: ServiceType) => void;
}

export default function ServiceTabs({ active, disabled, onChange }: Props) {
  return (
    <div className="grid grid-cols-4 gap-1 rounded-xl border border-border bg-bg p-1">
      {SERVICES.map((s) => (
        <button
          key={s.key}
          type="button"
          disabled={disabled}
          onClick={() => onChange(s.key)}
          className={[
            "rounded-lg py-2 text-center font-body text-xs font-medium transition-colors disabled:opacity-50",
            active === s.key
              ? "bg-accent text-bg"
              : "text-text-secondary hover:text-text-primary",
          ].join(" ")}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
