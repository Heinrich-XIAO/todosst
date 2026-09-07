"use client";

import { useEffect, useRef, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { PlainNode } from "@/lib/crypto";
import { withReminderDefault } from "@/lib/reminders";
import { defaultDueTimeMin } from "@/lib/due";
import {
  CompletionStyleField,
  DescriptionField,
  PriorityDueField,
  RecurrenceField,
  RemindersField,
  TagsField,
  parseTagsInput,
} from "./TaskFields";

// The mobile new-task flow: the edit UI's fields (TaskFields — same controls
// as MetadataPanel) in a bottom sheet, developed for creation — a title, a
// directory picker, and a sticky add button. Fields buffer locally and bake
// into the created node's metadata in one shot; nothing writes per keystroke.

export type TaskDraft = {
  title: string;
  /** directory path titles; [] = root. Empty in child mode (parent is fixed). */
  dirParts: string[];
  /** full metadata to bake into the created node */
  metadata: PlainNode["metadata"];
};

export type TaskSheetMode =
  | { kind: "create"; initialDirParts: string[]; /** due date preset for the new task (e.g. today when opened from the today tab) */
      initialDueAt?: number | null }
  | { kind: "create-child"; parentId: Id<"todos">; parentTitle: string };

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

export function TaskSheet({
  mode,
  dirOptions,
  online,
  nowTs,
  onClose,
  onSubmit,
}: {
  mode: TaskSheetMode;
  /** every pickable directory as title paths; [ [] ] means root only */
  dirOptions: string[][];
  online: boolean;
  /** recurrence anchor for new rules — the app's shared clock */
  nowTs: number;
  onClose: () => void;
  onSubmit: (draft: TaskDraft) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [dirParts, setDirParts] = useState<string[]>(mode.kind === "create" ? mode.initialDirParts : []);
  const [dirOpen, setDirOpen] = useState(false);
  const initialMetadata = withReminderDefault(
    mode.kind === "create" && mode.initialDueAt
      ? { dueAt: mode.initialDueAt, dueTimeMin: defaultDueTimeMin(nowTs) }
      : {}
  );
  const [metadata, setMetadata] = useState<PlainNode["metadata"]>(initialMetadata);
  const [busy, setBusy] = useState(false);
  // mirror of metadata for submit-time reads — blur commits can land in the
  // same event tick as the submit tap, before the state update re-renders
  const metaRef = useRef<PlainNode["metadata"]>(initialMetadata);
  const keyboardInset = useKeyboardInset();
  const dirLabelRef = useRef<HTMLButtonElement>(null);

  const onPatch = (patch: Partial<PlainNode["metadata"]>) => {
    metaRef.current = withReminderDefault({ ...metaRef.current, ...patch });
    setMetadata(metaRef.current);
  };

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
      dirParts: mode.kind === "create" ? dirParts : [],
      metadata: metaRef.current,
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
        aria-label={mode.kind === "create-child" ? "new sub-task" : "new task"}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-0 flex flex-col border-t border-foreground bg-background"
        style={{
          bottom: keyboardInset,
          paddingBottom: keyboardInset ? undefined : "env(safe-area-inset-bottom)",
          maxHeight: `calc(100dvh - ${keyboardInset + 24}px)`,
        }}
      >
        {/* title + close share one pinned row — no header, no label: the
            dialog's aria-label names it and the placeholder does the rest */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-foreground/10 px-4 py-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">task</span>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="what needs doing?"
                className="w-full border-b border-foreground bg-transparent py-1 text-base placeholder:text-foreground/40 focus:outline-none"
              />
            </label>
            <button onClick={onClose} className="shrink-0 p-1 opacity-60 hover:opacity-100" aria-label="close">
              ✕
            </button>
          </div>
          {mode.kind === "create-child" && (
            <div className="border-b border-foreground/10 px-4 py-1 font-mono text-[10px] opacity-60">
              new sub-task — under {mode.parentTitle}
            </div>
          )}

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3 text-xs">
            {mode.kind === "create" && (
              <div>
                <span className="opacity-60">in</span>
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

            <RecurrenceField metadata={metadata} anchorTs={nowTs} onPatch={onPatch} />
            <CompletionStyleField metadata={metadata} onPatch={onPatch} />
            <DescriptionField metadata={metadata} onCommit={(v) => onPatch({ description: v })} disabled={!online} />
            <PriorityDueField metadata={metadata} onPatch={onPatch} />
            <RemindersField metadata={metadata} onPatch={onPatch} />
            <TagsField
              metadata={metadata}
              onCommit={(v) => {
                const tags = parseTagsInput(v);
                onPatch({ tags: tags.length ? tags : undefined });
              }}
              disabled={!online}
            />
            {!online && (
              <p className="text-[10px] opacity-50">offline — captures keep title, directory and preset recurrence only</p>
            )}
          </div>

          <div className="border-t border-foreground p-3">
            <button
              type="submit"
              disabled={!title.trim() || busy}
              className="w-full border border-foreground bg-foreground py-2 text-sm text-background hover:opacity-90 disabled:opacity-20"
            >
              {busy ? "adding…" : mode.kind === "create-child" ? "add sub-task" : "add task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
