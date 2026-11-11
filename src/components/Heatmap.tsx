"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { dayIndexLocal, dayIndexToStart, formatMinutes, type CompletionMode } from "@/lib/recur";
import { MONTHS } from "@/lib/months";

// GitHub-style heatmap of counts per local day.
// Columns run oldest -> newest, rows Sun..Sat, ending at the current week.
// Time mode interprets counts as minutes.
// The column count adapts to the container width (by whole 12px columns) so
// narrow screens show fewer recent months instead of a clipped full year.

const LEVELS = ["bg-foreground/[0.18]", "bg-foreground/25", "bg-foreground/45", "bg-foreground/70", "bg-foreground"];
const TOP = LEVELS.length - 1;
const CELL_PX = 12; // 10px cell + 2px gap

const DATE_OPTS: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
// A full grid asks for 371 day labels and the carousel can mount several grids,
// so the Intl call is by far the most expensive thing in this component's
// render — one call took ~22µs, i.e. ~8ms per grid per render. The label for a
// day index never changes, so it is formatted once and kept.
const dayLabels = new Map<number, string>();
function dayLabel(idx: number): string {
  let label = dayLabels.get(idx);
  if (label === undefined) {
    label = new Date(dayIndexToStart(idx)).toLocaleDateString(undefined, DATE_OPTS);
    // a long-lived tab could walk years of cells; keep the map bounded
    if (dayLabels.size > 2048) dayLabels.clear();
    dayLabels.set(idx, label);
  }
  return label;
}

// The scale is relative to the busiest day on show: that day is the brightest
// level and the rest are even steps below it. Tallies, minutes and aggregates
// have no natural ceiling, so fixed buckets would either saturate or stay dim.
function levelFor(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(TOP, Math.max(1, Math.ceil((count / max) * TOP)));
}

const DOW_LABELS: Record<number, string> = { 1: "mon", 3: "wed", 5: "fri" };

function cellTooltip(
  cell: { idx: number; count: number; future: boolean },
  mode: CompletionMode,
  negative: boolean,
): string | null {
  if (cell.future) return null;
  const date = dayLabel(cell.idx);
  if (negative) {
    return cell.count > 0
      ? `${cell.count} slip${cell.count === 1 ? "" : "s"} — ${date}`
      : `clean — ${date}`;
  }
  // empty cells show nothing — a "0" tooltip is just noise
  if (cell.count <= 0) return null;
  const amount = mode === "time" ? formatMinutes(cell.count) : `${cell.count}`;
  return `${amount} — ${date}`;
}

// memoized: every slide in the carousel is a full grid, and the Today view
// re-renders on any state change — an unchanged grid must not re-render
// 371 cells for a keystroke elsewhere on the page
export const Heatmap = memo(function Heatmap({
  counts,
  nowTs,
  weeks = 53,
  mode = "check",
  negative = false,
  binary = false,
}: {
  counts: Map<number, number>;
  nowTs: number;
  /** max weeks to render — the grid may show fewer when space runs out */
  weeks?: number;
  mode?: CompletionMode;
  /** negative task — a day's level is its slip count (more = worse) */
  negative?: boolean;
  /** yes/no task — a done day is the brightest level, never a dim "1" */
  binary?: boolean;
}) {
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState<number | null>(null);
  // hovered (desktop) or tapped (mobile) cell — tooltip position comes free
  // from the column/row indices since cells sit on a fixed 12px grid
  const [tip, setTip] = useState<{ c: number; r: number; text: string; below: boolean } | null>(null);
  // measured tooltip width — clamps the pill inside the grid so it never
  // clips past the scroll container's right edge (as whitespace-nowrap would)
  const tipRef = useRef<HTMLSpanElement>(null);
  const [tipW, setTipW] = useState(0);
  useLayoutEffect(() => {
    setTipW(tipRef.current?.offsetWidth ?? 0);
  }, [tip]);

  // measure the space the grid actually gets; ResizeObserver keeps it current
  // across viewport changes and carousel slide widths
  useEffect(() => {
    const el = gridWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === "number") setGridWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // whole columns only — before a real measurement fall back to the full span.
  // A width under 8 columns is a mid-layout reading (the details dock opening
  // measures near zero for a frame), never a real container, so it doesn't count.
  const measured = gridWidth !== null && gridWidth >= 8 * CELL_PX;
  const fitWeeks = measured ? Math.max(4, Math.min(weeks, Math.floor(gridWidth / CELL_PX))) : weeks;

  const grid = useMemo(() => {
    const endIdx = dayIndexLocal(nowTs);
    // extend to the end (Saturday) of the current week so today is always rendered
    const endDow = new Date(dayIndexToStart(endIdx)).getDay();
    const alignedEnd = endIdx + (6 - endDow);
    const startIdx = alignedEnd - fitWeeks * 7 + 1;
    const startDow = new Date(dayIndexToStart(startIdx)).getDay(); // 0 = Sun
    const aligned = startIdx - startDow;
    const colCount = Math.ceil((alignedEnd - aligned + 1) / 7);
    // busiest day in the full span, not just the columns that fit — the
    // shades must not shift when the grid narrows
    const spanStart = alignedEnd - weeks * 7 + 1;
    let max = 0;
    for (const [day, c] of counts) {
      if (day >= spanStart && day <= endIdx && c > max) max = c;
    }
    const cols: { idx: number; count: number; future: boolean }[][] = [];
    for (let c = 0; c < colCount; c++) {
      const col: { idx: number; count: number; future: boolean }[] = [];
      for (let r = 0; r < 7; r++) {
        const idx = aligned + c * 7 + r;
        col.push({ idx, count: counts.get(idx) ?? 0, future: idx > endIdx });
      }
      cols.push(col);
    }
    // month labels: first column where the month of the top (Sunday) cell changes
    const monthLabels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    let lastLabelCol = -10;
    cols.forEach((col, c) => {
      const d = new Date(dayIndexToStart(col[0]!.idx));
      if (d.getMonth() !== lastMonth && c > 0 && !col[0]!.future) {
        lastMonth = d.getMonth();
        // skip if it would overlap the previous label (columns are 12px, labels ~18px wide)
        if ((c - lastLabelCol) * 12 >= 24) {
          monthLabels.push({ col: c, label: MONTHS[d.getMonth()]! });
          lastLabelCol = c;
        }
      }
    });
    return { cols, monthLabels, aligned, max };
  }, [counts, nowTs, fitWeeks, weeks]);

  return (
    <div className="text-[11px]">
      <div className="flex gap-3 overflow-x-auto">
        {/* pt-4 = month-label header height (h-3 12px + mb-1 4px) so rows line up */}
        <div className="flex shrink-0 flex-col gap-[2px] pt-4 pr-1 opacity-60">
          {[0, 1, 2, 3, 4, 5, 6].map((r) => (
            <span key={r} className="flex h-[10px] items-center leading-[10px]">
              {DOW_LABELS[r] ?? ""}
            </span>
          ))}
        </div>
        <div ref={gridWrapRef} className="min-w-0 flex-1">
          <div className="relative mb-1 h-3">
            {grid.monthLabels.map((m) => (
              <span
                key={`${m.label}-${m.col}`}
                className="absolute opacity-60"
                // a label on the last column would stick out past the grid's
                // right edge and stretch the scroll area — right-align it
                style={m.col === grid.cols.length - 1 ? { right: 0 } : { left: `${m.col * 12}px` }}
              >
                {m.label}
              </span>
            ))}
          </div>
          <div
            className="relative flex gap-[2px]"
            // tapping anywhere else on the grid dismisses a tap-open tooltip
            onPointerDown={() => setTip(null)}
          >
            {grid.cols.map((col, c) => (
              <div key={c} className="flex flex-col gap-[2px]">
                {col.map((cell, r) => {
                  const text = cellTooltip(cell, mode, negative);
                  return (
                    <span
                      key={cell.idx}
                      aria-label={text ?? undefined}
                      onPointerEnter={(e) => {
                        // touch fires a pointerenter before the tap's pointerdown;
                        // guard so the dismiss above doesn't kill the tooltip.
                        // a held mouse button means a carousel drag, not a hover.
                        if (e.pointerType !== "touch" && e.buttons === 0) {
                          setTip(text ? { c, r, text, below: r < 2 } : null);
                        }
                      }}
                      onPointerLeave={(e) => {
                        if (e.pointerType !== "touch") setTip(null);
                      }}
                      onPointerUp={(e) => {
                        // tap on mobile (and click on desktop) toggles the tooltip
                        if (e.pointerType === "touch" && text) {
                          setTip((t) => (t?.c === c && t?.r === r ? null : { c, r, text, below: r < 2 }));
                        }
                      }}
                      className={`h-[10px] w-[10px] ${cell.future ? "bg-transparent" : LEVELS[binary ? (cell.count > 0 ? TOP : 0) : levelFor(cell.count, grid.max)]}`}
                    />
                  );
                })}
              </div>
            ))}
            {tip && (
              <span
                ref={tipRef}
                className={`pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[11px] leading-4 text-background shadow-md ${tip.below ? "translate-y-0" : "-translate-y-full"}`}
                // centered on the cell, above it by default (below for the top
                // rows so it doesn't clip past the scroll container's top).
                // tipW clamps the pill fully inside the grid once measured —
                // before that it just centers and may briefly overflow
                style={{
                  left: Math.min(
                    Math.max(tip.c * 12 + 5, tipW / 2),
                    Math.max(tip.c * 12 + 5, gridWidth ?? 0) - tipW / 2,
                  ),
                  top: tip.below ? tip.r * 12 + 14 : tip.r * 12 - 4,
                }}
              >
                {tip.text}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-end gap-1 opacity-60">
        <span>{binary ? "no" : negative ? "clean" : "less"}</span>
        {(binary ? [LEVELS[0], LEVELS[TOP]] : LEVELS).map((l, i) => (
          <span key={i} className={`h-[8px] w-[8px] ${l}`} />
        ))}
        <span>{binary ? "yes" : negative ? "slips" : "more"}</span>
      </div>
    </div>
  );
});
