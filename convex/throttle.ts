import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// Fixed-window brute-force throttle for credential providers (recovery-code
// sign-in). One row per key; attempts increment within the window and the row
// is deleted on successful sign-in so the window resets. State lives in the
// database (mutations are serializable, so check+increment is atomic) rather
// than in memory — Convex isolates are ephemeral.

const WINDOW_MS = 15 * 60_000;
const DEFAULT_MAX_ATTEMPTS = 10;

/** Count one attempt; throws when the window's budget is exhausted. */
export const hit = internalMutation({
  args: { key: v.string(), max: v.optional(v.number()), windowMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const max = args.max ?? DEFAULT_MAX_ATTEMPTS;
    const windowMs = args.windowMs ?? WINDOW_MS;
    const row = await ctx.db
      .query("loginThrottle")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    const now = Date.now();
    if (!row || now - row.windowStart > windowMs) {
      if (row) await ctx.db.delete(row._id);
      await ctx.db.insert("loginThrottle", { key: args.key, windowStart: now, count: 1 });
      return;
    }
    if (row.count >= max) {
      throw new Error("too many attempts — try again in a few minutes");
    }
    await ctx.db.patch(row._id, { count: row.count + 1 });
  },
});

/** Successful sign-in — clear the counter. */
export const reset = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("loginThrottle")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
  },
});
