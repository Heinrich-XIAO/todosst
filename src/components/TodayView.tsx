"use client";
/* eslint-disable react-hooks/set-state-in-effect -- the completed-row fade is
   timer-driven: hidden flips in a timeout and must reset when a row is
   un-checked; same tradeoff as TodoApp.tsx */

// Today view — the daily ritual surface. Open the app, see only what has an
// open window: recurring tasks due today (or whose earlier window is still
// open), plus plain tasks with a due date of today or earlier. Everything else
// stays in the tree view.

import { useEffect, useRef, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { PlainNode } from "@/lib/crypto";
import { dayIndexLocal, modeOf, stepOf, thresholdOf, type CompletionMode, type RecurState } from "@/lib/recur";
import { missCopy } from "@/lib/ritual";
import { normalizeDueAt } from "@/lib/due";
import { getAncestors, type DecryptedNode, type TreeNode } from "@/lib/tree";
import { CountControl } from "./CountControl";
import { Heatmap } from "./Heatmap";

export type TodayItem = {
  node: TreeNode;
  rs: RecurState | null;
  /** 0 = overdue, 1 = today, 2 = earlier window still open */
  group: 0 | 1 | 2;
};

const GROUP_LABELS = ["overdue", "today", "still open"] as const;

/** A row still wants action today: a recurring count below threshold, or an
 * uncompleted plain task. Completed overdue rows are settled history — they
 * no longer block all clear (the ritual must be reachable). */
export function rowIsOpen(i: TodayItem): boolean {
  const rs = i.rs;
  if (rs?.isRecurring) return rs.count < thresholdOf(i.node.metadata as PlainNode["metadata"]);
  return !i.node.isCompleted;
}

export function openCountOf(items: TodayItem[]): number {
  let n = 0;
  for (const i of items) if (rowIsOpen(i)) n++;
  return n;
}

export function buildTodayItems(
  nodes: DecryptedNode[] | null,
  tree: { map: Map<string, TreeNode> },
  recurStates: Map<string, RecurState> | null,
  nowTs: number
): TodayItem[] | null {
  if (!nodes || !recurStates) return null;
  const today = dayIndexLocal(nowTs);
  const rows: TodayItem[] = [];
  for (const n of nodes) {
    const tn = tree.map.get(n._id as string);
    if (!tn) continue;
    const meta = n.metadata as PlainNode["metadata"];
    // the auto-habit meta-task is fed by reaching all clear — never a today row
    if (meta.habit) continue;
    const rs = recurStates.get(n._id as string) ?? null;
    if (rs?.isRecurring) {
      if (rs.expired || rs.windowDay > today) continue;
      // done in an earlier window -> it belongs to that window's history
      if (rs.windowDay < today && rs.count >= thresholdOf(meta)) continue;
      rows.push({ node: tn, rs, group: rs.windowDay === today ? 1 : 2 });
      continue;
    }
    const dueAt = meta.dueAt ? normalizeDueAt(meta.dueAt) : null;
    if (dueAt && dayIndexLocal(dueAt) <= today) {
      rows.push({ node: tn, rs: null, group: dayIndexLocal(dueAt) < today ? 0 : 1 });
    }
  }
  rows.sort((a, b) => a.group - b.group || a.node.title.localeCompare(b.node.title));
  return rows;
}

function TodayRow({
  item,
  map,
  onToggle,
  onCountUp,
  onCountDown,
  onSelect,
  onJump,
}: {
  item: TodayItem;
  map: Map<string, TreeNode>;
  onToggle: (node: TreeNode) => Promise<void>;
  onCountUp: (node: TreeNode, delta?: number) => Promise<void>;
  onCountDown: (node: TreeNode, delta?: number) => Promise<void>;
  onSelect: (node: TreeNode) => void;
  onJump: (parts: string[]) => void;
}) {
  const { node, rs } = item;
  const meta = node.metadata as PlainNode["metadata"];
  const mode = modeOf(meta);
  const threshold = thresholdOf(meta);
  const count = rs?.count ?? 0;
  const checked = rs?.isRecurring ? count >= threshold : node.isCompleted;

  // a freshly completed row fades out over 3s, then unmounts; un-completing
  // brings it straight back. Rows that load already-completed render hidden.
  const [hidden, setHidden] = useState(checked);
  useEffect(() => {
    if (checked) {
      const t = window.setTimeout(() => setHidden(true), 3000);
      return () => window.clearTimeout(t);
    }
    setHidden(false);
  }, [checked]);

  const ancestors = getAncestors(node._id as Id<"todos">, map);

  if (hidden) return null;

  return (
    <li className="border-b border-foreground/10 last:border-b-0">
      <div className={`flex items-center gap-2 px-3 py-2 text-sm ${checked ? "opacity-40" : ""}`}>
        <CountControl
          mode={mode}
          count={count}
          threshold={threshold}
          checked={checked}
          meta={meta}
          onToggle={() => onToggle(node)}
          onCountUp={() => onCountUp(node, mode === "time" ? stepOf(meta) : undefined)}
          onCountDown={() => onCountDown(node, mode === "time" ? stepOf(meta) : undefined)}
        />
        <button
          onClick={() => onSelect(node)}
          className="min-w-0 flex-1 text-left"
          title={node.title}
        >
          <span className="truncate">{node.title}</span>
          {meta.recur ? (
            <span className="ml-1 text-[10px] opacity-50" title={String(meta.recur)}>
              ↻ {rs?.summary || "recurring"}
            </span>
          ) : null}
        </button>
        {ancestors.length > 0 && (
          <button
            onClick={() => onJump(ancestors.map((a) => a.title))}
            className="shrink-0 max-w-[120px] truncate text-[10px] opacity-40 hover:opacity-100"
            title={`open ${ancestors.map((a) => a.title).join("/")}`}
          >
            {ancestors.map((a) => a.title).join("/")}
          </button>
        )}
      </div>
    </li>
  );
}

/** One carousel slide: a past-year heatmap for a single task (or the
 * "all tasks" aggregate). */
export type PastYearSlide = {
  id: string;
  title: string;
  mode: CompletionMode;
  counts: Map<number, number>;
};

// Horizontal past-year carousel. Native scroll-snap does the paging (trackpad
// + touch for free); the dots mirror and drive the active slide. Squares, not
// circles — everything else on this surface is square.
function PastYearCarousel({ slides, nowTs }: { slides: PastYearSlide[]; nowTs: number }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => {
      const i = Math.round(el.scrollLeft / el.clientWidth);
      setActive(Math.max(0, Math.min(slides.length - 1, i)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [slides.length]);

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="border-b border-foreground/10 px-3 py-2">
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[10px]">
        <span className="shrink-0 opacity-40">past year</span>
        <span className="truncate font-mono opacity-60" title={slides[active]?.title}>
          {slides[active]?.title}
        </span>
      </div>
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory overflow-x-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {slides.map((s) => (
          <div key={s.id} className="w-full shrink-0 snap-center">
            <Heatmap counts={s.counts} nowTs={nowTs} mode={s.mode} />
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="mt-2 flex justify-center gap-[6px]">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => goTo(i)}
              aria-label={`past year: ${s.title}`}
              className={`h-[5px] w-[5px] ${i === active ? "bg-foreground" : "bg-foreground/25 hover:bg-foreground/50"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TodayView({
  items,
  nowTs,
  map,
  slides = [],
  misses = 0,
  showHabitOffer = false,
  onCreateHabit,
  onDismissHabitOffer,
  onToggle,
  onCountUp,
  onCountDown,
  onSelect,
  onJump,
}: {
  items: TodayItem[] | null;
  nowTs: number;
  map: Map<string, TreeNode>;
  /** past-year heatmap carousel: "all tasks" + one slide per task with history */
  slides?: PastYearSlide[];
  /** consecutive missed days entering today (tracked locally, per device) */
  misses?: number;
  showHabitOffer?: boolean;
  onCreateHabit: () => void;
  onDismissHabitOffer: () => void;
  onToggle: (node: TreeNode) => Promise<void>;
  onCountUp: (node: TreeNode, delta?: number) => Promise<void>;
  onCountDown: (node: TreeNode, delta?: number) => Promise<void>;
  onSelect: (node: TreeNode) => void;
  onJump: (parts: string[]) => void;
}) {
  const dateLabel = new Date(nowTs).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const open = openCountOf(items ?? []);
  const escalate = missCopy(misses);

  if (!items) return <p className="px-3 py-8 text-sm opacity-60">loading…</p>;

  const groups: (0 | 1 | 2)[] = [0, 1, 2];

  return (
    <div className="min-h-[180px] pb-2">
      {slides.length > 0 && <PastYearCarousel slides={slides} nowTs={nowTs} />}
      <div className="flex items-baseline justify-between border-b border-foreground/10 px-3 py-2 text-xs">
        <span className="font-mono">{dateLabel}</span>
        <span className="opacity-60">{open === 0 ? "all clear" : `${open} open`}</span>
      </div>
      {open > 0 && escalate && (
        <div className="border-b border-foreground/10 bg-foreground/[0.03] px-3 py-1 text-[10px]">{escalate}</div>
      )}
      {showHabitOffer && (
        <div className="border-b border-foreground/10 px-3 py-2 text-xs">
          <p className="opacity-80">
            keep a streak without another box? add <span className="font-mono">open todosst ~daily</span> — it checks
            itself whenever you reach all clear.
          </p>
          <div className="mt-1 flex gap-3">
            <button onClick={onCreateHabit} className="underline underline-offset-4">
              add it
            </button>
            <button onClick={onDismissHabitOffer} className="opacity-40 hover:opacity-100">
              no thanks
            </button>
          </div>
        </div>
      )}
      {items.length === 0 ? (
        <div className="px-3 py-12 text-sm opacity-60">
          <p>nothing due today.</p>
          <p className="mt-1 text-xs opacity-60">recurring tasks with an open window and tasks due today show up here.</p>
        </div>
      ) : (
        groups.map((g) => {
          // labeled groups (overdue / still open) hide settled rows so they can
          // never render as an empty header; today's own rows keep the fade
          const rows = items.filter((i) => i.group === g && (g === 1 || rowIsOpen(i)));
          if (rows.length === 0) return null;
          return (
            <div key={g}>
              {g !== 1 && <div className="border-b border-foreground/10 bg-foreground/[0.03] px-3 py-1 text-[10px] opacity-60">{GROUP_LABELS[g]}</div>}
              <ul>
                {rows.map((i) => (
                  <TodayRow key={i.node._id} item={i} map={map} onToggle={onToggle} onCountUp={onCountUp} onCountDown={onCountDown} onSelect={onSelect} onJump={onJump} />
                ))}
              </ul>
            </div>
          );
        })
      )}
    </div>
  );
}
