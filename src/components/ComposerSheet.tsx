"use client";

import { useEffect, useRef, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { parseDueInput } from "@/lib/due";

// Tap-first task creation for mobile. The desktop grammar input stays the
// power tool; this sheet composes the same outcomes (directory path, ~recur
// token, metadata) without requiring the keyboard for anything but the title.

export type ComposerDraft = {
  title: string;
  /** directory path titles; [] = root. Empty in child mode (parent is fixed). */
  dirParts: string[];
  /** grammar token, e.g. "~daily"; parsed by the caller via parseRecurInput */
  recurToken: string | null;
  /** local midnight of the due day (see src/lib/due.ts); null = none */
  dueAt: number | null;
  priority: "low" | "med" | "high" | null;
};

export type ComposerMode =
  | { kind: "root"; initialDirParts: string[] }
  | { kind: "child"; parentId: Id<"todos">; parentTitle: string };

const RECUR_CHIPS: { label: string; token: string }[] = [
  { label: "daily", token: "~daily" },
  { label: "weekdays", token: "~weekdays" },
  { label: "weekly", token: "~weekly" },
  { label: "monthly", token: "~monthly" },
  { label: "yearly", token: "~yearly" },
];

// Distance between the layout viewport bottom and the visual viewport bottom —
// the keyboard height while an input is focused (0 when closed). iOS Safari
// ignores interactive-widget=resizes-content, so fixed bottom-anchored panels
// need this to stay above the keyboard.
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

export function ComposerSheet({
  mode,
  dirOptions,
  online,
  onClose,
  onSubmit,
}: {
  mode: ComposerMode;
  /** every pickable directory as title paths; [ [] ] means root only */
  dirOptions: string[][];
  online: boolean;
  onClose: () => void;
  onSubmit: (draft: ComposerDraft) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [dirParts, setDirParts] = useState<string[]>(mode.kind === "root" ? mode.initialDirParts : []);
  const [dirOpen, setDirOpen] = useState(false);
  const [recurToken, setRecurToken] = useState<string | null>(null);
  const [dueInput, setDueInput] = useState("");
  const [priority, setPriority] = useState<"low" | "med" | "high" | null>(null);
  const [busy, setBusy] = useState(false);
  const keyboardInset = useKeyboardInset();
  const dirLabelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const dirLabel = `/${dirParts.join("/")}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    const ok = await onSubmit({
      title: t,
      dirParts: mode.kind === "root" ? dirParts : [],
      recurToken,
      dueAt: online && dueInput ? parseDueInput(dueInput) : null,
      priority: online ? priority : null,
    });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-background/80" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode.kind === "child" ? "new sub-task" : "new task"}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 flex flex-col border-t border-foreground bg-background"
        style={{
          bottom: keyboardInset || undefined,
          paddingBottom: keyboardInset ? undefined : "env(safe-area-inset-bottom)",
          maxHeight: `calc(100dvh - ${keyboardInset + 24}px)`,
        }}
      >
        <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-2 text-xs">
          <span className="font-mono opacity-60">
            {mode.kind === "child" ? `new sub-task — under ${mode.parentTitle}` : "new task"}
          </span>
          <button onClick={onClose} className="opacity-60 hover:opacity-100" aria-label="close">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            <label className="block">
              <span className="text-xs opacity-60">task</span>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="what needs doing?"
                className="mt-1 w-full border-b border-foreground bg-transparent py-1 text-base placeholder:text-foreground/40 focus:outline-none"
              />
            </label>

            {mode.kind === "root" && (
              <div>
                <span className="text-xs opacity-60">in</span>
                <button
                  ref={dirLabelRef}
                  type="button"
                  onClick={() => setDirOpen((v) => !v)}
                  className="mt-1 block w-full truncate border border-foreground/20 p-1.5 text-left font-mono text-sm hover:opacity-80"
                >
                  {dirLabel}
                </button>
                {dirOpen && (
                  <div className="mt-1 max-h-40 overflow-y-auto border border-foreground/20">
                    {dirOptions.map((parts, i) => {
                      const path = `/${parts.join("/")}`;
                      const selected = parts.join("/") === dirParts.join("/");
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setDirParts(parts);
                            setDirOpen(false);
                            dirLabelRef.current?.focus();
                          }}
                          className={`block w-full truncate px-2 py-1.5 text-left font-mono text-xs ${
                            selected ? "bg-foreground text-background" : "hover:bg-foreground/10"
                          }`}
                        >
                          {path}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div>
              <span className="text-xs opacity-60">repeats</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {RECUR_CHIPS.map((chip) => {
                  const active = recurToken === chip.token;
                  return (
                    <button
                      key={chip.token}
                      type="button"
                      onClick={() => setRecurToken(active ? null : chip.token)}
                      className={`border px-2 py-1 text-xs ${
                        active ? "border-foreground bg-foreground text-background" : "border-foreground/20 hover:border-foreground"
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3">
              <label className="flex-1 block">
                <span className="text-xs opacity-60">due</span>
                <input
                  type="date"
                  value={dueInput}
                  disabled={!online}
                  onChange={(e) => setDueInput(e.target.value)}
                  className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-sm disabled:opacity-40"
                />
              </label>
              <label className="w-28">
                <span className="text-xs opacity-60">priority</span>
                <select
                  value={priority ?? ""}
                  disabled={!online}
                  onChange={(e) => setPriority(e.target.value === "" ? null : (e.target.value as "low" | "med" | "high"))}
                  className="mt-1 w-full border border-foreground/20 bg-background p-1 text-sm disabled:opacity-40"
                >
                  <option value="">none</option>
                  <option value="low">low</option>
                  <option value="med">med</option>
                  <option value="high">high</option>
                </select>
              </label>
            </div>
            {!online && (
              <p className="text-[10px] opacity-50">offline — captures keep title, directory and recurrence only</p>
            )}
          </div>

          <div className="border-t border-foreground p-3">
            <button
              type="submit"
              disabled={!title.trim() || busy}
              className="w-full border border-foreground bg-foreground py-2 text-sm text-background hover:opacity-90 disabled:opacity-20"
            >
              {busy ? "adding…" : mode.kind === "child" ? "add sub-task" : "add task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
