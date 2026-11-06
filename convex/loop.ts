import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId, stableUserId } from "./userScope";
import * as L from "./loopLogic";

// The loop engine's server side. Vocabulary and all decisions that don't need
// a database (rates, verification verdicts, definition validation, merge
// rules) live in loopLogic.ts; this file loads rows, applies those decisions
// and writes the audit trail.

type ItemMap = Map<string, Doc<"items">>;
type SignalStamp = { id: Id<"signals">; at: number };

const MAX_TITLE = 200;
const MAX_NOTE = 4_000;
const MAX_RUN_ITEMS = 20;
const LINK_KINDS = ["blocks", "caused-by", "relates", "fixes"];
const ACTIVE_RUN: Doc<"runs">["status"][] = ["active", "verifying"];

// ---------- loading ----------

async function loadItems(ctx: QueryCtx, userId: string): Promise<ItemMap> {
  const rows = await ctx.db
    .query("items")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return new Map(rows.map((r) => [r._id as string, r]));
}

const rootIdIn = (items: ItemMap, id: string): string =>
  L.rootOf(id, (x) => (items.get(x)?.mergedInto as string | undefined) ?? null);

async function ownItem(ctx: QueryCtx, userId: string, id: Id<"items">): Promise<Doc<"items">> {
  const item = await ctx.db.get(id);
  if (!item) throw new Error("item not found");
  if (item.userId !== userId) throw new Error("unauthorized");
  return item;
}

async function ownRun(ctx: QueryCtx, userId: string, id: Id<"runs">): Promise<Doc<"runs">> {
  const run = await ctx.db.get(id);
  if (!run) throw new Error("run not found");
  if (run.userId !== userId) throw new Error("unauthorized");
  return run;
}

async function ownDef(ctx: QueryCtx, userId: string, id: Id<"defs">): Promise<Doc<"defs">> {
  const def = await ctx.db.get(id);
  if (!def) throw new Error("definition not found");
  if (def.userId !== userId) throw new Error("unauthorized");
  return def;
}

async function activeDefRow(ctx: QueryCtx, userId: string, kind: string, key: string): Promise<Doc<"defs"> | null> {
  const rows = await ctx.db
    .query("defs")
    .withIndex("by_user_kind_key", (q) => q.eq("userId", userId).eq("kind", kind).eq("key", key))
    .collect();
  return rows.filter((r) => r.status === "active").sort((a, b) => b.version - a.version)[0] ?? null;
}

async function typeDefFor(ctx: QueryCtx, userId: string, key: string): Promise<L.TypeDef | null> {
  const row = await activeDefRow(ctx, userId, "type", key);
  if (row) {
    const parsed = L.parseTypeDef(row.body);
    if (parsed.ok) return parsed.value;
  }
  return L.BUILTIN_TYPES[key] ?? null;
}

async function workflowFor(
  ctx: QueryCtx,
  userId: string,
  key: string,
): Promise<{ def: L.WorkflowDef; version: number } | null> {
  const row = await activeDefRow(ctx, userId, "workflow", key);
  if (row) {
    const parsed = L.parseWorkflowDef(row.body);
    if (parsed.ok) return { def: parsed.value, version: row.version };
  }
  const builtin = L.BUILTIN_WORKFLOWS[key];
  return builtin ? { def: builtin, version: 0 } : null;
}

async function activeTypeSigils(ctx: QueryCtx, userId: string): Promise<Map<string, string>> {
  const rows = await ctx.db
    .query("defs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const out = new Map<string, string>();
  for (const [key, def] of Object.entries(L.BUILTIN_TYPES)) if (def.sigil) out.set(key, def.sigil);
  const newest = new Map<string, Doc<"defs">>();
  for (const r of rows) {
    if (r.kind !== "type" || r.status !== "active") continue;
    const cur = newest.get(r.key);
    if (!cur || r.version > cur.version) newest.set(r.key, r);
  }
  for (const [key, row] of newest) {
    const parsed = L.parseTypeDef(row.body);
    if (!parsed.ok) continue;
    if (parsed.value.sigil) out.set(key, parsed.value.sigil);
    else out.delete(key);
  }
  return out;
}

async function signalStampsFor(
  ctx: QueryCtx,
  userId: string,
  items: ItemMap,
  roots: ReadonlySet<string>,
): Promise<SignalStamp[]> {
  const out: SignalStamp[] = [];
  for (const item of items.values()) {
    if (item.userId !== userId || !roots.has(rootIdIn(items, item._id))) continue;
    const rows = await ctx.db
      .query("signals")
      .withIndex("by_item", (q) => q.eq("itemId", item._id))
      .collect();
    for (const s of rows) if (!s.dismissedAt) out.push({ id: s._id, at: s.at });
  }
  return out;
}

async function logEvent(ctx: MutationCtx, userId: string, kind: L.EventKind, refId: string, data?: unknown) {
  await ctx.db.insert("events", {
    userId,
    at: Date.now(),
    kind,
    refId,
    ...(data === undefined ? {} : { data: JSON.stringify(data) }),
  });
}

// ---------- state movement ----------

/** Move items to the state a role maps to, but only from the given current roles. */
async function moveToRole(
  ctx: MutationCtx,
  userId: string,
  items: ItemMap,
  itemIds: readonly string[],
  role: L.StateRole,
  fromRoles: readonly L.StateRole[],
  why: string,
) {
  const seen = new Set<string>();
  for (const raw of itemIds) {
    const id = rootIdIn(items, raw);
    if (seen.has(id)) continue;
    seen.add(id);
    const item = items.get(id);
    if (!item) continue;
    const def = await typeDefFor(ctx, userId, item.type);
    if (!def) continue;
    const cur = L.roleOfState(def, item.state);
    if (!cur || !fromRoles.includes(cur)) continue;
    const target = L.stateForRole(def, role);
    if (!target || target.key === item.state) continue;
    await ctx.db.patch(item._id, { state: target.key, updatedAt: Date.now() });
    items.set(id, { ...item, state: target.key });
    await logEvent(ctx, userId, "state", id, { from: item.state, to: target.key, why });
  }
}

const LIVE_ROLES: L.StateRole[] = ["open", "fixing", "watching"];

// ---------- runs ----------

async function activeRunCovering(ctx: QueryCtx, userId: string, items: ItemMap, rootId: string) {
  const runs = await ctx.db
    .query("runs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return runs.filter(
    (r) => ACTIVE_RUN.includes(r.status) && r.itemIds.some((i) => rootIdIn(items, i) === rootId),
  );
}

async function startRunInternal(
  ctx: MutationCtx,
  userId: string,
  items: ItemMap,
  args: { workflowKey: string; itemIds: readonly Id<"items">[]; title?: string; hypothesis?: string },
): Promise<Id<"runs">> {
  const wf = await workflowFor(ctx, userId, args.workflowKey);
  if (!wf) throw new Error(`no workflow "${args.workflowKey}"`);
  const roots: string[] = [];
  for (const id of args.itemIds) {
    const item = items.get(id as string);
    if (!item || item.userId !== userId) throw new Error("item not found");
    const root = rootIdIn(items, id as string);
    if (!roots.includes(root)) roots.push(root);
  }
  if (roots.length === 0) throw new Error("a run needs at least one item");
  if (roots.length > MAX_RUN_ITEMS) throw new Error(`at most ${MAX_RUN_ITEMS} items per run`);
  for (const root of roots) {
    if ((await activeRunCovering(ctx, userId, items, root)).length > 0) {
      throw new Error(`"${items.get(root)?.title ?? "an item"}" already has a run in progress`);
    }
  }
  const now = Date.now();
  const stamps = await signalStampsFor(ctx, userId, items, new Set(roots));
  const baselineRate = L.ratePerWeek(
    stamps.map((s) => s.at),
    now,
  );
  const first = items.get(roots[0]);
  const title = (args.title?.trim() || `${wf.def.name}: ${first?.title ?? ""}`).slice(0, MAX_TITLE);
  const hypothesis = (args.hypothesis?.trim() || wf.def.hypothesis || "").slice(0, 200);
  const runId = await ctx.db.insert("runs", {
    userId,
    workflowKey: args.workflowKey,
    workflowVersion: wf.version,
    title,
    ...(hypothesis ? { hypothesis } : {}),
    itemIds: roots as Id<"items">[],
    steps: L.buildSteps(wf.def),
    status: "active",
    verifyDays: wf.def.verifyDays,
    tolerance: wf.def.tolerance,
    baselineRate,
    startedAt: now,
  });
  await moveToRole(ctx, userId, items, roots, "fixing", ["open"], "run started");
  await logEvent(ctx, userId, "run-started", runId, { workflow: args.workflowKey, items: roots, baselineRate });
  for (const r of roots) await logEvent(ctx, userId, "run-started", r, { runId });
  if (wf.def.steps.length === 0) {
    const run = (await ctx.db.get(runId))!;
    await advanceRun(ctx, userId, items, run);
  }
  return runId;
}

/** All steps done: start the verify window (or finish outright when there is none). */
async function advanceRun(ctx: MutationCtx, userId: string, items: ItemMap, run: Doc<"runs">) {
  const now = Date.now();
  if (run.verifyDays > 0) {
    await ctx.db.patch(run._id, {
      status: "verifying",
      verifyStartedAt: now,
      verifyUntil: now + run.verifyDays * L.DAY_MS,
    });
    await moveToRole(ctx, userId, items, run.itemIds, "watching", ["open", "fixing"], "verifying");
    await logEvent(ctx, userId, "run-verifying", run._id, { days: run.verifyDays });
  } else {
    await ctx.db.patch(run._id, { status: "done", endedAt: now });
    await moveToRole(ctx, userId, items, run.itemIds, "done", LIVE_ROLES, "run done");
    await logEvent(ctx, userId, "run-step", run._id, { finished: true });
  }
}

async function reopenRun(
  ctx: MutationCtx,
  userId: string,
  items: ItemMap,
  run: Doc<"runs">,
  evidence: readonly SignalStamp[],
) {
  const now = Date.now();
  const since = run.verifyStartedAt ?? run.startedAt;
  const recurred = evidence.filter((e) => e.at >= since).sort((a, b) => a.at - b.at);
  const weeks = Math.max((now - since) / (7 * L.DAY_MS), 1 / 7);
  await ctx.db.patch(run._id, {
    status: "reopened",
    endedAt: now,
    evidence: recurred.slice(0, 20).map((e) => e.id),
    resultRate: Math.round((recurred.length / weeks) * 10) / 10,
  });
  await moveToRole(ctx, userId, items, run.itemIds, "open", ["fixing", "watching"], "recurred");
  await logEvent(ctx, userId, "run-reopened", run._id, { count: recurred.length });
  for (const i of run.itemIds) await logEvent(ctx, userId, "run-reopened", i, { runId: run._id, count: recurred.length });
}

/** Decide one verifying run now: verified, reopened, or still waiting. */
async function settleRun(ctx: MutationCtx, userId: string, items: ItemMap, run: Doc<"runs">) {
  if (run.status !== "verifying" || run.verifyStartedAt === undefined || run.verifyUntil === undefined) return;
  const roots = new Set(run.itemIds.map((i) => rootIdIn(items, i)));
  const stamps = await signalStampsFor(ctx, userId, items, roots);
  const now = Date.now();
  const verdict = L.verifyRun(
    { verifyStartedAt: run.verifyStartedAt, verifyUntil: run.verifyUntil, tolerance: run.tolerance },
    stamps.map((s) => s.at),
    now,
  );
  if (verdict.verdict === "reopen") {
    await reopenRun(ctx, userId, items, run, stamps);
  } else if (verdict.verdict === "verified") {
    const weeks = Math.max(run.verifyDays / 7, 1 / 7);
    await ctx.db.patch(run._id, {
      status: "verified",
      endedAt: now,
      resultRate: Math.round((verdict.count / weeks) * 10) / 10,
    });
    await moveToRole(ctx, userId, items, run.itemIds, "done", LIVE_ROLES, "held");
    await logEvent(ctx, userId, "run-verified", run._id, { baselineRate: run.baselineRate });
    for (const i of run.itemIds) await logEvent(ctx, userId, "run-verified", i, { runId: run._id });
  }
}

// ---------- attaching signals ----------

async function attachSignal(
  ctx: MutationCtx,
  userId: string,
  items: ItemMap,
  signal: Doc<"signals">,
  itemId: Id<"items">,
) {
  const target = items.get(itemId as string);
  if (!target || target.userId !== userId) throw new Error("item not found");
  const rootId = rootIdIn(items, itemId as string);
  const root = items.get(rootId)!;
  await ctx.db.patch(signal._id, { itemId: root._id });
  await logEvent(ctx, userId, "attached", rootId, { signalId: signal._id });

  // a resolved item that keeps happening is not resolved
  const def = await typeDefFor(ctx, userId, root.type);
  if (def && L.roleOfState(def, root.state) === "done") {
    await moveToRole(ctx, userId, items, [rootId], "open", ["done"], "recurred");
  }

  // an occurrence during a verify window can reopen the run right now
  const covering = await activeRunCovering(ctx, userId, items, rootId);
  for (const run of covering) if (run.status === "verifying") await settleRun(ctx, userId, items, run);

  await fireRules(ctx, userId, items, rootId);
}

async function fireRules(ctx: MutationCtx, userId: string, items: ItemMap, rootId: string) {
  const root = items.get(rootId);
  if (!root) return;
  const rules = await ctx.db
    .query("defs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const newest = new Map<string, Doc<"defs">>();
  for (const r of rules) {
    if (r.kind !== "rule" || r.status !== "active") continue;
    const cur = newest.get(r.key);
    if (!cur || r.version > cur.version) newest.set(r.key, r);
  }
  if (newest.size === 0) return;
  const stamps = await signalStampsFor(ctx, userId, items, new Set([rootId]));
  const times = stamps.map((s) => s.at);
  const fired = await ctx.db
    .query("events")
    .withIndex("by_user_ref", (q) => q.eq("userId", userId).eq("refId", rootId))
    .collect();
  const now = Date.now();
  for (const [key, row] of newest) {
    const parsed = L.parseRuleDef(row.body);
    if (!parsed.ok) continue;
    const stamp = `${key}@${row.version}`;
    if (fired.some((e) => e.kind === "rule-fired" && e.data && JSON.parse(e.data).rule === stamp)) continue;
    if (!L.ruleMatches(parsed.value, root.type, times, now)) continue;
    await logEvent(ctx, userId, "rule-fired", rootId, { rule: stamp });
    const rule = parsed.value;
    if (rule.setRole) await moveToRole(ctx, userId, items, [rootId], rule.setRole, LIVE_ROLES, `rule ${key}`);
    if (rule.startWorkflow) {
      try {
        await startRunInternal(ctx, userId, items, { workflowKey: rule.startWorkflow, itemIds: [root._id] });
      } catch {
        // already in a run, or the workflow was retired — the rule just notes it fired
      }
    }
  }
}

// ---------- queries ----------

export const items = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("items")
      .withIndex("by_user", (q) => q.eq("userId", stableUserId(identity.subject)))
      .collect();
  },
});

// newest first; bounded so a long-running log never makes the subscription heavy
export const signals = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("signals")
      .withIndex("by_user_at", (q) => q.eq("userId", stableUserId(identity.subject)))
      .order("desc")
      .take(1500);
  },
});

// one cheap read for the today screen's strip: counts only, bounded scans
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = stableUserId(identity.subject);
    const recent = await ctx.db
      .query("signals")
      .withIndex("by_user_at", (q) => q.eq("userId", userId))
      .order("desc")
      .take(400);
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);
    const verifying = runs.filter((r) => r.status === "verifying");
    const untils = verifying.map((r) => r.verifyUntil).filter((x): x is number => x !== undefined);
    return {
      inbox: recent.filter((s) => !s.itemId && !s.dismissedAt).length,
      working: runs.filter((r) => r.status === "active").length,
      verifying: verifying.length,
      nextVerifyUntil: untils.length ? Math.min(...untils) : null,
    };
  },
});

export const runs = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("runs")
      .withIndex("by_user", (q) => q.eq("userId", stableUserId(identity.subject)))
      .order("desc")
      .take(300);
  },
});

export const defs = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("defs")
      .withIndex("by_user", (q) => q.eq("userId", stableUserId(identity.subject)))
      .collect();
  },
});

export const links = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("links")
      .withIndex("by_user", (q) => q.eq("userId", stableUserId(identity.subject)))
      .collect();
  },
});

export const events = query({
  args: { refId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("events")
      .withIndex("by_user_ref", (q) => q.eq("userId", stableUserId(identity.subject)).eq("refId", args.refId))
      .order("desc")
      .take(60);
  },
});

// ---------- signals ----------

export const capture = mutation({
  args: {
    text: v.string(),
    source: v.optional(v.string()),
    typeHint: v.optional(v.string()),
    system: v.optional(v.boolean()),
    at: v.optional(v.number()),
    clientId: v.optional(v.string()),
    itemId: v.optional(v.id("items")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const text = args.text.trim();
    if (!text) throw new Error("nothing to capture");
    if (text.length > L.MAX_SIGNAL_CHARS) throw new Error(`captures are limited to ${L.MAX_SIGNAL_CHARS} characters`);
    if (args.clientId) {
      if (args.clientId.length > 80) throw new Error("bad client id");
      const dup = await ctx.db
        .query("signals")
        .withIndex("by_user_client", (q) => q.eq("userId", userId).eq("clientId", args.clientId))
        .first();
      if (dup) return dup._id; // offline replay that already landed
    }
    if (args.typeHint !== undefined && !L.isValidKey(args.typeHint)) throw new Error("bad type");
    const source = args.source && ["typed", "voice", "share", "system"].includes(args.source) ? args.source : "typed";
    const now = Date.now();
    const at = args.at !== undefined && Number.isFinite(args.at) ? Math.min(Math.max(args.at, 0), now) : now;
    const id = await ctx.db.insert("signals", {
      userId,
      text,
      at,
      source,
      ...(args.typeHint ? { typeHint: args.typeHint } : {}),
      ...(args.system ? { system: true } : {}),
      ...(args.clientId ? { clientId: args.clientId } : {}),
    });
    if (args.itemId) {
      const items = await loadItems(ctx, userId);
      const signal = (await ctx.db.get(id))!;
      await attachSignal(ctx, userId, items, signal, args.itemId);
    }
    return id;
  },
});

export const attach = mutation({
  args: { signalId: v.id("signals"), itemId: v.id("items") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const signal = await ctx.db.get(args.signalId);
    if (!signal || signal.userId !== userId) throw new Error("signal not found");
    const items = await loadItems(ctx, userId);
    if (signal.dismissedAt) await ctx.db.patch(signal._id, { dismissedAt: undefined });
    await attachSignal(ctx, userId, items, { ...signal, dismissedAt: undefined }, args.itemId);
  },
});

export const detach = mutation({
  args: { signalId: v.id("signals") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const signal = await ctx.db.get(args.signalId);
    if (!signal || signal.userId !== userId) throw new Error("signal not found");
    if (!signal.itemId) return;
    await logEvent(ctx, userId, "detached", signal.itemId, { signalId: signal._id });
    await ctx.db.patch(signal._id, { itemId: undefined });
  },
});

export const dismissSignal = mutation({
  args: { signalId: v.id("signals"), undo: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const signal = await ctx.db.get(args.signalId);
    if (!signal || signal.userId !== userId) throw new Error("signal not found");
    if (args.undo) {
      await ctx.db.patch(signal._id, { dismissedAt: undefined });
      return;
    }
    if (signal.itemId) throw new Error("detach it from its item first");
    await ctx.db.patch(signal._id, { dismissedAt: Date.now() });
  },
});

// ---------- items ----------

export const createItem = mutation({
  args: {
    title: v.string(),
    type: v.string(),
    signalIds: v.optional(v.array(v.id("signals"))),
    system: v.optional(v.boolean()),
    note: v.optional(v.string()),
    fields: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const title = args.title.trim();
    if (!title || title.length > MAX_TITLE) throw new Error(`title must be 1–${MAX_TITLE} characters`);
    if (args.note && args.note.length > MAX_NOTE) throw new Error("note too long");
    const def = await typeDefFor(ctx, userId, args.type);
    if (!def) throw new Error(`no type "${args.type}"`);
    let fields: string | undefined;
    if (args.fields) {
      const checked = L.validateFields(def, args.fields);
      if (!checked.ok) throw new Error(checked.error);
      if (Object.keys(checked.value).length > 0) fields = JSON.stringify(checked.value);
    }
    const now = Date.now();
    const id = await ctx.db.insert("items", {
      userId,
      type: args.type,
      title,
      ...(args.note?.trim() ? { note: args.note.trim() } : {}),
      state: L.initialState(def).key,
      ...(fields ? { fields } : {}),
      ...(args.system ? { system: true } : {}),
      createdAt: now,
      updatedAt: now,
    });
    await logEvent(ctx, userId, "created", id, { type: args.type });
    const items = await loadItems(ctx, userId);
    for (const sid of args.signalIds ?? []) {
      const signal = await ctx.db.get(sid);
      if (!signal || signal.userId !== userId) continue;
      await attachSignal(ctx, userId, items, signal, id);
    }
    return id;
  },
});

export const updateItem = mutation({
  args: {
    id: v.id("items"),
    title: v.optional(v.string()),
    note: v.optional(v.string()),
    state: v.optional(v.string()),
    fields: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const item = await ownItem(ctx, userId, args.id);
    const def = await typeDefFor(ctx, userId, item.type);
    const patch: Partial<Doc<"items">> = { updatedAt: Date.now() };
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title || title.length > MAX_TITLE) throw new Error(`title must be 1–${MAX_TITLE} characters`);
      patch.title = title;
    }
    if (args.note !== undefined) {
      if (args.note.length > MAX_NOTE) throw new Error("note too long");
      patch.note = args.note.trim();
    }
    if (args.state !== undefined && args.state !== item.state) {
      if (def && !def.states.some((s) => s.key === args.state)) throw new Error(`"${args.state}" is not a state of ${def.name}`);
      patch.state = args.state;
      await logEvent(ctx, userId, "state", item._id, { from: item.state, to: args.state, why: "manual" });
    }
    if (args.fields !== undefined) {
      if (def) {
        const checked = L.validateFields(def, args.fields);
        if (!checked.ok) throw new Error(checked.error);
        patch.fields = Object.keys(checked.value).length > 0 ? JSON.stringify(checked.value) : undefined;
      }
    }
    await ctx.db.patch(item._id, patch);
  },
});

export const mergeItems = mutation({
  args: { fromId: v.id("items"), intoId: v.id("items") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await ownItem(ctx, userId, args.fromId);
    await ownItem(ctx, userId, args.intoId);
    const items = await loadItems(ctx, userId);
    const mergedOf = (id: string) => (items.get(id)?.mergedInto as string | undefined) ?? null;
    if (!L.canMerge(args.fromId, args.intoId, mergedOf)) throw new Error("these can't be merged");
    const target = L.rootOf(args.intoId, mergedOf);
    await ctx.db.patch(args.fromId, { mergedInto: target as Id<"items">, updatedAt: Date.now() });
    items.set(args.fromId, { ...items.get(args.fromId)!, mergedInto: target as Id<"items"> });
    await logEvent(ctx, userId, "merged", target, { from: args.fromId });
    await logEvent(ctx, userId, "merged", args.fromId, { into: target });
    // the merged-in occurrences may have just pushed the target over a rule or into a verify window
    const covering = await activeRunCovering(ctx, userId, items, target);
    for (const run of covering) if (run.status === "verifying") await settleRun(ctx, userId, items, run);
    await fireRules(ctx, userId, items, target);
  },
});

export const unmergeItem = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const item = await ownItem(ctx, userId, args.id);
    if (!item.mergedInto) return;
    await ctx.db.patch(item._id, { mergedInto: undefined, updatedAt: Date.now() });
    await logEvent(ctx, userId, "unmerged", item._id, { was: item.mergedInto });
    await logEvent(ctx, userId, "unmerged", item.mergedInto, { split: item._id });
  },
});

export const linkItems = mutation({
  args: { from: v.id("items"), to: v.id("items"), kind: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!LINK_KINDS.includes(args.kind)) throw new Error("unknown link kind");
    if (args.from === args.to) throw new Error("an item can't link to itself");
    await ownItem(ctx, userId, args.from);
    await ownItem(ctx, userId, args.to);
    const existing = await ctx.db
      .query("links")
      .withIndex("by_from", (q) => q.eq("from", args.from))
      .collect();
    if (existing.some((l) => l.to === args.to && l.kind === args.kind)) return existing.find((l) => l.to === args.to && l.kind === args.kind)!._id;
    return await ctx.db.insert("links", { userId, from: args.from, to: args.to, kind: args.kind, createdAt: Date.now() });
  },
});

export const unlinkItems = mutation({
  args: { linkId: v.id("links") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const link = await ctx.db.get(args.linkId);
    if (!link || link.userId !== userId) throw new Error("link not found");
    await ctx.db.delete(link._id);
  },
});

// ---------- runs ----------

export const startRun = mutation({
  args: {
    workflowKey: v.string(),
    itemIds: v.array(v.id("items")),
    title: v.optional(v.string()),
    hypothesis: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const items = await loadItems(ctx, userId);
    return await startRunInternal(ctx, userId, items, args);
  },
});

export const toggleStep = mutation({
  args: { runId: v.id("runs"), stepId: v.string(), done: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const run = await ownRun(ctx, userId, args.runId);
    if (run.status !== "active") throw new Error("this run is no longer in its steps");
    if (!run.steps.some((s) => s.id === args.stepId)) throw new Error("step not found");
    const now = Date.now();
    const steps = run.steps.map((s) =>
      s.id === args.stepId ? { id: s.id, title: s.title, done: args.done, ...(args.done ? { doneAt: now } : {}) } : s,
    );
    await ctx.db.patch(run._id, { steps });
    await logEvent(ctx, userId, "run-step", run._id, { step: args.stepId, done: args.done });
    if (L.allStepsDone(steps)) {
      const items = await loadItems(ctx, userId);
      await advanceRun(ctx, userId, items, { ...run, steps });
    }
  },
});

export const cancelRun = mutation({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const run = await ownRun(ctx, userId, args.runId);
    if (!ACTIVE_RUN.includes(run.status)) return;
    const items = await loadItems(ctx, userId);
    await ctx.db.patch(run._id, { status: "cancelled", endedAt: Date.now() });
    await moveToRole(ctx, userId, items, run.itemIds, "open", ["fixing", "watching"], "run cancelled");
    await logEvent(ctx, userId, "run-cancelled", run._id);
    // a cancelled system change must not leave its draft waiting forever
    const drafts = await ctx.db
      .query("defs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const d of drafts) if (d.status === "draft" && d.runId === run._id) await ctx.db.patch(d._id, { status: "retired" });
  },
});

/** Settle this user's verifying runs that are due or have already recurred. Idempotent. */
export const settle = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const verifying = runs.filter((r) => r.status === "verifying");
    if (verifying.length === 0) return 0;
    const items = await loadItems(ctx, userId);
    for (const run of verifying) await settleRun(ctx, userId, items, run);
    return verifying.length;
  },
});

/** Cron: verify every run whose window has ended, for all users. */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const due = await ctx.db
      .query("runs")
      .withIndex("by_status_until", (q) => q.eq("status", "verifying").lte("verifyUntil", Date.now()))
      .take(200);
    const itemCache = new Map<string, ItemMap>();
    for (const run of due) {
      let items = itemCache.get(run.userId);
      if (!items) {
        items = await loadItems(ctx, run.userId);
        itemCache.set(run.userId, items);
      }
      await settleRun(ctx, run.userId, items, run);
    }
    return due.length;
  },
});

// ---------- definitions (the system's own shape) ----------

const defKind = v.union(v.literal("type"), v.literal("workflow"), v.literal("view"), v.literal("rule"));

async function assertSigilFree(ctx: QueryCtx, userId: string, key: string, body: string) {
  const parsed = L.parseTypeDef(body);
  if (!parsed.ok || !parsed.value.sigil) return;
  const taken = await activeTypeSigils(ctx, userId);
  for (const [otherKey, sigil] of taken) {
    if (otherKey !== key && sigil === parsed.value.sigil) {
      throw new Error(`"${sigil}" already captures into "${otherKey}"`);
    }
  }
}

async function nextVersion(ctx: QueryCtx, userId: string, kind: string, key: string): Promise<number> {
  const rows = await ctx.db
    .query("defs")
    .withIndex("by_user_kind_key", (q) => q.eq("userId", userId).eq("kind", kind).eq("key", key))
    .collect();
  return rows.reduce((m, r) => Math.max(m, r.version), 0) + 1;
}

export const saveDef = mutation({
  args: {
    kind: defKind,
    key: v.string(),
    body: v.string(),
    // a draft rides on a system-change run and changes nothing until applied
    draftForRun: v.optional(v.id("runs")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!L.isValidKey(args.key)) throw new Error("key must be lowercase letters, digits or dashes");
    const checked = L.validateDefBody(args.kind, args.body);
    if (!checked.ok) throw new Error(checked.error);
    if (args.kind === "type") await assertSigilFree(ctx, userId, args.key, checked.value);
    const version = await nextVersion(ctx, userId, args.kind, args.key);
    const now = Date.now();
    const existing = await ctx.db
      .query("defs")
      .withIndex("by_user_kind_key", (q) => q.eq("userId", userId).eq("kind", args.kind).eq("key", args.key))
      .collect();
    if (args.draftForRun) {
      const run = await ownRun(ctx, userId, args.draftForRun);
      if (run.workflowKey !== "system-change" || run.status !== "active") {
        throw new Error("drafts belong to an active system-change run");
      }
      for (const d of existing) if (d.status === "draft") await ctx.db.patch(d._id, { status: "retired" });
      const id = await ctx.db.insert("defs", {
        userId, kind: args.kind, key: args.key, version, status: "draft", body: checked.value, runId: run._id, createdAt: now,
      });
      await logEvent(ctx, userId, "def-saved", id, { kind: args.kind, key: args.key, version, draft: true });
      return id;
    }
    for (const d of existing) if (d.status === "active") await ctx.db.patch(d._id, { status: "retired" });
    const id = await ctx.db.insert("defs", {
      userId, kind: args.kind, key: args.key, version, status: "active", body: checked.value, createdAt: now,
    });
    await logEvent(ctx, userId, "def-saved", id, { kind: args.kind, key: args.key, version, draft: false });
    return id;
  },
});

export const applyDraft = mutation({
  args: { defId: v.id("defs") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const draft = await ownDef(ctx, userId, args.defId);
    if (draft.status !== "draft") throw new Error("only drafts can be applied");
    const checked = L.validateDefBody(draft.kind as L.DefKind, draft.body);
    if (!checked.ok) throw new Error(checked.error);
    if (draft.kind === "type") await assertSigilFree(ctx, userId, draft.key, checked.value);
    const existing = await ctx.db
      .query("defs")
      .withIndex("by_user_kind_key", (q) => q.eq("userId", userId).eq("kind", draft.kind).eq("key", draft.key))
      .collect();
    for (const d of existing) if (d.status === "active") await ctx.db.patch(d._id, { status: "retired" });
    await ctx.db.patch(draft._id, { status: "active", body: checked.value });
    await logEvent(ctx, userId, "def-applied", draft._id, { kind: draft.kind, key: draft.key, version: draft.version });
    // applying completes the carrying run's steps and starts its verify window
    if (draft.runId) {
      const run = await ctx.db.get(draft.runId);
      if (run && run.userId === userId && run.status === "active") {
        const now = Date.now();
        const steps = run.steps.map((s) => (s.done ? s : { id: s.id, title: s.title, done: true, doneAt: now }));
        await ctx.db.patch(run._id, { steps });
        const items = await loadItems(ctx, userId);
        await advanceRun(ctx, userId, items, { ...run, steps });
      }
    }
  },
});

export const discardDraft = mutation({
  args: { defId: v.id("defs") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const draft = await ownDef(ctx, userId, args.defId);
    if (draft.status !== "draft") throw new Error("only drafts can be discarded");
    await ctx.db.patch(draft._id, { status: "retired" });
  },
});

/** Roll back by writing an old version's body as the new active version (history is never rewritten). */
export const rollbackDef = mutation({
  args: { kind: defKind, key: v.string(), toVersion: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("defs")
      .withIndex("by_user_kind_key", (q) => q.eq("userId", userId).eq("kind", args.kind).eq("key", args.key))
      .collect();
    const old = rows.find((r) => r.version === args.toVersion && r.status !== "draft");
    if (!old) throw new Error("that version doesn't exist");
    if (args.kind === "type") await assertSigilFree(ctx, userId, args.key, old.body);
    const version = rows.reduce((m, r) => Math.max(m, r.version), 0) + 1;
    for (const d of rows) if (d.status === "active") await ctx.db.patch(d._id, { status: "retired" });
    const id = await ctx.db.insert("defs", {
      userId, kind: args.kind, key: args.key, version, status: "active", body: old.body, createdAt: Date.now(),
    });
    await logEvent(ctx, userId, "def-rolled-back", id, { kind: args.kind, key: args.key, to: args.toVersion, version });
    return id;
  },
});

/** Retire a definition entirely (built-ins return to their default). */
export const retireDef = mutation({
  args: { kind: defKind, key: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("defs")
      .withIndex("by_user_kind_key", (q) => q.eq("userId", userId).eq("kind", args.kind).eq("key", args.key))
      .collect();
    for (const d of rows) if (d.status !== "retired") await ctx.db.patch(d._id, { status: "retired" });
  },
});

/** Start a system-change run, creating the system problem it is about when none is given. */
export const startSystemChange = mutation({
  args: { note: v.string(), itemIds: v.optional(v.array(v.id("items"))) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const note = args.note.trim();
    const items = await loadItems(ctx, userId);
    let itemIds = args.itemIds ?? [];
    if (itemIds.length === 0) {
      if (!note || note.length > MAX_TITLE) throw new Error(`describe the friction (1–${MAX_TITLE} characters)`);
      const def = (await typeDefFor(ctx, userId, "problem")) ?? L.BUILTIN_TYPES.problem;
      const now = Date.now();
      const id = await ctx.db.insert("items", {
        userId, type: "problem", title: note, state: L.initialState(def).key, system: true, createdAt: now, updatedAt: now,
      });
      await logEvent(ctx, userId, "created", id, { type: "problem", system: true });
      const created = (await ctx.db.get(id))!;
      items.set(id as string, created);
      itemIds = [id];
    }
    return await startRunInternal(ctx, userId, items, {
      workflowKey: "system-change",
      itemIds,
      title: note ? `system: ${note}`.slice(0, MAX_TITLE) : undefined,
    });
  },
});
