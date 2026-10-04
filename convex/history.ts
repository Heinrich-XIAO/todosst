import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwnHistory, requireUserId, stableUserId } from "./userScope";

// Per-todo completion history for recurring tasks, stored as plaintext JSON of
// HistoryData {todoId, counts}.

const MAX_PAYLOAD = 700_000;

function validPayload(payload: string): string {
  if (!payload) throw new Error("missing payload");
  if (payload.length > MAX_PAYLOAD) throw new Error("payload too long");
  return payload;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("todoHistory")
      .withIndex("by_user", (q) => q.eq("userId", stableUserId(identity.subject)))
      .collect();
  },
});

// Upsert: pass the record id from `list` to update, omit to insert. Returns the id.
export const put = mutation({
  args: { id: v.optional(v.id("todoHistory")), payload: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const payload = validPayload(args.payload);
    if (args.id) {
      await requireOwnHistory(ctx, args.id);
      await ctx.db.patch(args.id, { payload });
      return args.id;
    }
    return await ctx.db.insert("todoHistory", {
      payload,
      userId,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("todoHistory") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const record = await ctx.db.get(args.id);
    if (!record) return;
    if (record.userId !== userId) throw new Error("unauthorized");
    await ctx.db.delete(args.id);
  },
});