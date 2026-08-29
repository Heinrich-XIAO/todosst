// Stopwatch sessions for check/count-mode tasks (time mode logs minutes via
// counts instead — see src/lib/recur.ts). One active session per task;
// unlimited tasks may run in parallel. All state lives in the E2E-encrypted
// node metadata:
//   timer:    the active session (running or paused)
//   sessions: finished sessions of the current window
// Elapsed is always DERIVED from stored timestamps, so reloads, other devices
// and lock/unlock render correctly without periodic writes — only state
// transitions patch the node:
//
//   idle ──start──▶ running ──pause──▶ paused ──resume──▶ running
//   running/paused ──finish──▶ session appended, timer cleared
//   running/paused ──discard──▶ timer cleared, nothing recorded

import type { PlainNode } from "./crypto";
import { formatMinutes } from "./recur";

export type ActiveTimer = NonNullable<PlainNode["metadata"]["timer"]>;
export type SessionEntry = { s: number; e: number; ms: number };
type Metadata = PlainNode["metadata"];

// Absent a hard count cap (payload-size warnings take that role), this safety
// net keeps pathological task metadata from growing without bound.
export const SESSIONS_HARD_MAX = 200;

// Ciphertext length (base64 chars; server limit 8192) at which a write should
// warn the user the encrypted payload is getting big.
export const PAYLOAD_WARN_THRESHOLDS = [1024, 4096, 7168, 8090]; // 1KB / 4KB / 7KB / 7.9KB

/** Net elapsed ms of a session at `nowTs` (finished stretches + current running stretch). */
export function liveElapsedMs(timer: ActiveTimer, nowTs: number): number {
  if (timer.state !== "running") return timer.elapsedMs;
  return timer.elapsedMs + Math.max(0, nowTs - (timer.resumeAt ?? nowTs));
}

/** "0:12:34", "1:05:03" — ticking stopwatch rendering. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Session/total rendering: seconds under a minute, minutes beyond. */
export function formatSessionDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return formatMinutes(Math.round(ms / 60_000));
}

/** Total net ms of a session list (current window). */
export function totalMs(sessions: SessionEntry[] | undefined | null): number {
  let sum = 0;
  for (const x of sessions ?? []) sum += Math.max(0, x.ms);
  return sum;
}

export function hasTimer(meta: Metadata): boolean {
  return !!meta.timer;
}

// ---------- transitions (pure metadata -> metadata) ----------

export function startTimer(meta: Metadata, nowTs: number, windowDay: number): Metadata {
  if (meta.timer) return meta;
  const timer: ActiveTimer = { startedAt: nowTs, elapsedMs: 0, state: "running", resumeAt: nowTs, windowDay };
  return { ...meta, timer };
}

export function pauseTimer(meta: Metadata, nowTs: number): Metadata {
  const t = meta.timer;
  if (!t || t.state !== "running") return meta;
  const timer: ActiveTimer = {
    startedAt: t.startedAt,
    elapsedMs: t.elapsedMs + Math.max(0, nowTs - (t.resumeAt ?? nowTs)),
    state: "paused",
    windowDay: t.windowDay,
  };
  return { ...meta, timer };
}

export function resumeTimer(meta: Metadata, nowTs: number): Metadata {
  const t = meta.timer;
  if (!t || t.state === "running") return meta;
  const timer: ActiveTimer = { startedAt: t.startedAt, elapsedMs: t.elapsedMs, state: "running", resumeAt: nowTs, windowDay: t.windowDay };
  return { ...meta, timer };
}

/** Abandon the active session — nothing recorded. */
export function discardTimer(meta: Metadata): Metadata {
  if (!meta.timer) return meta;
  return { ...meta, timer: undefined };
}

/** Build the session record for a finishing active timer. */
export function finishSession(timer: ActiveTimer, nowTs: number): SessionEntry {
  return { s: timer.startedAt, e: nowTs, ms: liveElapsedMs(timer, nowTs) };
}

/** Append a finished session to the current-window list (oldest-dropped past the safety net). */
export function appendSession(meta: Metadata, session: SessionEntry): Metadata {
  const sessions = [...(meta.sessions ?? []), session];
  while (sessions.length > SESSIONS_HARD_MAX) sessions.shift();
  return { ...meta, sessions };
}

/** commitSession = finish + append: active timer ends, session recorded. */
export function commitSession(meta: Metadata, nowTs: number): { metadata: Metadata; session: SessionEntry; windowDay: number } {
  const t = meta.timer;
  if (!t) return { metadata: meta, session: { s: nowTs, e: nowTs, ms: 0 }, windowDay: 0 };
  const session = finishSession(t, nowTs);
  return { metadata: appendSession(discardTimer(meta), session), session, windowDay: t.windowDay };
}

// ---------- away-time reconciliation ----------
// While the app is closed or the vault locked, elapsed keeps deriving from
// timestamps (wall-clock). On return, the user is asked whether to count the
// away gap per running timer. "Don't count" folds the gap out of elapsed.

/** ms of the current running stretch that falls after `closedAt` (0 when paused). */
export function awayGapMs(timer: ActiveTimer, closedAt: number, nowTs: number): number {
  if (timer.state !== "running") return 0;
  const from = Math.max(closedAt, timer.resumeAt ?? 0);
  return Math.max(0, nowTs - from);
}

/** Exclude the away gap: keep only the stretch portion before `closedAt`,
 *  fold it into elapsedMs and restart the stretch at `nowTs`. */
export function excludeAway(meta: Metadata, closedAt: number, nowTs: number): Metadata {
  const t = meta.timer;
  if (!t || t.state !== "running") return meta;
  const resumeAt = t.resumeAt ?? nowTs;
  const kept = Math.max(0, Math.min(closedAt, nowTs) - resumeAt);
  const timer: ActiveTimer = {
    startedAt: t.startedAt,
    elapsedMs: t.elapsedMs + kept,
    state: "running",
    resumeAt: nowTs,
    windowDay: t.windowDay,
  };
  return { ...meta, timer };
}

// ---------- payload size warnings ----------

/** Highest warn threshold newly crossed when a payload grew prevLen -> nextLen (null = none). */
export function crossedPayloadThreshold(prevLen: number, nextLen: number): number | null {
  let crossed: number | null = null;
  for (const t of PAYLOAD_WARN_THRESHOLDS) {
    if (prevLen <= t && nextLen > t) crossed = t;
  }
  return crossed;
}
