// @convex-dev/auth issues session-scoped identity subjects ("userId|sessionId").
// Data must be keyed by the stable userId part only, otherwise everything becomes
// invisible after re-login.
export function stableUserId(subject: string): string {
  const idx = subject.indexOf("|");
  return idx >= 0 ? subject.slice(0, idx) : subject;
}

// ---- shared auth/ownership helpers ----
// Typed with QueryCtx: MutationCtx is assignable to it (its db is a reader+writer).

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/** Authenticated caller's stable userId — throws if unauthenticated. */
export async function requireUserId(ctx: Pick<QueryCtx, "auth">): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("not authenticated");
  return stableUserId(identity.subject);
}

/** Fetch a todo and assert it belongs to the caller. */
export async function requireOwnTodo(ctx: QueryCtx, id: Id<"todos">): Promise<Doc<"todos">> {
  const userId = await requireUserId(ctx);
  const todo = await ctx.db.get(id);
  if (!todo) throw new Error("todo not found");
  if (todo.userId !== userId) throw new Error("unauthorized");
  return todo;
}

/** Fetch a todoHistory record and assert it belongs to the caller. */
export async function requireOwnHistory(ctx: QueryCtx, id: Id<"todoHistory">): Promise<Doc<"todoHistory">> {
  const userId = await requireUserId(ctx);
  const record = await ctx.db.get(id);
  if (!record) throw new Error("history record not found");
  if (record.userId !== userId) throw new Error("unauthorized");
  return record;
}
