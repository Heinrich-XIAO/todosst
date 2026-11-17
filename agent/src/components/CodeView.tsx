"use client";

import { useMutation } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import { evaluateProgram } from "@/lib/engine";
import type { Files, LogEntry, ProgramError } from "@/lib/runtime";

const PATH = /^[a-z0-9][a-z0-9._/-]{0,80}\.js$/;

export function CodeView({
  files,
  log,
  now,
  selected,
  onSelect,
}: {
  files: Files;
  log: LogEntry[];
  now: number;
  selected: string | null;
  onSelect: (path: string | null) => void;
}) {
  const post = useMutation(api.program.post);
  const paths = useMemo(() => Object.keys(files).sort(), [files]);
  const current = selected && (files[selected] !== undefined) ? selected : paths[0] ?? null;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<ProgramError[]>([]);
  const [saving, setSaving] = useState(false);

  const merged = useMemo(() => ({ ...files, ...drafts }), [files, drafts]);
  const dirty = Object.keys(drafts).filter((p) => drafts[p] !== files[p]);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      const d = new Date(now);
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      evaluateProgram(merged, log, now, [day]).then((ev) => live && setErrors(ev.errors));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [merged, log, now]);

  async function save() {
    if (!dirty.length) return;
    setSaving(true);
    try {
      await post({ role: "edit", text: `edited ${dirty.join(", ")}`, changes: dirty.map((p) => ({ path: p, source: drafts[p] })) });
      setDrafts({});
    } finally {
      setSaving(false);
    }
  }

  async function newFile() {
    const name = window.prompt("New file name (e.g. health.js)")?.trim().toLowerCase();
    if (!name) return;
    const path = name.endsWith(".js") ? name : `${name}.js`;
    if (!PATH.test(path)) return window.alert("Use lowercase letters, digits, ., _, - and / only.");
    if (files[path] !== undefined) return onSelect(path);
    await post({ role: "edit", text: `created ${path}`, changes: [{ path, source: "" }] });
    onSelect(path);
  }

  async function remove(path: string) {
    if (!window.confirm(`Delete ${path}? You can undo it from the agent panel.`)) return;
    await post({ role: "edit", text: `deleted ${path}`, changes: [{ path, source: null }] });
    setDrafts((d) => {
      const next = { ...d };
      delete next[path];
      return next;
    });
    onSelect(null);
  }

  const value = current ? merged[current] ?? "" : "";
  const fileErrors = errors.filter((e) => e.file === current);
  const otherErrors = errors.filter((e) => e.file !== current);

  return (
    <div
      className="flex h-full min-h-0 flex-col sm:flex-row"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          save();
        }
      }}
    >
      <aside className="shrink-0 border-b sm:border-b-0 sm:border-r border-line sm:w-56 flex sm:flex-col">
        <div className="hidden sm:flex items-center justify-between px-3 py-3 text-xs uppercase tracking-wider text-muted">
          <span>Program</span>
          <button onClick={newFile} className="normal-case tracking-normal text-ink hover:text-accent" title="New file">
            + new
          </button>
        </div>
        <ul className="flex sm:flex-col overflow-x-auto sm:overflow-y-auto scroll-thin flex-1">
          {paths.map((p) => {
            const bad = errors.some((e) => e.file === p);
            return (
              <li key={p} className="shrink-0">
                <button
                  onClick={() => onSelect(p)}
                  className={`w-full whitespace-nowrap text-left px-3 py-2 font-mono text-[13px] flex items-center gap-2 ${
                    p === current ? "bg-panel text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  <span className="truncate">{p}</span>
                  {drafts[p] !== undefined && drafts[p] !== files[p] && <span className="size-1.5 rounded-full bg-accent" title="unsaved" />}
                  {bad && <span className="text-late text-xs">●</span>}
                </button>
              </li>
            );
          })}
          <li className="sm:hidden shrink-0">
            <button onClick={newFile} className="px-3 py-2 text-sm text-muted">
              + new
            </button>
          </li>
        </ul>
      </aside>

      <section className="flex-1 min-h-0 flex flex-col">
        {current ? (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
              <span className="font-mono text-sm truncate">{current}</span>
              <div className="flex items-center gap-2 text-sm">
                <button onClick={() => remove(current)} className="text-muted hover:text-late px-2 py-1">
                  delete
                </button>
                {dirty.length > 0 && (
                  <button onClick={() => setDrafts({})} className="text-muted hover:text-ink px-2 py-1">
                    discard
                  </button>
                )}
                <button
                  onClick={save}
                  disabled={!dirty.length || saving}
                  className="rounded-md bg-ink text-bg px-3 py-1 disabled:opacity-30"
                  title="Save (⌘S)"
                >
                  {saving ? "saving…" : "save"}
                </button>
              </div>
            </div>
            <textarea
              value={value}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(e) => setDrafts((d) => ({ ...d, [current]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key !== "Tab") return;
                e.preventDefault();
                const el = e.currentTarget;
                const { selectionStart: s, selectionEnd: end } = el;
                const next = value.slice(0, s) + "  " + value.slice(end);
                setDrafts((d) => ({ ...d, [current]: next }));
                requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
              }}
              className="flex-1 min-h-[50vh] sm:min-h-0 resize-none bg-code px-4 py-3 font-mono text-[13px] leading-[1.6] outline-none"
            />
            {(fileErrors.length > 0 || otherErrors.length > 0) && (
              <div className="border-t border-line bg-late/5 px-4 py-2 text-sm text-late space-y-0.5 max-h-40 overflow-auto">
                {[...fileErrors, ...otherErrors].map((e, i) => (
                  <div key={i} className="font-mono text-xs">
                    {e.file}
                    {e.line ? `:${e.line}` : ""} {e.message}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="p-6 text-muted">No files yet. Ask the agent, or create one.</div>
        )}
      </section>
    </div>
  );
}
