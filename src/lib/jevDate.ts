"use client";

// Approach B in the normal-code-vs-Jev bench: Jev (TypeSafe) structured
// extraction. The split of labour is the whole point — the model only READS
// what the text says (Choice answers, no calendar math); code resolves the
// answers into a date against a pinned TODAY. That keeps "next Thursday"
// consistent and testable.
//
// - fixture mode (default, no key needed): a tiny regex stand-in plays the
//   model so the bench + lab page run fully offline. It answers the same
//   seven Choice questions with confidences; assemble() is identical.
// - live mode: POSTs the seven questions to the TypeSafe API when
//   NEXT_PUBLIC_TYPESAFE_API_KEY is set. Never throws — null on any failure.

import { DAY_MS } from "./recur";

export const JEV_QUESTIONS = [
  "mode", "month", "day", "year", "day_anchor", "weekday", "week_offset",
] as const;

export type JevChoice = { choice: string; confidence: number };
export type JevParts = Record<(typeof JEV_QUESTIONS)[number], JevChoice>;

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const WEEKDAYS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

export const REVIEW_BELOW = 0.6;

export type JevResolved =
  | { date: number | null; confidence: number | null; needsReview: boolean; note: string };

export function resolveWeekday(today: Date, weekday: string, offset: string): Date {
  const w = WEEKDAYS.indexOf(weekday);
  const thisMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  if (offset === "next") return new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() + 7 + w);
  if (offset === "current") return new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() + w);
  const delta = (w - ((today.getDay() + 6) % 7) + 7) % 7;
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + delta);
}

/** Code half of the pipeline: turn the model's Choice answers into a date. */
export function assembleJev(parts: JevParts, today: Date = new Date()): JevResolved {
  const mode = parts.mode.choice;
  const confs: (number | null)[] = [parts.mode.confidence];
  const result = (date: number | null, note: string): JevResolved => {
    const usable = confs.filter((c): c is number => typeof c === "number");
    const confidence = usable.length ? Math.min(...usable) : null;
    return { date, confidence, needsReview: date === null || confidence === null || confidence < REVIEW_BELOW, note };
  };
  if (mode === "none") return result(null, "no such date stated");
  if (mode === "absolute") {
    const { choice: month } = parts.month;
    const { choice: day } = parts.day;
    const { choice: year } = parts.year;
    confs.push(parts.month.confidence, parts.day.confidence, parts.year.confidence);
    if (month === "none" || day === "none" || !/^\d+$/.test(day) || !MONTHS.includes(month))
      return result(null, "absolute date incomplete");
    if (year === "out_of_range") return result(null, "year outside window");
    if (year === "none") {
      const d = new Date(today.getFullYear(), MONTHS.indexOf(month), Number(day));
      if (d.getMonth() !== MONTHS.indexOf(month)) return result(null, `impossible date: ${month} ${day}`);
      if (d.getTime() < today.getTime() - 31 * DAY_MS) d.setFullYear(d.getFullYear() + 1);
      return result(dayStart(d), "");
    }
    const d = new Date(Number(year), MONTHS.indexOf(month), Number(day));
    if (d.getMonth() !== MONTHS.indexOf(month)) return result(null, `impossible date`);
    return result(dayStart(d), "");
  }
  if (mode === "relative") {
    const anchor = parts.day_anchor.choice;
    confs.push(parts.day_anchor.confidence);
    if (anchor === "today") return result(dayStart(today), "");
    if (anchor === "tomorrow") return result(dayStart(today) + DAY_MS, "");
    if (anchor === "day_after") return result(dayStart(today) + 2 * DAY_MS, "");
    if (anchor === "weekday") {
      const { choice: weekday } = parts.weekday;
      const { choice: offset } = parts.week_offset;
      confs.push(parts.weekday.confidence, parts.week_offset.confidence);
      if (!WEEKDAYS.includes(weekday)) return result(null, "relative weekday not read");
      return result(dayStart(resolveWeekday(today, weekday, offset)), "");
    }
    return result(null, "relative day not read");
  }
  return result(null, `unrecognized mode: ${mode}`);
}

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Fixture "model": regex stand-in answering the same seven questions. Used for
 * the offline bench and the lab page's synthetic-data loop — swap in the live
 * call without changing assemble().
 */
export function fixtureAsk(text: string): JevParts {
  const t = text.toLowerCase();
  const c = (choice: string, confidence: number): JevChoice => ({ choice, confidence });
  const none: JevParts = {
    mode: c("none", 0.95), month: c("none", 0.9), day: c("none", 0.9),
    year: c("none", 0.9), day_anchor: c("none", 0.9), weekday: c("none", 0.9),
    week_offset: c("none", 0.9),
  };
  const monMatch = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})/.exec(t);
  if (monMatch) {
    const full = { jan: "january", feb: "february", mar: "march", apr: "april", jun: "june", jul: "july", aug: "august", sep: "september", sept: "september", oct: "october", nov: "november", dec: "december" } as Record<string, string>;
    const month = full[monMatch[1]] ?? monMatch[1];
    const y = /(\d{4})/.exec(t)?.[1] ?? "none";
    return { ...none, mode: c("absolute", 0.9), month: c(month, 0.88), day: c(String(Number(monMatch[2])), 0.88), year: c(y, y === "none" ? 0.8 : 0.9) };
  }
  if (/\bday\s+after\s+tomorrow\b/.test(t)) return { ...none, mode: c("relative", 0.9), day_anchor: c("day_after", 0.88) };
  if (/\btomorrow\b|\btmrw?\b|\b2moro\b/.test(t)) return { ...none, mode: c("relative", 0.92), day_anchor: c("tomorrow", 0.9) };
  if (/\btonight\b|\btoday\b/.test(t)) return { ...none, mode: c("relative", 0.9), day_anchor: c("today", 0.88) };
  const wd = WEEKDAYS.find((w) => new RegExp(`\\b${w}\\b|\\b${w.slice(0, 3)}\\b`).test(t));
  if (wd) {
    const offset = /next\s+week|next\s+thursday|next\s+\w+day/.test(t) && !/\bthis\b/.test(t) ? "next" : /\bthis\b/.test(t) ? "current" : "none";
    return { ...none, mode: c("relative", 0.82), day_anchor: c("weekday", 0.8), weekday: c(wd, 0.85), week_offset: c(offset, 0.7) };
  }
  if (/\bin\s+\d+\s*(day|week|month)/.test(t)) return { ...none, mode: c("relative", 0.55), day_anchor: c("none", 0.5) };
  return none;
}

/** Full offline pipeline: fixture model → code resolution. */
export function jevFixture(text: string, today: Date = new Date()): JevResolved {
  return assembleJev(fixtureAsk(text), today);
}

/**
 * Live pipeline: asks the TypeSafe API for the seven Choices, then assembles
 * in code. Returns null when unconfigured or on any failure (callers fall
 * back to normal code — never surface errors).
 */
export async function jevLive(text: string, today: Date = new Date()): Promise<JevResolved | null> {
  const key = process.env.NEXT_PUBLIC_TYPESAFE_API_KEY;
  if (!key || typeof fetch === "undefined") return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    const res = await fetch("https://api.typesafe.ai/v1/ask", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ text, questions: [...JEV_QUESTIONS], reference_date: today.toISOString().slice(0, 10) }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const answers = (await res.json()) as JevParts;
    for (const q of JEV_QUESTIONS) {
      if (!answers[q] || typeof answers[q].choice !== "string") return null;
    }
    return assembleJev(answers, today);
  } catch {
    return null;
  }
}
