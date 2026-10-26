import { dayIndexLocal, dayIndexToStart } from "./recur";
import type { InputOutcome } from "./grammar";

const TODAY_CAPTURE_PREFIX = "\u0000today:";

export function encodeTodayCaptureInput(raw: string, dueAt: number, dueTimeMin: number): string {
  return `${TODAY_CAPTURE_PREFIX}${dayIndexLocal(dueAt)}:${dueTimeMin}:${raw}`;
}

export function parseTodayCaptureInput(input: string): { dueAt: number; dueTimeMin: number; raw: string } | null {
  const match = /^\u0000today:(-?\d+):(\d+):([\s\S]*)$/.exec(input);
  if (!match) return null;
  const dayIndex = Number(match[1]);
  const dueTimeMin = Number(match[2]);
  if (!Number.isSafeInteger(dayIndex) || !Number.isInteger(dueTimeMin) || dueTimeMin < 0 || dueTimeMin > 1439) return null;
  return { dueAt: dayIndexToStart(dayIndex), dueTimeMin, raw: match[3] };
}

export function withTodayDueDate(outcome: InputOutcome, dueAt: number, dueTimeMin: number): InputOutcome {
  if (outcome.type !== "create-task" && outcome.type !== "create-slash") return outcome;
  if (outcome.recur || outcome.metadata?.recur || outcome.metadata?.dueAt != null) return outcome;
  return { ...outcome, metadata: { ...outcome.metadata, dueAt, dueTimeMin } };
}

export function isDirectoryOnlyInput(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.startsWith("/") && trimmed.endsWith("/");
}
