"use client";

import { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { PlainNode } from "@/lib/crypto";
import { DEFAULT_GRACE_HOURS, TIME_STEP_MAX, modeOf, stepOf, thresholdOf } from "@/lib/recur";
import type { TreeNode } from "@/lib/tree";
import { Heatmap } from "./Heatmap";
import { RruleEditor } from "./RruleEditor";

export function MetadataPanel({
  node,
  onUpdateMetadata,
  onClose,
  nowTs,
  historyCounts,
}: {
  node: TreeNode | null;
  onUpdateMetadata: (id: Id<"todos">, patch: Partial<PlainNode["metadata"]>) => void;
  onClose: () => void;
  nowTs: number;
  historyCounts: Map<number, number> | null;
}) {
  const [showRuleEditor, setShowRuleEditor] = useState(false);
  if (!node) return null;
  const meta = node.metadata as PlainNode["metadata"];
  const mode = modeOf(meta);
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
            onBlur={(e) => onUpdateMetadata(node._id, { description: e.target.value })}
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
              value={node.metadata.dueAt ? new Date(node.metadata.dueAt).toISOString().slice(0, 10) : ""}
              onChange={(e) => {
                const dueAt = e.target.value ? new Date(e.target.value).getTime() : null;
                onUpdateMetadata(node._id, { dueAt });
              }}
              className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
            />
          </label>
        </div>
        <label className="block">
          <span className="opacity-60">tags (comma separated)</span>
          <input
            defaultValue={(node.metadata.tags ?? []).join(", ")}
            placeholder="work, urgent"
            onBlur={(e) => {
              const tags = e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 8);
              onUpdateMetadata(node._id, { tags });
            }}
            className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
          />
        </label>
      </div>
    </div>
  );
}
