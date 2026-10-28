"use client";

// Vibe store — device-local IndexedDB for task embeddings + timing labels.
//
// Read-only for vectors: the on-device embedding model was dropped, so nothing
// writes new vectors — rows cached while it existed still drive the vibe
// override, and everything else falls back to the bandit. Embeddings are never
// uploaded (sentence vectors are invertible, so they stay local like the titles
// they came from) and labels (best-hour per vibe) stay here too. What leaves the
// device is anonymous numbers (hour, reward, "a label exists").

import type { VibeLabel } from "./vibe";
import { hashTitle } from "./vibe";

const DB_NAME = "todosst-vibe";
const DB_VERSION = 1;
const VECTORS = "vectors";
const LABELS = "labels";

const MAX_LABELS = 500;

export type VectorRow = {
  /** todo id */
  id: string;
  vec: number[];
  titleHash: string;
  at: number;
};

export type LabelRow = VibeLabel & {
  /** auto-increment key */
  id?: number;
  todoId?: string;
};

function idbAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!idbAvailable()) {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VECTORS)) db.createObjectStore(VECTORS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(LABELS)) {
        const s = db.createObjectStore(LABELS, { keyPath: "id", autoIncrement: true });
        s.createIndex("at", "at");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error("indexedDB unavailable"));
    };
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let req: IDBRequest<T>;
        try {
          req = run(db.transaction(store, mode).objectStore(store));
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
          return;
        }
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("indexedDB write failed"));
      })
  );
}

/** Cached vector for a todo id, or null when missing/stale (title changed). */
export async function getVector(todoId: string, title: string): Promise<number[] | null> {
  try {
    const row = await tx<VectorRow | undefined>(VECTORS, "readonly", (s) => s.get(todoId));
    if (!row || !Array.isArray(row.vec) || row.vec.length === 0) return null;
    if (row.titleHash !== hashTitle(title)) return null;
    return row.vec;
  } catch {
    return null;
  }
}

export async function listLabels(): Promise<LabelRow[]> {
  try {
    const all = await tx<LabelRow[]>(LABELS, "readonly", (s) => s.getAll());
    return all.filter((l) => Array.isArray(l.vec) && l.vec.length > 0);
  } catch {
    return [];
  }
}

/** Save a timing label (+ its augmented neighbors share the same hour). */
export async function saveLabel(label: Omit<LabelRow, "id">, variants: number[][] = []): Promise<void> {
  try {
    await tx(LABELS, "readwrite", (s) => s.add({ ...label, at: Date.now() }));
    for (const vec of variants) {
      await tx(LABELS, "readwrite", (s) =>
        s.add({ vec, hour: label.hour, at: Date.now(), augmented: true, todoId: label.todoId })
      ).catch(() => {});
    }
    try {
      const all = await tx<LabelRow[]>(LABELS, "readonly", (s) => s.getAll());
      if (all.length > MAX_LABELS) {
        const drop = all.sort((a, b) => a.at - b.at).slice(0, all.length - MAX_LABELS);
        for (const d of drop) {
          if (d.id !== undefined) await tx(LABELS, "readwrite", (s) => s.delete(d.id!)).catch(() => {});
        }
      }
    } catch {}
  } catch {}
}

export async function labelCount(): Promise<number> {
  try {
    const all = await tx<LabelRow[]>(LABELS, "readonly", (s) => s.getAll());
    return all.length;
  } catch {
    return 0;
  }
}
