import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// scan for due reminders every minute and dispatch web pushes
crons.interval("dispatch-due-reminders", { minutes: 1 }, internal.push.dispatchDue);

// scan daily-nudge rows every minute and dispatch their web pushes
crons.interval("dispatch-daily-nudges", { minutes: 1 }, internal.nudge.dispatchDue);

// purge delivered reminders older than a week
crons.daily("cleanup-old-reminders", { hourUTC: 3, minuteUTC: 7 }, internal.push.cleanupOld);

export default crons;
