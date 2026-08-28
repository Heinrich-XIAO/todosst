import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  todos: defineTable({
    // E2E encrypted payload: JSON {v:2,title,isCompleted,...} -> AES-GCM
    ciphertext: v.optional(v.string()),
    iv: v.optional(v.string()),
    userId: v.string(),
  }).index("by_user", ["userId"]),

  // per-todo E2E encrypted completion history (recurring-task counts).
  // payload: JSON {v:1,todoId,c:"d1240:3;d1241:1"} -> AES-GCM — todoId lives inside
  // the ciphertext, so the server never sees which record belongs to which todo.
  todoHistory: defineTable({
    ciphertext: v.string(),
    iv: v.string(),
    userId: v.string(),
  }).index("by_user", ["userId"]),

  // per-user PBKDF2 salt (public, not secret) for E2E key derivation
  userSalts: defineTable({
    userId: v.string(),
    username: v.string(),
    salt: v.string(), // base64 16 bytes
  })
    .index("by_userId", ["userId"])
    .index("by_username", ["username"]),

  // vault master key, wrapped (AES-GCM) once per unlock method.
  // kind "password": wrapped with PBKDF2(password, salt)
  // kind "recovery": wrapped with PBKDF2(recoveryCode, salt)
  vaultKeys: defineTable({
    userId: v.string(),
    kind: v.union(v.literal("password"), v.literal("recovery")),
    ciphertext: v.string(),
    iv: v.string(),
  }).index("by_user_kind", ["userId", "kind"]),

  // account-level recovery: sha256 of the recovery-derived key, so the user can
  // sign in (not just unlock) with username + recovery code. The raw key never
  // reaches the server, so this hash cannot unwrap the vault.
  recoveryKeys: defineTable({
    userId: v.string(),
    verifier: v.string(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  // single-use, 10-minute grant created during recovery sign-in, allowing one
  // password change without the current password.
  recoveryGrants: defineTable({
    userId: v.id("users"),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
});
