import { describe, expect, test } from "bun:test";
import { compileWithFunction, evaluate, type LogEntry } from "./runtime";

const at = (date: string, time: string) => new Date(`${date}T${time}:00`).getTime();

function run(src: Record<string, string> | string, nowDate: string, nowTime: string, log: LogEntry[] = [], days?: string[]) {
  const files = typeof src === "string" ? { "main.js": src } : src;
  return evaluate(files, log, { now: at(nowDate, nowTime), days: days ?? [nowDate], compile: compileWithFunction });
}

const POWER_BANK = `
task("Get power bank", { repeat: "daily", from: "07:00", until: "09:00" });
task("Charge power bank", { repeat: "daily", from: "21:00", after: "Get power bank" });
`;

describe("power bank: one thing, two times of day", () => {
  test("morning shows get now and charge waiting", () => {
    const ev = run(POWER_BANK, "2026-11-17", "07:30");
    expect(ev.errors).toEqual([]);
    const states = Object.fromEntries(ev.days[0].items.map((i) => [i.id, i.state]));
    expect(states).toEqual({ "get-power-bank": "now", "charge-power-bank": "waiting" });
  });

  test("after getting it, charge is later today until 21:00, then now", () => {
    const log = [{ task: "get-power-bank", period: "2026-11-17", amount: 1, at: at("2026-11-17", "08:00") }];
    const noon = run(POWER_BANK, "2026-11-17", "12:00", log).days[0].items;
    expect(noon.find((i) => i.id === "charge-power-bank")?.state).toBe("later");
    expect(noon.find((i) => i.id === "get-power-bank")?.state).toBe("done");
    const night = run(POWER_BANK, "2026-11-17", "21:30", log).days[0].items;
    expect(night.find((i) => i.id === "charge-power-bank")?.state).toBe("now");
  });

  test("missing the morning window marks it late", () => {
    const items = run(POWER_BANK, "2026-11-17", "10:00").days[0].items;
    expect(items.find((i) => i.id === "get-power-bank")?.state).toBe("late");
  });

  test("yesterday's completion does not count today", () => {
    const log = [{ task: "get-power-bank", period: "2026-11-16", amount: 1, at: at("2026-11-16", "08:00") }];
    const items = run(POWER_BANK, "2026-11-17", "08:00", log).days[0].items;
    expect(items.find((i) => i.id === "get-power-bank")?.state).toBe("now");
  });
});

describe("repeat specs", () => {
  test("weekday lists and every N days", () => {
    const src = `task("Gym", { repeat: "mon,thu" }); task("Water plants", { repeat: "every 3 days", start: "2026-11-15" });`;
    const days = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"];
    const ev = run(src, "2026-11-16", "09:00", [], days);
    expect(ev.days.map((d) => d.items.map((i) => i.id))).toEqual([["gym"], [], ["water-plants"], ["gym"]]);
  });

  test("weekly goal accumulates across the week", () => {
    const src = `task("Run", { repeat: "weekly", goal: 3 });`;
    const log = [
      { task: "run", period: "week-2026-11-16", amount: 1, at: at("2026-11-16", "07:00") },
      { task: "run", period: "week-2026-11-16", amount: 1, at: at("2026-11-17", "07:00") },
    ];
    const item = run(src, "2026-11-18", "09:00", log).days[0].items[0];
    expect(item.progress).toBe(2);
    expect(item.state).toBe("now");
  });

  test("a function repeat gets day info", () => {
    const src = `task("Pay rent", { repeat: (d) => d.day === 1 });`;
    const ev = run(src, "2026-12-01", "09:00", [], ["2026-11-30", "2026-12-01"]);
    expect(ev.days.map((d) => d.items.length)).toEqual([0, 1]);
  });

  test("unknown spec is an error on that file only", () => {
    const ev = run({ "a.js": `task("A", { repeat: "sometimes" })`, "b.js": `task("B")` }, "2026-11-17", "09:00");
    expect(ev.errors.map((e) => e.file)).toEqual(["a.js"]);
    expect(ev.days[0].items.map((i) => i.id)).toEqual(["b"]);
  });
});

describe("one-off tasks", () => {
  test("dated task shows on its day and stays late until done", () => {
    const src = `task("Call dentist", { date: "2026-11-17" });`;
    expect(run(src, "2026-11-16", "09:00").days[0].items).toEqual([]);
    expect(run(src, "2026-11-17", "09:00").days[0].items[0].state).toBe("now");
    expect(run(src, "2026-11-19", "09:00").days[0].items[0].state).toBe("late");
  });

  test("undated task stays until done, then only on the day it was done", () => {
    const src = `task("Buy stamps");`;
    const log = [{ task: "buy-stamps", period: "once", amount: 1, at: at("2026-11-17", "10:00") }];
    expect(run(src, "2026-11-17", "11:00", log).days[0].items[0].state).toBe("done");
    expect(run(src, "2026-11-18", "11:00", log).days[0].items).toEqual([]);
  });

  test("an undo entry reopens it", () => {
    const src = `task("Buy stamps");`;
    const log = [
      { task: "buy-stamps", period: "once", amount: 1, at: at("2026-11-17", "10:00") },
      { task: "buy-stamps", period: "once", amount: -1, at: at("2026-11-17", "10:01") },
    ];
    expect(run(src, "2026-11-18", "11:00", log).days[0].items[0].state).toBe("now");
  });
});

describe("code", () => {
  test("when() sees other tasks and streaks", () => {
    const src = `
      task("Journal", { repeat: "daily" });
      task("Celebrate", { repeat: "daily", when: (c) => c.streak("Journal") >= 2 });
      note((c) => "journal streak " + c.streak("Journal"));
    `;
    const log = ["2026-11-15", "2026-11-16"].map((d) => ({ task: "journal", period: d, amount: 1, at: at(d, "20:00") }));
    const day = run(src, "2026-11-17", "09:00", log).days[0];
    expect(day.items.map((i) => i.id).sort()).toEqual(["celebrate", "journal"]);
    expect(day.notes[0].text).toBe("journal streak 2");
  });

  test("loops create many tasks", () => {
    const src = `for (const v of ["iron", "d3"]) task("Take " + v, { repeat: "daily", group: "vitamins" });`;
    expect(run(src, "2026-11-17", "09:00").days[0].items.map((i) => i.group)).toEqual(["vitamins", "vitamins"]);
  });

  test("duplicate ids are reported", () => {
    const ev = run({ "a.js": `task("Read")`, "b.js": `task("read")` }, "2026-11-17", "09:00");
    expect(ev.errors[0].message).toContain("already defined in a.js");
  });

  test("syntax errors and missing after targets are reported", () => {
    const ev = run({ "a.js": `task("x", {`, "b.js": `task("y", { after: "nope" })` }, "2026-11-17", "09:00");
    expect(ev.errors.map((e) => e.file)).toEqual(["a.js", "b.js"]);
  });

  test("ambient globals are shadowed", () => {
    const ev = run(`fetch("https://example.com")`, "2026-11-17", "09:00");
    expect(ev.errors[0].message).toMatch(/not a function|undefined/);
  });
});
