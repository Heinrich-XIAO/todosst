"use client";

// Importing a backup file into an account, optionally merging by path.
//
// With merge on, an incoming task whose folder path + title already exists
// updates that task instead of adding a copy: its fields are taken from the
// backup, completion history is combined (the larger count per window wins),
// and a completed task stays completed. Importing the same file twice is then
// a no-op. This is what makes moving back and forth with todosst agent safe:
// its "download for todosst" file is a normal backup of the same shape.
//
// Counts in a backup are keyed by the source's windows. They are re-keyed to
// the window each day falls in on the target node, because a node's anchor
// (its creation time) is not carried by the file.

import type { PlainNode } from "./crypto";
import { recurState, windowDayFor, type RecurMetadata } from "./recur";
import { importOrder, type VaultSnapshot } from "./vaultFile";

export type ExistingTodo = { id: string; creationTime: number; node: PlainNode };
export type ExistingHistory = { rowId: string; todoId: string; counts: Map<number, number> };

export type ImportIO = {
  create: (node: PlainNode) => Promise<string>;
  update: (id: string, node: PlainNode) => Promise<void>;
  putHistory: (rowId: string | undefined, todoId: string, counts: Map<number, number>) => Promise<void>;
};

export type ImportResult = { created: number; updated: number; unchanged: number; history: number };

/** Same schedule, ignoring DTSTART lines (todosst anchors DTSTART-less rules at creation). */
export function sameRule(a: string, b: string): boolean {
  const body = (s: string) =>
    s
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/^RRULE:/i, ""))
      .filter((l) => l && !/^DTSTART/i.test(l))
      .join(";")
      .toUpperCase()
      .split(";")
      .filter(Boolean)
      .sort()
      .join(";");
  return body(a) === body(b);
}

function positiveCounts(...sources: (Record<string, number> | Map<number, number> | undefined)[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const src of sources) {
    if (!src) continue;
    const entries = src instanceof Map ? [...src.entries()] : Object.entries(src).map(([k, v]) => [Number(k), v] as const);
    for (const [day, v] of entries) {
      if (!Number.isInteger(day) || typeof v !== "number" || !(v > 0)) continue;
      out.set(day, Math.max(out.get(day) ?? 0, Math.floor(v)));
    }
  }
  return out;
}

const sameMap = (a: Map<number, number>, b: Map<number, number>) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

function withoutCounts(meta: PlainNode["metadata"]): PlainNode["metadata"] {
  const out = { ...meta };
  delete out.counts;
  return out;
}

/** Metadata for a matched node: the backup's fields over the existing ones.
 * A rule that only differs by DTSTART keeps the existing text. */
function mergeMeta(existing: PlainNode["metadata"], incoming: PlainNode["metadata"]): PlainNode["metadata"] {
  const out: PlainNode["metadata"] = { ...existing, ...withoutCounts(incoming) };
  if (typeof incoming.recur === "string" && existing.recur && sameRule(existing.recur, incoming.recur)) out.recur = existing.recur;
  return out;
}

export async function importSnapshot(
  snapshot: VaultSnapshot,
  existing: ExistingTodo[],
  existingHistory: ExistingHistory[],
  io: ImportIO,
  opts: { merge: boolean; now: number }
): Promise<ImportResult> {
  const order = importOrder(snapshot.todos);
  if (!order) throw new Error("backup contains a cycle, duplicate ids, or a missing parent.");
  const byId = new Map(snapshot.todos.map((t) => [t.id, t]));
  const incomingHistory = new Map<string, Record<string, number>>();
  for (const h of snapshot.history) incomingHistory.set(h.todoId, { ...incomingHistory.get(h.todoId), ...h.counts });

  // children by parent, for path matching (existing nodes first, then created ones)
  type Known = { id: string; creationTime: number; node: PlainNode };
  const kids = new Map<string | null, Known[]>();
  const addKid = (k: Known) => {
    const key = k.node.parentId ?? null;
    kids.set(key, [...(kids.get(key) ?? []), k]);
  };
  for (const e of existing) addKid(e);
  const baseOrder = new Map<string | null, number>();
  for (const [parent, list] of kids) baseOrder.set(parent, Math.max(...list.map((k) => k.node.order)));

  // rank of each incoming node among its incoming siblings, by its order
  const rank = new Map<string, number>();
  const siblings = new Map<string | null, string[]>();
  for (const t of snapshot.todos) siblings.set(t.node.parentId, [...(siblings.get(t.node.parentId) ?? []), t.id]);
  for (const list of siblings.values()) {
    list.sort((a, b) => byId.get(a)!.node.order - byId.get(b)!.node.order).forEach((id, i) => rank.set(id, i));
  }

  const histByTodo = new Map<string, { rowId: string; counts: Map<number, number> }>();
  for (const h of existingHistory) {
    const cur = histByTodo.get(h.todoId);
    histByTodo.set(h.todoId, { rowId: cur?.rowId ?? h.rowId, counts: positiveCounts(cur?.counts, h.counts) });
  }

  const idMap = new Map<string, string>();
  const created = new Set<string>();
  const result: ImportResult = { created: 0, updated: 0, unchanged: 0, history: 0 };

  for (const oldId of order) {
    const src = byId.get(oldId)!.node;
    const parentId = src.parentId ? (idMap.get(src.parentId) ?? null) : null;
    const candidates = opts.merge ? (kids.get(parentId) ?? []).filter((k) => k.node.title === src.title) : [];
    const match = candidates.find((k) => !k.node.isCompleted) ?? candidates[0];

    const anchor = match?.creationTime ?? opts.now;
    const meta = match ? mergeMeta(match.node.metadata, src.metadata) : withoutCounts(src.metadata);
    const isCompleted = Boolean(match?.node.isCompleted || src.isCompleted);
    if (match?.node.isCompleted) meta.completedAt = match.node.metadata.completedAt;

    // re-key the backup's counts onto this node's windows
    const incoming = positiveCounts(incomingHistory.get(oldId), src.metadata.counts);
    const mapped = new Map<number, number>();
    for (const [day, c] of incoming) {
      const w = await windowDayFor(meta as RecurMetadata, anchor, day);
      mapped.set(w, Math.max(mapped.get(w) ?? 0, c));
    }
    const prior = match ? histByTodo.get(match.id) : undefined;
    const before = positiveCounts(prior?.counts, match?.node.metadata.counts);
    const merged = positiveCounts(before, mapped);
    // the node's own counts hold its current window; carry that value over
    if (merged.size) {
      const { windowDay } = await recurState(meta as RecurMetadata, anchor, opts.now);
      const c = merged.get(windowDay);
      if (c && c > (meta.counts?.[String(windowDay)] ?? 0)) meta.counts = { ...meta.counts, [String(windowDay)]: c };
    }

    let id: string;
    if (match) {
      id = match.id;
      const next: PlainNode = { ...match.node, isCompleted, metadata: meta };
      if (JSON.stringify(next) !== JSON.stringify(match.node)) {
        await io.update(id, next);
        match.node = next;
        result.updated++;
      } else result.unchanged++;
    } else {
      const parentIsNew = parentId !== null && created.has(parentId);
      const order = parentIsNew ? src.order : (baseOrder.get(parentId) ?? -1) + 1 + (rank.get(oldId) ?? 0);
      const node: PlainNode = { v: 2, title: src.title, isCompleted, parentId, order, metadata: meta };
      id = await io.create(node);
      created.add(id);
      addKid({ id, creationTime: anchor, node });
      result.created++;
    }
    idMap.set(oldId, id);

    const old = positiveCounts(prior?.counts);
    if (merged.size && !sameMap(merged, old)) {
      await io.putHistory(prior?.rowId, id, merged);
      result.history++;
    }
  }
  return result;
}
