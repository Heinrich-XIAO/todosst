import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  todos: defineTable({
    // E2E encrypted payload: JSON {title,isCompleted} -> AES-GCM
    ciphertext: v.optional(v.string()),
    iv: v.optional(v.string()),
    // legacy plaintext fields (kept for migration, new todos use ciphertext/iv)
    title: v.optional(v.string()),
    isCompleted: v.optional(v.boolean()),
    userId: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_completed", ["userId", "isCompleted"]),

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
    email: v.optional(v.string()),
    salt: v.string(), // base64 16 bytes
  })
    .index("by_userId", ["userId"])
    .index("by_email", ["email"]),
});
