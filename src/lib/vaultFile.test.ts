// @ts-nocheck — runs under `bun test` (bun:test types not installed)
import { test, expect } from "bun:test";
import { encryptNode, decryptNode, toPlainNode } from "./crypto";
import {
  buildExportFile,
  openExportFile,
  validateSnapshot,
  importOrder,
  countsToRecord,
  recordToCounts,
  exportFilename,
  EXPORT_FORMAT,
} from "./vaultFile";

function node(overrides = {}) {
  return toPlainNode({
    title: "task",
    isCompleted: false,
    parentId: null,
    order: 0,
    metadata: {},
    ...overrides,
  });
}

const PASS = "correct horse battery";

test("counts record round-trip", () => {
  const map = new Map([
    [12340, 3],
    [12341, 0],
  ]);
  const rec = countsToRecord(map);
  expect(rec["12340"]).toBe(3);
  const back = recordToCounts(rec);
  expect(back.get(12340)).toBe(3);
  expect(back.get(12341)).toBe(0);
  expect(back.size).toBe(2);
});

test("export filename has iso date", () => {
  expect(exportFilename(new Date("2026-08-28T12:00:00"))).toBe("todosst-export-2026-08-28.json");
});

test("export -> open round-trip preserves snapshot", async () => {
  const a = { id: "aaa", node: node({ title: "root" }) };
  const b = { id: "bbb", node: node({ title: "child", parentId: "aaa", order: 1 }) };
  const snapshot = {
    v: 1,
    todos: [a, b],
    history: [{ todoId: "aaa", counts: { "20001": 2 } }],
  };
  const file = await buildExportFile(snapshot, PASS);
  expect(file.format).toBe(EXPORT_FORMAT);
  expect(file.v).toBe(1);
  expect(file.counts).toEqual({ todos: 2, history: 1 });
  expect(file.kdf.iterations).toBeGreaterThan(100_000);
  expect(file.ciphertext).not.toContain("child");

  const opened = await openExportFile(JSON.stringify(file), PASS);
  expect(opened.todos).toHaveLength(2);
  expect(opened.todos[1].node.title).toBe("child");
  expect(opened.todos[1].node.parentId).toBe("aaa");
  expect(opened.history[0].counts["20001"]).toBe(2);
});

test("open rejects wrong passphrase", async () => {
  const file = await buildExportFile({ v: 1, todos: [], history: [] }, PASS);
  await expect(openExportFile(JSON.stringify(file), "wrong pass")).rejects.toThrow(/wrong passphrase/i);
});

test("open rejects non-todosst json and bad envelopes", async () => {
  await expect(openExportFile("not json", PASS)).rejects.toThrow(/bad json/i);
  await expect(openExportFile(JSON.stringify({ foo: 1 }), PASS)).rejects.toThrow(/not a todosst/i);
  await expect(
    openExportFile(JSON.stringify({ format: EXPORT_FORMAT, v: 99 }), PASS)
  ).rejects.toThrow(/unsupported backup version/i);
  await expect(
    openExportFile(JSON.stringify({ format: EXPORT_FORMAT, v: 1 }), PASS)
  ).rejects.toThrow(/missing encryption fields/i);
});

test("validateSnapshot rejects invalid entries", () => {
  expect(() => validateSnapshot({ v: 1 })).toThrow(/unexpected shape/i);
  expect(() =>
    validateSnapshot({ v: 1, todos: [{ id: "a", node: { v: 2 } }], history: [] })
  ).toThrow(/invalid task entry/i);
  expect(() =>
    validateSnapshot({ v: 1, todos: [], history: [{ todoId: 5, counts: {} }] })
  ).toThrow(/invalid history entry/i);
});

test("importOrder orders parents before children", () => {
  const order = importOrder([
    { id: "c", node: node({ parentId: "b" }) },
    { id: "a", node: node() },
    { id: "b", node: node({ parentId: "a" }) },
  ]);
  expect(order).toEqual(["a", "b", "c"]);
});

test("importOrder keeps export order among siblings", () => {
  const order = importOrder([
    { id: "z", node: node() },
    { id: "m", node: node() },
    { id: "z2", node: node({ parentId: "z" }) },
  ]);
  expect(order.indexOf("z")).toBeLessThan(order.indexOf("z2"));
  expect(order.indexOf("z")).toBeLessThan(order.indexOf("m"));
});

test("importOrder rejects missing parent", () => {
  expect(importOrder([{ id: "a", node: node({ parentId: "ghost" }) }])).toBeNull();
});

test("importOrder rejects duplicate ids", () => {
  const t = { id: "a", node: node() };
  expect(importOrder([t, t])).toBeNull();
});

test("importOrder rejects cycles", () => {
  expect(
    importOrder([
      { id: "a", node: node({ parentId: "b" }) },
      { id: "b", node: node({ parentId: "a" }) },
    ])
  ).toBeNull();
});

test("exported nodes decrypt back through the normal node codec", async () => {
  const src = node({ title: "check", isCompleted: true, metadata: { dueAt: 123, tags: ["x"] } });
  const key = await (async () => {
    const { generateSaltB64, deriveKey } = await import("./crypto");
    return deriveKey("somepassphrase", generateSaltB64());
  })();
  const payload = await encryptNode(key, src);
  const back = await decryptNode(key, payload.iv, payload.ciphertext);
  expect(back.title).toBe("check");
  expect(back.isCompleted).toBe(true);
  expect(back.metadata.dueAt).toBe(123);
});
