"use client";

import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { diffLines, diffStat } from "@/lib/diff";
import type { AgentRun } from "./useAgent";

type Change = { path: string; before: string | null; after: string | null };
export type Message = {
  id: Id<"messages">;
  role: "user" | "agent" | "edit";
  text: string;
  changes: Change[];
  reverted: boolean;
  at: number;
};

const EXAMPLES = [
  "Get my power bank in the morning and charge it at night",
  "Drink 8 glasses of water a day",
  "Gym 3 times a week",
  "Remind me to call the dentist on Friday",
];

function Diff({ change }: { change: Change }) {
  const lines = diffLines(change.before ?? "", change.after ?? "");
  return (
    <pre className="mt-1 max-h-72 overflow-auto scroll-thin rounded-md bg-code border border-line font-mono text-[11.5px] leading-[1.55] py-1.5">
      {lines.map((l, i) => (
        <div
          key={i}
          className={`px-2 whitespace-pre-wrap break-words ${
            l.kind === "add" ? "bg-done/15 text-ink" : l.kind === "del" ? "bg-late/12 text-muted line-through decoration-late/40" : "text-muted"
          }`}
        >
          <span className="select-none opacity-60 mr-1.5">{l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}</span>
          {l.text || " "}
        </div>
      ))}
    </pre>
  );
}

function Changes({ message, onOpenFile }: { message: Message; onOpenFile: (path: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const revert = useMutation(api.program.revert);
  const [note, setNote] = useState<string | null>(null);
  if (!message.changes.length) return null;
  return (
    <div className="mt-2 space-y-1">
      {message.changes.map((c) => {
        const { added, removed } = diffStat(c.before, c.after);
        const verb = c.before === null ? "created" : c.after === null ? "deleted" : "edited";
        return (
          <div key={c.path}>
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setOpen(open === c.path ? null : c.path)}
                className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1 hover:border-accent"
                aria-expanded={open === c.path}
              >
                <span className="text-muted">{verb}</span>
                <span className="font-mono">{c.path}</span>
                <span className="font-mono text-done">+{added}</span>
                <span className="font-mono text-late">−{removed}</span>
              </button>
              {c.after !== null && (
                <button onClick={() => onOpenFile(c.path)} className="text-muted hover:text-accent">
                  open
                </button>
              )}
            </div>
            {open === c.path && <Diff change={c} />}
          </div>
        );
      })}
      <div className="flex items-center gap-3 pt-0.5 text-xs">
        {message.reverted ? (
          <span className="text-muted">undone</span>
        ) : (
          <button
            className="text-muted hover:text-late"
            onClick={async () => {
              const r = await revert({ id: message.id });
              if (r.skipped.length) setNote(`Kept ${r.skipped.join(", ")}: changed again since.`);
            }}
          >
            undo this change
          </button>
        )}
        {note && <span className="text-muted">{note}</span>}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <span className="inline-flex gap-0.5" aria-label="working">
      <span className="thinking-dot size-1 rounded-full bg-current" />
      <span className="thinking-dot size-1 rounded-full bg-current" />
      <span className="thinking-dot size-1 rounded-full bg-current" />
    </span>
  );
}

export function Composer({
  onSend,
  busy,
  onStop,
  autoFocus,
}: {
  onSend: (text: string) => void;
  busy: boolean;
  onStop: () => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);
  const submit = () => {
    if (busy || !text.trim()) return;
    onSend(text.trim());
    setText("");
  };
  return (
    <div className="flex items-end gap-2 rounded-xl border border-line bg-panel p-2 focus-within:border-accent">
      <textarea
        ref={ref}
        rows={1}
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Tell the agent what you want…"
        className="flex-1 resize-none bg-transparent px-2 py-1.5 outline-none placeholder:text-muted"
      />
      {busy ? (
        <button onClick={onStop} className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:text-ink">
          Stop
        </button>
      ) : (
        <button
          onClick={submit}
          disabled={!text.trim()}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Send
        </button>
      )}
    </div>
  );
}

export function AgentPanel({
  messages,
  run,
  onSend,
  onStop,
  onDismiss,
  onOpenFile,
}: {
  messages: Message[] | undefined;
  run: AgentRun | null;
  onSend: (text: string) => void;
  onStop: () => void;
  onDismiss: () => void;
  onOpenFile: (path: string) => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages?.length, run?.activity.length, run?.error]);
  const empty = messages !== undefined && messages.length === 0 && !run;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-4 py-4 space-y-4">
        {empty && (
          <div className="pt-4">
            <p className="text-sm text-muted mb-3">
              Everything in your list is code the agent writes. Describe what you want, however you would say it.
            </p>
            <div className="flex flex-col gap-2">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  onClick={() => onSend(e)}
                  className="rounded-lg border border-line bg-panel px-3 py-2 text-left text-sm hover:border-accent"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages?.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink text-bg px-3.5 py-2 text-[15px] whitespace-pre-wrap">{m.text}</div>
            </div>
          ) : (
            <div key={m.id} className="text-[15px]">
              {m.role === "edit" && <div className="text-xs text-muted mb-0.5">you edited the code</div>}
              {m.role === "agent" && <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>}
              <Changes message={m} onOpenFile={onOpenFile} />
            </div>
          ),
        )}
        {run && (
          <div className="text-sm">
            <ul className="space-y-1 font-mono text-xs text-muted">
              {run.activity.map((a, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className={a.ok === false ? "text-late" : a.label === "thinking" ? "" : "text-done"}>
                    {a.label === "thinking" ? "·" : a.ok === false ? "!" : "✓"}
                  </span>
                  <span>
                    {a.label}
                    {a.detail ? ` ${a.detail}` : ""}
                  </span>
                  {a.label === "thinking" && i === run.activity.length - 1 && !run.error && <Thinking />}
                </li>
              ))}
              {run.activity.length === 0 && !run.error && (
                <li className="flex items-center gap-2">
                  <span>·</span> starting <Thinking />
                </li>
              )}
            </ul>
            {run.error && (
              <div className="mt-2 rounded-lg border border-late/40 bg-late/5 px-3 py-2 text-late">
                {run.error}{" "}
                <button onClick={onDismiss} className="underline">
                  dismiss
                </button>
              </div>
            )}
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="shrink-0 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Composer onSend={onSend} busy={Boolean(run && !run.error)} onStop={onStop} />
      </div>
    </div>
  );
}
