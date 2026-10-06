"use client";

// Dateless auto-nudge — client-side candidate selection + exhaustive telemetry.
//
// Policy today: epsilon-greedy with epsilon = 1 (pure exploration). The client
// picks ONE eligible dateless task uniformly at random and schedules it at a
// random time of day; every delivery logs anonymous numeric features (for the
// global bandit) plus a vault-encrypted FULL DUMP (for the future NN). The
// future NN gets, per event: an embedding of the task name (computed
// on-device at training time from the decrypted dump — never stored in
// plaintext server-side), the recurrence descriptor, lifetime counts, history,
// and timestamps.
//
// Task embeddings and timing labels never leave the device (see vibeStore.ts);
// everything uploaded here is either an anonymous number or a training dump.

import type { PlainNode } from "./crypto";
import { dayIndexLocal } from "./recur";
import type { RecurState } from "./recur";
import { isNegative } from "./negative";
import type { DecryptedNode, TreeNode } from "./tree";

export const AUTO_NUDGE_MAX_PER_DAY = 1;
/** full reward when the task finishes within this window after dispatch */
export const AUTO_COMPLETE_WINDOW_MS = 2 * 60 * 60 * 1000;
export const AUTO_REWARD_CLICK = 0.5;
export const AUTO_REWARD_COMPLETE = 1;
/** random delivery window (local): morning through evening, never the night */
export const AUTO_WINDOW_START_HOUR = 9;
export const AUTO_WINDOW_END_HOUR = 20;

export type AutoMode = "check" | "count" | "time";

export type AnonymousFeatures = {
  hourLocal: number;
  dowLocal: number;
  taskAgeDays: number;
  openCount: number;
  siblingCount: number;
  depth: number;
  hasChildren: boolean;
  mode: AutoMode;
  isRecurring: boolean;
  recurKind?: string;
  threshold: number;
  countBefore: number;
  priorCompletions: number;
};

/** Everything the future NN could want — encrypted wholesale with the vault
 * key before upload (`fb`). Includes the task name (for on-device embedding),
 * the full recurrence descriptor, per-window counts, lifetime history, and
 * scheduling context. The server stores the ciphertext blind. */
export type FullDump = {
  v: 1;
  event: "schedule";
  at: number;
  task: {
    id: string;
    title: string;
    isCompleted: boolean;
    parentId: string | null;
    order: number;
    createdAt: number;
    metadata: PlainNode["metadata"];
  };
  recur: {
    isRecurring: boolean;
    windowDay: number | null;
    count: number;
    threshold: number;
    mode: AutoMode;
    summary: string;
    expired: boolean;
    nextTs: number | null;
  } | null;
  historyCounts: Record<string, number>;
  lifetimeCompletions: number;
  context: {
    hourLocal: number;
    dowLocal: number;
    taskAgeDays: number;
    openCount: number;
    siblingCount: number;
    depth: number;
  };
};

function modeOf(meta: PlainNode["metadata"]): AutoMode {
  return meta.mode === "count" || meta.mode === "time" ? meta.mode : "check";
}

function thresholdOf(meta: PlainNode["metadata"]): number {
  const t = meta.threshold;
  if (typeof t === "number" && Number.isFinite(t) && t >= 1) return Math.min(Math.floor(t), 999);
  return modeOf(meta) === "count" ? 999 : 1;
}

/** Coarse recurrence family — safe to store in plaintext (no content). */
export function recurKindOf(ruleStr: string | undefined): string | undefined {
  if (!ruleStr) return undefined;
  const s = String(ruleStr).toUpperCase();
  if (/FREQ=DAILY/.test(s)) return s.includes("BYDAY=") ? "weekdays" : "daily";
  if (/FREQ=WEEKLY/.test(s)) return "weekly";
  if (/FREQ=MONTHLY/.test(s)) return "monthly";
  if (/FREQ=YEARLY/.test(s)) return "yearly";
  return "custom";
}

/**
 * Eligible for a dateless auto-nudge: open, no due date, not a battle
 * (negative), not the auto-habit meta-task. Recurring tasks are eligible ONLY
 * when their current window is open and below threshold — and dateless ones
 * at that (recurring tasks with a due date already surface via Today).
 */
export function isAutoNudgeEligible(
  n: DecryptedNode,
  rs: RecurState | undefined,
  nowTs: number
): boolean {
  const meta = n.metadata as PlainNode["metadata"];
  if (isNegative(meta)) return false; // battles/avoid tasks never get nudged
  if (meta.habit === true) return false;
  if (n.title === "— unable to read —") return false;
  if (meta.dueAt) return false; // has a due date → reminder system owns it
  if (rs?.isRecurring) {
    if (rs.expired) return false;
    if (rs.windowDay > dayIndexLocal(nowTs)) return false;
    return rs.count < thresholdOf(meta);
  }
  return !n.isCompleted;
}

export function eligibleAutoNudgeTasks(
  nodes: DecryptedNode[] | null,
  recurStates: Map<string, RecurState> | null,
  nowTs: number
): DecryptedNode[] {
  if (!nodes) return [];
  return nodes.filter((n) => isAutoNudgeEligible(n, recurStates?.get(n._id as string), nowTs));
}

/** Lifetime completions: history + current-window counts (recurring) or 0/1. */
export function lifetimeCompletions(
  meta: PlainNode["metadata"],
  historyCounts: Map<number, number> | undefined,
  rs: RecurState | undefined
): number {
  let total = 0;
  for (const c of Object.values(meta.counts ?? {})) {
    if (typeof c === "number" && Number.isFinite(c) && c > 0) total += Math.floor(c);
  }
  if (historyCounts) {
    for (const c of historyCounts.values()) total += c;
  }
  // current-window count may not be in either store yet
  if (rs?.isRecurring && rs.count > 0) {
    const wd = String(rs.windowDay);
    const inMeta = meta.counts?.[wd] ?? 0;
    if (rs.count > inMeta && !(historyCounts?.get(rs.windowDay) === rs.count)) {
      total += rs.count - inMeta;
    }
  }
  return total;
}

export function buildAnonymousFeatures(args: {
  node: TreeNode;
  rs: RecurState | undefined;
  historyCounts: Map<number, number> | undefined;
  openCount: number;
  siblingCount: number;
  scheduledFor: number;
}): AnonymousFeatures {
  const meta = args.node.metadata as PlainNode["metadata"];
  const d = new Date(args.scheduledFor);
  const taskAgeDays = Math.max(
    0,
    Math.floor((args.scheduledFor - args.node._creationTime) / 86_400_000)
  );
  return {
    hourLocal: d.getHours(),
    dowLocal: d.getDay(),
    taskAgeDays,
    openCount: Math.max(0, Math.floor(args.openCount)),
    siblingCount: Math.max(0, Math.floor(args.siblingCount)),
    depth: args.node.depth,
    hasChildren: args.node.children.length > 0,
    mode: modeOf(meta),
    isRecurring: !!args.rs?.isRecurring,
    recurKind: args.rs?.isRecurring ? recurKindOf(String(meta.recur ?? "")) : undefined,
    threshold: thresholdOf(meta),
    countBefore: args.rs?.count ?? 0,
    priorCompletions: lifetimeCompletions(meta, args.historyCounts, args.rs),
  };
}

export function buildFullDump(args: {
  node: DecryptedNode;
  treeNode: TreeNode | undefined;
  rs: RecurState | undefined;
  historyCounts: Map<number, number> | undefined;
  openCount: number;
  siblingCount: number;
  scheduledFor: number;
}): FullDump {
  const meta = args.node.metadata as PlainNode["metadata"];
  const d = new Date(args.scheduledFor);
  const hist: Record<string, number> = {};
  if (args.historyCounts) for (const [k, v] of args.historyCounts) hist[String(k)] = v;
  return {
    v: 1,
    event: "schedule",
    at: args.scheduledFor,
    task: {
      id: args.node._id as string,
      title: args.node.title,
      isCompleted: args.node.isCompleted,
      parentId: args.node.parentId,
      order: args.node.order,
      createdAt: args.node._creationTime,
      metadata: JSON.parse(JSON.stringify(meta)) as PlainNode["metadata"],
    },
    recur: args.rs
      ? {
          isRecurring: args.rs.isRecurring,
          windowDay: args.rs.windowDay,
          count: args.rs.count,
          threshold: thresholdOf(meta),
          mode: modeOf(meta),
          summary: args.rs.summary,
          expired: args.rs.expired,
          nextTs: args.rs.nextTs,
        }
      : null,
    historyCounts: hist,
    lifetimeCompletions: lifetimeCompletions(meta, args.historyCounts, args.rs),
    context: {
      hourLocal: d.getHours(),
      dowLocal: d.getDay(),
      taskAgeDays: Math.max(0, Math.floor((args.scheduledFor - args.node._creationTime) / 86_400_000)),
      openCount: args.openCount,
      siblingCount: args.siblingCount,
      depth: args.treeNode?.depth ?? 0,
    },
  };
}

/**
 * Random delivery time today (bandit exploration): uniform in the local
 * 09:00–20:00 window; when that already passed, now + 30–90 min. Pure
 * exploration for now (epsilon = 1) — every arm gets tried, every outcome
 * logged, the future policy learns from the log.
 */
export function randomDeliveryTime(nowTs: number, rand: () => number = Math.random): number {
  const d = new Date(nowTs);
  const start = new Date(d);
  start.setHours(AUTO_WINDOW_START_HOUR, 0, 0, 0);
  const end = new Date(d);
  end.setHours(AUTO_WINDOW_END_HOUR, 0, 0, 0);
  if (nowTs < end.getTime() - 5 * 60_000) {
    const lo = Math.max(nowTs + 5 * 60_000, start.getTime());
    const hi = end.getTime();
    if (hi > lo) return lo + Math.floor(rand() * (hi - lo));
  }
  return nowTs + 30 * 60_000 + Math.floor(rand() * 60 * 60_000);
}

/** Uniform-random pick (bandit arm = task × hour; exploration phase tries all). */
export function pickCandidate<T>(eligible: T[], rand: () => number = Math.random): T | null {
  if (eligible.length === 0) return null;
  return eligible[Math.floor(rand() * eligible.length)];
}

// ---------- contextual hour policy ----------
//
// The wiring constraint: the server can never see task content, so it can
// never pick the task or score content features — the decision MUST happen
// client-side, where the plaintext lives. The server's job is only (a) storing
// anonymous (ctxKey, hour → sends/reward) aggregates and (b) firing the chosen
// time blind. The client reads the aggregates back (own history + global
// population prior) and scores arms locally. Closed loop, nothing readable
// ever leaves the device.
//
// Arm = (ctxKey, hour). Context = "<mode>:<recurKind|once>" — coarse enough
// that arms get shared across tasks and accounts (a tally habit wants
// mornings, a one-shot task wants evenings), fine enough to matter.

export const POLICY_EPSILON = 0.25;
/** Laplace prior: cold-start arms behave as ~4 sends at 0.2 mean reward. */
export const POLICY_PRIOR_WEIGHT = 4;
export const POLICY_PRIOR_MEAN = 0.2;

export type ArmStats = { sends: number; reward: number };
export type HourStats = Record<string, ArmStats>;
export type PolicyStats = Record<string, HourStats>;

/** Context key for a task — safe to store in plaintext (no content). */
export function contextKeyOf(args: { mode: AutoMode; isRecurring: boolean; recurKind?: string }): string {
  return `${args.mode}:${args.isRecurring ? (args.recurKind ?? "custom") : "once"}`;
}

/** Blended arm mean: personal history + global population prior + Laplace smoothing. */
export function armMean(ctxKey: string, hour: number, mine: PolicyStats | null, global: PolicyStats | null): number {
  const m = mine?.[ctxKey]?.[String(hour)];
  const g = global?.[ctxKey]?.[String(hour)];
  const reward = (m?.reward ?? 0) + (g?.reward ?? 0) + POLICY_PRIOR_MEAN * POLICY_PRIOR_WEIGHT;
  const sends = (m?.sends ?? 0) + (g?.sends ?? 0) + POLICY_PRIOR_WEIGHT;
  return reward / sends;
}

/**
 * Choose the delivery hour for a task context: with probability epsilon try a
 * uniform-random future hour (exploration — this is the "random time of day"
 * that keeps training data flowing); otherwise take the best-scoring arm
 * (exploitation). Returns null when no hour today is still reachable — the
 * caller falls back to now + 30–90 min.
 */
export function chooseHour(
  ctxKey: string,
  mine: PolicyStats | null,
  global: PolicyStats | null,
  nowTs: number,
  rand: () => number = Math.random,
  epsilon: number = POLICY_EPSILON
): number | null {
  const future: number[] = [];
  for (let h = AUTO_WINDOW_START_HOUR; h <= AUTO_WINDOW_END_HOUR; h++) {
    const start = new Date(nowTs);
    start.setHours(h, 0, 0, 0);
    if (start.getTime() > nowTs + 5 * 60_000) future.push(h);
  }
  if (future.length === 0) return null;
  if (rand() < epsilon) return future[Math.floor(rand() * future.length)];
  let best = future[0];
  let bestMean = -Infinity;
  for (const h of future) {
    // jitter breaks ties randomly so cold-start arms spread instead of all
    // piling onto hour 9
    const mean = armMean(ctxKey, h, mine, global) + rand() * 1e-9;
    if (mean > bestMean) {
      bestMean = mean;
      best = h;
    }
  }
  return best;
}

/** Delivery instant for a chosen hour: that hour at a random minute. */
export function deliveryAtHour(hour: number, nowTs: number, rand: () => number = Math.random): number {
  const d = new Date(nowTs);
  d.setHours(hour, Math.floor(rand() * 60), 0, 0);
  if (d.getTime() > nowTs + 5 * 60_000) return d.getTime();
  return nowTs + 30 * 60_000 + Math.floor(rand() * 60 * 60_000);
}

// ---- local full-telemetry ring (device-side copy for future training export) ----

const LOCAL_KEY = "todosst:autoNudgeLog";
const LOCAL_MAX = 200;

export function appendLocalDump(dump: FullDump): void {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const arr: FullDump[] = raw ? (JSON.parse(raw) as FullDump[]) : [];
    arr.push(dump);
    while (arr.length > LOCAL_MAX) arr.shift();
    localStorage.setItem(LOCAL_KEY, JSON.stringify(arr));
  } catch {}
}

export function readLocalDumps(): FullDump[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? (arr as FullDump[]) : [];
  } catch {
    return [];
  }
}
