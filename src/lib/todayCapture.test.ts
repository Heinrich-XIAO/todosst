import { describe, expect, test } from "bun:test";
import { runInput } from "./grammar";
import { dayIndexLocal, dayIndexToStart } from "./recur";
import { encodeTodayCaptureInput, isDirectoryOnlyInput, parseTodayCaptureInput, withTodayDueDate } from "./todayCapture";

const context = { currentPath: "/", pushPath: () => {}, showHelp: () => {} };
const TODAY = new Date(2026, 9, 26, 12).getTime();
const todayStart = dayIndexToStart(dayIndexLocal(TODAY));

describe("Today capture defaults", () => {
  test("defaults plain tasks and slash-created tasks to the selected day", () => {
    for (const raw of ["put pencil in bag", "/work/put pencil in bag"]) {
      const outcome = withTodayDueDate(runInput(raw, context), todayStart, 1380);
      expect(outcome.type).toMatch(/create-/);
      expect(outcome.metadata?.dueAt).toBe(todayStart);
      expect(outcome.metadata?.dueTimeMin).toBe(1380);
    }
  });

  test("does not replace an explicit due date or add one to recurring tasks", () => {
    const explicit = withTodayDueDate(
      { ...runInput("put pencil in bag", context), metadata: { dueAt: todayStart + 86_400_000 } },
      todayStart,
      1380
    );
    expect(explicit.metadata?.dueAt).toBe(todayStart + 86_400_000);
    const recurring = withTodayDueDate(runInput("put pencil in bag ~daily", context), todayStart, 1380);
    expect(recurring.recur).toBeTruthy();
    expect(recurring.metadata?.dueAt).toBeUndefined();
  });

  test("directory-only paths are not treated as task captures", () => {
    expect(isDirectoryOnlyInput("/work/" )).toBe(true);
    expect(isDirectoryOnlyInput("/work/report" )).toBe(false);
    expect(isDirectoryOnlyInput("report" )).toBe(false);
  });

  test("offline marker round-trips the original day and time", () => {
    const raw = "put pencil in bag";
    const encoded = encodeTodayCaptureInput(raw, todayStart, 1380);
    expect(parseTodayCaptureInput(encoded)).toEqual({ dueAt: todayStart, dueTimeMin: 1380, raw });
    expect(parseTodayCaptureInput(raw)).toBeNull();
    expect(parseTodayCaptureInput("\u0000today:999999999999999999999:1380:x")).toBeNull();
  });
});
