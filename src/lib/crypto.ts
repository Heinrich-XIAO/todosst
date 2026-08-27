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
// v1 = legacy flat todo, v2 = tree node with parent/order/metadata
export type PlainTodo = { title: string; isCompleted: boolean };
export type PlainNode = {
  v: 2;
  title: string;
  isCompleted: boolean;
  parentId: string | null; // Id<"todos"> as string, null = root
  order: number;
  metadata: {
    description?: string;
    dueAt?: number | null;
    priority?: "low" | "med" | "high" | null;
    tags?: string[];
    icon?: string;
    color?: string;
    // recurrence (see src/lib/recur.ts) — internally always counts,
    // checkbox vs tally is a rendering mode only
    recur?: string; // RFC 5545 RRULE string (jakubroztocil/rrule)
    mode?: "check" | "count";
    threshold?: number; // check mode: checked iff count >= threshold (default 1)
    graceHours?: number; // window lock grace past midnight (default 4)
    counts?: Record<string, number>; // current window only (day-index -> count); full history lives in todoHistory
  };
};

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

export async function encryptNode(
  key: CryptoKey,
  node: PlainNode
): Promise<EncryptedPayload> {
  return encryptString(key, JSON.stringify(node));
}

export async function decryptNode(
  key: CryptoKey,
  iv: string,
  ciphertext: string
): Promise<PlainNode> {
  const json = await decryptString(key, iv, ciphertext);
  const raw = JSON.parse(json) as unknown;
  if (!raw || typeof raw !== "object") throw new Error("invalid node payload");
  const obj = raw as Record<string, unknown>;
  // migrate v1 -> v2
  if (obj.v !== 2) {
    const v1 = raw as PlainTodo;
    if (typeof v1.title !== "string" || typeof v1.isCompleted !== "boolean")
      throw new Error("invalid todo payload");
    return {
      v: 2,
      title: v1.title,
      isCompleted: v1.isCompleted,
      parentId: null,
      order: 0,
      metadata: {},
    };
  }
  const n = raw as PlainNode;
  if (typeof n.title !== "string" || typeof n.isCompleted !== "boolean")
    throw new Error("invalid node payload");
  if (n.parentId !== null && typeof n.parentId !== "string") throw new Error("invalid parentId");
  if (typeof n.order !== "number" || !Number.isFinite(n.order)) n.order = 0;
  if (!n.metadata || typeof n.metadata !== "object") n.metadata = {};
  return n;
}

// helper to normalize parentId for comparisons
export function nodeParentId(n: PlainNode): string | null {
  return n.parentId ?? null;
}

// normalize email/username to the same key used by AuthForm + auth.ts
export function normalizeEmail(input: string): string {
  const raw = input.trim().toLowerCase();
  if (!raw) return raw;
  return raw.includes("@") ? raw : `${raw}@todosst.local`;
}
