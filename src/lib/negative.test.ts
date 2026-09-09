// @ts-nocheck — runs under `bun test` (bun:test types not installed)
import { test, expect } from "bun:test";
import {
  HOLD_GRACE_DAYS,
  buildHoldItems,
  holdOf,
  isNegative,
  parseNegInput,
  toleranceOf,
  windowOutcome,
  withHold,
  type HoldItem,
} from "./negative";
import { dayIndexLocal, dayIndexToStart, recurState } from "./recur";
import { runInput } from "./grammar";
import type { PlainNode } from "./crypto";
import type { DecryptedNode, TreeNode } from "./tree";

const H = 3600_000;
const DAY = 86_400_000;

type Meta = PlainNode["metadata"];

function meta(partial: Partial<Meta>): Meta {
  return partial;
}

// ---------- parseNegInput ----------

test("parseNegInput: trailing ! after a rule flips neg and strips both", () => {
  const p = parseNegInput("don't doom scroll ~daily !");
  expect(p.title).toBe("don't doom scroll");
  expect(p.ruleStr).toBe("FREQ=DAILY");
  expect(p.neg).toBe(true);
});

test("parseNegInput: ! without a rule stays in the title", () => {
  const p = parseNegInput("buy tickets!");
  expect(p.title).toBe("buy tickets!");
  expect(p.ruleStr).toBeNull();
  expect(p.neg).toBe(false);
});

test("parseNegInput: plain recurrence keeps neg false", () => {
  const p = parseNegInput("stretch ~daily");
  expect(p.title).toBe("stretch");
  expect(p.ruleStr).toBe("FREQ=DAILY");
  expect(p.neg).toBe(false);
});

test("parseNegInput: ! before the rule token is just part of the title", () => {
  const p = parseNegInput("wow! ~daily");
  expect(p.title).toBe("wow!");
  expect(p.ruleStr).toBe("FREQ=DAILY");
  expect(p.neg).toBe(false);
});

test("parseNegInput: no bang, no rule — passthrough", () => {
  const p = parseNegInput("buy coffee beans");
  expect(p).toEqual({ title: "buy coffee beans", ruleStr: null, neg: false });
});

// ---------- metadata helpers ----------

test("isNegative requires both the flag and a rule", () => {
  expect(isNegative(meta({ neg: true, recur: "FREQ=DAILY" }))).toBe(true);
  expect(isNegative(meta({ neg: true }))).toBe(false);
  expect(isNegative(meta({ neg: true, recur: "GARBAGE!!" }))).toBe(false);
  expect(isNegative(meta({ recur: "FREQ=DAILY" }))).toBe(false);
});

test("toleranceOf defaults to 0 and clamps", () => {
  expect(toleranceOf(meta({}))).toBe(0);
  expect(toleranceOf(meta({ tol: 3 }))).toBe(3);
  expect(toleranceOf(meta({ tol: 1.7 }))).toBe(1);
  expect(toleranceOf(meta({ tol: -5 }))).toBe(0);
  expect(toleranceOf(meta({ tol: 5000 }))).toBe(999);
});

test("windowOutcome: held iff slips <= tol", () => {
  expect(windowOutcome(0, 0)).toBe("held");
  expect(windowOutcome(1, 0)).toBe("failed");
  expect(windowOutcome(2, 2)).toBe("held");
  expect(windowOutcome(3, 2)).toBe("failed");
});

test("holdOf / withHold round trip per window day", () => {
  let m = meta({});
  expect(holdOf(m, 1234)).toBeUndefined();
  const ts = Date.now();
  m = withHold(m, 1234, ts);
  expect(holdOf(m, 1234)).toBe(ts);
  expect(holdOf(m, 1235)).toBeUndefined();
  m = withHold(m, 1235, ts + 1);
  expect(holdOf(m, 1234)).toBe(ts);
  expect(holdOf(m, 1235)).toBe(ts + 1);
  expect(holdOf(meta({ holds: { x: "junk" } }), 0)).toBeUndefined();
});

// ---------- buildHoldItems ----------

// Minimal node/tree doubles: buildHoldItems only reads identity, metadata and
// the maps handed in.
function makeNode(id: string, creationTs: number, m: Meta): DecryptedNode {
  return {
    v: 2,
    title: `task ${id}`,
    isCompleted: false,
    parentId: null,
    order: 0,
    metadata: m,
    _id: id as never,
    _creationTime: creationTs,
    _raw: {},
  } as unknown as DecryptedNode;
}

function treeWith(nodes: DecryptedNode[]): { map: Map<string, TreeNode> } {
  const map = new Map<string, TreeNode>();
  for (const n of nodes) {
    map.set(n._id as string, { ...n, children: [], depth: 0 } as unknown as TreeNode);
  }
  return { map };
}

const DAILY = "FREQ=DAILY";

test("buildHoldItems: null inputs return null", () => {
  const tree = treeWith([]);
  expect(buildHoldItems({ nodes: null, tree, recurStates: null, priorWindows: null, counts: new Map(), nowTs: 0 })).toBeNull();
});

test("buildHoldItems: open row for the current window", async () => {
  // 1pm local — past the default 4h grace, so the current window is today
  const now = new Date().setHours(13, 0, 0, 0);
  const anchor = now - 3 * DAY;
  const n = makeNode("a", anchor, meta({ neg: true, recur: DAILY }));
  const rs = await recurState(n.metadata, anchor, now);
  const rows = buildHoldItems({
    nodes: [n],
    tree: treeWith([n]),
    recurStates: new Map([["a", rs]]),
    priorWindows: new Map([["a", dayIndexLocal(now) - 1]]),
    counts: new Map(),
    nowTs: now,
  });
  expect(rows).toHaveLength(2);
  const openRow = rows!.find((r: HoldItem) => r.kind === "open")!;
  expect(openRow.windowDay).toBe(dayIndexLocal(now));
  expect(openRow.slips).toBe(0);
  expect(openRow.tol).toBe(0);
  // yesterday's clean window prompts for confirmation alongside it
  expect(rows!.find((r: HoldItem) => r.kind === "confirm")!.windowDay).toBe(dayIndexLocal(now) - 1);
});

test("buildHoldItems: non-negative and non-recurring nodes never appear", async () => {
  const now = new Date().setHours(13, 0, 0, 0);
  const a = makeNode("a", now - DAY, meta({ recur: DAILY }));
  const b = makeNode("b", now - DAY, meta({ neg: true })); // flag without rule
  const rsA = await recurState(a.metadata, a._creationTime, now);
  const rsB = await recurState(b.metadata, b._creationTime, now);
  const rows = buildHoldItems({
    nodes: [a, b],
    tree: treeWith([a, b]),
    recurStates: new Map([
      ["a", rsA],
      ["b", rsB],
    ]),
    priorWindows: new Map(),
    counts: new Map(),
    nowTs: now,
  });
  expect(rows).toEqual([]);
});

test("buildHoldItems: clean past window awaits confirmation; failures show as failed", async () => {
  const now = new Date().setHours(13, 0, 0, 0);
  const anchor = now - 3 * DAY;
  const today = dayIndexLocal(now);
  const clean = makeNode("clean", anchor, meta({ neg: true, recur: DAILY }));
  const failed = makeNode("failed", anchor, meta({ neg: true, recur: DAILY, tol: 1 }));
  const rsClean = await recurState(clean.metadata, anchor, now);
  const rsFailed = await recurState(failed.metadata, anchor, now);
  const counts = new Map<string, Map<number, number>>([
    ["failed", new Map([[today - 1, 2]])],
  ]);
  const rows = buildHoldItems({
    nodes: [clean, failed],
    tree: treeWith([clean, failed]),
    recurStates: new Map([
      ["clean", rsClean],
      ["failed", rsFailed],
    ]),
    priorWindows: new Map([
      ["clean", today - 1],
      ["failed", today - 1],
    ]),
    counts,
    nowTs: now,
  });
  expect(rows!.filter((r: HoldItem) => r.kind === "confirm")).toHaveLength(1);
  expect(rows!.filter((r: HoldItem) => r.kind === "failed")).toHaveLength(1);
  const confirmRow = rows!.find((r: HoldItem) => r.kind === "confirm")!;
  expect(confirmRow.slips).toBe(0);
  const failedRow = rows!.find((r: HoldItem) => r.kind === "failed")!;
  expect(failedRow.slips).toBe(2);
  expect(failedRow.tol).toBe(1);
});

test("buildHoldItems: a confirmed window stops prompting", async () => {
  const now = new Date().setHours(13, 0, 0, 0);
  const anchor = now - 3 * DAY;
  const today = dayIndexLocal(now);
  const n = makeNode("a", anchor, meta({ neg: true, recur: DAILY, holds: { [String(today - 1)]: 1 } }));
  const rs = await recurState(n.metadata, anchor, now);
  const rows = buildHoldItems({
    nodes: [n],
    tree: treeWith([n]),
    recurStates: new Map([["a", rs]]),
    priorWindows: new Map([["a", today - 1]]),
    counts: new Map(),
    nowTs: now,
  });
  expect(rows!.every((r: HoldItem) => r.kind !== "confirm")).toBe(true);
});

test("buildHoldItems: a sealed failed window stops showing", async () => {
  const now = new Date().setHours(13, 0, 0, 0);
  const anchor = now - 3 * DAY;
  const today = dayIndexLocal(now);
  const n = makeNode("a", anchor, meta({ neg: true, recur: DAILY, holds: { [String(today - 1)]: 1 } }));
  const rs = await recurState(n.metadata, anchor, now);
  const rows = buildHoldItems({
    nodes: [n],
    tree: treeWith([n]),
    recurStates: new Map([["a", rs]]),
    priorWindows: new Map([["a", today - 1]]),
    counts: new Map([["a", new Map([[today - 1, 2]])]]), // over tolerance
    nowTs: now,
  });
  expect(rows!.every((r: HoldItem) => r.kind !== "failed")).toBe(true);
});

test("buildHoldItems: slips come from counts or history, whichever is higher", async () => {
  const now = new Date().setHours(13, 0, 0, 0);
  const anchor = now - 3 * DAY;
  const today = dayIndexLocal(now);
  const n = makeNode("a", anchor, meta({ neg: true, recur: DAILY, counts: { [String(today - 1)]: 5 } }));
  const rs = await recurState(n.metadata, anchor, now);
  const rows = buildHoldItems({
    nodes: [n],
    tree: treeWith([n]),
    recurStates: new Map([["a", rs]]),
    priorWindows: new Map([["a", today - 1]]),
    counts: new Map([["a", new Map([[today - 1, 2]])]]),
    nowTs: now,
  });
  const failedRow = rows!.find((r: HoldItem) => r.kind === "failed")!;
  expect(failedRow.slips).toBe(5);
});

test("buildHoldItems: unconfirmed clean windows resolve after the grace period", async () => {
  const now = new Date().setHours(13, 0, 0, 0);
  const anchor = now - 40 * DAY;
  const today = dayIndexLocal(now);
  const n = makeNode("a", anchor, meta({ neg: true, recur: DAILY }));
  const rs = await recurState(n.metadata, anchor, now);
  // a stale prior window (10 days back) is beyond grace — silently held
  const stale = buildHoldItems({
    nodes: [n],
    tree: treeWith([n]),
    recurStates: new Map([["a", rs]]),
    priorWindows: new Map([["a", today - 10]]),
    counts: new Map(),
    nowTs: now,
  });
  expect(stale!.filter((r: HoldItem) => r.kind === "confirm")).toHaveLength(0);
  // failures have no grace — they show until the next window rolls
  const n2 = makeNode("b", anchor, meta({ neg: true, recur: DAILY }));
  const rs2 = await recurState(n2.metadata, anchor, now);
  const failing = buildHoldItems({
    nodes: [n2],
    tree: treeWith([n2]),
    recurStates: new Map([["b", rs2]]),
    priorWindows: new Map([["b", today - 10]]),
    counts: new Map([["b", new Map([[today - 10, 3]])]]),
    nowTs: now,
  });
  expect(failing!.filter((r: HoldItem) => r.kind === "failed")).toHaveLength(1);
  expect(failing!.filter((r: HoldItem) => r.kind === "confirm")).toHaveLength(0);
});

test("buildHoldItems: expired rules evaluate their final window", async () => {
  const now = new Date().setHours(13, 0, 0, 0);
  // UNTIL yesterday — the rule's last window ended before today
  const until = `FREQ=DAILY;UNTIL=${fmtUntil(now - DAY)}`;
  const anchor = now - 10 * DAY;
  const n = makeNode("a", anchor, meta({ neg: true, recur: until }));
  const rs = await recurState(n.metadata, anchor, now);
  expect(rs.isRecurring).toBe(true);
  expect(rs.expired).toBe(true);
  const rows = buildHoldItems({
    nodes: [n],
    tree: treeWith([n]),
    recurStates: new Map([["a", rs]]),
    priorWindows: new Map([["a", null]]),
    counts: new Map(),
    nowTs: now,
  });
  expect(rows).toHaveLength(1);
  expect(rows![0]!.kind).toBe("confirm");
  expect(rows![0]!.windowDay).toBe(rs.windowDay);
});

test("buildHoldItems: upcoming windows (rule not started) render nothing yet", async () => {
  // anchor tomorrow: the first occurrence is in the future
  const now = new Date().setHours(13, 0, 0, 0);
  const anchor = now + DAY;
  const n = makeNode("a", anchor, meta({ neg: true, recur: DAILY }));
  const rs = await recurState(n.metadata, anchor, now);
  expect(rs.windowDay).toBeGreaterThan(dayIndexLocal(now));
  const rows = buildHoldItems({
    nodes: [n],
    tree: treeWith([n]),
    recurStates: new Map([["a", rs]]),
    priorWindows: new Map([["a", null]]),
    counts: new Map(),
    nowTs: now,
  });
  expect(rows).toEqual([]);
});

test("HOLD_GRACE_DAYS is a full week", () => {
  expect(HOLD_GRACE_DAYS).toBe(7);
  expect(dayIndexToStart(dayIndexLocal(Date.now()))).toBeLessThan(Number.MAX_SAFE_INTEGER);
});

// ---------- grammar integration ----------

test("runInput: the ! suffix rides the create outcome", () => {
  const calls = { pushed: [] as string[], help: 0 };
  const o = runInput("no doomscrolling ~daily !", {
    currentPath: "/",
    pushPath: (p: string) => calls.pushed.push(p),
    showHelp: () => {
      calls.help++;
    },
  });
  expect(o).toEqual({ type: "create-task", title: "no doomscrolling", recur: "FREQ=DAILY", neg: true });
  // excited titles without a rule keep their punctuation
  const o2 = runInput("buy tickets!", {
    currentPath: "/",
    pushPath: () => {},
    showHelp: () => {},
  });
  expect(o2).toEqual({ type: "create-task", title: "buy tickets!", recur: null, neg: undefined });
});

// UNTIL wants a naive-UTC "YYYYMMDDTHHMMSSZ" stamp in naive wall-clock space.
function fmtUntil(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T000000Z`;
}
