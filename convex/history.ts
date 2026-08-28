import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { stableUserId } from "./userScope";

// Per-todo completion history for recurring tasks. Everything (including the
// todo id it belongs to) is opaque ciphertext — see schema.ts and src/lib/recur.ts.

// ~512KB plaintext cap -> base64 inflates 4/3
const MAX_CIPHERTEXT = 700_000;

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
  args: { id: v.optional(v.id("todoHistory")), ciphertext: v.string(), iv: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("not authenticated");
    if (!args.ciphertext || !args.iv) throw new Error("missing ciphertext");
    if (args.ciphertext.length > MAX_CIPHERTEXT) throw new Error("ciphertext too long");
    if (args.iv.length > 64 || args.iv.length < 10) throw new Error("invalid iv");
    if (args.id) {
      const record = await ctx.db.get(args.id);
      if (!record) throw new Error("history record not found");
      if (record.userId !== stableUserId(identity.subject)) throw new Error("unauthorized");
      await ctx.db.patch(args.id, { ciphertext: args.ciphertext, iv: args.iv });
      return args.id;
    }
    return await ctx.db.insert("todoHistory", {
      ciphertext: args.ciphertext,
      iv: args.iv,
      userId: stableUserId(identity.subject),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("todoHistory") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("not authenticated");
    const record = await ctx.db.get(args.id);
    if (!record) return;
    if (record.userId !== stableUserId(identity.subject)) throw new Error("unauthorized");
    await ctx.db.delete(args.id);
  },
});
