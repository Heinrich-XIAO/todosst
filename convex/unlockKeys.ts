import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireUserId, stableUserId } from "./userScope";
import type { Doc } from "./_generated/dataModel";

// Integration keys. The raw key is returned once at issue time and only
// its SHA-256 hash is stored. Max 5 keys per user.

const MAX_KEYS = 5;
const MAX_TASKS = 50;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  return hex(new Uint8Array(digest));
}

function newRawKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // URL-safe base64 without padding — paste-friendly, no +/= to mangle.
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return "tsst_" + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Key metadata for settings (never the secret). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = stableUserId(identity.subject);
    const rows = await ctx.db
      .query("unlockTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return rows.map((r) => ({
      _id: r._id,
      name: r.name ?? null,
      prefix: r.prefix,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt ?? null,
    }));
  },
});

/** Issue a key. Returns the raw key ONCE — the client must show + copy it now. */
export const issue = mutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("unlockTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (existing.length >= MAX_KEYS) throw new Error("key limit reached (5) — revoke one first");
    const raw = newRawKey();
    const name = args.name?.trim().slice(0, 40) || undefined;
    await ctx.db.insert("unlockTokens", {
      userId,
      name,
      tokenHash: await sha256Hex(raw),
      prefix: raw.slice(0, 12),
      createdAt: Date.now(),
    });
    return { key: raw };
  },
});

export const revoke = mutation({
  args: { id: v.id("unlockTokens") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(args.id);
    if (!row) return;
    if (row.userId !== userId) throw new Error("unauthorized");
    await ctx.db.delete(args.id);
  },
});

// ---- internals for the HTTP unlock routes (bearer-token authed) ----

type NodeMeta = {
  dueAt?: number | null;
  recur?: string;
  neg?: boolean;
};

function parseUnlockable(row: Doc<"todos">): {
  id: string;
  title: string;
  dueAt: number | null;
} | null {
  if (!row.node) return null;
  let n: { v?: number; title?: unknown; isCompleted?: unknown; metadata?: NodeMeta };
  try {
    n = JSON.parse(row.node);
  } catch {
    return null;
  }
  if (n.v !== 2 || typeof n.title !== "string" || n.title.trim() === "") return null;
  if (n.isCompleted === true) return null;
  const meta = n.metadata ?? {};
  if (typeof meta.recur === "string" && meta.recur !== "") return null; // recurring: complete in app
  if (meta.neg === true) return null; // avoid-tasks are never completed
  return { id: row._id, title: n.title, dueAt: meta.dueAt ?? null };
}

export const userIdForTokenHash = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("unlockTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    return row ? row.userId : null;
  },
});

export const touchToken = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("unlockTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (row) await ctx.db.patch(row._id, { lastUsedAt: Date.now() });
  },
});

/** Open one-shot tasks for the unlock screen (oldest due first, capped). */
export const openTasks = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("todos")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(MAX_TASKS * 4);
    const out: { id: string; title: string; dueAt: number | null }[] = [];
    for (const row of rows) {
      const t = parseUnlockable(row);
      if (t) out.push(t);
      if (out.length >= MAX_TASKS) break;
    }
    out.sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity));
    return out;
  },
});

/**
 * Complete one task. Only counts if the task was open at call time —
 * the return value is the unlock verdict StopScrll must obey.
 */
export const completeTask = internalMutation({
  args: { userId: v.string(), id: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id as Doc<"todos">["_id"]);
    if (!row || row.userId !== args.userId) return { ok: false as const, error: "not found" };
    const t = parseUnlockable(row);
    if (!t) return { ok: false as const, error: "already done or not completable here" };
    let n: { isCompleted: boolean; metadata: Record<string, unknown> };
    try {
      n = JSON.parse(row.node!) as { isCompleted: boolean; metadata: Record<string, unknown> };
    } catch {
      return { ok: false as const, error: "unreadable task" };
    }
    n.isCompleted = true;
    n.metadata = { ...(n.metadata ?? {}), completedAt: Date.now() };
    await ctx.db.patch(row._id, { node: JSON.stringify(n) });
    return { ok: true as const, title: t.title };
  },
});
