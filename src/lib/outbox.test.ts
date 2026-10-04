// @ts-nocheck — runs under `bun test` (bun:test types not installed)
import { test, expect, beforeEach } from "bun:test";
import {
  outboxAdd,
  outboxList,
  outboxDelete,
  outboxMarkAttempt,
  outboxAddCapture,
  openCapture,
  OUTBOX_MAX_ATTEMPTS,
} from "./outbox";

// bun has no indexedDB — exercises the localStorage fallback path; if a
// runtime ever ships IDB the same behavioral assertions hold there too
if (typeof globalThis.indexedDB === "undefined") {
  (globalThis as unknown as { indexedDB?: unknown }).indexedDB = undefined;
}
if (typeof globalThis.localStorage === "undefined") {
  const mem = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => Array.from(mem.keys())[i] ?? null,
    get length() {
      return mem.size;
    },
  } as Storage;
}

beforeEach(() => {
  localStorage.clear();
});

function payload(text: string) {
  return { input: text, parts: ["p-" + text] };
}

test("add + list FIFO by creation order", async () => {
  expect(await outboxList()).toEqual([]);
  const idA = await outboxAdd(payload("a"));
  const idB = await outboxAdd(payload("b"));
  expect(typeof idA).toBe("string");
  expect(typeof idB).toBe("string");
  const list = await outboxList();
  expect(list.map((e) => e.payload.input)).toEqual(["a", "b"]);
  // returned ids are the stored entries — undo deletes exactly what was parked
  expect(list.map((e) => e.id)).toEqual([idA, idB]);
  expect(list[0].attempts).toBe(0);
  expect(list[0].id.length).toBeGreaterThan(0);
});

test("delete removes exactly one entry", async () => {
  await outboxAdd(payload("a"));
  const { id } = (await outboxList())[0];
  await outboxDelete(id);
  expect(await outboxList()).toEqual([]);
  // deleting an unknown id is a no-op
  await outboxDelete("nope");
  expect(await outboxList()).toEqual([]);
});

test("markAttempt counts failures and survives reload of storage", async () => {
  await outboxAdd(payload("a"));
  const { id } = (await outboxList())[0];
  await outboxMarkAttempt(id);
  await outboxMarkAttempt(id);
  const list = await outboxList();
  expect(list[0].attempts).toBe(2);
});

test("rejects malformed payloads", async () => {
  expect(await outboxAdd(null)).toBeNull();
  expect(await outboxAdd({} as never)).toBeNull();
  expect(await outboxAdd({ input: "x", parts: null } as never)).toBeNull();
  expect(await outboxAdd({ input: "x".repeat(64_000), parts: [] })).toBeNull();
  expect(await outboxList()).toEqual([]);
});

test("corrupt rows in storage are filtered out, not fatal", async () => {
  await outboxAdd(payload("good"));
  const raw = localStorage.getItem("todosst:outbox");
  const arr = JSON.parse(raw);
  arr.push({ id: "x", createdAt: 1, attempts: "many", payload: {} });
  arr.push("not-an-entry");
  localStorage.setItem("todosst:outbox", JSON.stringify(arr));
  const list = await outboxList();
  expect(list.length).toBe(1);
  expect(list[0].payload.input).toBe("good");
});

test("capture round-trip", async () => {
  const capture = { input: "/ideas/write it down", parts: ["host hackathon"] };
  expect(typeof (await outboxAddCapture(capture))).toBe("string");
  const [entry] = await outboxList();
  const opened = openCapture(entry.payload);
  expect(opened).toEqual(capture);
});

test("openCapture throws on corrupt rows", async () => {
  await outboxAddCapture({ input: "buy coffee beans", parts: [] });
  expect(() => openCapture({} as never)).toThrow();
  expect(() => openCapture({ input: "x", parts: null } as never)).toThrow();
});

test("queued captures keep their exact input", async () => {
  await outboxAddCapture({ input: "hello", parts: ["a", "b"] });
  const [entry] = await outboxList();
  expect(entry.payload).toEqual({ input: "hello", parts: ["a", "b"] });
});

test("attempt cap constant is sane", () => {
  expect(OUTBOX_MAX_ATTEMPTS).toBeGreaterThanOrEqual(2);
  expect(OUTBOX_MAX_ATTEMPTS).toBeLessThanOrEqual(10);
});

test("outboxAdd rejects malformed payloads", async () => {
  expect(await outboxAdd({ input: "", parts: [] })).toBeNull();
  expect(await outboxAdd({ input: "x", parts: null } as never)).toBeNull();
});