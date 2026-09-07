"use client";

import { useRef, useState } from "react";

// The negative-task control — deliberately nothing like a checkbox. It shows
// ✕ N slips for the current window; there is no "checked" state, a clean
// window just reads ✕ 0. Logging a slip is an admission of failure, so it is
// deliberately harder than a tap: mouse users click, touch users press and
// hold (~500ms). The finger covers the control while holding, so progress
// floats above the touch point as a loupe-style pill (.slip-pop in
// globals.css — duration mirrors HOLD_MS). A plain touch tap does nothing.
// The − step takes a slip back, undoable while the window is open.

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
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const pointerTypeRef = useRef<string>("mouse");

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setArmed(false);
    setPos(null);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    firedRef.current = false;
    pointerTypeRef.current = e.pointerType;
    // mouse clicks log via onClick; touch/pen must hold to arm
    if (e.pointerType === "mouse") return;
    setArmed(true);
    // keep the pill on-screen — 48 = half the pill width + margin
    setPos({
      x: Math.min(Math.max(e.clientX, 48), window.innerWidth - 48),
      y: e.clientY,
    });
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      firedRef.current = true;
      setArmed(false);
      setPos(null);
      onSlip();
    }, HOLD_MS);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    // follow a drifting finger so the pill stays above it
    if (e.pointerType === "mouse" || timerRef.current === null) return;
    setPos({
      x: Math.min(Math.max(e.clientX, 48), window.innerWidth - 48),
      y: e.clientY,
    });
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
    <>
      <div className="flex h-[18px] w-16 shrink-0 touch-none select-none items-stretch border border-foreground">
        <button onClick={onUndo} disabled={slips <= 0} className="w-4 text-[10px] leading-none disabled:opacity-30" aria-label="take back a slip">
          −
        </button>
        <button
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={clearTimer}
          onPointerLeave={clearTimer}
          onPointerCancel={clearTimer}
          onClick={onClick}
          onContextMenu={(e) => e.preventDefault()}
          className={`flex flex-1 touch-none items-center justify-center border-x border-foreground text-[10px] leading-none ${
            slips > 0 ? "bg-foreground text-background" : "bg-background"
          }`}
          aria-label={`log a slip (${slips} so far)`}
          title={slips > 0 ? "slips — press and hold (or click) to log another" : "clean — press and hold (or click) to log a slip"}
        >
          ✕ {slips}
        </button>
      </div>
      {armed && pos && (
        <div
          aria-hidden
          className="slip-pop pointer-events-none fixed z-50 flex h-7 w-20 items-center rounded-full border border-foreground bg-background p-[3px]"
          style={{ left: pos.x, top: pos.y }}
        >
          <span className="slip-pop-fill h-full rounded-full bg-foreground" />
        </div>
      )}
    </>
  );
}
