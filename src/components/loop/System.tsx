"use client";

import { useMemo, useState } from "react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  BUILTIN_TYPES,
  BUILTIN_WORKFLOWS,
  matchesView,
  parseRuleDef,
  parseTypeDef,
  parseViewDef,
  parseWorkflowDef,
  ruleMatches,
  validateDefBody,
  workflowRecord,
  type DefKind,
} from "../../../convex/loopLogic";
import { ago } from "@/lib/loopModel";
import type { LoopCtx } from "./ctx";
import { Btn, Label, Tag, inputCls } from "./ui";

// The system's own shape — types, workflows, views, rules — stored as data and
// changed the way everything else here changes: a problem about the app turns
// into a run, the run carries a draft, you try the draft, apply it, and then
// watch whether the annoyance actually stops. History is append-only, so any
// version can be restored.

const TEMPLATES: Record<DefKind, { key: string; body: unknown }> = {
  type: {
    key: "decision",
    body: {
      name: "decision",
      sigil: "&",
      description: "Something to decide. Rate = how often it comes up again.",
      fields: [{ key: "decide-by", label: "decide by", kind: "date" }],
      states: [
        { key: "open", label: "open", role: "open" },
        { key: "decided", label: "decided", role: "done" },
        { key: "dropped", label: "dropped", role: "dropped" },
      ],
    },
  },
  workflow: {
    key: "weekly-review",
    body: {
      name: "weekly review",
      steps: ["look at what came up most", "pick one thing to change"],
      verifyDays: 7,
      tolerance: 0,
      hypothesis: "the loudest thing gets quieter",
    },
  },
  view: { key: "loud-and-unowned", body: { name: "loud and unowned", minRate: 1, noRun: true } },
  rule: {
    key: "repeat-offender",
    body: { name: "repeat offender", type: "problem", atLeast: 3, withinDays: 7, setRole: "fixing" },
  },
};

const KIND_LABEL: Record<DefKind, string> = { type: "types", workflow: "workflows", view: "views", rule: "rules" };
const pretty = (v: unknown) => JSON.stringify(typeof v === "string" ? JSON.parse(v) : v, null, 2);

function currentBody(ctx: LoopCtx, kind: DefKind, key: string): string | null {
  const rows = ctx.defs.filter((d) => d.kind === kind && d.key === key && d.status === "active");
  const row = rows.sort((a, b) => b.version - a.version)[0];
  if (row) return pretty(row.body);
  if (kind === "type" && BUILTIN_TYPES[key]) return pretty(BUILTIN_TYPES[key]);
  if (kind === "workflow" && BUILTIN_WORKFLOWS[key]) return pretty(BUILTIN_WORKFLOWS[key]);
  return null;
}

export function System({ ctx }: { ctx: LoopCtx }) {
  const [note, setNote] = useState("");
  const [editor, setEditor] = useState<{ kind: DefKind; key: string; body: string; runId: string | null } | null>(null);

  const sysRuns = ctx.runs.filter((r) => r.workflowKey === "system-change" && r.status === "active");
  const sysProblems = [...ctx.model.items.values()].filter(
    (i) => i.item.system && i.role !== "done" && i.role !== "dropped" && !i.activeRun,
  );
  const drafts = ctx.defs.filter((d) => d.status === "draft");

  return (
    <div className="pb-8">
      <Label>something about this app is off?</Label>
      <form
        className="flex gap-2 px-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!note.trim()) return;
          void ctx.act(ctx.m.startSystemChange({ note })).then((id) => id && setNote(""));
        }}
      >
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          placeholder="what gets in your way?"
          className={inputCls}
          aria-label="system friction"
        />
        <Btn type="submit" solid disabled={!note.trim()}>
          change it
        </Btn>
      </form>
      <p className="px-3 pt-1 font-mono text-[11px] opacity-60">
        starts a change run. you can also capture friction anywhere with <code>?? text</code>.
      </p>

      {sysProblems.length > 0 && (
        <>
          <Label>app problems not being worked on</Label>
          <ul>
            {sysProblems.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 border-b border-foreground/10 px-3 py-2">
                <button onClick={() => ctx.openItem(p.id)} className="min-w-0 truncate text-left text-xs hover:underline">
                  {p.item.title} <span className="font-mono opacity-60">{p.signals.length}×</span>
                </button>
                <Btn onClick={() => void ctx.act(ctx.m.startSystemChange({ note: "", itemIds: [p.item._id] }))}>change it</Btn>
              </li>
            ))}
          </ul>
        </>
      )}

      {sysRuns.length > 0 && (
        <>
          <Label>changes in progress</Label>
          {sysRuns.map((run) => (
            <div key={run._id} className="border-b border-foreground/10 px-3 py-3">
              <p className="text-sm">{run.title}</p>
              <p className="font-mono text-[11px] opacity-60">
                {run.steps.filter((s) => s.done).length}/{run.steps.length} steps · applying a draft finishes them and starts the verify window
              </p>
              <div className="mt-2">
                <Btn onClick={() => setEditor({ kind: "type", key: "", body: pretty(TEMPLATES.type.body), runId: run._id })}>
                  + new draft
                </Btn>
              </div>
              {drafts
                .filter((d) => d.runId === run._id)
                .map((d) => (
                  <DraftCard key={d._id} draft={d} ctx={ctx} />
                ))}
            </div>
          ))}
        </>
      )}

      {(["type", "workflow", "view", "rule"] as DefKind[]).map((kind) => (
        <DefSection key={kind} kind={kind} ctx={ctx} onEdit={(key, body) => setEditor({ kind, key, body, runId: sysRuns[0]?._id ?? null })} onNew={() => setEditor({ kind, key: "", body: pretty(TEMPLATES[kind].body), runId: sysRuns[0]?._id ?? null })} />
      ))}

      {editor && <DefEditor ctx={ctx} initial={editor} sysRuns={sysRuns} onClose={() => setEditor(null)} />}
    </div>
  );
}

// ---------- draft card with before/after and a live preview ----------

function DraftCard({ draft, ctx }: { draft: Doc<"defs">; ctx: LoopCtx }) {
  const before = currentBody(ctx, draft.kind as DefKind, draft.key);
  return (
    <div className="mt-3 border border-foreground/40 p-2">
      <p className="mb-1 flex items-center gap-2 font-mono text-[11px]">
        <Tag>draft</Tag>
        {draft.kind} <b>{draft.key}</b> v{draft.version}
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <p className="font-mono text-[11px] opacity-60">now</p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words border border-foreground/20 p-1.5 font-mono text-[10px]">
            {before ?? "(new)"}
          </pre>
        </div>
        <div>
          <p className="font-mono text-[11px] opacity-60">draft</p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words border border-foreground/20 p-1.5 font-mono text-[10px]">
            {pretty(draft.body)}
          </pre>
        </div>
      </div>
      <Preview ctx={ctx} kind={draft.kind as DefKind} body={draft.body} />
      <div className="mt-2 flex gap-2">
        <Btn solid onClick={() => void ctx.act(ctx.m.applyDraft({ defId: draft._id }))}>
          apply
        </Btn>
        <Btn onClick={() => void ctx.act(ctx.m.discardDraft({ defId: draft._id }))}>discard</Btn>
      </div>
    </div>
  );
}

/** "Try it": what this definition would do against the data you have right now. */
function Preview({ ctx, kind, body }: { ctx: LoopCtx; kind: DefKind; body: string }) {
  const lines = useMemo(() => {
    const out: string[] = [];
    if (kind === "type") {
      const t = parseTypeDef(body);
      if (!t.ok) return out;
      out.push(`sigil: ${t.value.sigil ? `${t.value.sigil} text` : "none"}`);
      out.push(`states: ${t.value.states.map((s) => `${s.label} (${s.role})`).join(" → ")}`);
      out.push(`fields: ${t.value.fields.length ? t.value.fields.map((f) => `${f.label} (${f.kind})`).join(", ") : "none"}`);
    } else if (kind === "workflow") {
      const w = parseWorkflowDef(body);
      if (!w.ok) return out;
      out.push(`${w.value.steps.length} step${w.value.steps.length === 1 ? "" : "s"}: ${w.value.steps.map((s) => s.title).join(" · ") || "—"}`);
      out.push(w.value.verifyDays > 0 ? `then ${w.value.verifyDays} days quiet (tolerance ${w.value.tolerance})` : "no verify window — done when the steps are");
    } else if (kind === "view") {
      const v = parseViewDef(body);
      if (!v.ok) return out;
      const n = [...ctx.model.items.values()].filter((i) =>
        matchesView(v.value, { type: i.item.type, state: i.item.state, rate: i.rate, signals: i.signals.length, hasActiveRun: !!i.activeRun }),
      ).length;
      out.push(`matches ${n} item${n === 1 ? "" : "s"} right now`);
    } else {
      const r = parseRuleDef(body);
      if (!r.ok) return out;
      const n = [...ctx.model.items.values()].filter((i) =>
        ruleMatches(r.value, i.item.type, i.signals.map((s) => s.at), ctx.now),
      ).length;
      out.push(`would fire for ${n} item${n === 1 ? "" : "s"} right now (once each)`);
    }
    return out;
  }, [ctx.model.items, ctx.now, kind, body]);
  if (lines.length === 0) return null;
  return (
    <ul className="mt-2 border-l-2 border-foreground/30 pl-2 font-mono text-[11px] opacity-80">
      {lines.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}

// ---------- definitions list ----------

function DefSection({
  kind,
  ctx,
  onEdit,
  onNew,
}: {
  kind: DefKind;
  ctx: LoopCtx;
  onEdit: (key: string, body: string) => void;
  onNew: () => void;
}) {
  const [history, setHistory] = useState<string | null>(null);
  const keys = useMemo(() => {
    const set = new Set<string>();
    if (kind === "type") Object.keys(BUILTIN_TYPES).forEach((k) => set.add(k));
    if (kind === "workflow") Object.keys(BUILTIN_WORKFLOWS).forEach((k) => set.add(k));
    for (const d of ctx.defs) if (d.kind === kind && d.status !== "draft") set.add(d.key);
    return [...set].sort();
  }, [ctx.defs, kind]);
  const record = kind === "workflow" ? workflowRecord(ctx.runs) : {};

  return (
    <>
      <Label>{KIND_LABEL[kind]}</Label>
      <ul>
        {keys.map((key) => {
          const versions = ctx.defs.filter((d) => d.kind === kind && d.key === key && d.status !== "draft").sort((a, b) => b.version - a.version);
          const active = versions.find((v) => v.status === "active");
          const body = currentBody(ctx, kind, key);
          const builtin = (kind === "type" && !!BUILTIN_TYPES[key]) || (kind === "workflow" && !!BUILTIN_WORKFLOWS[key]);
          const name = body ? (JSON.parse(body) as { name?: string }).name ?? key : key;
          if (!body) return null; // retired and not a built-in
          return (
            <li key={key} className="border-b border-foreground/10 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm">
                  {name} <span className="font-mono text-[11px] opacity-60">{key} · {active ? `v${active.version}` : "built-in"}</span>
                  {record[key] && (
                    <span className="ml-2 font-mono text-[11px] opacity-60">
                      held {record[key].held}/{record[key].held + record[key].reopened}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 gap-3 font-mono text-[11px]">
                  <button className="underline underline-offset-4" onClick={() => onEdit(key, body)}>
                    edit
                  </button>
                  {versions.length > 0 && (
                    <button className="underline underline-offset-4 opacity-60" onClick={() => setHistory(history === key ? null : key)}>
                      history
                    </button>
                  )}
                </span>
              </div>
              {history === key && (
                <ul className="mt-2 font-mono text-[11px]">
                  {versions.map((v) => (
                    <li key={v._id} className="flex items-center justify-between gap-3 py-0.5">
                      <span className="opacity-70">
                        v{v.version} · {ago(v.createdAt, ctx.now)} {v.status === "active" ? "· current" : ""}
                      </span>
                      {v.status !== "active" && (
                        <button
                          className="underline underline-offset-4"
                          onClick={() => void ctx.act(ctx.m.rollbackDef({ kind, key, toVersion: v.version }))}
                        >
                          restore
                        </button>
                      )}
                    </li>
                  ))}
                  {!builtin || active ? (
                    <li className="pt-1">
                      <button
                        className="underline underline-offset-4 opacity-60"
                        onClick={() => void ctx.act(ctx.m.retireDef({ kind, key }))}
                      >
                        {builtin ? "revert to built-in" : "retire"}
                      </button>
                    </li>
                  ) : null}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <div className="px-3 pt-2">
        <Btn onClick={onNew}>+ new {kind}</Btn>
      </div>
    </>
  );
}

// ---------- editor ----------

function DefEditor({
  ctx,
  initial,
  sysRuns,
  onClose,
}: {
  ctx: LoopCtx;
  initial: { kind: DefKind; key: string; body: string; runId: string | null };
  sysRuns: Doc<"runs">[];
  onClose: () => void;
}) {
  const [kind, setKind] = useState<DefKind>(initial.kind);
  const [key, setKey] = useState(initial.key || TEMPLATES[initial.kind].key);
  const [body, setBody] = useState(initial.body);
  const [target, setTarget] = useState<string>(initial.runId ?? "new");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const checked = useMemo(() => {
    try {
      return validateDefBody(kind, JSON.parse(body));
    } catch {
      return { ok: false as const, error: "that isn't valid JSON yet" };
    }
  }, [kind, body]);
  const keyOk = /^[a-z][a-z0-9-]{0,31}$/.test(key);
  const canSave = checked.ok && keyOk && (target !== "new" || note.trim().length > 0) && !busy;

  const save = async () => {
    setBusy(true);
    try {
      let runId = target;
      if (target === "new") {
        const id = await ctx.act(ctx.m.startSystemChange({ note }));
        if (!id) return;
        runId = id;
      }
      const normalized = checked.ok ? checked.value : body;
      const ok = await ctx.actOk(
        ctx.m.saveDef(
          target === "direct"
            ? { kind, key, body: normalized }
            : { kind, key, body: normalized, draftForRun: runId as Id<"runs"> },
        ),
      );
      if (ok) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="edit definition"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-[640px] flex-col border border-foreground bg-background"
      >
        <div className="flex items-center justify-between border-b border-foreground px-3 py-2">
          <span className="font-mono text-xs">edit {kind}</span>
          <button onClick={onClose} className="font-mono text-xs underline underline-offset-4 hover:opacity-60">
            close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div className="flex gap-2">
            <select
              value={kind}
              onChange={(e) => {
                const k = e.target.value as DefKind;
                setKind(k);
                setKey(TEMPLATES[k].key);
                setBody(pretty(TEMPLATES[k].body));
              }}
              className="border border-foreground bg-background px-1.5 py-1 font-mono text-xs"
              aria-label="kind"
              disabled={!!initial.key}
            >
              {(["type", "workflow", "view", "rule"] as DefKind[]).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase())}
              className={inputCls}
              aria-label="key"
              placeholder="key (lowercase-with-dashes)"
              disabled={!!initial.key}
            />
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            spellCheck={false}
            className={`${inputCls} mt-2 resize-y leading-relaxed`}
            aria-label="definition JSON"
          />
          {!keyOk && <p className="mt-1 font-mono text-[11px]">key: lowercase letters, digits and dashes</p>}
          {checked.ok ? (
            <>
              <p className="mt-1 font-mono text-[11px] opacity-60">valid</p>
              <Preview ctx={ctx} kind={kind} body={checked.value} />
            </>
          ) : (
            <p className="mt-1 font-mono text-[11px]">{checked.error}</p>
          )}

          <Label>how should this change land?</Label>
          <div className="flex flex-col gap-1 font-mono text-xs">
            {sysRuns.map((r) => (
              <label key={r._id} className="flex items-center gap-2">
                <input type="radio" name="target" checked={target === r._id} onChange={() => setTarget(r._id)} className="accent-foreground" />
                <span className="truncate">draft on: {r.title}</span>
              </label>
            ))}
            <label className="flex items-center gap-2">
              <input type="radio" name="target" checked={target === "new"} onChange={() => setTarget("new")} className="accent-foreground" />
              start a new change run
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="target" checked={target === "direct"} onChange={() => setTarget("direct")} className="accent-foreground" />
              <span>save directly <span className="opacity-60">(skips the run and the verify window)</span></span>
            </label>
          </div>
          {target === "new" && (
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="what's wrong that this fixes?"
              className={`${inputCls} mt-2`}
              aria-label="what's wrong"
            />
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-foreground px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <Btn onClick={onClose}>cancel</Btn>
          <Btn solid disabled={!canSave} onClick={() => void save()}>
            {target === "direct" ? "save" : "save as draft"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
