"use client";

// Daily nudge — the fixed-time ritual cue. One plaintext row per user
// (time-of-day + UTC offset) that the minute cron fires blind; the service
// worker renders generic copy. DailyNudgeSync auto-provisions 09:00 once per
// account and keeps the stored offset fresh on every open (DST/travel);
// NudgeSettings is the in-settings control.

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function DailyNudgeSync() {
  const pref = useQuery(api.nudge.get);
  const set = useMutation(api.nudge.set);
  useEffect(() => {
    if (pref === undefined) return; // still loading
    const utcOffsetMin = -new Date().getTimezoneOffset();
    if (pref === null) {
      // first sighting on the account — the cue exists from now on
      void set({ hour: 9, minute: 0, utcOffsetMin }).catch(() => {});
      return;
    }
    // keep the dispatch offset current: last opened device wins (travel/DST)
    if (pref.enabled && pref.utcOffsetMin !== utcOffsetMin) {
      void set({ hour: pref.hour, minute: pref.minute, utcOffsetMin }).catch(() => {});
    }
  }, [pref, set]);
  return null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function NudgeSettings() {
  const pref = useQuery(api.nudge.get);
  const set = useMutation(api.nudge.set);
  const disable = useMutation(api.nudge.disable);
  // local edit state so the picker doesn't fight the server round-trip
  const [edit, setEdit] = useState<string | null>(null);

  if (pref === undefined) return null;
  const value = edit ?? (pref ? `${pad2(pref.hour)}:${pad2(pref.minute)}` : "09:00");
  const offset = -new Date().getTimezoneOffset();

  async function applyTime(v: string) {
    const [h, m] = v.split(":").map((p) => Number(p));
    if (!Number.isInteger(h) || !Number.isInteger(m)) return;
    await set({ hour: h, minute: m, utcOffsetMin: offset }).catch(() => {});
  }

  return (
    <div className="mt-3 border border-foreground/20 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">daily nudge</p>
        {pref && <span className="text-[11px] opacity-40">{pref.enabled ? "on" : "off"}</span>}
      </div>
      <p className="mt-1 text-[11px] leading-tight opacity-40">
        a fixed-time push each day — “today’s windows are open”. delivered to every signed-in
        browser; the server only learns the time, never any content.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="time"
          value={value}
          disabled={!pref?.enabled}
          onChange={(e) => {
            setEdit(e.target.value);
            if (e.target.value) void applyTime(e.target.value);
          }}
          className="border-b border-foreground bg-transparent py-1 text-sm focus:outline-none disabled:opacity-40"
          aria-label="daily nudge time"
        />
        {pref?.enabled ? (
          <button
            onClick={() => void disable({}).catch(() => {})}
            className="ml-auto border border-foreground px-2 py-1 text-[11px] hover:bg-foreground/10"
          >
            turn off
          </button>
        ) : (
          <button
            onClick={() => {
              setEdit(null);
              void applyTime(value).catch(() => {});
            }}
            disabled={pref === undefined}
            className="ml-auto border border-foreground px-2 py-1 text-[11px] hover:bg-foreground/10 disabled:opacity-40"
          >
            turn on
          </button>
        )}
      </div>
    </div>
  );
}
