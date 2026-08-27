import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  todos: defineTable({
    title: v.string(),
    isCompleted: v.boolean(),
    userId: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_completed", ["userId", "isCompleted"]),
});
