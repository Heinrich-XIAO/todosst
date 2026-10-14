"use client";

// Shared bench dataset + runner for normal-code vs Jev. Reference date is
// pinned (Wed Oct 14 2026) so labels are stable; the lab page re-pins TODAY to
// whatever "now" the collector is working from.

export type BenchCase = {
  id: string;
  text: string;
  /** expected local-midnight date, [y, m, d] */
  expectYmd?: [number, number, number];
  expectRecurContains?: string;
  family: string;
};

export const BENCH_NOW = new Date(2026, 9, 14, 12, 0).getTime();

export function ymdToTs([y, m, d]: [number, number, number]): number {
  return new Date(y, m - 1, d).getTime();
}

export const SEED_CASES: BenchCase[] = [
  { id: "tmrw", text: "make sure email for haven is sent tmrw", expectYmd: [2026, 10, 15], family: "relative" },
  { id: "tomorrow", text: "send the invoice tomorrow", expectYmd: [2026, 10, 15], family: "relative" },
  { id: "today", text: "buy coffee beans today", expectYmd: [2026, 10, 14], family: "relative" },
  { id: "tonight", text: "take out trash tonight", expectYmd: [2026, 10, 14], family: "relative" },
  { id: "day-after", text: "follow up day after tomorrow", expectYmd: [2026, 10, 16], family: "relative" },
  { id: "bare-fri", text: "call mom friday", expectYmd: [2026, 10, 16], family: "weekday" },
  { id: "bare-mon", text: "deploy monday", expectYmd: [2026, 10, 19], family: "weekday" },
  { id: "this-mon", text: "review notes this monday", expectYmd: [2026, 10, 12], family: "weekday-this-next" },
  { id: "next-mon", text: "plan sprint next monday", expectYmd: [2026, 10, 19], family: "weekday-this-next" },
  { id: "next-weeks-mon", text: "book dentist next week's monday", expectYmd: [2026, 10, 19], family: "weekday-this-next" },
  { id: "next-next-mon", text: "visit gran next next monday", expectYmd: [2026, 10, 26], family: "weekday-this-next" },
  { id: "this-fri", text: "ship demo this friday", expectYmd: [2026, 10, 16], family: "weekday-this-next" },
  { id: "next-fri", text: "ship demo next friday", expectYmd: [2026, 10, 16], family: "weekday-this-next" },
  { id: "in-2w", text: "renew cert in 2 weeks", expectYmd: [2026, 10, 28], family: "in-n" },
  { id: "in-3d", text: "water plants in 3 days", expectYmd: [2026, 10, 17], family: "in-n" },
  { id: "aug14", text: "fly home august 14", expectYmd: [2027, 8, 14], family: "absolute" },
  { id: "oct20", text: "dentist oct 20", expectYmd: [2026, 10, 20], family: "absolute" },
  { id: "fri-5pm", text: "call mom friday at 5pm", expectYmd: [2026, 10, 16], family: "with-time" },
  { id: "every-mon", text: "standup every monday", expectRecurContains: "BYDAY=MO", family: "recur" },
  { id: "every-mon-till", text: "standup every monday till in 2 weeks", expectRecurContains: "UNTIL=", family: "recur-till" },
  { id: "every-day", text: "stretch every day", expectRecurContains: "FREQ=DAILY", family: "recur" },
  { id: "every-2w", text: "gym every 2w mon,thu", expectRecurContains: "INTERVAL=2", family: "recur" },
  { id: "no-date", text: "buy coffee beans", family: "none" },
  { id: "habit", text: "no doomscrolling", family: "none" },
];

export type BenchRow = {
  id: string;
  text: string;
  family: string;
  expected: string;
  normalGot: string;
  normalOk: boolean;
  normalMs: number;
  jevGot: string;
  jevOk: boolean;
  jevMs: number;
};

export function runBench(
  cases: BenchCase[],
  parseNormal: (text: string, now: number) => { dueAt: number | null; recur: string | null },
  parseJev: (text: string) => { date: number | null; needsReview: boolean },
): BenchRow[] {
  return cases.map((c) => {
    const t0 = performance.now();
    const n = parseNormal(c.text, BENCH_NOW);
    const normalMs = performance.now() - t0;
    const t1 = performance.now();
    const j = parseJev(c.text);
    const jevMs = performance.now() - t1;
    const expected = c.expectYmd ? new Date(ymdToTs(c.expectYmd)).toLocaleDateString() : (c.expectRecurContains ?? "no date");
    const normalGot = n.recur ?? (n.dueAt !== null ? new Date(n.dueAt).toLocaleDateString() : "no date");
    const jevGot = j.date !== null ? new Date(j.date).toLocaleDateString() + (j.needsReview ? " (review)" : "") : "no date";
    const normalOk = c.expectYmd
      ? n.dueAt === ymdToTs(c.expectYmd)
      : c.expectRecurContains
        ? (n.recur ?? "").includes(c.expectRecurContains)
        : n.dueAt === null && n.recur === null;
    const jevOk = c.expectYmd
      ? j.date === ymdToTs(c.expectYmd)
      : c.expectRecurContains
        ? false // Jev fixture covers single dates only — recurrence is normal-code territory
        : j.date === null;
    return { id: c.id, text: c.text, family: c.family, expected, normalGot, jevGot, normalOk, jevOk, normalMs, jevMs };
  });
}

/** Variant generator for the data-collection loop: template → many phrasings. */
export function suggestVariants(template: string): string[] {
  const out = new Set<string>();
  const t = template.trim();
  if (!t) return [];
  out.add(t);
  const swaps: [RegExp, string[]][] = [
    [/\btomorrow\b/gi, ["tmrw", "tmr", "2moro"]],
    [/\btmrw\b/gi, ["tomorrow", "tmr"]],
    [/\bmonday\b/gi, ["mon", "Monday"]],
    [/\bnext week's monday\b/gi, ["next week monday", "monday next week", "next monday"]],
    [/\btill\b/gi, ["until", "through", "til"]],
    [/\bin 2 weeks\b/gi, ["in two weeks", "in 14 days", "2 weeks from now"]],
    [/\bevery monday\b/gi, ["each monday", "every mon", "every Monday"]],
  ];
  for (const [re, alts] of swaps) {
    if (re.test(t)) {
      for (const a of alts) out.add(t.replace(re, a));
      re.lastIndex = 0;
    }
  }
  // prefix/suffix task wrappers so collectors bank full utterances, not fragments
  const wraps = ["please ", "remind me to ", "don't forget to "];
  const heads = [...out];
  for (const h of heads) for (const w of wraps) out.add(w + h);
  return [...out].slice(0, 24);
}
