"use client";

import { useRef, useState } from "react";

// The negative-task control — deliberately nothing like a checkbox. It shows
// ✕ N slips for the current window; there is no "checked" state, a clean
// window just reads ✕ 0. Logging a slip is an admission of failure, so it is
// deliberately harder than a tap: mouse users click, touch users press and
// hold (~500ms) — while the press is armed the box fills with the opposite
// colour as a progress bar. A plain touch tap does nothing. The − step takes
// a slip back, undoable while the window is open (slips are ordinary counts
// underneath).

const HOLD_MS = 500;

export function SlipControl({
  slips,
  onSlip,
  onUndo,
}: {
  slips: number;
  onSlip: () => void;
  onUndo: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const pointerTypeRef = useRef<string>("mouse");

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setArmed(false);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    firedRef.current = false;
    pointerTypeRef.current = e.pointerType;
    // mouse clicks log via onClick; touch/pen must hold to arm
    if (e.pointerType === "mouse") return;
    setArmed(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      firedRef.current = true;
      setArmed(false);
      onSlip();
    }, HOLD_MS);
  };

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // a fired long-press already logged the slip — swallow the trailing click
    if (firedRef.current) {
      firedRef.current = false;
      return;
    }
    if (pointerTypeRef.current === "mouse") onSlip();
  };

  return (
    <div className="flex h-[18px] w-16 shrink-0 items-stretch border border-foreground">
      <button onClick={onUndo} disabled={slips <= 0} className="w-4 text-[10px] leading-none disabled:opacity-30" aria-label="take back a slip">
        −
      </button>
      <button
        onPointerDown={onPointerDown}
        onPointerUp={clearTimer}
        onPointerLeave={clearTimer}
        onPointerCancel={clearTimer}
        onClick={onClick}
        onContextMenu={(e) => e.preventDefault()}
        className={`relative flex flex-1 items-center justify-center overflow-hidden border-x border-foreground text-[10px] leading-none ${
          slips > 0 ? "bg-foreground" : "bg-background"
        }`}
        aria-label={`log a slip (${slips} so far)`}
        title={slips > 0 ? "slips — press and hold (or click) to log another" : "clean — press and hold (or click) to log a slip"}
      >
        {armed && (
          <span
            aria-hidden
            className={`slip-fill absolute inset-y-0 left-0 w-full origin-left ${slips > 0 ? "bg-background" : "bg-foreground"}`}
          />
        )}
        <span className="relative text-white mix-blend-difference">✕ {slips}</span>
      </button>
    </div>
  );
}
