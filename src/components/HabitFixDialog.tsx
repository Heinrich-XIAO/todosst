"use client";

import { useEffect, useState } from "react";
import type { PlainNode } from "@/lib/crypto";
import { COUNT_MAX, formatMinutes, modeOf, stepOf, thresholdOf } from "@/lib/recur";
import type { TreeNode } from "@/lib/tree";

// HabitFixDialog — the "But I did" correction dialog for a missed habit
// window. Styled like the other in-app modals (TimingDialog/NoticeDialog):
// Esc or backdrop click dismisses and records nothing. Yes-or-no (checkbox)
// habits just answer the question — yes saves and freezes the window;
// tally/time habits get a stepper to set what you actually did, then confirm
// saves the correction and freezes the window in one step (the caller writes
// the count, then the holds record).

export function HabitFixDialog({
  node,
  count,
  dayLabel,
  onConfirm,
  onDismiss,
}: {
  node: TreeNode;
  /** count currently recorded for the window */
  count: number;
  dayLabel: string;
  /** save the correction and freeze the window */
  onConfirm: (nextCount: number) => void;
  onDismiss: () => void;
}) {
  const meta = node.metadata as PlainNode["metadata"];
  const mode = modeOf(meta);
  const threshold = thresholdOf(meta);
  const step = stepOf(meta);
  const [next, setNext] = useState(count);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  const goal =
    mode === "time"
      ? `goal ${formatMinutes(threshold)}`
      : mode === "count"
        ? Number.isFinite(threshold)
          ? `goal ${threshold}`
          : "no goal — any entry counts"
        : threshold > 1
          ? `goal ${threshold}`
          : null;

  const delta = mode === "time" ? step : 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      role="dialog"
      aria-label={`correct ${node.title} for ${dayLabel}`}
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-sm border border-foreground bg-background p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-medium">did you do this on {dayLabel}?</p>
        <p className="mt-1 truncate text-xs opacity-60" title={node.title}>
          “{node.title}”
        </p>
        {mode === "check" ? (
          <div className="mt-4 flex items-center justify-end gap-2">
            <button onClick={onDismiss} className="px-3 py-2 text-xs opacity-60 hover:opacity-100">
              no
            </button>
            <button
              onClick={() => onConfirm(threshold)}
              className="border border-foreground bg-foreground px-4 py-2 text-xs text-background hover:opacity-90"
            >
              yes
            </button>
          </div>
        ) : (
          <>
            {goal !== null && <p className="mt-1 text-[11px] opacity-40">{goal}</p>}

            <div className="mt-4 flex items-center justify-center">
              <div className="flex items-stretch border border-foreground text-sm leading-none">
                <button
                  onClick={() => setNext(Math.max(0, next - delta))}
                  disabled={next <= 0}
                  className="px-4 py-2 hover:bg-foreground hover:text-background disabled:opacity-30"
                  aria-label="log less"
                >
                  −
                </button>
                <span
                  className={`flex min-w-16 items-center justify-center border-x border-foreground px-3 ${
                    next > 0 ? "bg-foreground text-background" : ""
                  }`}
                >
                  {mode === "time" ? formatMinutes(next) : next}
                </span>
                <button
                  onClick={() => setNext(Math.min(COUNT_MAX, next + delta))}
                  disabled={next >= COUNT_MAX}
                  className="border-l border-foreground px-4 py-2 hover:bg-foreground hover:text-background disabled:opacity-30"
                  aria-label="log more"
                >
                  +
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={onDismiss} className="px-3 py-2 text-xs opacity-60 hover:opacity-100">
                cancel
              </button>
              <button
                onClick={() => onConfirm(next)}
                className="border border-foreground bg-foreground px-4 py-2 text-xs text-background hover:opacity-90"
              >
                confirm
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
