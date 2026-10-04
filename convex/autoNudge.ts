import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUserId } from "./userScope";

// Dateless auto-nudge — bandit policy today, full NN training data tomorrow.
//
// Flow (same E2E-safe pattern as reminders/nudges):
// 1. The client picks ONE eligible dateless task (open, no dueAt, non-recurring
//    or recurring-window-open, never negative/battle, never habit), chooses a
//    random time of day (bandit exploration, epsilon = 1 for now), builds the
//    anonymous numeric features + an opaque vault-encrypted full dump, and
//    calls `schedule`.
// 2. The minute cron (`dispatchDue`) fires due rows blind via pushActions.
// 3. The client reports `clicked` (app opened from the push → 0.5) and
//    `completed` (task finished within the window → 1.0) via `reportOutcome`.
// The server only ever sees numbers + opaque blobs — never titles, tags,
// descriptions, or embeddings.

const PAST_DROP_MS = 5 * 60 * 1000;
const STALE_GRACE_MS = 6 * 60 * 60 * 1000;
export const COMPLETE_WINDOW_MS = 2 * 60 * 60 * 1000;

const blob = v.optional(v.object({ iv: v.string(), ct: v.string() }));

function validBlob(b: { iv: string; ct: string } | undefined): { iv: string; ct: string } | undefined {
  if (!b) return undefined;
  if (b.iv.length >= 10 && b.iv.length <= 64 && b.ct.length > 0 && b.ct.length <= 8192) {
    return { iv: b.iv, ct: b.ct };
  }
  return undefined;
}

function num(n: unknown, min: number, max: number): number {
  const x = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 0;
  return Math.min(Math.max(x, min), max);
}

export const schedule = mutation({
  args: {
    todoId: v.id("todos"),
    scheduledFor: v.number(),
    utcOffsetMin: v.number(),
    hourLocal: v.number(),
    dowLocal: v.number(),
    taskAgeDays: v.number(),
    openCount: v.number(),
    siblingCount: v.number(),
    depth: v.number(),
    hasChildren: v.boolean(),
    mode: v.union(v.literal("check"), v.literal("count"), v.literal("time")),
    isRecurring: v.boolean(),
    recurKind: v.optional(v.string()),
    ctxKey: v.string(),
    threshold: v.number(),
    countBefore: v.number(),
    priorCompletions: v.number(),
    vibeSim: v.optional(v.number()),
    fb: blob,
    nt: blob,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    if (!Number.isFinite(args.scheduledFor)) throw new Error("invalid time");
    // too far past or absurdly far out — drop
    if (args.scheduledFor < now - PAST_DROP_MS) throw new Error("too old");
    if (args.scheduledFor > now + 24 * 60 * 60 * 1000) throw new Error("too far out");
    if (!Number.isInteger(args.utcOffsetMin) || args.utcOffsetMin < -720 || args.utcOffsetMin > 840) {
      throw new Error("invalid utc offset");
    }
    const todo = await ctx.db.get(args.todoId);
    if (!todo || todo.userId !== userId) throw new Error("unauthorized");
    if (args.recurKind !== undefined && args.recurKind.length > 32) throw new Error("invalid recurKind");
    if (!/^[a-z]+:(once|daily|weekdays|weekly|monthly|yearly|custom)$/.test(args.ctxKey)) {
      throw new Error("invalid ctxKey");
    }

    // one pending auto-nudge per user per day — newest schedule wins
    const localDay = Math.floor((args.scheduledFor + args.utcOffsetMin * 60_000) / 86_400_000);
    const mine = await ctx.db
      .query("autoNudgeEvents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const row of mine) {
      if (row.sentAt !== undefined) continue;
      const d = Math.floor((row.scheduledFor + args.utcOffsetMin * 60_000) / 86_400_000);
      if (d === localDay) await ctx.db.delete(row._id);
    }

    const id = await ctx.db.insert("autoNudgeEvents", {
      userId,
      todoId: args.todoId,
      scheduledFor: args.scheduledFor,
      hourLocal: num(args.hourLocal, 0, 23),
      dowLocal: num(args.dowLocal, 0, 6),
      taskAgeDays: num(args.taskAgeDays, 0, 3650),
      openCount: num(args.openCount, 0, 10000),
      siblingCount: num(args.siblingCount, 0, 10000),
      depth: num(args.depth, 0, 64),
      hasChildren: args.hasChildren,
      mode: args.mode,
      isRecurring: args.isRecurring,
      recurKind: args.recurKind,
      ctxKey: args.ctxKey,
      threshold: num(args.threshold, 1, 999),
      countBefore: num(args.countBefore, 0, 9999),
      priorCompletions: num(args.priorCompletions, 0, 100000),
      vibeSim:
        typeof args.vibeSim === "number" && Number.isFinite(args.vibeSim)
          ? Math.min(1, Math.max(0, args.vibeSim))
          : undefined,
      fb: validBlob(args.fb),
      nt: validBlob(args.nt),
      reward: 0,
    });

    const st = (await ctx.db.query("autoNudgeState").withIndex("by_user", (q) => q.eq("userId", userId)).collect())[0];
    if (st) {
      await ctx.db.patch(st._id, { utcOffsetMin: args.utcOffsetMin });
    } else {
      await ctx.db.insert("autoNudgeState", {
        userId,
        enabled: true,
        utcOffsetMin: args.utcOffsetMin,
        lastFiredDay: -1,
      });
    }
    return id;
  },
});

// Half reward (click): the app opened from this push. Full reward (completion):
// the task finished within COMPLETE_WINDOW_MS of dispatch. Reward is derived
// server-side from the two timestamps so clients can't forge 1.0 directly.
export const reportOutcome = mutation({
  args: {
    eventId: v.id("autoNudgeEvents"),
    clicked: v.optional(v.boolean()),
    completed: v.optional(v.boolean()),
    labeled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(args.eventId);
    if (!row || row.userId !== userId) return;
    const now = Date.now();
    const patch: { clickedAt?: number; completedAt?: number; reward?: number; labeled?: boolean } = {};
    if (args.clicked && row.clickedAt === undefined && row.sentAt !== undefined) {
      patch.clickedAt = now;
    }
    if (args.completed && row.completedAt === undefined && row.sentAt !== undefined) {
      if (now - row.sentAt <= COMPLETE_WINDOW_MS) patch.completedAt = now;
    }
    if (args.labeled && row.labeled !== true) patch.labeled = true;
    const clickedAt = patch.clickedAt ?? row.clickedAt;
    const completedAt = patch.completedAt ?? row.completedAt;
    patch.reward = completedAt !== undefined ? 1 : clickedAt !== undefined ? 0.5 : 0;
    await ctx.db.patch(row._id, patch);
  },
});

export const setEnabled = mutation({
  args: { enabled: v.boolean(), utcOffsetMin: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const st = (await ctx.db.query("autoNudgeState").withIndex("by_user", (q) => q.eq("userId", userId)).collect())[0];
    if (st) await ctx.db.patch(st._id, { enabled: args.enabled, utcOffsetMin: args.utcOffsetMin });
    else
      await ctx.db.insert("autoNudgeState", {
        userId,
        enabled: args.enabled,
        utcOffsetMin: args.utcOffsetMin,
        lastFiredDay: -1,
      });
  },
});

// Bandit aggregates over anonymous features only — per (ctxKey, hour) arms:
// { sends, reward } where reward sums 0 (ignored) / 0.5 (clicked) / 1
// (finished). No content, no user linkage in the global view, so both are
// E2E-safe. The client scores arms from these; the server never decides.
export type BanditStats = Record<string, Record<string, { sends: number; reward: number }>>;

function accumulate(rows: { ctxKey: string; hourLocal: number; reward: number }[]): BanditStats {
  const out: BanditStats = {};
  for (const r of rows) {
    const ctx = (out[r.ctxKey] ??= {});
    const arm = (ctx[String(r.hourLocal)] ??= { sends: 0, reward: 0 });
    arm.sends++;
    arm.reward += r.reward;
  }
  return out;
}

// Own history — the personal posterior. Auth'd: you only ever see your rows.
export const myStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("autoNudgeEvents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return accumulate(rows.filter((r) => r.sentAt !== undefined));
  },
});

// Population prior — every account's sent rows, aggregated with no userIds
// attached. This is what makes the bandit global: a new account's first nudges
// ride on what every account learned, and personal history refines from there.
export const globalStats = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx); // auth'd, but the output carries no per-user data
    const rows = await ctx.db.query("autoNudgeEvents").collect();
    return accumulate(rows.filter((r) => r.sentAt !== undefined));
  },
});

export const eventsFor = internalQuery({
  args: { ids: v.array(v.id("autoNudgeEvents")) },
  handler: async (ctx, args) => {
    const out: { todoId: string; nt: { iv: string; ct: string } | null }[] = [];
    for (const id of args.ids) {
      const row = await ctx.db.get(id);
      if (row) out.push({ todoId: row.todoId as unknown as string, nt: row.nt ?? null });
    }
    return out;
  },
});

export const markSent = internalMutation({
  args: { ids: v.array(v.id("autoNudgeEvents")) },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      const row = await ctx.db.get(id);
      if (row && row.sentAt === undefined) await ctx.db.patch(row._id, { sentAt: Date.now() });
    }
  },
});

// Minute cron: fire due auto-nudges (max one push per user per tick). Rows are
// stamped sentAt only after the push action reports an outcome — total failure
// leaves them pending for the next tick, inside the stale window.
export const dispatchDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("autoNudgeEvents")
      .withIndex("by_pending", (q) => q.eq("sentAt", undefined).lte("scheduledFor", now))
      .take(200);
    if (due.length === 0) return;
    const perUser = new Map<string, (typeof due)[number][]>();
    for (const r of due) {
      if (now - r.scheduledFor > STALE_GRACE_MS) {
        await ctx.db.patch(r._id, { sentAt: now }); // too stale — expire silently
        continue;
      }
      const ids = perUser.get(r.userId) ?? [];
      ids.push(r);
      perUser.set(r.userId, ids);
    }
    for (const [userId, rows] of perUser) {
      // one nudge per user per day — take the earliest due row
      rows.sort((a, b) => a.scheduledFor - b.scheduledFor);
      const first = rows[0];
      for (const extra of rows.slice(1)) await ctx.db.delete(extra._id);
      await ctx.scheduler.runAfter(0, internal.pushActions.sendAuto, {
        userId,
        eventIds: [first._id],
      });
    }
  },
});

export const cleanupOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000; // 90-day training window
    const old = await ctx.db
      .query("autoNudgeEvents")
      .withIndex("by_pending", (q) => q.eq("sentAt", undefined).lt("scheduledFor", cutoff))
      .collect();
    for (const row of old) await ctx.db.delete(row._id);
    return old.length;
  },
});
