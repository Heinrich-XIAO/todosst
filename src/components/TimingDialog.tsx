"use client";

// TimingDialog — the active-learning label prompt.
//
// Shown when the app is opened from an auto-nudge push: "when should this
// have arrived?" A time input (prefilled with now) plus ± offset chips. The
// saved hour becomes a device-local (embedding → hour) label — the vector and
// the label never leave IndexedDB. Dismissing asks nothing and records nothing.

import { useState } from "react";

const CHIPS: { label: string; deltaMin: number | null }[] = [
  { label: "−1h", deltaMin: -60 },
  { label: "−30m", deltaMin: -30 },
  { label: "perfect", deltaMin: 0 },
  { label: "+30m", deltaMin: 30 },
  { label: "+1h", deltaMin: 60 },
];

function toValue(h: number, m: number): string {
  return `${String(((h % 24) + 24) % 24).padStart(2, "0")}:${String(Math.min(59, Math.max(0, m))).padStart(2, "0")}`;
}

function shift(value: string, deltaMin: number): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  const now = new Date();
  const h = m ? Number(m[1]) : now.getHours();
  const min = m ? Number(m[2]) : now.getMinutes();
  const total = ((h * 60 + min + deltaMin) % 1440 + 1440) % 1440;
  return toValue(Math.floor(total / 60), total % 60);
}

export function TimingDialog({
  taskTitle,
  onSave,
  onDismiss,
}: {
  taskTitle: string;
  onSave: (hour: number) => void;
  onDismiss: () => void;
}) {
  const now = new Date();
  const [value, setValue] = useState(toValue(now.getHours(), now.getMinutes()));

  function save() {
    const m = /^(\d{1,2}):(\d{2})/.exec(value);
    if (!m) return;
    onSave(((Number(m[1]) % 24) + 24) % 24);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4" role="dialog" aria-label="nudge timing feedback">
      <div className="w-full max-w-sm border border-foreground bg-background p-4">
        <p className="text-sm font-medium">when should this have arrived?</p>
        <p className="mt-1 truncate text-xs opacity-60" title={taskTitle}>
          “{taskTitle}”
        </p>
        <p className="mt-1 text-[11px] leading-tight opacity-40">
          teaches your nudges when tasks like this one land best. saved on this device only.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="time"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="border-b border-foreground bg-transparent py-1 text-sm focus:outline-none"
            aria-label="best time for this nudge"
          />
          <button onClick={save} className="ml-auto border border-foreground px-3 py-1 text-xs hover:bg-foreground hover:text-background">
            save
          </button>
          <button onClick={onDismiss} className="px-2 py-1 text-xs opacity-60 hover:opacity-100">
            skip
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <button
              key={c.label}
              onClick={() => setValue(shift(value, c.deltaMin ?? 0))}
              className="border border-foreground/30 px-2 py-0.5 text-[11px] hover:bg-foreground/10"
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
