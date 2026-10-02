"use client";

// Due dates are calendar days, not instants: they are stored as LOCAL midnight
// so rendering and reminder math agree with the date the user picked in every
// timezone. (Parsing a bare "YYYY-MM-DD" with the Date constructor yields UTC
// midnight, which renders as the previous day west of UTC.)

import { DAY_MS, dayIndexLocal } from "./recur";

const HOUR_MS = 3_600_000;

/** Parse a date-input value ("YYYY-MM-DD") as local midnight. Rejects
 * malformed or rolled-over dates (e.g. "2026-02-30"). */
export function parseDueInput(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, day] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const d = new Date(y, mo, day);
  if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== day) return null;
  return d.getTime();
}

/** Format a timestamp as a date-input value using its LOCAL calendar date. */
export function formatDueInput(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Migrate legacy dueAt values — the old picker stored exact UTC midnight —
 * to local midnight of the same intended calendar date. Any other value
 * (already-local midnights, arbitrary timestamps) passes through unchanged,
 * so this is idempotent. */
export function normalizeDueAt(ts: number): number {
  if (!Number.isFinite(ts) || ts % DAY_MS !== 0) return ts;
  const d = new Date(ts);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime();
}

// A due date can carry a time of day, stored as minutes since LOCAL midnight
// (metadata.dueTimeMin). Unset = date-only due: the due instant is midnight,
// so "x minutes before" reminders land in the evening before (legacy behavior).

/** Parse a time-input value ("HH:MM") as minutes since local midnight. */
export function parseTimeInput(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Format minutes-since-local-midnight as a time-input value ("HH:MM"). */
export function formatTimeInput(min: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
}

/** Default due time for a fresh date pick: 5 hours from now, as minutes since
 * local midnight — a capture starts comfortably in the future instead of
 * already past. But never past the 11 o'clock hour: if +5h would roll into
 * tomorrow, fall back to +1h; if that would too, the last minute of today. */
export function defaultDueTimeMin(now: number): number {
  const today = dayIndexLocal(now);
  const minOf = (ts: number) => {
    const d = new Date(ts);
    return d.getHours() * 60 + d.getMinutes();
  };
  const plus5 = now + 5 * HOUR_MS;
  if (dayIndexLocal(plus5) === today) return minOf(plus5);
  const plus1 = now + HOUR_MS;
  if (dayIndexLocal(plus1) === today) return minOf(plus1);
  return 23 * 60 + 59;
}

/** The due instant reminders count from: local midnight of the due day plus
 * the optional time of day. Without a time it is midnight. */
export function dueInstant(dueAt: number, dueTimeMin?: number): number {
  return normalizeDueAt(dueAt) + (Number.isFinite(dueTimeMin) ? dueTimeMin! * 60_000 : 0);
}
