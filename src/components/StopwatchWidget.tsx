"use client";

// Floating stopwatch UI: a bottom-right widget listing every task with an
// active session (chips to switch; the most recent is selected by default),
// a ticking elapsed display, pause/resume, done and discard. Plus the
// away-time prompt shown after the app/vault returns from being closed.

import { useEffect, useState } from "react";
import { formatElapsed, liveElapsedMs, type ActiveTimer } from "@/lib/stopwatch";
import type { TreeNode } from "@/lib/tree";

export type ActiveTimerInfo = { node: TreeNode; timer: ActiveTimer };

/** Live ticking clock — updates every second while any timer is active. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

export function StopwatchWidget({
  timers,
  onTogglePause,
  onDone,
  onDiscard,
}: {
  timers: ActiveTimerInfo[]; // sorted most-recent-first by the caller
  onTogglePause: (node: TreeNode) => Promise<void>;
  onDone: (node: TreeNode) => Promise<void>;
  onDiscard: (node: TreeNode) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const now = useNow(timers.length > 0);

  // selected chip: remembered while it still exists, else most recent
  const selected = timers.find((t) => t.node._id === selectedId) ?? timers[0];
  const busy = selected.timer.state === "running";
  const runningCount = timers.filter((t) => t.timer.state === "running").length;

  if (!selected) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[260px] border border-foreground bg-background px-3 py-2 shadow-sm">
      <div className="flex items-center justify-between text-[10px] opacity-40">
        <span>stopwatch{runningCount !== 1 ? ` · ${runningCount} running` : ""}</span>
        <span>{timers.length > 1 ? `${timers.indexOf(selected) + 1}/${timers.length}` : ""}</span>
      </div>

      {/* chips — one per parallel timer, click to switch */}
      {timers.length > 1 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {timers.map((t) => (
            <button
              key={t.node._id}
              onClick={() => setSelectedId(t.node._id)}
              title={t.node.title}
              className={`max-w-[110px] truncate border px-1 text-[10px] ${
                t.node._id === selected.node._id ? "border-foreground bg-foreground text-background" : "border-foreground/40 hover:border-foreground"
              }`}
            >
              {t.timer.state === "running" ? "▶ " : "⏸ "}
              {t.node.title}
            </button>
          ))}
        </div>
      )}

      <div className="mt-1 truncate text-xs" title={selected.node.title}>
        {selected.node.title}
      </div>
      <div className={`font-mono text-xl leading-tight ${busy ? "" : "opacity-60"}`}>
        {formatElapsed(liveElapsedMs(selected.timer, now))}
        {!busy && <span className="ml-2 text-[10px] opacity-60">paused</span>}
      </div>

      <div className="mt-1.5 flex items-center gap-2 font-mono text-xs">
        <button
          onClick={() => onTogglePause(selected.node)}
          className="border border-foreground px-2 py-0.5 hover:bg-foreground hover:text-background"
          aria-label={busy ? "pause stopwatch" : "resume stopwatch"}
        >
          {busy ? "⏸ pause" : "▶ resume"}
        </button>
        <button
          onClick={() => onDone(selected.node)}
          className="border border-foreground bg-foreground px-2 py-0.5 text-background hover:opacity-90"
          aria-label="finish stopwatch"
        >
          ✓ done
        </button>
        <button
          onClick={() => onDiscard(selected.node)}
          className="ml-auto opacity-60 hover:opacity-100"
          title="abandon session — nothing recorded"
          aria-label="discard stopwatch"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ---------- away-time prompt ----------

export type AwayItem = { id: string; title: string; away: number };

/**
 * Ask, per still-running timer, whether the time elapsed while the app was
 * away (closed tab / locked vault) should count. Default is NOT counting;
 * escaping the dialog also applies "don't count" to all listed timers.
 */
export function AwayPromptDialog({
  items,
  closedAt,
  now,
  onApply,
}: {
  items: AwayItem[];
  closedAt: number;
  now: number;
  onApply: (countIds: Set<string>) => Promise<void>;
}) {
  const [countIds, setCountIds] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setCountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") void onApply(countIds);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [countIds, onApply]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      onClick={() => onApply(countIds)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="away-prompt-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] border border-foreground bg-background p-6"
      >
        <p className="font-mono text-[11px] opacity-40">root@vault:~$</p>
        <h2 id="away-prompt-title" className="mt-1 font-mono text-sm">
          <span className="opacity-40">$</span> away for {formatElapsed(Math.max(0, now - closedAt))} — count it?
        </h2>
        <p className="mt-2 font-mono text-xs leading-relaxed opacity-70">
          {items.length} running stopwatch{items.length === 1 ? "" : "es"} kept counting while the app was closed. Tick a
          stopwatch to count its away time; leave it unticked to leave that time out.
        </p>
        <div className="mt-3 space-y-1">
          {items.map((item) => (
            <label key={item.id} className="flex items-center gap-2 font-mono text-xs">
              <input type="checkbox" checked={countIds.has(item.id)} onChange={() => toggle(item.id)} className="h-3 w-3 accent-current" />
              <span className="flex-1 truncate" title={item.title}>
                {item.title}
              </span>
              <span className="opacity-60">{formatElapsed(item.away)}</span>
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end font-mono text-xs">
          <button
            autoFocus
            onClick={() => onApply(countIds)}
            className="border border-foreground bg-foreground px-4 py-2 text-background hover:opacity-90 focus:outline-none focus:ring-1 focus:ring-foreground"
          >
            apply
          </button>
        </div>
        <p className="mt-3 text-right font-mono text-[11px] opacity-30">{"> [esc] / backdrop = don't count"}</p>
      </div>
    </div>
  );
}
