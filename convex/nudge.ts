import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUserId } from "./userScope";

// Daily nudge — a fixed-time push each day. The client registers a plaintext
// time-of-day, the minute cron fires it. Personalization rides as plain copy
// columns; `skipDay` suppresses the push on all-clear days so the ping means
// something.

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const row = (await ctx.db.query("dailyNudges").withIndex("by_user", (q) => q.eq("userId", userId)).collect())[0];
    return row
      ? {
          hour: row.hourLocal,
          minute: row.minuteLocal,
          enabled: row.enabled,
          utcOffsetMin: row.utcOffsetMin,
          k: row.k ?? null,
          streak: row.streak ?? 0,
          missed: row.missed ?? 0,
          open: row.open ?? 0,
        }
      : null;
  },
});

// Upsert the nudge time. `set` always (re-)enables; `disable` keeps the row
// (enabled: false) so the auto-provision on other devices doesn't resurrect it.
export const set = mutation({
  args: {
    hour: v.number(),
    minute: v.number(),
    utcOffsetMin: v.number(),
    // copy fields — absent means "keep whatever is stored"
    k: v.optional(v.string()),
    streak: v.optional(v.number()),
    missed: v.optional(v.number()),
    open: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!Number.isInteger(args.hour) || args.hour < 0 || args.hour > 23) throw new Error("invalid hour");
    if (!Number.isInteger(args.minute) || args.minute < 0 || args.minute > 59) throw new Error("invalid minute");
    // real-world offsets span UTC-12..UTC+14
    if (!Number.isInteger(args.utcOffsetMin) || args.utcOffsetMin < -720 || args.utcOffsetMin > 840) {
      throw new Error("invalid utc offset");
    }
    const num = (n: number | undefined, max: number): number | undefined =>
      typeof n === "number" && Number.isFinite(n) ? Math.min(Math.max(0, Math.floor(n)), max) : undefined;
    const k = args.k !== undefined && /^[a-z]{1,16}$/.test(args.k) ? args.k : undefined;
    const copy = { k, streak: num(args.streak, 100000), missed: num(args.missed, 100000), open: num(args.open, 10000) };
    const rows = await ctx.db.query("dailyNudges").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    for (const dup of rows.slice(1)) await ctx.db.delete(dup._id);
    const existing = rows[0];
    if (existing) {
      // a time-only update (settings picker) must not wipe the stored copy
      await ctx.db.patch(existing._id, {
        hourLocal: args.hour,
        minuteLocal: args.minute,
        utcOffsetMin: args.utcOffsetMin,
        enabled: true,
        ...copy,
      });
    } else {
      await ctx.db.insert("dailyNudges", {
        userId,
        hourLocal: args.hour,
        minuteLocal: args.minute,
        utcOffsetMin: args.utcOffsetMin,
        enabled: true,
        lastFiredDay: -1,
        ...copy,
      });
    }
  },
});

export const disable = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db.query("dailyNudges").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    for (const dup of rows.slice(1)) await ctx.db.delete(dup._id);
    const existing = rows[0];
    if (existing) await ctx.db.patch(existing._id, { enabled: false });
  },
});

// All-clear suppression: the client passes the local day when the ritual
// reached all clear (any other value clears a stale skip). No-op when the
// account has no nudge row yet — the auto-provision creates it.
export const setSkipDay = mutation({
  args: { day: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = (await ctx.db.query("dailyNudges").withIndex("by_user", (q) => q.eq("userId", userId)).collect())[0];
    if (row && row.skipDay !== args.day) await ctx.db.patch(row._id, { skipDay: args.day });
  },
});

// Copy fields for the push action.
export const forSend = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const row = (await ctx.db.query("dailyNudges").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect())[0];
    return {
      k: row?.k ?? null,
      streak: row?.streak ?? 0,
      missed: row?.missed ?? 0,
      open: row?.open ?? 0,
    };
  },
});

// Minute cron: fire nudges whose local time has come. The stored UTC offset
// turns "hourLocal:minuteLocal" into an absolute moment; a 60-minute window
// past the target tolerates cron jitter/outage, later than that skips today.
// lastFiredDay is patched before dispatch (at-most-once per local day — a
// failed push delivery is acceptable for a nudge, a push storm is not).
// All-clear days are skipped entirely — the ping only fires when it matters.
export const dispatchDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db.query("dailyNudges").collect(); // one row per user, bounded scale
    for (const row of rows) {
      if (!row.enabled) continue;
      const localNow = now + row.utcOffsetMin * 60_000;
      const localDay = Math.floor(localNow / 86_400_000);
      if (row.lastFiredDay >= localDay) continue;
      if (row.skipDay === localDay) continue;
      const minuteOfDay = Math.floor((localNow % 86_400_000) / 60_000);
      const target = row.hourLocal * 60 + row.minuteLocal;
      if (minuteOfDay < target || minuteOfDay >= target + 60) continue;
      await ctx.db.patch(row._id, { lastFiredDay: localDay });
      await ctx.scheduler.runAfter(0, internal.pushActions.sendNudge, { userId: row.userId });
    }
  },
});
