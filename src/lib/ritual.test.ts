// @ts-nocheck — runs under `bun test` (bun:test types not installed)
import { test, expect, beforeEach } from "bun:test";
import { dayIndexLocal } from "./recur";
import {
  emptyRitual,
  loadRitual,
  openRitual,
  missedDays,
  taskMissedDays,
  recordClearDay,
  dismissHabitOffer,
  missCopy,
} from "./ritual";

// ritual.ts only touches localStorage — install an in-memory shim per test
let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => void mem.set(k, String(v)),
      removeItem: (k) => void mem.delete(k),
      clear: () => void mem.clear(),
      key: (i) => Array.from(mem.keys())[i] ?? null,
      get length() {
        return mem.size;
      },
    },
    configurable: true,
    writable: true,
  });
});

const day = (y, m, d) => dayIndexLocal(new Date(y, m, d, 12).getTime());

test("missCopy escalates from the second consecutive miss", () => {
  expect(missCopy(0)).toBeNull();
  expect(missCopy(1)).toBeNull();
  expect(missCopy(2)).toBe("missed twice — today is the one that matters");
  expect(missCopy(3)).toBe("missed 3 days — today is the one that matters");
  expect(missCopy(10)).toBe("missed 10 days — today is the one that matters");
});

test("missedDays counts full days after the last clear, clamped at zero", () => {
  const d6 = day(2026, 8, 6);
  expect(missedDays(d6, { firstDay: null, lastClearDay: null })).toBe(0);
  // cleared today -> no misses
  expect(missedDays(d6, { firstDay: null, lastClearDay: d6 })).toBe(0);
  // cleared yesterday -> miss streak not started
  expect(missedDays(d6, { firstDay: null, lastClearDay: d6 - 1 })).toBe(0);
  // cleared two days ago -> one miss (free)
  expect(missedDays(d6, { firstDay: null, lastClearDay: d6 - 2 })).toBe(1);
  // cleared three days ago -> two misses (pair, escalate)
  expect(missedDays(d6, { firstDay: null, lastClearDay: d6 - 3 })).toBe(2);
  // future lastClearDay (clock rolled back) -> clamp
  expect(missedDays(d6, { firstDay: null, lastClearDay: d6 + 2 })).toBe(0);
});

test("missedDays anchors on firstDay until the first clear", () => {
  const d6 = day(2026, 8, 6);
  // first visit was today
  expect(missedDays(d6, { firstDay: d6, lastClearDay: null })).toBe(0);
  // opened two days ago, never cleared -> two missed days (pair)
  expect(missedDays(d6, { firstDay: d6 - 2, lastClearDay: null })).toBe(2);
  // first clear wins over the firstDay anchor
  expect(missedDays(d6, { firstDay: d6 - 30, lastClearDay: d6 - 1 })).toBe(0);
});

test("taskMissedDays counts each task's own gap since its last clear", () => {
  const d6 = day(2026, 8, 6);
  // cleared today -> no misses
  expect(taskMissedDays(d6, d6, null)).toBe(0);
  // cleared yesterday -> miss streak not started
  expect(taskMissedDays(d6, d6 - 1, null)).toBe(0);
  // cleared three days ago -> two missed days (pair, escalate)
  expect(taskMissedDays(d6, d6 - 3, null)).toBe(2);
  // future clear (clock rolled back) -> clamp
  expect(taskMissedDays(d6, d6 + 2, null)).toBe(0);
  // never cleared -> anchored on the task's creation day
  expect(taskMissedDays(d6, null, d6 - 5)).toBe(4);
  expect(taskMissedDays(d6, null, d6)).toBe(0);
  // no history and unknown creation -> nothing to claim
  expect(taskMissedDays(d6, null, null)).toBe(0);
});

test("openRitual anchors firstDay exactly once", () => {
  const d6 = day(2026, 8, 6);
  expect(openRitual(d6)).toEqual({ v: 1, firstDay: d6, lastClearDay: null, habitOfferDismissed: false });
  expect(openRitual(d6 + 3).firstDay).toBe(d6);
  expect(openRitual(d6 + 7).firstDay).toBe(d6);
});

test("recordClearDay is idempotent per day and resets the miss count", () => {
  const d6 = day(2026, 8, 6);
  openRitual(d6 - 3);
  recordClearDay(d6);
  recordClearDay(d6); // same day -> no-op
  const s = loadRitual();
  expect(s.lastClearDay).toBe(d6);
  expect(missedDays(d6 + 1, s)).toBe(0);
  expect(missedDays(d6 + 3, s)).toBe(2);
});

test("loadRitual survives garbage and round-trips", () => {
  expect(loadRitual()).toEqual(emptyRitual());
  localStorage.setItem("todosst:ritual", "not json");
  expect(loadRitual()).toEqual(emptyRitual());
  localStorage.setItem("todosst:ritual", JSON.stringify({ v: 2, firstDay: "x" }));
  expect(loadRitual()).toEqual(emptyRitual());
  const d6 = day(2026, 8, 6);
  localStorage.setItem("todosst:ritual", JSON.stringify({ v: 1, firstDay: d6, lastClearDay: d6 - 1, habitOfferDismissed: true }));
  expect(loadRitual()).toEqual({ v: 1, firstDay: d6, lastClearDay: d6 - 1, habitOfferDismissed: true });
});

test("dismissHabitOffer persists once and stays dismissed", () => {
  const d6 = day(2026, 8, 6);
  openRitual(d6);
  expect(loadRitual().habitOfferDismissed).toBe(false);
  dismissHabitOffer();
  dismissHabitOffer();
  expect(loadRitual().habitOfferDismissed).toBe(true);
  // a later all clear does not resurrect the offer
  recordClearDay(d6 + 1);
  expect(loadRitual().habitOfferDismissed).toBe(true);
});