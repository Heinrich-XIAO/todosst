"use client";

// Portable, passphrase-encrypted vault backups ("moving accounts" / restore).
// The file wraps a VaultSnapshot (decrypted todo nodes + history counts) with
// AES-GCM under a key derived from an export passphrase — independent of the
// account's vault key, so any account can import it.

import { decryptString, deriveKey, encryptString, type PlainNode } from "./crypto";

export const EXPORT_FORMAT = "todosst-export";
export const EXPORT_VERSION = 1;
const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;

export type ExportedTodo = { id: string; node: PlainNode };
export type ExportedHistory = { todoId: string; counts: Record<string, number> };
export type VaultSnapshot = { v: 1; todos: ExportedTodo[]; history: ExportedHistory[] };

export type ExportFile = {
  format: string;
  v: number;
  createdAt: number;
  counts: { todos: number; history: number };
  kdf: { name: "PBKDF2-SHA-256"; iterations: number; salt: string };
  cipher: { name: "AES-GCM"; iv: string };
  ciphertext: string;
};

// ---------- counts helpers (Map<number,number> <-> JSON-safe record) ----------

export function countsToRecord(map: Map<number, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [day, count] of map) out[String(day)] = count;
  return out;
}

export function recordToCounts(rec: Record<string, number>): Map<number, number> {
  const out = new Map<number, number>();
  for (const key of Object.keys(rec)) {
    const day = Number(key);
    if (Number.isInteger(day)) out.set(day, rec[key]);
  }
  return out;
}

// ---------- build ----------

function randomB64(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

/** Encrypt a snapshot under passphrase and assemble the export envelope. */
export async function buildExportFile(
  snapshot: VaultSnapshot,
  passphrase: string
): Promise<ExportFile> {
  const salt = randomB64(SALT_BYTES);
  const key = await deriveKey(passphrase, salt);
  const payload = await encryptString(key, JSON.stringify(snapshot));
  return {
    format: EXPORT_FORMAT,
    v: EXPORT_VERSION,
    createdAt: Date.now(),
    counts: { todos: snapshot.todos.length, history: snapshot.history.length },
    kdf: { name: "PBKDF2-SHA-256", iterations: PBKDF2_ITERATIONS, salt },
    cipher: { name: "AES-GCM", iv: payload.iv },
    ciphertext: payload.ciphertext,
  };
}

export function exportFilename(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `todosst-export-${y}-${m}-${d}.json`;
}

export function downloadExportFile(file: ExportFile, filename: string): void {
  const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- open ----------

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/**
 * Parse + decrypt an export file. Throws with a short, user-presentable
 * message on any structural or cryptographic failure.
 */
export async function openExportFile(
  json: string,
  passphrase: string
): Promise<VaultSnapshot> {
  let envelope: unknown;
  try {
    envelope = JSON.parse(json);
  } catch {
    throw new Error("not a valid backup file (bad json).");
  }
  if (!isRecord(envelope) || envelope.format !== EXPORT_FORMAT) {
    throw new Error("not a todosst backup file.");
  }
  if (envelope.v !== EXPORT_VERSION) {
    throw new Error(`unsupported backup version: ${String(envelope.v)}.`);
  }
  const kdf = isRecord(envelope.kdf) ? envelope.kdf : null;
  const iv = typeof envelope.cipher === "object" && envelope.cipher !== null && isRecord(envelope.cipher) ? envelope.cipher.iv : null;
  if (!kdf || typeof kdf.salt !== "string" || typeof iv !== "string" || typeof envelope.ciphertext !== "string") {
    throw new Error("backup file is missing encryption fields.");
  }

  let plaintext: string;
  try {
    const key = await deriveKey(passphrase, kdf.salt);
    plaintext = await decryptString(key, iv, envelope.ciphertext);
  } catch {
    throw new Error("wrong passphrase or corrupted backup.");
  }

  let snapshot: unknown;
  try {
    snapshot = JSON.parse(plaintext);
  } catch {
    throw new Error("corrupted backup payload.");
  }
  return validateSnapshot(snapshot);
}

/** Structural validation of a decrypted snapshot. */
export function validateSnapshot(snapshot: unknown): VaultSnapshot {
  if (!isRecord(snapshot) || snapshot.v !== 1 || !Array.isArray(snapshot.todos) || !Array.isArray(snapshot.history)) {
    throw new Error("backup payload has an unexpected shape.");
  }
  const todos: ExportedTodo[] = snapshot.todos.map((t) => {
    if (!isRecord(t) || typeof t.id !== "string" || !isRecord(t.node)) {
      throw new Error("backup contains an invalid task entry.");
    }
    const node = t.node as unknown as PlainNode;
    if (typeof node.title !== "string" || typeof node.isCompleted !== "boolean") {
      throw new Error("backup contains an invalid task entry.");
    }
    if (node.parentId !== null && typeof node.parentId !== "string") {
      throw new Error("backup contains an invalid task entry.");
    }
    return { id: t.id, node };
  });
  const history: ExportedHistory[] = snapshot.history.map((h) => {
    if (!isRecord(h) || typeof h.todoId !== "string" || !isRecord(h.counts)) {
      throw new Error("backup contains an invalid history entry.");
    }
    return { todoId: h.todoId, counts: h.counts as Record<string, number> };
  });
  return { v: 1, todos, history };
}

// ---------- import planning ----------

/**
 * Return todo ids ordered parents-before-children (stable: ties keep export
 * order). Returns null on duplicate ids, a missing parent, or a cycle.
 */
export function importOrder(todos: ExportedTodo[]): string[] | null {
  const byId = new Map<string, ExportedTodo>();
  for (const t of todos) {
    if (byId.has(t.id)) return null;
    byId.set(t.id, t);
  }
  const out: string[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string): boolean => {
    const st = state.get(id);
    if (st === "done") return true;
    if (st === "visiting") return false; // cycle
    const todo = byId.get(id);
    if (!todo) return false; // unreachable — checked below, kept for safety
    state.set(id, "visiting");
    if (todo.node.parentId !== null && byId.has(todo.node.parentId)) {
      if (!visit(todo.node.parentId)) return false;
    }
    state.set(id, "done");
    out.push(id);
    return true;
  };
  for (const t of todos) {
    if (t.node.parentId !== null && !byId.has(t.node.parentId)) {
      return null; // missing parent
    }
  }
  for (const t of todos) {
    if (!visit(t.id)) return null;
  }
  return out;
}
