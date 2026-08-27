import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("todos")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const title = args.title.trim();
    if (!title) throw new Error("Title cannot be empty");
    if (title.length > 200) throw new Error("Title too long (max 200 chars)");
    return await ctx.db.insert("todos", {
      title,
      isCompleted: false,
      userId: identity.subject,
    });
  },
});

export const toggle = mutation({
  args: { id: v.id("todos") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const todo = await ctx.db.get(args.id);
    if (!todo) throw new Error("Todo not found");
    if (todo.userId !== identity.subject) throw new Error("Unauthorized");
    await ctx.db.patch(args.id, { isCompleted: !todo.isCompleted });
  },
});

export const updateTitle = mutation({
  args: { id: v.id("todos"), title: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const todo = await ctx.db.get(args.id);
    if (!todo) throw new Error("Todo not found");
    if (todo.userId !== identity.subject) throw new Error("Unauthorized");
    const title = args.title.trim();
    if (!title) throw new Error("Title cannot be empty");
    if (title.length > 200) throw new Error("Title too long (max 200 chars)");
    await ctx.db.patch(args.id, { title });
  },
});

export const remove = mutation({
  args: { id: v.id("todos") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const todo = await ctx.db.get(args.id);
    if (!todo) throw new Error("Todo not found");
    if (todo.userId !== identity.subject) throw new Error("Unauthorized");
    await ctx.db.delete(args.id);
  },
});

export const clearCompleted = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const completed = await ctx.db
      .query("todos")
      .withIndex("by_user_completed", (q) =>
        q.eq("userId", identity.subject).eq("isCompleted", true)
      )
      .collect();
    for (const todo of completed) {
      await ctx.db.delete(todo._id);
    }
    return completed.length;
  },
});
