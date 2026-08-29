"use client";

// Single source of truth for the command-input grammar.
//
// GRAMMAR is the registry: every form the input box understands lives here —
// bang commands (name + argv runner), syntax forms (parsers for "/..." paths
// and plain tasks), and modifiers ("~…" recurrence tokens that attach to
// whatever the rest of the input creates). Both the dispatcher (runInput) and
// the help panel (HelpPanel) are generated from this array, so documentation
// can never drift from behavior.

import { parseSlashPath } from "./slashPath";
import { parseRecurInput, type ParsedInput } from "./recur";
import { resolveCdPath } from "./cdPath";

// ---------- types ----------

export type CommandContext = {
  /** decoded current directory path, e.g. "/host hackathon" ("/" for root) */
  currentPath: string;
  /** navigate without reload (decoded path in, e.g. "/a/b") */
  pushPath(decodedPath: string): void;
  /** open the help panel */
  showHelp(): void;
};

export type CommandEntry = {
  kind: "command";
  /** invoked as "!<name> <argv...>" — case-sensitive, single word */
  name: string;
  /** canonical usage shown in the help panel */
  example: string;
  desc: string;
  run: (argv: string[], ctx: CommandContext) => void;
};

export type SyntaxParseResult = { kind: "slash"; parts: string[] } | { kind: "task"; title: string };

export type SyntaxEntry = {
  kind: "syntax";
  id: string;
  /** canonical usage shown in the help panel */
  example: string;
  desc: string;
  /** return null to fall through to the next syntax entry (task is the final fallback) */
  parse: (input: string) => SyntaxParseResult | null;
};

export type ModifierEntry = {
  kind: "modifier";
  id: string;
  /** canonical usage shown in the help panel */
  example: string;
  desc: string;
  /** strips its token from the input and returns the payload to attach */
  parse: (input: string) => ParsedInput;
};

export type GrammarEntry = CommandEntry | SyntaxEntry | ModifierEntry;

// ---------- argv tokenizing (quote-aware) ----------

/** Split a command tail into argv tokens on whitespace; "…" and '…' group words containing spaces. */
export function tokenizeArgs(s: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let started = false;
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started) tokens.push(cur);
      cur = "";
      started = false;
    } else {
      cur += ch;
      started = true;
    }
  }
  if (started) tokens.push(cur);
  return tokens;
}

/** Look up a "!<name> ..." invocation in the registry. Null for non-bang or unknown commands. */
export function matchCommand(input: string): { entry: CommandEntry; argv: string[] } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("!")) return null;
  const afterBang = trimmed.slice(1).trimStart();
  const m = /^(\S+)([\s\S]*)$/.exec(afterBang);
  if (!m) return null;
  const entry = GRAMMAR.find((e): e is CommandEntry => e.kind === "command" && e.name === m[1]);
  if (!entry) return null;
  return { entry, argv: tokenizeArgs(m[2]) };
}

// ---------- registry ----------
// Order matters for syntax dispatch: first successful parse wins, so more
// specific forms must precede the plain-task fallback.

export const GRAMMAR: GrammarEntry[] = [
  {
    kind: "syntax",
    id: "slash-path",
    example: "/host hackathon/outreach write emails",
    desc: "create nested directories — last segment is the task, trailing / makes an empty directory",
    parse: (input) => {
      const parts = parseSlashPath(input);
      return parts ? { kind: "slash", parts } : null;
    },
  },
  {
    kind: "syntax",
    id: "task",
    example: "buy coffee beans",
    desc: "create a task in the current directory",
    parse: (input) => ({ kind: "task", title: input }),
  },
  {
    kind: "command",
    name: "cd",
    example: "!cd ../side-quests",
    desc: 'change directory — relative, absolute /a/b, ".." up, "quotes for spaces"; bare !cd goes to root',
    run: (argv, ctx) => {
      // a cd target may contain spaces: unquoted (joined back) or quoted (single token)
      const target = argv.length > 0 ? argv.join(" ") : null;
      ctx.pushPath(resolveCdPath(ctx.currentPath, target));
    },
  },
  {
    kind: "command",
    name: "help",
    example: "!help",
    desc: "show the input grammar",
    run: (_argv, ctx) => ctx.showHelp(),
  },
  {
    kind: "modifier",
    id: "recur",
    example: "stretch ~daily",
    desc: "recurring task — ~daily ~weekly ~monthly ~yearly ~weekdays ~every 2w mon,thu",
    parse: parseRecurInput,
  },
];

// ---------- dispatcher ----------

export type InputOutcome =
  | { type: "ignored" }
  | { type: "unknown-command"; name: string }
  | { type: "command"; name: string }
  | { type: "create-slash"; parts: string[]; recur: string | null }
  | { type: "create-task"; title: string; recur: string | null };

/**
 * Interpret raw input via the GRAMMAR registry. Commands (cd/help) run
 * immediately against ctx; creation forms return a plan for the caller to
 * execute. Modifiers are stripped before syntax matching but never apply to
 * commands.
 */
export function runInput(raw: string, ctx: CommandContext): InputOutcome {
  const trimmed = raw.trim();
  if (!trimmed) return { type: "ignored" };

  if (trimmed.startsWith("!")) {
    const cmd = matchCommand(trimmed);
    if (!cmd) {
      const name = trimmed.slice(1).trimStart().split(/\s+/, 1)[0] ?? "";
      return { type: "unknown-command", name };
    }
    cmd.entry.run(cmd.argv, ctx);
    return { type: "command", name: cmd.entry.name };
  }

  const recurEntry = GRAMMAR.find((e): e is ModifierEntry => e.kind === "modifier" && e.id === "recur");
  const recurParsed = recurEntry ? recurEntry.parse(trimmed) : { title: trimmed, ruleStr: null };
  const rest = recurParsed.ruleStr !== null ? recurParsed.title : trimmed;

  for (const entry of GRAMMAR) {
    if (entry.kind !== "syntax") continue;
    const parsed = entry.parse(rest);
    if (!parsed) continue;
    if (parsed.kind === "slash") {
      return { type: "create-slash", parts: parsed.parts, recur: recurParsed.ruleStr };
    }
    if (parsed.title.trim() === "") return { type: "ignored" };
    return { type: "create-task", title: parsed.title, recur: recurParsed.ruleStr };
  }
  return { type: "ignored" };
}
