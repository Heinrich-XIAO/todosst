// @ts-nocheck — runs under `bun test` (bun:test types not installed)
import { test, expect } from "bun:test";
import { encryptNotifBlob, decryptNotifBlob, generateNotifKeyB64 } from "./notifKey";

test("encryptNotifBlob/decryptNotifBlob roundtrip", async () => {
  const key = generateNotifKeyB64();
  const blob = await encryptNotifBlob(key, "pay rent", 15);
  expect(blob.iv).not.toBe("");
  expect(blob.ct).not.toBe("");
  expect(await decryptNotifBlob(key, blob)).toEqual({ name: "pay rent", min: 15 });
  expect(await decryptNotifBlob(key, await encryptNotifBlob(key, "t — — x", 0))).toEqual({
    name: "t — — x",
    min: 0,
  });
});

test("decryptNotifBlob rejects a wrong key and a tampered blob", async () => {
  const key = generateNotifKeyB64();
  const blob = await encryptNotifBlob(key, "secret task", 5);
  expect(await decryptNotifBlob(generateNotifKeyB64(), blob)).toBeNull();
  const ct = atob(blob.ct);
  const flipped = btoa(String.fromCharCode(ct.charCodeAt(0) ^ 0xff) + ct.slice(1));
  expect(await decryptNotifBlob(key, { iv: blob.iv, ct: flipped })).toBeNull();
});

test("notifications never leak the task name to a reader without the key", async () => {
  const blob = await encryptNotifBlob(generateNotifKeyB64(), "dentist appointment", 30);
  const decoded = atob(blob.ct);
  expect(decoded).not.toContain("dentist");
});
