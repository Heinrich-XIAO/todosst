// @ts-nocheck — runs under `bun test` (bun:test types not installed)
import { test, expect } from "bun:test";
import { GRAMMAR, matchCommand, runInput, tokenizeArgs, type CommandContext } from "./grammar";

function makeCtx(currentPath = "/cur") {
  const calls = { pushed: [] as string[], help: 0 };
  const ctx: CommandContext = {
    currentPath,
    pushPath: (p: string) => calls.pushed.push(p),
    showHelp: () => {
      calls.help++;
    },
  };
  return { ctx, calls };
}

// ---------- tokenizer ----------

test("tokenizeArgs splits on whitespace and honors quotes", () => {
  expect(tokenizeArgs("")).toEqual([]);
  expect(tokenizeArgs("   ")).toEqual([]);
  expect(tokenizeArgs("a b c")).toEqual(["a", "b", "c"]);
  expect(tokenizeArgs("  a   b ")).toEqual(["a", "b"]);
  expect(tokenizeArgs('"host hackathon"')).toEqual(["host hackathon"]);
  expect(tokenizeArgs("'host hackathon' extra")).toEqual(["host hackathon", "extra"]);
  expect(tokenizeArgs('a "b  c" d')).toEqual(["a", "b  c", "d"]);
  // unclosed quote consumes the rest
  expect(tokenizeArgs('"host ha')).toEqual(["host ha"]);
});

// ---------- matchCommand ----------

test("matchCommand rejects non-bang and unknown commands", () => {
  expect(matchCommand("add task")).toBeNull();
  expect(matchCommand("!")).toBeNull();
  expect(matchCommand("! ")).toBeNull();
  expect(matchCommand("!cdf x")).toBeNull();
  expect(matchCommand("!foo bar")).toBeNull();
  // matching is case-sensitive: only lowercase command names count
  expect(matchCommand("!CD /A")).toBeNull();
});

test("matchCommand finds registered commands with argv", () => {
  expect(matchCommand("!cd")?.entry.name).toBe("cd");
  expect(matchCommand("!cd")?.argv).toEqual([]);
  expect(matchCommand("!cd  ")?.argv).toEqual([]);
  expect(matchCommand("!cd host hackathon")?.argv).toEqual(["host", "hackathon"]);
  expect(matchCommand('!cd "host hackathon"')?.argv).toEqual(["host hackathon"]);
  expect(matchCommand("!cd /a/b/")?.argv).toEqual(["/a/b/"]);
  expect(matchCommand("! help")?.entry.name).toBe("help");
  expect(matchCommand("!help")?.entry.name).toBe("help");
});

// ---------- runInput: commands ----------

test("runInput cd navigates relative, absolute and quoted", () => {
  const a = makeCtx();
  expect(runInput("!cd x", a.ctx)).toEqual({ type: "command", name: "cd" });
  expect(a.calls.pushed).toEqual(["/cur/x"]);

  const b = makeCtx();
  runInput("!cd ../x", b.ctx);
  expect(b.calls.pushed).toEqual(["/x"]);

  const c = makeCtx();
  runInput("!cd /a/b/", c.ctx);
  expect(c.calls.pushed).toEqual(["/a/b"]);

  const d = makeCtx();
  runInput('!cd "host hackathon"', d.ctx);
  expect(d.calls.pushed).toEqual(["/cur/host hackathon"]);

  // unquoted multi-word target survives the join
  const e = makeCtx();
  runInput("!cd host hackathon", e.ctx);
  expect(e.calls.pushed).toEqual(["/cur/host hackathon"]);
});

test("runInput bare !cd goes to root", () => {
  const { ctx, calls } = makeCtx("/a/b");
  expect(runInput("!cd", ctx)).toEqual({ type: "command", name: "cd" });
  expect(calls.pushed).toEqual(["/"]);
});

test("runInput !help opens help via context", () => {
  const { ctx, calls } = makeCtx();
  expect(runInput("!help", ctx)).toEqual({ type: "command", name: "help" });
  expect(calls.help).toBe(1);
});

test("runInput commands ignore modifiers and unknown commands are reported", () => {
  // commands see the raw line — no recur stripping
  const { ctx, calls } = makeCtx();
  runInput("!cd x ~daily", ctx);
  expect(calls.pushed).toEqual(["/cur/x ~daily"]);

  expect(runInput("!foo", makeCtx().ctx)).toEqual({ type: "unknown-command", name: "foo" });
  expect(runInput("!", makeCtx().ctx)).toEqual({ type: "unknown-command", name: "" });
});

// ---------- runInput: creation forms ----------

test("runInput plain task", () => {
  const { ctx, calls } = makeCtx();
  expect(runInput("buy coffee beans", ctx)).toEqual({
    type: "create-task",
    title: "buy coffee beans",
    recur: null,
  });
  expect(calls.pushed).toEqual([]);
});

test("runInput strips trailing recur token from plain tasks", () => {
  expect(runInput("stretch ~daily", makeCtx().ctx)).toEqual({
    type: "create-task",
    title: "stretch",
    recur: "FREQ=DAILY",
  });
  expect(runInput("gym ~every 2w mon,thu", makeCtx().ctx)).toEqual({
    type: "create-task",
    title: "gym",
    recur: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH",
  });
});

test("runInput recur-only input is ignored", () => {
  expect(runInput("~daily", makeCtx().ctx)).toEqual({ type: "ignored" });
  expect(runInput("", makeCtx().ctx)).toEqual({ type: "ignored" });
  expect(runInput("   ", makeCtx().ctx)).toEqual({ type: "ignored" });
});

test("runInput slash paths", () => {
  // last segment is the task, spaces kept verbatim
  expect(runInput("/a/b task", makeCtx().ctx)).toEqual({
    type: "create-slash",
    parts: ["a", "b task"],
    recur: null,
  });
  // trailing slash = directory only
  expect(runInput("/grocery/", makeCtx().ctx)).toEqual({
    type: "create-slash",
    parts: ["grocery"],
    recur: null,
  });
  // two-segment shorthand: dir + task
  expect(runInput("/taxes reconcile spreadsheet", makeCtx().ctx)).toEqual({
    type: "create-slash",
    parts: ["taxes", "reconcile spreadsheet"],
    recur: null,
  });
});

test("runInput slash paths combine with recur modifier", () => {
  expect(runInput("/taxes ~weekly", makeCtx().ctx)).toEqual({
    type: "create-slash",
    parts: ["taxes"],
    recur: "FREQ=WEEKLY",
  });
});

// ---------- registry integrity (keeps the help panel honest) ----------

test("every grammar entry documents itself and ids/names are unique", () => {
  const ids = new Set<string>();
  for (const entry of GRAMMAR) {
    expect(entry.example.length).toBeGreaterThan(0);
    expect(entry.desc.length).toBeGreaterThan(0);
    const key = entry.kind === "command" ? entry.name : entry.id;
    expect(ids.has(key)).toBe(false);
    ids.add(key);
  }
  const names = GRAMMAR.filter((e) => e.kind === "command").map((e) => e.name);
  expect(names).toContain("cd");
  expect(names).toContain("help");
  // syntax dispatch must end with the plain-task fallback
  const syntaxIds = GRAMMAR.filter((e) => e.kind === "syntax").map((e) => e.id);
  expect(syntaxIds[syntaxIds.length - 1]).toBe("task");
});
