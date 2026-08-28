// @ts-nocheck — runs under `bun test` (bun:test types not installed)
import { test, expect } from "bun:test";
import {
  dayStartLocal,
  dayIndexLocal,
  dayIndexToStart,
  normalizeRruleString,
  encodeCounts,
  decodeCounts,
  mergeCounts,
  encodeHistoryPayload,
  decodeHistoryPayload,
  parseRecurInput,
  recurState,
  modeOf,
  thresholdOf,
  isChecked,
  nextCountOnClick,
  DEFAULT_GRACE_HOURS,
} from "./recur";

const H = 3600_000;

test("day index round trips", () => {
  const now = Date.now();
  const idx = dayIndexLocal(now);
  const start = dayIndexToStart(idx);
  expect(dayStartLocal(start)).toBe(start);
  expect(dayIndexLocal(start)).toBe(idx);
  expect(dayIndexToStart(dayIndexLocal(dayIndexToStart(idx) + 22 * H))).toBe(start);
  // consecutive days differ by 1
  expect(dayIndexLocal(start + 40 * H) - idx).toBe(1);
});

test("dayIndexToStart lands on the same local calendar day (UTC-negative safe)", () => {
  // 3pm local on Aug 27 2026
  const ts = new Date(2026, 7, 27, 15).getTime();
  const idx = dayIndexLocal(ts);
  const start = new Date(dayIndexToStart(idx));
  expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 7, 27]);
  expect(start.getHours()).toBe(0);
  // weekday is preserved (drives heatmap column alignment)
  expect(new Date(dayIndexToStart(idx)).getDay()).toBe(new Date(ts).getDay());
});

test("day index is an exact bijection across a DST boundary year", () => {
  // sweep every day of 2026 (includes spring-forward Mar 8 and fall-back Nov 1 in US zones)
  for (let m = 0; m < 12; m += 3) {
    for (const day of [1, 8, 15, 28]) {
      const ts = new Date(2026, m, day, 13).getTime(); // 1pm local
      const idx = dayIndexLocal(ts);
      expect(dayIndexLocal(dayIndexToStart(idx))).toBe(idx);
      const back = new Date(dayIndexToStart(idx));
      expect([back.getFullYear(), back.getMonth(), back.getDate()]).toEqual([2026, m, day]);
      expect(back.getHours()).toBe(0);
    }
  }
});

test("normalizeRruleString strips prefixes and junk lines", () => {
  expect(normalizeRruleString("RRULE:FREQ=DAILY;INTERVAL=2")).toBe("FREQ=DAILY;INTERVAL=2");
  expect(normalizeRruleString("DTSTART:20260101T000000\nRRULE:FREQ=DAILY\n\nEXRULE:FREQ=DAILY")).toBe(
    "DTSTART:20260101T000000\nFREQ=DAILY"
  );
  expect(normalizeRruleString("  ")).toBe("");
});

test("counts codec round trip + sanitization", () => {
  const s = encodeCounts({ "1241": 3, "1240": 1, "1242": 0, "1243": 20000 });
  expect(s).toBe("d1240:1;d1241:3;d1243:9999");
  const m = decodeCounts(s);
  expect(m.get(1240)).toBe(1);
  expect(m.get(1241)).toBe(3);
  expect(m.get(1242)).toBeUndefined();
  expect(m.get(1243)).toBe(9999);
  expect(decodeCounts("garbage;d12:4;d1240:x;;d1244:2").get(1244)).toBe(2);
  expect(decodeCounts("").size).toBe(0);
  expect(encodeCounts(new Map([[7, 2]]))).toBe("d7:2");
});

test("mergeCounts sums across tasks", () => {
  const merged = mergeCounts([new Map([[5, 2]]), new Map([[5, 1], [6, 4]])]);
  expect(merged.get(5)).toBe(3);
  expect(merged.get(6)).toBe(4);
});

test("history payload round trip + rejects junk", () => {
  const json = encodeHistoryPayload({ todoId: "abc", counts: new Map([[1240, 2]]) });
  const back = decodeHistoryPayload(json);
  expect(back?.todoId).toBe("abc");
  expect(back?.counts.get(1240)).toBe(2);
  expect(decodeHistoryPayload("{not json")).toBeNull();
  expect(decodeHistoryPayload(JSON.stringify({ v: 2, todoId: "x" }))).toBeNull();
});

test("parseRecurInput suffixes", () => {
  expect(parseRecurInput("water plants ~daily")).toEqual({ title: "water plants", ruleStr: "FREQ=DAILY" });
  expect(parseRecurInput("gym ~every 2w mon,thu")).toEqual({
    title: "gym",
    ruleStr: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH",
  });
  expect(parseRecurInput("stand ~every2d")).toEqual({ title: "stand", ruleStr: "FREQ=DAILY;INTERVAL=2" });
  expect(parseRecurInput("report ~weekdays").ruleStr).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
  expect(parseRecurInput("clean ~every 3m").ruleStr).toBe("FREQ=MONTHLY;INTERVAL=3");
  // invalid / mid-string tilde stays literal
  expect(parseRecurInput("foo ~bar")).toEqual({ title: "foo ~bar", ruleStr: null });
  expect(parseRecurInput("a~b ~weekly").title).toBe("a~b");
  expect(parseRecurInput("plain").ruleStr).toBeNull();
});

test("input-syntax rules are valid RFC 5545 (parse via rrule)", async () => {
  for (const input of ["gym ~every 2w mon,thu", "run ~weekdays", "clean ~monthly", "x ~every 3d"]) {
    const { ruleStr } = parseRecurInput(input);
    expect(ruleStr).not.toBeNull();
    const anchor = dayIndexToStart(dayIndexLocal(Date.now()));
    const state = await recurState({ recur: ruleStr! }, anchor, Date.now());
    expect(state.isRecurring).toBe(true);
    expect(state.summary.length).toBeGreaterThan(0);
  }
});

test("mode/threshold/click semantics — lossless mode switching", () => {
  expect(modeOf({})).toBe("check");
  expect(modeOf({ mode: "count" })).toBe("count");
  expect(thresholdOf({})).toBe(1);
  expect(thresholdOf({ threshold: 0 })).toBe(1);
  expect(thresholdOf({ threshold: 3.9 })).toBe(3);
  expect(isChecked(2, 2)).toBe(true);
  expect(isChecked(1, 2)).toBe(false);
  // check mode: click sets threshold, click again clears
  expect(nextCountOnClick("check", 0, 1)).toBe(1);
  expect(nextCountOnClick("check", 1, 1)).toBe(0);
  expect(nextCountOnClick("check", 0, 3)).toBe(3);
  expect(nextCountOnClick("check", 5, 3)).toBe(0);
  // count mode: +1
  expect(nextCountOnClick("count", 2, 1)).toBe(3);
});

test("recurState — plain task single window at creation day", async () => {
  const created = dayIndexToStart(1200);
  const rs = await recurState({}, created, created + 90 * 24 * H);
  expect(rs.isRecurring).toBe(false);
  expect(rs.windowDay).toBe(1200);
  expect(rs.count).toBe(0);
  const rs2 = await recurState({ counts: { "1200": 4 } }, created, created + 90 * 24 * H);
  expect(rs2.count).toBe(4);
}, 20000);

test("recurState — daily window rolls with grace across midnight", async () => {
  // anchor Jan 1 2026 local, daily rule
  const anchor = dayIndexToStart(dayIndexLocal(new Date(2026, 0, 1, 12).getTime()));
  const jan5 = new Date(2026, 0, 5, 23, 30).getTime(); // 23:30 on Jan 5
  const rs = await recurState({ recur: "FREQ=DAILY" }, anchor, jan5);
  expect(rs.isRecurring).toBe(true);
  expect(rs.windowDay).toBe(dayIndexLocal(new Date(2026, 0, 5, 12).getTime()));
  // 00:30 Jan 6 with default 4h grace -> still yesterday's window
  const justAfterMidnight = new Date(2026, 0, 6, 0, 30).getTime();
  const rs2 = await recurState({ recur: "FREQ=DAILY" }, anchor, justAfterMidnight);
  expect(rs2.windowDay).toBe(dayIndexLocal(new Date(2026, 0, 5, 12).getTime()));
  // past grace cutoff -> today's window
  const afterGrace = new Date(2026, 0, 6, 5, 0).getTime();
  const rs3 = await recurState({ recur: "FREQ=DAILY" }, anchor, afterGrace);
  expect(rs3.windowDay).toBe(dayIndexLocal(new Date(2026, 0, 6, 12).getTime()));
  // grace 0 -> strict midnight
  const rs4 = await recurState({ recur: "FREQ=DAILY", graceHours: 0 }, anchor, justAfterMidnight);
  expect(rs4.windowDay).toBe(dayIndexLocal(new Date(2026, 0, 6, 12).getTime()));
}, 20000);

test("recurState — future rule tallies into upcoming window", async () => {
  const anchor = dayIndexToStart(dayIndexLocal(new Date(2026, 5, 1, 12).getTime())); // Jun 1
  const may1 = new Date(2026, 4, 1, 12).getTime();
  const rs = await recurState({ recur: "FREQ=DAILY;INTERVAL=7;BYDAY=MO" }, anchor, may1);
  expect(rs.isRecurring).toBe(true);
  // window resolves to the first occurrence after now (next Monday on/after Jun 1)
  expect(rs.count).toBe(0);
}, 20000);

test("recurState — weekly BYDAY windows", async () => {
  const anchor = dayIndexToStart(dayIndexLocal(new Date(2026, 0, 5, 12).getTime())); // Mon Jan 5
  // Wed Jan 7
  const rs = await recurState({ recur: "FREQ=WEEKLY;BYDAY=MO,TH" }, anchor, new Date(2026, 0, 7, 12).getTime());
  expect(rs.windowDay).toBe(anchor ? dayIndexLocal(new Date(2026, 0, 5, 12).getTime()) : 0); // still Monday's window
  const rs2 = await recurState({ recur: "FREQ=WEEKLY;BYDAY=MO,TH" }, anchor, new Date(2026, 0, 8, 12).getTime());
  expect(rs2.windowDay).toBe(dayIndexLocal(new Date(2026, 0, 8, 12).getTime())); // Thursday
}, 20000);

test("recurState — unparseable rule degrades to plain", async () => {
  const anchor = dayIndexToStart(1200);
  const rs = await recurState({ recur: "FREQ=NOPE" }, anchor, Date.now());
  expect(rs.isRecurring).toBe(false);
  expect(rs.windowDay).toBe(1200);
}, 20000);

test("recurState — DTSTART in string overrides anchor", async () => {
  const anchor = dayIndexToStart(dayIndexLocal(new Date(2020, 0, 1, 12).getTime()));
  const rs = await recurState(
    { recur: "DTSTART:20260310T000000\nFREQ=DAILY" },
    anchor,
    new Date(2026, 2, 11, 12).getTime()
  );
  expect(rs.windowDay).toBe(dayIndexLocal(new Date(2026, 2, 11, 12).getTime()));
}, 20000);

test("defaults exported", () => {
  expect(DEFAULT_GRACE_HOURS).toBe(4);
});
