import { query } from "./_generated/server";
import { stableUserId } from "./userScope";
import type { Id } from "./_generated/dataModel";

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    // identity.subject is session-scoped ("userId|sessionId"); the stable part
    // is the users table document id. The username is stored as the user's name.
    const userId = stableUserId(identity.subject);
    const user = await ctx.db.get(userId as Id<"users">);
    return {
      userId,
      name: identity.name ?? user?.name ?? null,
    };
  },
});
