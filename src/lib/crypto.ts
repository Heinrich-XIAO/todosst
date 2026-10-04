"use client";

// Plain node payload + a fenced legacy decrypt for the one-time migration.
//
// Storage is plaintext JSON: {v:2,title,isCompleted,parentId,order,metadata}
// travels as-is and the server reads it directly.
//
// LEGACY: accounts created before the move to plaintext storage have their rows
// as AES-GCM ciphertext under a vault key derived from the old account password
// (PBKDF2-SHA-256, 310k iterations, per-user salt). The helpers below exist
// solely so `legacyDecrypt.ts` can open those rows on the user's own device and
// write them back as plaintext. New writes never encrypt. Once every account
// has migrated, this file's legacy half (and convex/vault.ts, convex/
// encryption.ts, the userSalts + vaultKeys tables) can be deleted.

// ---------- node payload ----------

export type PlainNode = {
  v: 2;
  title: string;
  isCompleted: boolean;
  parentId: string | null; // Id<"todos"> as string, null = root
  order: number;
  metadata: {
    description?: string;
    // local midnight of the due day (see src/lib/due.ts) — legacy rows may
    // hold UTC midnight; normalizeDueAt migrates them on read
    dueAt?: number | null;
    // time of day for the due date, minutes since local midnight — unset =
    // date-only due (midnight), so "x minutes before" lands the evening
    // before (see dueInstant in src/lib/due.ts)
    dueTimeMin?: number;
    // reminders (see src/lib/reminders.ts) — only the derived remindAt
    // timestamps are mirrored to the server in plaintext
    reminder?: {
      enabled: boolean;
      offsetsMin?: number[]; // minutes before dueAt (default [15, 5])
    } | null;
    priority?: "low" | "med" | "high" | null;
    tags?: string[];
    icon?: string;
    color?: string;
    // recurrence (see src/lib/recur.ts) — internally always counts,
    // checkbox vs tally vs time is a rendering mode only
    recur?: string; // RFC 5545 RRULE string (jakubroztocil/rrule)
    mode?: "check" | "count" | "time";
    threshold?: number; // check mode: checked iff count >= threshold (default 1); time mode: goal in minutes; count mode: goal (unset = ∞ — tally never auto-completes)
    stepMin?: number; // time mode: minutes per + click (default 15)
    graceHours?: number; // window lock grace past midnight (default 4)
    counts?: Record<string, number>; // current window only (day-index -> count; time mode stores minutes); full history lives in todoHistory
    // auto-habit meta-task (see src/lib/ritual.ts) — the first-visit offer
    // creates "open todosst ~daily"; the app checks it whenever the today view
    // reaches all clear, feeding its heatmap as a side effect of the ritual
    habit?: boolean;
    // negative (avoid) task — recurring only (see src/lib/negative.ts): you
    // never complete it, you log slips; a window is held when it ends with
    // slips within tolerance. Slips reuse the counts storage.
    neg?: boolean;
    // slips tolerated per window (default 0) — held iff slips <= tol
    tol?: number;
    // epoch ms of the most recent transition into completed (plain tasks and
    // non-recurring tally/time thresholds); null = open. Unset on legacy rows
    // and never stamped for past-window credits (those are historical).
    completedAt?: number | null;
    // windowDay -> confirmation timestamp of manual "held" confirmations
    holds?: Record<string, number>;
  };
};

/** Parse a stored plaintext node, validating the parts the UI relies on. */
export function parseNode(json: string): PlainNode {
  const raw = JSON.parse(json) as unknown;
  if (!raw || typeof raw !== "object") throw new Error("invalid node payload");
  const n = raw as PlainNode;
  if (n.v !== 2) throw new Error("invalid node payload");
  if (typeof n.title !== "string" || typeof n.isCompleted !== "boolean") {
    throw new Error("invalid node payload");
  }
  if (n.parentId !== null && typeof n.parentId !== "string") throw new Error("invalid parentId");
  if (typeof n.order !== "number" || !Number.isFinite(n.order)) n.order = 0;
  if (!n.metadata || typeof n.metadata !== "object") n.metadata = {};
  return n;
}

export function encodeNode(node: PlainNode): string {
  return JSON.stringify(node);
}

/**
 * Rebuild a v2 payload from a source node, applying field overrides.
 * Every write site goes through this so no field can be silently dropped when
 * constructing the updated node.
 */
export function toPlainNode(
  src: Pick<PlainNode, "title" | "isCompleted" | "parentId" | "order" | "metadata">,
  overrides?: Partial<Omit<PlainNode, "v">>
): PlainNode {
  // Pick only payload fields — src is often a full TreeNode (with children,
  // depth, _raw…); serializing those would bloat the row and corrupt the
  // stored payload.
  return {
    v: 2,
    title: src.title,
    isCompleted: src.isCompleted,
    parentId: src.parentId,
    order: src.order,
    metadata: src.metadata,
    ...overrides,
  };
}

// ---------- legacy AES-GCM primitives (migration only) ----------

const PBKDF2_ITERATIONS = 310_000;
const IV_BYTES = 12;

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

/** Re-derive the legacy vault key from the old account password + salt. */
export async function deriveLegacyKey(password: string, saltB64: string): Promise<CryptoKey> {
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
      salt: base64ToBuf(saltB64) as unknown as BufferSource,
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
  return bufToBase64(await crypto.subtle.exportKey("raw", key));
}

export async function importKeyB64(b64: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", base64ToBuf(b64) as unknown as BufferSource, "AES-GCM", true, [
    "encrypt",
    "decrypt",
  ]);
}

/** AES-GCM-wrap a raw key (base64) under the given wrapping key. */
export async function wrapKeyB64(wrapKey: CryptoKey, rawKeyB64: string): Promise<{ iv: string; ciphertext: string }> {
  return await encryptString(wrapKey, rawKeyB64);
}

/** Unwrap a wrapped raw key back into a usable (extractable) CryptoKey. */
export async function unwrapKeyB64(
  wrapKey: CryptoKey,
  ivB64: string,
  ciphertextB64: string
): Promise<CryptoKey> {
  return importKeyB64(await decryptString(wrapKey, ivB64, ciphertextB64));
}

export async function encryptString(key: CryptoKey, plaintext: string): Promise<{ iv: string; ciphertext: string }> {
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, enc.encode(plaintext) as unknown as BufferSource);
  return { iv: bufToBase64(iv), ciphertext: bufToBase64(ct) };
}

export async function decryptString(key: CryptoKey, ivB64: string, ciphertextB64: string): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuf(ivB64) as unknown as BufferSource },
    key,
    base64ToBuf(ciphertextB64) as unknown as BufferSource
  );
  return new TextDecoder().decode(pt);
}

/** Decrypt one legacy todo row into a plaintext node. */
export async function decryptLegacyNode(
  key: CryptoKey,
  iv: string,
  ciphertext: string
): Promise<PlainNode> {
  return parseNode(await decryptString(key, iv, ciphertext));
}