import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUserId } from "./userScope";
import { SEED_FILES } from "./seed";

const MAX_SOURCE = 100_000;
const PATH = /^[a-z0-9][a-z0-9._/-]{0,80}\.js$/;

export const files = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("files")
      .withIndex("by_user_path", (q) => q.eq("userId", userId))
      .collect();
    return rows.map((r) => ({ path: r.path, source: r.source, updatedAt: r.updatedAt }));
  },
});

async function writeFile(ctx: MutationCtx, userId: string, path: string, source: string | null) {
  const row = await ctx.db
    .query("files")
    .withIndex("by_user_path", (q) => q.eq("userId", userId).eq("path", path))
    .unique();
  const before = row?.source ?? null;
  if (source === null) {
    if (row) await ctx.db.delete(row._id);
  } else if (row) {
    await ctx.db.patch(row._id, { source, updatedAt: Date.now() });
  } else {
    await ctx.db.insert("files", { userId, path, source, updatedAt: Date.now() });
  }
  return before;
}

// Applies file changes and records them on one message, atomically, so every
// program edit is in the conversation and can be undone from there.
export const post = mutation({
  args: {
    role: v.union(v.literal("user"), v.literal("agent"), v.literal("edit")),
    text: v.string(),
    changes: v.optional(v.array(v.object({ path: v.string(), source: v.union(v.string(), v.null()) }))),
  },
  handler: async (ctx, { role, text, changes }) => {
    const userId = await requireUserId(ctx);
    if (text.length > 20_000) throw new ConvexError("message too long");
    const recorded = [];
    for (const c of changes ?? []) {
      if (!PATH.test(c.path) || c.path.includes("..")) throw new ConvexError(`bad file path ${c.path}`);
      if (c.source !== null && c.source.length > MAX_SOURCE) throw new ConvexError(`${c.path} is too large`);
      const before = await writeFile(ctx, userId, c.path, c.source);
      if (before !== c.source) recorded.push({ path: c.path, before, after: c.source });
    }
    return await ctx.db.insert("messages", {
      userId,
      role,
      text,
      changes: changes ? recorded : undefined,
      at: Date.now(),
    });
  },
});

// Puts each file back the way it was before the message, unless a later
// change has touched that file since.
export const revert = mutation({
  args: { id: v.id("messages") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const msg = await ctx.db.get(id);
    if (!msg || msg.userId !== userId) throw new ConvexError("not found");
    if (msg.revertedAt) return { reverted: [], skipped: [] };
    const reverted: string[] = [];
    const skipped: string[] = [];
    for (const c of msg.changes ?? []) {
      const row = await ctx.db
        .query("files")
        .withIndex("by_user_path", (q) => q.eq("userId", userId).eq("path", c.path))
        .unique();
      if ((row?.source ?? null) !== c.after) {
        skipped.push(c.path);
        continue;
      }
      await writeFile(ctx, userId, c.path, c.before);
      reverted.push(c.path);
    }
    await ctx.db.patch(id, { revertedAt: Date.now() });
    return { reverted, skipped };
  },
});

export const messages = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_user_at", (q) => q.eq("userId", userId))
      .order("desc")
      .take(60);
    return rows.reverse().map((m) => ({
      id: m._id as Id<"messages">,
      role: m.role,
      text: m.text,
      changes: m.changes ?? [],
      reverted: Boolean(m.revertedAt),
      at: m.at,
    }));
  },
});

// Gives a brand-new account its starter files. A no-op once any message or
// file exists, so it is safe to call on every load.
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const anyFile = await ctx.db.query("files").withIndex("by_user_path", (q) => q.eq("userId", userId)).first();
    const anyMsg = await ctx.db.query("messages").withIndex("by_user_at", (q) => q.eq("userId", userId)).first();
    if (anyFile || anyMsg) return false;
    for (const [path, source] of Object.entries(SEED_FILES)) {
      await ctx.db.insert("files", { userId, path, source, updatedAt: Date.now() });
    }
    return true;
  },
});
