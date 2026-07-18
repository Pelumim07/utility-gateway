import React from "react";

export type PipelineStep = 0 | 1 | 2 | 3 | 4;
// 0 idle · 1 wallet connected · 2 payment sent · 3 confirmed onchain · 4 delivered

const LABELS = ["Connect", "Pay", "Onchain", "Delivered"];
const BAR_HEIGHTS = ["h-3", "h-5", "h-7", "h-9"]; // ascending, like a signal icon

interface Props {
  step: PipelineStep;
  failed?: boolean;
}

export default function SignalStatus({ step, failed = false }: Props) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-end gap-1.5" aria-hidden="true">
        {BAR_HEIGHTS.map((h, i) => {
          const barIndex = i + 1;
          const isFilled = step >= barIndex;
          const isCurrent = step === barIndex - 1 || (step === barIndex && step < 4);
          return (
            <div
              key={i}
              className={[
                "w-2.5 rounded-sm transition-colors duration-500",
                h,
                failed && isFilled
                  ? "bg-danger"
                  : isFilled
                    ? "bg-accent"
                    : "bg-surface-raised border border-border",
                isCurrent && !failed && step < 4 ? "animate-pulse" : "",
              ].join(" ")}
            />
          );
        })}
      </div>
      <div className="font-mono text-xs tracking-wider text-text-secondary uppercase">
        {failed ? (
          <span className="text-danger">Delivery failed — refund available</span>
        ) : step === 4 ? (
          <span className="text-accent">Delivered</span>
        ) : (
          <span>{LABELS[step] ?? LABELS[0]}...</span>
        )}
      </div>
    </div>
  );
}
