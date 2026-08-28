import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { stableUserId } from "./userScope";
import type { Id } from "./_generated/dataModel";

// Public query: fetch salt by username (no auth required)
// Allows client to derive key BEFORE sign-in.
export const getSalt = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const username = args.username.trim().toLowerCase();
    if (!username) return null;
    const row = await ctx.db
      .query("userSalts")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();
    return row?.salt ?? null;
  },
});

// Authenticated: get my salt
export const getMySalt = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const existing = await ctx.db
      .query("userSalts")
      .withIndex("by_userId", (q) => q.eq("userId", stableUserId(identity.subject)))
      .first();
    return existing?.salt ?? null;
  },
});

// Authenticated: ensure salt exists (called after sign-in). Client generates salt.
export const ensureSalt = mutation({
  args: { salt: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("not authenticated");
    if (!args.salt || args.salt.length < 10) throw new Error("invalid salt");
    // Very basic base64 check + size
    if (args.salt.length > 64) throw new Error("salt too long");
    const existing = await ctx.db
      .query("userSalts")
      .withIndex("by_userId", (q) => q.eq("userId", stableUserId(identity.subject)))
      .first();
    if (existing) return existing.salt;
    const user = await ctx.db.get(stableUserId(identity.subject) as Id<"users">);
    const username = (user?.name ?? "").trim().toLowerCase();
    if (!username) throw new Error("account has no username");
    await ctx.db.insert("userSalts", {
      userId: stableUserId(identity.subject),
      username,
      salt: args.salt,
    });
    return args.salt;
  },
});
