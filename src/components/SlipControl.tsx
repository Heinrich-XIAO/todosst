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
      <div className="flex h-[18px] w-16 shrink-0 touch-none select-none items-stretch border border-foreground">
        <button onClick={onUndo} disabled={slips <= 0} className="w-4 text-[10px] leading-none disabled:opacity-30" aria-label="take back a slip">
          −
        </button>
        <button
          {...holdProps}
          className={`flex flex-1 touch-none items-center justify-center border-l border-foreground text-[10px] leading-none ${
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
