import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export const change = v.object({
  path: v.string(),
  before: v.union(v.string(), v.null()),
  after: v.union(v.string(), v.null()),
});

export default defineSchema({
  ...authTables,

  // The user's program: one row per source file.
  files: defineTable({
    userId: v.string(),
    path: v.string(),
    source: v.string(),
    updatedAt: v.number(),
  }).index("by_user_path", ["userId", "path"]),

  // Append-only completion log. amount < 0 undoes.
  log: defineTable({
    userId: v.string(),
    task: v.string(),
    period: v.string(),
    amount: v.number(),
    at: v.number(),
  }).index("by_user_at", ["userId", "at"]),

  // The conversation and every change to the program. A user message, the
  // agent's reply carrying the file changes it made, or a hand edit.
  messages: defineTable({
    userId: v.string(),
    role: v.union(v.literal("user"), v.literal("agent"), v.literal("edit")),
    text: v.string(),
    changes: v.optional(v.array(change)),
    revertedAt: v.optional(v.number()),
    at: v.number(),
  }).index("by_user_at", ["userId", "at"]),
});
