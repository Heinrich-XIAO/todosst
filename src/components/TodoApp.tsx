"use client";
/* eslint-disable react-hooks/set-state-in-effect -- decrypt/history/timer-driven
   state sync in effects is inherent to the encrypted vault lifecycle here;
   same tradeoff as EncryptionContext.tsx */

import { useState, useEffect, useMemo, useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AuthLoading, Unauthenticated, Authenticated } from "convex/react";
import { PushAutoEnable } from "./PushAutoEnable";
import { DailyNudgeSync } from "./DailyNudge";
import { InstallHint } from "./InstallHint";
import { AuthForm } from "./AuthForm";
import { useEncryption, getRememberedKey } from "./EncryptionContext";
import type { PlainNode } from "@/lib/crypto";
import { encryptString, decryptString, toPlainNode } from "@/lib/crypto";
import { usePathname } from "next/navigation";
import { decodePathToParts, encodePathForUrl, partsToDecodedPath } from "@/lib/cdPath";
import { runInput, type CommandContext, type InputOutcome } from "@/lib/grammar";
import {
  COUNT_MAX,
  dayIndexLocal,
  dayIndexToStart,
  decodeHistoryPayload,
  encodeHistoryPayload,
  modeOf,
  nextCountOnClick,
  normalizeRruleString,
  parseRecurInput,
  prevWindowDay,
  recurState,
  stepOf,
  thresholdOf,
} from "@/lib/recur";
import type { RecurState } from "@/lib/recur";
import { parseNegInput, buildHoldItems, holdOf, isNegative, withHold, type HoldItem } from "@/lib/negative";
import { dueInstant, normalizeDueAt } from "@/lib/due";
import { HelpPanel } from "./HelpPanel";
import { TaskSheet, type TaskDraft, type TaskSheetMode } from "./TaskSheet";
import { ReminderToast } from "./ReminderToast";
import { CountControl } from "./CountControl";
import { SlipControl } from "./SlipControl";
import { buildTodayItems, openCountOf, TodayView, type PastYearSlide } from "./TodayView";
import { dismissHabitOffer, missedDays, openRitual, recordClearDay } from "@/lib/ritual";
import {
  buildTree,
  childrenOf,
  collectDescendants,
  dropPosFor,
  findChildByTitle,
  getAncestors,
  isValidDropTarget,
  type DecryptedNode,
  type DropPos,
  type TreeNode,
} from "@/lib/tree";
import {
  loadShownReminders,
  markOverdueShown,
  markRemindersShown,
  overdueShownIds,
  reminderKey,
  reminderOffsets,
  remindTimesFor,
  withReminderDefault,
} from "@/lib/reminders";
import { resolveSlashSuggest } from "@/lib/slashComplete";
import { registerServiceWorker } from "@/lib/push";
import { useOnline } from "@/lib/useOnline";
import {
  openCapture,
  outboxAddCapture,
  outboxDelete,
  outboxList,
  outboxMarkAttempt,
  OUTBOX_MAX_ATTEMPTS,
  type OutboxEntry,
} from "@/lib/outbox";
import { UnlockScreen } from "./UnlockScreen";
import { MetadataPanel } from "./MetadataPanel";
import { PLACEHOLDER_PHRASES, TypewriterPlaceholder } from "./TypewriterPlaceholder";
import { DeleteConfirmDialog, UndoToast, UNDO_TTL_SECONDS, type UndoSnapshot } from "./DeleteUndo";
import { NoticeDialog } from "./NoticeDialog";

type Filter = "all" | "active" | "completed";

const DUPLICATE_MSG = "a task with that path already exists";

// the auto-habit meta-task, offered on the first today visit; created via
// parseRecurInput(`${HABIT_TITLE} ~daily`) so the offered string is the truth
const HABIT_TITLE = "open todosst";

// heuristic for "this mutation failed because the network did" — the input is
// parked in the outbox instead of surfaced as an error (replay converges:
// existing path nodes are reused, duplicates are caught)
function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true; // "Failed to fetch" et al.
  const msg = err instanceof Error ? err.message : String(err);
  return /failed to fetch|networkerror|network error|fetch failed|load failed|offline/i.test(msg);
}

function clippedLine(raw: string): string {
  return `“${raw.length > 80 ? raw.slice(0, 77) + "…" : raw}”`;
}

function captureToastLine(raw: string): string {
  return `${clippedLine(raw)} — syncs when you're back online`;
}

// how long a completed task takes to fade away
const FADE_MS = 3000;

// Cache key for decrypted rows: ciphertext (with its iv) uniquely identifies a
// payload version; rows without ciphertext key off their id.
function cacheKeyFor(t: { _id: Id<"todos">; iv?: string; ciphertext?: string }): string {
  return t.ciphertext ? `${t.iv}:${t.ciphertext}` : `row:${t._id}`;
}

// Everything the recursive row renderer needs from TodoTask. Passed as one
// bundle so RenderNode can live at module level — a component type defined
// inside another component changes identity every render, which remounts the
// whole tree (DOM state churn, lost focus, wasted layout).
type RowCtx = {
  tree: { roots: TreeNode[]; map: Map<string, TreeNode> };
  matches: (n: TreeNode) => boolean;
  recurStates: Map<string, RecurState> | null;
  collapsed: Set<string>;
  search: string;
  editingId: Id<"todos"> | null;
  editValue: string;
  setEditValue: Dispatch<SetStateAction<string>>;
  selectedId: Id<"todos"> | null;
  addChildParent: Id<"todos"> | null;
  addChildTitle: string;
  dragId: string | null;
  dropHint: { id: string; pos: DropPos } | null;
  fadingIds: Set<string>;
  // active view hides completed rows once faded — there the fade targets 0;
  // elsewhere (all/completed) the row rests dimmed at 20
  fadeToZero: boolean;
  confirmDeleteId: Id<"todos"> | null;
  currentDirDepth: number;
  currentCount: (node: TreeNode, rs: RecurState | undefined) => number;
  handleToggle: (node: TreeNode) => Promise<void>;
  handleCountUp: (node: TreeNode, delta?: number) => Promise<void>;
  handleCountDown: (node: TreeNode, delta?: number) => Promise<void>;
  handleMove: (draggedId: string, targetParentId: string | null, targetIndex: number) => Promise<void>;
  handleAddChild: (parentId: Id<"todos">) => Promise<void>;
  commitEdit: (id: Id<"todos">) => Promise<void>;
  startEdit: (node: TreeNode) => void;
  setEditingId: Dispatch<SetStateAction<Id<"todos"> | null>>;
  setSelectedId: Dispatch<SetStateAction<Id<"todos"> | null>>;
  setAddChildParent: Dispatch<SetStateAction<Id<"todos"> | null>>;
  setAddChildTitle: Dispatch<SetStateAction<string>>;
  setConfirmDeleteId: Dispatch<SetStateAction<Id<"todos"> | null>>;
  toggleExpanded: (id: string) => void;
  setDragId: Dispatch<SetStateAction<string | null>>;
  setDropHint: Dispatch<SetStateAction<{ id: string; pos: DropPos } | null>>;
  navigateToPwd: (parts: string[]) => void;
  // touch devices route "+child" through the composer sheet instead of the
  // inline input (less keyboard)
  isTouch: boolean;
  openChildComposer: (parentId: Id<"todos">, parentTitle: string) => void;
};

function RenderNode({ node, ctx }: { node: TreeNode; ctx: RowCtx }) {
  const {
    tree,
    matches,
    recurStates,
    collapsed,
    search,
    editingId,
    editValue,
    setEditValue,
    selectedId,
    addChildParent,
    addChildTitle,
    dragId,
    dropHint,
    fadingIds,
    fadeToZero,
    confirmDeleteId,
    currentDirDepth,
    currentCount,
    handleToggle,
    handleCountUp,
    handleCountDown,
    handleMove,
    handleAddChild,
    commitEdit,
    startEdit,
    setEditingId,
    setSelectedId,
    setAddChildParent,
    setAddChildTitle,
    setConfirmDeleteId,
    toggleExpanded,
    setDragId,
    setDropHint,
    navigateToPwd,
    isTouch,
    openChildComposer,
  } = ctx;
  const isExpanded = !collapsed.has(node._id) || !!search; // folders open by default; search auto-expands
  const isEditing = editingId === node._id;
  const isSelected = selectedId === node._id;
  const hasChildren = node.children.length > 0;
  const isFading = node.isCompleted && fadingIds.has(node._id as string);
  // a fading row stays visible (and clickable) even where the filter would hide it
  const show = matches(node) || isFading;
  if (!show) return null;
  const rs = recurStates?.get(node._id as string);
  const meta = node.metadata as PlainNode["metadata"];
  const mode = modeOf(meta);
  const threshold = thresholdOf(meta);
  const count = currentCount(node, rs);
  const checked = rs?.isRecurring ? count >= threshold : node.isCompleted;
  return (
    <li
      draggable={!isEditing}
      onDragStart={(e) => {
        setDragId(node._id);
        e.dataTransfer.effectAllowed = "move";
        // Firefox aborts the drag entirely when no transfer data is set
        e.dataTransfer.setData("text/plain", node.title);
      }}
      onDragEnd={() => {
        setDragId(null);
        setDropHint(null);
      }}
      onDragOver={(e) => {
        if (!dragId || !isValidDropTarget(node, dragId, tree.map)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const pos = dropPosFor(e);
        setDropHint((prev) => (prev?.id === node._id && prev.pos === pos ? prev : { id: node._id as string, pos }));
      }}
      onDragLeave={(e) => {
        const next = e.relatedTarget as Node | null;
        if (!next || !(e.currentTarget as HTMLElement).contains(next)) {
          setDropHint((prev) => (prev?.id === node._id ? null : prev));
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        // the drop-area container also handles onDrop (move-to-current-dir);
        // without stopPropagation it fires with the same stale dragId and
        // re-moves the node to the directory root after this handler moved it
        e.stopPropagation();
        if (dragId && isValidDropTarget(node, dragId, tree.map)) {
          const pos = dropPosFor(e);
          if (pos === "child") {
            // nested under this node (append)
            handleMove(dragId, node._id as string, node.children.length);
          } else {
            // sibling insertion — index computed against siblings excluding the dragged node
            const siblings = childrenOf(tree.roots, tree.map, node.parentId);
            const filtered = siblings.filter((s) => s._id !== dragId);
            const idx = filtered.findIndex((s) => s._id === node._id);
            handleMove(dragId, node.parentId, pos === "before" ? idx : idx + 1);
          }
        }
        setDragId(null);
        setDropHint(null);
      }}
      className={`border-b border-foreground/10 last:border-b-0 transition-opacity ${isFading ? "duration-[3000ms] ease-out" : "duration-1000"} ${dragId === node._id ? "opacity-40" : ""} ${isSelected ? "bg-foreground/5" : ""} ${
        isFading ? (fadeToZero ? "opacity-0" : "opacity-20") : node.isCompleted ? "opacity-20" : "opacity-100"
      }`}
      style={{ paddingLeft: `${(node.depth - currentDirDepth - 1) * 16 + 12}px` }}
    >
      <div
        data-drop-row
        className={`flex items-center gap-2 py-2 pr-3 text-sm ${
          dropHint?.id === node._id
            ? dropHint.pos === "child"
              ? "bg-foreground/10"
              : dropHint.pos === "before"
                ? "border-t-2 border-t-foreground"
                : "border-b-2 border-b-foreground"
            : ""
        }`}
      >
        <button
          onClick={() => hasChildren && toggleExpanded(node._id)}
          className={`h-4 w-4 shrink-0 flex items-center justify-center text-[10px] ${hasChildren ? "opacity-60 hover:opacity-100" : "opacity-0"}`}
          aria-label="toggle children"
        >
          {hasChildren ? (isExpanded ? "▾" : "▸") : "•"}
        </button>

        {isNegative(meta) ? (
          <SlipControl
            slips={count}
            onSlip={() => void handleCountUp(node)}
            onUndo={() => void handleCountDown(node)}
          />
        ) : mode !== "check" ? (
          <CountControl
            mode={mode}
            count={count}
            threshold={threshold}
            checked={checked}
            meta={meta}
            onToggle={() => handleToggle(node)}
            onCountUp={() => handleCountUp(node, mode === "time" ? stepOf(meta) : undefined)}
            onCountDown={() => handleCountDown(node, mode === "time" ? stepOf(meta) : undefined)}
          />
        ) : (
          <CountControl
            mode={mode}
            count={count}
            threshold={threshold}
            checked={checked}
            meta={meta}
            onToggle={() => handleToggle(node)}
            onCountUp={() => handleCountUp(node)}
            onCountDown={() => handleCountDown(node)}
          />
        )}

        {isEditing ? (
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => commitEdit(node._id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit(node._id);
              if (e.key === "Escape") setEditingId(null);
            }}
            className="flex-1 border-b border-foreground bg-transparent py-0.5 text-sm focus:outline-none"
          />
        ) : (
          <button
            onClick={() => setSelectedId(node._id)}
            onDoubleClick={() => {
              // folders open on double-click; leaves rename
              if (hasChildren) {
                navigateToPwd([...getAncestors(node._id, tree.map).map((a) => a.title), node.title]);
              } else {
                startEdit(node);
              }
            }}
            className={`flex-1 text-left truncate ${node.isCompleted ? "line-through opacity-40" : ""} ${isSelected ? "underline underline-offset-4" : ""}`}
            title={node.title}
          >
            <span className="mr-1 opacity-40">{node.children.length ? `[${node.children.length}]` : ""}</span>
            {node.title}
            {node.metadata.priority ? <span className="ml-2 text-[10px] border border-foreground/20 px-1">{node.metadata.priority}</span> : null}
            {node.metadata.dueAt ? (
              <span className="ml-1 text-[10px] opacity-60">
                {new Date(normalizeDueAt(node.metadata.dueAt)).toLocaleDateString()}
              </span>
            ) : null}
            {meta.recur ? (
              <span className="ml-1 text-[10px] opacity-50" title={meta.recur}>
                ↻ {rs?.summary || "recurring"}
                {rs?.isRecurring && rs.nextTs && dayIndexLocal(rs.nextTs) !== rs.windowDay
                  ? ` · next ${new Date(rs.nextTs).toLocaleDateString()}`
                  : ""}
              </span>
            ) : null}
          </button>
        )}

        <span className="flex gap-2 text-xs shrink-0 items-center">
          <button
            onClick={() =>
              isTouch
                ? openChildComposer(node._id, node.title)
                : setAddChildParent(node._id)
            }
            className="opacity-40 hover:opacity-100"
          >
            +child
          </button>
          <button onClick={() => setSelectedId(node._id)} className="opacity-40 hover:opacity-100 hidden md:inline">
            edit
          </button>
          {confirmDeleteId === node._id ? (
            <span className="font-mono opacity-100 underline underline-offset-4">confirm?</span>
          ) : (
            <button
              onClick={() => setConfirmDeleteId(node._id)}
              className="opacity-40 hover:opacity-100"
            >
              delete
            </button>
          )}
        </span>
      </div>

      {addChildParent === node._id && (
        <div className="flex gap-2 py-2 pr-3" style={{ paddingLeft: `${(node.depth - currentDirDepth) * 16 + 28}px` }}>
          <input
            autoFocus
            value={addChildTitle}
            onChange={(e) => setAddChildTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddChild(node._id);
              if (e.key === "Escape") {
                setAddChildParent(null);
                setAddChildTitle("");
              }
            }}
            placeholder="new sub-task…"
            maxLength={200}
            className="flex-1 border-b border-foreground bg-transparent py-1 text-xs focus:outline-none"
          />
          <button onClick={() => handleAddChild(node._id)} className="text-xs underline">
            add
          </button>
          <button
            onClick={() => {
              setAddChildParent(null);
              setAddChildTitle("");
            }}
            className="text-xs opacity-60"
          >
            cancel
          </button>
        </div>
      )}

      {hasChildren && isExpanded && (
        <ul>
          {node.children.map((child) => (
            <RenderNode key={child._id} node={child} ctx={ctx} />
          ))}
        </ul>
      )}
    </li>
  );
}

function TodoTask() {
  const { key, isLocked, isReady, lock, clearStoredKey } = useEncryption();
  const online = useOnline();
  const [hasRemembered, setHasRemembered] = useState(false);
  useEffect(() => {
    try {
      setHasRemembered(!!getRememberedKey());
    } catch {
      setHasRemembered(false);
    }
  }, [key]);
  const todos = useQuery(api.todos.list);
  const createTodo = useMutation(api.todos.create);
  const updateTodo = useMutation(api.todos.update);
  const removeTodo = useMutation(api.todos.remove);
  const removeMany = useMutation(api.todos.removeMany);
  const cryptoEncNode = useCallback(
    async (n: PlainNode) => {
      const { encryptNode } = await import("@/lib/crypto");
      if (!key) throw new Error("locked");
      return await encryptNode(key, n);
    },
    [key]
  );
  const cryptoDecNode = useCallback(
    async (iv: string, ct: string) => {
      const { decryptNode } = await import("@/lib/crypto");
      if (!key) throw new Error("locked");
      return await decryptNode(key, iv, ct);
    },
    [key]
  );

  const pathname = usePathname() ?? "/";
  const [newRootTitle, setNewRootTitle] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [view, setView] = useState<"today" | "tree">("today");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<Id<"todos"> | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"todos"> | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addChildParent, setAddChildParent] = useState<Id<"todos"> | null>(null);
  const [addChildTitle, setAddChildTitle] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  // where the dragged row would land: sibling above/below, or nested (Alt-held drop)
  const [dropHint, setDropHint] = useState<{ id: string; pos: DropPos } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<Id<"todos"> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<{ snap: UndoSnapshot; ttl: number } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const newRootInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isSlashFocused, setIsSlashFocused] = useState(false);
  const [activeSuggestIdx, setActiveSuggestIdx] = useState(0);
  // open the mobile new-task sheet: root-level (from the nav +) or under a
  // parent — the edit UI's fields (TaskFields) adapted for creation
  const [composer, setComposer] = useState<TaskSheetMode | null>(null);
  // touch-first device (phone/tablet) — swaps keyboard-heavy affordances for
  // tap-first ones. Desktop unchanged.
  const isTouch = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true,
    []
  );

  const [nodes, setNodes] = useState<DecryptedNode[] | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set());

  const isLoading = todos === undefined;

  // The `todos` query re-fires on every mutation; decrypting every row again
  // each time is wasteful. Results are cached per payload (iv+ciphertext) and
  // the cache is dropped whenever the key changes.
  const decryptCacheRef = useRef(new Map<string, DecryptedNode>());
  const decryptKeyRef = useRef<CryptoKey | null>(null);

  useEffect(() => {
    if (todos === undefined) return;
    if (!key) {
      decryptKeyRef.current = null;
      decryptCacheRef.current.clear();
      setNodes(null);
      setDecryptError(null);
      setIsDecrypting(false);
      return;
    }
    if (decryptKeyRef.current !== key) {
      decryptKeyRef.current = key;
      decryptCacheRef.current.clear();
    }
    let cancelled = false;
    const misses = todos.filter((t) => !decryptCacheRef.current.has(cacheKeyFor(t)));
    if (misses.length === 0) {
      // fully cached — synchronous state update, no loading flash. A prior
      // run may still be in flight (it was cancelled); reset the flag here so
      // it can never stick true.
      setIsDecrypting(false);
      const results = todos.map((t) => decryptCacheRef.current.get(cacheKeyFor(t))!);
      const failed = results.some((r) => r.title === "— unable to decrypt —");
      setDecryptError(failed ? "wrong password or corrupted vault — some items could not be decrypted." : null);
      setNodes(results);
      return;
    }
    setIsDecrypting(true);
    setDecryptError(null);
    (async () => {
      try {
        await Promise.all(
          misses.map(async (t) => {
            let result: DecryptedNode;
            try {
              if (!t.ciphertext || !t.iv) throw new Error("row has no ciphertext");
              const plain = await cryptoDecNode(t.iv, t.ciphertext);
              if (plain.title.length > 200) throw new Error("title too long");
              result = {
                ...plain,
                // ensure order finite
                order: typeof plain.order === "number" && Number.isFinite(plain.order) ? plain.order : t._creationTime,
                _id: t._id,
                _creationTime: t._creationTime,
                _raw: { ciphertext: t.ciphertext, iv: t.iv },
              } satisfies DecryptedNode;
            } catch {
              result = {
                v: 2 as const,
                title: "— unable to decrypt —",
                isCompleted: false,
                parentId: null,
                order: t._creationTime,
                metadata: {},
                _id: t._id,
                _creationTime: t._creationTime,
                _raw: { ciphertext: t.ciphertext, iv: t.iv },
              } satisfies DecryptedNode;
            }
            // never cache after cancellation: the cache was cleared and
            // re-keyed when the effect re-ran (lock, key change) — an old run
            // writing here would poison it with wrong-key results
            if (cancelled) return;
            decryptCacheRef.current.set(cacheKeyFor(t), result);
          })
        );
        if (cancelled) return;
        const results = todos.map((t) => decryptCacheRef.current.get(cacheKeyFor(t))!);
        // detect if any decrypt failed
        const failed = results.some((r) => r.title === "— unable to decrypt —");
        if (failed) setDecryptError("wrong password or corrupted vault — some items could not be decrypted.");
        setNodes(results);
      } finally {
        // the rerun (cancelled this one) owns the flag: it either set it true
        // again or reset it on an early-return path
        if (!cancelled) setIsDecrypting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [todos, key, cryptoDecNode]);

  const tree = useMemo(() => {
    if (!nodes) return { roots: [] as TreeNode[], map: new Map<string, TreeNode>(), orphans: 0 };
    return buildTree(nodes);
  }, [nodes]);

  // ---- recurrence: windowed counts ----
  // wall clock ticks so occurrence windows roll over without a reload
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowTs(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const historyRecords = useQuery(api.history.list);
  const historyPut = useMutation(api.history.put);
  const historyRemove = useMutation(api.history.remove);
  type HistoryStore = { byTodo: Map<string, Map<number, number>>; idByTodo: Map<string, Id<"todoHistory">> };
  const [history, setHistory] = useState<HistoryStore | null>(null);
  // synchronous mirror of `history`: writes merge against this ref, not the
  // async state, so a write racing the list+decrypt load (or a rapid second
  // write) can't compute from a stale snapshot and duplicate/drop records
  const historyRef = useRef<HistoryStore | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!historyRecords || !key) {
        historyRef.current = null;
        if (!cancelled) setHistory(null);
        return;
      }
      const byTodo = new Map<string, Map<number, number>>();
      const idByTodo = new Map<string, Id<"todoHistory">>();
      await Promise.all(
        historyRecords.map(async (r) => {
          try {
            const json = await decryptString(key, r.iv, r.ciphertext);
            const data = decodeHistoryPayload(json);
            if (!data) return;
            byTodo.set(data.todoId, data.counts);
            idByTodo.set(data.todoId, r._id);
          } catch {}
        })
      );
      historyRef.current = { byTodo, idByTodo };
      if (!cancelled) setHistory(historyRef.current);
    })();
    return () => {
      cancelled = true;
    };
  }, [historyRecords, key]);

  // prune history records whose todo no longer exists — e.g. the todo was
  // deleted while history was still loading, so its record id was unknown and
  // the row leaked on the server (the id is inside the ciphertext, the server
  // cannot garbage-collect). One sweep per unlock.
  const historyPrunedRef = useRef(false);
  useEffect(() => {
    if (!nodes || !history || !key) return;
    if (historyPrunedRef.current) return;
    historyPrunedRef.current = true;
    const ids = new Set(nodes.map((n) => n._id as string));
    for (const [todoId, hid] of history.idByTodo) {
      if (!ids.has(todoId)) void historyRemove({ id: hid }).catch(() => {});
    }
  }, [nodes, history, key, historyRemove]);

  const [recurStates, setRecurStates] = useState<Map<string, RecurState> | null>(null);
  // negative tasks: the window that just ended (one level back) — drives the
  // holds section's confirm/failed rows
  const [priorWindows, setPriorWindows] = useState<Map<string, number | null> | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!nodes) {
        if (!cancelled) {
          setRecurStates(null);
          setPriorWindows(null);
        }
        return;
      }
      const m = new Map<string, RecurState>();
      const prior = new Map<string, number | null>();
      for (const n of nodes) {
        const rs = await recurState(n.metadata as PlainNode["metadata"], n._creationTime, nowTs);
        m.set(n._id as string, rs);
        if (isNegative(n.metadata as PlainNode["metadata"]) && rs.isRecurring) {
          prior.set(
            n._id as string,
            await prevWindowDay(String((n.metadata as PlainNode["metadata"]).recur), n._creationTime, rs.windowDay)
          );
        }
      }
      if (!cancelled) {
        setRecurStates(m);
        setPriorWindows(prior);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nodes, nowTs]);

  // ---- reminders: server sync + in-app firing ----
  // The client derives remindAt timestamps from decrypted metadata and syncs
  // the full desired set to the server (plaintext times only). Completing,
  // editing, deleting or un-deleting a task converges the rows automatically.
  const syncReminders = useMutation(api.push.syncReminders);
  const syncedSigRef = useRef<string | null>(null);
  useEffect(() => {
    if (!nodes || !key) {
      syncedSigRef.current = null;
      return;
    }
    const now = Date.now();
    const items: { todoId: Id<"todos">; remindAt: number }[] = [];
    for (const n of nodes) {
      const rs = recurStates?.get(n._id as string);
      const meta = n.metadata as PlainNode["metadata"];
      const done = rs?.isRecurring ? rs.count >= thresholdOf(meta) : n.isCompleted;
      for (const t of remindTimesFor(meta, done, now)) {
        items.push({ todoId: n._id, remindAt: t });
      }
    }
    items.sort((a, b) => (a.todoId < b.todoId ? -1 : a.todoId > b.todoId ? 1 : a.remindAt - b.remindAt));
    const sig = JSON.stringify(items);
    if (sig === syncedSigRef.current) return;
    syncedSigRef.current = sig;
    void syncReminders({ items }).catch(() => {
      syncedSigRef.current = null;
    });
  }, [nodes, recurStates, key, syncReminders]);

  const [remindToast, setRemindToast] = useState<{ title: string; lines: string[] } | null>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const recurStatesRef = useRef(recurStates);
  recurStatesRef.current = recurStates;

  // due-soon reminders fire on a 30s tick (app open); overdue tasks surface
  // when the tab is (re)focused — once per task per local day. Both read the
  // nodes/recurStates refs so the callbacks stay referentially stable and the
  // interval isn't churned by data updates.
  const checkDueSoon = useCallback(() => {
    const list = nodesRef.current;
    if (!list) return;
    const isDone = (n: { _id: string; isCompleted: boolean; metadata: PlainNode["metadata"] }) => {
      const rs = recurStatesRef.current?.get(n._id);
      if (rs?.isRecurring) return rs.count >= thresholdOf(n.metadata);
      return n.isCompleted;
    };
    const now = Date.now();
    const shown = loadShownReminders();
    const lines: string[] = [];
    const fired: string[] = [];
    for (const n of list) {
      const meta = n.metadata as PlainNode["metadata"];
      const dueAt = meta.dueAt ? normalizeDueAt(meta.dueAt) : null;
      if (!dueAt || !meta.reminder?.enabled || isDone(n)) continue;
      for (const off of reminderOffsets(meta)) {
        const at = dueInstant(dueAt, meta.dueTimeMin) - off * 60_000;
        if (at > now || at <= now - 5 * 60_000) continue;
        const k = reminderKey(n._id as string, at);
        if (shown.has(k)) continue;
        fired.push(k);
        lines.push(off === 0 ? `${n.title} — due now` : `${n.title} — due in ≤${off}m`);
      }
    }
    if (fired.length > 0) {
      markRemindersShown(fired, now);
      setRemindToast({ title: "reminders", lines });
    }
  }, []);
  const checkOverdue = useCallback(() => {
    const list = nodesRef.current;
    if (!list) return;
    const isDone = (n: { _id: string; isCompleted: boolean; metadata: PlainNode["metadata"] }) => {
      const rs = recurStatesRef.current?.get(n._id);
      if (rs?.isRecurring) return rs.count >= thresholdOf(n.metadata);
      return n.isCompleted;
    };
    const now = Date.now();
    const day = dayIndexLocal(now);
    const seen = overdueShownIds(day);
    const lines: string[] = [];
    const ids: string[] = [];
    for (const n of list) {
      const meta = n.metadata as PlainNode["metadata"];
      const dueAt = meta.dueAt ? normalizeDueAt(meta.dueAt) : null;
      if (!dueAt || dueAt > now || isDone(n)) continue;
      const id = n._id as string;
      if (seen.has(id)) continue;
      ids.push(id);
      lines.push(`${n.title} — was due ${new Date(dueAt).toLocaleString()}`);
    }
    if (ids.length > 0) {
      markOverdueShown(day, ids);
      setRemindToast({ title: "overdue", lines });
    }
  }, []);
  useEffect(() => {
    if (isLocked) return;
    const onVisible = () => {
      if (document.hidden) return;
      checkDueSoon();
      checkOverdue();
    };
    checkDueSoon();
    checkOverdue();
    const interval = window.setInterval(checkDueSoon, 30_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isLocked, checkDueSoon, checkOverdue]);

  // the tick effect's first run happens while nodes is still null — surface
  // overdue/due-soon as soon as the first decrypt lands instead of waiting
  // up to 30s
  useEffect(() => {
    if (isLocked || !nodes) return;
    checkDueSoon();
    checkOverdue();
  }, [isLocked, nodes, checkDueSoon, checkOverdue]);

  const listFlat = nodes ?? [];

  // ---- completed-task fade-away ----
  // Completing a task (check-off, tally/time reaching threshold, …) shows the
  // dash + grey immediately and fades the row away over 3s. While fading the
  // row stays rendered — and clickable to un-complete — even on the active
  // list; when the fade ends it disappears there and rests dimmed elsewhere.
  const fadingRef = useRef(fadingIds);
  fadingRef.current = fadingIds;
  const fadeTimersRef = useRef(new Map<string, number>());
  const seenCompletedRef = useRef<Set<string> | null>(null);

  function endFade(id: string) {
    fadeTimersRef.current.delete(id);
    setFadingIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  useEffect(() => {
    if (!nodes) {
      // locked/reset — drop any half-finished fades
      seenCompletedRef.current = null;
      for (const t of Array.from(fadeTimersRef.current.values())) window.clearTimeout(t);
      fadeTimersRef.current.clear();
      setFadingIds((prev) => (prev.size > 0 ? new Set<string>() : prev));
      return;
    }
    const completed = new Set(nodes.filter((n) => n.isCompleted).map((n) => n._id as string));
    const seen = seenCompletedRef.current;
    if (!seen) {
      // first observation after load/unlock — pre-existing completed rows rest
      // dimmed instead of animating a fade they finished long ago
      seenCompletedRef.current = completed;
      return;
    }
    const start: string[] = [];
    for (const id of Array.from(completed)) {
      if (!seen.has(id) && !fadingRef.current.has(id)) start.push(id);
    }
    const stop: string[] = [];
    for (const id of Array.from(fadingRef.current)) {
      if (!completed.has(id)) stop.push(id);
    }
    if (start.length > 0 || stop.length > 0) {
      setFadingIds((prev) => {
        const next = new Set(prev);
        let changed = false;
        for (const id of start) {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        }
        for (const id of stop) {
          if (next.has(id)) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      for (const id of start) {
        fadeTimersRef.current.set(id, window.setTimeout(() => endFade(id), FADE_MS));
      }
      // un-completed mid-fade: cancel the end timer
      for (const id of stop) {
        const t = fadeTimersRef.current.get(id);
        if (t !== undefined) {
          window.clearTimeout(t);
          fadeTimersRef.current.delete(id);
        }
      }
    }
    seenCompletedRef.current = completed;
  }, [nodes]);

  // If no input/textarea/select is focused, typing should go straight into the new-task box
  useEffect(() => {
    if (isLocked) return;
    function isTypingTarget(el: Element | null) {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if ((el as HTMLElement).isContentEditable) return true;
      return false;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // allow shortcuts / navigation keys
      if (e.key.length !== 1) return;
      // never hijack keystrokes while a modal/panel is up — dialogs autofocus
      // a button (not an input), so the target checks below pass and typed
      // characters would be swallowed into the hidden input behind the dialog
      if (notice || helpOpen || confirmDeleteId || selectedId) return;
      const target = e.target as Element | null;
      const active = document.activeElement as Element | null;
      if (isTypingTarget(target) || isTypingTarget(active)) return;
      const input = newRootInputRef.current;
      if (!input) return;
      e.preventDefault();
      input.focus();
      // Append the pressed key via React state; input is controlled by newRootTitle
      setNewRootTitle((prev) => prev + e.key);
      // ensure cursor at end after React renders
      requestAnimationFrame(() => {
        const len = input.value.length;
        try {
          input.setSelectionRange(len, len);
        } catch {}
      });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isLocked, notice, helpOpen, confirmDeleteId, selectedId]);

  // Ctrl/Cmd+F focuses the search field
  useEffect(() => {
    if (isLocked) return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        const active = document.activeElement as Element | null;
        if (active && (active.tagName === "TEXTAREA" || (active as HTMLElement).isContentEditable)) return;
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isLocked]);

  // filter helper for tree: keep node if matches or has matching descendant.
  // A plain function declaration (not useCallback) — it recurses via its own
  // hoisted binding.
  function matches(n: TreeNode): boolean {
    if (!search && filter === "all") return true;
    const s = search.trim().toLowerCase();
    const textMatch = !s || n.title.toLowerCase().includes(s) || (n.metadata.tags ?? []).join(" ").toLowerCase().includes(s);
    const statusMatch = filter === "all" || (filter === "active" && !n.isCompleted) || (filter === "completed" && n.isCompleted);
    if (textMatch && statusMatch) return true;
    // check descendants
    for (const c of n.children) if (matches(c)) return true;
    return false;
  }

  const decodedPath = useMemo(() => {
    try {
      return decodeURIComponent(pathname);
    } catch {
      return pathname;
    }
  }, [pathname]);

  const currentDirInfo = useMemo(() => {
    if (!nodes) return { id: null as Id<"todos"> | null, exists: false, parts: [] as string[] };
    // normalize: split, trim, filter empty (handles // and trailing slash)
    const parts = decodePathToParts(decodedPath);
    if (parts.length === 0) return { id: null, exists: true, parts };
    let parentId: string | null = null;
    let found: DecryptedNode | null = null;
    for (const title of parts) {
      found = findChildByTitle(nodes, parentId, title) ?? null;
      if (!found) return { id: null, exists: false, parts };
      parentId = found._id as string;
    }
    return { id: found!._id as Id<"todos">, exists: true, parts };
  }, [nodes, decodedPath]);

  const selectedNode = selectedId ? (tree.map.get(selectedId) ?? null) : null;

  const confirmNode = confirmDeleteId ? (tree.map.get(confirmDeleteId) ?? null) : null;
  const confirmCount = confirmNode ? collectDescendants(confirmNode).length : 0;

  const currentDirDepth = useMemo(() => {
    if (!currentDirInfo.id) return -1;
    return tree.map.get(currentDirInfo.id as string)?.depth ?? -1;
  }, [tree.map, currentDirInfo.id]);

  const visibleRoots = useMemo(() => {
    if (!currentDirInfo.exists) return [] as TreeNode[];
    if (currentDirInfo.id === null) return tree.roots;
    const dir = tree.map.get(currentDirInfo.id as string);
    return dir ? dir.children : [];
  }, [tree, currentDirInfo]);

  const pwdParts = useMemo(() => decodePathToParts(decodedPath), [decodedPath]);

  // pickable directories for the mobile composer: every node with children,
  // as a title path; root first, then alphabetical for scannability
  const dirOptions = useMemo(() => {
    const opts: string[][] = [[]];
    for (const t of tree.map.values()) {
      if (t.children.length) opts.push([...getAncestors(t._id, tree.map).map((a) => a.title), t.title]);
    }
    opts.sort((a, b) => a.join("/").localeCompare(b.join("/")));
    return opts;
  }, [tree]);

  // Change the URL without a reload (breadcrumbs, "!cd"). The popstate dance
  // ensures Next's usePathname syncs (pushState is patched but popstate helps in some builds).
  const pushPath = useCallback((decodedPath: string) => {
    window.history.pushState(null, "", encodePathForUrl(decodedPath));
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  const navigateToPwd = useCallback(
    (parts: string[]) => {
      pushPath(partsToDecodedPath(parts));
    },
    [pushPath]
  );

  // context handed to bang commands (!cd, !help) via the grammar registry.
  // Navigating while on the today view switches to the tree — you asked to be
  // somewhere, so show the tree.
  const commandCtx = useMemo<CommandContext>(
    () => ({
      currentPath: decodedPath,
      pushPath: (path: string) => {
        pushPath(path);
        setView("tree");
      },
      showHelp: () => setHelpOpen(true),
    }),
    [decodedPath, pushPath]
  );

  // jump from a today row to the task's directory in the tree view
  const jumpToDir = useCallback(
    (parts: string[]) => {
      navigateToPwd(parts);
      setView("tree");
    },
    [navigateToPwd]
  );

  const todayItems = useMemo(
    () => buildTodayItems(nodes, tree, recurStates, nowTs),
    [nodes, tree, recurStates, nowTs]
  );

  // ---- past-year carousel (today tab): one heatmap per task, "all" first ----
  // history records are authoritative; current-window counts from metadata /
  // recur state top them up in case history is still loading or a write behind
  const pastYearSlides = useMemo(() => {
    type Slide = PastYearSlide & { latest: number };
    const per: Slide[] = [];
    const all = new Map<number, number>();
    for (const n of nodes ?? []) {
      const id = n._id as string;
      const meta = n.metadata as PlainNode["metadata"];
      const m = new Map(history?.byTodo.get(id) ?? []);
      for (const [day, c] of Object.entries(meta.counts ?? {})) {
        if (typeof c === "number" && c > (m.get(Number(day)) ?? 0)) m.set(Number(day), c);
      }
      const rs = recurStates?.get(id);
      if (rs?.isRecurring && rs.count > (m.get(rs.windowDay) ?? 0)) m.set(rs.windowDay, rs.count);
      if (m.size === 0) continue;
      let latest = 0;
      for (const [day, c] of m) {
        if (c <= 0) continue;
        all.set(day, (all.get(day) ?? 0) + c);
        if (day > latest) latest = day;
      }
      per.push({ id, title: n.title, mode: modeOf(meta), counts: m, latest });
    }
    // most recently active task first; the aggregate slide always leads
    per.sort((a, b) => b.latest - a.latest || a.title.localeCompare(b.title));
    if (all.size > 0 && per.length > 1) per.unshift({ id: "all", title: "all tasks", mode: "check", counts: all, latest: 0 });
    return per;
  }, [nodes, history, recurStates]);

  // ---- negative tasks (holds section) ----
  // merged counts per node (history is authoritative, current-window metadata
  // and recur state top it up while writes/loads are in flight)
  const negCounts = useMemo(() => {
    const m = new Map<string, Map<number, number>>();
    for (const n of nodes ?? []) {
      const id = n._id as string;
      const meta = n.metadata as PlainNode["metadata"];
      const map = new Map(history?.byTodo.get(id) ?? []);
      for (const [day, c] of Object.entries(meta.counts ?? {})) {
        if (typeof c === "number" && c > (map.get(Number(day)) ?? 0)) map.set(Number(day), c);
      }
      const rs = recurStates?.get(id);
      if (rs?.isRecurring && rs.count > (map.get(rs.windowDay) ?? 0)) map.set(rs.windowDay, rs.count);
      m.set(id, map);
    }
    return m;
  }, [nodes, history, recurStates]);

  const holdItems = useMemo<HoldItem[] | null>(
    () => buildHoldItems({ nodes, tree, recurStates, priorWindows, counts: negCounts, nowTs }),
    [nodes, tree, recurStates, priorWindows, negCounts, nowTs]
  );

  // manual "held" confirm for a negative task's ended window — records the
  // confirmation in the encrypted metadata and celebrates with a toast
  async function handleConfirmHold(node: TreeNode, windowDay: number) {
    if (!key) return;
    const meta = node.metadata as PlainNode["metadata"];
    if (holdOf(meta, windowDay) !== undefined) return;
    const updated = withHold(meta, windowDay, Date.now());
    await handleUpdateMetadata(node._id, { holds: updated.holds });
    const slips = negCounts.get(node._id as string)?.get(windowDay) ?? 0;
    const tol = typeof meta.tol === "number" && Number.isFinite(meta.tol) ? Math.max(0, Math.floor(meta.tol)) : 0;
    const day = new Date(dayIndexToStart(windowDay)).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    setRemindToast({
      title: "held",
      lines: [
        `${node.title} — ${day} held ✓ (${slips === 0 ? "0 slips" : `${slips} slip${slips === 1 ? "" : "s"}, within tolerance of ${tol}`})`,
      ],
    });
  }

  // ---- daily ritual: miss streak + auto-habit meta-task (local, per device) ----
  // Reaching all clear is the ritual's completion: it records the day locally
  // (never-miss-twice nudge) and auto-checks the habit task, feeding its
  // heatmap as a side effect. All bookkeeping stays on the device.
  const [ritualMisses, setRitualMisses] = useState(0);
  // null = unknown until the local store is read (avoids offer flash for
  // devices that already declined)
  const [habitOfferGone, setHabitOfferGone] = useState<boolean | null>(null);
  const todayIdx = dayIndexLocal(nowTs);
  useEffect(() => {
    const s = openRitual(todayIdx);
    setRitualMisses(missedDays(todayIdx, s));
    setHabitOfferGone(s.habitOfferDismissed);
  }, [todayIdx]);

  // the auto-habit meta-task — flagged in metadata so renames keep it working
  const habitNode = useMemo(
    () => nodes?.find((n) => (n.metadata as PlainNode["metadata"]).habit === true) ?? null,
    [nodes]
  );
  const habitId = habitNode ? (habitNode._id as string) : null;
  const habitRs = habitId ? (recurStates?.get(habitId) ?? null) : null;
  const openToday = useMemo(() => (todayItems ? openCountOf(todayItems) : null), [todayItems]);

  // first-visit offer: no habit yet, not declined, and no root task already
  // named "open todosst" (avoid a duplicate crash on accept)
  const showHabitOffer = useMemo(() => {
    if (habitOfferGone !== false || habitNode) return false;
    return !nodes?.some((n) => (n.parentId ?? null) === null && n.title === HABIT_TITLE);
  }, [nodes, habitNode, habitOfferGone]);

  // intellisense: autocomplete for "/..." paths and "!cd ..." commands
  const slashComplete = useMemo(
    () => resolveSlashSuggest(newRootTitle, nodes, tree.roots, tree.map, decodedPath),
    [newRootTitle, nodes, tree, decodedPath]
  );

  useEffect(() => {
    setActiveSuggestIdx(0);
  }, [slashComplete.suggestions]);

  const applySlashSuggestion = useCallback(
    (title: string) => {
      let next: string;
      if (slashComplete.mode === "cd") {
        // keep "!cd" + whatever dir portion was typed (up to the last "/"), append the suggestion
        const m = /^!\s*cd/i.exec(newRootTitle);
        if (m) {
          const afterCd = newRootTitle.slice(m[0].length);
          const lastSlash = afterCd.lastIndexOf("/");
          next =
            lastSlash >= 0
              ? newRootTitle.slice(0, m[0].length) + afterCd.slice(0, lastSlash + 1) + title
              : newRootTitle.slice(0, m[0].length) + " " + title;
        } else {
          next = "!cd " + title;
        }
      } else {
        next = (slashComplete.dirPath || "") + "/" + title;
      }
      setNewRootTitle(next);
      setActiveSuggestIdx(0);
      requestAnimationFrame(() => newRootInputRef.current?.focus());
    },
    [newRootTitle, slashComplete]
  );

  // Shared creation core for grammar outcomes — used live by the input box
  // and on replay by the offline outbox, so path reuse/dedup/order behave
  // identically in both paths. Returns true when a create mutation was
  // actually issued; false for dedup drops, notices and no-ops. Throws on
  // failure so callers can decide between surfacing an error and parking
  // the input for offline replay. recentTitles carries titles created earlier
  // in the same drain — the tree snapshot is stale mid-drain (query push
  // lags the mutation ack), so dedup must consult it too.
  async function createForOutcome(
    outcome: InputOutcome,
    opts?: { parentId?: Id<"todos"> | null; recentTitles?: Set<string> }
  ): Promise<Id<"todos"> | null> {
    if (outcome.type === "create-slash") {
      if (!nodes) return null;
      // Build slash-separated hierarchy: each "/" segment may contain spaces.
      // e.g. "/host hackathon/outreach write email template" -> ["host hackathon","outreach write email template"]
      // Reuse existing nodes by exact title + parentId match; create missing.
      const slashParts = outcome.parts;
      let parentId: string | null = null;
      const maxOrderByParent = new Map<string | null, number>();
      for (const n of nodes) {
        const pid = n.parentId ?? null;
        const cur = maxOrderByParent.get(pid);
        if (cur === undefined || n.order > cur) maxOrderByParent.set(pid, n.order);
      }
      // virtualNodes includes newly created nodes for reuse within this slash operation
      const virtualNodes: DecryptedNode[] = [...nodes];
      const chainIds: string[] = [];
      let createdCount = 0;
      for (const [segIdx, title] of slashParts.entries()) {
        const existing = findChildByTitle(virtualNodes, parentId, title);
        if (existing) {
          parentId = existing._id as string;
          chainIds.push(parentId);
          continue;
        }
        const curMax = maxOrderByParent.get(parentId);
        const order = curMax !== undefined ? curMax + 1 : 0;
        maxOrderByParent.set(parentId, order);
        // recurrence + negative marker + structured metadata apply to the final segment of the path
        const isLast = segIdx === slashParts.length - 1;
        const metadata: PlainNode["metadata"] = isLast
          ? withReminderDefault({
              ...(outcome.metadata ?? {}),
              ...(outcome.neg ? { neg: true } : {}),
              ...(outcome.recur ? { recur: outcome.recur } : {}),
            })
          : {};
        const node = toPlainNode({ title, isCompleted: false, parentId: parentId as Id<"todos"> | null, order, metadata });
        const { ciphertext, iv } = await cryptoEncNode(node);
        const newId = await createTodo({ ciphertext, iv });
        virtualNodes.push({
          ...toPlainNode({ title, isCompleted: false, parentId, order, metadata }),
          _id: newId as Id<"todos">,
          _creationTime: Date.now(),
          _raw: { ciphertext, iv },
        } as DecryptedNode);
        chainIds.push(newId as string);
        parentId = newId as string;
        createdCount++;
      }
      if (createdCount === 0) {
        setNotice(DUPLICATE_MSG);
        return null;
      }
      // ensure all ancestors of newly created path are un-collapsed (visible)
      if (chainIds.length > 1) {
        setCollapsed((prev) => {
          const next = new Set(prev);
          for (let i = 0; i < chainIds.length - 1; i++) next.delete(chainIds[i]);
          return next;
        });
      }
      return (chainIds[chainIds.length - 1] ?? null) as Id<"todos"> | null;
    }
    if (outcome.type === "create-task") {
      // single task — creates in the current directory (pwd) unless replay
      // overrides the parent with the capture-time directory
      const title = outcome.title;
      if (title.length > 200) return null;
      const targetParentId =
        opts && "parentId" in opts ? (opts.parentId as Id<"todos"> | null) : (currentDirInfo.id as Id<"todos"> | null);
      const siblings = childrenOf(tree.roots, tree.map, targetParentId);
      const dedupKey = `${String(targetParentId ?? "root")}|${title}`;
      if (siblings.some((r) => r.title === title) || opts?.recentTitles?.has(dedupKey)) {
        setNotice(DUPLICATE_MSG);
        return null;
      }
      const order = siblings.length ? Math.max(...siblings.map((r) => r.order)) + 1 : 0;
      const node = toPlainNode({
        title,
        isCompleted: false,
        parentId: targetParentId,
        order,
        metadata: withReminderDefault({
          ...(outcome.metadata ?? {}),
          ...(outcome.neg ? { neg: true } : {}),
          ...(outcome.recur ? { recur: outcome.recur } : {}),
        }),
      });
      const { ciphertext, iv } = await cryptoEncNode(node);
      const newId = await createTodo({ ciphertext, iv });
      opts?.recentTitles?.add(dedupKey);
      return newId as Id<"todos">;
    }
    return null;
  }

  // Park a raw capture in the local outbox (vault-encrypted) and confirm via
  // toast. parts = the working-directory titles the capture was made under.
  async function parkCapture(raw: string, parts: string[]) {
    if (!key) return;
    let saved = false;
    try {
      saved = await outboxAddCapture(key, { input: raw, parts });
    } catch {}
    setRemindToast(
      saved
        ? { title: "captured offline", lines: [captureToastLine(raw)] }
        : { title: "capture not saved", lines: ["local storage is unavailable — try again once you're back online"] }
    );
    refreshPendingCaptures();
  }

  // Offline path for the main input: validate against the same limits the
  // online create path enforces (an unsyncable capture would just burn its
  // retry attempts), then park.
  async function captureOffline(raw: string, outcome: InputOutcome) {
    const tooLong =
      (outcome.type === "create-task" && outcome.title.length > 200) ||
      (outcome.type === "create-slash" && outcome.parts.some((p) => p.length > 200));
    if (tooLong) {
      setNotice("task titles are limited to 200 characters");
      return;
    }
    setNewRootTitle("");
    await parkCapture(raw, pwdParts);
  }

  // Replay one outbox entry through the grammar. Returns the decrypted input
  // (for the sync toast) or null when the entry is a no-op; throws on failure
  // (network, wrong key, corrupt row) so the caller can attempt-cap it.
  async function replayCapture(entry: OutboxEntry, recentTitles?: Set<string>): Promise<string | null> {
    if (!key || !nodes) throw new Error("vault not ready");
    const cap = await openCapture(key, entry.payload);
    const outcome = runInput(cap.input, {
      currentPath: "/",
      pushPath: () => {},
      showHelp: () => {},
    });
    if (outcome.type === "create-task") {
      // re-resolve the capture-time working directory against the current tree
      let parentId: string | null = null;
      let resolved = true;
      for (const part of cap.parts) {
        const found = findChildByTitle(nodes, parentId, part);
        if (!found) {
          resolved = false;
          break;
        }
        parentId = found._id as string;
      }
      if (resolved) {
        await createForOutcome(outcome, { parentId: parentId as Id<"todos"> | null, recentTitles });
      } else {
        // the directory vanished since capture — recreate the chain, task last
        await createForOutcome({
          type: "create-slash",
          parts: [...cap.parts, outcome.title],
          recur: outcome.recur,
          neg: outcome.neg,
        });
      }
      return cap.input;
    }
    if (outcome.type === "create-slash") {
      await createForOutcome(outcome);
      return cap.input;
    }
    // commands/unknown/ignored were never enqueued; drop defensively
    return null;
  }

  async function handleCreateRoot(e: React.FormEvent) {
    e.preventDefault();
    const raw = newRootTitle.trim();
    if (!raw || !key) return;
    // grammar registry decides: !commands run via ctx, creation forms return a plan
    const rawOutcome = runInput(raw, commandCtx);
    if (rawOutcome.type === "unknown-command") {
      setNotice(`unknown command: !${rawOutcome.name} (try !help)`);
      return;
    }
    if (rawOutcome.type === "ignored") {
      setNewRootTitle("");
      return;
    }
    // offline: !cd/!help already ran above (pure client-side); captures park
    // in the outbox and replay on the next unlocked+online open
    if (!online) {
      if (rawOutcome.type === "create-task" || rawOutcome.type === "create-slash") {
        await captureOffline(raw, rawOutcome);
        return;
      }
      setNewRootTitle("");
      return;
    }
    // a task typed inside a nonexistent directory (e.g. after a typo'd !cd)
    // resolves like an absolute slash path from root: the missing directory
    // chain is created and the task lands where the user is standing, instead
    // of silently falling back to root while the header still says "(not found)"
    const outcome: InputOutcome =
      rawOutcome.type === "create-task" && !currentDirInfo.exists && rawOutcome.title.length <= 200
        ? { type: "create-slash", parts: [...currentDirInfo.parts, rawOutcome.title], recur: rawOutcome.recur }
        : rawOutcome;
    if (outcome.type === "create-task" && outcome.title.length > 200) {
      setNotice("task titles are limited to 200 characters");
      return;
    }
    if (outcome.type === "create-slash" || outcome.type === "create-task") {
      let created = false;
      try {
        created = (await createForOutcome(outcome)) !== null;
      } catch (err) {
        // the connection dropped mid-capture — park the raw input instead of
        // losing the thought; replay reuses existing path nodes so a partial
        // create converges instead of duplicating
        if (isNetworkError(err)) {
          await captureOffline(raw, rawOutcome);
          return;
        }
        throw err;
      }
      // dedup drops and no-ops keep the text (same convention as before:
      // notice shown, input kept for fixing)
      if (!created) return;
    }
    setNewRootTitle("");
  }

  // Shared child-creation core for the inline input and the mobile composer
  // sheet: dedup, append order, encrypt, create, keep the parent un-collapsed.
  // Returns the new node id, or null when blocked (duplicate → notice shown).
  async function createChildNode(
    parentId: Id<"todos">,
    title: string,
    metadata: PlainNode["metadata"]
  ): Promise<Id<"todos"> | null> {
    const parent = tree.map.get(parentId);
    if (!parent || title.length > 200 || !key) return null;
    if (parent.children.some((c) => c.title === title)) {
      setNotice(DUPLICATE_MSG);
      return null;
    }
    const order = parent.children.length ? Math.max(...parent.children.map((c) => c.order)) + 1 : 0;
    const node = toPlainNode({ title, isCompleted: false, parentId, order, metadata });
    const { ciphertext, iv } = await cryptoEncNode(node);
    const newId = await createTodo({ ciphertext, iv });
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(parentId);
      return next;
    });
    return newId as Id<"todos">;
  }

  async function handleAddChild(parentId: Id<"todos">) {
    const rawChild = addChildTitle.trim();
    const parsed = parseNegInput(rawChild);
    const title = parsed.title;
    if (!title || title.length > 200 || !key) return;
    const parent = tree.map.get(parentId);
    if (!parent) return;
    const childParts = [...getAncestors(parentId, tree.map).map((a) => a.title), parent.title];
    // offline: park the raw input (replay re-resolves the directory chain)
    if (!online) {
      setAddChildTitle("");
      setAddChildParent(null);
      await parkCapture(rawChild, childParts);
      return;
    }
    try {
      const created = await createChildNode(
        parentId,
        title,
        withReminderDefault({
          ...(parsed.neg ? { neg: true } : {}),
          ...(parsed.ruleStr ? { recur: parsed.ruleStr } : {}),
        })
      );
      if (created === null) return; // duplicate — notice shown, keep the text
    } catch (err) {
      if (isNetworkError(err)) {
        setAddChildTitle("");
        setAddChildParent(null);
        await parkCapture(rawChild, childParts);
        return;
      }
      throw err;
    }
    setAddChildTitle("");
    setAddChildParent(null);
  }

  // Preset recurrence tokens the grammar understands (grammar.ts ~recur docs) —
  // the only recurrence forms an offline outbox capture can preserve.
  const PRESET_RECUR_TOKENS = ["~daily", "~weekdays", "~weekly", "~monthly", "~yearly"];

  // Map a RRULE string back to its grammar token when it matches a preset
  // (~daily …) — offline outbox captures store grammar input, so only preset
  // recurrence survives an offline park; custom rules need a connection.
  function recurTokenFor(ruleStr: string | null | undefined): string | null {
    if (!ruleStr) return null;
    return PRESET_RECUR_TOKENS.find((t) => parseRecurInput(t).ruleStr === ruleStr) ?? null;
  }

  // Mobile new-task sheet submission (the edit UI's fields, buffered). Bakes
  // the full draft metadata into the same outcomes the grammar input produces
  // (create-slash / create-task). Offline (and network-failure) captures park
  // the grammar-equivalent raw string — title, directory and preset recurrence
  // only; the sheet disables the other fields while offline since the grammar
  // can't encode them.
  async function submitSheet(draft: TaskDraft): Promise<boolean> {
    if (!key) return false;
    const ruleStr = draft.metadata.recur ?? null;
    const recurToken = recurTokenFor(ruleStr);
    // offline raw: grammar input the replay path can re-create (the "!"
    // negative marker rides the recurrence token, like the live input)
    const metadata: PlainNode["metadata"] = online
      ? withReminderDefault(draft.metadata)
      : recurToken
        ? { recur: ruleStr! }
        : {};
    const raw = recurToken
      ? `${draft.title} ${recurToken}${draft.metadata.neg ? " !" : ""}`
      : draft.title;

    if (composer && composer.kind === "create-child") {
      const parent = tree.map.get(composer.parentId);
      if (!parent) return false;
      const childParts = [...getAncestors(composer.parentId, tree.map).map((a) => a.title), parent.title];
      if (!online) {
        await parkCapture(raw, childParts);
        return true;
      }
      const created = await createChildNode(composer.parentId, draft.title, metadata).catch(async (err: unknown) => {
        // the connection dropped mid-create — park instead of losing the draft
        if (isNetworkError(err)) {
          await parkCapture(raw, childParts);
          return null;
        }
        throw err;
      });
      if (created !== null) return true;
      // duplicate → notice already shown and the sheet stays open
      return false;
    }

    const parts = draft.dirParts;
    if (draft.title.length > 200 || parts.some((p) => p.length > 200)) {
      setNotice("task titles are limited to 200 characters");
      return false;
    }
    const rawWithPath = [...parts, raw].join("/");
    if (!online) {
      await parkCapture(rawWithPath, parts);
      return true;
    }
    const outcome: InputOutcome = parts.length
      ? { type: "create-slash", parts: [...parts, draft.title], recur: ruleStr, metadata }
      : { type: "create-task", title: draft.title, recur: ruleStr, metadata };
    // the sheet's [] is an explicit root pick — override create-task's
    // current-directory fallback so "/" in the sheet means "/"
    const created = await createForOutcome(outcome, parts.length ? undefined : { parentId: null }).catch(
      async (err: unknown) => {
        if (isNetworkError(err)) {
          await parkCapture(rawWithPath, parts);
          return null;
        }
        throw err;
      }
    );
    if (created !== null) return true;
    return false;
  }

// the offered auto-habit meta-task: "open todosst ~daily" at root
  async function handleCreateHabit() {
    if (!key || !nodes) return;
    const { title, ruleStr } = parseRecurInput(`${HABIT_TITLE} ~daily`);
    if (!ruleStr || nodes.some((n) => (n.parentId ?? null) === null && n.title === title)) {
      setNotice(DUPLICATE_MSG);
      return;
    }
    const roots = childrenOf(tree.roots, tree.map, null);
    const order = roots.length ? Math.max(...roots.map((r) => r.order)) + 1 : 0;
    const node = toPlainNode({
      title,
      isCompleted: false,
      parentId: null,
      order,
      metadata: { recur: ruleStr, habit: true },
    });
    const { ciphertext, iv } = await cryptoEncNode(node);
    await createTodo({ ciphertext, iv });
  }

  function handleDismissHabitOffer() {
    dismissHabitOffer();
    setHabitOfferGone(true);
  }

  async function pushHistory(todoId: string, windowDay: number, count: number) {
    if (!key) return;
    const store = historyRef.current;
    // history not loaded yet (list pending or records mid-decrypt): a blind
    // insert would create a second record for this todo that the decrypt
    // merge can never reconcile — the todoId is inside the ciphertext, so the
    // later last-wins merge would silently drop one record's days. The count
    // still lives in the node's metadata; the next write re-merges fully.
    if (!store) return;
    const merged = new Map(store.byTodo.get(todoId) ?? []);
    if (count > 0) merged.set(windowDay, count);
    else merged.delete(windowDay);
    const payload = encodeHistoryPayload({ todoId, counts: merged });
    const { ciphertext, iv } = await encryptString(key, payload);
    const hid = store.idByTodo.get(todoId);
    const putId = await historyPut(hid ? { id: hid, ciphertext, iv } : { ciphertext, iv });
    // optimistic ref/state update so rapid successive writes merge instead of
    // each computing from the same pre-write snapshot
    const byTodo = new Map(store.byTodo);
    byTodo.set(todoId, merged);
    const idByTodo = new Map(store.idByTodo);
    if (!hid && putId) idByTodo.set(todoId, putId as Id<"todoHistory">);
    historyRef.current = { byTodo, idByTodo };
    setHistory(historyRef.current);
  }

  // recurStates loads in a separate async effect after nodes decrypt — clicks
  // racing that load must still credit the current recurrence window, not the
  // creation day. Falls back to computing the state on the fly (rule parse is
  // cached, so this is cheap).
  async function resolveRs(node: TreeNode | DecryptedNode): Promise<RecurState | undefined> {
    const cached = recurStates?.get(node._id as string);
    if (cached) return cached;
    const meta = node.metadata as PlainNode["metadata"];
    if (!meta.recur || !normalizeRruleString(String(meta.recur))) return undefined;
    return await recurState(meta, node._creationTime, Date.now());
  }

  // Write a new count for a node's window (recurring or tally mode). Node
  // metadata keeps only the current window; the full history record keeps
  // everything. targetDay credits a specific window.
  async function applyCountWrite(
    node: TreeNode,
    rs: RecurState | undefined,
    next: number,
    opts?: { targetDay?: number; metadata?: PlainNode["metadata"] }
  ) {
    if (!key || !nodes) return;
    const meta = opts?.metadata ?? (node.metadata as PlainNode["metadata"]);
    rs = rs ?? (await resolveRs(node));
    // an exhausted rule's final window is immutable history — never mutate it
    if (rs?.expired) {
      setNotice("this task's schedule has ended — its history is locked");
      return;
    }
    const creationDay = dayIndexLocal(node._creationTime);
    const windowDay = rs?.windowDay ?? creationDay;
    const targetDay = opts?.targetDay ?? windowDay;
    const clamped = Math.max(0, Math.min(Math.floor(next), COUNT_MAX));
    const isRecurring = rs?.isRecurring ?? !!meta.recur;
    // node metadata only carries the current window's count — a past-window
    // credit lives in the history record alone
    const counts = targetDay === windowDay ? { [String(targetDay)]: clamped } : { ...(meta.counts ?? {}) };
    const updated = toPlainNode(node, {
      isCompleted: isRecurring ? false : clamped >= thresholdOf(meta),
      metadata: { ...meta, counts },
    });
    const { ciphertext, iv } = await cryptoEncNode(updated);
    await updateTodo({ id: node._id, ciphertext, iv });
    await pushHistory(node._id as string, targetDay, clamped);
  }

  function currentCount(node: TreeNode, rs: RecurState | undefined): number {
    if (rs) return rs.count;
    const c = (node.metadata as PlainNode["metadata"]).counts?.[String(dayIndexLocal(node._creationTime))];
    return typeof c === "number" && Number.isFinite(c) && c > 0 ? Math.floor(c) : 0;
  }

  async function handleToggle(node: TreeNode) {
    if (!key) return;
    const meta0 = node.metadata as PlainNode["metadata"];
    const rs = await resolveRs(node);
    const isRecurring = rs?.isRecurring ?? !!meta0.recur;
    const mode = modeOf(meta0);
    if (isRecurring || mode !== "check") {
      // windowed count path — checkbox toggles threshold, tally increments
      await applyCountWrite(node, rs, nextCountOnClick(mode, currentCount(node, rs), thresholdOf(meta0)));
      return;
    }
    // plain checkbox task — same behavior as before, plus counts kept in sync
    // for lossless check<->tally mode switching later
    const targetDay = rs?.windowDay ?? dayIndexLocal(node._creationTime);
    const nextCount = node.isCompleted ? 0 : thresholdOf(meta0);
    const updated = toPlainNode(node, {
      isCompleted: !node.isCompleted,
      metadata: { ...meta0, counts: { [String(targetDay)]: nextCount } },
    });
    const { ciphertext, iv } = await cryptoEncNode(updated);
    await updateTodo({ id: node._id, ciphertext, iv });
    await pushHistory(node._id as string, targetDay, nextCount);
  }

  async function handleCountUp(node: TreeNode, delta = 1) {
    const rs = recurStates?.get(node._id as string);
    await applyCountWrite(node, rs, Math.min(currentCount(node, rs) + delta, COUNT_MAX));
  }

  async function handleCountDown(node: TreeNode, delta = 1) {
    const rs = recurStates?.get(node._id as string);
    await applyCountWrite(node, rs, Math.max(currentCount(node, rs) - delta, 0));
  }

  // Reaching all clear records the day and auto-checks the habit meta-task.
  // Signature-guarded so re-renders (30s tick, decrypt churn) never re-fire
  // it; a failed write resets the signature to retry on the next eligible run.
  const habitAutoSigRef = useRef<string | null>(null);
  const applyCountWriteRef = useRef(applyCountWrite);
  applyCountWriteRef.current = applyCountWrite;
  useEffect(() => {
    if (openToday === null || openToday > 0) return;
    const sig = `${todayIdx}|${habitId ?? "-"}|${habitRs ? String(habitRs.count) : "-"}`;
    if (habitAutoSigRef.current === sig) return;
    habitAutoSigRef.current = sig;
    recordClearDay(todayIdx);
    setRitualMisses(0);
    const tn = habitId ? tree.map.get(habitId) : null;
    if (!tn || !habitRs?.isRecurring || habitRs.expired) return;
    const th = thresholdOf(tn.metadata as PlainNode["metadata"]);
    if (habitRs.count >= th) return;
    applyCountWriteRef.current(tn, habitRs, th).catch(() => {
      habitAutoSigRef.current = null;
    });
  }, [openToday, todayIdx, habitId, habitRs, tree.map]);

  function startEdit(node: TreeNode) {
    setEditingId(node._id);
    setEditValue(node.title);
  }

  async function commitEdit(id: Id<"todos">) {
    const v = editValue.trim();
    if (!v || v.length > 200 || !key) {
      setEditingId(null);
      return;
    }
    const cur = nodes?.find((n) => n._id === id);
    if (!cur) {
      setEditingId(null);
      return;
    }
    if (v !== cur.title && nodes?.some((n) => n._id !== id && (n.parentId ?? null) === (cur.parentId ?? null) && n.title === v)) {
      setNotice(DUPLICATE_MSG);
      return;
    }
    const updated = toPlainNode(cur, { title: v });
    const { ciphertext, iv } = await cryptoEncNode(updated);
    await updateTodo({ id, ciphertext, iv });
    setEditingId(null);
  }

  async function handleDelete(node: TreeNode) {
    // capture a restorable snapshot of the subtree before purging
    const snapNodes: UndoSnapshot["nodes"] = [];
    const walk = (n: TreeNode) => {
      snapNodes.push({
        oldId: n._id as string,
        plain: toPlainNode(n),
      });
      for (const c of n.children) walk(c);
    };
    walk(node);
    const snapHistory: UndoSnapshot["history"] = [];
    for (const { oldId } of snapNodes) {
      const counts = history?.byTodo.get(oldId);
      if (counts && counts.size > 0) {
        snapHistory.push({ oldId, counts: Array.from(counts.entries()) });
      }
    }

    const ids = collectDescendants(node);
    // purge history records for every deleted node that had one
    const historyIds: Id<"todoHistory">[] = [];
    for (const id of ids) {
      const hid = history?.idByTodo.get(id as string);
      if (hid) historyIds.push(hid);
    }
    // single op if only self
    if (ids.length === 1) {
      await removeTodo({ id: node._id });
    } else {
      // bulk delete of the subtree (client-computed ids)
      await removeMany({ ids });
    }
    await Promise.all(historyIds.map((hid) => historyRemove({ id: hid })));
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    // deleting the auto-habit task also dismisses the first-visit offer
    if (snapNodes.some((s) => s.plain.metadata.habit === true)) {
      dismissHabitOffer();
      setHabitOfferGone(true);
    }
    setConfirmDeleteId(null);
    setUndoState({ snap: { nodes: snapNodes, history: snapHistory, count: ids.length }, ttl: UNDO_TTL_SECONDS });
  }

  // Recreate the deleted subtree with fresh ids: parents first so child
  // parentIds can be remapped; history records are re-keyed to the new ids.
  // A failed create (e.g. the 8KB payload limit) keeps the un-restored
  // remainder in the undo toast instead of silently dropping the rest of the
  // subtree — the toast countdown restarts and undo can be retried.
  async function handleUndo() {
    const snap = undoState?.snap;
    if (!snap || !key) {
      setUndoState(null);
      return;
    }
    const idMap = new Map<string, Id<"todos">>();
    for (const { oldId, plain } of snap.nodes) {
      // parents appear before children in snap.nodes, so an id missing from
      // idMap means the parent survived the delete — keep its original id
      // rather than dropping the link (which would orphan the node at root)
      const restored = toPlainNode(plain, {
        parentId: plain.parentId ? (idMap.get(plain.parentId) ?? (plain.parentId as Id<"todos">)) : null,
      });
      try {
        const { ciphertext, iv } = await cryptoEncNode(restored);
        const newId = await createTodo({ ciphertext, iv });
        idMap.set(oldId, newId as Id<"todos">);
      } catch {
        setNotice("undo stopped partway — press undo again to retry the rest");
        break;
      }
    }
    for (const h of snap.history) {
      const newId = idMap.get(h.oldId);
      if (!newId) continue;
      try {
        const payload = encodeHistoryPayload({
          todoId: newId as string,
          counts: new Map(h.counts),
        });
        const { ciphertext, iv } = await encryptString(key, payload);
        await historyPut({ ciphertext, iv });
      } catch {
        // history restore is best-effort; node data matters more
      }
    }
    const remainingNodes = snap.nodes.filter((n) => !idMap.has(n.oldId));
    if (remainingNodes.length > 0) {
      setUndoState({
        snap: {
          nodes: remainingNodes,
          history: snap.history.filter((h) => !idMap.has(h.oldId)),
          count: remainingNodes.length,
        },
        ttl: UNDO_TTL_SECONDS,
      });
    } else {
      setUndoState(null);
    }
  }

  // undo toast countdown
  const undoSnap = undoState?.snap ?? null;
  useEffect(() => {
    if (!undoSnap) return;
    const interval = window.setInterval(() => {
      setUndoState((s) => {
        if (!s) return null;
        if (s.ttl <= 1) {
          window.clearInterval(interval);
          return null;
        }
        return { ...s, ttl: s.ttl - 1 };
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [undoSnap]);

  // key changed (locked/unlocked/re-derived) — plaintext snapshot may no longer
  // round-trip with the new key, drop it; re-arm the history orphan sweep
  useEffect(() => {
    setUndoState(null);
    historyPrunedRef.current = false;
  }, [key]);

  async function handleUpdateMetadata(id: Id<"todos">, patch: Partial<PlainNode["metadata"]>) {
    if (!key || !nodes) return;
    const cur = nodes.find((n) => n._id === id);
    if (!cur) return;
    let metadata: PlainNode["metadata"] = { ...cur.metadata, ...patch };
    let isCompleted = cur.isCompleted;
    // plain task switching mode/threshold: keep rendered state stable.
    // storage is always counts — checkbox rendering just compares count >= threshold.
    if (!metadata.recur && ("mode" in patch || "threshold" in patch)) {
      const windowDay = dayIndexLocal(cur._creationTime);
      const c = metadata.counts?.[String(windowDay)] ?? 0;
      const th = thresholdOf(metadata);
      if ((patch.mode === "count" || patch.mode === "time") && c === 0 && cur.isCompleted) {
        // seed the tally from the checked state so nothing visually changes
        // (time mode seeds the goal as minutes; count mode without a goal seeds 1)
        metadata = { ...metadata, counts: { ...metadata.counts, [String(windowDay)]: Number.isFinite(th) ? th : 1 } };
      } else if (metadata.counts) {
        isCompleted = (metadata.counts[String(windowDay)] ?? 0) >= th;
      }
    }
    const updated = toPlainNode(cur, { isCompleted, metadata });
    const { ciphertext, iv } = await cryptoEncNode(updated);
    await updateTodo({ id, ciphertext, iv });
    // push seeded counts into the history record too
    if (metadata.counts && !metadata.recur) {
      const windowDay = dayIndexLocal(cur._creationTime);
      const before = cur.metadata.counts?.[String(windowDay)] ?? 0;
      const after = metadata.counts[String(windowDay)] ?? 0;
      if (before !== after) await pushHistory(id as string, windowDay, after);
    }
  }

  async function handleMove(draggedId: string, targetParentId: string | null, targetIndex: number) {
    if (!key || !nodes) return;
    const dragged = nodes.find((n) => n._id === draggedId);
    if (!dragged) return;
    // cycle check: target cannot be descendant of dragged
    const draggedTree = tree.map.get(draggedId);
    if (draggedTree) {
      const desc = new Set(collectDescendants(draggedTree).map(String));
      if (targetParentId && desc.has(targetParentId)) {
        setNotice("cannot move a task into its own sub-task");
        return;
      }
    }
    if (draggedId === targetParentId) return;
    // compute new order fractional
    const siblings = childrenOf(tree.roots, tree.map, targetParentId);
    // siblings excluding dragged if same parent
    const filtered = siblings.filter((s) => s._id !== draggedId);
    if (filtered.some((s) => s.title === dragged.title)) {
      setNotice(`${DUPLICATE_MSG} at the destination`);
      return;
    }
    let newOrder: number;
    if (filtered.length === 0) newOrder = 0;
    else if (targetIndex <= 0) newOrder = filtered[0].order - 1;
    else if (targetIndex >= filtered.length) newOrder = filtered[filtered.length - 1].order + 1;
    else newOrder = (filtered[targetIndex - 1].order + filtered[targetIndex].order) / 2;

    const updated = toPlainNode(dragged, { parentId: targetParentId, order: newOrder });
    const { ciphertext, iv } = await cryptoEncNode(updated);
    await updateTodo({ id: dragged._id as Id<"todos">, ciphertext, iv });
    if (targetParentId) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(targetParentId);
        return next;
      });
    }
  }

  function toggleExpanded(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Auto-dismiss delete confirmation after 5s, with visible countdown
  const [confirmCountdown, setConfirmCountdown] = useState(5);
  useEffect(() => {
    if (!confirmDeleteId) return;
    setConfirmCountdown(5);
    const interval = window.setInterval(() => {
      setConfirmCountdown((s) => {
        if (s <= 1) {
          window.clearInterval(interval);
          setConfirmDeleteId(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [confirmDeleteId]);

  // Esc cancels delete confirmation
  useEffect(() => {
    if (!confirmDeleteId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmDeleteId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmDeleteId]);

  // ---- offline capture outbox ----
  // Captures made offline replay here: FIFO, only when the vault is unlocked
  // and the connection is back. Each raw input re-runs through the grammar
  // (createForOutcome), so path resolution, node reuse and dedup apply
  // exactly as they did live; failures count against a retry cap instead of
  // looping forever.
  const [pendingCaptures, setPendingCaptures] = useState<OutboxEntry[]>([]);
  const refreshPendingCaptures = useCallback(() => {
    void outboxList()
      .then(setPendingCaptures)
      .catch(() => {});
  }, []);
  // refresh on unlock/connectivity flips and on re-focus (the subway case:
  // come back to the app, the queue syncs without a reload)
  useEffect(() => {
    refreshPendingCaptures();
    const onVisible = () => {
      if (!document.hidden) refreshPendingCaptures();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshPendingCaptures, online, key]);

  const drainingRef = useRef(false);
  const deadNotifiedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!online || !key || !nodes || isDecrypting) return;
    if (pendingCaptures.length === 0 || drainingRef.current) return;
    drainingRef.current = true;
    void (async () => {
      try {
        const entries = await outboxList();
        // let the reconnect settle before replaying: buffered mutations flush
        // and the query push delivers fresh rows — replaying against a stale
        // tree snapshot would double-create same-title captures
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const recentTitles = new Set<string>();
        const synced: string[] = [];
        for (const entry of entries) {
          if (entry.attempts >= OUTBOX_MAX_ATTEMPTS) continue;
          try {
            const text = await replayCapture(entry, recentTitles);
            await outboxDelete(entry.id);
            if (text !== null) synced.push(text);
          } catch {
            // server likely still unreachable — keep the entry, retry on the
            // next trigger (reconnect, unlock, re-focus, data change)
            await outboxMarkAttempt(entry.id).catch(() => {});
            break;
          }
        }
        if (synced.length > 0) {
          refreshPendingCaptures();
          setRemindToast({
            title: `offline capture${synced.length !== 1 ? "s" : ""} synced`,
            lines: synced.map(clippedLine),
          });
        }
        const dead = entries.filter((e) => e.attempts >= OUTBOX_MAX_ATTEMPTS);
        const newDead = dead.filter((d) => !deadNotifiedRef.current.has(d.id));
        if (newDead.length > 0) {
          for (const d of newDead) deadNotifiedRef.current.add(d.id);
          setRemindToast({
            title: "offline capture stuck",
            lines: [
              `${newDead.length} capture${newDead.length !== 1 ? "s" : ""} couldn't sync after several tries — kept in this browser`,
            ],
          });
        }
      } finally {
        drainingRef.current = false;
      }
    })();
    // replayCapture is a render-scope closure over nodes/tree/key — all
    // already deps here (tree derives from nodes); adding its identity would
    // re-run this effect on every render. drainingRef makes reruns harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, key, nodes, isDecrypting, pendingCaptures, refreshPendingCaptures]);

  if (isLocked) {
    if (!isReady) return <p className="text-sm opacity-60">preparing vault…</p>;
    return <UnlockScreen />;
  }

  // Bundle of state/handlers for the module-level row renderer (stable component
  // type — no remount of the task tree on re-render).
  const fadeToZero = filter === "active";
  const rowCtx: RowCtx = {
    tree,
    matches,
    recurStates,
    collapsed,
    search,
    editingId,
    editValue,
    setEditValue,
    selectedId,
    addChildParent,
    addChildTitle,
    dragId,
    dropHint,
    fadingIds,
    fadeToZero,
    confirmDeleteId,
    currentDirDepth,
    currentCount,
    handleToggle,
    handleCountUp,
    handleCountDown,
    handleMove,
    handleAddChild,
    commitEdit,
    startEdit,
    setEditingId,
    setSelectedId,
    setAddChildParent,
    setAddChildTitle,
    setConfirmDeleteId,
    toggleExpanded,
    setDragId,
    setDropHint,
    navigateToPwd,
    isTouch,
    openChildComposer: (parentId, parentTitle) =>
      setComposer({ kind: "create-child", parentId, parentTitle }),
  };

  return (
    <div className="w-full max-w-[720px] bg-background pb-[calc(3rem+env(safe-area-inset-bottom))] md:border md:border-foreground md:pb-0">
      <div className="flex items-center justify-between border-b border-foreground px-3 py-2 text-xs">
        <span className="flex flex-1 items-center gap-2">
          <span>E2E Encrypted</span>
          {!online && <span className="opacity-40">· offline</span>}
          {pendingCaptures.length > 0 && (
            <span className="opacity-40" title="captured offline — syncs when you're back online">
              · {pendingCaptures.length} offline capture{pendingCaptures.length !== 1 ? "s" : ""}
            </span>
          )}
        </span>
        <span className="hidden items-center gap-3 md:flex">
          <button
            onClick={() => setView("today")}
            className={view === "today" ? "underline underline-offset-4" : "opacity-60 hover:opacity-100"}
          >
            today
          </button>
          <button
            onClick={() => setView("tree")}
            className={view === "tree" ? "underline underline-offset-4" : "opacity-60 hover:opacity-100"}
          >
            tree
          </button>
        </span>
        <span className="flex flex-1 items-center justify-end gap-3">
          {hasRemembered && (
            <button
              onClick={() => {
                clearStoredKey();
                setHasRemembered(false);
              }}
              className="opacity-60 hover:opacity-100 underline underline-offset-4"
              title="remove locally stored key — you will need password next time"
            >
              forget device
            </button>
          )}
          <button
            onClick={() => {
              lock();
            }}
            className="opacity-60 hover:opacity-100 underline underline-offset-4"
          >
            lock
          </button>
        </span>
      </div>

      <InstallHint />

      {/* breadcrumb path — clickable: each segment -> that dir (tree view only) */}
      {view === "tree" && (
        <div className="flex items-center gap-2 border-b border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-xs overflow-x-auto">
        <span className="font-mono flex items-center gap-1 truncate">
          <button onClick={() => navigateToPwd([])} className="hover:underline hover:opacity-100" title="go to root">
            /
          </button>
          {pwdParts.map((part, idx) => (
            <span key={`${part}-${idx}`} className="flex items-center gap-1">
              {idx > 0 && <span className="opacity-20">/</span>}
              <button
                onClick={() => navigateToPwd(pwdParts.slice(0, idx + 1))}
                className="hover:underline hover:opacity-100 truncate max-w-[160px]"
                title={part}
              >
                {part}
              </button>
            </span>
          ))}
        </span>
        {!currentDirInfo.exists && decodedPath !== "/" && <span className="opacity-40 shrink-0">(not found)</span>}
        </div>
      )}

      {/* top controls — desktop-width only; below md, the nav "+" sheet is the only create affordance */}
      <div className="hidden flex-wrap gap-2 border-b border-foreground p-3 md:flex">
      <form onSubmit={handleCreateRoot} className="flex flex-1 items-center gap-2">
        <div className="flex-1 relative">
          <input
            ref={newRootInputRef}
            autoFocus={!isTouch}
            value={newRootTitle}
            onChange={(e) => setNewRootTitle(e.target.value)}
            onFocus={() => setIsSlashFocused(true)}
            onBlur={() => setTimeout(() => setIsSlashFocused(false), 150)}
            onKeyDown={(e) => {
              if (!isSlashFocused || slashComplete.suggestions.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveSuggestIdx((i) => (i + 1) % slashComplete.suggestions.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveSuggestIdx((i) => (i - 1 + slashComplete.suggestions.length) % slashComplete.suggestions.length);
              } else if (e.key === "Enter" || e.key === "Tab") {
                const chosen = slashComplete.suggestions[activeSuggestIdx];
                // if exact match, let Enter submit instead of re-applying same value
                if (e.key === "Enter" && chosen && chosen.title.toLowerCase() === slashComplete.prefix.toLowerCase() && slashComplete.prefix.length > 0) {
                  setIsSlashFocused(false);
                  return;
                }
                // autocomplete active suggestion instead of submitting
                e.preventDefault();
                if (chosen) applySlashSuggestion(chosen.title);
              } else if (e.key === "Escape") {
                setIsSlashFocused(false);
              }
            }}
            maxLength={500}
            className="w-full bg-transparent py-1 text-sm placeholder:text-foreground/40 focus:outline-none"
          />
          {newRootTitle === "" && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 select-none overflow-hidden whitespace-nowrap py-1 text-sm text-foreground/40"
            >
              <TypewriterPlaceholder phrases={PLACEHOLDER_PHRASES} active={newRootTitle === ""} />
            </span>
          )}
          {isSlashFocused && slashComplete.suggestions.length > 0 && slashComplete.mode !== "none" && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[200px] overflow-auto border border-foreground bg-background shadow-sm">
              <div className="px-2 py-1 text-[10px] opacity-40 border-b border-foreground/10">
                {slashComplete.mode === "cd" ? "cd " : ""}
                {slashComplete.dirPath || "/"} — {slashComplete.suggestions.length} match{slashComplete.suggestions.length !== 1 ? "es" : ""} • tab/enter • ↑↓
              </div>
              {slashComplete.suggestions.map((s, idx) => {
                const isActive = idx === activeSuggestIdx;
                const prefixLower = slashComplete.prefix.toLowerCase();
                const titleLower = s.title.toLowerCase();
                const matchLen = prefixLower && titleLower.startsWith(prefixLower) ? slashComplete.prefix.length : 0;
                return (
                  <button
                    key={s._id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applySlashSuggestion(s.title);
                    }}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs ${isActive ? "bg-foreground text-background" : "hover:bg-foreground/10"}`}
                  >
                    <span className={`truncate ${isActive ? "" : ""}`}>
                      {matchLen > 0 ? (
                        <>
                          <span className={isActive ? "opacity-60" : "opacity-40"}>{s.title.slice(0, matchLen)}</span>
                          <span className="font-medium">{s.title.slice(matchLen)}</span>
                        </>
                      ) : (
                        <span className="font-medium">{s.title}</span>
                      )}
                    </span>
                    <span className={`ml-auto shrink-0 text-[10px] ${isActive ? "opacity-60" : "opacity-30"}`}>{s.children.length ? `${s.children.length} child${s.children.length !== 1 ? "ren" : ""}` : "leaf"}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button type="submit" disabled={!newRootTitle.trim()} className="text-sm underline underline-offset-4 hover:opacity-60 disabled:opacity-20 shrink-0">
          add task
        </button>
      </form>
      </div>

      {view === "tree" && (
        <div className="flex flex-wrap gap-2 border-b border-foreground/10 px-3 py-2 text-xs">
          <input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.currentTarget.blur();
              }
            }}
            placeholder="search titles/tags…"
            className="flex-1 min-w-[140px] bg-transparent py-1 placeholder:text-foreground/40 focus:outline-none"
          />
          <span className="flex gap-2 items-center">
            {(["all", "active", "completed"] as Filter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={filter === f ? "underline underline-offset-4" : "opacity-60 hover:opacity-100"}>
                {f}
              </button>
            ))}
          </span>
        </div>
      )}

      {view === "today" ? (
        <TodayView
          items={todayItems}
          holds={holdItems}
          nowTs={nowTs}
          map={tree.map}
          slides={pastYearSlides}
          misses={ritualMisses}
          showHabitOffer={showHabitOffer}
          onCreateHabit={() => void handleCreateHabit()}
          onDismissHabitOffer={handleDismissHabitOffer}
          onToggle={handleToggle}
          onCountUp={handleCountUp}
          onCountDown={handleCountDown}
          onSelect={(node) => setSelectedId(node._id)}
          onJump={jumpToDir}
          onSlip={(node) => void handleCountUp(node)}
          onUndoSlip={(node) => void handleCountDown(node)}
          onConfirmHold={(node, windowDay) => void handleConfirmHold(node, windowDay)}
        />
      ) : (
      <>
      {/* drag hint */}
      <div
        className="min-h-[180px]"
        onDragOver={(e) => {
          if (dragId) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (!dragId) return;
          // drop on empty area — move to current directory (root or pwd)
          if (!currentDirInfo.exists) {
            setNotice("cannot move into a nonexistent directory");
            setDragId(null);
            return;
          }
          const targetParentId = currentDirInfo.id as string | null;
          const dragged = nodes?.find((n) => n._id === dragId);
          if (dragged && (dragged.parentId ?? null) !== targetParentId) {
            const siblings = childrenOf(tree.roots, tree.map, targetParentId);
            handleMove(dragId, targetParentId, siblings.length);
          }
          setDragId(null);
        }}
      >
        {isLoading || isDecrypting ? (
          <p className="px-3 py-8 text-sm opacity-60">loading…</p>
        ) : listFlat.length === 0 ? (
          <div className="px-3 py-12 text-sm">
            <p>no tasks. add a top-level task.</p>
          </div>
        ) : !currentDirInfo.exists ? (
          <p className="px-3 py-8 text-sm opacity-60">directory not found.</p>
        ) : visibleRoots.length === 0 ? (
          <div className="px-3 py-8 text-sm opacity-60">
            {currentDirInfo.id === null ? "no matching tasks." : "empty — add a task in this directory."}
          </div>
        ) : decryptError ? (
          <div className="border-b border-foreground bg-background px-3 py-2 text-xs">{decryptError}</div>
        ) : null}

        {!isLoading && !isDecrypting && listFlat.length > 0 && currentDirInfo.exists && visibleRoots.length > 0 && (
          <ul>
            {visibleRoots.map((root) => (
              <RenderNode key={root._id} node={root} ctx={rowCtx} />
            ))}
          </ul>
        )}
      </div>
      </>
      )}

      {confirmNode && (
        <DeleteConfirmDialog
          node={confirmNode}
          nestedCount={confirmCount}
          countdown={confirmCountdown}
          onClose={() => setConfirmDeleteId(null)}
          onDelete={() => handleDelete(confirmNode)}
        />
      )}

      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}

      {notice && <NoticeDialog message={notice} onClose={() => setNotice(null)} />}

      {undoState && (
        <UndoToast
          snap={undoState.snap}
          ttl={undoState.ttl}
          onUndo={handleUndo}
          onDismiss={() => setUndoState(null)}
        />
      )}

      {remindToast && <ReminderToast title={remindToast.title} lines={remindToast.lines} onClose={() => setRemindToast(null)} />}

      {selectedNode && (
        <MetadataPanel
          key={selectedNode._id}
          node={selectedNode}
          onUpdateMetadata={handleUpdateMetadata}
          onClose={() => setSelectedId(null)}
          nowTs={nowTs}
          historyCounts={history?.byTodo.get(selectedNode._id as string) ?? null}
        />
      )}

      {composer && (
        <TaskSheet
          mode={composer}
          dirOptions={dirOptions}
          online={online}
          nowTs={nowTs}
          onClose={() => setComposer(null)}
          onSubmit={submitSheet}
        />
      )}

      <BottomNav
        view={view}
        setView={setView}
        onAdd={() =>
          setComposer({
            kind: "create",
            initialDirParts: pwdParts,
            // today tab: a fresh capture is a today task — prefill the due
            // date with local midnight so it lands in the today list
            initialDueAt: view === "today" ? dayIndexToStart(dayIndexLocal(nowTs)) : null,
          })
        }
      />
      </div>
  );
}

function BottomNav({
  view,
  setView,
  onAdd,
}: {
  view: "today" | "tree";
  setView: (v: "today" | "tree") => void;
  onAdd: () => void;
}) {
  const tabs = [
    { id: "today" as const, label: "today" },
    { id: "tree" as const, label: "tree" },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-foreground bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      {tabs.slice(0, 1).map((t) => (
        <button
          key={t.id}
          onClick={() => setView(t.id)}
          className={`flex-1 py-3 text-xs ${view === t.id ? "underline underline-offset-4" : "opacity-60"}`}
        >
          {t.label}
        </button>
      ))}
      <button
        onClick={onAdd}
        aria-label="new task"
        className="border-x border-foreground/10 px-8 py-3 text-base leading-none hover:opacity-80"
      >
        +
      </button>
      {tabs.slice(1).map((t) => (
        <button
          key={t.id}
          onClick={() => setView(t.id)}
          className={`flex-1 py-3 text-xs ${view === t.id ? "underline underline-offset-4" : "opacity-60"}`}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}

export function TodoApp() {
  const online = useOnline();
  const [offlineBootstrapped, setOfflineBootstrapped] = useState(false);
  const isAuthed = useQuery(api.auth.isAuthenticated);
  // register the service worker on every visit — it backs both the push
  // subscription (PushAutoEnable) and the offline shell cache
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  // Offline fresh open: the auth/salt queries can never resolve, so the auth
  // gate would hang on "loading…" forever. With a remembered vault key the
  // app can boot straight into the capture UI (EncryptionContext unlocks
  // offline from the same key); once online, the auth gate takes over again.
  useEffect(() => {
    if (isAuthed === false) {
      // signed out for real (valid token check while online) — back to the gate
      setOfflineBootstrapped(false);
      return;
    }
    if (offlineBootstrapped || online) return;
    if (getRememberedKey()) setOfflineBootstrapped(true);
  }, [online, offlineBootstrapped, isAuthed]);
  if (offlineBootstrapped) return <TodoTask />;
  return (
    <>
      <AuthLoading>
        <p className="text-sm opacity-60">loading…</p>
      </AuthLoading>
      <Unauthenticated>
        <AuthForm />
      </Unauthenticated>
      <Authenticated>
        <TodoTask />
        <PushAutoEnable />
        <DailyNudgeSync />
      </Authenticated>
    </>
  );
}
