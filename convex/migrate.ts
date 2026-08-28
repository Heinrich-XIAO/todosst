import { internalMutation } from "./_generated/server";
import { stableUserId } from "./userScope";

// One-time cleanup: rows created before stableUserId() store session-scoped
// subjects ("userId|sessionId"). Strip the suffix in place. Safe to re-run.
export const stripSessionSuffixes = internalMutation({
  args: {},
  handler: async (ctx) => {
    let todos = 0;
    let salts = 0;
    const allTodos = await ctx.db.query("todos").collect();
    for (const todo of allTodos) {
      const fixed = stableUserId(todo.userId);
      if (fixed !== todo.userId) {
        await ctx.db.patch(todo._id, { userId: fixed });
        todos++;
      }
    }
    const allSalts = await ctx.db.query("userSalts").collect();
    for (const salt of allSalts) {
      const fixed = stableUserId(salt.userId);
      if (fixed !== salt.userId) {
        await ctx.db.patch(salt._id, { userId: fixed });
        salts++;
      }
    }
    const allHistory = await ctx.db.query("todoHistory").collect();
    for (const record of allHistory) {
      const fixed = stableUserId(record.userId);
      if (fixed !== record.userId) {
        await ctx.db.patch(record._id, { userId: fixed });
      }
    }
    return { todos, salts };
  },
});
