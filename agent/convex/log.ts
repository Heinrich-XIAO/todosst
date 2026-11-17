import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./userScope";

const HORIZON = 400 * 86_400_000;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("log")
      .withIndex("by_user_at", (q) => q.eq("userId", userId).gte("at", Date.now() - HORIZON))
      .collect();
    return rows.map((r) => ({ task: r.task, period: r.period, amount: r.amount, at: r.at }));
  },
});

export const add = mutation({
  args: { task: v.string(), period: v.string(), amount: v.number() },
  handler: async (ctx, { task, period, amount }) => {
    const userId = await requireUserId(ctx);
    if (task.length > 120 || period.length > 40 || !Number.isFinite(amount) || Math.abs(amount) > 100_000) {
      throw new ConvexError("bad log entry");
    }
    await ctx.db.insert("log", { userId, task, period, amount, at: Date.now() });
  },
});
