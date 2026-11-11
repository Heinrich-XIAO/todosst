"use client";

import { useEffect, useRef } from "react";

// In-app reminder banner: due-soon reminders and overdue tasks when the app is
// (re)focused. Push handles the closed-tab case; this covers open/backgrounded.
// Toasts that announce a state change (hold confirm, offline capture, replay
// sync) pass onUndo and get an undo button alongside close.
const VISIBLE = 3;
const TOAST_MS = 6000;

export function ReminderToast({
  title,
  lines,
  onUndo,
  onClose,
}: {
  title: string;
  lines: string[];
  onUndo?: () => void;
  onClose: () => void;
}) {
  // read onClose through a ref: callers pass an inline closure recreated on
  // every parent render, and keying the timer on it would restart the
  // auto-dismiss on every render — effectively never dismissing
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const t = window.setTimeout(() => onCloseRef.current(), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [lines]);

  if (lines.length === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 border border-foreground bg-background px-3 py-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-mono">{title}</span>
        <span className="flex items-center gap-3">
          {onUndo ? (
            <button
              onClick={() => {
                onUndo();
                onClose();
              }}
              className="border border-foreground px-2 py-0.5 hover:bg-foreground hover:text-background"
            >
              undo
            </button>
          ) : null}
          <button onClick={onClose} className="underline underline-offset-4 hover:opacity-60" aria-label="dismiss">
            close
          </button>
        </span>
      </div>
      {/* three lines and a count: a toast is a glance, and a tall one lands
          on top of whatever sheet is open */}
      <ul className="mt-1 space-y-0.5">
        {lines.slice(0, VISIBLE).map((line, i) => (
          <li key={i} className="truncate opacity-80">
            {line}
          </li>
        ))}
      </ul>
      {lines.length > VISIBLE ? <p className="mt-0.5 font-mono text-[11px] opacity-60">and {lines.length - VISIBLE} more</p> : null}
    </div>
  );
}
