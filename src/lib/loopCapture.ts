"use client";

// Getting a thought into the signal log from anywhere (typed, spoken, shared).
// Online it goes straight to the server; offline — or when the connection
// drops mid-send — it parks in the same on-device outbox as task captures and
// replays on the next online open. Replays carry their original timestamp and
// an idempotency key, so a capture that landed just before the drop never
// double-counts (rates depend on every occurrence being counted exactly once).

import { DEFAULT_SIGILS, MAX_SIGNAL_CHARS } from "../../convex/loopLogic";
import { newEntryId, outboxAddCapture } from "./outbox";

export type CaptureSource = "typed" | "voice" | "share" | "system";

export type CaptureArgs = {
  text: string;
  typeKey?: string; // defaults to "problem"
  system?: boolean;
  source?: CaptureSource;
};

export type CaptureSend = (args: {
  text: string;
  typeHint?: string;
  system?: boolean;
  source: CaptureSource;
  at: number;
  clientId: string;
}) => Promise<string>;

export type CaptureResult =
  | { kind: "saved"; id: string }
  | { kind: "parked" }
  | { kind: "failed"; message: string };

export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /failed to fetch|networkerror|network error|fetch failed|load failed|offline|connection lost/i.test(msg);
}

/** The raw grammar line an outbox replay turns back into this capture. */
export function rawCaptureInput(
  text: string,
  typeKey: string | undefined,
  system: boolean | undefined,
  sigils: Record<string, string> = DEFAULT_SIGILS,
): string {
  const clean = text.trim();
  if (system) return `?? ${clean}`;
  const sigil = Object.entries(sigils).find(([, key]) => key === (typeKey ?? "problem"))?.[0] ?? "?";
  return `${sigil} ${clean}`;
}

export async function captureSignal(
  send: CaptureSend,
  args: CaptureArgs,
  online: boolean,
  sigils: Record<string, string> = DEFAULT_SIGILS,
): Promise<CaptureResult> {
  const text = args.text.trim();
  if (!text) return { kind: "failed", message: "nothing to capture" };
  if (text.length > MAX_SIGNAL_CHARS) {
    return { kind: "failed", message: `captures are limited to ${MAX_SIGNAL_CHARS} characters` };
  }
  const clientId = newEntryId();
  const at = Date.now();
  const park = async (): Promise<CaptureResult> => {
    const id = await outboxAddCapture({ input: rawCaptureInput(text, args.typeKey, args.system, sigils), parts: [] });
    return id ? { kind: "parked" } : { kind: "failed", message: "local storage is unavailable — try again once you're online" };
  };
  if (!online) return await park();
  try {
    const id = await send({
      text,
      typeHint: args.typeKey ?? "problem",
      ...(args.system ? { system: true } : {}),
      source: args.source ?? "typed",
      at,
      clientId,
    });
    return { kind: "saved", id };
  } catch (err) {
    if (isNetworkError(err)) return await park();
    return { kind: "failed", message: err instanceof Error ? err.message : String(err) };
  }
}

// ---------- friction the app notices about itself ----------

const FRICTION_KEY = "todosst:loop-friction";
const FRICTION_WINDOW_MS = 7 * 86_400_000;

/**
 * Typing an unknown `!command` once is a typo; twice within a week is the app
 * missing a feature you expect. Returns true on the repeat so the caller can
 * log a system signal — nothing is recorded for the first miss beyond a local
 * timestamp.
 */
export function noteUnknownCommand(name: string, now: number, store?: Pick<Storage, "getItem" | "setItem">): boolean {
  try {
    const s = store ?? localStorage;
    const raw = s.getItem(FRICTION_KEY);
    const seen: Record<string, number> = raw ? JSON.parse(raw) : {};
    const key = name.toLowerCase().slice(0, 40);
    const prev = seen[key];
    const repeat = typeof prev === "number" && now - prev < FRICTION_WINDOW_MS;
    for (const k of Object.keys(seen)) if (now - seen[k] >= FRICTION_WINDOW_MS) delete seen[k];
    seen[key] = now;
    s.setItem(FRICTION_KEY, JSON.stringify(seen));
    return repeat;
  } catch {
    return false;
  }
}
