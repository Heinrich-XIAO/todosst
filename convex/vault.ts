import { v } from "convex/values";
import { query } from "./_generated/server";
import { stableUserId } from "./userScope";

// LEGACY — one-time migration support only.
//
// Older accounts stored their todo/history rows as AES-GCM ciphertext under a
// vault master key M, kept here only in wrapped form (kind "password" wrapped
// with PBKDF2(password, salt), kind "recovery" with the recovery code). The
// client re-derives M on the user's device from their old password, decrypts
// each row, writes it back as plaintext via todos.migrate / history.migrate,
// and this file plus the vaultKeys/userSalts tables can then be deleted.
//
// Nothing new writes wrapped keys: the "notification" kind is unused now that
// push copy is plaintext.

const KIND = v.union(v.literal("password"), v.literal("recovery"), v.literal("notification"));

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