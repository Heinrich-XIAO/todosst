"use client";

// Habit check-ins — the positive-task mirror of the battles held-confirm
// (see src/lib/negative.ts). A habit's just-ended window stays silent when it
// met its goal; when it fell short (missed) and has no manual record yet, the
// today view shows a task-sized row inside the habits section: a "missed?"
// button that freezes the miss, plus a "fix?" opener that corrects the past
// window's number until then. Correcting up to goal flips the row to a
// "did it?" confirm on its own — the same flip battles' confirm/failed rows
// do. Either button writes into metadata.holds (shared with battles — a
// per-window manual record), closing the window for good with toast undo.
//
// Scope is deliberately one level back (the window that just ended), with the
// same HOLD_GRACE_DAYS quiet-expiry as battles. History keeps every day
// regardless; a past-window correction lives in the history record alone
// (see applyCountWrite's targetDay path in TodoApp).

import type { PlainNode } from "./crypto";
import { DAY_MS, dayIndexLocal, dayIndexToStart, thresholdOf, type RecurState } from "./recur";
import { HOLD_GRACE_DAYS, holdOf, isNegative } from "./negative";
import type { DecryptedNode, TreeNode } from "./tree";

type Metadata = PlainNode["metadata"];

/** Below goal (missed) — the only habit state that prompts. A goalless tally
 * (threshold Infinity) can never meet a goal, so only a blank window misses;
 * any activity counts as shown-up. */
export function habitWindowMissed(count: number, threshold: number): boolean {
  if (!Number.isFinite(threshold)) return count <= 0;
  return count < threshold;
}

export type HabitConfirmItem = {
  node: TreeNode;
  /** day index of the missed window this row is about */
  windowDay: number;
  count: number;
  threshold: number;
};

/**
 * Build the today view's habit check-in rows: one per positive recurring task
 * whose just-ended window fell short with no manual record yet. Done windows
 * stay silent history; anything older than one level back is either
 * confirmed, auto-resolved by the grace period, or dropped.
 */
export function buildHabitConfirmItems(args: {
  nodes: DecryptedNode[] | null;
  tree: { map: Map<string, TreeNode> };
  recurStates: Map<string, RecurState> | null;
  /** previous window day per node id, as computed alongside recurStates */
  priorWindows: Map<string, number | null> | null;
  /** merged history + current-window counts per node id */
  counts: Map<string, Map<number, number>>;
  nowTs: number;
}): HabitConfirmItem[] | null {
  if (!args.nodes || !args.recurStates) return null;
  const today = dayIndexLocal(args.nowTs);
  const rows: HabitConfirmItem[] = [];
  for (const n of args.nodes) {
    const tn = args.tree.map.get(n._id as string);
    if (!tn) continue;
    const meta = n.metadata as Metadata;
    if (isNegative(meta)) continue;
    const rs = args.recurStates.get(n._id as string);
    if (!rs?.isRecurring) continue;
    const threshold = thresholdOf(meta);
    const history = args.counts.get(n._id as string);
    const countOf = (day: number): number => {
      const fromMeta = meta.counts?.[String(day)];
      const c = Math.max(
        typeof fromMeta === "number" && Number.isFinite(fromMeta) ? Math.floor(fromMeta) : 0,
        history?.get(day) ?? 0
      );
      return Math.max(0, c);
    };
    const endedRow = (windowDay: number): void => {
      // a manual record (missed freeze or did-it confirm) closes the window —
      // it never prompts or accepts edits again
      if (holdOf(meta, windowDay) !== undefined) return;
      const count = countOf(windowDay);
      // done windows are silent history — only missed ones prompt
      if (!habitWindowMissed(count, threshold)) return;
      if (args.nowTs >= dayIndexToStart(windowDay) + DAY_MS + HOLD_GRACE_DAYS * DAY_MS) return;
      rows.push({ node: tn, windowDay, count, threshold });
    };
    if (rs.expired) {
      // exhausted rule — its final window just became history
      endedRow(rs.windowDay);
    } else if (rs.windowDay <= today) {
      const prior = args.priorWindows?.get(n._id as string);
      if (typeof prior === "number" && prior < rs.windowDay) endedRow(prior);
    }
  }
  rows.sort((a, b) => a.windowDay - b.windowDay || a.node.title.localeCompare(b.node.title));
  return rows;
}
