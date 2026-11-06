import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// scan for due reminders every minute and dispatch web pushes
crons.interval("dispatch-due-reminders", { minutes: 1 }, internal.push.dispatchDue);

// scan daily-nudge rows every minute and dispatch their web pushes
crons.interval("dispatch-daily-nudges", { minutes: 1 }, internal.nudge.dispatchDue);

// scan dateless auto-nudge rows every minute and dispatch their web pushes
crons.interval("dispatch-auto-nudges", { minutes: 1 }, internal.autoNudge.dispatchDue);

// verify loop runs whose quiet window has ended (reopening on recurrence also
// happens immediately when a matching signal is attached)
crons.interval("settle-loop-runs", { hours: 1 }, internal.loop.sweep);

// purge delivered reminders older than a week
crons.daily("cleanup-old-reminders", { hourUTC: 3, minuteUTC: 7 }, internal.push.cleanupOld);

export default crons;
