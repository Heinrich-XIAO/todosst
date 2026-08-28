import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { stableUserId } from "./userScope";
import { getAuthUserId, modifyAccountCredentials, retrieveAccount } from "@convex-dev/auth/server";

// Vault key management. The vault master key M (AES-GCM-256, random) encrypts all
// todo/history payloads. M is stored here only in wrapped form:
//   kind "password" — wrapped with PBKDF2(sign-in password, user salt)
//   kind "recovery" — wrapped with PBKDF2(recovery code, user salt)
// The server can never unwrap these.

const KIND = v.union(v.literal("password"), v.literal("recovery"));

export const getKeyRecord = query({
  args: { kind: KIND },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("vaultKeys")
      .withIndex("by_user_kind", (q) => q.eq("userId", stableUserId(identity.subject)).eq("kind", args.kind))
      .first();
  },
});

export const putKeyRecord = mutation({
  args: { kind: KIND, ciphertext: v.string(), iv: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("not authenticated");
    if (!args.ciphertext || !args.iv) throw new Error("missing ciphertext");
    const userId = stableUserId(identity.subject);
    const existing = await ctx.db
      .query("vaultKeys")
      .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", args.kind))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { ciphertext: args.ciphertext, iv: args.iv });
      return existing._id;
    }
    return await ctx.db.insert("vaultKeys", {
      userId,
      kind: args.kind,
      ciphertext: args.ciphertext,
      iv: args.iv,
    });
  },
});

export const removeKeyRecord = mutation({
  args: { kind: KIND },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("not authenticated");
    const userId = stableUserId(identity.subject);
    const existing = await ctx.db
      .query("vaultKeys")
      .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", args.kind))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});

// ---- recovery key (account-level) ----

export const getRecovery = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const rec = await ctx.db
      .query("recoveryKeys")
      .withIndex("by_user", (q) => q.eq("userId", stableUserId(identity.subject)))
      .first();
    return rec ? { createdAt: rec.createdAt } : null;
  },
});

export const setRecovery = mutation({
  args: { verifier: v.string(), ciphertext: v.string(), iv: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("not authenticated");
    if (!args.verifier || !args.ciphertext || !args.iv) throw new Error("missing fields");
    const userId = stableUserId(identity.subject);
    const existingKey = await ctx.db
      .query("recoveryKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existingKey) {
      await ctx.db.patch(existingKey._id, { verifier: args.verifier, createdAt: Date.now() });
    } else {
      await ctx.db.insert("recoveryKeys", { userId, verifier: args.verifier, createdAt: Date.now() });
    }
    const existingWrapped = await ctx.db
      .query("vaultKeys")
      .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", "recovery"))
      .first();
    if (existingWrapped) {
      await ctx.db.patch(existingWrapped._id, { ciphertext: args.ciphertext, iv: args.iv });
    } else {
      await ctx.db.insert("vaultKeys", { userId, kind: "recovery", ciphertext: args.ciphertext, iv: args.iv });
    }
  },
});

export const clearRecovery = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("not authenticated");
    const userId = stableUserId(identity.subject);
    const rec = await ctx.db
      .query("recoveryKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (rec) await ctx.db.delete(rec._id);
    const wrapped = await ctx.db
      .query("vaultKeys")
      .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", "recovery"))
      .first();
    if (wrapped) await ctx.db.delete(wrapped._id);
  },
});

// ---- internals used by the recovery sign-in provider ----

export const internalUserIdByUsername = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const username = args.username.trim().toLowerCase();
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) => q.eq("provider", "password").eq("providerAccountId", username))
      .first();
    return account?.userId ?? null;
  },
});

export const internalUsernameForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", args.userId).eq("provider", "password"))
      .first();
    return account?.providerAccountId ?? null;
  },
});

export const internalGetVerifier = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const rec = await ctx.db
      .query("recoveryKeys")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    return rec?.verifier ?? null;
  },
});

export const internalCreateGrant = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.insert("recoveryGrants", { userId: args.userId, createdAt: Date.now() });
  },
});

const GRANT_TTL_MS = 10 * 60_000;

export const internalConsumeGrant = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const grants = await ctx.db
      .query("recoveryGrants")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const fresh = grants
      .filter((g) => Date.now() - g.createdAt <= GRANT_TTL_MS)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    for (const g of grants) await ctx.db.delete(g._id);
    return !!fresh;
  },
});

// ---- password change ----

// Verifies the current password (or consumes a recovery grant) then updates the
// account credentials. The vault wrapper update happens client-side afterwards.
export const changePassword = action({
  args: { newPassword: v.string(), currentPassword: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const newPassword = args.newPassword;
    if (newPassword.length < 8 || newPassword.length > 128) {
      throw new Error("password must be 8-128 characters");
    }
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("not authenticated");
    const username = await ctx.runQuery(internal.vault.internalUsernameForUser, { userId });
    if (!username) throw new Error("account has no username — cannot change password");
    if (args.currentPassword) {
      try {
        await retrieveAccount(ctx, {
          provider: "password",
          account: { id: username, secret: args.currentPassword },
        });
      } catch {
        throw new Error("wrong current password");
      }
    } else {
      const ok = await ctx.runMutation(internal.vault.internalConsumeGrant, { userId });
      if (!ok) throw new Error("recovery session expired — sign in again");
    }
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: username, secret: newPassword },
    });
  },
});
