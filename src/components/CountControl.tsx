"use client";

import { COUNT_MAX, formatMinutes, stepOf, type CompletionMode } from "@/lib/recur";
import type { PlainNode } from "@/lib/crypto";
import { useHoldConfirm } from "./useHoldConfirm";

// The count/checkbox widget shared by tree rows and the today view. Storage is
// always counts; check vs tally vs time is rendering only.
//
// Recurring rows (habits — meta.recur) log through the shared press-and-hold
// gesture (useHoldConfirm), the same deliberate friction as battles: on touch
// a plain tap does nothing and a ~500ms hold commits, mouse clicks stay
// instant. Checkbox habits need the hold in both directions (nothing on a
// habit is accidental); taking progress back via − is always a plain tap.
// Plain one-off tasks keep instant taps everywhere.

export function CountControl({
  mode,
  count,
  threshold,
  checked,
  meta,
  onToggle,
  onCountUp,
  onCountDown,
}: {
  mode: CompletionMode;
  count: number;
  threshold: number;
  checked: boolean;
  meta: PlainNode["metadata"];
  onToggle: () => void;
  onCountUp: () => void;
  onCountDown: () => void;
}) {
  const holdNeeded = !!meta.recur;
  const upHold = useHoldConfirm(onCountUp);
  const toggleHold = useHoldConfirm(onToggle);

  if (mode !== "check") {
    return (
      <>
        <div className={`flex h-[18px] shrink-0 items-stretch border border-foreground ${mode === "time" ? "w-20" : "w-16"}`}>
          <button
            onClick={onCountDown}
            disabled={count <= 0}
            className="w-4 text-[10px] leading-none disabled:opacity-30"
            aria-label={mode === "time" ? "decrease logged time" : "decrement tally"}
          >
            −
          </button>
          <span
            className={`flex flex-1 items-center justify-center border-x border-foreground text-[10px] leading-none ${
              (mode === "time" || threshold < Infinity ? count >= threshold : count > 0) ? "bg-foreground text-background" : "bg-background"
            }`}
          >
            {mode === "time" ? formatMinutes(count) : count}
          </span>
          <button
            {...(holdNeeded ? upHold.holdProps : { onClick: onCountUp })}
            disabled={count >= COUNT_MAX}
            className="w-4 touch-none select-none text-[10px] leading-none disabled:opacity-30"
            aria-label={mode === "time" ? "log time" : "increment tally"}
            title={
              mode === "time"
                ? holdNeeded
                  ? `press and hold (or click) to log +${stepOf(meta)}m`
                  : `click to log +${stepOf(meta)}m`
                : holdNeeded
                  ? "press and hold (or click) to count +1"
                  : "click to count +1"
            }
          >
            +
          </button>
        </div>
        {holdNeeded && upHold.pill}
      </>
    );
  }
  return (
    <>
      <button
        {...(holdNeeded ? toggleHold.holdProps : { onClick: onToggle })}
        className={`h-4 w-4 shrink-0 border flex items-center justify-center ${checked ? "border-foreground bg-foreground text-background" : "border-foreground bg-background"} ${holdNeeded ? "touch-none select-none" : ""}`}
        aria-label={holdNeeded ? (checked ? "hold to un-check" : "hold to check") : "toggle"}
        title={holdNeeded ? `press and hold (or click) to ${checked ? "un-check" : "check"}` : undefined}
      >
        {checked && <span className="text-[10px] leading-none">✓</span>}
      </button>
      {holdNeeded && toggleHold.pill}
    </>
  );
}
