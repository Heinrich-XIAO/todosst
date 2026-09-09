"use client";

// Negative (avoid) tasks — "don't doom scroll". You never complete one; you
// log slips. A negative task must be recurring: each window inverts — at its
// end it is HELD when the slip count stayed within tolerance (metadata.tol,
// default 0), FAILED otherwise. Slips reuse the counts storage (day-index →
// count, same codec as tallies/time), so history and heatmap come free.
// metadata.holds records manual per-window confirmations: the user confirms a
// clean window as "held" (a prompt row in the today view), which stops the
// asking; a failed window can be sealed the same way, freezing its record.
// Unconfirmed ended windows resolve silently once a newer window rolls in (or
// after HOLD_GRACE_DAYS, whichever comes first — for daily and weekly rules
// the next window always wins).
//
// The only plaintext mirror beyond the ciphertext is the check-in reminder
// timestamp (window end) synced like any other reminder — the server learns
// when, never what.

import type { PlainNode } from "./crypto";
import {
  DAY_MS,
  dayIndexLocal,
  dayIndexToStart,
  parseRecurInput,
  type ParsedInput,
  type RecurState,
} from "./recur";
import type { DecryptedNode, TreeNode } from "./tree";

type Metadata = PlainNode["metadata"];

/** How long an unconfirmed clean past window keeps prompting before it
 * silently resolves as held. */
export const HOLD_GRACE_DAYS = 7;

/** Negative semantics only apply to tasks that actually carry a rule —
 * "avoid" picked before a schedule exists stays inert. The synchronous gate
 * checks for the FREQ component every stored rule has; full parse happens in
 * recurState (unparseable rules degrade to a plain window and are skipped). */
export function isNegative(meta: Metadata): boolean {
  return meta.neg === true && /FREQ=/i.test(String(meta.recur ?? ""));
}

/** Slips tolerated per window (held iff slips <= tol). Default 0. */
export function toleranceOf(meta: Metadata): number {
  const t = meta.tol;
  return typeof t === "number" && Number.isFinite(t) && t >= 0 ? Math.min(Math.floor(t), 999) : 0;
}

export type WindowOutcome = "held" | "failed";

export function windowOutcome(slips: number, tol: number): WindowOutcome {
  return slips <= tol ? "held" : "failed";
}

/** Confirmation timestamp of a window's manual record — a "held" confirm for
 * a clean window or a "seal" for a failed one; either way it closes the
 * window for good. */
export function holdOf(meta: Metadata, windowDay: number): number | undefined {
  const h = meta.holds?.[String(windowDay)];
  return typeof h === "number" && Number.isFinite(h) ? h : undefined;
}

/** New metadata with a window's hold recorded (immutable merge). */
export function withHold(meta: Metadata, windowDay: number, ts: number): Metadata {
  return { ...meta, holds: { ...(meta.holds ?? {}), [String(windowDay)]: ts } };
}

// ---------- input syntax ----------
// "don't doom scroll ~daily !" — a trailing "!" marks the negative flip, but
// only when a ~recurrence token is present, so excited titles ("buy tickets!")
// never lose their punctuation.

export type NegParsedInput = ParsedInput & { neg: boolean };

export function parseNegInput(raw: string): NegParsedInput {
  const first = parseRecurInput(raw);
  if (first.ruleStr) return { title: first.title, ruleStr: first.ruleStr, neg: false };
  const m = /\s*!\s*$/.exec(raw);
  if (!m) return { title: raw, ruleStr: null, neg: false };
  const second = parseRecurInput(raw.slice(0, m.index));
  if (!second.ruleStr) return { title: raw, ruleStr: null, neg: false };
  return { title: second.title, ruleStr: second.ruleStr, neg: true };
}

// ---------- today-view hold rows ----------

export type HoldItem = {
  node: TreeNode;
  /** open = current window, still accepting slips; confirm = past window that
   * ended clean and awaits the user's held-confirm; failed = past window over
   * tolerance (no prompt needed — it drops when the next window rolls, but it
   * can be sealed to freeze the record early) */
  kind: "open" | "confirm" | "failed";
  /** day index of the window this row is about */
  windowDay: number;
  slips: number;
  tol: number;
};

/**
 * Build the today view's holds section for negative tasks. Past windows reach
 * one level back (the window that just ended): anything older is either
 * confirmed, auto-resolved by the grace period, or dropped — history keeps
 * every day regardless.
 */
export function buildHoldItems(args: {
  nodes: DecryptedNode[] | null;
  tree: { map: Map<string, TreeNode> };
  recurStates: Map<string, RecurState> | null;
  /** previous window day per node id, as computed alongside recurStates */
  priorWindows: Map<string, number | null> | null;
  /** merged history + current-window counts per node id */
  counts: Map<string, Map<number, number>>;
  nowTs: number;
}): HoldItem[] | null {
  if (!args.nodes || !args.recurStates) return null;
  const today = dayIndexLocal(args.nowTs);
  const rows: HoldItem[] = [];
  for (const n of args.nodes) {
    const tn = args.tree.map.get(n._id as string);
    if (!tn) continue;
    const meta = n.metadata as Metadata;
    if (!isNegative(meta)) continue;
    const rs = args.recurStates.get(n._id as string);
    if (!rs?.isRecurring) continue;
    const tol = toleranceOf(meta);
    const history = args.counts.get(n._id as string);
    const slipsOf = (day: number): number => {
      const fromMeta = meta.counts?.[String(day)];
      const c = Math.max(
        typeof fromMeta === "number" && Number.isFinite(fromMeta) ? Math.floor(fromMeta) : 0,
        history?.get(day) ?? 0
      );
      return Math.max(0, c);
    };
    const endedRow = (windowDay: number): void => {
      // a manual record (held confirm or failure seal) closes the window —
      // it never prompts or accepts edits again
      if (holdOf(meta, windowDay) !== undefined) return;
      const slips = slipsOf(windowDay);
      if (windowOutcome(slips, tol) === "failed") {
        rows.push({ node: tn, kind: "failed", windowDay, slips, tol });
        return;
      }
      if (args.nowTs >= dayIndexToStart(windowDay) + DAY_MS + HOLD_GRACE_DAYS * DAY_MS) return;
      rows.push({ node: tn, kind: "confirm", windowDay, slips, tol });
    };
    if (rs.expired) {
      // exhausted rule — its final window just became history
      endedRow(rs.windowDay);
    } else if (rs.windowDay <= today) {
      rows.push({ node: tn, kind: "open", windowDay: rs.windowDay, slips: slipsOf(rs.windowDay), tol });
      const prior = args.priorWindows?.get(n._id as string);
      if (typeof prior === "number" && prior < rs.windowDay) endedRow(prior);
    }
  }
  rows.sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      a.windowDay - b.windowDay ||
      a.node.title.localeCompare(b.node.title)
  );
  return rows;
}
