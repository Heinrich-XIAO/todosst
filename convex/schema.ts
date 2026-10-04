import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  todos: defineTable({
    // Plaintext node payload: JSON of PlainNode ({v,title,isCompleted,parentId,
    // order,metadata}). The server reads and indexes this directly.
    node: v.optional(v.string()),
    userId: v.string(),
  }).index("by_user", ["userId"]),

  // per-todo completion history (recurring-task counts), plaintext JSON of
  // HistoryData {todoId, counts}.
  todoHistory: defineTable({
    payload: v.optional(v.string()),
    userId: v.string(),
  }).index("by_user", ["userId"]),

  // web push subscriptions (VAPID). aes128gcm is transport encryption to the
  // push service; the worker renders the copy the payload carries.
  pushSubscriptions: defineTable({
    userId: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_endpoint", ["endpoint"]),

  // scheduled reminders, one row per (todoId, remindAt). The plaintext
  // timestamp plus optional push-copy fields (`name`, `min`) rendered by the
  // service worker.
  reminders: defineTable({
    userId: v.string(),
    todoId: v.id("todos"),
    remindAt: v.number(),
    // delivery timestamp — absent = still pending dispatch (retries live here).
    // Legacy rows carry the old `sent` boolean instead; that field is only
    // kept so pre-migration rows still validate and can be removed once they
    // age out of cleanupOld (7 days).
    sentAt: v.optional(v.number()),
    sent: v.optional(v.boolean()),
    // plaintext push copy (legacy rows: the old encrypted `nt` blob)
    name: v.optional(v.string()),
    min: v.optional(v.number()),
    nt: v.optional(
      v.object({
        iv: v.string(),
        ct: v.string(),
      })
    ),
  })
    .index("by_user", ["userId"])
    // pending first so dispatchDue pages straight through the unsent prefix —
    // delivered rows (deleted only by cleanupOld a week later) must never
    // crowd pending ones out of a bounded take()
    .index("by_pending", ["sentAt", "remindAt"])
    .index("by_due", ["remindAt"])
    .index("by_todo", ["todoId"]),

  // daily ritual nudge: one row per user. Plaintext local time-of-day + UTC
  // offset — the server pings at that local time. Personalized copy fields
  // (variant + numbers) ride as plain columns for the service worker, and a
  // `skipDay` local day index suppresses the push on all-clear days.
  dailyNudges: defineTable({
    userId: v.string(),
    hourLocal: v.number(), // 0-23, user's chosen local hour
    minuteLocal: v.number(), // 0-59, user's chosen local minute
    utcOffsetMin: v.number(), // client-reported offset (minutes east of UTC), refreshed on app open
    enabled: v.boolean(),
    lastFiredDay: v.number(), // local day index (offset-adjusted) of last dispatch — daily dedupe
    // copy fields: variant key + streak/missed/open counts
    k: v.optional(v.string()),
    streak: v.optional(v.number()),
    missed: v.optional(v.number()),
    open: v.optional(v.number()),
    // legacy encrypted copy blob — only pre-migration rows carry it
    nb: v.optional(
      v.object({
        iv: v.string(),
        ct: v.string(),
      })
    ),
    // local day index on which the cron must not fire (the client sets it when
    // the ritual reached all clear)
    skipDay: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  // dateless auto-nudge (bandit now, NN later). One state row per user plus
  // one event row per delivery. Plaintext columns are anonymous numbers only
  // (hour, sizes, counters) — never titles/tags/descriptions/embeddings (those
  // Negatives/battles are excluded client-side and never get rows here.
  autoNudgeState: defineTable({
    userId: v.string(),
    enabled: v.boolean(),
    utcOffsetMin: v.number(),
    lastFiredDay: v.number(), // local day index of last dispatch — daily dedupe
  }).index("by_user", ["userId"]),

  autoNudgeEvents: defineTable({
    userId: v.string(),
    todoId: v.id("todos"),
    scheduledFor: v.number(), // epoch ms the client picked (random time of day)
    sentAt: v.optional(v.number()), // dispatch timestamp — absent = pending
    hourLocal: v.number(), // 0-23 local hour of scheduledFor
    dowLocal: v.number(), // 0-6 local day of week of scheduledFor
    taskAgeDays: v.number(), // days from todo creation to scheduling
    openCount: v.number(), // how many tasks were open at schedule time
    siblingCount: v.number(),
    depth: v.number(),
    hasChildren: v.boolean(),
    mode: v.union(v.literal("check"), v.literal("count"), v.literal("time")),
    isRecurring: v.boolean(),
    recurKind: v.optional(v.string()), // coarse family (daily/weekly/…) — never the raw rule
    // contextual-bandit arm group: "<mode>:<recurKind|once>" (e.g. "count:daily").
    // Lets the policy learn per-task-kind timing (a tally habit wants mornings,
    // a one-shot task wants evenings) from anonymous aggregates only.
    ctxKey: v.string(),
    threshold: v.number(),
    countBefore: v.number(), // completions/counts already logged at schedule time
    priorCompletions: v.number(), // lifetime completions (history + current window)
    // full training dump: JSON of the client-assembled FullDump (task + rule +
    // counts + history + timestamps). Plaintext so the server (and a future
    // offline trainer) can read it without a key.
    fb: v.optional(v.string()),
    // plaintext push copy for the service worker (legacy rows: old `nt` blob)
    name: v.optional(v.string()),
    min: v.optional(v.number()),
    nt: v.optional(
      v.object({
        iv: v.string(),
        ct: v.string(),
      })
    ),
    clickedAt: v.optional(v.number()), // half reward (0.5) — app opened from the push
    completedAt: v.optional(v.number()), // full reward (1.0) — task finished within the window
    reward: v.number(), // 0 | 0.5 | 1
    // kNN-vibe provenance (anonymous numbers only): top-neighbor similarity
    // when the hour came from on-device embedding match instead of the bandit
    vibeSim: v.optional(v.number()),
    // the push-open produced an explicit "best time" label (device-local
    // vector, never uploaded — this flag just marks the row as human-labeled)
    labeled: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_pending", ["sentAt", "scheduledFor"])
    .index("by_todo", ["todoId"]),
});
