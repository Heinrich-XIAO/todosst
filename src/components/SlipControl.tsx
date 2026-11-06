"use client";

import { useHoldConfirm } from "./useHoldConfirm";

// The negative-task control — deliberately nothing like a checkbox. It shows
// ✕ N slips for the current window; there is no "checked" state, a clean
// window just reads ✕ 0. Logging a slip is an admission of failure, so it is
// deliberately harder than a tap: mouse users click, touch users press and
// hold — the shared press-and-hold gesture in useHoldConfirm (habits log the
// same way). A plain touch tap does nothing. The − step takes a slip back,
// undoable while the window is open.

export function SlipControl({
  slips,
  onSlip,
  onUndo,
}: {
  slips: number;
  onSlip: () => void;
  onUndo: () => void;
}) {
  const { holdProps, pill } = useHoldConfirm(onSlip);
  return (
    <>
      <div className="flex h-5 w-[4.5rem] shrink-0 touch-none select-none items-stretch border border-foreground">
        <button onClick={onUndo} disabled={slips <= 0} className="relative w-5 text-[11px] leading-none after:absolute after:-inset-3 after:content-[''] disabled:opacity-40" aria-label="take back a slip">
          −
        </button>
        <button
          {...holdProps}
          className={`flex flex-1 touch-none items-center justify-center border-l border-foreground font-mono text-[11px] tabular-nums leading-none ${
            slips > 0 ? "bg-foreground text-background" : "bg-background"
          }`}
          aria-label={`log a slip (${slips} so far)`}
          title={slips > 0 ? "slips — press and hold (or click) to log another" : "clean — press and hold (or click) to log a slip"}
        >
          ✕ {slips}
        </button>
      </div>
      {pill}
    </>
  );
}
