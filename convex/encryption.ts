import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { stableUserId } from "./userScope";

// Public query: fetch salt by normalized email (no auth required)
// Allows client to derive key BEFORE sign-in.
export const getSalt = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!email) return null;
    // First try userSalts by_email index
    const byEmail = await ctx.db
      .query("userSalts")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (byEmail) return byEmail.salt;
    // Fallback: try lookup via users table then by_userId
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (!user) return null;
    const byUserId = await ctx.db
      .query("userSalts")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    return byUserId?.salt ?? null;
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
    const email = (identity.email ?? "").trim().toLowerCase() || undefined;
    await ctx.db.insert("userSalts", {
      userId: stableUserId(identity.subject),
      email,
      salt: args.salt,
    });
    return args.salt;
  },
});
