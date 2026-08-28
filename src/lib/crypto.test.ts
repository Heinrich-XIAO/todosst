// @ts-nocheck — runs under `bun test` (bun:test types not installed)
import { test, expect } from "bun:test";
import {
  generateMasterKeyB64,
  generateRecoveryCode,
  normalizeRecoveryCode,
  deriveRecoveryKey,
  recoveryVerifier,
  wrapKeyB64,
  unwrapKeyB64,
  deriveKey,
  exportKeyB64,
  importKeyB64,
  encryptString,
  decryptString,
} from "./crypto";

test("master key is 32 random bytes", () => {
  const a = generateMasterKeyB64();
  const b = generateMasterKeyB64();
  expect(a).not.toBe(b);
  expect(Buffer.from(a, "base64").length).toBe(32);
});

test("recovery code format: 5 groups of 5", () => {
  const code = generateRecoveryCode();
  expect(code.split("-").length).toBe(5);
  for (const group of code.split("-")) {
    expect(group.length).toBe(5);
    expect(/^[0-9A-HJ-NP-TV-Z]+$/.test(group)).toBe(true);
  }
});

test("normalize folds ambiguous characters and separators", () => {
  expect(normalizeRecoveryCode("abcd-efgh-jklm-nopq-stuv")).toBe("ABCDEFGHJK1MN0PQSTVV");
  expect(normalizeRecoveryCode("  a,b.c_d!e ")).toBe("ABCDE");
  expect(normalizeRecoveryCode("io u")).toBe("10V");
});

test("recovery key derivation is deterministic after normalization", async () => {
  const salt = generateMasterKeyB64().slice(0, 22); // any b64 string works as salt material
  const code = generateRecoveryCode();
  const sloppy = code.toLowerCase().split("").reverse().join("").replace(/-/g, " ");
  const a = await exportKeyB64(await deriveRecoveryKey(code, salt));
  const b = await exportKeyB64(await deriveRecoveryKey(sloppy, salt));
  // reversal changes the code, so keys differ; but case/separator sloppiness does not:
  const c = await exportKeyB64(await deriveRecoveryKey(code.toLowerCase().replace(/-/g, " "), salt));
  expect(a).not.toBe(b);
  expect(a).toBe(c);
});

test("recovery verifier is deterministic and key-dependent", async () => {
  const salt = "AAAAAAAAAAAAAAAAAAAAAA==";
  const kr = await deriveRecoveryKey(generateRecoveryCode(), salt);
  const v1 = await recoveryVerifier(kr);
  const v2 = await recoveryVerifier(kr);
  expect(v1).toBe(v2);
  const kr2 = await deriveRecoveryKey(generateRecoveryCode(), salt);
  expect(await recoveryVerifier(kr2)).not.toBe(v1);
});

test("wrap/unwrap round trips the vault master key", async () => {
  const masterB64 = generateMasterKeyB64();
  const salt = "BBBBBBBBBBBBBBBBBBBBBA==";
  const wrapper = await deriveKey("correct horse battery", salt);
  const wrapped = await wrapKeyB64(wrapper, masterB64);
  const unwrapped = await unwrapKeyB64(wrapper, wrapped.iv, wrapped.ciphertext);
  expect(await exportKeyB64(unwrapped)).toBe(masterB64);
  // wrong wrapping key must fail
  const wrong = await deriveKey("wrong password!!", salt);
  await expect(unwrapKeyB64(wrong, wrapped.iv, wrapped.ciphertext)).rejects.toThrow();
});

test("wrapped master key can encrypt/decrypt like the original", async () => {
  const masterB64 = generateMasterKeyB64();
  const salt = "CCCCCCCCCCCCCCCCCCCCCA==";
  const wrapper = await deriveKey("pw12345678", salt);
  const wrapped = await wrapKeyB64(wrapper, masterB64);
  const master = await unwrapKeyB64(wrapper, wrapped.iv, wrapped.ciphertext);
  const original = await importKeyB64(masterB64);
  const { ciphertext, iv } = await encryptString(original, "hello vault");
  expect(await decryptString(master, iv, ciphertext)).toBe("hello vault");
});
