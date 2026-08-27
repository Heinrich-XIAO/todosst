"use client";

// E2E primitives: PBKDF2(SHA-256, 310k) -> AES-GCM-256
// Payload is JSON { title, isCompleted } encrypted with random 12-byte IV per todo.
// Salt is 16 bytes per user, stored server-side (public, not secret) in userSalts table.

const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

// ---------- base64 helpers (url-safe not needed; use standard base64) ----------
function bufToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------- salt ----------
export function generateSaltB64(): string {
  const bytes = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(bytes);
  return bufToBase64(bytes);
}

// ---------- key derivation ----------
export async function deriveKey(password: string, saltB64: string): Promise<CryptoKey> {
  const salt = base64ToBuf(saltB64);
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password) as unknown as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable
    ["encrypt", "decrypt"]
  );
}

// For persistence we need an extractable version to stash in sessionStorage/IndexedDB?
// We keep non-extractable by default; we derive fresh on unlock using password.
// If you must cache, use deriveExtractableKey + export.
export async function deriveExtractableKey(
  password: string,
  saltB64: string
): Promise<CryptoKey> {
  const salt = base64ToBuf(saltB64);
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password) as unknown as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportKeyB64(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return bufToBase64(raw);
}

export async function importKeyB64(b64: string): Promise<CryptoKey> {
  const raw = base64ToBuf(b64);
  return await crypto.subtle.importKey("raw", raw as unknown as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

// ---------- encrypt / decrypt ----------
export type EncryptedPayload = { iv: string; ciphertext: string };

export async function encryptString(
  key: CryptoKey,
  plaintext: string
): Promise<EncryptedPayload> {
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, enc.encode(plaintext) as unknown as BufferSource);
  return { iv: bufToBase64(iv), ciphertext: bufToBase64(ct) };
}

export async function decryptString(
  key: CryptoKey,
  ivB64: string,
  ciphertextB64: string
): Promise<string> {
  const iv = base64ToBuf(ivB64);
  const ct = base64ToBuf(ciphertextB64);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, ct as unknown as BufferSource);
  return new TextDecoder().decode(pt);
}

// Convenience: encrypt/decrypt todo object {title,isCompleted}
export type PlainTodo = { title: string; isCompleted: boolean };

export async function encryptTodo(
  key: CryptoKey,
  todo: PlainTodo
): Promise<EncryptedPayload> {
  return encryptString(key, JSON.stringify(todo));
}

export async function decryptTodo(
  key: CryptoKey,
  iv: string,
  ciphertext: string
): Promise<PlainTodo> {
  const json = await decryptString(key, iv, ciphertext);
  const parsed = JSON.parse(json) as PlainTodo;
  if (typeof parsed.title !== "string" || typeof parsed.isCompleted !== "boolean")
    throw new Error("invalid todo payload");
  return parsed;
}

// normalize email/username to the same key used by AuthForm + auth.ts
export function normalizeEmail(input: string): string {
  const raw = input.trim().toLowerCase();
  if (!raw) return raw;
  return raw.includes("@") ? raw : `${raw}@todosst.local`;
}
