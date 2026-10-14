// @ts-nocheck — runs under `bun test` (bun:test types not installed)
import { test, expect } from "bun:test";
import { parseNlpDate } from "./nlpDate";

// pinned reference: Wednesday Oct 14 2026 (matches "today is Oct 14 2026")
const NOW = new Date(2026, 9, 14, 12, 0).getTime();
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

test("tmrw highlights and resolves to tomorrow", () => {
  const r = parseNlpDate("make sure email for haven is sent tmrw", NOW);
  expect(r.spans.length).toBe(1);
  expect(r.spans[0].text.toLowerCase()).toBe("tmrw");
  expect(r.dueAt).toBe(day(2026, 10, 15));
  expect(r.cleanTitle).toBe("make sure email for haven is sent");
});

test("tomorrow / today / day after tomorrow", () => {
  expect(parseNlpDate("do it tomorrow", NOW).dueAt).toBe(day(2026, 10, 15));
  expect(parseNlpDate("do it today", NOW).dueAt).toBe(day(2026, 10, 14));
  expect(parseNlpDate("do it day after tomorrow", NOW).dueAt).toBe(day(2026, 10, 16));
});

test("bare weekday = next occurrence on/after today; next = strictly after", () => {
  // Wed Oct 14 → friday is Oct 16
  expect(parseNlpDate("call mom friday", NOW).dueAt).toBe(day(2026, 10, 16));
  // wednesday today → bare "wednesday" is today, "next wednesday" is +7
  expect(parseNlpDate("x wednesday", NOW).dueAt).toBe(day(2026, 10, 14));
  expect(parseNlpDate("x next wednesday", NOW).dueAt).toBe(day(2026, 10, 21));
});

test("this monday vs next week's monday vs stacked next", () => {
  // week of Mon Oct 12 – Sun Oct 18
  expect(parseNlpDate("x this monday", NOW).dueAt).toBe(day(2026, 10, 12));
  expect(parseNlpDate("x next week's monday", NOW).dueAt).toBe(day(2026, 10, 19));
  expect(parseNlpDate("x next next monday", NOW).dueAt).toBe(day(2026, 10, 26));
});

test("in 2 weeks", () => {
  expect(parseNlpDate("x in 2 weeks", NOW).dueAt).toBe(day(2026, 10, 28));
});

test("every monday with till end clause", () => {
  const r = parseNlpDate("standup every monday till in 2 weeks", NOW);
  expect(r.recur).toContain("BYDAY=MO");
  expect(r.recur).toContain("UNTIL=");
  expect(r.spans.length).toBe(1);
  expect(r.spans[0].kind).toBe("recur");
  expect(r.cleanTitle).toBe("standup");
});

test("time suffix extends the span", () => {
  const r = parseNlpDate("call mom friday at 5pm", NOW);
  expect(r.spans[0].text.toLowerCase()).toContain("5pm");
  expect(r.dueTimeMin).toBe(17 * 60);
});

test("month-name dates roll to next year when past", () => {
  const r = parseNlpDate("x aug 14", NOW);
  expect(r.dueAt).toBe(day(2027, 8, 14));
});
