"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { matchesView, type FieldDef } from "../../../convex/loopLogic";
import { TREND_MARK, ago, rateLabel, weeklyBuckets, type ItemModel } from "@/lib/loopModel";
import type { LoopCtx } from "./ctx";
import { Bars, Btn, Chip, Label, Tag, inputCls } from "./ui";

// All tracked items: a ranked list (loudest first) and, on tap, the detail
// sheet where triage, merging, linking and starting a fix all happen.

export function Items({ ctx }: { ctx: LoopCtx }) {
  const { model, views } = ctx;
  const [viewKey, setViewKey] = useState<string>("");
  const [typeKey, setTypeKey] = useState<string>("");
  const [search, setSearch] = useState("");
  const [showDone, setShowDone] = useState(false);

  const view = views.find((v) => v.key === viewKey)?.def ?? null;
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...model.items.values()]
      .filter((i) => !typeKey || i.item.type === typeKey)
      .filter((i) => !q || i.item.title.toLowerCase().includes(q))
      .filter((i) =>
        view
          ? matchesView(view, {
              type: i.item.type,
              state: i.item.state,
              rate: i.rate,
              signals: i.signals.length,
              hasActiveRun: i.activeRun !== null,
            })
          : true,
      )
      .sort((a, b) => b.rate - a.rate || (b.signals[0]?.at ?? b.item.createdAt) - (a.signals[0]?.at ?? a.item.createdAt));
  }, [model.items, view, typeKey, search]);

  const live = rows.filter((r) => r.role !== "done" && r.role !== "dropped");
  const finished = rows.filter((r) => r.role === "done" || r.role === "dropped");
  const usedTypes = [...new Set([...model.items.values()].map((i) => i.item.type))];

  return (
    <div className="pb-6">
      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-1 pt-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search…"
          className={`${inputCls} max-w-[10rem]`}
          aria-label="search items"
        />
        {views.length > 0 && (
          <>
            <Chip on={!viewKey} onClick={() => setViewKey("")}>
              all
            </Chip>
            {views.map((v) => (
              <Chip key={v.key} on={viewKey === v.key} onClick={() => setViewKey(v.key)}>
                {v.def.name}
              </Chip>
            ))}
          </>
        )}
        {usedTypes.length > 1 &&
          usedTypes.map((t) => (
            <Chip key={t} on={typeKey === t} onClick={() => setTypeKey(typeKey === t ? "" : t)}>
              {t}
            </Chip>
          ))}
      </div>

      {live.length === 0 && finished.length === 0 ? (
        <p className="px-3 py-10 text-center font-mono text-xs opacity-60">
          {model.items.size === 0
            ? "nothing tracked yet. triage something from the inbox."
            : "nothing matches."}
        </p>
      ) : (
        <ul>
          {live.map((r) => (
            <Row key={r.id} row={r} ctx={ctx} />
          ))}
        </ul>
      )}

      {finished.length > 0 && (
        <div className="mt-2 border-t border-foreground/10">
          <button onClick={() => setShowDone((v) => !v)} className="px-3 py-2 font-mono text-[11px] opacity-60 hover:opacity-100">
            {showDone ? "hide" : "show"} resolved &amp; dismissed ({finished.length})
          </button>
          {showDone && (
            <ul className="opacity-70">
              {finished.map((r) => (
                <Row key={r.id} row={r} ctx={ctx} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ row, ctx }: { row: ItemModel; ctx: LoopCtx }) {
  return (
    <li>
      <button
        onClick={() => ctx.openItem(row.id)}
        className="flex w-full items-start justify-between gap-3 border-b border-foreground/10 px-3 py-3 text-left hover:bg-foreground/[0.04]"
      >
        <span className="min-w-0">
          <span className="block break-words text-sm leading-snug">{row.item.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <Tag>{row.item.type}</Tag>
            <Tag>{row.stateLabel}</Tag>
            {row.item.system && <Tag>app</Tag>}
            {row.activeRun && <Tag>{row.activeRun.status === "verifying" ? "verifying" : "fix in progress"}</Tag>}
          </span>
        </span>
        <span className="shrink-0 text-right font-mono text-[11px]">
          <span className="block">
            {rateLabel(row.rate)} {row.rate > 0 || row.trend !== "quiet" ? TREND_MARK[row.trend] : ""}
          </span>
          <span className="block opacity-60">{row.signals.length}×</span>
        </span>
      </button>
    </li>
  );
}

// ---------- detail sheet ----------

const LINK_LABEL: Record<string, [string, string]> = {
  blocks: ["blocks", "blocked by"],
  "caused-by": ["caused by", "causes"],
  relates: ["relates to", "relates to"],
  fixes: ["fixes", "fixed by"],
};

export function Detail({ id, ctx, onClose }: { id: string; ctx: LoopCtx; onClose: () => void }) {
  const row = ctx.model.items.get(id);
  // a merged-away or vanished item has no sheet (merging closes it)
  return row ? <DetailBody key={id} row={row} ctx={ctx} onClose={onClose} /> : null;
}

function DetailBody({ row, ctx, onClose }: { row: ItemModel; ctx: LoopCtx; onClose: () => void }) {
  const { model, now } = ctx;
  const id = row.id;
  const item = row.item;
  const events = useQuery(api.loop.events, { refId: id });
  const [title, setTitle] = useState(item.title);
  const [note, setNote] = useState(item.note ?? "");
  const [workflow, setWorkflow] = useState("fix-problem");
  const [linkKind, setLinkKind] = useState("relates");
  const [linkTo, setLinkTo] = useState("");
  const [mergeTo, setMergeTo] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const others = [...model.items.values()].filter((o) => o.id !== id).sort((a, b) => a.item.title.localeCompare(b.item.title));
  const links = ctx.links.filter((l) => model.rootOf(l.from as string) === id || model.rootOf(l.to as string) === id);
  const runsHere = ctx.runs.filter((r) => r.itemIds.some((i) => model.rootOf(i as string) === id));
  const live = row.role !== "done" && row.role !== "dropped";
  const workflowKeys = Object.keys(ctx.workflows).filter((k) => k !== "system-change" || item.system);

  const saveFields = (key: string, value: string | number | boolean | undefined) => {
    const next = { ...row.fields };
    if (value === undefined || value === "") delete next[key];
    else next[key] = value;
    void ctx.act(ctx.m.updateItem({ id: item._id, fields: JSON.stringify(next) }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-[640px] flex-col border border-foreground bg-background"
      >
        <div className="flex items-center justify-between border-b border-foreground px-3 py-2">
          <span className="flex items-center gap-1.5">
            <Tag>{item.type}</Tag>
            {item.system && <Tag>app</Tag>}
          </span>
          <button onClick={onClose} className="font-mono text-xs underline underline-offset-4 hover:opacity-60">
            close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          <div className="flex flex-col gap-2 px-3 pt-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== item.title && void ctx.act(ctx.m.updateItem({ id: item._id, title }))}
              maxLength={200}
              className={`${inputCls} text-sm`}
              aria-label="title"
            />
            <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
              <select
                value={item.state}
                onChange={(e) => void ctx.act(ctx.m.updateItem({ id: item._id, state: e.target.value }))}
                className="border border-foreground bg-background px-1.5 py-1"
                aria-label="state"
              >
                {(row.typeDef?.states ?? []).map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
                {!row.typeDef?.states.some((s) => s.key === item.state) && <option value={item.state}>{item.state}</option>}
              </select>
              <span>
                {rateLabel(row.rate)} {TREND_MARK[row.trend]}
              </span>
              <Bars values={weeklyBuckets(row.signals.map((s) => s.at), now)} label="occurrences per week, last 8 weeks" />
              <span className="opacity-60">{row.signals.length} total</span>
            </div>
          </div>

          <div className="px-3 pt-3">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== (item.note ?? "") && void ctx.act(ctx.m.updateItem({ id: item._id, note }))}
              placeholder="notes — what you know, what you've tried"
              rows={3}
              maxLength={4000}
              className={`${inputCls} resize-none [field-sizing:content]`}
              aria-label="notes"
            />
          </div>

          {(row.typeDef?.fields.length ?? 0) > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2 px-3">
              {row.typeDef!.fields.map((f) => (
                <FieldInput key={f.key} field={f} value={row.fields[f.key]} onSave={(val) => saveFields(f.key, val)} />
              ))}
            </div>
          )}

          {/* fix it */}
          <Label>fix</Label>
          {row.activeRun ? (
            <p className="px-3 font-mono text-xs">
              {row.activeRun.status === "verifying" ? "verifying: " : "in progress: "}
              {row.activeRun.title} <span className="opacity-60">(see runs)</span>
            </p>
          ) : live ? (
            <div className="flex flex-wrap items-center gap-2 px-3">
              <select
                value={workflow}
                onChange={(e) => setWorkflow(e.target.value)}
                className="border border-foreground bg-background px-1.5 py-1 font-mono text-xs"
                aria-label="workflow"
              >
                {workflowKeys.map((k) => (
                  <option key={k} value={k}>
                    {ctx.workflows[k].def.name}
                  </option>
                ))}
              </select>
              <Btn solid onClick={() => void ctx.act(ctx.m.startRun({ workflowKey: workflow, itemIds: [item._id] }))}>
                start a run
              </Btn>
            </div>
          ) : (
            <p className="px-3 font-mono text-xs opacity-60">{row.role === "done" ? "resolved — it reopens itself if it happens again" : "dismissed"}</p>
          )}

          {/* occurrences */}
          <Label>occurrences ({row.signals.length})</Label>
          <ul>
            {row.signals.slice(0, 40).map((s) => (
              <li key={s._id} className="flex items-start justify-between gap-3 px-3 py-1.5 text-xs">
                <span className="min-w-0 break-words">
                  {s.text}
                  <span className="ml-2 font-mono text-[11px] opacity-60">{ago(s.at, now)}</span>
                </span>
                <button
                  onClick={() => void ctx.act(ctx.m.detach({ signalId: s._id }))}
                  className="shrink-0 font-mono text-[11px] underline underline-offset-4 opacity-60 hover:opacity-100"
                  title="send back to the inbox"
                >
                  unfile
                </button>
              </li>
            ))}
          </ul>

          {/* merged in */}
          {row.merged.length > 0 && (
            <>
              <Label>merged into this</Label>
              <ul>
                {row.merged.map((m) => (
                  <li key={m._id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                    <span className="min-w-0 truncate">{m.title}</span>
                    <button
                      onClick={() => void ctx.act(ctx.m.unmergeItem({ id: m._id }))}
                      className="shrink-0 font-mono text-[10px] underline underline-offset-4 opacity-60 hover:opacity-100"
                    >
                      split back out
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* links */}
          <Label>links</Label>
          <ul>
            {links.map((l) => {
              const outgoing = model.rootOf(l.from as string) === id;
              const otherId = model.rootOf((outgoing ? l.to : l.from) as string);
              const other = model.items.get(otherId)?.item.title ?? ctx.model.allItems.get(otherId)?.title ?? "?";
              return (
                <li key={l._id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                  <span className="min-w-0 truncate">
                    <span className="font-mono opacity-60">{LINK_LABEL[l.kind]?.[outgoing ? 0 : 1] ?? l.kind}</span> {other}
                  </span>
                  <button
                    onClick={() => void ctx.act(ctx.m.unlinkItems({ linkId: l._id }))}
                    className="shrink-0 font-mono text-[11px] underline underline-offset-4 opacity-60 hover:opacity-100"
                  >
                    remove
                  </button>
                </li>
              );
            })}
          </ul>
          {others.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-3 pt-1">
              <select
                value={linkKind}
                onChange={(e) => setLinkKind(e.target.value)}
                className="border border-foreground bg-background px-1.5 py-1 font-mono text-xs"
                aria-label="link kind"
              >
                {Object.entries(LINK_LABEL).map(([k, [out]]) => (
                  <option key={k} value={k}>
                    {out}
                  </option>
                ))}
              </select>
              <select
                value={linkTo}
                onChange={(e) => setLinkTo(e.target.value)}
                className="max-w-[11rem] border border-foreground bg-background px-1.5 py-1 font-mono text-xs"
                aria-label="link to"
              >
                <option value="">…</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.item.title.slice(0, 50)}
                  </option>
                ))}
              </select>
              <Btn
                disabled={!linkTo}
                onClick={() =>
                  void ctx.act(ctx.m.linkItems({ from: item._id, to: linkTo as Id<"items">, kind: linkKind })).then(() => setLinkTo(""))
                }
              >
                link
              </Btn>
            </div>
          )}

          {/* merge */}
          {others.length > 0 && (
            <>
              <Label>same thing as another item?</Label>
              <div className="flex flex-wrap items-center gap-2 px-3">
                <select
                  value={mergeTo}
                  onChange={(e) => setMergeTo(e.target.value)}
                  className="max-w-[14rem] border border-foreground bg-background px-1.5 py-1 font-mono text-xs"
                  aria-label="merge into"
                >
                  <option value="">merge into…</option>
                  {others.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.item.title.slice(0, 50)}
                    </option>
                  ))}
                </select>
                <Btn
                  disabled={!mergeTo}
                  onClick={() =>
                    void ctx.actOk(ctx.m.mergeItems({ fromId: item._id, intoId: mergeTo as Id<"items"> })).then((ok) => {
                      if (ok) onClose();
                    })
                  }
                >
                  merge
                </Btn>
              </div>
              <p className="px-3 pt-1 font-mono text-[11px] opacity-60">non-destructive — you can split it back out from the survivor</p>
            </>
          )}

          {/* runs */}
          {runsHere.length > 0 && (
            <>
              <Label>attempts</Label>
              <ul>
                {runsHere.map((r) => (
                  <li key={r._id} className="px-3 py-1.5 font-mono text-xs">
                    {r.title} <span className="opacity-60">— {r.status}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* history */}
          <Label>history</Label>
          <ul className="pb-6">
            {(events ?? []).map((e) => (
              <li key={e._id} className="px-3 py-1 font-mono text-[10px] opacity-60">
                {ago(e.at, now)} · {e.kind}
                {e.data ? ` ${summarize(e.data)}` : ""}
              </li>
            ))}
            {events === undefined && <li className="px-3 py-1 font-mono text-[11px] opacity-60">loading…</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

function summarize(data: string): string {
  try {
    const o = JSON.parse(data) as Record<string, unknown>;
    const bits: string[] = [];
    if (typeof o.from === "string" && typeof o.to === "string") bits.push(`${o.from} → ${o.to}`);
    if (typeof o.why === "string") bits.push(`(${o.why})`);
    if (typeof o.count === "number") bits.push(`${o.count}×`);
    return bits.join(" ");
  } catch {
    return "";
  }
}

function FieldInput({
  field,
  value,
  onSave,
}: {
  field: FieldDef;
  value: string | number | boolean | undefined;
  onSave: (v: string | number | boolean | undefined) => void;
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const label = <span className="mb-0.5 block font-mono text-[11px] opacity-60">{field.label}</span>;
  if (field.kind === "bool") {
    return (
      <label className="flex items-center gap-2 font-mono text-xs">
        <input type="checkbox" checked={value === true} onChange={(e) => onSave(e.target.checked)} className="check" />
        {field.label}
      </label>
    );
  }
  if (field.kind === "enum") {
    return (
      <label>
        {label}
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onSave(e.target.value || undefined)}
          className="w-full border border-foreground/40 bg-background px-1.5 py-1.5 font-mono text-xs"
        >
          <option value="">—</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label>
      {label}
      <input
        type={field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text === (value === undefined ? "" : String(value))) return;
          if (text === "") return onSave(undefined);
          if (field.kind === "number") {
            const n = Number(text);
            if (Number.isFinite(n)) onSave(n);
            return;
          }
          onSave(text);
        }}
        className={inputCls}
      />
    </label>
  );
}
