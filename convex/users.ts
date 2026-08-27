import { query } from "./_generated/server";

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    // identity.subject is the userId (auth user)
    // Try to fetch user record for email/name if available
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email ?? ""))
      .first();
    return {
      userId: identity.subject,
      email: identity.email ?? user?.email ?? null,
      name: identity.name ?? user?.name ?? null,
    };
  },
});
