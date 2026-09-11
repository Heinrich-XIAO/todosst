"use client";

// Daily nudge — the fixed-time ritual cue, Duolingo-flavored. One plaintext
// row per user (time-of-day + UTC offset) that the minute cron fires blind.
// DailyNudgeSync auto-provisions 09:00 once per account, keeps the stored
// offset fresh (DST/travel), and — on every open — syncs an encrypted copy
// blob ({k, streak, missed, open} under the notification key) plus an
// all-clear skip day, so the push only fires when it matters and can say
// "your 12-day streak is at risk" without the server learning anything.
// NudgeSettings is the in-settings control.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { buildTodayItems, openCountOf } from "./TodayView";
import { loadRitual, missedDays, streakOf } from "@/lib/ritual";
import { dayIndexLocal, type RecurState } from "@/lib/recur";
import { encryptNotifBlob } from "@/lib/notifKey";
import type { DecryptedNode, TreeNode } from "@/lib/tree";

type DailyNudgeSyncProps = {
  nodes: DecryptedNode[] | null;
  tree: { map: Map<string, TreeNode> };
  recurStates: Map<string, RecurState> | null;
  history: { byTodo: Map<string, Map<number, number>> } | null;
  notifKeyB64: string | null;
  nowTs: number;
};

/** Which copy family fits the day, or null when the generic copy should stay. */
function nudgeVariant(
  missed: number,
  ritual: Pick<ReturnType<typeof loadRitual>, "firstDay" | "lastClearDay">
): "risk" | "missed" | "comeback" | null {
  if (missed >= 3) return "comeback";
  if (missed >= 1) return "missed";
  // never cleared anything — the "fresh start" family fits the first days too
  if (ritual.lastClearDay === null) return ritual.firstDay === null ? "comeback" : null;
  return "risk";
}

export function DailyNudgeSync({ nodes, tree, recurStates, history, notifKeyB64, nowTs }: DailyNudgeSyncProps) {
  const pref = useQuery(api.nudge.get);
  const set = useMutation(api.nudge.set);
  const setSkipDay = useMutation(api.nudge.setSkipDay);

  // signature guards: a skip/copy value is written only when it actually
  // changed — the effect re-runs on the 30s wall-clock tick otherwise
  const skipRef = useRef<string | null>(null);
  const copyRef = useRef<string | null>(null);

  const habitId = useMemo(
    () => (nodes?.find((n) => (n.metadata as { habit?: boolean }).habit === true)?._id ?? null) as Id<"todos"> | null,
    [nodes]
  );

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
    if (!nodes || !recurStates || !tree) return;

    const today = dayIndexLocal(nowTs);
    const ritual = loadRitual();
    const clearedToday = ritual.lastClearDay === today;

    // all-clear days suppress the push entirely — the ping only fires on
    // days the ritual didn't happen yet
    const skipSig = `${today}:${clearedToday ? 1 : 0}`;
    if (skipRef.current !== skipSig) {
      skipRef.current = skipSig;
      void setSkipDay({ day: clearedToday ? today : undefined }).catch(() => {});
    }
    if (!pref.enabled || clearedToday) return;

    const missed = missedDays(today, ritual);
    const open = openCountOf(buildTodayItems(nodes, tree, recurStates, nowTs) ?? []);
    const streak = streakOf(today, habitId ? (history?.byTodo.get(habitId) ?? null) : null);
    const k = nudgeVariant(missed, ritual);
    if (k === null || open === 0) return;

    const copySig = `${today}|${k}|${streak}|${missed}|${open}`;
    if (copySig === copyRef.current) return;
    copyRef.current = copySig;
    if (!notifKeyB64) return; // no key yet — rows without a blob get generic copy

    void (async () => {
      try {
        const nb = await encryptNotifBlob(notifKeyB64, { k, streak, missed, open });
        void set({ hour: pref.hour, minute: pref.minute, utcOffsetMin, nb }).catch(() => {
          copyRef.current = null; // failed write — retry on the next tick
        });
      } catch {
        copyRef.current = null;
      }
    })();
  }, [pref, nodes, tree, recurStates, history, habitId, notifKeyB64, nowTs, set, setSkipDay]);
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
        a fixed-time push each day — skipped automatically on all-clear days, and worded to
        keep your streak alive. delivered to every signed-in browser; the server only learns
        the time, never any content.
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
