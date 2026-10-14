"use client";

// Handwritten Todoist-style natural-language date parser (approach A in the
// normal-code-vs-Jev bench). Dependency-free, deterministic, span-preserving:
// every match returns [start, end) into the ORIGINAL string so the entry bar
// can highlight exactly what it understood ("tmrw" in "send it tmrw").
//
// Convention (documented because weekday words are genuinely ambiguous — the
// /lab/dates page collects labels to pin this down later):
// - bare weekday ("monday") = next occurrence on or after today
// - "this <day>" = that day in the current Mon-Sun week (may be past)
// - "next <day>" = next occurrence strictly after today
// - "next week's <day>" / "next week <day>" = that day in next week
// - stacked "next next <day>" / "week after next <day>" = +2 weeks
// - "every <day> [till <date>]" = RRULE + span; end clause is part of the span
//
// Times ("at 5pm", "17:00") extend the date span and set dueTimeMin.

import { DAY_MS, dayIndexLocal, dayIndexToStart } from "./recur";

export type NlpKind = "date" | "recur" | "time";

export type NlpSpan = {
  start: number;
  end: number;
  text: string;
  kind: NlpKind;
};

export type NlpResult = {
  spans: NlpSpan[];
  /** local-midnight timestamp of the resolved due day (null when none/recurring-only) */
  dueAt: number | null;
  /** minutes since local midnight when a time-of-day was heard */
  dueTimeMin: number | null;
  /** RRULE string when recurrence was heard (every monday …) */
  recur: string | null;
  /** input with all spans stripped (what becomes the task title) */
  cleanTitle: string;
};

const WD = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const WD_SHORT: Record<string, number> = {
  mon: 0, tue: 1, tues: 1, wed: 2, thu: 3, thur: 3, thurs: 3, fri: 4, sat: 5, sun: 6,
};
const MONTHS: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
  may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7, september: 8,
  sept: 8, sep: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
};
const RFC_BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

function wdIndex(word: string): number {
  const w = word.toLowerCase();
  const full = WD.indexOf(w as (typeof WD)[number]);
  if (full >= 0) return full;
  return WD_SHORT[w] ?? -1;
}

function mondayOfWeek(ts: number): number {
  const d = new Date(ts);
  const dowMon0 = (d.getDay() + 6) % 7;
  return dayIndexToStart(dayIndexLocal(ts) - dowMon0);
}

function addDays(ts: number, n: number): number {
  return dayIndexToStart(dayIndexLocal(ts) + n);
}

/** Parse "5pm", "5:30 pm", "17:00", "at noon" → minutes since midnight. */
export function parseTimeOfDay(s: string): number | null {
  const t = s.trim().toLowerCase().replace(/^at\s+/, "");
  if (/\bnoon\b/.test(t)) return 12 * 60;
  if (/\bmidnight\b/.test(t)) return 0;
  const m = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3];
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === "pm" && h !== 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
  } else {
    if (h > 23) return null;
    // bare "at 5" with no am/pm: assume ambiguous — only accept with "at"/":" context
    if (!/:/.test(t) && !/\bat\b/.test(`at ${s}`)) return null;
  }
  return h * 60 + min;
}

type Cand = { start: number; end: number; kind: NlpKind; dueAt: number | null; recur: string | null; timeMin: number | null };

export function parseNlpDate(input: string, now: number = Date.now()): NlpResult {
  const cands: Cand[] = [];
  const push = (c: Cand) => {
    if (c.end > c.start) cands.push(c);
  };
  const lower = input.toLowerCase();

  // ---- explicit time suffix detection happens per-date below (extends span) ----

  // 1. relative day words: today / tonight / tomorrow / tmrw / day after tomorrow
  const relWords: [RegExp, (n: number) => number][] = [
    [/\bday\s+after\s+tomorrow\b/gi, (n) => addDays(n, 2)],
    [/\btomorrow\b/gi, (n) => addDays(n, 1)],
    [/\btmrw\b/gi, (n) => addDays(n, 1)],
    [/\btmr\b/gi, (n) => addDays(n, 1)],
    [/\b2moro\b/gi, (n) => addDays(n, 1)],
    [/\btoday\b/gi, (n) => dayIndexToStart(dayIndexLocal(n))],
    [/\btonight\b/gi, (n) => dayIndexToStart(dayIndexLocal(n))],
  ];
  for (const [re, fn] of relWords) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(input))) {
      let end = m.index + m[0].length;
      const t = tryTimeSuffix(input, end);
      push({ start: m.index, end: t?.end ?? end, kind: "date", dueAt: fn(now), recur: null, timeMin: t?.min ?? (/\btonight\b/i.test(m[0]) ? 19 * 60 : null) });
    }
  }

  // 2. "in N days/weeks/months" + "N days from now"
  const inRe = /\bin\s+(\d{1,3})\s*(days?|weeks?|months?|years?|d|w|m|y)\b(?:\s+from\s+now)?/gi;
  {
    let m: RegExpExecArray | null;
    while ((m = inRe.exec(input))) {
      const n = Number(m[1]);
      const u = m[2].toLowerCase()[0];
      const d = new Date(now);
      if (u === "d") push({ start: m.index, end: m.index + m[0].length, kind: "date", dueAt: addDays(now, n), recur: null, timeMin: null });
      else {
        const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        if (u === "w") dd.setDate(dd.getDate() + n * 7);
        else if (u === "m") dd.setMonth(dd.getMonth() + n);
        else dd.setFullYear(dd.getFullYear() + n);
        push({ start: m.index, end: m.index + m[0].length, kind: "date", dueAt: dd.getTime(), recur: null, timeMin: null });
      }
    }
  }

  // 3. weekday forms: [this|next [week['s]] |<stacked next> ] <weekday>, "week after next <day>", "this coming <day>"
  const wdAlt = [...WD, ...Object.keys(WD_SHORT)].join("|");
  const wdRe = new RegExp(
    `(?:\\b(this|next|last)(?:\\s+week'?s?)?\\b\\s*)?(?:\\b(next)\\b\\s+)?(?:\\b(week\\s+after\\s+next|this\\s+coming)\\b\\s*)?\\b(${wdAlt})\\b`,
    "gi"
  );
  {
    let m: RegExpExecArray | null;
    while ((m = wdRe.exec(input))) {
      const hasPrefix = !!(m[1] || m[2] || m[3]);
      const wd = wdIndex(m[4]);
      if (wd < 0) continue;
      // bare weekday without any qualifier: only claim it when it looks like a
      // date mention, not a habit ("every monday" is handled by the recur pass).
      if (!hasPrefix) {
        const before = input.slice(Math.max(0, m.index - 6), m.index).toLowerCase();
        if (/\bevery\s*$/.test(before) || /\bon\s*$/.test(before) === false) {
          // still claim bare weekdays — Todoist does — but skip when preceded
          // by "every" (that's recurrence, claimed below with a longer span)
          if (/\bevery\s*$/.test(before)) continue;
        }
      }
      const q = (m[1] ?? "").toLowerCase();
      const stacked = !!m[2];
      const extra = (m[3] ?? "").toLowerCase();
      // guard: "last" is past — skip (we only schedule today+forward)
      if (q === "last") continue;
      let due: number;
      const monday = mondayOfWeek(now);
      if (extra.startsWith("week after")) due = monday + 7 * DAY_MS + wd * DAY_MS;
      else if (extra.startsWith("this coming")) due = addDays(now, ((wd - ((new Date(now).getDay() + 6) % 7) + 7) % 7) || 7);
      else if (stacked || (q === "next" && /next\s+week/.test(m[0].toLowerCase()))) {
        // "next next monday" or "next week's monday" → +2nd week / next week
        due = stacked ? monday + 14 * DAY_MS + wd * DAY_MS : monday + 7 * DAY_MS + wd * DAY_MS;
      } else if (q === "this") due = monday + wd * DAY_MS;
      else if (q === "next") {
        const delta = (((wd - ((new Date(now).getDay() + 6) % 7) + 7) % 7) || 7);
        due = addDays(now, delta);
      } else {
        // bare: next occurrence on or after today
        const delta = (wd - ((new Date(now).getDay() + 6) % 7) + 7) % 7;
        due = addDays(now, delta);
      }
      let end = m.index + m[0].length;
      const t = tryTimeSuffix(input, end);
      if (t) end = t.end;
      push({ start: m.index, end, kind: "date", dueAt: due, recur: null, timeMin: t?.min ?? null });
      void lower;
    }
  }

  // 4. month-name dates: "aug 14", "august 14th", "14 aug", "… 2027"
  const monAlt = Object.keys(MONTHS).join("|");
  const mdRe = new RegExp(`\\b(${monAlt})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\b`, "gi");
  {
    let m: RegExpExecArray | null;
    while ((m = mdRe.exec(input))) {
      const mi = MONTHS[m[1].toLowerCase()];
      const day = Number(m[2]);
      if (day < 1 || day > 31) continue;
      const year = m[3] ? Number(m[3]) : undefined;
      const nowD = new Date(now);
      let y = year ?? nowD.getFullYear();
      let ts = new Date(y, mi, day).getTime();
      const probe = new Date(ts);
      if (probe.getMonth() !== mi || probe.getDate() !== day) continue; // feb 30
      if (!year && ts < dayIndexToStart(dayIndexLocal(now))) {
        ts = new Date(y + 1, mi, day).getTime(); // roll to next year
      }
      let end = m.index + m[0].length;
      const t = tryTimeSuffix(input, end);
      if (t) end = t.end;
      push({ start: m.index, end, kind: "date", dueAt: ts, recur: null, timeMin: t?.min ?? null });
    }
  }

  // 5. recurrence: "every monday", "every day", "daily", "every 2 weeks [mon,thu]", optional "till/until/for …"
  const everyRe = new RegExp(
    `\\bevery\\s+(?:(\\d{1,3})\\s*(d|w|m|y)\\b|(day|week|month|year|weekday)s?\\b|((?:${wdAlt})(?:\\s*,\\s*(?:${wdAlt}))*)\\b)\\s*((?:till|until|through|for)\\s+[^,.;!?]+)?`,
    "gi"
  );
  {
    let m: RegExpExecArray | null;
    while ((m = everyRe.exec(input))) {
      let rule = "";
      if (m[2]) {
        const iv = Math.max(1, Math.min(Number(m[1]), 366));
        rule = `FREQ=${{ d: "DAILY", w: "WEEKLY", m: "MONTHLY", y: "YEARLY" }[m[2].toLowerCase()]};INTERVAL=${iv}`;
      } else if (m[3]) {
        const k = m[3].toLowerCase();
        rule = k === "weekday" ? "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" : `FREQ=${k === "day" ? "DAILY" : k === "week" ? "WEEKLY" : k === "month" ? "MONTHLY" : "YEARLY"}`;
      } else if (m[4]) {
        const days = Array.from(new Set(m[4].split(/\s*,\s*/).map(wdIndex).filter((i) => i >= 0))).sort((a, b) => a - b);
        if (!days.length) continue;
        rule = days.length === 1
          ? `FREQ=WEEKLY;BYDAY=${RFC_BYDAY[days[0]]}`
          : `FREQ=WEEKLY;BYDAY=${days.map((i) => RFC_BYDAY[i]).join(",")}`;
      }
      // end clause → RRULE COUNT/UNTIL is resolved by the caller; here we just
      // extend the span and stash the raw end text on the rule for now
      const endClause = (m[5] ?? "").trim();
      if (endClause) {
        const untilTs = resolveEndClause(endClause, now);
        if (untilTs !== null) {
          const d = new Date(untilTs);
          const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}T000000`;
          rule += `;UNTIL=${ymd}`;
        }
      }
      push({ start: m.index, end: m.index + m[0].length, kind: "recur", dueAt: null, recur: rule || null, timeMin: null });
    }
  }

  // ---- resolve overlaps: longest span wins, earlier start breaks ties ----
  cands.sort((a, b) => a.start - b.start || b.end - a.end);
  const spans: NlpSpan[] = [];
  let cursor = -1;
  let dueAt: number | null = null;
  let dueTimeMin: number | null = null;
  let recur: string | null = null;
  for (const c of cands) {
    if (c.start < cursor) continue; // overlapped by a longer earlier match
    cursor = c.end;
    spans.push({ start: c.start, end: c.end, text: input.slice(c.start, c.end), kind: c.kind });
    if (c.kind === "date" && dueAt === null && c.dueAt !== null) {
      dueAt = c.dueAt;
      if (c.timeMin !== null) dueTimeMin = c.timeMin;
    }
    if (c.kind === "recur" && recur === null && c.recur) recur = c.recur;
  }
  spans.sort((a, b) => a.start - b.start);

  // cleanTitle: strip spans, collapse whitespace
  let clean = "";
  let pos = 0;
  for (const s of spans) {
    clean += input.slice(pos, s.start);
    pos = s.end;
  }
  clean += input.slice(pos);
  clean = clean.replace(/\s{2,}/g, " ").replace(/\s+[,.!?;]+/g, "").trim();

  return { spans, dueAt, dueTimeMin, recur, cleanTitle: clean };
}

/** Extend a date match with a trailing "at 5pm" / "5:30pm" / "17:00" time. */
function tryTimeSuffix(input: string, end: number): { end: number; min: number } | null {
  const tail = input.slice(end, end + 16);
  const m = /^\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\d{1,2}:\d{2}\b|noon\b|midnight\b)/i.exec(tail);
  if (!m) return null;
  const min = parseTimeOfDay(m[1]);
  if (min === null) return null;
  return { end: end + m[0].length, min };
}

/** Resolve "in 2 weeks" / "next friday" / "aug 14" inside an every-…-till clause. */
function resolveEndClause(clause: string, now: number): number | null {
  // reuse the date half of this same parser on the clause text
  const inner = parseNlpDate(clause.replace(/^(till|until|through|for)\s+/i, ""), now);
  if (inner.dueAt !== null) return inner.dueAt;
  const forM = /for\s+(\d{1,3})\s*(days?|weeks?|months?)/i.exec(clause);
  if (forM) {
    const n = Number(forM[1]);
    const u = forM[2][0].toLowerCase();
    if (u === "d") return addDays(now, n);
    const d = new Date(now);
    const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (u === "w") dd.setDate(dd.getDate() + n * 7);
    else dd.setMonth(dd.getMonth() + n);
    return dd.getTime();
  }
  return null;
}

/** Human summary for the lab/bench UI, e.g. "tomorrow (Oct 15) + weekly MO". */
export function describeNlp(r: NlpResult): string {
  const bits: string[] = [];
  if (r.dueAt !== null) {
    bits.push(new Date(r.dueAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }));
    if (r.dueTimeMin !== null) bits.push(`${Math.floor(r.dueTimeMin / 60)}:${String(r.dueTimeMin % 60).padStart(2, "0")}`);
  }
  if (r.recur) bits.push(r.recur);
  return bits.join(" · ") || "no date heard";
}
