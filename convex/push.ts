import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireUserId } from "./userScope";

const MAX_ITEMS = 500;
const MAX_SUBSCRIPTIONS = 8;
// reminders whose time passed while the user was away still fire for a while
const STALE_GRACE_MS = 6 * 60 * 60 * 1000;
// a reminder scheduled in the past by more than this is pointless — drop it
const PAST_DROP_MS = 5 * 60 * 1000;

/** Delete every reminder row for a todo (called when the todo is removed). */
export async function purgeRemindersForTodo(ctx: MutationCtx, todoId: Id<"todos">): Promise<void> {
  const rows = await ctx.db
    .query("reminders")
    .withIndex("by_todo", (q) => q.eq("todoId", todoId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
}

export const saveSubscription = mutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.endpoint.length > 2048 || args.p256dh.length > 256 || args.auth.length > 256) {
      throw new Error("invalid subscription");
    }
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .collect();
    for (const row of existing) {
      if (row.userId !== userId) {
        // endpoint re-registered by a different account — drop stale rows
        await ctx.db.delete(row._id);
        continue;
      }
      await ctx.db.patch(row._id, { p256dh: args.p256dh, auth: args.auth });
      return;
    }
    // keep the per-user set bounded (multiple browsers/devices)
    const mine = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (mine.length >= MAX_SUBSCRIPTIONS) {
      const oldest = mine.sort((a, b) => a.createdAt - b.createdAt)[0];
      await ctx.db.delete(oldest._id);
    }
    await ctx.db.insert("pushSubscriptions", {
      userId,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      createdAt: Date.now(),
    });
  },
});

export const removeSubscription = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .collect();
    for (const row of rows) {
      if (row.userId !== userId) continue;
      await ctx.db.delete(row._id);
    }
  },
});

// Full-state sync: the client computes the desired reminder rows for every
// decrypted todo (remindAt timestamps only — titles stay encrypted) and sends
// them here. Rows outside the desired set are deleted; existing rows keep
// their `sent` flag so a re-sync never re-fires a delivered reminder.
export const syncReminders = mutation({
  args: { items: v.array(v.object({ todoId: v.id("todos"), remindAt: v.number() })) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.items.length > MAX_ITEMS) throw new Error("too many reminders");
    const now = Date.now();
    const desired = new Map<string, { todoId: Id<"todos">; remindAt: number }>();
    for (const it of args.items) {
      if (!Number.isFinite(it.remindAt)) continue;
      // already fired too long ago (or absurdly far out) — don't store
      if (it.remindAt < now - PAST_DROP_MS) continue;
      if (it.remindAt > now + 5 * 365 * 24 * 60 * 60 * 1000) continue;
      desired.set(`${it.todoId}:${it.remindAt}`, it);
    }
    const existing = await ctx.db
      .query("reminders")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const row of existing) {
      if (!desired.has(`${row.todoId}:${row.remindAt}`)) await ctx.db.delete(row._id);
    }
    for (const it of desired.values()) {
      if (existing.some((r) => r.todoId === it.todoId && r.remindAt === it.remindAt)) continue;
      const todo = await ctx.db.get(it.todoId);
      if (!todo || todo.userId !== userId) continue;
      await ctx.db.insert("reminders", { userId, todoId: it.todoId, remindAt: it.remindAt, sent: false });
    }
  },
});

export const subscriptionsFor = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const deleteSubscription = internalMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  },
});

// Minute cron: fire due reminders. One push per user per tick with the count
// merged in — no titles ever leave the server.
export const dispatchDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("reminders")
      .withIndex("by_due", (q) => q.lte("remindAt", now))
      .take(200);
    const pending = due.filter((r) => !r.sent);
    if (pending.length === 0) return;
    const counts = new Map<string, number>();
    for (const r of pending) {
      // mark sent regardless — a reminder missed while offline doesn't fire days later
      await ctx.db.patch(r._id, { sent: true });
      if (now - r.remindAt <= STALE_GRACE_MS) {
        counts.set(r.userId, (counts.get(r.userId) ?? 0) + 1);
      }
    }
    for (const userId of counts.keys()) {
      await ctx.scheduler.runAfter(0, internal.pushActions.sendPush, { userId });
    }
  },
});

export const cleanupOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const old = await ctx.db
      .query("reminders")
      .withIndex("by_due", (q) => q.lt("remindAt", cutoff))
      .collect();
    for (const row of old) await ctx.db.delete(row._id);
    return old.length;
  },
});
