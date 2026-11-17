// AI fallback for recurring tasks phrased in ways the regex parser misses
// ("journal daily", "I want to journal each morning", "meditate every other
// day"). Same split as jevDate: the model only READS the text into a small
// structured answer; code builds the RRULE, so a bad answer can't produce a
// malformed rule.
//
// Provider: Hack Club AI (convex/ai.ts). Tasks are end-to-end encrypted, so the AI only sees input that already
// sounds recurring (looksRecurring) and that the regex parser couldn't read.

export const AI_FREQS = ["none", "daily", "weekly", "monthly", "yearly"] as const;
export const AI_WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

export type AiRecurAnswer = {
  title: string;
  freq: (typeof AI_FREQS)[number];
  interval: number;
  weekdays: (typeof AI_WEEKDAYS)[number][];
};

const CUE_RE =
  /\b(every|each|daily|nightly|weekly|biweekly|fortnightly|monthly|yearly|annually|weekdays|weekends|mornings|evenings|nights|a\s+day|a\s+week|a\s+month|per\s+(day|week|month)|times?\s+a|other\s+day|everyday|routine|habit)\b/i;

/** Cheap gate: only text that sounds recurring is worth an AI call. */
export function looksRecurring(text: string): boolean {
  return CUE_RE.test(text);
}

/** Parse and validate the model's raw reply (the provider doesn't enforce a
 * schema). Tolerates <think> blocks and ```json fences; null on any mismatch. */
export function parseAiRecurAnswer(raw: string): AiRecurAnswer | null {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.title !== "string" || !AI_FREQS.includes(o.freq as AiRecurAnswer["freq"])) return null;
  return {
    title: o.title,
    freq: o.freq as AiRecurAnswer["freq"],
    interval: typeof o.interval === "number" ? o.interval : 1,
    weekdays: Array.isArray(o.weekdays)
      ? o.weekdays.filter((d): d is AiRecurAnswer["weekdays"][number] => AI_WEEKDAYS.includes(d))
      : [],
  };
}

/** Turn the model's answer into {title, RRULE}; null when it heard no recurrence. */
export function assembleAiRecur(a: AiRecurAnswer): { title: string; recur: string } | null {
  const title = a.title.trim();
  if (!title || title.length > 200 || a.freq === "none") return null;
  const interval = Number.isInteger(a.interval) && a.interval >= 1 && a.interval <= 365 ? a.interval : 1;
  const days = [...new Set(a.weekdays.filter((d) => AI_WEEKDAYS.includes(d)))].sort(
    (x, y) => AI_WEEKDAYS.indexOf(x) - AI_WEEKDAYS.indexOf(y)
  );
  const parts = [`FREQ=${a.freq.toUpperCase()}`];
  if (interval > 1) parts.push(`INTERVAL=${interval}`);
  if (a.freq === "weekly" && days.length > 0) parts.push(`BYDAY=${days.join(",")}`);
  return { title, recur: parts.join(";") };
}
