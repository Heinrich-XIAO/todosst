import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwnTodo, requireUserId, stableUserId, validateEncryptedPayload } from "./userScope";
import { purgeRemindersForTodo } from "./push";

const MAX_CIPHERTEXT = 8192;

// List returns opaque ciphertexts — server never sees plaintext.
// Client decrypts with key derived from password+salt.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("todos")
      .withIndex("by_user", (q) => q.eq("userId", stableUserId(identity.subject)))
      .order("desc")
      .collect();
  },
});

// E2E: client encrypts {title,isCompleted} with AES-GCM and sends ciphertext+iv.
// Server just stores opaque strings, never sees title.
export const create = mutation({
  args: { ciphertext: v.string(), iv: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    validateEncryptedPayload(args.ciphertext, args.iv, MAX_CIPHERTEXT);
    return await ctx.db.insert("todos", {
      ciphertext: args.ciphertext,
      iv: args.iv,
      userId,
    });
  },
});

// Generic encrypted update — patch ciphertext/iv (used for toggle/edit)
export const update = mutation({
  args: { id: v.id("todos"), ciphertext: v.string(), iv: v.string() },
  handler: async (ctx, args) => {
    await requireOwnTodo(ctx, args.id);
    validateEncryptedPayload(args.ciphertext, args.iv, MAX_CIPHERTEXT);
    await ctx.db.patch(args.id, { ciphertext: args.ciphertext, iv: args.iv });
  },
});

export const remove = mutation({
  args: { id: v.id("todos") },
  handler: async (ctx, args) => {
    await requireOwnTodo(ctx, args.id);
    await ctx.db.delete(args.id);
    await purgeRemindersForTodo(ctx, args.id);
  },
});

// Bulk delete by id: the client computes the id list from its decrypted view
// (e.g. completed-task cleanup or purging a deleted subtree). Missing ids are
// skipped so concurrent deletes don't abort the batch.
export const removeMany = mutation({
  args: { ids: v.array(v.id("todos")) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    let count = 0;
    for (const id of args.ids) {
      const todo = await ctx.db.get(id);
      if (!todo) continue;
      if (todo.userId !== userId) throw new Error("unauthorized");
      await ctx.db.delete(id);
      await purgeRemindersForTodo(ctx, id);
      count++;
    }
    return count;
  },
});
