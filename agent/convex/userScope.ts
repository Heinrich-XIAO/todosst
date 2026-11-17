import type { QueryCtx } from "./_generated/server";

// @convex-dev/auth subjects are "userId|sessionId"; data is keyed by the
// stable userId part so it survives re-login.
export async function requireUserId(ctx: Pick<QueryCtx, "auth">): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("not authenticated");
  const s = identity.subject;
  const i = s.indexOf("|");
  return i >= 0 ? s.slice(0, i) : s;
}
