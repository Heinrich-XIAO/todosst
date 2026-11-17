// @ts-nocheck — runs under `bun test` (bun:test types not installed)
import { test, expect } from "bun:test";
import { assembleAiRecur, looksRecurring } from "./aiRecur";

test("looksRecurring gates on recurrence cues only", () => {
  for (const s of ["journal daily", "I want to journal each day", "journal every morning", "meditate every other day", "run 3 times a week", "stretch everyday"])
    expect(looksRecurring(s)).toBe(true);
  for (const s of ["buy coffee beans", "call mom tomorrow", "write the report"])
    expect(looksRecurring(s)).toBe(false);
});

test("assembleAiRecur builds RRULEs in code", () => {
  expect(assembleAiRecur({ title: "journal", freq: "daily", interval: 1, weekdays: [] })).toEqual({ title: "journal", recur: "FREQ=DAILY" });
  expect(assembleAiRecur({ title: "meditate", freq: "daily", interval: 2, weekdays: [] })?.recur).toBe("FREQ=DAILY;INTERVAL=2");
  expect(assembleAiRecur({ title: "gym", freq: "weekly", interval: 1, weekdays: ["TH", "MO", "MO"] })?.recur).toBe("FREQ=WEEKLY;BYDAY=MO,TH");
  // weekdays only make sense on weekly rules; junk interval falls back to 1
  expect(assembleAiRecur({ title: "rent", freq: "monthly", interval: 0, weekdays: ["MO"] })?.recur).toBe("FREQ=MONTHLY");
});

test("assembleAiRecur rejects no-recurrence and empty titles", () => {
  expect(assembleAiRecur({ title: "journal", freq: "none", interval: 1, weekdays: [] })).toBeNull();
  expect(assembleAiRecur({ title: "  ", freq: "daily", interval: 1, weekdays: [] })).toBeNull();
});
