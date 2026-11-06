// Client-side projection of the loop engine's rows into what the UI renders.
//
// The server stores flat rows (items, signals, runs, defs). Everything the
// screens need — rates, trends, merge roll-ups, effective definitions — is
// derived here from those rows, so changing a definition re-projects history
// instead of migrating data.

import type { Doc } from "../../convex/_generated/dataModel";
import * as L from "../../convex/loopLogic";

export type TypeMap = Record<string, L.TypeDef>;
export type WorkflowMap = Record<string, { def: L.WorkflowDef; version: number }>;
export type NamedDef<T> = { key: string; def: T; version: number };

function newestActive(defs: readonly Doc<"defs">[], kind: L.DefKind): Map<string, Doc<"defs">> {
  const out = new Map<string, Doc<"defs">>();
  for (const d of defs) {
    if (d.kind !== kind || d.status !== "active") continue;
    const cur = out.get(d.key);
    if (!cur || d.version > cur.version) out.set(d.key, d);
  }
  return out;
}

/** Built-in types overlaid with the newest active saved version of each. */
export function buildTypes(defs: readonly Doc<"defs">[]): TypeMap {
  const out: TypeMap = { ...L.BUILTIN_TYPES };
  for (const [key, row] of newestActive(defs, "type")) {
    const parsed = L.parseTypeDef(row.body);
    if (parsed.ok) out[key] = parsed.value;
  }
  return out;
}

export function buildWorkflows(defs: readonly Doc<"defs">[]): WorkflowMap {
  const out: WorkflowMap = {};
  for (const [key, def] of Object.entries(L.BUILTIN_WORKFLOWS)) out[key] = { def, version: 0 };
  for (const [key, row] of newestActive(defs, "workflow")) {
    const parsed = L.parseWorkflowDef(row.body);
    if (parsed.ok) out[key] = { def: parsed.value, version: row.version };
  }
  return out;
}

export function buildViews(defs: readonly Doc<"defs">[]): NamedDef<L.ViewDef>[] {
  const out: NamedDef<L.ViewDef>[] = [];
  for (const [key, row] of newestActive(defs, "view")) {
    const parsed = L.parseViewDef(row.body);
    if (parsed.ok) out.push({ key, def: parsed.value, version: row.version });
  }
  return out.sort((a, b) => a.def.name.localeCompare(b.def.name));
}

export function buildRules(defs: readonly Doc<"defs">[]): NamedDef<L.RuleDef>[] {
  const out: NamedDef<L.RuleDef>[] = [];
  for (const [key, row] of newestActive(defs, "rule")) {
    const parsed = L.parseRuleDef(row.body);
    if (parsed.ok) out.push({ key, def: parsed.value, version: row.version });
  }
  return out.sort((a, b) => a.def.name.localeCompare(b.def.name));
}

export type ItemModel = {
  item: Doc<"items">;
  id: string;
  typeDef: L.TypeDef | null;
  stateLabel: string;
  role: L.StateRole;
  signals: Doc<"signals">[]; // newest first, including merged-in children
  rate: number;
  trend: L.Trend;
  /** merged-in items (shown under the survivor) */
  merged: Doc<"items">[];
  activeRun: Doc<"runs"> | null;
  fields: Record<string, string | number | boolean>;
};

export type LoopModel = {
  /** surviving (not merged away) items, keyed by id */
  items: Map<string, ItemModel>;
  /** every item including merged ones, for lookups */
  allItems: Map<string, Doc<"items">>;
  rootOf: (id: string) => string;
  inbox: Doc<"signals">[]; // unattached, not dismissed, newest first
  dismissed: Doc<"signals">[];
  runs: Doc<"runs">[];
};

function parseFields(raw: string | undefined): Record<string, string | number | boolean> {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

export function buildModel(
  items: readonly Doc<"items">[],
  signals: readonly Doc<"signals">[],
  runs: readonly Doc<"runs">[],
  types: TypeMap,
  now: number,
): LoopModel {
  const allItems = new Map(items.map((i) => [i._id as string, i]));
  const rootOf = (id: string) => L.rootOf(id, (x) => (allItems.get(x)?.mergedInto as string | undefined) ?? null);

  const byRoot = new Map<string, Doc<"signals">[]>();
  const inbox: Doc<"signals">[] = [];
  const dismissed: Doc<"signals">[] = [];
  for (const s of signals) {
    if (s.dismissedAt) {
      dismissed.push(s);
    } else if (!s.itemId) {
      inbox.push(s);
    } else {
      const root = rootOf(s.itemId as string);
      const list = byRoot.get(root);
      if (list) list.push(s);
      else byRoot.set(root, [s]);
    }
  }
  inbox.sort((a, b) => b.at - a.at);
  dismissed.sort((a, b) => (b.dismissedAt ?? 0) - (a.dismissedAt ?? 0));

  const mergedBy = new Map<string, Doc<"items">[]>();
  for (const i of items) {
    if (!i.mergedInto) continue;
    const root = rootOf(i._id as string);
    if (root === (i._id as string)) continue;
    const list = mergedBy.get(root);
    if (list) list.push(i);
    else mergedBy.set(root, [i]);
  }

  const activeRunByRoot = new Map<string, Doc<"runs">>();
  for (const r of runs) {
    if (r.status !== "active" && r.status !== "verifying") continue;
    for (const id of r.itemIds) activeRunByRoot.set(rootOf(id as string), r);
  }

  const out = new Map<string, ItemModel>();
  for (const i of items) {
    if (i.mergedInto && rootOf(i._id as string) !== (i._id as string)) continue;
    const id = i._id as string;
    const sigs = (byRoot.get(id) ?? []).sort((a, b) => b.at - a.at);
    const times = sigs.map((s) => s.at);
    const typeDef = types[i.type] ?? null;
    const stateDef = typeDef?.states.find((s) => s.key === i.state);
    out.set(id, {
      item: i,
      id,
      typeDef,
      stateLabel: stateDef?.label ?? i.state,
      role: stateDef?.role ?? "open",
      signals: sigs,
      rate: L.ratePerWeek(times, now),
      trend: L.trendOf(times, now).trend,
      merged: mergedBy.get(id) ?? [],
      activeRun: activeRunByRoot.get(id) ?? null,
      fields: parseFields(i.fields),
    });
  }
  return { items: out, allItems, rootOf, inbox, dismissed, runs: [...runs] };
}

// ---------- formatting ----------

export function ago(ts: number, now: number): string {
  const d = Math.max(0, now - ts);
  const m = Math.floor(d / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 14) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export const TREND_MARK: Record<L.Trend, string> = {
  new: "new",
  rising: "↑",
  falling: "↓",
  flat: "→",
  quiet: "·",
};

export function rateLabel(rate: number): string {
  return rate === 0 ? "quiet" : `${rate}/wk`;
}

/** Weekly counts for the last `weeks` weeks, oldest first (for the tiny bar chart). */
export function weeklyBuckets(times: readonly number[], now: number, weeks = 8): number[] {
  const out = new Array<number>(weeks).fill(0);
  for (const t of times) {
    const age = now - t;
    if (age < 0 || age >= weeks * 7 * L.DAY_MS) continue;
    out[weeks - 1 - Math.floor(age / (7 * L.DAY_MS))]++;
  }
  return out;
}

// ---------- sigil cache (read by the main input without a subscription) ----------

const SIGIL_KEY = "todosst:loop-sigils";

export function loadSigils(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SIGIL_KEY);
    if (!raw) return L.DEFAULT_SIGILS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return L.DEFAULT_SIGILS;
    const out: Record<string, string> = { ...L.DEFAULT_SIGILS };
    for (const [c, key] of Object.entries(parsed as Record<string, unknown>)) {
      if (c.length === 1 && typeof key === "string" && L.isValidKey(key) && (L.USER_SIGIL_CHARS.includes(c) || c === "?")) {
        out[c] = key;
      }
    }
    return out;
  } catch {
    return L.DEFAULT_SIGILS;
  }
}

export function saveSigils(types: TypeMap): void {
  try {
    localStorage.setItem(SIGIL_KEY, JSON.stringify(L.sigilMapFromTypes(types)));
  } catch {}
}
