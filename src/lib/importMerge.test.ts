import { describe, expect, test } from "bun:test";
import type { PlainNode } from "./crypto";
import { importSnapshot, sameRule, type ExistingHistory, type ExistingTodo } from "./importMerge";
import { dayIndexLocal } from "./recur";
import type { VaultSnapshot } from "./vaultFile";

const NOW = new Date(2026, 10, 19, 9, 0).getTime(); // Thu 2026-11-19
const day = (y: number, m: number, d: number) => dayIndexLocal(new Date(y, m - 1, d, 12).getTime());

const node = (title: string, parentId: string | null, order: number, metadata: PlainNode["metadata"] = {}, isCompleted = false): PlainNode => ({
  v: 2,
  title,
  isCompleted,
  parentId,
  order,
  metadata,
});

// an in-memory account
function account(todos: ExistingTodo[] = [], history: ExistingHistory[] = []) {
  const rows = new Map(todos.map((t) => [t.id, { ...t }]));
  const hist = new Map(history.map((h) => [h.todoId, { ...h }]));
  let next = 1;
  const io = {
    create: async (n: PlainNode) => {
      const id = `new${next++}`;
      rows.set(id, { id, creationTime: NOW, node: n });
      return id;
    },
    update: async (id: string, n: PlainNode) => {
      rows.get(id)!.node = n;
    },
    putHistory: async (rowId: string | undefined, todoId: string, counts: Map<number, number>) => {
      hist.set(todoId, { rowId: rowId ?? `h-${todoId}`, todoId, counts: new Map(counts) });
    },
  };
  const run = (snap: VaultSnapshot, merge = true) =>
    importSnapshot(snap, [...rows.values()].map((r) => ({ ...r, node: structuredClone(r.node) })), [...hist.values()], io, { merge, now: NOW });
  const byTitle = (title: string) => [...rows.values()].filter((r) => r.node.title === title);
  return { rows, hist, run, byTitle };
}

const HOME: ExistingTodo[] = [
  { id: "f", creationTime: new Date(2026, 0, 5).getTime(), node: node("health", null, 0) },
  { id: "s", creationTime: new Date(2026, 0, 5).getTime(), node: node("stretch", "f", 0, { recur: "FREQ=DAILY", priority: "high", tags: ["body"] }) },
  { id: "w", creationTime: new Date(2026, 0, 7).getTime(), node: node("review", "f", 1, { recur: "FREQ=WEEKLY" }) }, // Wednesdays
  { id: "m", creationTime: new Date(2026, 0, 5).getTime(), node: node("buy milk", null, 1) },
];

// what todosst agent's "download for todosst" produces for the same tasks
const FROM_AGENT: VaultSnapshot = {
  v: 1,
  todos: [
    { id: "agent-folder:health", node: node("health", null, 0) },
    { id: "agent:stretch", node: node("stretch", "agent-folder:health", 1, { recur: "FREQ=DAILY", mode: "check", threshold: 1 }) },
    { id: "agent:review", node: node("review", "agent-folder:health", 2, { recur: "FREQ=WEEKLY", mode: "check", threshold: 1 }) },
    { id: "agent:buy-milk", node: node("buy milk", null, 3, { mode: "check", threshold: 1, dueAt: null, completedAt: 123 }, true) },
    { id: "agent:new", node: node("call mom", "agent-folder:health", 4, { mode: "check", threshold: 1, dueAt: null }) },
  ],
  history: [
    { todoId: "agent:stretch", counts: { [day(2026, 11, 18)]: 1, [day(2026, 11, 19)]: 1 } },
    // done on Friday the 13th; the target's window started Wednesday the 11th
    { todoId: "agent:review", counts: { [day(2026, 11, 13)]: 1 } },
  ],
};

describe("merge by path", () => {
  test("updates matching tasks, adds new ones, keeps fields the backup lacks", async () => {
    const acc = account(HOME, [{ rowId: "h1", todoId: "s", counts: new Map([[day(2026, 11, 17), 1]]) }]);
    const res = await acc.run(FROM_AGENT);
    expect(res.created).toBe(1);
    expect(acc.rows.size).toBe(5);
    expect(acc.byTitle("health")).toHaveLength(1);
    const stretch = acc.rows.get("s")!;
    expect(stretch.node.metadata).toMatchObject({ priority: "high", tags: ["body"], recur: "FREQ=DAILY" });
    expect([...acc.hist.get("s")!.counts.keys()].sort()).toEqual([day(2026, 11, 17), day(2026, 11, 18), day(2026, 11, 19)]);
    expect(acc.hist.get("s")!.rowId).toBe("h1");
    // today's window count is on the node too, where the list reads it
    expect(stretch.node.metadata.counts?.[String(day(2026, 11, 19))]).toBe(1);
    expect(acc.rows.get("m")!.node.isCompleted).toBe(true);
    const mom = acc.byTitle("call mom")[0];
    expect(mom.node.parentId).toBe("f");
    expect(mom.node.order).toBeGreaterThan(1); // after the existing siblings
  });

  test("counts move onto the target's own windows", async () => {
    const acc = account(HOME);
    await acc.run(FROM_AGENT);
    expect([...acc.hist.get("w")!.counts.entries()]).toEqual([[day(2026, 11, 11), 1]]);
  });

  test("importing the same file again changes nothing", async () => {
    const acc = account(HOME);
    await acc.run(FROM_AGENT);
    const again = await acc.run(FROM_AGENT);
    expect(again).toEqual({ created: 0, updated: 0, unchanged: 5, history: 0 });
    expect(acc.rows.size).toBe(5);
  });

  test("a rule that only gained a DTSTART keeps the original text", async () => {
    const acc = account([{ id: "x", creationTime: NOW, node: node("water", null, 0, { recur: "FREQ=DAILY;INTERVAL=3" }) }]);
    await acc.run({ v: 1, todos: [{ id: "a", node: node("water", null, 0, { recur: "DTSTART:20261116T000000Z\nFREQ=DAILY;INTERVAL=3" }) }], history: [] });
    expect(acc.rows.get("x")!.node.metadata.recur).toBe("FREQ=DAILY;INTERVAL=3");
  });

  test("a changed rule replaces the old one", async () => {
    const acc = account(HOME);
    await acc.run({ v: 1, todos: [{ id: "a", node: node("buy milk", null, 0, { recur: "FREQ=WEEKLY;BYDAY=MO" }) }], history: [] });
    expect(acc.rows.get("m")!.node.metadata.recur).toBe("FREQ=WEEKLY;BYDAY=MO");
  });

  test("merge off adds copies, like before", async () => {
    const acc = account(HOME);
    const res = await acc.run(FROM_AGENT, false);
    expect(res.created).toBe(5);
    expect(acc.byTitle("stretch")).toHaveLength(2);
  });
});

describe("sameRule", () => {
  test("ignores DTSTART, RRULE: prefix and part order", () => {
    expect(sameRule("RRULE:FREQ=WEEKLY;BYDAY=MO,TH", "DTSTART:20260101T000000Z\nBYDAY=MO,TH;FREQ=WEEKLY")).toBe(true);
    expect(sameRule("FREQ=WEEKLY;BYDAY=MO", "FREQ=WEEKLY;BYDAY=TU")).toBe(false);
  });
});
