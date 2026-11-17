"use client";

import { useState } from "react";
import type { DayView, Evaluation, Item, ItemState } from "@/lib/runtime";
import { parseDate } from "@/lib/runtime";

type AddLog = (args: { task: string; period: string; amount: number }) => unknown;

const SECTIONS: { state: ItemState; label: string }[] = [
  { state: "late", label: "Late" },
  { state: "now", label: "Now" },
  { state: "waiting", label: "Waiting" },
  { state: "later", label: "Later today" },
  { state: "done", label: "Done" },
];

function longDate(date: string): string {
  return parseDate(date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function shortDate(date: string): string {
  return parseDate(date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function windowLabel(i: Item): string | null {
  if (i.from && i.until) return `${i.from}–${i.until}`;
  if (i.from) return `from ${i.from}`;
  if (i.until) return `by ${i.until}`;
  return null;
}

function isCounter(i: Item) {
  return i.goal > 1 || Boolean(i.unit);
}

function stepOf(i: Item) {
  return i.goal >= 20 ? 5 : 1;
}

function Check({ item, onLog }: { item: Item; onLog: AddLog }) {
  const done = item.state === "done";
  return (
    <button
      aria-label={done ? `Mark ${item.title} not done` : `Mark ${item.title} done`}
      onClick={() => onLog({ task: item.id, period: item.period, amount: done ? -item.progress : item.goal - item.progress })}
      className={`mt-0.5 size-5 shrink-0 rounded-full border-[1.5px] flex items-center justify-center transition-colors ${
        done ? "bg-done border-done text-bg" : item.state === "late" ? "border-late hover:bg-late/10" : "border-muted hover:border-accent hover:bg-accent-soft"
      }`}
    >
      {done && (
        <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
          <path d="M2.5 6.2 5 8.5 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

function Counter({ item, onLog }: { item: Item; onLog: AddLog }) {
  const step = stepOf(item);
  const pct = Math.min(100, (item.progress / item.goal) * 100);
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        aria-label={`Remove ${step} from ${item.title}`}
        disabled={item.progress <= 0}
        onClick={() => onLog({ task: item.id, period: item.period, amount: -Math.min(step, item.progress) })}
        className="size-7 rounded-md border border-line text-muted hover:text-ink disabled:opacity-30"
      >
        −
      </button>
      <div className="w-20 text-center">
        <div className="font-mono text-xs tabular-nums">
          {item.progress}/{item.goal}
          {item.unit ? ` ${item.unit}` : ""}
        </div>
        <div className="h-1 rounded-full bg-line mt-1 overflow-hidden">
          <div className={`h-full ${item.state === "done" ? "bg-done" : "bg-accent"}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <button
        aria-label={`Add ${step} to ${item.title}`}
        onClick={() => onLog({ task: item.id, period: item.period, amount: step })}
        className="size-7 rounded-md border border-line text-ink hover:border-accent hover:bg-accent-soft"
      >
        +
      </button>
    </div>
  );
}

function Row({ item, onLog, onOpenFile }: { item: Item; onLog: AddLog; onOpenFile: (path: string) => void }) {
  const win = windowLabel(item);
  const done = item.state === "done";
  const meta = [
    win,
    item.per === "week" ? "this week" : item.per === "month" ? "this month" : null,
    item.state === "late" && item.date ? `due ${shortDate(item.date)}` : null,
    item.waitingFor ? `after ${item.waitingFor}` : null,
  ].filter(Boolean);
  return (
    <li className={`group flex items-start gap-3 px-4 py-3 ${item.state === "waiting" ? "opacity-60" : ""}`}>
      {!isCounter(item) && <Check item={item} onLog={onLog} />}
      <div className="min-w-0 flex-1">
        <div className={`leading-snug ${done ? "line-through text-muted" : ""}`}>{item.title}</div>
        {(meta.length > 0 || item.group) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            {item.group && <span className="rounded bg-line/60 px-1.5 py-px">{item.group}</span>}
            {meta.map((m) => (
              <span key={m} className={item.state === "late" && m === win ? "text-late" : ""}>
                {m}
              </span>
            ))}
          </div>
        )}
        {item.notes && !done && <div className="mt-1 text-sm text-muted">{item.notes}</div>}
      </div>
      {isCounter(item) && <Counter item={item} onLog={onLog} />}
      <button
        onClick={() => onOpenFile(item.file)}
        className="hidden sm:block shrink-0 font-mono text-[11px] text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-accent mt-1"
        title="Open the code for this task"
      >
        {item.file}
      </button>
    </li>
  );
}

function Upcoming({ days }: { days: DayView[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!days.length) return null;
  return (
    <section className="mt-10">
      <h2 className="px-1 mb-2 text-xs font-medium uppercase tracking-wider text-muted">Coming up</h2>
      <ul className="rounded-xl border border-line bg-panel divide-y divide-line">
        {days.map((d) => (
          <li key={d.date}>
            <button
              onClick={() => setOpen(open === d.date ? null : d.date)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-bg/50"
              aria-expanded={open === d.date}
            >
              <span>{shortDate(d.date)}</span>
              <span className="text-sm text-muted">{d.items.length ? `${d.items.length} task${d.items.length > 1 ? "s" : ""}` : "free"}</span>
            </button>
            {open === d.date && d.items.length > 0 && (
              <ul className="px-4 pb-3 space-y-1 text-sm">
                {[...d.items]
                  .sort((a, b) => (a.from ?? "99").localeCompare(b.from ?? "99"))
                  .map((i) => (
                    <li key={i.id} className="flex gap-3">
                      <span className="w-12 shrink-0 font-mono text-xs text-muted pt-0.5">{i.from ?? ""}</span>
                      <span>{i.title}</span>
                    </li>
                  ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TodayView({
  evaluation,
  today,
  onLog,
  onOpenFile,
  onShowErrors,
}: {
  evaluation: Evaluation | null;
  today: string;
  onLog: AddLog;
  onOpenFile: (path: string) => void;
  onShowErrors: () => void;
}) {
  const day = evaluation?.days[0];
  const items = day?.items ?? [];
  const done = items.filter((i) => i.state === "done").length;
  const errors = evaluation?.errors ?? [];
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-10 sm:pt-10">
      <header className="mb-6 px-1">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{longDate(today)}</h1>
        {items.length > 0 && (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 rounded-full bg-line overflow-hidden">
              <div className="h-full bg-done transition-[width] duration-500" style={{ width: `${(done / items.length) * 100}%` }} />
            </div>
            <span className="font-mono text-xs text-muted tabular-nums">
              {done}/{items.length}
            </span>
          </div>
        )}
      </header>

      {errors.length > 0 && (
        <button
          onClick={onShowErrors}
          className="mb-4 w-full rounded-xl border border-late/40 bg-late/5 px-4 py-3 text-left text-sm text-late"
        >
          {errors.length === 1 ? `${errors[0].file}: ${errors[0].message}` : `${errors.length} problems in your program. Open the code to see them.`}
        </button>
      )}

      {day?.notes.map((n, i) => (
        <p key={i} className="mb-3 rounded-xl bg-accent-soft px-4 py-3 text-sm">
          {n.text}
        </p>
      ))}

      {!evaluation ? (
        <div className="px-1 text-muted">Running your program…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center text-muted">
          Nothing on today. Tell the agent what you want to keep track of.
        </div>
      ) : (
        <div className="space-y-6">
          {SECTIONS.map(({ state, label }) => {
            const list = items.filter((i) => i.state === state);
            if (!list.length) return null;
            return (
              <section key={state}>
                <h2 className={`px-1 mb-2 text-xs font-medium uppercase tracking-wider ${state === "late" ? "text-late" : "text-muted"}`}>
                  {label}
                </h2>
                <ul className="rounded-xl border border-line bg-panel divide-y divide-line">
                  {list.map((i) => (
                    <Row key={i.id} item={i} onLog={onLog} onOpenFile={onOpenFile} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <Upcoming days={evaluation?.days.slice(1) ?? []} />
    </div>
  );
}
