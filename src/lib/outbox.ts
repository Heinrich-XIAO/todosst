"use client";

// Offline capture outbox — raw command-input captures parked on-device while
// the network is down, replayed by TodoApp on the next unlocked+online open.
//
// E2E contract: the payload handed here is already vault-encrypted by the
// caller ({iv, ciphertext} of JSON {input, parts}); the outbox itself is a
// content-agnostic FIFO queue. Storage is IndexedDB, with a localStorage
// fallback for browsers where IDB is unavailable (private mode, quota) —
// nothing here ever touches the server; replay goes through the normal
// encrypted create path.

import { decryptString, encryptString } from "./crypto";

export type OutboxPayload = { iv: string; ciphertext: string };

export type OutboxEntry = {
  id: string;
  createdAt: number;
  attempts: number; // failed replay attempts — capped, then kept-but-skipped
  payload: OutboxPayload;
};

export type CapturePayload = {
  /** raw command-input text, replayed verbatim through the grammar */
  input: string;
  /** working-directory path segments (titles) at capture time */
  parts: string[];
};

const DB_NAME = "todosst-outbox";
const DB_VERSION = 1;
const STORE = "captures";
const LS_KEY = "todosst:outbox";

// hard limits so a corrupt or hostile row can't wedge the queue
const MAX_PAYLOAD_CHARS = 32_000;
const MAX_ATTEMPTS = 3;

export const OUTBOX_MAX_ATTEMPTS = MAX_ATTEMPTS;

function idbAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB unavailable"));
    req.onblocked = () => reject(new Error("indexedDB blocked"));
  });
}

// ---------- localStorage fallback ----------

function lsAvailable(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

function isValidEntry(e: unknown): e is OutboxEntry {
  if (!e || typeof e !== "object") return false;
  const entry = e as Partial<OutboxEntry>;
  return (
    typeof entry.id === "string" &&
    entry.id.length > 0 &&
    typeof entry.createdAt === "number" &&
    Number.isFinite(entry.createdAt) &&
    typeof entry.attempts === "number" &&
    entry.attempts >= 0 &&
    !!entry.payload &&
    typeof entry.payload.iv === "string" &&
    typeof entry.payload.ciphertext === "string" &&
    entry.payload.iv.length > 0 &&
    entry.payload.ciphertext.length > 0 &&
    entry.payload.ciphertext.length <= MAX_PAYLOAD_CHARS
  );
}

function lsRead(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

function lsWrite(entries: OutboxEntry[]): boolean {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

// ---------- public API ----------

export function newEntryId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}
  // non-secure contexts / very old engines
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Park an encrypted capture. Returns false when no storage was available. */
export async function outboxAdd(payload: OutboxPayload): Promise<boolean> {
  if (
    !payload ||
    typeof payload.iv !== "string" ||
    typeof payload.ciphertext !== "string" ||
    payload.iv.length === 0 ||
    payload.ciphertext.length === 0 ||
    payload.ciphertext.length > MAX_PAYLOAD_CHARS
  ) {
    return false;
  }
  const entry: OutboxEntry = { id: newEntryId(), createdAt: Date.now(), attempts: 0, payload };
  if (idbAvailable()) {
    try {
      const db = await openDb();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).add(entry);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error("outbox add failed"));
          tx.onabort = () => reject(tx.error ?? new Error("outbox add aborted"));
        });
        return true;
      } finally {
        db.close();
      }
    } catch {}
  }
  if (!lsAvailable()) return false;
  const entries = lsRead();
  entries.push(entry);
  return lsWrite(entries);
}

/** FIFO entries, oldest first. Empty array when storage is unavailable. */
export async function outboxList(): Promise<OutboxEntry[]> {
  if (idbAvailable()) {
    try {
      const db = await openDb();
      try {
        const entries = await new Promise<OutboxEntry[]>((resolve, reject) => {
          const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
          req.onsuccess = () => resolve(req.result as OutboxEntry[]);
          req.onerror = () => reject(req.error ?? new Error("outbox list failed"));
        });
        return (entries ?? []).filter(isValidEntry).sort((a, b) => a.createdAt - b.createdAt);
      } finally {
        db.close();
      }
    } catch {}
  }
  if (!lsAvailable()) return [];
  return lsRead();
}

export async function outboxDelete(id: string): Promise<void> {
  if (idbAvailable()) {
    try {
      const db = await openDb();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error("outbox delete failed"));
          tx.onabort = () => reject(tx.error ?? new Error("outbox delete aborted"));
        });
        return;
      } finally {
        db.close();
      }
    } catch {}
  }
  if (!lsAvailable()) return;
  lsWrite(lsRead().filter((e) => e.id !== id));
}

/** Count one failed replay attempt against an entry. */
export async function outboxMarkAttempt(id: string): Promise<void> {
  if (idbAvailable()) {
    try {
      const db = await openDb();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, "readwrite");
          const store = tx.objectStore(STORE);
          const getReq = store.get(id);
          getReq.onsuccess = () => {
            const entry = getReq.result as OutboxEntry | undefined;
            if (entry) store.put({ ...entry, attempts: entry.attempts + 1 });
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error("outbox mark failed"));
          tx.onabort = () => reject(tx.error ?? new Error("outbox mark aborted"));
        });
        return;
      } finally {
        db.close();
      }
    } catch {}
  }
  if (!lsAvailable()) return;
  const entries = lsRead();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  entry.attempts += 1;
  lsWrite(entries);
}

// ---------- capture payload codec (vault-encrypted) ----------

/** Encrypt a capture under the vault key and park it. */
export async function outboxAddCapture(key: CryptoKey, capture: CapturePayload): Promise<boolean> {
  const payload = await encryptString(key, JSON.stringify(capture));
  return await outboxAdd(payload);
}

/**
 * Decrypt a queued capture. Throws when the key doesn't match (vault key
 * rotated between capture and replay) or the row is corrupt — callers treat
 * that as a failed attempt, not a network problem.
 */
export async function openCapture(key: CryptoKey, payload: OutboxPayload): Promise<CapturePayload> {
  const json = await decryptString(key, payload.iv, payload.ciphertext);
  const raw = JSON.parse(json) as unknown;
  if (!raw || typeof raw !== "object") throw new Error("corrupt capture");
  const cap = raw as Partial<CapturePayload>;
  if (typeof cap.input !== "string" || !Array.isArray(cap.parts)) throw new Error("corrupt capture");
  return { input: cap.input, parts: cap.parts.filter((p): p is string => typeof p === "string") };
}