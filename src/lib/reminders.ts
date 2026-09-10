"use client";

// Reminder derivation + client-side firing state.
// Reminders are offsets before dueAt, stored inside the encrypted metadata.
// The derived remindAt timestamps are mirrored to the server in plaintext
// (convex/push.ts) so it can schedule pushes while the app is closed — the
// server learns *when*, never *what*.

import type { PlainNode } from "./crypto";
import { dueInstant } from "./due";

export const DEFAULT_OFFSETS_MIN = [15, 5];

export type ReminderCfg = NonNullable<PlainNode["metadata"]["reminder"]>;

/** Enabled offsets for a node's metadata ([] when reminders off). */
export function reminderOffsets(meta: PlainNode["metadata"]): number[] {
  const r = meta.reminder;
  if (!r || !r.enabled || !meta.dueAt) return [];
  const offs = r.offsetsMin && r.offsetsMin.length > 0 ? r.offsetsMin : DEFAULT_OFFSETS_MIN;
  return Array.from(new Set(offs)).filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => b - a);
}

export function normalizeCfg(cfg: ReminderCfg | null | undefined): { enabled: boolean; offsetsMin: number[] } {
  const offsetsMin =
    cfg?.offsetsMin && cfg.offsetsMin.length > 0
      ? Array.from(new Set(cfg.offsetsMin)).filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => b - a)
      : DEFAULT_OFFSETS_MIN;
  return { enabled: !!cfg?.enabled, offsetsMin };
}

/** Reminders default on: any task that has a due date or recurrence plan bakes
 * in { enabled: true, offsetsMin: DEFAULT_OFFSETS_MIN } unless a reminder cfg
 * already exists — an explicit off is respected. Used by creation flows and by
 * the details panel when a due date/recurrence is added to an existing task. */
export function withReminderDefault(meta: PlainNode["metadata"]): PlainNode["metadata"] {
  if (meta.reminder) return meta;
  if (!meta.dueAt && !meta.recur) return meta;
  return { ...meta, reminder: { enabled: true, offsetsMin: DEFAULT_OFFSETS_MIN } };
}

/** Future reminder instants + their offset (minutes before due) for a node —
 * [] if disabled/completed/no dueAt. The offset rides into the push copy. */
export function remindItemsFor(
  meta: PlainNode["metadata"],
  isCompleted: boolean,
  now: number
): { t: number; min: number }[] {
  if (isCompleted || !meta.dueAt) return [];
  const at = dueInstant(meta.dueAt, meta.dueTimeMin);
  return reminderOffsets(meta)
    .map((o) => ({ t: at - o * 60_000, min: o }))
    .filter((x) => Number.isFinite(x.t) && x.t > now - 5 * 60_000) // keep just-fired ones so the sync doesn't delete them mid-dispatch
    .sort((a, b) => a.t - b.t);
}

/** Future remindAt timestamps (ms) for a node — [] if disabled/completed/no dueAt. */
export function remindTimesFor(
  meta: PlainNode["metadata"],
  isCompleted: boolean,
  now: number
): number[] {
  return remindItemsFor(meta, isCompleted, now).map((x) => x.t);
}

// ---- locally-shown tracking (per device, localStorage) ----

const SHOWN_KEY = "todosst:shownReminders";
const OVERDUE_KEY = "todosst:overdueShown";

export function reminderKey(todoId: string, remindAt: number): string {
  return `${todoId}:${remindAt}`;
}

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function writeSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {}
}

export function loadShownReminders(): Set<string> {
  return readSet(SHOWN_KEY);
}

/** Mark reminders as toasted locally. Prunes entries older than a day. */
export function markRemindersShown(keys: string[], now: number) {
  if (keys.length === 0) return;
  const set = readSet(SHOWN_KEY);
  for (const k of keys) set.add(k);
  // entries are "<todoId>:<remindAt>" — drop anything from >1 day ago
  const cutoff = now - 24 * 60 * 60 * 1000;
  for (const k of set) {
    const ts = Number(k.slice(k.lastIndexOf(":") + 1));
    if (Number.isFinite(ts) && ts < cutoff) set.delete(k);
  }
  writeSet(SHOWN_KEY, set);
}

/** Overdue alerts show once per task per local day. */
export function overdueShownIds(day: number): Set<string> {
  const set = readSet(OVERDUE_KEY);
  const prefix = `${day}:`;
  const out = new Set<string>();
  for (const k of set) if (k.startsWith(prefix)) out.add(k.slice(prefix.length));
  return out;
}

export function markOverdueShown(day: number, ids: string[]) {
  if (ids.length === 0) return;
  const set = readSet(OVERDUE_KEY);
  for (const id of ids) set.add(`${day}:${id}`);
  // keep only today + yesterday
  for (const k of Array.from(set)) {
    const d = Number(k.slice(0, k.indexOf(":")));
    if (Number.isFinite(d) && d < day - 1) set.delete(k);
  }
  writeSet(OVERDUE_KEY, set);
}
