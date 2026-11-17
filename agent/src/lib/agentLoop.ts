import type { ChatMessage, ToolCall } from "../../convex/agentSpec";
import { dateKey, periodKey, slug, type DayView, type Evaluation, type Files, type LogEntry, type ProgramError } from "./runtime";

// The agent loop. The model proposes tool calls; this runs them against a
// draft copy of the program and feeds results back until the model answers in
// plain text. Nothing is saved here: the caller commits the draft.

export type Activity = { label: string; detail?: string; ok?: boolean };

export type PriorTurn = { role: "user" | "agent" | "edit"; text: string };

export type AgentDeps = {
  step: (messages: ChatMessage[]) => Promise<Extract<ChatMessage, { role: "assistant" }>>;
  evaluate: (files: Files, now: number, days: string[]) => Promise<Evaluation>;
  log: (task: string, period: string, amount: number) => Promise<void>;
  history: LogEntry[];
  now: number;
  timeZone: string;
  onActivity: (a: Activity) => void;
  aborted: () => boolean;
};

export type AgentResult = { reply: string; draft: Files };

const MAX_STEPS = 20;

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatErrors(errors: ProgramError[]): string {
  if (!errors.length) return "Errors: none";
  return "Errors:\n" + errors.map((e) => `- ${e.file}${e.line ? `:${e.line}` : ""}: ${e.message}`).join("\n");
}

export function formatDay(day: DayView | undefined): string {
  if (!day) return "(no list)";
  const lines = day.notes.map((n) => `note: ${n.text}`);
  for (const i of day.items) {
    const window = i.from || i.until ? ` ${i.from ?? ""}-${i.until ?? ""}` : "";
    const goal = i.goal > 1 || i.unit ? ` ${i.progress}/${i.goal}${i.unit ? " " + i.unit : ""}` : "";
    const wait = i.waitingFor ? ` (waiting for ${i.waitingFor})` : "";
    lines.push(`- [${i.state}] ${i.title} {id: ${i.id}, ${i.file}, per ${i.per}}${window}${goal}${wait}`);
  }
  return lines.length ? lines.join("\n") : "(nothing)";
}

function contextBlock(files: Files, ev: Evaluation, now: number, timeZone: string): string {
  const d = new Date(now);
  const fileText = Object.keys(files).length
    ? Object.keys(files)
        .sort()
        .map((p) => `=== ${p} ===\n${files[p]}`)
        .join("\n\n")
    : "(no files yet)";
  return [
    `Now: ${WEEKDAY_NAMES[d.getDay()]} ${dateKey(d)} ${hhmm(d)} (${timeZone})`,
    `Program files:\n${fileText}`,
    formatErrors(ev.errors),
    `Today's list:\n${formatDay(ev.days[0])}`,
  ].join("\n\n");
}

function parseArgs(call: ToolCall): Record<string, unknown> {
  try {
    const v = JSON.parse(call.function.arguments || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

const PATH = /^[a-z0-9][a-z0-9._/-]{0,80}\.js$/;

export async function runAgent(text: string, files: Files, prior: PriorTurn[], deps: AgentDeps): Promise<AgentResult> {
  const draft: Files = { ...files };
  const today = dateKey(new Date(deps.now));
  const initial = await deps.evaluate(draft, deps.now, [today]);

  const messages: ChatMessage[] = [];
  for (const t of prior.slice(-16)) {
    if (t.role === "user") messages.push({ role: "user", content: t.text });
    else if (t.role === "agent") messages.push({ role: "assistant", content: t.text || "(done)" });
    else messages.push({ role: "user", content: `[I edited the program by hand: ${t.text}]` });
  }
  // The API requires alternating turns starting with a user message.
  while (messages.length && messages[0].role !== "user") messages.shift();
  messages.push({ role: "user", content: `${contextBlock(draft, initial, deps.now, deps.timeZone)}\n\n---\n\n${text}` });

  const tools: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
    write_file: async ({ path, content }) => {
      const p = String(path ?? "");
      if (!PATH.test(p) || p.includes("..")) return `error: invalid path "${p}". Use lowercase letters, digits, ., _, -, / and end in .js`;
      draft[p] = String(content ?? "");
      deps.onActivity({ label: files[p] === undefined ? "created" : "rewrote", detail: p });
      return "ok";
    },
    edit_file: async ({ path, old_string, new_string }) => {
      const p = String(path ?? "");
      const src = draft[p];
      if (src === undefined) return `error: no file ${p}`;
      const old = String(old_string ?? "");
      const first = src.indexOf(old);
      if (!old || first < 0) return "error: old_string not found; copy it exactly from the current file";
      if (src.indexOf(old, first + 1) >= 0) return "error: old_string occurs more than once; include more context";
      draft[p] = src.slice(0, first) + String(new_string ?? "") + src.slice(first + old.length);
      deps.onActivity({ label: "edited", detail: p });
      return "ok";
    },
    delete_file: async ({ path }) => {
      const p = String(path ?? "");
      if (draft[p] === undefined) return `error: no file ${p}`;
      delete draft[p];
      deps.onActivity({ label: "deleted", detail: p });
      return "ok";
    },
    read_file: async ({ path }) => {
      const p = String(path ?? "");
      return draft[p] ?? `error: no file ${p}`;
    },
    run: async ({ date, time }) => {
      const day = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
      let at = deps.now;
      if (day !== today || typeof time === "string") {
        const t = typeof time === "string" && /^\d{1,2}:\d{2}$/.test(time) ? time : day === today ? hhmm(new Date(deps.now)) : "12:00";
        const [h, m] = t.split(":").map(Number);
        const d = new Date(`${day}T00:00:00`);
        d.setHours(h, m);
        at = d.getTime();
      }
      const ev = await deps.evaluate(draft, at, [day]);
      deps.onActivity({ label: "ran program", detail: ev.errors.length ? `${ev.errors.length} error${ev.errors.length > 1 ? "s" : ""}` : `${ev.days[0]?.items.length ?? 0} items`, ok: !ev.errors.length });
      return `${formatErrors(ev.errors)}\n\nList for ${day} at ${hhmm(new Date(at))}:\n${formatDay(ev.days[0])}`;
    },
    history: async ({ task, days }) => {
      const n = typeof days === "number" && days > 0 ? Math.min(days, 400) : 14;
      const since = deps.now - n * 86_400_000;
      const id = typeof task === "string" && task ? slug(task) : null;
      const rows = deps.history.filter((e) => e.at >= since && (!id || e.task === id));
      deps.onActivity({ label: "read history", detail: id ?? `${n} days` });
      if (!rows.length) return "no entries";
      return rows
        .sort((a, b) => a.at - b.at)
        .map((e) => `${dateKey(new Date(e.at))} ${hhmm(new Date(e.at))} ${e.task} ${e.amount > 0 ? "+" : ""}${e.amount} (period ${e.period})`)
        .join("\n");
    },
    log: async ({ task, amount }) => {
      const id = slug(String(task ?? ""));
      const ev = await deps.evaluate(draft, deps.now, [today]);
      const info = ev.tasks.find((t) => t.id === id);
      if (!info) return `error: no task with id ${id}`;
      const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 1;
      await deps.log(id, periodKey(info.per, today), n);
      deps.onActivity({ label: "logged", detail: `${info.title} ${n > 0 ? "+" : ""}${n}` });
      return "ok";
    },
  };

  for (let i = 0; i < MAX_STEPS; i++) {
    if (deps.aborted()) return { reply: "Stopped.", draft };
    deps.onActivity({ label: "thinking" });
    const reply = await deps.step(messages);
    messages.push(reply);
    if (!reply.tool_calls?.length) return { reply: (reply.content ?? "").trim() || "Done.", draft };
    for (const call of reply.tool_calls) {
      const tool = tools[call.function.name];
      const result = tool ? await tool(parseArgs(call)) : `error: unknown tool ${call.function.name}`;
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
  return { reply: "I ran out of steps before finishing. What I changed so far is saved.", draft };
}

export function changedFiles(before: Files, after: Files): { path: string; source: string | null }[] {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: { path: string; source: string | null }[] = [];
  for (const p of [...paths].sort()) {
    const a = before[p];
    const b = after[p];
    if (a === b) continue;
    out.push({ path: p, source: b ?? null });
  }
  return out;
}
