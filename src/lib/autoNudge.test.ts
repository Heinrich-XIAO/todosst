"use client";

import { describe, expect, test } from "bun:test";
import {
  armMean,
  buildAnonymousFeatures,
  buildFullDump,
  chooseHour,
  contextKeyOf,
  deliveryAtHour,
  eligibleAutoNudgeTasks,
  isAutoNudgeEligible,
  lifetimeCompletions,
  pickCandidate,
  randomDeliveryTime,
  recurKindOf,
} from "./autoNudge";
import type { DecryptedNode } from "./tree";
import type { RecurState } from "./recur";

function node(over: Partial<DecryptedNode> = {}): DecryptedNode {
  return {
    v: 2,
    title: "write report",
    isCompleted: false,
    parentId: null,
    order: 1,
    metadata: {},
    _id: "t1" as never,
    _creationTime: Date.now() - 3 * 86_400_000,
    _raw: {},
    ...over,
  } as DecryptedNode;
}

const plainRs: RecurState = {
  isRecurring: false,
  windowDay: 0,
  count: 0,
  nextTs: null,
  summary: "",
  expired: false,
};

describe("auto-nudge eligibility", () => {
  test("dateless open task is eligible", () => {
    expect(isAutoNudgeEligible(node(), plainRs, Date.now())).toBe(true);
  });
  test("due-date task is not (reminder system owns it)", () => {
    expect(isAutoNudgeEligible(node({ metadata: { dueAt: Date.now() } }), plainRs, Date.now())).toBe(false);
  });
  test("completed task is not", () => {
    expect(isAutoNudgeEligible(node({ isCompleted: true }), plainRs, Date.now())).toBe(false);
  });
  test("negative/battle task is never eligible", () => {
    const n = node({ metadata: { neg: true, recur: "FREQ=DAILY" } });
    const rs: RecurState = { ...plainRs, isRecurring: true, windowDay: 99999, count: 0 };
    expect(isAutoNudgeEligible(n, rs, Date.now())).toBe(false);
  });
  test("habit meta-task is never eligible", () => {
    expect(isAutoNudgeEligible(node({ metadata: { habit: true } }), plainRs, Date.now())).toBe(false);
  });
  test("recurring task below threshold with open window is eligible", () => {
    const n = node({ metadata: { recur: "FREQ=DAILY", threshold: 2, counts: { "1": 1 } } });
    const rs: RecurState = { ...plainRs, isRecurring: true, windowDay: 1, count: 1 };
    expect(isAutoNudgeEligible(n, rs, Date.now())).toBe(true);
  });
  test("recurring task at threshold is not", () => {
    const n = node({ metadata: { recur: "FREQ=DAILY", threshold: 1 } });
    const rs: RecurState = { ...plainRs, isRecurring: true, windowDay: 1, count: 1 };
    expect(isAutoNudgeEligible(n, rs, Date.now())).toBe(false);
  });
  test("eligibleAutoNudgeTasks filters the list", () => {
    const nodes = [
      node(),
      node({ metadata: { dueAt: 1 } }),
      node({ metadata: { neg: true, recur: "FREQ=DAILY" } }),
    ] as DecryptedNode[];
    expect(eligibleAutoNudgeTasks(nodes, new Map(), Date.now()).length).toBe(1);
  });
});

describe("telemetry", () => {
  test("recurKindOf never returns the raw rule", () => {
    expect(recurKindOf("FREQ=DAILY")).toBe("daily");
    expect(recurKindOf("FREQ=WEEKLY;BYDAY=MO")).toBe("weekly");
    expect(recurKindOf(undefined)).toBeUndefined();
  });
  test("anonymous features carry no content", () => {
    const n = node({ metadata: { recur: "FREQ=DAILY", mode: "count", threshold: 3 } });
    const treeNode = { ...n, children: [], depth: 2 } as never;
    const f = buildAnonymousFeatures({
      node: treeNode,
      rs: { ...plainRs, isRecurring: true, windowDay: 5, count: 1 },
      historyCounts: new Map([[4, 2]]),
      openCount: 7,
      siblingCount: 3,
      scheduledFor: new Date(2026, 5, 10, 14, 30).getTime(),
    });
    expect(f.hourLocal).toBe(14);
    expect(f.isRecurring).toBe(true);
    expect(f.recurKind).toBe("daily");
    expect(JSON.stringify(f)).not.toContain("write report");
    expect(JSON.stringify(f)).not.toContain("FREQ=");
  });
  test("full dump carries everything (name, rule, counts, history, timestamps)", () => {
    const n = node({
      metadata: { recur: "FREQ=DAILY", mode: "count", threshold: 3, counts: { "5": 1 }, tags: ["x"] },
    });
    const treeNode = { ...n, children: [], depth: 1 } as never;
    const dump = buildFullDump({
      node: n,
      treeNode,
      rs: { ...plainRs, isRecurring: true, windowDay: 5, count: 1, summary: "daily" },
      historyCounts: new Map([[4, 2]]),
      openCount: 7,
      siblingCount: 1,
      scheduledFor: Date.now(),
    });
    expect(dump.task.title).toBe("write report");
    expect(dump.task.metadata.recur).toBe("FREQ=DAILY");
    expect(dump.historyCounts).toEqual({ "4": 2 });
    expect(dump.lifetimeCompletions).toBeGreaterThanOrEqual(3);
    expect(dump.recur?.mode).toBe("count");
  });
  test("lifetimeCompletions sums meta + history", () => {
    expect(lifetimeCompletions({ counts: { "5": 2 } }, new Map([[4, 3]]), undefined)).toBe(5);
  });
  test("randomDeliveryTime lands in the day window or near future", () => {
    const morning = new Date(2026, 5, 10, 8, 0).getTime();
    const t = randomDeliveryTime(morning, () => 0.5);
    const d = new Date(t);
    expect(d.getHours()).toBeGreaterThanOrEqual(9);
    expect(d.getHours()).toBeLessThanOrEqual(20);
  });
  test("pickCandidate is uniform-random stub (bandit exploration)", () => {
    expect(pickCandidate([], () => 0)).toBeNull();
    expect(pickCandidate(["a", "b"], () => 0)).toBe("a");
    expect(pickCandidate(["a", "b"], () => 0.99)).toBe("b");
  });
});

describe("contextual hour policy", () => {
  const morning = new Date(2026, 5, 10, 8, 0).getTime();

  test("contextKeyOf groups by mode + recur family, never content", () => {
    expect(contextKeyOf({ mode: "check", isRecurring: false })).toBe("check:once");
    expect(contextKeyOf({ mode: "count", isRecurring: true, recurKind: "daily" })).toBe("count:daily");
    expect(contextKeyOf({ mode: "time", isRecurring: true, recurKind: undefined })).toBe("time:custom");
  });

  test("cold start: every arm scores the prior (no crash, no content)", () => {
    const m = armMean("check:once", 14, null, null);
    expect(m).toBeCloseTo(0.2, 5);
    expect(chooseHour("check:once", null, null, morning, () => 0.99, 0)).toBeGreaterThanOrEqual(9);
  });

  test("exploitation: a tally habit learns mornings, a one-shot learns evenings", () => {
    const mine = {
      "count:daily": { "9": { sends: 10, reward: 8 } },
      "check:once": { "19": { sends: 10, reward: 9 } },
    };
    // epsilon 0, rand always 0 → deterministic argmax (tie jitter is 0)
    expect(chooseHour("count:daily", mine, null, morning, () => 0, 0)).toBe(9);
    expect(chooseHour("check:once", mine, null, morning, () => 0, 0)).toBe(19);
  });

  test("global prior guides a new account before it has any history", () => {
    const global = { "time:weekly": { "10": { sends: 100, reward: 60 } } };
    expect(chooseHour("time:weekly", null, global, morning, () => 0, 0)).toBe(10);
  });

  test("personal history outweighs the global prior once it exists", () => {
    const mine = { "time:weekly": { "18": { sends: 20, reward: 18 } } };
    const global = { "time:weekly": { "10": { sends: 100, reward: 60 } } };
    expect(chooseHour("time:weekly", mine, global, morning, () => 0, 0)).toBe(18);
  });

  test("epsilon exploration still tries other hours", () => {
    const mine = { "check:once": { "19": { sends: 50, reward: 45 } } };
    const seen = new Set<number>();
    let s = 0.1;
    const seq = () => (s = (s * 7 + 0.3) % 1);
    for (let i = 0; i < 50; i++) seen.add(chooseHour("check:once", mine, null, morning, seq, 1)!);
    expect(seen.size).toBeGreaterThan(1);
  });

  test("past hours are never chosen; late night returns null (fallback path)", () => {
    const late = new Date(2026, 5, 10, 22, 30).getTime();
    expect(chooseHour("check:once", null, null, late, () => 0, 0)).toBeNull();
    const h = chooseHour("check:once", null, null, morning, () => 0, 0)!;
    expect(h).toBeGreaterThanOrEqual(9);
  });

  test("deliveryAtHour lands inside the chosen hour", () => {
    const t = deliveryAtHour(14, morning, () => 0.5);
    const d = new Date(t);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });
});
