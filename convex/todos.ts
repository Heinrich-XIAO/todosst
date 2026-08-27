import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// List returns opaque ciphertexts — server never sees plaintext.
// Client decrypts with key derived from password+salt.
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

// E2E: client encrypts {title,isCompleted} with AES-GCM and sends ciphertext+iv.
// Server just stores opaque strings, never sees title.
export const create = mutation({
  args: { ciphertext: v.string(), iv: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("not authenticated");
    if (!args.ciphertext || !args.iv) throw new Error("missing ciphertext");
    if (args.ciphertext.length > 8192) throw new Error("ciphertext too long");
    if (args.iv.length > 64 || args.iv.length < 10) throw new Error("invalid iv");
    return await ctx.db.insert("todos", {
      ciphertext: args.ciphertext,
      iv: args.iv,
      userId: identity.subject,
    });
  },
});

// Generic encrypted update — patch ciphertext/iv (used for toggle/edit)
export const update = mutation({
  args: { id: v.id("todos"), ciphertext: v.string(), iv: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("not authenticated");
    const todo = await ctx.db.get(args.id);
    if (!todo) throw new Error("todo not found");
    if (todo.userId !== identity.subject) throw new Error("unauthorized");
    if (!args.ciphertext || !args.iv) throw new Error("missing ciphertext");
    if (args.ciphertext.length > 8192) throw new Error("ciphertext too long");
    await ctx.db.patch(args.id, { ciphertext: args.ciphertext, iv: args.iv });
  },
});

// Legacy mutations kept for migration of old plaintext todos — they still work
// but new clients should use `create`/`update` with ciphertext.
export const toggle = mutation({
  args: { id: v.id("todos") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("not authenticated");
    const todo = await ctx.db.get(args.id);
    if (!todo) throw new Error("todo not found");
    if (todo.userId !== identity.subject) throw new Error("unauthorized");
    // Only for legacy plaintext todos
    if (todo.ciphertext) throw new Error("use encrypted update for e2e todos");
    await ctx.db.patch(args.id, { isCompleted: !todo.isCompleted });
  },
});

export const updateTitle = mutation({
  args: { id: v.id("todos"), title: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("not authenticated");
    const todo = await ctx.db.get(args.id);
    if (!todo) throw new Error("todo not found");
    if (todo.userId !== identity.subject) throw new Error("unauthorized");
    if (todo.ciphertext) throw new Error("use encrypted update for e2e todos");
    const title = args.title.trim();
    if (!title) throw new Error("title cannot be empty");
    if (title.length > 200) throw new Error("title too long (max 200 chars)");
    await ctx.db.patch(args.id, { title });
  },
});

export const remove = mutation({
  args: { id: v.id("todos") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("not authenticated");
    const todo = await ctx.db.get(args.id);
    if (!todo) throw new Error("todo not found");
    if (todo.userId !== identity.subject) throw new Error("unauthorized");
    await ctx.db.delete(args.id);
  },
});

// Clear completed: for E2E todos, client filters decrypted list and sends ids.
// Legacy fallback deletes plaintext completed todos.
export const clearCompleted = mutation({
  args: { ids: v.optional(v.array(v.id("todos"))) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("not authenticated");
    if (args.ids && args.ids.length > 0) {
      let count = 0;
      for (const id of args.ids) {
        const todo = await ctx.db.get(id);
        if (!todo) continue;
        if (todo.userId !== identity.subject) throw new Error("unauthorized");
        await ctx.db.delete(id);
        count++;
      }
      return count;
    }
    // Legacy path: delete where isCompleted==true (plaintext only)
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
