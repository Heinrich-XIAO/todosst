// @ts-nocheck — runs under `bun test` (bun:test types not installed)
import { test, expect } from "bun:test";
import { buildHabitConfirmItems, habitWindowMissed, type HabitConfirmItem } from "./habit";
import { dayIndexLocal, recurState } from "./recur";
import type { PlainNode } from "./crypto";
import type { DecryptedNode, TreeNode } from "./tree";

const DAY = 86_400_000;

type Meta = PlainNode["metadata"];

function meta(partial: Partial<Meta>): Meta {
  return partial;
}

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

// ---------- habitWindowMissed ----------

test("habitWindowMissed: below goal misses, at goal does not", () => {
  expect(habitWindowMissed(0, 1)).toBe(true);
  expect(habitWindowMissed(1, 1)).toBe(false);
  expect(habitWindowMissed(3, 5)).toBe(true);
  expect(habitWindowMissed(5, 5)).toBe(false);
});

test("habitWindowMissed: goalless tally only misses when blank", () => {
  expect(habitWindowMissed(0, Infinity)).toBe(true);
  expect(habitWindowMissed(1, Infinity)).toBe(false);
  expect(habitWindowMissed(12, Infinity)).toBe(false);
});

// ---------- buildHabitConfirmItems ----------

test("buildHabitConfirmItems: null inputs return null", () => {
  const tree = treeWith([]);
  expect(
    buildHabitConfirmItems({ nodes: null, tree, recurStates: null, priorWindows: null, counts: new Map(), nowTs: 0 })
  ).toBeNull();
});

test("buildHabitConfirmItems: missed check habit prompts, done one stays silent", async () => {
  const now = new Date().setHours(13, 0, 0, 0);
  const anchor = now - 3 * DAY;
  const today = dayIndexLocal(now);
  const missed = makeNode("missed", anchor, meta({ recur: DAILY }));
  const done = makeNode("done", anchor, meta({ recur: DAILY, counts: { [String(today - 1)]: 1 } }));
  const rsMissed = await recurState(missed.metadata, anchor, now);
  const rsDone = await recurState(done.metadata, anchor, now);
  const rows = buildHabitConfirmItems({
    nodes: [missed, done],
    tree: treeWith([missed, done]),
    recurStates: new Map([
      ["missed", rsMissed],
      ["done", rsDone],
    ]),
    priorWindows: new Map([
      ["missed", today - 1],
      ["done", today - 1],
    ]),
    counts: new Map(),
    nowTs: now,
  });
  expect(rows!.map((r: HabitConfirmItem) => r.node.title)).toEqual(["task missed"]);
});

test("buildHabitConfirmItems: partial tally prompts with its count, full tally silent", async () => {
  const now = new Date().setHours(13, 0, 0, 0);
  const anchor = now - 3 * DAY;
  const today = dayIndexLocal(now);
  const partial = makeNode("partial", anchor, meta({ recur: DAILY, mode: "count", threshold: 5 }));
  const full = makeNode("full", anchor, meta({ recur: DAILY, mode: "count", threshold: 5 }));
  const rsPartial = await recurState(partial.metadata, anchor, now);
  const rsFull = await recurState(full.metadata, anchor, now);
  const rows = buildHabitConfirmItems({
    nodes: [partial, full],
    tree: treeWith([partial, full]),
    recurStates: new Map([
      ["partial", rsPartial],
      ["full", rsFull],
    ]),
    priorWindows: new Map([
      ["partial", today - 1],
      ["full", today - 1],
    ]),
    counts: new Map([
      ["partial", new Map([[today - 1, 3]])],
      ["full", new Map([[today - 1, 5]])],
    ]),
    nowTs: now,
  });
  expect(rows).toHaveLength(1);
  expect(rows![0]!.windowDay).toBe(today - 1);
  expect(rows![0]!.count).toBe(3);
  expect(rows![0]!.threshold).toBe(5);
});

test("buildHabitConfirmItems: negatives and non-recurring never appear", async () => {
  const now = new Date().setHours(13, 0, 0, 0);
  const neg = makeNode("neg", now - DAY, meta({ neg: true, recur: DAILY }));
  const plain = makeNode("plain", now - DAY, meta({}));
  const rsNeg = await recurState(neg.metadata, neg._creationTime, now);
  const rsPlain = await recurState(plain.metadata, plain._creationTime, now);
  const rows = buildHabitConfirmItems({
    nodes: [neg, plain],
    tree: treeWith([neg, plain]),
    recurStates: new Map([
      ["neg", rsNeg],
      ["plain", rsPlain],
    ]),
    priorWindows: new Map(),
    counts: new Map(),
    nowTs: now,
  });
  expect(rows).toEqual([]);
});

test("buildHabitConfirmItems: a frozen (holds-recorded) window stops prompting", async () => {
  const now = new Date().setHours(13, 0, 0, 0);
  const anchor = now - 3 * DAY;
  const today = dayIndexLocal(now);
  const n = makeNode("a", anchor, meta({ recur: DAILY, holds: { [String(today - 1)]: 1 } }));
  const rs = await recurState(n.metadata, anchor, now);
  const rows = buildHabitConfirmItems({
    nodes: [n],
    tree: treeWith([n]),
    recurStates: new Map([["a", rs]]),
    priorWindows: new Map([["a", today - 1]]),
    counts: new Map(),
    nowTs: now,
  });
  expect(rows).toEqual([]);
});

test("buildHabitConfirmItems: stale missed windows resolve after the grace period", async () => {
  const now = new Date().setHours(13, 0, 0, 0);
  const anchor = now - 40 * DAY;
  const today = dayIndexLocal(now);
  const n = makeNode("a", anchor, meta({ recur: DAILY }));
  const rs = await recurState(n.metadata, anchor, now);
  const rows = buildHabitConfirmItems({
    nodes: [n],
    tree: treeWith([n]),
    recurStates: new Map([["a", rs]]),
    priorWindows: new Map([["a", today - 10]]),
    counts: new Map(),
    nowTs: now,
  });
  expect(rows).toEqual([]);
});

test("buildHabitConfirmItems: counts prefer the higher of metadata and history", async () => {
  const now = new Date().setHours(13, 0, 0, 0);
  const anchor = now - 3 * DAY;
  const today = dayIndexLocal(now);
  const n = makeNode("a", anchor, meta({ recur: DAILY, mode: "count", threshold: 5, counts: { [String(today - 1)]: 4 } }));
  const rs = await recurState(n.metadata, anchor, now);
  const rows = buildHabitConfirmItems({
    nodes: [n],
    tree: treeWith([n]),
    recurStates: new Map([["a", rs]]),
    priorWindows: new Map([["a", today - 1]]),
    counts: new Map([["a", new Map([[today - 1, 2]])]]),
    nowTs: now,
  });
  expect(rows).toHaveLength(1);
  expect(rows![0]!.count).toBe(4);
});
