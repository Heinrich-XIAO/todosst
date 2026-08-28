// @convex-dev/auth issues session-scoped identity subjects ("userId|sessionId").
// Data must be keyed by the stable userId part only, otherwise everything becomes
// invisible after re-login (and salt lookup fails, silently regenerating the E2E
// salt — permanent data loss). See migrate.ts for the one-time cleanup.
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

/** Validate an opaque E2E payload (ciphertext+iv) sent by the client. */
export function validateEncryptedPayload(ciphertext: string, iv: string, maxCiphertext: number): void {
  if (!ciphertext || !iv) throw new Error("missing ciphertext");
  if (ciphertext.length > maxCiphertext) throw new Error("ciphertext too long");
  if (iv.length > 64 || iv.length < 10) throw new Error("invalid iv");
}
