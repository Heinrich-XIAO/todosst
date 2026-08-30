"use client";

// Due dates are calendar days, not instants: they are stored as LOCAL midnight
// so rendering and reminder math agree with the date the user picked in every
// timezone. (Parsing a bare "YYYY-MM-DD" with the Date constructor yields UTC
// midnight, which renders as the previous day west of UTC.)

import { DAY_MS } from "./recur";

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
