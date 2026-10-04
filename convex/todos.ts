import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwnTodo, requireUserId, stableUserId } from "./userScope";
import { purgeRemindersForTodo } from "./push";

// Todo rows store the node as plaintext JSON, read and indexed server-side.

const MAX_NODE_CHARS = 32_000;

function validNode(node: string | undefined): string | undefined {
  if (!node) return undefined;
  if (node.length > MAX_NODE_CHARS) throw new Error("node too long");
  return node;
}

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

export const create = mutation({
  args: { node: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.insert("todos", {
      node: validNode(args.node),
      userId,
    });
  },
});

export const update = mutation({
  args: { id: v.id("todos"), node: v.string() },
  handler: async (ctx, args) => {
    await requireOwnTodo(ctx, args.id);
    await ctx.db.patch(args.id, { node: validNode(args.node) });
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

// Bulk delete by id: the client computes the id list from its own view
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