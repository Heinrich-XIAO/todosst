"use client";

import { useEffect, useRef, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { TreeNode } from "@/lib/tree";
import type { PlainNode } from "@/lib/crypto";
import { withReminderDefault } from "@/lib/reminders";
import {
  CompletionStyleField,
  DescriptionField,
  HeatmapField,
  PayloadField,
  PriorityDueField,
  RecurrenceField,
  RemindersField,
  TagsField,
  parseTagsInput,
} from "./TaskFields";

export function MetadataPanel({
  node,
  onUpdateMetadata,
  onRename,
  onClose,
  nowTs,
  historyCounts,
}: {
  node: TreeNode | null;
  onUpdateMetadata: (id: Id<"todos">, patch: Partial<PlainNode["metadata"]>) => void;
  onRename: (id: Id<"todos">, title: string) => Promise<boolean>;
  onClose: () => void;
  nowTs: number;
  historyCounts: Map<number, number> | null;
}) {
  // free-text fields (name, description, tags) save on blur; pending values are
  // tracked so unmount can flush edits from paths that skip blur (node
  // deleted while typing, panel closed without focus change). Refs are
  // nulled before passive cleanup runs, so DOM can't be read there.
  const pendingRef = useRef<{ title?: string; description?: string; tags?: string }>({});
  const stateRef = useRef({ node, onUpdateMetadata, onRename });
  useEffect(() => {
    stateRef.current = { node, onUpdateMetadata, onRename };
  });
  useEffect(() => {
    return () => {
      const { node: n, onUpdateMetadata: save, onRename: rename } = stateRef.current;
      if (!n) return;
      // pendingRef is not a DOM ref — it holds the latest typed strings; reading
      // .current here is the point of the flush
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const pending = pendingRef.current;
      if (pending.title !== undefined) {
        const v = pending.title.trim();
        if (v && v !== n.title && v.length <= 200) void rename(n._id, v);
      }
      const meta = n.metadata as PlainNode["metadata"];
      if (pending.description !== undefined && pending.description !== (meta.description ?? "")) {
        save(n._id, { description: pending.description });
      }
      if (pending.tags !== undefined) {
        const tags = parseTagsInput(pending.tags);
        if (tags.join("\u0000") !== (meta.tags ?? []).join("\u0000")) save(n._id, { tags });
      }
    };
  }, []);
  const [nameDraft, setNameDraft] = useState(node?.title ?? "");
  if (!node) return null;
  const payloadLen = node._raw.ciphertext?.length ?? 0;
  const onPatch = (patch: Partial<PlainNode["metadata"]>) => {
    // a patch that adds a due date or recurrence plan defaults remind on
    // (withReminderDefault respects an existing cfg, incl. an explicit off);
    // unrelated patches never touch reminder state
    const merged = patch.dueAt || patch.recur ? withReminderDefault({ ...node.metadata, ...patch }) : patch;
    onUpdateMetadata(node._id, merged);
  };
  const commitName = (raw: string) => {
    pendingRef.current.title = undefined;
    const v = raw.trim();
    if (!v || v.length > 200 || v === node.title) {
      setNameDraft(node.title);
      return;
    }
    void onRename(node._id, v).then((ok) => {
      if (!ok) setNameDraft(node.title);
    });
  };
  return (
    <div className="flex max-h-[70dvh] shrink-0 flex-col border-t border-foreground bg-background p-3 text-xs">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <label className="flex min-w-0 flex-1 items-baseline gap-1">
          <input
            value={nameDraft}
            maxLength={200}
            aria-label="task name"
            onChange={(e) => {
              setNameDraft(e.target.value);
              pendingRef.current.title = e.target.value;
            }}
            onBlur={() => commitName(nameDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            className="min-w-0 flex-1 border-b border-transparent bg-transparent py-1 text-base font-medium focus:border-foreground/40 focus:outline-none"
          />
        </label>
        <button onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100">
          close
        </button>
      </div>
      {/* no overscroll-contain: at the body's end the swipe must chain to
          the page so the panel bottom can rise clear of the fixed nav */}
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
        <RecurrenceField metadata={node.metadata as PlainNode["metadata"]} anchorTs={node._creationTime} onPatch={onPatch} />
        <CompletionStyleField metadata={node.metadata as PlainNode["metadata"]} onPatch={onPatch} />
        <PayloadField payloadLen={payloadLen} />
        <HeatmapField metadata={node.metadata as PlainNode["metadata"]} counts={historyCounts ?? new Map<number, number>()} nowTs={nowTs} />
        <DescriptionField
          metadata={node.metadata as PlainNode["metadata"]}
          onInput={(v) => {
            pendingRef.current.description = v;
          }}
          onCommit={(v) => {
            onUpdateMetadata(node._id, { description: v });
            pendingRef.current.description = undefined;
          }}
        />
        <PriorityDueField metadata={node.metadata as PlainNode["metadata"]} onPatch={onPatch} />
        <RemindersField metadata={node.metadata as PlainNode["metadata"]} onPatch={onPatch} />
        <TagsField
          metadata={node.metadata as PlainNode["metadata"]}
          onInput={(v) => {
            pendingRef.current.tags = v;
          }}
          onCommit={(v) => {
            onUpdateMetadata(node._id, { tags: parseTagsInput(v) });
            pendingRef.current.tags = undefined;
          }}
        />
      </div>
    </div>
  );
}
