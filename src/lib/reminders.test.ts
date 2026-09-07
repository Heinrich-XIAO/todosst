// @ts-nocheck — runs under `bun test` (bun:test types not installed)
import { test, expect } from "bun:test";
import { DEFAULT_OFFSETS_MIN, remindTimesFor, withReminderDefault } from "./reminders";
import { parseDueInput } from "./due";

test("withReminderDefault enables remind for a due date", () => {
  const out = withReminderDefault({ dueAt: 1757000000000 });
  expect(out.reminder).toEqual({ enabled: true, offsetsMin: DEFAULT_OFFSETS_MIN });
});

test("withReminderDefault enables remind for a recurrence plan", () => {
  const out = withReminderDefault({ recur: "FREQ=DAILY" });
  expect(out.reminder).toEqual({ enabled: true, offsetsMin: DEFAULT_OFFSETS_MIN });
});

test("withReminderDefault leaves plain tasks alone", () => {
  expect(withReminderDefault({})).toEqual({});
  expect(withReminderDefault({ dueAt: null })).toEqual({ dueAt: null });
  expect(withReminderDefault({ priority: "high" })).toEqual({ priority: "high" });
});

test("withReminderDefault respects an existing cfg, including an explicit off", () => {
  const off = { reminder: { enabled: false, offsetsMin: [30] } };
  expect(withReminderDefault({ dueAt: 1, ...off })).toEqual({ dueAt: 1, ...off });
  const on = { reminder: { enabled: true, offsetsMin: [30] } };
  expect(withReminderDefault({ recur: "FREQ=DAILY", ...on })).toEqual({ recur: "FREQ=DAILY", ...on });
});

test("remindTimesFor counts offsets from the due time when one is set", () => {
  const dueAt = parseDueInput("2026-09-15");
  const at = dueAt + 9 * 60 * 60_000;
  const meta = { dueAt, dueTimeMin: 9 * 60, reminder: { enabled: true, offsetsMin: [15, 5] } };
  expect(remindTimesFor(meta, false, 0)).toEqual([at - 15 * 60_000, at - 5 * 60_000]);
});

test("remindTimesFor without a time keeps the midnight (evening-before) semantics", () => {
  const dueAt = parseDueInput("2026-09-15");
  const meta = { dueAt, reminder: { enabled: true, offsetsMin: [15] } };
  expect(remindTimesFor(meta, false, 0)).toEqual([dueAt - 15 * 60_000]);
});
