"use client";

import { useMemo } from "react";
import { dayIndexLocal, dayIndexToStart, formatMinutes, type CompletionMode } from "@/lib/recur";
import { MONTHS } from "@/lib/months";

// GitHub-style 53-week heatmap of counts per local day.
// Columns run oldest -> newest, rows Sun..Sat, ending at the current week.
// Time mode interprets counts as minutes with minute-sized buckets.

const LEVELS = ["bg-foreground/5", "bg-foreground/25", "bg-foreground/45", "bg-foreground/70", "bg-foreground"];

function levelFor(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

function levelForMinutes(min: number): number {
  if (min <= 0) return 0;
  if (min < 15) return 1;
  if (min < 30) return 2;
  if (min < 60) return 3;
  return 4;
}

const DOW_LABELS: Record<number, string> = { 1: "mon", 3: "wed", 5: "fri" };

export function Heatmap({
  counts,
  nowTs,
  weeks = 53,
  mode = "check",
}: {
  counts: Map<number, number>;
  nowTs: number;
  weeks?: number;
  mode?: CompletionMode;
}) {
  const grid = useMemo(() => {
    const endIdx = dayIndexLocal(nowTs);
    // extend to the end (Saturday) of the current week so today is always rendered
    const endDow = new Date(dayIndexToStart(endIdx)).getDay();
    const alignedEnd = endIdx + (6 - endDow);
    const startIdx = alignedEnd - weeks * 7 + 1;
    const startDow = new Date(dayIndexToStart(startIdx)).getDay(); // 0 = Sun
    const aligned = startIdx - startDow;
    const colCount = Math.ceil((alignedEnd - aligned + 1) / 7);
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
    return { cols, monthLabels, aligned };
  }, [counts, nowTs, weeks]);

  return (
    <div className="text-[10px]">
      <div className="flex gap-3 overflow-x-auto">
        <div className="flex shrink-0 flex-col justify-between py-[1px] pr-1 opacity-40">
          {[0, 1, 2, 3, 4, 5, 6].map((r) => (
            <span key={r} className="h-[10px] leading-[10px]">
              {DOW_LABELS[r] ?? ""}
            </span>
          ))}
        </div>
        <div>
          <div className="relative mb-1 h-3">
            {grid.monthLabels.map((m) => (
              <span
                key={`${m.label}-${m.col}`}
                className="absolute opacity-40"
                style={{ left: `${m.col * 12}px` }}
              >
                {m.label}
              </span>
            ))}
          </div>
          <div className="flex gap-[2px]">
            {grid.cols.map((col, c) => (
              <div key={c} className="flex flex-col gap-[2px]">
                {col.map((cell) => (
                  <span
                    key={cell.idx}
                    title={
                      cell.future
                        ? undefined
                        : `${cell.count > 0 ? `${mode === "time" ? formatMinutes(cell.count) : cell.count} on ` : ""}${new Date(dayIndexToStart(cell.idx)).toLocaleDateString()}`
                    }
                    className={`h-[10px] w-[10px] ${cell.future ? "bg-transparent" : LEVELS[mode === "time" ? levelForMinutes(cell.count) : levelFor(cell.count)]}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-end gap-1 opacity-40">
        <span>less</span>
        {LEVELS.map((l, i) => (
          <span key={i} className={`h-[8px] w-[8px] ${l}`} />
        ))}
        <span>more</span>
      </div>
    </div>
  );
}
