"use client";

import { useMemo, useState } from "react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { suggestMatches } from "../../../convex/loopLogic";
import { ago } from "@/lib/loopModel";
import type { LoopCtx } from "./ctx";
import { Btn, Label, Tag, inputCls } from "./ui";

// Untriaged captures. Every one is an occurrence of *something*: either a new
// thing, or one more time an existing thing happened. Triage is those two taps
// (or dismiss) — nothing is ever deleted, so a mistake is one tap to undo.

export function Inbox({ ctx }: { ctx: LoopCtx }) {
  const { model, now } = ctx;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);

  const candidates = useMemo(
    () =>
      [...model.items.values()]
        .filter((i) => i.role !== "dropped")
        .map((i) => ({ id: i.id, title: i.item.title, role: i.role, stateLabel: i.stateLabel })),
    [model.items],
  );

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pickedSignals = model.inbox.filter((s) => picked.has(s._id as string));

  return (
    <div className={pickedSignals.length >= 2 ? "pb-6" : ""}>
      {model.inbox.length === 0 ? (
        <p className="px-3 py-10 text-center text-pretty font-mono text-xs opacity-60">
          inbox empty. when something annoys you, type <code>? what happened</code> or tap the mic.
        </p>
      ) : (
        <ul>
          {model.inbox.length >= 2 && pickedSignals.length < 2 && (
            <li className="border-b border-foreground/10 px-3 py-1.5 font-mono text-[11px] opacity-60">
              tick two or more to combine them into one problem
            </li>
          )}
          {model.inbox.map((s) => (
            <SignalCard
              key={s._id}
              signal={s}
              ctx={ctx}
              picked={picked.has(s._id as string)}
              onPick={() => toggle(s._id as string)}
              suggestions={suggestMatches(s.text, candidates, 3)}
              now={now}
            />
          ))}
        </ul>
      )}

      {pickedSignals.length >= 2 && (
        <Combine
          key={pickedSignals.map((s) => s._id).join(",")}
          signals={pickedSignals}
          ctx={ctx}
          onDone={() => setPicked(new Set())}
        />
      )}

      {model.dismissed.length > 0 && (
        <div className="mt-4 border-t border-foreground/10">
          <button
            onClick={() => setShowDismissed((v) => !v)}
            className="px-3 py-2 font-mono text-[11px] opacity-60 hover:opacity-100"
          >
            {showDismissed ? "hide" : "show"} dismissed ({model.dismissed.length})
          </button>
          {showDismissed && (
            <ul>
              {model.dismissed.slice(0, 30).map((s) => (
                <li key={s._id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs opacity-60">
                  <span className="min-w-0 truncate">{s.text}</span>
                  <button
                    className="shrink-0 underline underline-offset-4"
                    onClick={() => void ctx.act(ctx.m.dismissSignal({ signalId: s._id, undo: true }))}
                  >
                    restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SignalCard({
  signal,
  ctx,
  picked,
  onPick,
  suggestions,
  now,
}: {
  signal: Doc<"signals">;
  ctx: LoopCtx;
  picked: boolean;
  onPick: () => void;
  suggestions: { item: { id: string; title: string; role: string; stateLabel: string }; score: number }[];
  now: number;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(signal.text.slice(0, 200));
  const [type, setType] = useState(signal.typeHint && ctx.types[signal.typeHint] ? signal.typeHint : "problem");

  const makeItem = async () => {
    const id = await ctx.act(
      ctx.m.createItem({ title, type, signalIds: [signal._id], ...(signal.system ? { system: true } : {}) }),
    );
    if (id) setEditing(false);
  };

  return (
    <li className={`border-b border-foreground/10 px-3 py-3 last:border-b-0 ${now - signal.at < 5000 ? "capture-in" : ""}`}>
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={picked}
          onChange={onPick}
          aria-label="select to combine"
          title="select to combine"
          className="check mt-0.5"
        />
        <div className="min-w-0 flex-1">
          {/* the capture is the headline; its actions sit beside it (and wrap
              under it on a phone) instead of taking a line of their own */}
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <div className="min-w-[12rem] flex-1">
              <p className="break-words text-sm leading-snug">{signal.text}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] opacity-60">
                <span>{ago(signal.at, now)}</span>
                {signal.source !== "typed" && <Tag>{signal.source}</Tag>}
                {signal.system && <Tag>app</Tag>}
                {signal.typeHint && signal.typeHint !== "problem" && <Tag>{signal.typeHint}</Tag>}
              </p>
            </div>
            {!editing && (
              <div className="flex shrink-0 flex-wrap items-center gap-3">
                <button
                  onClick={() => setEditing(true)}
                  className="font-mono text-[11px] underline underline-offset-4 opacity-80 hover:opacity-100"
                >
                  new {type}
                </button>
                <AttachPicker ctx={ctx} onPick={(itemId) => void ctx.act(ctx.m.attach({ signalId: signal._id, itemId }))} />
                <button
                  onClick={() => void ctx.act(ctx.m.dismissSignal({ signalId: signal._id }))}
                  className="font-mono text-[11px] underline underline-offset-4 opacity-60 hover:opacity-100"
                >
                  dismiss
                </button>
              </div>
            )}
          </div>

          {suggestions.length > 0 && !editing && (
            <div className="mt-2 flex flex-col gap-1">
              <p className="font-mono text-[11px] opacity-60">looks like</p>
              {suggestions.map(({ item }) => (
                <button
                  key={item.id}
                  onClick={() => void ctx.act(ctx.m.attach({ signalId: signal._id, itemId: item.id as Id<"items"> }))}
                  className="flex items-center justify-between gap-2 border border-foreground/30 px-2 py-1 text-left text-xs hover:bg-foreground hover:text-background"
                >
                  <span className="min-w-0 truncate">{item.title}</span>
                  <span className="shrink-0 font-mono text-[11px] opacity-60">same thing · {item.stateLabel}</span>
                </button>
              ))}
            </div>
          )}

          {editing ? (
            <div className="mt-2 flex flex-col gap-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                className={inputCls}
                aria-label="title"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <select value={type} onChange={(e) => setType(e.target.value)} className={`${inputCls} w-auto`} aria-label="type">
                  {Object.keys(ctx.types).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <Btn solid onClick={() => void makeItem()} disabled={!title.trim()}>
                  create
                </Btn>
                <Btn onClick={() => setEditing(false)}>cancel</Btn>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** "same as…" picker over every live item, for when no suggestion matched. */
function AttachPicker({ ctx, onPick }: { ctx: LoopCtx; onPick: (itemId: Id<"items">) => void }) {
  const options = [...ctx.model.items.values()]
    .filter((i) => i.role !== "dropped")
    .sort((a, b) => b.rate - a.rate || a.item.title.localeCompare(b.item.title));
  if (options.length === 0) return null;
  return (
    <select
      value=""
      onChange={(e) => e.target.value && onPick(e.target.value as Id<"items">)}
      className="w-auto max-w-[12rem] cursor-pointer border-b border-foreground/60 bg-transparent py-0.5 font-mono text-[11px] opacity-80 [field-sizing:content] hover:opacity-100"
      aria-label="same as an existing item"
    >
      <option value="">same as…</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.item.title.slice(0, 60)}
        </option>
      ))}
    </select>
  );
}

function Combine({ signals, ctx, onDone }: { signals: Doc<"signals">[]; ctx: LoopCtx; onDone: () => void }) {
  const [title, setTitle] = useState(signals[0].text.slice(0, 200));
  const [type, setType] = useState(signals[0].typeHint && ctx.types[signals[0].typeHint] ? signals[0].typeHint : "problem");
  const system = signals.some((s) => s.system);
  return (
    <div className="sticky bottom-14 z-10 mx-3 mt-3 border border-foreground bg-background p-3 md:bottom-3">
      <Label>combine {signals.length} into one</Label>
      <div className="flex flex-col gap-2 px-3 pb-1">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputCls} aria-label="title" />
        <div className="flex items-center gap-2">
          <select value={type} onChange={(e) => setType(e.target.value)} className={`${inputCls} w-auto`} aria-label="type">
            {Object.keys(ctx.types).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <Btn
            solid
            disabled={!title.trim()}
            onClick={() =>
              void ctx
                .act(ctx.m.createItem({ title, type, signalIds: signals.map((s) => s._id), ...(system ? { system: true } : {}) }))
                .then((id) => id && onDone())
            }
          >
            make one {type}
          </Btn>
          <Btn onClick={onDone}>clear</Btn>
        </div>
        <p className="font-mono text-[11px] opacity-60">each capture still counts as its own occurrence</p>
      </div>
    </div>
  );
}
