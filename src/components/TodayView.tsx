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
import { dayIndexLocal, dayIndexToStart, modeOf, stepOf, thresholdOf, type CompletionMode, type RecurState } from "@/lib/recur";
import { isNegative, type HoldItem } from "@/lib/negative";
import { missCopy } from "@/lib/ritual";
import { normalizeDueAt } from "@/lib/due";
import { getAncestors, type DecryptedNode, type TreeNode } from "@/lib/tree";
import { CountControl } from "./CountControl";
import { Heatmap } from "./Heatmap";
import { SlipControl } from "./SlipControl";

// the all-clear payoff lines — typed out in the input's typewriter voice when
// the day closes. One is picked per mount, typed once, and held: the moment
// should not erase itself.
const ALL_CLEAR_PHRASES = [
  "all clear — the day is closed",
  "all clear — nothing left to open",
  "all clear — rest is earned",
];

function AllClearMoment({ doneToday, nothingDue }: { doneToday: number; nothingDue: boolean }) {
  const [phrase, setPhrase] = useState("");
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(true);
  useEffect(() => {
    // impure pick lives here, not in render — the moment is typed once per mount
    const p = ALL_CLEAR_PHRASES[Math.floor(Math.random() * ALL_CLEAR_PHRASES.length)];
    setPhrase(p);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setText(p);
      setTyping(false);
      return;
    }
    let i = 0;
    let timer: number;
    const tick = () => {
      i += 1;
      setText(p.slice(0, i));
      if (i < p.length) {
        timer = window.setTimeout(tick, 42 + Math.random() * 38);
      } else {
        setTyping(false);
      }
    };
    // the beat: a breath between the last fade-out and the line landing
    timer = window.setTimeout(tick, 500);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="border-y border-foreground bg-foreground text-background">
      <div className="flex flex-col items-center gap-1.5 px-3 py-10 text-center">
        <p className="font-mono text-base">
          <span aria-hidden>
            {text}
            <span
              className={`all-clear-caret ml-0.5 inline-block h-[1.05em] w-[0.55em] translate-y-[0.18em] bg-current ${typing ? "" : "opacity-60"}`}
            />
          </span>
          <span className="sr-only">{phrase}</span>
        </p>
        {doneToday > 0 && <p className="text-[11px] opacity-60">{doneToday} done today</p>}
        {nothingDue && <p className="text-[11px] opacity-60">recurring tasks with an open window and tasks due today show up here.</p>}
      </div>
    </div>
  );
}

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
    // negative tasks live in the holds section — they never gate all clear
    if (isNegative(meta)) continue;
    // the auto-habit meta-task is fed by reaching all clear — never a today row

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
  missNote,
  onToggle,
  onCountUp,
  onCountDown,
  onSelect,
  onJump,
}: {
  item: TodayItem;
  map: Map<string, TreeNode>;
  /** missed-days escalation, grey on the right — open recurring rows only */
  missNote?: string | null;
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
        {missNote && (
          <span className="shrink-0 max-w-[40%] truncate text-[10px] opacity-50" title={missNote}>
            {missNote}
          </span>
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
  /** negative task — heatmap levels are slips (more = worse) */
  negative?: boolean;
};

function holdDayLabel(windowDay: number): string {
  return new Date(dayIndexToStart(windowDay)).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// One holds-section row. Open windows carry the slip control; ended windows
// either ask for the held-confirm (clean) or state the failure — a failure
// needs no action, it drops out when the next window rolls.
function HoldRow({
  item,
  isTouch,
  onSlip,
  onUndoSlip,
  onConfirmHold,
  onSelect,
}: {
  item: HoldItem;
  /** touch-first device — the hold hint only makes sense where holding logs */
  isTouch: boolean;
  onSlip: (node: TreeNode) => void;
  onUndoSlip: (node: TreeNode) => void;
  onConfirmHold: (node: TreeNode, windowDay: number) => void;
  onSelect: (node: TreeNode) => void;
}) {
  const { node, kind, windowDay, slips, tol } = item;
  const day = holdDayLabel(windowDay);
  const slipWord = slips === 1 ? "1 slip" : `${slips} slips`;
  if (kind === "open") {
    return (
      <li className="border-b border-foreground/10 last:border-b-0">
        <div className="flex items-center gap-2 px-3 py-2 text-sm">
          <SlipControl slips={slips} onSlip={() => onSlip(node)} onUndo={() => onUndoSlip(node)} />
          <button onClick={() => onSelect(node)} className="min-w-0 flex-1 text-left truncate" title={node.title}>
            {node.title}
          </button>
          {isTouch && slips === 0 && <span className="shrink-0 text-[10px] opacity-40">hold to slip</span>}
        </div>
      </li>
    );
  }
  if (kind === "confirm") {
    return (
      <li className="border-b border-foreground/10 last:border-b-0">
        <div className="flex items-center gap-2 px-3 py-2 text-sm">
          <button
            onClick={() => onConfirmHold(node, windowDay)}
            className="h-[18px] w-16 shrink-0 border border-foreground text-[10px] leading-none hover:bg-foreground hover:text-background"
            aria-label={`confirm ${node.title} held`}
          >
            ✓ held?
          </button>
          <button onClick={() => onSelect(node)} className="min-w-0 flex-1 text-left truncate" title={node.title}>
            {node.title}
          </button>
          <span className="shrink-0 text-[10px] opacity-40">{day} — clean, confirm</span>
        </div>
      </li>
    );
  }
  return (
    <li className="border-b border-foreground/10 last:border-b-0">
      <div className="flex items-center gap-2 px-3 py-2 text-sm opacity-60">
        <span className="flex h-[18px] w-16 shrink-0 items-center justify-center border border-foreground/40 bg-foreground text-[10px] leading-none text-background">
          ✕ failed
        </span>
        <button onClick={() => onSelect(node)} className="min-w-0 flex-1 text-left truncate" title={node.title}>
          {node.title}
        </button>
        <span className="shrink-0 text-[10px] opacity-60">
          {day} — {slipWord}
          {tol > 0 ? ` (tolerated ${tol})` : ""}
        </span>
      </div>
    </li>
  );
}

// Horizontal past-year carousel. Native scroll-snap does the paging (trackpad
// + touch for free); the dots mirror and drive the active slide. Squares, not
// circles — everything else on this surface is square. Autoscroll rotates the
// slides but stands down while the user is engaged (hover, touch, or a recent
// manual scroll); under prefers-reduced-motion it still rotates, just without
// the smooth glide (instant jump instead).
const AUTO_MS = 6000;

function PastYearCarousel({ slides, nowTs }: { slides: PastYearSlide[]; nowTs: number }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const hoverRef = useRef(false);
  const interactRef = useRef(0);

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

  useEffect(() => {
    if (slides.length < 2) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = setInterval(() => {
      if (document.hidden) return;
      if (hoverRef.current || Date.now() - interactRef.current < AUTO_MS * 1.5) return;
      const el = trackRef.current;
      if (!el) return;
      const i = Math.round(el.scrollLeft / el.clientWidth);
      const next = (Math.max(0, Math.min(slides.length - 1, i)) + 1) % slides.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: reduced ? "auto" : "smooth" });
    }, AUTO_MS);
    return () => clearInterval(tick);
  }, [slides.length]);

  const markInteract = () => {
    interactRef.current = Date.now();
  };

  return (
    <div
      className="border-b border-foreground/10 px-3 py-2"
      onPointerEnter={() => {
        hoverRef.current = true;
      }}
      onPointerLeave={() => {
        hoverRef.current = false;
      }}
      onPointerDown={markInteract}
      onTouchStart={markInteract}
      onWheel={markInteract}
    >
      <div className="mb-1 truncate text-center font-mono text-xs font-bold" title={slides[active]?.title}>
        {slides[active]?.title}
      </div>
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory overflow-x-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {slides.map((s) => (
          <div key={s.id} className="w-full shrink-0 snap-center">
            <Heatmap counts={s.counts} nowTs={nowTs} mode={s.mode} negative={s.negative} />
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
  holds,
  nowTs,
  map,
  slides = [],
  missesByTask,
  showHabitOffer = false,
  isTouch = false,
  onCreateHabit,
  onDismissHabitOffer,
  onToggle,
  onCountUp,
  onCountDown,
  onSelect,
  onJump,
  onSlip,
  onUndoSlip,
  onConfirmHold,
}: {
  items: TodayItem[] | null;
  /** negative-task rows (see buildHoldItems) — never count toward "N left" */
  holds?: HoldItem[] | null;
  nowTs: number;
  map: Map<string, TreeNode>;
  /** past-year heatmap carousel: "all tasks" + one slide per task with history */
  slides?: PastYearSlide[];
  /** per-task missed days (see buildTaskMisses in TodoApp) — recurring rows
   * whose own streak reaches two carry the escalation note */
  missesByTask?: Map<string, number>;
  showHabitOffer?: boolean;
  /** touch-first device — gates the "hold to slip" hint to where holding logs */
  isTouch?: boolean;
  onCreateHabit: () => void;
  onDismissHabitOffer: () => void;
  onToggle: (node: TreeNode) => Promise<void>;
  onCountUp: (node: TreeNode, delta?: number) => Promise<void>;
  onCountDown: (node: TreeNode, delta?: number) => Promise<void>;
  onSelect: (node: TreeNode) => void;
  onJump: (parts: string[]) => void;
  onSlip: (node: TreeNode) => void;
  onUndoSlip: (node: TreeNode) => void;
  onConfirmHold: (node: TreeNode, windowDay: number) => void;
}) {
  const dateLabel = new Date(nowTs).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const open = openCountOf(items ?? []);
  const missNoteOf = (i: TodayItem) => {
    const n = missesByTask?.get(String(i.node._id));
    return n !== undefined && i.rs?.isRecurring && rowIsOpen(i) ? missCopy(n) : null;
  };

  if (!items) return <p className="px-3 py-8 text-sm opacity-60">loading…</p>;

  const groups: (0 | 1 | 2)[] = [0, 1, 2];
  const holdRows = holds ?? [];

  return (
    <div className="min-h-[180px] pb-2">
      {slides.length > 0 && <PastYearCarousel slides={slides} nowTs={nowTs} />}
      <div className="flex items-baseline justify-between border-b border-foreground/10 px-3 py-2 text-xs">
        <span className="font-mono">{dateLabel}</span>
        <span className="opacity-60">{open === 0 ? "all clear" : `${open} left`}</span>
      </div>
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
      {open === 0 ? (
        <>
          {/* the all-clear moment — full-bleed, typed, held. Negative tasks
              never block it; their holds section renders below. */}
          <AllClearMoment
            doneToday={items.reduce((n, i) => n + (i.group === 1 && !rowIsOpen(i) ? 1 : 0), 0)}
            nothingDue={items.length === 0}
          />
        </>
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
                  <TodayRow
                    key={i.node._id}
                    item={i}
                    map={map}
                    missNote={missNoteOf(i)}
                    onToggle={onToggle}
                    onCountUp={onCountUp}
                    onCountDown={onCountDown}
                    onSelect={onSelect}
                    onJump={onJump}
                  />
                ))}
              </ul>
            </div>
          );
        })
      )}
      {holdRows.length > 0 && (
        <div>
          <div className="border-b border-foreground/10 bg-foreground/[0.03] px-3 py-1 text-[10px] opacity-60">battles</div>
          <ul>
            {holdRows.map((h) => (
              <HoldRow key={`${h.node._id}:${h.kind}:${h.windowDay}`} item={h} isTouch={isTouch} onSlip={onSlip} onUndoSlip={onUndoSlip} onConfirmHold={onConfirmHold} onSelect={onSelect} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
