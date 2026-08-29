"use client";

// Delete-confirmation dialog and undo toast — the two ephemeral UIs around
// subtree deletion. UNDO_TTL_SECONDS is the shared undo window.

import type { PlainNode } from "@/lib/crypto";
import type { TreeNode } from "@/lib/tree";

export const UNDO_TTL_SECONDS = 10;

// Snapshot of a deleted subtree, captured pre-delete so it can be recreated on undo.
export type UndoSnapshot = {
  nodes: { oldId: string; plain: PlainNode }[]; // depth-first order: parents before children
  history: { oldId: string; counts: [number, number][]; durations?: [number, number][] }[];
  count: number;
};

export function DeleteConfirmDialog({
  node,
  nestedCount,
  countdown,
  onClose,
  onDelete,
}: {
  node: TreeNode;
  nestedCount: number;
  countdown: number;
  onClose: () => void;
  onDelete: () => void;
}) {
  const hasTimer = !!node.metadata.timer;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] border border-foreground bg-background p-6"
      >
        <p className="font-mono text-[11px] opacity-40">root@vault:~$</p>
        <h2 id="delete-confirm-title" className="mt-1 font-mono text-sm font-medium break-words">
          <span className="opacity-40">$</span> rm{" "}
          <span className="underline decoration-dotted underline-offset-4">
            {`"${node.title.length > 48 ? `${node.title.slice(0, 48)}…` : node.title}"`}
          </span>
        </h2>
        <p className="mt-3 font-mono text-xs leading-relaxed opacity-70">
          {nestedCount > 1
            ? `// ${nestedCount - 1} nested node${nestedCount - 1 === 1 ? "" : "s"} terminated alongside it`
            : "// task will be purged"}
          {hasTimer ? " — ⏱ running stopwatch session will be lost" : ""}
          {" — recoverable for "}
          {UNDO_TTL_SECONDS}s via undo.
        </p>
        <div className="mt-6 flex justify-end gap-2 font-mono text-xs">
          <button
            autoFocus
            onClick={onClose}
            className="border border-foreground bg-background px-4 py-2 hover:bg-foreground/10 focus:outline-none focus:ring-1 focus:ring-foreground"
          >
            cancel
          </button>
          <button
            onClick={onDelete}
            className="border border-foreground bg-foreground px-4 py-2 text-background hover:opacity-90 focus:outline-none"
          >
            delete
          </button>
        </div>
        <p className="mt-3 text-right font-mono text-[11px] opacity-30">&gt; auto-abort in {countdown}s • [esc] cancel</p>
      </div>
    </div>
  );
}

export function UndoToast({
  snap,
  ttl,
  onUndo,
  onDismiss,
}: {
  snap: UndoSnapshot;
  ttl: number;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 border border-foreground bg-background px-4 py-2 text-xs shadow-sm">
      <span>
        deleted {snap.count} task{snap.count === 1 ? "" : "s"}
      </span>
      <button onClick={onUndo} className="border border-foreground px-2 py-0.5 hover:bg-foreground hover:text-background">
        undo
      </button>
      <span className="font-mono opacity-40">{ttl}s</span>
      <button onClick={onDismiss} className="opacity-60 hover:opacity-100" aria-label="dismiss undo">
        ×
      </button>
    </div>
  );
}
