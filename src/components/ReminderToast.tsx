"use client";

import { useEffect, useRef } from "react";

// In-app reminder banner: due-soon reminders and overdue tasks when the app is
// (re)focused. Push handles the closed-tab case; this covers open/backgrounded.
export function ReminderToast({
  title,
  lines,
  onClose,
}: {
  title: string;
  lines: string[];
  onClose: () => void;
}) {
  // read onClose through a ref: callers pass an inline closure recreated on
  // every parent render, and keying the timer on it would restart the 20s
  // auto-dismiss on every render — effectively never dismissing
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const t = window.setTimeout(() => onCloseRef.current(), 20_000);
    return () => window.clearTimeout(t);
  }, [lines]);

  if (lines.length === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 border border-foreground bg-background px-3 py-2 text-xs shadow-lg">
      <div className="flex items-center justify-between">
        <span className="font-medium">{title}</span>
        <button onClick={onClose} className="opacity-60 hover:opacity-100" aria-label="dismiss">
          close
        </button>
      </div>
      <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto">
        {lines.slice(0, 12).map((line, i) => (
          <li key={i} className="truncate opacity-80">
            {line}
          </li>
        ))}
      </ul>
      {lines.length > 12 ? <p className="mt-0.5 text-[10px] opacity-40">and {lines.length - 12} more…</p> : null}
    </div>
  );
}
