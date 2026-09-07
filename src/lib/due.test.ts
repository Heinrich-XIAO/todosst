// @ts-nocheck — runs under `bun test` (bun:test types not installed)
import { test, expect } from "bun:test";
import {
  defaultDueTimeMin,
  dueInstant,
  formatDueInput,
  formatTimeInput,
  normalizeDueAt,
  parseDueInput,
  parseTimeInput,
} from "./due";

test("parseDueInput yields local midnight of the picked day", () => {
  const ts = parseDueInput("2026-09-15");
  const d = new Date(ts);
  expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 15]);
  expect(d.getHours()).toBe(0);
});

test("parseDueInput rejects malformed and rolled-over dates", () => {
  expect(parseDueInput("")).toBe(null);
  expect(parseDueInput("not-a-date")).toBe(null);
  expect(parseDueInput("2026-2-15")).toBe(null);
  expect(parseDueInput("2026-02-30")).toBe(null);
});

test("formatDueInput shows the local calendar date, not the UTC one", () => {
  // 11pm local on Sep 15 — a UTC-based formatter rolls to Sep 16 west of UTC
  const ts = new Date(2026, 8, 15, 23).getTime();
  expect(formatDueInput(ts)).toBe("2026-09-15");
});

test("formatDueInput and parseDueInput round trip", () => {
  const ts = new Date(2026, 8, 15, 23).getTime();
  const back = new Date(parseDueInput(formatDueInput(ts)));
  expect([back.getFullYear(), back.getMonth(), back.getDate()]).toEqual([2026, 8, 15]);
  expect(back.getHours()).toBe(0);
});

test("normalizeDueAt migrates legacy UTC-midnight rows to the same intended date", () => {
  // what the old picker stored for a Sep 15 pick: exact UTC midnight
  const legacy = Date.UTC(2026, 8, 15);
  const fixed = new Date(normalizeDueAt(legacy));
  expect([fixed.getFullYear(), fixed.getMonth(), fixed.getDate()]).toEqual([2026, 8, 15]);
  expect(fixed.getHours()).toBe(0);
});

test("normalizeDueAt is idempotent and passes through other values", () => {
  const fixed = normalizeDueAt(Date.UTC(2026, 8, 15));
  expect(normalizeDueAt(fixed)).toBe(fixed);
  // already-local midnights and arbitrary timestamps are never exact UTC
  // midnights (outside UTC), so they pass through untouched
  const arbitrary = new Date(2026, 8, 15, 12, 34).getTime();
  expect(normalizeDueAt(arbitrary)).toBe(arbitrary);
});

test("parseTimeInput reads minutes since midnight and rejects junk", () => {
  expect(parseTimeInput("00:00")).toBe(0);
  expect(parseTimeInput("09:05")).toBe(545);
  expect(parseTimeInput("23:59")).toBe(1439);
  expect(parseTimeInput("24:00")).toBe(null);
  expect(parseTimeInput("9:05")).toBe(null);
  expect(parseTimeInput("")).toBe(null);
  expect(parseTimeInput("not-a-time")).toBe(null);
});

test("formatTimeInput and parseTimeInput round trip", () => {
  for (const min of [0, 1, 545, 1439]) expect(parseTimeInput(formatTimeInput(min))).toBe(min);
});

test("defaultDueTimeMin rounds up to the next full local hour", () => {
  expect(defaultDueTimeMin(new Date(2026, 8, 6, 14, 23).getTime())).toBe(15 * 60);
  // exactly on the hour — the next hour is strictly after now
  expect(defaultDueTimeMin(new Date(2026, 8, 6, 14, 0, 0, 0).getTime())).toBe(15 * 60);
  // rounding across midnight lands on 00:00
  expect(defaultDueTimeMin(new Date(2026, 8, 6, 23, 30).getTime())).toBe(0);
});

test("dueInstant adds the time of day to the due day, midnight when unset", () => {
  const dueAt = parseDueInput("2026-09-15");
  expect(dueInstant(dueAt)).toBe(dueAt);
  expect(dueInstant(dueAt, undefined)).toBe(dueAt);
  expect(dueInstant(dueAt, 0)).toBe(dueAt);
  expect(dueInstant(dueAt, 9 * 60)).toBe(dueAt + 9 * 60 * 60_000);
  // legacy UTC-midnight rows normalize to local midnight before the time is
  // added — TZ-independent because both sides use the same local calendar day
  expect(dueInstant(Date.UTC(2026, 8, 15), 60)).toBe(parseDueInput("2026-09-15") + 60 * 60_000);
});
