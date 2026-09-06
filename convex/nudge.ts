import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUserId } from "./userScope";

// Daily nudge — a fixed-time push each day ("today's windows are open").
// Same E2E-safe pattern as reminders: the client registers a plaintext
// time-of-day, the minute cron fires it blind. No titles, no counts, nothing
// about the vault ever reaches the server.

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const row = (await ctx.db.query("dailyNudges").withIndex("by_user", (q) => q.eq("userId", userId)).collect())[0];
    return row ? { hour: row.hourLocal, minute: row.minuteLocal, enabled: row.enabled, utcOffsetMin: row.utcOffsetMin } : null;
  },
});

// Upsert the nudge time. `set` always (re-)enables; `disable` keeps the row
// (enabled: false) so the auto-provision on other devices doesn't resurrect it.
export const set = mutation({
  args: { hour: v.number(), minute: v.number(), utcOffsetMin: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!Number.isInteger(args.hour) || args.hour < 0 || args.hour > 23) throw new Error("invalid hour");
    if (!Number.isInteger(args.minute) || args.minute < 0 || args.minute > 59) throw new Error("invalid minute");
    // real-world offsets span UTC-12..UTC+14
    if (!Number.isInteger(args.utcOffsetMin) || args.utcOffsetMin < -720 || args.utcOffsetMin > 840) {
      throw new Error("invalid utc offset");
    }
    const rows = await ctx.db.query("dailyNudges").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    for (const dup of rows.slice(1)) await ctx.db.delete(dup._id);
    const existing = rows[0];
    if (existing) {
      await ctx.db.patch(existing._id, {
        hourLocal: args.hour,
        minuteLocal: args.minute,
        utcOffsetMin: args.utcOffsetMin,
        enabled: true,
      });
    } else {
      await ctx.db.insert("dailyNudges", {
        userId,
        hourLocal: args.hour,
        minuteLocal: args.minute,
        utcOffsetMin: args.utcOffsetMin,
        enabled: true,
        lastFiredDay: -1,
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

// Minute cron: fire nudges whose local time has come. The stored UTC offset
// turns "hourLocal:minuteLocal" into an absolute moment; a 60-minute window
// past the target tolerates cron jitter/outage, later than that skips today.
// lastFiredDay is patched before dispatch (at-most-once per local day — a
// failed push delivery is acceptable for a nudge, a push storm is not).
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
      const minuteOfDay = Math.floor((localNow % 86_400_000) / 60_000);
      const target = row.hourLocal * 60 + row.minuteLocal;
      if (minuteOfDay < target || minuteOfDay >= target + 60) continue;
      await ctx.db.patch(row._id, { lastFiredDay: localDay });
      await ctx.scheduler.runAfter(0, internal.pushActions.sendNudge, { userId: row.userId });
    }
  },
});
