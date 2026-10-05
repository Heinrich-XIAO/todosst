import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// TEMPORARY — account purge. Delete this file once it has run.
//
// Removes every row belonging to one account: auth records (sessions first,
// since refresh tokens hang off sessionId), task/history rows, and per-user
// push/reminder/nudge state. The `users` document goes last.
//
// Rows are matched on `userId` in JS rather than through an index because the
// per-user tables don't all share an index name (loginThrottle uses by_key).
// Volumes here are tiny, so a full scan is fine.

type Row = { _id: string; userId?: string; sessionId?: string };

async function dropWhere(
  ctx: { db: { query: (t: never) => { collect: () => Promise<Row[]> }; delete: (id: never) => Promise<unknown> } },
  table: string,
  match: (r: Row) => boolean
): Promise<number> {
  const rows = await (ctx.db.query(table as never) as unknown as { collect: () => Promise<Row[]> }).collect();
  let n = 0;
  for (const r of rows) {
    if (!match(r)) continue;
    await ctx.db.delete(r._id as never);
    n++;
  }
  return n;
}

export const purgeUser = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const userId = args.userId;
    const deleted: Record<string, number> = {};
    const owns = (r: Row) => r.userId === userId;

    // auth: capture session ids before deleting them
    const sessions = await (ctx.db.query("authSessions" as never) as unknown as { collect: () => Promise<Row[]> }).collect();
    const sessionIds = new Set(sessions.filter(owns).map((s) => s._id));
    for (const s of sessions.filter(owns)) await ctx.db.delete(s._id as never);
    if (sessionIds.size) deleted.authSessions = sessionIds.size;

    deleted.authRefreshTokens = await dropWhere(ctx, "authRefreshTokens", (r) => sessionIds.has(r.sessionId ?? ""));
    deleted.authAccounts = await dropWhere(ctx, "authAccounts", owns);
    deleted.authVerificationCodes = await dropWhere(ctx, "authVerificationCodes", owns);
    deleted.authVerifiers = await dropWhere(ctx, "authVerifiers", owns);
    deleted.authRateLimits = await dropWhere(ctx, "authRateLimits", owns);

    for (const table of [
      "todos",
      "todoHistory",
      "userSalts",
      "vaultKeys",
      "recoveryKeys",
      "pushSubscriptions",
      "reminders",
      "dailyNudges",
      "autoNudgeState",
      "autoNudgeEvents",
      "loginThrottle",
    ]) {
      const n = await dropWhere(ctx, table, owns);
      if (n) deleted[table] = n;
    }

    const user = await ctx.db.get(userId as Id<"users">);
    if (user) {
      await ctx.db.delete(user._id);
      deleted.users = 1;
    }

    return deleted;
  },
});