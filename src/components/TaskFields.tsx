"use client";

import { useState } from "react";
import type { PlainNode } from "@/lib/crypto";
import { DEFAULT_GRACE_HOURS, TIME_STEP_MAX, modeOf, stepOf, thresholdOf } from "@/lib/recur";
import { isNegative, toleranceOf } from "@/lib/negative";
import {
  defaultDueTimeMin,
  formatDueInput,
  formatTimeInput,
  normalizeDueAt,
  parseDueInput,
  parseTimeInput,
} from "@/lib/due";
import { DEFAULT_OFFSETS_MIN, normalizeCfg } from "@/lib/reminders";
import { RruleEditor } from "./RruleEditor";
import { Heatmap } from "./Heatmap";

// The edit UI's fields, extracted so the panel (instant-save) and the mobile
// creation sheet (buffered) render the exact same controls. Every field takes
// the metadata object plus an onPatch callback with handleUpdateMetadata
// semantics: merge a partial into the current metadata.

type Metadata = PlainNode["metadata"];
type OnPatch = (patch: Partial<Metadata>) => void;

export function RecurrenceField({
  metadata,
  anchorTs,
  onPatch,
}: {
  metadata: Metadata;
  /** recurrences anchor to the task creation time (panel) or now (new task) */
  anchorTs: number;
  onPatch: OnPatch;
}) {
  const [showRuleEditor, setShowRuleEditor] = useState(false);
  return (
    <div className="border border-foreground/20 p-2">
      <div className="flex items-center justify-between">
        <span className="opacity-60">recurrence</span>
        {!showRuleEditor && (
          <button onClick={() => setShowRuleEditor(true)} className="underline underline-offset-2 opacity-60 hover:opacity-100">
            {metadata.recur ? "edit rule" : "+ make recurring"}
          </button>
        )}
      </div>
      {!showRuleEditor && metadata.recur ? <p className="mt-1 break-all font-mono text-[10px] opacity-60">{metadata.recur}</p> : null}
      {!showRuleEditor && !metadata.recur ? <p className="mt-1 text-[10px] opacity-40">one-off task — no schedule</p> : null}
      {showRuleEditor && (
        <div className="mt-2">
          <RruleEditor
            ruleStr={metadata.recur}
            anchorTs={anchorTs}
            onApply={(s) => {
              onPatch({ recur: s ?? undefined });
              setShowRuleEditor(false);
            }}
            onCancel={() => setShowRuleEditor(false)}
          />
        </div>
      )}
    </div>
  );
}

export function CompletionStyleField({ metadata, onPatch }: { metadata: Metadata; onPatch: OnPatch }) {
  const mode = modeOf(metadata);
  const neg = isNegative(metadata);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <label className="flex-1 block">
          <span className="opacity-60">completion style</span>
          <select
            value={neg ? "avoid" : mode}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "avoid") {
                onPatch({ neg: true });
              } else {
                onPatch({ neg: undefined, mode: v === "count" || v === "time" ? v : "check" });
              }
            }}
            className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
          >
            <option value="check">checkbox</option>
            <option value="count">tally count</option>
            <option value="time">time (minutes)</option>
            <option value="avoid">avoid (slips)</option>
          </select>
        </label>
        {neg && (
          <label className="flex-1 block">
            <span className="opacity-60">slips tolerated</span>
            <input
              type="number"
              min={0}
              max={999}
              value={toleranceOf(metadata)}
              onChange={(e) => onPatch({ tol: Math.min(999, Math.max(0, Math.floor(Number(e.target.value) || 0))) })}
              className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
            />
          </label>
        )}
        {!neg && mode === "check" && (
          <label className="flex-1 block">
            <span className="opacity-60">checkbox threshold</span>
            <input
              type="number"
              min={1}
              max={999}
              value={thresholdOf(metadata)}
              onChange={(e) => onPatch({ threshold: Math.min(999, Math.max(1, Number(e.target.value) || 1)) })}
              className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
            />
          </label>
        )}
        {!neg && mode === "count" && (
          <label className="flex-1 block">
            <span className="opacity-60">goal (optional)</span>
            <input
              type="number"
              min={1}
              max={999}
              value={metadata.threshold ?? ""}
              placeholder="∞"
              onChange={(e) =>
                onPatch({
                  threshold: e.target.value === "" ? undefined : Math.min(999, Math.max(1, Math.floor(Number(e.target.value) || 1))),
                })
              }
              className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
            />
          </label>
        )}
        {!neg && mode === "time" && (
          <>
            <label className="flex-1 block">
              <span className="opacity-60">goal (minutes)</span>
              <input
                type="number"
                min={1}
                max={999}
                value={thresholdOf(metadata)}
                onChange={(e) => onPatch({ threshold: Math.min(999, Math.max(1, Number(e.target.value) || 1)) })}
                className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
              />
            </label>
            <label className="flex-1 block">
              <span className="opacity-60">step (minutes)</span>
              <input
                type="number"
                min={1}
                max={TIME_STEP_MAX}
                value={stepOf(metadata)}
                onChange={(e) => onPatch({ stepMin: Math.min(TIME_STEP_MAX, Math.max(1, Number(e.target.value) || 1)) })}
                className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
              />
            </label>
          </>
        )}
        {metadata.recur && (
          <label className="flex-1 block">
            <span className="opacity-60">grace hours</span>
            <input
              type="number"
              min={0}
              max={48}
              value={metadata.graceHours ?? DEFAULT_GRACE_HOURS}
              onChange={(e) => onPatch({ graceHours: Math.min(48, Math.max(0, Number(e.target.value) || 0)) })}
              className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
            />
          </label>
        )}
      </div>
      {neg ? (
        metadata.recur ? (
          <p className="text-[10px] opacity-40 leading-tight">
            negative task — you log slips, never completions. a window is held when it ends within tolerance; the
            today view asks you to confirm held windows.
          </p>
        ) : (
          <p className="text-[10px] opacity-40 leading-tight">
            negative tasks need a schedule — add one under recurrence above.
          </p>
        )
      ) : metadata.recur ? (
        <p className="text-[10px] opacity-40 leading-tight">
          recurring tasks always show the current window — past windows are frozen history and count toward the heatmap.
        </p>
      ) : null}
    </>
  );
}

// Text fields hold an internal draft and commit on blur, so typing never
// triggers a write per keystroke. onInput mirrors every keystroke for callers
// that need the pending value (the panel flushes it on unmount).
export function DescriptionField({
  metadata,
  onInput,
  onCommit,
  disabled,
}: {
  metadata: Metadata;
  onInput?: (v: string) => void;
  onCommit: (v: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(metadata.description ?? "");
  return (
    <label className="block">
      <span className="opacity-60">description</span>
      <textarea
        value={draft}
        disabled={disabled}
        placeholder="add notes…"
        rows={2}
        onChange={(e) => {
          setDraft(e.target.value);
          onInput?.(e.target.value);
        }}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className="mt-1 w-full border border-foreground/20 bg-transparent p-2 text-xs focus:outline-none disabled:opacity-40"
      />
    </label>
  );
}

export function TagsField({
  metadata,
  onInput,
  onCommit,
  disabled,
}: {
  metadata: Metadata;
  onInput?: (v: string) => void;
  /** receives the raw comma-separated string; caller parses/limits */
  onCommit: (v: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState((metadata.tags ?? []).join(", "));
  return (
    <label className="block">
      <span className="opacity-60">tags (comma separated)</span>
      <input
        value={draft}
        disabled={disabled}
        placeholder="work, urgent"
        onChange={(e) => {
          setDraft(e.target.value);
          onInput?.(e.target.value);
        }}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs focus:outline-none disabled:opacity-40"
      />
    </label>
  );
}

export function parseTagsInput(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function PriorityDueField({ metadata, onPatch }: { metadata: Metadata; onPatch: OnPatch }) {
  return (
    <div className="flex flex-wrap gap-2">
      <label className="flex-1 block">
        <span className="opacity-60">priority</span>
        <select
          value={metadata.priority ?? ""}
          onChange={(e) => {
            const v = e.target.value as Metadata["priority"];
            onPatch({ priority: v || null });
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
          value={metadata.dueAt ? formatDueInput(normalizeDueAt(metadata.dueAt)) : ""}
          onChange={(e) => {
            // clearing wipes the time of day with the date; a freshly added
            // due date defaults the time to the next full hour, while edits
            // to an existing date keep its time as-is
            if (!e.target.value) {
              onPatch({ dueAt: null, dueTimeMin: undefined });
              return;
            }
            const ts = parseDueInput(e.target.value);
            if (ts === null) return;
            onPatch({
              dueAt: ts,
              dueTimeMin: metadata.dueAt ? metadata.dueTimeMin : defaultDueTimeMin(Date.now()),
            });
          }}
          className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
        />
      </label>
      {metadata.dueAt ? (
        <label className="flex-1 block">
          <span className="opacity-60">at</span>
          <input
            type="time"
            value={metadata.dueTimeMin !== undefined ? formatTimeInput(metadata.dueTimeMin) : ""}
            onChange={(e) => {
              const min = e.target.value ? parseTimeInput(e.target.value) : null;
              onPatch({ dueTimeMin: min ?? undefined });
            }}
            className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
          />
        </label>
      ) : null}
    </div>
  );
}

export function RemindersField({ metadata, onPatch }: { metadata: Metadata; onPatch: OnPatch }) {
  if (!metadata.dueAt) {
    return <p className="text-[10px] opacity-40">reminders need a due date</p>;
  }
  const cfg = normalizeCfg(metadata.reminder);
  const setOffset = (min: number, on: boolean) => {
    const offs = new Set(cfg.offsetsMin);
    if (on) offs.add(min);
    else offs.delete(min);
    onPatch({ reminder: { enabled: true, offsetsMin: Array.from(offs).sort((a, b) => b - a) } });
  };
  return (
    <div className="border border-foreground/20 p-2">
      <div className="flex items-center justify-between">
        <span className="opacity-60">remind me</span>
        <button
          onClick={() => onPatch({ reminder: cfg.enabled ? { enabled: false, offsetsMin: cfg.offsetsMin } : { enabled: true, offsetsMin: DEFAULT_OFFSETS_MIN } })}
          className="underline underline-offset-2 opacity-60 hover:opacity-100"
        >
          {cfg.enabled ? "on" : "off"}
        </button>
      </div>
      {cfg.enabled ? (
        <div className="mt-1 flex gap-3">
          {DEFAULT_OFFSETS_MIN.map((min) => (
            <label key={min} className="flex items-center gap-1">
              <input type="checkbox" checked={cfg.offsetsMin.includes(min)} onChange={(e) => setOffset(min, e.target.checked)} />
              <span>{min}m before</span>
            </label>
          ))}
          {cfg.offsetsMin.length === 0 ? <span className="text-[10px] opacity-40">no offsets selected</span> : null}
        </div>
      ) : null}
      {cfg.enabled && metadata.dueTimeMin === undefined ? (
        <p className="mt-1 text-[10px] opacity-40 leading-tight">
          no time set — offsets count from midnight, i.e. the evening before
        </p>
      ) : null}
    </div>
  );
}

// 8KB ciphertext server limit (base64 chars) and the warn thresholds.
const PAYLOAD_LIMIT = 8192;

export function PayloadField({ payloadLen }: { payloadLen: number }) {
  return (
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
  );
}

export function HeatmapField({
  metadata,
  counts,
  nowTs,
}: {
  metadata: Metadata;
  counts: Map<number, number>;
  nowTs: number;
}) {
  if (!metadata.recur) return null;
  return (
    <div>
      <span className="opacity-60">past year</span>
      <div className="mt-1">
        <Heatmap counts={counts} nowTs={nowTs} mode={modeOf(metadata)} />
      </div>
    </div>
  );
}
