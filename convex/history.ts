import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwnHistory, requireUserId, stableUserId, validateEncryptedPayload } from "./userScope";

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
    const userId = await requireUserId(ctx);
    validateEncryptedPayload(args.ciphertext, args.iv, MAX_CIPHERTEXT);
    if (args.id) {
      await requireOwnHistory(ctx, args.id);
      await ctx.db.patch(args.id, { ciphertext: args.ciphertext, iv: args.iv });
      return args.id;
    }
    return await ctx.db.insert("todoHistory", {
      ciphertext: args.ciphertext,
      iv: args.iv,
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
