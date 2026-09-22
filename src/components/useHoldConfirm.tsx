"use client";

import { useRef, useState } from "react";

// Shared press-and-hold confirmation for committed logs — battles (SlipControl)
// and habits (CountControl) both fire their write only after a ~500ms press on
// touch/pen, with a loupe-style progress pill floating above the finger
// (.slip-pop in globals.css). The finger covers the control while holding, so
// progress fills the pill instead. A plain touch tap does nothing; mouse
// clicks fire immediately. A trailing click after a fired hold is swallowed
// so the log lands exactly once.

export const HOLD_MS = 500;

export function useHoldConfirm(fire: () => void) {
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
      fire();
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
    // a fired long-press already logged — swallow the trailing click
    if (firedRef.current) {
      firedRef.current = false;
      return;
    }
    if (pointerTypeRef.current === "mouse") fire();
  };

  return {
    /** spread onto the button that should require the hold */
    holdProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: clearTimer,
      onPointerLeave: clearTimer,
      onPointerCancel: clearTimer,
      onClick,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
    /** floats above the touch point while holding — render next to the control */
    pill: armed && pos ? (
      <div
        aria-hidden
        className="slip-pop pointer-events-none fixed z-50 flex h-7 w-20 items-center rounded-full border border-foreground bg-background p-[3px]"
        style={{ left: pos.x, top: pos.y }}
      >
        <span className="slip-pop-fill h-full rounded-full bg-foreground" />
      </div>
    ) : null,
  };
}
