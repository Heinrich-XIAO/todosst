"use client";

import { COUNT_MAX, formatMinutes, stepOf, type CompletionMode } from "@/lib/recur";
import type { PlainNode } from "@/lib/crypto";
import { useHoldConfirm } from "./useHoldConfirm";

// The count/checkbox widget shared by tree rows and the today view. Storage is
// always counts; check vs tally vs time is rendering only.
//
// Recurring rows (habits — meta.recur) log tally and time progress through the
// shared press-and-hold gesture (useHoldConfirm), the same deliberate friction
// as battles: on touch a plain tap does nothing and a ~500ms hold commits,
// mouse clicks stay instant. Checkboxes are a single tap everywhere, habits
// included — checking off a box is the one-click action on mobile. Taking
// progress back via − is always a plain tap.

const CHECK_PATH = "M1.5 5.2 4 7.5 8.5 2.5";

/** The left-column square for rows whose control sits on the right (tally,
 * time, avoid): it fills with the ✓ once the goal is met, so every title in a
 * list starts at the same x. Status only — the stepper is the control. */
export function StatusSquare({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-4 w-4 shrink-0 items-center justify-center border ${
        done ? "border-foreground bg-foreground text-background" : "border-dashed border-foreground/60"
      }`}
    >
      {done && (
        <svg viewBox="0 0 10 10" className="h-2.5 w-2.5">
          <path className="check-draw" pathLength={1} d={CHECK_PATH} fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      )}
    </span>
  );
}

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

  if (mode !== "check") {
    return (
      <>
        <div className="flex h-5 w-[5.5rem] shrink-0 items-stretch border border-foreground">
          <button
            onClick={onCountDown}
            disabled={count <= 0}
            className="relative w-5 text-[11px] leading-none after:absolute after:-inset-3 after:content-[''] disabled:opacity-40"
            aria-label={mode === "time" ? "decrease logged time" : "decrement tally"}
          >
            −
          </button>
          <span
            className={`flex flex-1 items-center justify-center border-x border-foreground font-mono text-[11px] tabular-nums leading-none ${
              (mode === "time" || threshold < Infinity ? count >= threshold : count > 0) ? "bg-foreground text-background" : "bg-background"
            }`}
          >
            {mode === "time" ? formatMinutes(count) : count}
          </span>
          <button
            {...(holdNeeded ? upHold.holdProps : { onClick: onCountUp })}
            disabled={count >= COUNT_MAX}
            className="relative w-5 touch-none select-none text-[11px] leading-none after:absolute after:-inset-3 after:content-[''] disabled:opacity-40"
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
        onClick={onToggle}
        className={`relative h-4 w-4 shrink-0 border flex items-center justify-center after:absolute after:-inset-3 after:content-[''] ${checked ? "border-foreground bg-foreground text-background" : "border-foreground bg-background"}`}
        aria-label={checked ? "un-check" : "check"}
      >
        {checked && (
          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden>
            <path className="check-draw" pathLength={1} d={CHECK_PATH} fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        )}
      </button>
    </>
  );
}
