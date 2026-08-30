"use client";

import { useEffect, useRef, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { TreeNode } from "@/lib/tree";
import type { PlainNode } from "@/lib/crypto";
import { DEFAULT_GRACE_HOURS, TIME_STEP_MAX, dayIndexToStart, modeOf, stepOf, thresholdOf } from "@/lib/recur";
import { formatDueInput, normalizeDueAt, parseDueInput } from "@/lib/due";
import { DEFAULT_OFFSETS_MIN, normalizeCfg } from "@/lib/reminders";
import { formatElapsed, formatSessionDuration, liveElapsedMs, totalMs } from "@/lib/stopwatch";
import { Heatmap } from "./Heatmap";
import { RruleEditor } from "./RruleEditor";

// 8KB ciphertext server limit (base64 chars) and the warn thresholds.
const PAYLOAD_LIMIT = 8192;

function sessionLine(s: number, e: number): string {
  const d1 = new Date(s);
  const d2 = new Date(e);
  const sameDay = d1.toDateString() === d2.toDateString();
  const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return sameDay ? `${time(s)} → ${time(e)}` : `${d1.toLocaleDateString()} ${time(s)} → ${d2.toLocaleDateString()} ${time(e)}`;
}

export function MetadataPanel({
  node,
  onUpdateMetadata,
  onClose,
  nowTs,
  historyCounts,
  historyDurations,
}: {
  node: TreeNode | null;
  onUpdateMetadata: (id: Id<"todos">, patch: Partial<PlainNode["metadata"]>) => void;
  onClose: () => void;
  nowTs: number;
  historyCounts: Map<number, number> | null;
  historyDurations: Map<number, number> | null;
}) {
  const [showRuleEditor, setShowRuleEditor] = useState(false);
  // free-text fields (description, tags) save on blur; pending values are
  // tracked so unmount can flush edits from paths that skip blur (node
  // deleted while typing, panel closed without focus change). Refs are
  // nulled before passive cleanup runs, so DOM can't be read there.
  const pendingRef = useRef<{ description?: string; tags?: string }>({});
  const stateRef = useRef({ node, onUpdateMetadata });
  useEffect(() => {
    stateRef.current = { node, onUpdateMetadata };
  });
  useEffect(() => {
    return () => {
      const { node: n, onUpdateMetadata: save } = stateRef.current;
      if (!n) return;
      // pendingRef is not a DOM ref — it holds the latest typed strings; reading
      // .current here is the point of the flush
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const pending = pendingRef.current;
      const meta = n.metadata as PlainNode["metadata"];
      if (pending.description !== undefined && pending.description !== (meta.description ?? "")) {
        save(n._id, { description: pending.description });
      }
      if (pending.tags !== undefined) {
        const tags = pending.tags.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8);
        if (tags.join("\u0000") !== (meta.tags ?? []).join("\u0000")) save(n._id, { tags });
      }
    };
  }, []);
  if (!node) return null;
  const meta = node.metadata as PlainNode["metadata"];
  const mode = modeOf(meta);
  const sessions = (meta.sessions ?? []).slice().sort((a, b) => b.s - a.s); // newest first
  const pastDurations = historyDurations ? Array.from(historyDurations.entries()).sort((a, b) => b[0] - a[0]).slice(0, 14) : [];
  const payloadLen = node._raw.ciphertext?.length ?? 0;
  return (
    <div className="border-t border-foreground bg-background p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">{node.title} — details</span>
        <button onClick={onClose} className="opacity-60 hover:opacity-100">
          close
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {/* recurrence */}
        <div className="border border-foreground/20 p-2">
          <div className="flex items-center justify-between">
            <span className="opacity-60">recurrence</span>
            {!showRuleEditor && (
              <button onClick={() => setShowRuleEditor(true)} className="underline underline-offset-2 opacity-60 hover:opacity-100">
                {meta.recur ? "edit rule" : "+ make recurring"}
              </button>
            )}
          </div>
          {!showRuleEditor && meta.recur ? <p className="mt-1 break-all font-mono text-[10px] opacity-60">{meta.recur}</p> : null}
          {!showRuleEditor && !meta.recur ? <p className="mt-1 text-[10px] opacity-40">one-off task — no schedule</p> : null}
          {showRuleEditor && (
            <div className="mt-2">
              <RruleEditor
                ruleStr={meta.recur}
                anchorTs={node._creationTime}
                onApply={(s) => {
                  onUpdateMetadata(node._id, { recur: s ?? undefined });
                  setShowRuleEditor(false);
                }}
                onCancel={() => setShowRuleEditor(false)}
              />
            </div>
          )}
        </div>

        {/* completion style + threshold + grace */}
        <div className="flex flex-wrap gap-2">
          <label className="flex-1 block">
            <span className="opacity-60">completion style</span>
            <select
              value={mode}
              onChange={(e) => {
                const v = e.target.value;
                onUpdateMetadata(node._id, { mode: v === "count" || v === "time" ? v : "check" });
              }}
              className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
            >
              <option value="check">checkbox</option>
              <option value="count">tally count</option>
              <option value="time">time (minutes)</option>
            </select>
          </label>
          {mode === "check" && (
            <label className="flex-1 block">
              <span className="opacity-60">checkbox threshold</span>
              <input
                type="number"
                min={1}
                max={999}
                value={thresholdOf(meta)}
                onChange={(e) => onUpdateMetadata(node._id, { threshold: Math.min(999, Math.max(1, Number(e.target.value) || 1)) })}
                className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
              />
            </label>
          )}
          {mode === "count" && (
            <label className="flex-1 block">
              <span className="opacity-60">goal (optional)</span>
              <input
                type="number"
                min={1}
                max={999}
                value={meta.threshold ?? ""}
                placeholder="∞"
                onChange={(e) =>
                  onUpdateMetadata(node._id, {
                    threshold: e.target.value === "" ? undefined : Math.min(999, Math.max(1, Math.floor(Number(e.target.value) || 1))),
                  })
                }
                className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
              />
            </label>
          )}
          {mode === "time" && (
            <>
              <label className="flex-1 block">
                <span className="opacity-60">goal (minutes)</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={thresholdOf(meta)}
                  onChange={(e) => onUpdateMetadata(node._id, { threshold: Math.min(999, Math.max(1, Number(e.target.value) || 1)) })}
                  className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
                />
              </label>
              <label className="flex-1 block">
                <span className="opacity-60">step (minutes)</span>
                <input
                  type="number"
                  min={1}
                  max={TIME_STEP_MAX}
                  value={stepOf(meta)}
                  onChange={(e) => onUpdateMetadata(node._id, { stepMin: Math.min(TIME_STEP_MAX, Math.max(1, Number(e.target.value) || 1)) })}
                  className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
                />
              </label>
            </>
          )}
          {meta.recur && (
            <label className="flex-1 block">
              <span className="opacity-60">grace hours</span>
              <input
                type="number"
                min={0}
                max={48}
                value={meta.graceHours ?? DEFAULT_GRACE_HOURS}
                onChange={(e) => onUpdateMetadata(node._id, { graceHours: Math.min(48, Math.max(0, Number(e.target.value) || 0)) })}
                className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
              />
            </label>
          )}
        </div>

        {meta.recur ? (
          <p className="text-[10px] opacity-40 leading-tight">
            recurring tasks always show the current window — past windows are frozen history and count toward the heatmap.
          </p>
        ) : null}

        {/* stopwatch sessions (check/count modes only) */}
        {mode !== "time" ? (
          <div className="border border-foreground/20 p-2">
            <div className="flex items-center justify-between">
              <span className="opacity-60">stopwatch sessions</span>
              {meta.timer ? (
                <span className="font-mono text-[10px]" title="active session">
                  {meta.timer.state === "running" ? "▶ " : "⏸ "}
                  {formatElapsed(liveElapsedMs(meta.timer, nowTs))}
                </span>
              ) : null}
              {sessions.length > 0 ? (
                <button onClick={() => onUpdateMetadata(node._id, { sessions: [] })} className="underline underline-offset-2 opacity-60 hover:opacity-100">
                  clear
                </button>
              ) : null}
            </div>
            {sessions.length > 0 ? (
              <>
                <p className="mt-1 text-[10px] opacity-60">
                  this window: {formatSessionDuration(totalMs(meta.sessions))} across {sessions.length} session{sessions.length === 1 ? "" : "s"}
                </p>
                <div className="mt-1 max-h-32 space-y-0.5 overflow-auto">
                  {sessions.map((s, i) => (
                    <div key={`${s.s}-${i}`} className="flex justify-between font-mono text-[10px] opacity-70">
                      <span>{sessionLine(s.s, s.e)}</span>
                      <span>{formatSessionDuration(s.ms)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-1 text-[10px] opacity-40">no sessions recorded this window</p>
            )}
            {pastDurations.length > 0 ? (
              <div className="mt-2 border-t border-foreground/10 pt-1">
                <span className="text-[10px] opacity-40">history (per day)</span>
                <div className="mt-0.5 space-y-0.5">
                  {pastDurations.map(([day, ms]) => (
                    <div key={day} className="flex justify-between font-mono text-[10px] opacity-70">
                      <span>{new Date(dayIndexToStart(day)).toLocaleDateString()}</span>
                      <span>{formatSessionDuration(ms)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* encrypted payload size */}
        <div className="border border-foreground/20 p-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="opacity-60">encrypted payload</span>
            <span className="font-mono opacity-70">
              {payloadLen}/{PAYLOAD_LIMIT}
            </span>
          </div>
          <div className="mt-1 h-1 w-full border border-foreground/20">
            <div
              className={`h-full ${payloadLen > 7168 ? "bg-foreground" : payloadLen > 1024 ? "bg-foreground/60" : "bg-foreground/30"}`}
              style={{ width: `${Math.min(100, Math.round((payloadLen / PAYLOAD_LIMIT) * 100))}%` }}
            />
          </div>
        </div>

        {/* past-year heatmap for this task */}
        {meta.recur ? (
          <div>
            <span className="opacity-60">past year</span>
            <div className="mt-1">
              <Heatmap counts={historyCounts ?? new Map<number, number>()} nowTs={nowTs} mode={mode} />
            </div>
          </div>
        ) : null}

        <label className="block">
          <span className="opacity-60">description</span>
          <textarea
            defaultValue={node.metadata.description ?? ""}
            placeholder="add notes…"
            rows={2}
            onChange={(e) => {
              pendingRef.current.description = e.target.value;
            }}
            onBlur={(e) => {
              onUpdateMetadata(node._id, { description: e.target.value });
              pendingRef.current.description = undefined;
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            className="mt-1 w-full border border-foreground/20 bg-transparent p-2 text-xs focus:outline-none"
          />
        </label>
        <div className="flex gap-2">
          <label className="flex-1 block">
            <span className="opacity-60">priority</span>
            <select
              value={node.metadata.priority ?? ""}
              onChange={(e) => {
                const v = e.target.value as PlainNode["metadata"]["priority"];
                onUpdateMetadata(node._id, { priority: v || null });
              }}
              className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
            >
              <option value="">none</option>
              <option value="low">low</option>
              <option value="med">med</option>
              <option value="high">high</option>
            </select>
          </label>
          <label className="flex-1 block">
            <span className="opacity-60">due</span>
            <input
              type="date"
              value={node.metadata.dueAt ? formatDueInput(normalizeDueAt(node.metadata.dueAt)) : ""}
              onChange={(e) => {
                // store local midnight of the picked day (UTC-midnight parses
                // render a day early west of UTC)
                const dueAt = e.target.value ? parseDueInput(e.target.value) : null;
                onUpdateMetadata(node._id, { dueAt });
              }}
              className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
            />
          </label>
        </div>
        {meta.dueAt ? (
          (() => {
            const cfg = normalizeCfg(meta.reminder);
            const setOffset = (min: number, on: boolean) => {
              const offs = new Set(cfg.offsetsMin);
              if (on) offs.add(min);
              else offs.delete(min);
              onUpdateMetadata(node._id, { reminder: { enabled: true, offsetsMin: Array.from(offs).sort((a, b) => b - a) } });
            };
            return (
              <div className="border border-foreground/20 p-2">
                <div className="flex items-center justify-between">
                  <span className="opacity-60">remind me</span>
                  <button
                    onClick={() =>
                      onUpdateMetadata(node._id, {
                        reminder: cfg.enabled ? { enabled: false, offsetsMin: cfg.offsetsMin } : { enabled: true, offsetsMin: DEFAULT_OFFSETS_MIN },
                      })
                    }
                    className="underline underline-offset-2 opacity-60 hover:opacity-100"
                  >
                    {cfg.enabled ? "on" : "off"}
                  </button>
                </div>
                {cfg.enabled ? (
                  <div className="mt-1 flex gap-3">
                    {DEFAULT_OFFSETS_MIN.map((min) => (
                      <label key={min} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={cfg.offsetsMin.includes(min)}
                          onChange={(e) => setOffset(min, e.target.checked)}
                        />
                        <span>{min}m before</span>
                      </label>
                    ))}
                    {cfg.offsetsMin.length === 0 ? <span className="text-[10px] opacity-40">no offsets selected</span> : null}
                  </div>
                ) : null}
              </div>
            );
          })()
        ) : (
          <p className="text-[10px] opacity-40">reminders need a due date</p>
        )}
        <label className="block">
          <span className="opacity-60">tags (comma separated)</span>
          <input
            defaultValue={(node.metadata.tags ?? []).join(", ")}
            placeholder="work, urgent"
            onChange={(e) => {
              pendingRef.current.tags = e.target.value;
            }}
            onBlur={(e) => {
              const tags = e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 8);
              onUpdateMetadata(node._id, { tags });
              pendingRef.current.tags = undefined;
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
          />
        </label>
      </div>
    </div>
  );
}
