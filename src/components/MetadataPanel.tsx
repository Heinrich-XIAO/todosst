"use client";

import { useEffect, useRef } from "react";
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
        const tags = parseTagsInput(pending.tags);
        if (tags.join("\u0000") !== (meta.tags ?? []).join("\u0000")) save(n._id, { tags });
      }
    };
  }, []);
  if (!node) return null;
  const payloadLen = node._raw.ciphertext?.length ?? 0;
  const onPatch = (patch: Partial<PlainNode["metadata"]>) => {
    // a patch that adds a due date or recurrence plan defaults remind on
    // (withReminderDefault respects an existing cfg, incl. an explicit off);
    // unrelated patches never touch reminder state
    const merged = patch.dueAt || patch.recur ? withReminderDefault({ ...node.metadata, ...patch }) : patch;
    onUpdateMetadata(node._id, merged);
  };
  return (
    <div className="border-t border-foreground bg-background p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">{node.title} — details</span>
        <button onClick={onClose} className="opacity-60 hover:opacity-100">
          close
        </button>
      </div>
      <div className="mt-3 space-y-2">
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
