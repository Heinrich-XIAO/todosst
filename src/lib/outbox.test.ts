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
import { deriveKey, generateSaltB64, encryptString, decryptString } from "./crypto";

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
  return { iv: "iv-" + text, ciphertext: "ct-" + text };
}

test("add + list FIFO by creation order", async () => {
  expect(await outboxList()).toEqual([]);
  const idA = await outboxAdd(payload("a"));
  const idB = await outboxAdd(payload("b"));
  expect(typeof idA).toBe("string");
  expect(typeof idB).toBe("string");
  const list = await outboxList();
  expect(list.map((e) => e.payload.ciphertext)).toEqual(["ct-a", "ct-b"]);
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
  expect(await outboxAdd({ iv: "", ciphertext: "x" })).toBeNull();
  expect(await outboxAdd({ iv: "i", ciphertext: "x".repeat(64_000) })).toBeNull();
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
  expect(list[0].payload.ciphertext).toBe("ct-good");
});

test("capture round-trip through the vault key", async () => {
  const salt = generateSaltB64();
  const key = await deriveKey("subway-thoughts", salt);
  const capture = { input: "/ideas/write it down", parts: ["host hackathon"] };
  expect(typeof (await outboxAddCapture(key, capture))).toBe("string");
  const [entry] = await outboxList();
  // stored encrypted — the raw input is not readable at rest
  expect(entry.payload.ciphertext).not.toContain("write it down");
  const opened = await openCapture(key, entry.payload);
  expect(opened).toEqual(capture);
});

test("openCapture throws on wrong key (vault rotated) and on corrupt rows", async () => {
  const salt = generateSaltB64();
  const key = await deriveKey("right-password", salt);
  const other = await deriveKey("wrong-password", salt);
  await outboxAddCapture(key, { input: "buy coffee beans", parts: [] });
  const [entry] = await outboxList();
  await expect(openCapture(other, entry.payload)).rejects.toThrow();
  await expect(openCapture(key, { iv: "i", ciphertext: "garbage" })).rejects.toThrow();
});

test("encrypted captures still decrypt with the original key", async () => {
  const salt = generateSaltB64();
  const key = await deriveKey("right-password", salt);
  await outboxAddCapture(key, { input: "hello", parts: ["a", "b"] });
  const [entry] = await outboxList();
  const json = await decryptString(key, entry.payload.iv, entry.payload.ciphertext);
  expect(JSON.parse(json)).toEqual({ input: "hello", parts: ["a", "b"] });
});

test("attempt cap constant is sane", () => {
  expect(OUTBOX_MAX_ATTEMPTS).toBeGreaterThanOrEqual(2);
  expect(OUTBOX_MAX_ATTEMPTS).toBeLessThanOrEqual(10);
});

test("encryptString sanity for the round-trip helpers above", async () => {
  const salt = generateSaltB64();
  const key = await deriveKey("pw", salt);
  const { iv, ciphertext } = await encryptString(key, "x");
  expect(await decryptString(key, iv, ciphertext)).toBe("x");
});