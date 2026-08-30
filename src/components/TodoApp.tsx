"use client";
/* eslint-disable react-hooks/set-state-in-effect -- decrypt/history/timer-driven
   state sync in effects is inherent to the encrypted vault lifecycle here;
   same tradeoff as EncryptionContext.tsx */

import { useState, useEffect, useMemo, useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { AuthForm } from "./AuthForm";
import { useEncryption, getRememberedKey } from "./EncryptionContext";
import type { PlainNode } from "@/lib/crypto";
import { encryptString, decryptString, toPlainNode } from "@/lib/crypto";
import { usePathname } from "next/navigation";
import { decodePathToParts, encodePathForUrl, partsToDecodedPath } from "@/lib/cdPath";
import { runInput, type CommandContext } from "@/lib/grammar";
import {
  COUNT_MAX,
  dayIndexLocal,
  decodeHistoryPayload,
  encodeHistoryPayload,
  formatMinutes,
  modeOf,
  nextCountOnClick,
  parseRecurInput,
  recurState,
  stepOf,
  thresholdOf,
} from "@/lib/recur";
import type { RecurState } from "@/lib/recur";
import {
  awayGapMs,
  commitSession,
  crossedPayloadThreshold,
  discardTimer,
  excludeAway,
  formatSessionDuration,
  pauseTimer,
  resumeTimer,
  startTimer,
  totalMs,
  type ActiveTimer,
  type SessionEntry,
} from "@/lib/stopwatch";
import { HelpPanel } from "./HelpPanel";
import { VaultPanel } from "./VaultPanel";
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
import { resolveSlashSuggest } from "@/lib/slashComplete";
import { UnlockScreen } from "./UnlockScreen";
import { MetadataPanel } from "./MetadataPanel";
import { PLACEHOLDER_PHRASES, TypewriterPlaceholder } from "./TypewriterPlaceholder";
import { DeleteConfirmDialog, UndoToast, UNDO_TTL_SECONDS, type UndoSnapshot } from "./DeleteUndo";
import { NoticeDialog } from "./NoticeDialog";
import { AwayPromptDialog, StopwatchWidget, type AwayItem } from "./StopwatchWidget";

type Filter = "all" | "active" | "completed";

const DUPLICATE_MSG = "a task with that path already exists";

// ---- away-time bookkeeping (per device, localStorage) ----
// Written whenever the app hides/locks/closes so the next unlock can ask
// whether the elapsed wall-clock gap should count toward running stopwatches.
const CLOSED_AT_KEY = "todosst:lastHidden";
const AWAY_PROMPT_MIN_MS = 60_000;
// how long a completed task takes to fade away
const FADE_MS = 3000;

function readClosedAt(): number | null {
  try {
    const n = Number(localStorage.getItem(CLOSED_AT_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
function writeClosedAt(ts: number) {
  try {
    localStorage.setItem(CLOSED_AT_KEY, String(ts));
  } catch {}
}
function clearClosedAt() {
  try {
    localStorage.removeItem(CLOSED_AT_KEY);
  } catch {}
}

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
  handleTimerStart: (node: TreeNode) => Promise<void>;
  handleTimerTogglePause: (node: TreeNode) => Promise<void>;
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
    handleTimerStart,
    handleTimerTogglePause,
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

        {mode !== "check" ? (
          // tally/time rendering — storage underneath is still a count
          // (time mode interprets the count as minutes)
          <div className={`flex h-[18px] shrink-0 items-stretch border border-foreground ${mode === "time" ? "w-20" : "w-16"}`}>
            <button
              onClick={() => handleCountDown(node, mode === "time" ? stepOf(meta) : undefined)}
              className="w-4 text-[10px] leading-none opacity-60 hover:opacity-100"
              aria-label={mode === "time" ? "decrease logged time" : "decrement tally"}
            >
              −
            </button>
            <span
              className={`flex flex-1 items-center justify-center border-x border-foreground text-[10px] leading-none ${
                (mode === "time" || threshold < Infinity ? count >= threshold : count > 0) ? "bg-foreground text-background" : "bg-background"
              }`}
            >
              {mode === "time" ? formatMinutes(count) : count}
            </span>
            <button
              onClick={() => handleCountUp(node, mode === "time" ? stepOf(meta) : undefined)}
              className="w-4 text-[10px] leading-none opacity-60 hover:opacity-100"
              aria-label={mode === "time" ? "log time" : "increment tally"}
              title={mode === "time" ? `click to log +${stepOf(meta)}m` : "click to count +1"}
            >
              +
            </button>
          </div>
        ) : (
          <button
            onClick={() => handleToggle(node)}
            className={`h-4 w-4 shrink-0 border flex items-center justify-center ${checked ? "border-foreground bg-foreground text-background" : "border-foreground bg-background"}`}
            aria-label="toggle"
          >
            {checked && <span className="text-[10px] leading-none">✓</span>}
          </button>
        )}

        {mode !== "time" && !checked && !hasChildren && (
          // stopwatch control: ▶ starts a timing session, ⏸/▶ pauses/resumes
          // the active one. Completed rows don't offer it; check-off records
          // the running session (or use the floating widget's done/discard).
          // Parent tasks (folders) don't get a stopwatch — time them via leaves.
          <button
            onClick={() => (meta.timer ? handleTimerTogglePause(node) : handleTimerStart(node))}
            className={`shrink-0 w-4 text-[10px] leading-none ${meta.timer ? "opacity-100" : "opacity-60 hover:opacity-100"}`}
            aria-label={meta.timer ? (meta.timer.state === "running" ? "pause stopwatch" : "resume stopwatch") : "start stopwatch"}
            title={meta.timer ? (meta.timer.state === "running" ? "pause stopwatch" : "resume stopwatch") : "start stopwatch"}
          >
            {meta.timer && meta.timer.state === "running" ? "⏸" : "▶"}
          </button>
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
                {new Date(node.metadata.dueAt).toLocaleDateString()}
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
            {mode !== "time" && (meta.sessions?.length ?? 0) > 0 ? (
              <span className="ml-1 text-[10px] opacity-50" title="stopwatch time logged in this window">
                ⏱ {formatSessionDuration(totalMs(meta.sessions))}
                {meta.sessions!.length > 1 ? ` · ${meta.sessions!.length}` : ""}
              </span>
            ) : null}
          </button>
        )}

        <span className="flex gap-2 text-xs shrink-0 items-center">
          <button onClick={() => setAddChildParent(node._id)} className="opacity-40 hover:opacity-100">
            +child
          </button>
          <button onClick={() => setSelectedId(node._id)} className="opacity-40 hover:opacity-100 hidden sm:inline">
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
  const [showVault, setShowVault] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const newRootInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isSlashFocused, setIsSlashFocused] = useState(false);
  const [activeSuggestIdx, setActiveSuggestIdx] = useState(0);

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
      return;
    }
    if (decryptKeyRef.current !== key) {
      decryptKeyRef.current = key;
      decryptCacheRef.current.clear();
    }
    let cancelled = false;
    const misses = todos.filter((t) => !decryptCacheRef.current.has(cacheKeyFor(t)));
    if (misses.length === 0) {
      // fully cached — synchronous state update, no loading flash
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
  type HistoryStore = { byTodo: Map<string, Map<number, number>>; dursByTodo: Map<string, Map<number, number>>; idByTodo: Map<string, Id<"todoHistory">> };
  const [history, setHistory] = useState<HistoryStore | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!historyRecords || !key) {
        if (!cancelled) setHistory(null);
        return;
      }
      const byTodo = new Map<string, Map<number, number>>();
      const dursByTodo = new Map<string, Map<number, number>>();
      const idByTodo = new Map<string, Id<"todoHistory">>();
      await Promise.all(
        historyRecords.map(async (r) => {
          try {
            const json = await decryptString(key, r.iv, r.ciphertext);
            const data = decodeHistoryPayload(json);
            if (!data) return;
            byTodo.set(data.todoId, data.counts);
            if (data.durations && data.durations.size > 0) dursByTodo.set(data.todoId, data.durations);
            idByTodo.set(data.todoId, r._id);
          } catch {}
        })
      );
      if (!cancelled) setHistory({ byTodo, dursByTodo, idByTodo });
    })();
    return () => {
      cancelled = true;
    };
  }, [historyRecords, key]);

  const [recurStates, setRecurStates] = useState<Map<string, RecurState> | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!nodes) {
        if (!cancelled) setRecurStates(null);
        return;
      }
      const m = new Map<string, RecurState>();
      for (const n of nodes) {
        m.set(n._id as string, await recurState(n.metadata as PlainNode["metadata"], n._creationTime, nowTs));
      }
      if (!cancelled) setRecurStates(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [nodes, nowTs]);

  // ---- stopwatch: active sessions across all tasks (most recent first) ----
  const activeTimers = useMemo(() => {
    const out: { node: TreeNode; timer: ActiveTimer }[] = [];
    if (!nodes) return out;
    for (const n of nodes) {
      const t = (n.metadata as PlainNode["metadata"]).timer;
      if (!t) continue;
      const tn = tree.map.get(n._id as string);
      if (tn) out.push({ node: tn, timer: t });
    }
    return out.sort((a, b) => b.timer.startedAt - a.timer.startedAt);
  }, [nodes, tree]);

  // ---- away-time reconciliation ----
  // While hidden/locked/closed, running stopwatches keep deriving elapsed from
  // stored timestamps. On return, ask whether that wall-clock gap should count.
  const [away, setAway] = useState<{ closedAt: number; now: number; items: AwayItem[] } | null>(null);

  const checkAway = useCallback(() => {
    const closedAt = readClosedAt();
    clearClosedAt();
    if (closedAt === null) return;
    const now = Date.now();
    if (now - closedAt < AWAY_PROMPT_MIN_MS) return;
    const items: AwayItem[] = [];
    for (const n of nodes ?? []) {
      const t = (n.metadata as PlainNode["metadata"]).timer;
      if (!t || t.state !== "running") continue;
      const gap = awayGapMs(t, closedAt, now);
      if (gap > 0) items.push({ id: n._id as string, title: n.title, away: gap });
    }
    if (items.length > 0) setAway({ closedAt, now, items });
  }, [nodes]);

  // mark the moment the app goes away: lock, tab hide, or close
  useEffect(() => {
    if (isLocked) return;
    const onHide = () => writeClosedAt(Date.now());
    const onVisible = () => checkAway();
    const onVisChange = () => (document.hidden ? onHide() : onVisible());
    document.addEventListener("visibilitychange", onVisChange);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisChange);
      window.removeEventListener("pagehide", onHide);
    };
  }, [isLocked, checkAway]);

  // returning from lock / fresh load with pending away time
  useEffect(() => {
    if (isLocked || !nodes) return;
    checkAway();
  }, [isLocked, nodes, checkAway]);

  async function applyAway(countIds: Set<string>) {
    const snapshot = away;
    setAway(null);
    if (!snapshot || !key || !nodes) return;
    for (const item of snapshot.items) {
      if (countIds.has(item.id)) continue; // keep counting — derivation already includes the gap
      const n = nodes.find((x) => (x._id as string) === item.id);
      if (!n?.metadata.timer) continue;
      const updated = toPlainNode(n, { metadata: excludeAway(n.metadata, snapshot.closedAt, Date.now()) });
      const { ciphertext, iv } = await cryptoEncNode(updated);
      await updateTodo({ id: n._id, ciphertext, iv });
    }
  }

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
      const target = e.target as Element | null;
      const active = document.activeElement as Element | null;
      if (isTypingTarget(target) || isTypingTarget(active)) return;
      // ignore if a modal/dialog with its own input is present? input check above covers it
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
  }, [isLocked]);

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

  // context handed to bang commands (!cd, !help) via the grammar registry
  const commandCtx = useMemo<CommandContext>(
    () => ({
      currentPath: decodedPath,
      pushPath,
      showHelp: () => setHelpOpen(true),
    }),
    [decodedPath, pushPath]
  );

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

  async function handleCreateRoot(e: React.FormEvent) {
    e.preventDefault();
    const raw = newRootTitle.trim();
    if (!raw || !key) return;
    // grammar registry decides: !commands run via ctx, creation forms return a plan
    const outcome = runInput(raw, commandCtx);
    if (outcome.type === "create-slash") {
      if (!nodes) return;
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
        // recurrence applies to the final segment of the path
        const isLast = segIdx === slashParts.length - 1;
        const metadata: PlainNode["metadata"] = isLast && outcome.recur ? { recur: outcome.recur } : {};
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
        return;
      }
      // ensure all ancestors of newly created path are un-collapsed (visible)
      if (chainIds.length > 1) {
        setCollapsed((prev) => {
          const next = new Set(prev);
          for (let i = 0; i < chainIds.length - 1; i++) next.delete(chainIds[i]);
          return next;
        });
      }
      setNewRootTitle("");
      return;
    }
    if (outcome.type === "create-task") {
      // fallback: single task — creates in current directory (pwd) when scoped
      const title = outcome.title;
      if (title.length > 200) return;
      const targetParentId = currentDirInfo.exists ? (currentDirInfo.id as Id<"todos"> | null) : null;
      const siblings = childrenOf(tree.roots, tree.map, targetParentId);
      if (siblings.some((r) => r.title === title)) {
        setNotice(DUPLICATE_MSG);
        return;
      }
      const order = siblings.length ? Math.max(...siblings.map((r) => r.order)) + 1 : 0;
      const node = toPlainNode({
        title,
        isCompleted: false,
        parentId: targetParentId,
        order,
        metadata: outcome.recur ? { recur: outcome.recur } : {},
      });
      const { ciphertext, iv } = await cryptoEncNode(node);
      await createTodo({ ciphertext, iv });
      setNewRootTitle("");
      return;
    }
    // command executed (cd/help), unknown command, or nothing to create — clear input
    setNewRootTitle("");
  }

  async function handleAddChild(parentId: Id<"todos">) {
    const parsedRecur = parseRecurInput(addChildTitle.trim());
    const title = parsedRecur.title;
    if (!title || title.length > 200 || !key) return;
    const parent = tree.map.get(parentId);
    if (!parent) return;
    if (parent.children.some((c) => c.title === title)) {
      setNotice(DUPLICATE_MSG);
      return;
    }
    const order = parent.children.length ? Math.max(...parent.children.map((c) => c.order)) + 1 : 0;
    const node = toPlainNode({
      title,
      isCompleted: false,
      parentId,
      order,
      metadata: parsedRecur.ruleStr ? { recur: parsedRecur.ruleStr } : {},
    });
    const { ciphertext, iv } = await cryptoEncNode(node);
    await createTodo({ ciphertext, iv });
    setAddChildTitle("");
    setAddChildParent(null);
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(parentId);
      return next;
    });
  }

  async function pushHistory(todoId: string, windowDay: number, count: number, durationMs?: number) {
    if (!key) return;
    const merged = new Map(history?.byTodo.get(todoId) ?? []);
    if (count > 0) merged.set(windowDay, count);
    else merged.delete(windowDay);
    // stopwatch durations accumulate per day; counts are replaced (they mirror
    // the node's per-window count)
    const durs = new Map(history?.dursByTodo.get(todoId) ?? []);
    if (durationMs && durationMs > 0) durs.set(windowDay, (durs.get(windowDay) ?? 0) + Math.floor(durationMs));
    const payload = encodeHistoryPayload({ todoId, counts: merged, durations: durs.size > 0 ? durs : undefined });
    const { ciphertext, iv } = await encryptString(key, payload);
    const hid = history?.idByTodo.get(todoId);
    await historyPut(hid ? { id: hid, ciphertext, iv } : { ciphertext, iv });
  }

  // Warn once per threshold when the encrypted payload grows toward the 8KB server limit.
  function warnPayloadGrowth(node: TreeNode, newCiphertext: string) {
    const prev = node._raw.ciphertext?.length ?? 0;
    const crossed = crossedPayloadThreshold(prev, newCiphertext.length);
    if (crossed !== null) {
      setNotice(
        `encrypted payload now ${(newCiphertext.length / 1024).toFixed(1)}KB of the 8KB limit — clear old stopwatch sessions in this task's details if it keeps growing`
      );
    }
  }

  // Count for a specific day: the current window comes from recurState, past
  // windows from the decrypted history record.
  function countForDay(node: TreeNode, rs: RecurState | undefined, day: number): number {
    if (rs && rs.windowDay === day) return rs.count;
    return history?.byTodo.get(node._id as string)?.get(day) ?? 0;
  }

  // Write a new count for a node's window (recurring or tally mode). Node
  // metadata keeps only the current window; the full history record keeps
  // everything. targetDay credits a specific window (e.g. a stopwatch session
  // that finished in a past one), durationMs accumulates stopwatch time.
  async function applyCountWrite(
    node: TreeNode,
    rs: RecurState | undefined,
    next: number,
    opts?: { targetDay?: number; metadata?: PlainNode["metadata"]; durationMs?: number }
  ) {
    if (!key || !nodes) return;
    const meta = opts?.metadata ?? (node.metadata as PlainNode["metadata"]);
    const creationDay = dayIndexLocal(node._creationTime);
    const windowDay = rs?.windowDay ?? creationDay;
    const targetDay = opts?.targetDay ?? windowDay;
    const clamped = Math.max(0, Math.min(Math.floor(next), COUNT_MAX));
    const isRecurring = rs?.isRecurring ?? !!meta.recur;
    // node metadata only carries the current window's count — a past-window
    // credit (stopwatch rollover) lives in the history record alone
    const counts = targetDay === windowDay ? { [String(targetDay)]: clamped } : { ...(meta.counts ?? {}) };
    const updated = toPlainNode(node, {
      isCompleted: isRecurring ? false : clamped >= thresholdOf(meta),
      metadata: { ...meta, counts },
    });
    const { ciphertext, iv } = await cryptoEncNode(updated);
    await updateTodo({ id: node._id, ciphertext, iv });
    await pushHistory(node._id as string, targetDay, clamped, opts?.durationMs);
    warnPayloadGrowth(node, ciphertext);
  }

  function currentCount(node: TreeNode, rs: RecurState | undefined): number {
    if (rs) return rs.count;
    const c = (node.metadata as PlainNode["metadata"]).counts?.[String(dayIndexLocal(node._creationTime))];
    return typeof c === "number" && Number.isFinite(c) && c > 0 ? Math.floor(c) : 0;
  }

  async function handleToggle(node: TreeNode) {
    if (!key) return;
    const meta0 = node.metadata as PlainNode["metadata"];
    const rs = recurStates?.get(node._id as string);
    const isRecurring = rs?.isRecurring ?? !!meta0.recur;
    const mode = modeOf(meta0);
    const creationDay = dayIndexLocal(node._creationTime);
    // an active stopwatch session on this task ends with the check-off and is
    // recorded as a session for its (start-)window
    let metadata = meta0;
    let session: SessionEntry | null = null;
    let targetDay = rs?.windowDay ?? creationDay;
    if (meta0.timer) {
      const committed = commitSession(meta0, Date.now());
      metadata = committed.metadata;
      session = committed.session;
      targetDay = committed.windowDay;
    }
    if (isRecurring || mode !== "check") {
      // windowed count path — checkbox toggles threshold, tally increments
      const next = session
        ? mode === "count"
          ? Math.min(countForDay(node, rs, targetDay) + 1, COUNT_MAX)
          : Math.max(countForDay(node, rs, targetDay), thresholdOf(meta0))
        : nextCountOnClick(mode, currentCount(node, rs), thresholdOf(meta0));
      await applyCountWrite(node, rs, next, { targetDay, metadata, durationMs: session?.ms });
      return;
    }
    // plain checkbox task — same behavior as before, plus counts kept in sync
    // for lossless check<->tally mode switching later
    const nextCount = session ? thresholdOf(meta0) : node.isCompleted ? 0 : thresholdOf(meta0);
    const completed = session ? true : !node.isCompleted;
    const updated = toPlainNode(node, {
      isCompleted: completed,
      metadata: { ...metadata, counts: { [String(targetDay)]: nextCount } },
    });
    const { ciphertext, iv } = await cryptoEncNode(updated);
    await updateTodo({ id: node._id, ciphertext, iv });
    await pushHistory(node._id as string, targetDay, nextCount, session?.ms);
    warnPayloadGrowth(node, ciphertext);
  }

  // ---- stopwatch ----

  async function handleTimerStart(node: TreeNode) {
    if (!key || !nodes) return;
    const meta = node.metadata as PlainNode["metadata"];
    if (meta.timer || modeOf(meta) === "time") return;
    if (node.children.length > 0) return; // parents have no stopwatch
    const rs = recurStates?.get(node._id as string);
    const windowDay = rs?.windowDay ?? dayIndexLocal(node._creationTime);
    const updated = toPlainNode(node, { metadata: startTimer(meta, Date.now(), windowDay) });
    const { ciphertext, iv } = await cryptoEncNode(updated);
    await updateTodo({ id: node._id, ciphertext, iv });
    // the active timer is the payload's peak state — warn here, not on finish
    warnPayloadGrowth(node, ciphertext);
  }

  async function handleTimerTogglePause(node: TreeNode) {
    if (!key || !nodes) return;
    const meta = node.metadata as PlainNode["metadata"];
    if (!meta.timer) return;
    const next = meta.timer.state === "running" ? pauseTimer(meta, Date.now()) : resumeTimer(meta, Date.now());
    const updated = toPlainNode(node, { metadata: next });
    const { ciphertext, iv } = await cryptoEncNode(updated);
    await updateTodo({ id: node._id, ciphertext, iv });
    warnPayloadGrowth(node, ciphertext);
  }

  async function handleTimerDiscard(node: TreeNode) {
    if (!key || !nodes) return;
    const meta = node.metadata as PlainNode["metadata"];
    if (!meta.timer) return;
    const updated = toPlainNode(node, { metadata: discardTimer(meta) });
    const { ciphertext, iv } = await cryptoEncNode(updated);
    await updateTodo({ id: node._id, ciphertext, iv });
  }

  async function handleCountUp(node: TreeNode, delta = 1) {
    const rs = recurStates?.get(node._id as string);
    await applyCountWrite(node, rs, Math.min(currentCount(node, rs) + delta, COUNT_MAX));
  }

  async function handleCountDown(node: TreeNode, delta = 1) {
    const rs = recurStates?.get(node._id as string);
    await applyCountWrite(node, rs, Math.max(currentCount(node, rs) - delta, 0));
  }

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
      const durs = history?.dursByTodo.get(oldId);
      if ((counts && counts.size > 0) || (durs && durs.size > 0)) {
        snapHistory.push({ oldId, counts: Array.from(counts?.entries() ?? []), durations: durs ? Array.from(durs.entries()) : undefined });
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
    setConfirmDeleteId(null);
    setUndoState({ snap: { nodes: snapNodes, history: snapHistory, count: ids.length }, ttl: UNDO_TTL_SECONDS });
  }

  // Recreate the deleted subtree with fresh ids: parents first so child
  // parentIds can be remapped; history records are re-keyed to the new ids.
  async function handleUndo() {
    const snap = undoState?.snap;
    setUndoState(null);
    if (!snap || !key) return;
    const idMap = new Map<string, Id<"todos">>();
    for (const { oldId, plain } of snap.nodes) {
      // restore idle: an active stopwatch does not survive deletion
      const restored = toPlainNode(plain, {
        parentId: plain.parentId ? (idMap.get(plain.parentId) ?? null) : null,
        metadata: { ...plain.metadata, timer: undefined },
      });
      const { ciphertext, iv } = await cryptoEncNode(restored);
      const newId = await createTodo({ ciphertext, iv });
      idMap.set(oldId, newId as Id<"todos">);
    }
    for (const h of snap.history) {
      const newId = idMap.get(h.oldId);
      if (!newId) continue;
      const payload = encodeHistoryPayload({
        todoId: newId as string,
        counts: new Map(h.counts),
        durations: h.durations ? new Map(h.durations) : undefined,
      });
      const { ciphertext, iv } = await encryptString(key, payload);
      await historyPut({ ciphertext, iv });
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
  // round-trip with the new key, drop it
  useEffect(() => {
    setUndoState(null);
  }, [key]);

  async function handleUpdateMetadata(id: Id<"todos">, patch: Partial<PlainNode["metadata"]>) {
    if (!key || !nodes) return;
    const cur = nodes.find((n) => n._id === id);
    if (!cur) return;
    let metadata: PlainNode["metadata"] = { ...cur.metadata, ...patch };
    let isCompleted = cur.isCompleted;
    // switching to time mode cancels any active stopwatch session (time mode
    // logs minutes via counts instead)
    if (patch.mode === "time" && metadata.timer) {
      metadata = discardTimer(metadata);
    }
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
    handleTimerStart,
    handleTimerTogglePause,
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
  };

  return (
    <div className="w-full max-w-[720px] border border-foreground bg-background">
      <div className="flex items-center justify-between border-b border-foreground px-3 py-2 text-xs">
        <span className="flex items-center gap-2">
          <span>E2E Encrypted</span>
        </span>
        <span className="flex items-center gap-3">
          <button
            onClick={() => setShowVault(true)}
            className="opacity-60 hover:opacity-100 underline underline-offset-4"
            title="change password, recovery key"
          >
            vault
          </button>
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
              writeClosedAt(Date.now());
              lock();
            }}
            className="opacity-60 hover:opacity-100 underline underline-offset-4"
          >
            lock
          </button>
        </span>
      </div>

      {/* breadcrumb path — clickable: each segment -> that dir */}
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

      {/* top controls */}
      <div className="flex flex-wrap gap-2 border-b border-foreground p-3">
        <form onSubmit={handleCreateRoot} className="flex flex-1 items-center gap-2">
          <div className="flex-1 relative">
            <input
              ref={newRootInputRef}
              autoFocus
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

      <div className="flex flex-wrap gap-2 border-b border-foreground/10 px-3 py-2 text-xs">
        <input
          ref={searchInputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
            <p>tasks empty — add a top-level task.</p>
            <p className="mt-1 text-xs opacity-60">later add children via +child</p>
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

      {confirmNode && (
        <DeleteConfirmDialog
          node={confirmNode}
          nestedCount={confirmCount}
          countdown={confirmCountdown}
          onClose={() => setConfirmDeleteId(null)}
          onDelete={() => handleDelete(confirmNode)}
        />
      )}

      {showVault && <VaultPanel onClose={() => setShowVault(false)} />}

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

      {activeTimers.length > 0 && (
        <StopwatchWidget timers={activeTimers} onTogglePause={handleTimerTogglePause} onDone={handleToggle} onDiscard={handleTimerDiscard} />
      )}

      {away && <AwayPromptDialog items={away.items} closedAt={away.closedAt} now={away.now} onApply={applyAway} />}

      {selectedNode && (
        <MetadataPanel
          key={selectedNode._id}
          node={selectedNode}
          onUpdateMetadata={handleUpdateMetadata}
          onClose={() => setSelectedId(null)}
          nowTs={nowTs}
          historyCounts={history?.byTodo.get(selectedNode._id as string) ?? null}
          historyDurations={history?.dursByTodo.get(selectedNode._id as string) ?? null}
        />
      )}
    </div>
  );
}

export function TodoApp() {
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
      </Authenticated>
    </>
  );
}
