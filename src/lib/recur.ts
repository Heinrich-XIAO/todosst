"use client";

// Recurrence engine for windowed-occurrence tasks.
//
// Model:
// - A recurring task is ONE node (stable /paths). Its RRULE defines occurrence
//   windows (local calendar days). The UI always shows only the CURRENT window;
//   past windows are immutable history.
// - Completions are stored as COUNTS per window, internally always counts.
//   Checkbox vs tally vs time is purely a rendering mode (check: checked iff
//   count >= threshold; time: count is minutes, goal = threshold).
// - Grace period: `now - graceHours` may still fall into yesterday's window, so
//   night owls can count yesterday's task after midnight. Past windows are never
//   editable by construction — the UI only ever mutates the current window.
//
// RRULE strings are parsed with jakubroztocil/rrule (RFC 5545):
// https://github.com/jakubroztocil/rrule

import type { RRule } from "rrule";

export const DEFAULT_GRACE_HOURS = 4;
export const GRACE_HOURS_MAX = 48;
export const COUNT_MAX = 9999;
const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

// ---------- local day index (days since local epoch) ----------

/** Days-since-epoch index of the local calendar day containing ts.
 * Defined via local date parts — monotonic, DST-safe, no epoch rounding. */
export function dayIndexLocal(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;
}

/** Local-midnight timestamp for a day index (exact inverse of dayIndexLocal). */
export function dayIndexToStart(idx: number): number {
  const base = new Date(idx * DAY_MS); // UTC midnight of day idx — used only for its Y/M/D parts
  return new Date(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()).getTime();
}

/** Local midnight of the local day containing ts. */
export function dayStartLocal(ts: number): number {
  return dayIndexToStart(dayIndexLocal(ts));
}

// ---------- rrule loading / caching ----------

type RRuleModule = typeof import("rrule");
let rruleMod: Promise<RRuleModule> | null = null;

export function loadRrule(): Promise<RRuleModule> {
  rruleMod ??= import("rrule");
  return rruleMod;
}

/** Normalize a stored/pasted RRULE text: trim lines, drop empties, strip RRULE: prefix. DTSTART lines are kept. */
export function normalizeRruleString(s: string): string {
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^EXRULE[:;]/i.test(l))
    .map((l) => l.replace(/^RRULE:/i, ""))
    .join("\n")
    .trim();
}

const ruleCache = new Map<string, RRule>();

/** Parse an RRULE string into an RRule anchored at anchorTs (fallback when the string has no DTSTART). Cached. */
export async function getRule(ruleStr: string, anchorTs: number): Promise<RRule | null> {
  const clean = normalizeRruleString(ruleStr);
  if (!clean) return null;
  const key = `${clean}|${dayIndexLocal(anchorTs)}`;
  const hit = ruleCache.get(key);
  if (hit) return hit;
  try {
    const { rrulestr } = await loadRrule();
    // an explicit DTSTART in the rule wins; otherwise anchor at the creation day's local midnight
    const rule = (
      /(^|\n)DTSTART/i.test(clean)
        ? rrulestr(clean)
        : rrulestr(clean, { dtstart: new Date(dayIndexToStart(dayIndexLocal(anchorTs))) })
    ) as RRule;
    ruleCache.set(key, rule);
    if (ruleCache.size > 200) {
      const oldest = ruleCache.keys().next().value;
      if (oldest !== undefined) ruleCache.delete(oldest);
    }
    return rule;
  } catch {
    return null;
  }
}

// ---------- occurrence state ----------

export type CompletionMode = "check" | "count" | "time";

export type RecurMetadata = {
  recur?: string;
  mode?: CompletionMode;
  threshold?: number;
  stepMin?: number; // time mode: minutes added per + click (default TIME_STEP_DEFAULT)
  graceHours?: number;
  counts?: Record<string, number>;
};

export type RecurState = {
  isRecurring: boolean;
  /** day-index the tally applies to (current window; upcoming window if not started; creation day for plain tasks) */
  windowDay: number;
  /** current window has rolled past (count is frozen history) */
  count: number;
  /** start ts of the next occurrence after the current window (recurring only) */
  nextTs: number | null;
  /** human summary of the rule, e.g. "every 2 weeks on mon, thu" */
  summary: string;
};

export function modeOf(meta: RecurMetadata): CompletionMode {
  return meta.mode === "count" || meta.mode === "time" ? meta.mode : "check";
}

export function thresholdOf(meta: RecurMetadata): number {
  const t = meta.threshold;
  return typeof t === "number" && Number.isFinite(t) && t >= 1 ? Math.min(Math.floor(t), 999) : 1;
}

export const TIME_STEP_DEFAULT = 15;
export const TIME_STEP_MAX = 240;

/** Time mode: minutes added per + click (clamped 1..TIME_STEP_MAX). */
export function stepOf(meta: RecurMetadata): number {
  const s = meta.stepMin;
  return typeof s === "number" && Number.isFinite(s) && s >= 1 ? Math.min(Math.floor(s), TIME_STEP_MAX) : TIME_STEP_DEFAULT;
}

/** "45m", "1h 05m", "2h" — minutes rendering for time mode. */
export function formatMinutes(total: number): string {
  const m = Math.max(0, Math.floor(total));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${String(r).padStart(2, "0")}m`;
}

function graceMsOf(meta: RecurMetadata): number {
  const g = meta.graceHours;
  const hours = typeof g === "number" && Number.isFinite(g) ? Math.min(Math.max(g, 0), GRACE_HOURS_MAX) : DEFAULT_GRACE_HOURS;
  return hours * HOUR_MS;
}

function countFor(meta: RecurMetadata, windowDay: number): number {
  const c = meta.counts?.[String(windowDay)];
  return typeof c === "number" && Number.isFinite(c) && c > 0 ? Math.min(Math.floor(c), COUNT_MAX) : 0;
}

function summarize(rule: RRule): string {
  try {
    if (!rule.isFullyConvertibleToText()) return normalizeRruleString(rule.toString()).replace(/\s+/g, " ");
    return rule.toText().toLowerCase();
  } catch {
    return normalizeRruleString(rule.toString()).replace(/\s+/g, " ");
  }
}

/**
 * Resolve the windowed state of a node. Plain (non-recurring) tasks get a single
 * window anchored at their creation day — counts never reset.
 */
export async function recurState(meta: RecurMetadata, anchorTs: number, nowTs: number): Promise<RecurState> {
  const ruleStr = meta.recur ? String(meta.recur) : "";
  if (!normalizeRruleString(ruleStr)) {
    const windowDay = dayIndexLocal(anchorTs);
    return { isRecurring: false, windowDay, count: countFor(meta, windowDay), nextTs: null, summary: "" };
  }
  const rule = await getRule(ruleStr, anchorTs);
  if (!rule) {
    // unparseable rule — degrade to a plain single window
    const windowDay = dayIndexLocal(anchorTs);
    return { isRecurring: false, windowDay, count: countFor(meta, windowDay), nextTs: null, summary: "" };
  }
  const eff = nowTs - graceMsOf(meta);
  const current = rule.before(new Date(eff), true);
  const next = rule.after(new Date(Math.max(nowTs, anchorTs)), false);
  const nextTs = next ? next.getTime() : null;
  let windowDay: number;
  if (current) {
    windowDay = dayIndexLocal(current.getTime());
  } else if (nextTs !== null) {
    // rule not started yet — tally applies to the upcoming window
    windowDay = dayIndexLocal(nextTs);
  } else {
    windowDay = dayIndexLocal(nowTs);
  }
  return { isRecurring: true, windowDay, count: countFor(meta, windowDay), nextTs, summary: summarize(rule) };
}

// ---------- compact counts codec ----------
// "d1240:3;d1241:1" — day-index:count pairs, ascending, zero counts omitted.

const COUNT_TOKEN_RE = /^d(\d{3,7}):(\d{1,5})$/;

export function decodeCounts(s: string): Map<number, number> {
  const out = new Map<number, number>();
  if (!s) return out;
  for (const token of s.split(";")) {
    const m = COUNT_TOKEN_RE.exec(token.trim());
    if (!m) continue;
    const day = Number(m[1]);
    const count = Math.min(Number(m[2]), COUNT_MAX);
    if (count > 0) out.set(day, count);
  }
  return out;
}

export function mergeCounts(maps: Iterable<Map<number, number>>): Map<number, number> {
  const out = new Map<number, number>();
  for (const m of maps) for (const [k, v] of m) out.set(k, (out.get(k) ?? 0) + v);
  return out;
}

// ---------- per-todo history payload (stored E2E-encrypted in todoHistory) ----------

export type HistoryData = { todoId: string; counts: Map<number, number>; durations?: Map<number, number> };

// Per-day duration totals (ms) — same "d<day>:<value>" codec as counts but with
// a much larger value range (ms, accumulated stopwatch time per day).
const DURATION_MAX = 1e12; // ~31.7 years of ms — sanity clamp only
const DURATION_TOKEN_RE = /^d(\d{3,7}):(\d{1,13})$/;

function encodePairs(src: Iterable<[number, number] | readonly [number, number]> | Record<string, number>, max: number): string {
  const entries: [number, number][] =
    src instanceof Map || Array.isArray(src)
      ? Array.from(src as Iterable<[number, number]>)
      : Object.entries(src as Record<string, number>).map(([k, v]) => [Number(k), Number(v)] as [number, number]);
  const seen = new Map<number, number>();
  for (const [k, v] of entries) {
    if (!Number.isFinite(k) || !Number.isFinite(v)) continue;
    const n = Math.min(Math.floor(v), max);
    if (n <= 0) continue;
    seen.set(Math.floor(k), Math.max(seen.get(Math.floor(k)) ?? 0, n));
  }
  return Array.from(seen.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([k, v]) => `d${k}:${v}`)
    .join(";");
}

export function encodeCounts(src: Iterable<[number, number] | readonly [number, number]> | Record<string, number>): string {
  return encodePairs(src, COUNT_MAX);
}

/** Per-day stopwatch duration totals (ms), ascending, zero days omitted. */
export function encodeDurations(src: Iterable<[number, number] | readonly [number, number]> | Record<string, number>): string {
  return encodePairs(src, DURATION_MAX);
}

/** Per-day duration totals (ms) parsed from the history payload's `t` field. */
export function decodeDurations(s: string): Map<number, number> {
  const out = new Map<number, number>();
  if (!s) return out;
  for (const token of s.split(";")) {
    const m = DURATION_TOKEN_RE.exec(token.trim());
    if (!m) continue;
    const day = Number(m[1]);
    const ms = Math.min(Number(m[2]), DURATION_MAX);
    if (ms > 0) out.set(day, ms);
  }
  return out;
}

export function encodeHistoryPayload(data: HistoryData): string {
  const t = data.durations && data.durations.size > 0 ? encodeDurations(data.durations) : "";
  return JSON.stringify({ v: 1, todoId: data.todoId, c: encodeCounts(data.counts), ...(t ? { t } : {}) });
}

export function decodeHistoryPayload(json: string): HistoryData | null {
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    if (!o || typeof o !== "object" || o.v !== 1 || typeof o.todoId !== "string" || !o.todoId) return null;
    const counts = decodeCounts(typeof o.c === "string" ? o.c : "");
    const durations = typeof o.t === "string" ? decodeDurations(o.t) : undefined;
    return { todoId: o.todoId, counts, durations };
  } catch {
    return null;
  }
}

// ---------- input syntax ----------
// "~daily" "~weekdays" "~monthly" "~yearly" "~weekly"
// "~every 3d" "~every 2w" "~every 2w mon,thu" "~every 3m" "~every 1y" (spaces optional)

const WDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
// RFC 5545 BYDAY uses two-letter codes
const WDAYS_RFC = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const WDAYS_RE = WDAYS.join("|");
const INPUT_RE = new RegExp(
  `~\\s*(?:(daily|weekly|monthly|yearly|weekdays)|(?:every\\s*(\\d{1,3})\\s*([dwmy])(?:\\s+((?:${WDAYS_RE})(?:\\s*,\\s*(?:${WDAYS_RE}))*))?))\\s*$`,
  "i"
);

const FREQ_BY_UNIT: Record<string, string> = { d: "DAILY", w: "WEEKLY", m: "MONTHLY", y: "YEARLY" };

export type ParsedInput = { title: string; ruleStr: string | null };

/** Extract a trailing "~…" recurrence token from raw input. Returns the stripped title and RRULE (null = no valid suffix). */
export function parseRecurInput(raw: string): ParsedInput {
  const m = INPUT_RE.exec(raw);
  if (!m) return { title: raw, ruleStr: null };
  const parts: string[] = [];
  if (m[1]) {
    if (m[1].toLowerCase() === "weekdays") {
      parts.push("FREQ=WEEKLY", "BYDAY=MO,TU,WE,TH,FR");
    } else {
      parts.push(`FREQ=${m[1].toUpperCase()}`);
    }
  } else if (m[2] && m[3]) {
    const interval = Math.max(1, Math.min(Number(m[2]), 366));
    parts.push(`FREQ=${FREQ_BY_UNIT[m[3].toLowerCase()]}`, `INTERVAL=${interval}`);
    if (m[4]) {
      const days = Array.from(
        new Set(
          m[4]
            .toLowerCase()
            .split(/\s*,\s*/)
            .map((w) => WDAYS.indexOf(w as (typeof WDAYS)[number]))
            .filter((i) => i >= 0)
        )
      ).sort((a, b) => a - b);
      if (days.length) parts.push(`BYDAY=${days.map((i) => WDAYS_RFC[i]).join(",")}`);
    }
  } else {
    return { title: raw, ruleStr: null };
  }
  const title = raw.slice(0, m.index).trim();
  return { title, ruleStr: parts.join(";") };
}

// ---------- mode/count semantics ----------

/** Checked state in check mode: rendered only — storage is always counts. */
export function isChecked(count: number, threshold: number): boolean {
  return count >= threshold;
}

/** New count when the main action button is clicked in the given mode.
 * Time mode: click toggles between 0 and the goal (incremental logging uses the widget's +/- buttons). */
export function nextCountOnClick(mode: CompletionMode, count: number, threshold: number): number {
  if (mode === "count") return Math.min(count + 1, COUNT_MAX);
  return isChecked(count, threshold) ? 0 : threshold;
}
