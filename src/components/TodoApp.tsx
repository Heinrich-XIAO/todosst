"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { AuthForm } from "./AuthForm";
import { useEncryption, getRememberedKey, setRememberedKey } from "./EncryptionContext";
import type { PlainNode } from "@/lib/crypto";
import { deriveExtractableKey, exportKeyB64, encryptString, decryptString } from "@/lib/crypto";
import { usePathname } from "next/navigation";
import { parseBangCd, resolveCdPath, encodePathForUrl, decodePathToParts, partsToPath } from "@/lib/cdPath";
import { parseSlashPath } from "@/lib/slashPath";
import {
  COUNT_MAX,
  DEFAULT_GRACE_HOURS,
  dayIndexLocal,
  decodeHistoryPayload,
  encodeHistoryPayload,
  mergeCounts,
  modeOf,
  nextCountOnClick,
  parseRecurInput,
  recurState,
  thresholdOf,
} from "@/lib/recur";
import type { RecurState } from "@/lib/recur";
import { Heatmap } from "./Heatmap";
import { RruleEditor } from "./RruleEditor";

type Filter = "all" | "active" | "completed";

type DecryptedNode = PlainNode & {
  _id: Id<"todos">;
  _creationTime: number;
  _raw: { ciphertext?: string; iv?: string; title?: string; isCompleted?: boolean };
};

type TreeNode = DecryptedNode & { children: TreeNode[]; depth: number };

// Snapshot of a deleted subtree, captured pre-delete so it can be recreated on undo.
type UndoSnapshot = {
  nodes: { oldId: string; plain: PlainNode }[]; // depth-first order: parents before children
  history: { oldId: string; counts: [number, number][] }[];
  count: number;
};

const UNDO_TTL_SECONDS = 10;

type DropPos = "before" | "after" | "child";

/** Upper half of the row inserts above, lower half below; Alt means "drop as child". */
function dropPosFor(e: React.DragEvent): DropPos {
  if (e.altKey) return "child";
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function buildTree(nodes: DecryptedNode[]): { roots: TreeNode[]; map: Map<string, TreeNode>; orphans: number } {
  const map = new Map<string, TreeNode>();
  // init
  for (const n of nodes) {
    map.set(n._id, { ...n, children: [], depth: 0 });
  }
  const roots: TreeNode[] = [];
  let orphans = 0;
  // attach, detect cycles (simple: if parent chain leads back to self, break)
  for (const n of nodes) {
    const tn = map.get(n._id)!;
    const parentId = n.parentId;
    if (!parentId || !map.has(parentId)) {
      if (parentId && !map.has(parentId)) orphans++;
      roots.push(tn);
      continue;
    }
    // cycle check: walk up from parent
    let cur: string | null = parentId;
    let cyclic = false;
    const seen = new Set<string>([n._id]);
    while (cur) {
      if (seen.has(cur)) { cyclic = true; break; }
      seen.add(cur);
      const p = map.get(cur);
      if (!p) break;
      cur = p.parentId;
    }
    if (cyclic) {
      roots.push(tn);
      orphans++;
      continue;
    }
    const parent = map.get(parentId)!;
    parent.children.push(tn);
  }
  // compute depth + sort: active first, then by order/creationTime (so completed always below)
  function sortAndDepth(list: TreeNode[], depth: number) {
    list.sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
      if (a.order !== b.order) return a.order - b.order;
      return a._creationTime - b._creationTime;
    });
    for (const n of list) {
      n.depth = depth;
      if (n.children.length) sortAndDepth(n.children, depth + 1);
    }
  }
  sortAndDepth(roots, 0);
  return { roots, map, orphans };
}

function collectDescendants(node: TreeNode): Id<"todos">[] {
  const out: Id<"todos">[] = [];
  function dfs(n: TreeNode) {
    out.push(n._id);
    for (const c of n.children) dfs(c);
  }
  dfs(node);
  return out;
}

function getAncestors(
  id: string,
  map: Map<string, TreeNode>
): TreeNode[] {
  const out: TreeNode[] = [];
  let cur = map.get(id);
  while (cur?.parentId) {
    const p = map.get(cur.parentId);
    if (!p) break;
    out.unshift(p);
    cur = p;
  }
  return out;
}

function UnlockScreen() {
  const { unlock, setKeyFromStored, isReady, clearStoredKey } = useEncryption();
  const viewer = useQuery(api.users.viewer);
  const [password, setPassword] = useState("");
  const [storeLocally, setStoreLocally] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return !!getRememberedKey();
    } catch {
      return false;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const convex = useConvex();
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isReady) passwordRef.current?.focus();
  }, [isReady]);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      let salt: string | null = null;
      try {
        const mine = (await convex.query(api.encryption.getMySalt, {})) as string | null;
        if (mine) salt = mine;
      } catch {}
      if (!salt && viewer?.email) {
        try {
          salt = (await convex.query(api.encryption.getSalt, { email: viewer.email })) as string | null;
        } catch {}
      }
      if (!salt) {
        setError("no encryption salt found — try signing out and back in.");
        return;
      }
      if (storeLocally) {
        // Derive an extractable key with the fetched salt and persist it for auto-unlock.
        // Use direct helpers to guarantee we use the freshly fetched salt.
        const k = await deriveExtractableKey(password, salt);
        const keyB64 = await exportKeyB64(k);
        setRememberedKey({ salt, keyB64 });
        setKeyFromStored(k, salt);
      } else {
        // ensure we don't keep a stale stored key when user explicitly opted out
        clearStoredKey();
        await unlock(password);
      }
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message.toLowerCase() : "failed to unlock");
    } finally {
      setLoading(false);
    }
  }

  if (!isReady) return <p className="text-sm opacity-60">preparing vault…</p>;

  return (
    <div className="w-full max-w-[420px] border border-foreground bg-background p-6">
      <h2 className="text-sm font-medium">unlock vault</h2>
      <p className="mt-1 text-xs opacity-60">
        your tasks are end-to-end encrypted — structure, titles, and metadata are opaque to the server. enter
        password to derive the key.
      </p>
      <form onSubmit={handleUnlock} className="mt-4 space-y-3">
        <input
          ref={passwordRef}
          autoFocus
          type="password"
          autoComplete="current-password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border-b border-foreground bg-transparent py-2 text-sm placeholder:text-foreground/40 focus:outline-none"
        />
        <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={storeLocally}
            onChange={(e) => {
              const checked = e.target.checked;
              setStoreLocally(checked);
              if (!checked) clearStoredKey();
            }}
            className="h-3.5 w-3.5 border border-foreground bg-background accent-foreground"
          />
          <span className="opacity-80">store locally</span>
          <span className="opacity-40 hidden sm:inline">— automatically unlock on this device</span>
        </label>
        {storeLocally && (
          <p className="text-[11px] opacity-40 leading-tight">
            stores the derived encryption key in localStorage on this device. anyone with access to this browser can open
            your vault without the password. only use on a trusted device.
          </p>
        )}
        {error && <p className="border border-foreground bg-background px-3 py-2 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full border border-foreground bg-foreground py-2.5 text-sm text-background hover:opacity-90 disabled:opacity-40"
        >
          {loading ? "unlocking…" : "unlock"}
        </button>
      </form>
    </div>
  );
}

function MetadataPanel({
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
  const [showRuleEditor, setShowRuleEditor] = useState(false);
  if (!node) return null;
  const meta = node.metadata as PlainNode["metadata"];
  const mode = modeOf(meta);
  return (
    <div className="border-t border-foreground bg-background p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">{node.title} — details</span>
        <button onClick={onClose} className="opacity-60 hover:opacity-100">
          close
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {/* recurrence */}
        <div className="border border-foreground/20 p-2">
          <div className="flex items-center justify-between">
            <span className="opacity-60">recurrence</span>
            {!showRuleEditor && (
              <button onClick={() => setShowRuleEditor(true)} className="underline underline-offset-2 opacity-60 hover:opacity-100">
                {meta.recur ? "edit rule" : "+ make recurring"}
              </button>
            )}
          </div>
          {!showRuleEditor && meta.recur ? <p className="mt-1 break-all font-mono text-[10px] opacity-60">{meta.recur}</p> : null}
          {!showRuleEditor && !meta.recur ? <p className="mt-1 text-[10px] opacity-40">one-off task — no schedule</p> : null}
          {showRuleEditor && (
            <div className="mt-2">
              <RruleEditor
                ruleStr={meta.recur}
                anchorTs={node._creationTime}
                onApply={(s) => {
                  onUpdateMetadata(node._id, { recur: s ?? undefined });
                  setShowRuleEditor(false);
                }}
                onCancel={() => setShowRuleEditor(false)}
              />
            </div>
          )}
        </div>

        {/* completion style + threshold + grace */}
        {meta.recur && (
        <div className="flex flex-wrap gap-2">
          <label className="flex-1 block">
            <span className="opacity-60">completion style</span>
            <select
              value={mode}
              onChange={(e) => onUpdateMetadata(node._id, { mode: e.target.value === "count" ? "count" : "check" })}
              className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
            >
              <option value="check">checkbox</option>
              <option value="count">tally count</option>
            </select>
          </label>
          {mode === "check" && (
            <label className="flex-1 block">
              <span className="opacity-60">checkbox threshold</span>
              <input
                type="number"
                min={1}
                max={999}
                value={thresholdOf(meta)}
                onChange={(e) => onUpdateMetadata(node._id, { threshold: Math.min(999, Math.max(1, Number(e.target.value) || 1)) })}
                className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
              />
            </label>
          )}
          {meta.recur && (
            <label className="flex-1 block">
              <span className="opacity-60">grace hours</span>
              <input
                type="number"
                min={0}
                max={48}
                value={meta.graceHours ?? DEFAULT_GRACE_HOURS}
                onChange={(e) => onUpdateMetadata(node._id, { graceHours: Math.min(48, Math.max(0, Number(e.target.value) || 0)) })}
                className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
              />
            </label>
          )}
        </div>
        )}

        {meta.recur ? (
          <p className="text-[10px] opacity-40 leading-tight">
            recurring tasks always show the current window — past windows are frozen history and count toward the heatmap.
          </p>
        ) : null}

        {/* past-year heatmap for this task */}
        {meta.recur ? (
          <div>
            <span className="opacity-60">past year</span>
            <div className="mt-1">
              <Heatmap counts={historyCounts ?? new Map<number, number>()} nowTs={nowTs} />
            </div>
          </div>
        ) : null}

        <label className="block">
          <span className="opacity-60">description</span>
          <textarea
            defaultValue={node.metadata.description ?? ""}
            placeholder="add notes…"
            rows={2}
            onBlur={(e) => onUpdateMetadata(node._id, { description: e.target.value })}
            className="mt-1 w-full border border-foreground/20 bg-transparent p-2 text-xs focus:outline-none"
          />
        </label>
        <div className="flex gap-2">
          <label className="flex-1 block">
            <span className="opacity-60">priority</span>
            <select
              value={node.metadata.priority ?? ""}
              onChange={(e) => {
                const v = e.target.value as PlainNode["metadata"]["priority"];
                onUpdateMetadata(node._id, { priority: v || null });
              }}
              className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
            >
              <option value="">none</option>
              <option value="low">low</option>
              <option value="med">med</option>
              <option value="high">high</option>
            </select>
          </label>
          <label className="flex-1 block">
            <span className="opacity-60">due</span>
            <input
              type="date"
              value={node.metadata.dueAt ? new Date(node.metadata.dueAt).toISOString().slice(0, 10) : ""}
              onChange={(e) => {
                const dueAt = e.target.value ? new Date(e.target.value).getTime() : null;
                onUpdateMetadata(node._id, { dueAt });
              }}
              className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
            />
          </label>
        </div>
        <label className="block">
          <span className="opacity-60">tags (comma separated)</span>
          <input
            defaultValue={(node.metadata.tags ?? []).join(", ")}
            placeholder="work, urgent"
            onBlur={(e) => {
              const tags = e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 8);
              onUpdateMetadata(node._id, { tags });
            }}
            className="mt-1 w-full border border-foreground/20 bg-transparent p-1 text-xs"
          />
        </label>
      </div>
    </div>
  );
}

const PLACEHOLDER_PHRASES = [
  "/host hackathon/outreach write email template",
  "!cd host hackathon",
  "/side-quests finally learn how vim exits",
  "/taxes reconcile the horror spreadsheet",
  "/reading if anyone builds it, everyone dies ch. 3",
  "/groceries coffee beans (the good ones)",
  "!help",
];

function TypewriterPlaceholder({ phrases, active }: { phrases: string[]; active: boolean }) {
  const [text, setText] = useState("");
  const phraseIdx = useRef(0);
  const charIdx = useRef(0);
  const deleting = useRef(false);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const phrase = phrases[phraseIdx.current % phrases.length];
      if (!deleting.current) {
        charIdx.current += 1;
        setText(phrase.slice(0, charIdx.current));
        if (charIdx.current >= phrase.length) {
          deleting.current = true;
          timer = setTimeout(tick, 1700);
        } else {
          timer = setTimeout(tick, 38 + Math.random() * 36);
        }
      } else {
        charIdx.current -= 1;
        setText(phrase.slice(0, charIdx.current));
        if (charIdx.current <= 0) {
          deleting.current = false;
          phraseIdx.current += 1;
          timer = setTimeout(tick, 420);
        } else {
          timer = setTimeout(tick, 24);
        }
      }
    };
    timer = setTimeout(tick, 350);
    return () => clearTimeout(timer);
  }, [active, phrases]);

  return <>{text}</>;
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
  const clearCompleted = useMutation(api.todos.clearCompleted);
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
  const [undoState, setUndoState] = useState<{ snap: UndoSnapshot; ttl: number } | null>(null);
  const newRootInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isSlashFocused, setIsSlashFocused] = useState(false);
  const [activeSuggestIdx, setActiveSuggestIdx] = useState(0);

  const [nodes, setNodes] = useState<DecryptedNode[] | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set());

  const isLoading = todos === undefined;

  useEffect(() => {
    if (todos === undefined) return;
    if (!key) {
      setNodes(null);
      setDecryptError(null);
      return;
    }
    let cancelled = false;
    setIsDecrypting(true);
    setDecryptError(null);
    (async () => {
      try {
        const results = await Promise.all(
          todos.map(async (t) => {
            if (!t.ciphertext || !t.iv) {
              // legacy
              return {
                v: 2 as const,
                title: (t.title as string) ?? "(legacy)",
                isCompleted: (t.isCompleted as boolean) ?? false,
                parentId: null,
                order: t._creationTime,
                metadata: {},
                _id: t._id,
                _creationTime: t._creationTime,
                _raw: { title: t.title, isCompleted: t.isCompleted },
              } satisfies DecryptedNode;
            }
            try {
              const plain = await cryptoDecNode(t.iv, t.ciphertext);
              if (plain.title.length > 200) throw new Error("title too long");
              return {
                ...plain,
                // ensure order finite
                order: typeof plain.order === "number" && Number.isFinite(plain.order) ? plain.order : t._creationTime,
                _id: t._id,
                _creationTime: t._creationTime,
                _raw: { ciphertext: t.ciphertext, iv: t.iv },
              } satisfies DecryptedNode;
            } catch {
              return {
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
          })
        );
        // detect if any decrypt failed
        const failed = results.some((r) => r.title === "— unable to decrypt —");
        if (failed) setDecryptError("wrong password or corrupted vault — some items could not be decrypted.");
        if (!cancelled) setNodes(results);
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
  type HistoryStore = { byTodo: Map<string, Map<number, number>>; idByTodo: Map<string, Id<"todoHistory">> };
  const [history, setHistory] = useState<HistoryStore | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!historyRecords || !key) {
        if (!cancelled) setHistory(null);
        return;
      }
      const byTodo = new Map<string, Map<number, number>>();
      const idByTodo = new Map<string, Id<"todoHistory">>();
      for (const r of historyRecords) {
        try {
          const json = await decryptString(key, r.iv, r.ciphertext);
          const data = decodeHistoryPayload(json);
          if (!data) continue;
          byTodo.set(data.todoId, data.counts);
          idByTodo.set(data.todoId, r._id);
        } catch {}
      }
      if (!cancelled) setHistory({ byTodo, idByTodo });
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

  const globalCounts = useMemo(() => {
    if (!history) return null;
    const merged = mergeCounts(history.byTodo.values());
    return merged.size > 0 ? merged : null;
  }, [history]);

  const listFlat = nodes ?? [];

  // completed tasks fade out 10s after being checked — not removed
  useEffect(() => {
    if (!nodes) return;
    const timers: number[] = [];
    const currentCompleted = new Set(nodes.filter((n) => n.isCompleted).map((n) => n._id as string));
    // schedule fading for newly completed
    for (const n of nodes) {
      const idStr = n._id as string;
      if (n.isCompleted && !fadingIds.has(idStr)) {
        const t = window.setTimeout(() => {
          setFadingIds((prev) => {
            const next = new Set(prev);
            next.add(idStr);
            return next;
          });
        }, 3000);
        timers.push(t);
      }
    }
    // un-fade if toggled back to active
    for (const id of Array.from(fadingIds)) {
      if (!currentCompleted.has(id as string)) {
        setFadingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }
    return () => timers.forEach((t) => clearTimeout(t));
  }, [nodes, fadingIds]);

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

  // filter helper for tree: keep node if matches or has matching descendant
  const matches = useCallback(
    (n: TreeNode): boolean => {
      if (!search && filter === "all") return true;
      const s = search.trim().toLowerCase();
      const textMatch = !s || n.title.toLowerCase().includes(s) || (n.metadata.tags ?? []).join(" ").toLowerCase().includes(s);
      const statusMatch = filter === "all" || (filter === "active" && !n.isCompleted) || (filter === "completed" && n.isCompleted);
      if (textMatch && statusMatch) return true;
      // check descendants
      for (const c of n.children) if (matches(c)) return true;
      return false;
    },
    [filter, search]
  );

  const decodedPath = useMemo(() => {
    try {
      return decodeURIComponent(pathname);
    } catch {
      return pathname;
    }
  }, [pathname]);

  const currentDirInfo = useMemo(() => {
    if (!nodes) return { id: null as Id<"todos"> | null, exists: false, parts: [] as string[] };
    const raw = decodedPath;
    // normalize: split, trim, filter empty (handles // and trailing slash)
    const parts = raw
      .split("/")
      .map((s) => {
        try {
          return decodeURIComponent(s).trim();
        } catch {
          return s.trim();
        }
      })
      .filter((s) => s.length > 0);
    if (parts.length === 0) return { id: null, exists: true, parts };
    let parentId: string | null = null;
    let found: DecryptedNode | null = null;
    for (const title of parts) {
      found = nodes.find((n) => n.title === title && (n.parentId ?? null) === parentId) ?? null;
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

  const navigateToPwd = useCallback((parts: string[]) => {
    const encoded = partsToPath(parts);
    window.history.pushState(null, "", encoded);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  // intellisense: autocomplete for "/..." paths and "!cd ..." commands
  const slashComplete = useMemo(() => {
    const none = { suggestions: [] as TreeNode[], prefix: "", parentId: null as string | null, dirPath: "", mode: "none" as const };
    if (!nodes) return none;
    if (newRootTitle.startsWith("/")) {
      const withoutLeading = newRootTitle.slice(1);
      const parts = withoutLeading.split("/");
      let prefixRaw = parts[parts.length - 1] ?? "";
      let dirPartsRaw = parts.slice(0, -1);
      if (dirPartsRaw.length === 0) {
        const m = /^(\S+)\s+(\S.*)$/.exec(prefixRaw.trim());
        const first = m ? nodes.find((n) => n.title === m[1] && (n.parentId ?? null) === null) : undefined;
        if (m && first) {
          dirPartsRaw = [m[1]];
          prefixRaw = m[2];
        }
      }
      let parentId: string | null = null;
      for (const raw of dirPartsRaw) {
        const seg = raw.trim();
        if (!seg) return { ...none, prefix: prefixRaw };
        const match = nodes.find((n) => n.title === seg && (n.parentId ?? null) === parentId);
        if (!match) return { ...none, prefix: prefixRaw };
        parentId = match._id as string;
      }
      const dirPath = dirPartsRaw.length ? "/" + dirPartsRaw.map((s) => s.trim()).filter(Boolean).join("/") : "";
      let siblings: TreeNode[];
      if (parentId === null) siblings = tree.roots;
      else {
        const par = tree.map.get(parentId);
        siblings = par ? par.children : [];
      }
      const prefix = prefixRaw.trim();
      const lower = prefix.toLowerCase();
      const filtered = !prefix ? siblings.slice(0, 8) : siblings.filter((s) => s.title.toLowerCase().startsWith(lower)).slice(0, 8);
      return { suggestions: filtered, prefix, parentId, dirPath, mode: "slash" as const };
    }
    // "!cd <path>" intellisense — segments are "/"-separated, resolved against pwd
    const { isCd: isCdCmd, target: cdTarget } = parseBangCd(newRootTitle);
    if (!isCdCmd) return none;
    const segs = cdTarget ? cdTarget.split("/") : [];
    const prefixRaw = segs.length ? segs[segs.length - 1] : "";
    const dirSegs = segs.length ? segs.slice(0, -1) : [];
    const absolute = !!cdTarget && cdTarget.startsWith("/");
    const dirParts: string[] = absolute ? [] : decodePathToParts(decodedPath);
    for (const raw of dirSegs) {
      const seg = raw.trim();
      if (!seg || seg === ".") continue;
      if (seg === "..") {
        dirParts.pop();
        continue;
      }
      dirParts.push(seg);
    }
    let parentId: string | null = null;
    for (const part of dirParts) {
      const match = nodes.find((n) => n.title === part && (n.parentId ?? null) === parentId);
      if (!match) return { ...none, prefix: prefixRaw };
      parentId = match._id as string;
    }
    const siblings = parentId === null ? tree.roots : (tree.map.get(parentId)?.children ?? []);
    const prefix = prefixRaw.trim();
    const lower = prefix.toLowerCase();
    const filtered = !prefix ? siblings.slice(0, 8) : siblings.filter((s) => s.title.toLowerCase().startsWith(lower)).slice(0, 8);
    return { suggestions: filtered, prefix, parentId, dirPath: "/" + dirParts.join("/"), mode: "cd" as const };
  }, [newRootTitle, nodes, tree, decodedPath]);

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
    // bang commands: !cd <path> — change window location without reload
    if (raw.startsWith("!")) {
      const { isCd, target } = parseBangCd(raw);
      if (isCd) {
        let decodedCurrent: string;
        try {
          decodedCurrent = decodeURIComponent(pathname);
        } catch {
          decodedCurrent = pathname;
        }
        const resolved = resolveCdPath(decodedCurrent, target);
        const encoded = encodePathForUrl(resolved);
        window.history.pushState(null, "", encoded);
        // Ensure Next's usePathname syncs (pushState is patched but popstate helps in some builds)
        window.dispatchEvent(new PopStateEvent("popstate"));
        setNewRootTitle("");
        return;
      }
      // unknown bang command — just clear and ignore (don’t create a todo)
      setNewRootTitle("");
      return;
    }
    // trailing "~…" token → recurrence on the created task
    const parsedRecur = parseRecurInput(raw);
    const base = parsedRecur.title;
    if (!base) {
      // recurrence token only — nothing to create
      setNewRootTitle("");
      return;
    }
    const slashParts = parseSlashPath(base);
    if (slashParts) {
      if (!nodes) return;
      // Build slash-separated hierarchy: each "/" segment may contain spaces.
      // e.g. "/host hackathon/outreach write email template" -> ["host hackathon","outreach write email template"]
      // Reuse existing nodes by exact title + parentId match; create missing.
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
        const existing = virtualNodes.find((n) => n.title === title && (n.parentId ?? null) === parentId);
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
        const metadata: PlainNode["metadata"] = isLast && parsedRecur.ruleStr ? { recur: parsedRecur.ruleStr } : {};
        const node: PlainNode = { v: 2, title, isCompleted: false, parentId: parentId as Id<"todos"> | null, order, metadata };
        const { ciphertext, iv } = await cryptoEncNode(node);
        const newId = await createTodo({ ciphertext, iv });
        virtualNodes.push({
          v: 2,
          title,
          isCompleted: false,
          parentId,
          order,
          metadata,
          _id: newId as Id<"todos">,
          _creationTime: Date.now(),
          _raw: { ciphertext, iv },
        } as DecryptedNode);
        chainIds.push(newId as string);
        parentId = newId as string;
        createdCount++;
      }
      if (createdCount === 0) {
        alert("a task with that path already exists");
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
    // fallback: single task — creates in current directory (pwd) when scoped
    const title = base;
    if (title.length > 200) return;
    const targetParentId = currentDirInfo.exists ? (currentDirInfo.id as Id<"todos"> | null) : null;
    const siblings = targetParentId === null ? tree.roots : (tree.map.get(targetParentId as string)?.children ?? []);
    if (siblings.some((r) => r.title === title)) {
      alert("a task with that path already exists");
      return;
    }
    const order = siblings.length ? Math.max(...siblings.map((r) => r.order)) + 1 : 0;
    const node: PlainNode = {
      v: 2,
      title,
      isCompleted: false,
      parentId: targetParentId,
      order,
      metadata: parsedRecur.ruleStr ? { recur: parsedRecur.ruleStr } : {},
    };
    const { ciphertext, iv } = await cryptoEncNode(node);
    await createTodo({ ciphertext, iv });
    setNewRootTitle("");
  }

  async function handleAddChild(parentId: Id<"todos">) {
    const parsedRecur = parseRecurInput(addChildTitle.trim());
    const title = parsedRecur.title;
    if (!title || title.length > 200 || !key) return;
    const parent = tree.map.get(parentId);
    if (!parent) return;
    if (parent.children.some((c) => c.title === title)) {
      alert("a task with that path already exists");
      return;
    }
    const order = parent.children.length ? Math.max(...parent.children.map((c) => c.order)) + 1 : 0;
    const node: PlainNode = {
      v: 2,
      title,
      isCompleted: false,
      parentId,
      order,
      metadata: parsedRecur.ruleStr ? { recur: parsedRecur.ruleStr } : {},
    };
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

  async function pushHistory(todoId: string, windowDay: number, count: number) {
    if (!key) return;
    const merged = new Map(history?.byTodo.get(todoId) ?? []);
    if (count > 0) merged.set(windowDay, count);
    else merged.delete(windowDay);
    const payload = encodeHistoryPayload({ todoId, counts: merged });
    const { ciphertext, iv } = await encryptString(key, payload);
    const hid = history?.idByTodo.get(todoId);
    await historyPut(hid ? { id: hid, ciphertext, iv } : { ciphertext, iv });
  }

  // Write a new count for the node's current window (recurring or tally mode).
  // Node metadata keeps only the current window; the full history record keeps everything.
  async function applyCountWrite(node: TreeNode, rs: RecurState | undefined, next: number) {
    if (!key || !nodes) return;
    const meta = node.metadata as PlainNode["metadata"];
    const windowDay = rs?.windowDay ?? dayIndexLocal(node._creationTime);
    const clamped = Math.max(0, Math.min(Math.floor(next), COUNT_MAX));
    const isRecurring = rs?.isRecurring ?? !!meta.recur;
    const updated: PlainNode = {
      v: 2,
      title: node.title,
      isCompleted: isRecurring ? false : clamped >= thresholdOf(meta),
      parentId: node.parentId,
      order: node.order,
      metadata: { ...meta, counts: { [String(windowDay)]: clamped } },
    };
    const { ciphertext, iv } = await cryptoEncNode(updated);
    await updateTodo({ id: node._id, ciphertext, iv });
    await pushHistory(node._id as string, windowDay, clamped);
  }

  function currentCount(node: TreeNode, rs: RecurState | undefined): number {
    if (rs) return rs.count;
    const c = (node.metadata as PlainNode["metadata"]).counts?.[String(dayIndexLocal(node._creationTime))];
    return typeof c === "number" && Number.isFinite(c) && c > 0 ? Math.floor(c) : 0;
  }

  async function handleToggle(node: TreeNode) {
    if (!key) return;
    const meta = node.metadata as PlainNode["metadata"];
    const rs = recurStates?.get(node._id as string);
    const isRecurring = rs?.isRecurring ?? !!meta.recur;
    const mode = modeOf(meta);
    if (isRecurring || mode === "count") {
      // windowed count path — checkbox toggles threshold, tally increments
      const next = nextCountOnClick(mode, currentCount(node, rs), thresholdOf(meta));
      await applyCountWrite(node, rs, next);
      return;
    }
    // plain checkbox task — same behavior as before, plus counts kept in sync
    // for lossless check<->tally mode switching later
    const windowDay = rs?.windowDay ?? dayIndexLocal(node._creationTime);
    const nextCount = node.isCompleted ? 0 : thresholdOf(meta);
    const updated: PlainNode = {
      v: 2,
      title: node.title,
      isCompleted: !node.isCompleted,
      parentId: node.parentId,
      order: node.order,
      metadata: { ...meta, counts: { [String(windowDay)]: nextCount } },
    };
    const { ciphertext, iv } = await cryptoEncNode(updated);
    await updateTodo({ id: node._id, ciphertext, iv });
    await pushHistory(node._id as string, windowDay, nextCount);
  }

  async function handleCountUp(node: TreeNode) {
    const rs = recurStates?.get(node._id as string);
    await applyCountWrite(node, rs, Math.min(currentCount(node, rs) + 1, COUNT_MAX));
  }

  async function handleCountDown(node: TreeNode) {
    const rs = recurStates?.get(node._id as string);
    await applyCountWrite(node, rs, Math.max(currentCount(node, rs) - 1, 0));
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
      alert("a task with that path already exists");
      return;
    }
    const updated: PlainNode = { v: 2, title: v, isCompleted: cur.isCompleted, parentId: cur.parentId, order: cur.order, metadata: cur.metadata };
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
        plain: { v: 2, title: n.title, isCompleted: n.isCompleted, parentId: n.parentId, order: n.order, metadata: n.metadata },
      });
      for (const c of n.children) walk(c);
    };
    walk(node);
    const snapHistory: UndoSnapshot["history"] = [];
    for (const { oldId } of snapNodes) {
      const counts = history?.byTodo.get(oldId);
      if (counts && counts.size > 0) snapHistory.push({ oldId, counts: Array.from(counts.entries()) });
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
      // use bulk clearCompleted pattern (client-computed ids)
      await clearCompleted({ ids });
    }
    for (const hid of historyIds) {
      await historyRemove({ id: hid });
    }
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
      const restored: PlainNode = {
        ...plain,
        parentId: plain.parentId ? (idMap.get(plain.parentId) ?? null) : null,
      };
      const { ciphertext, iv } = await cryptoEncNode(restored);
      const newId = await createTodo({ ciphertext, iv });
      idMap.set(oldId, newId as Id<"todos">);
    }
    for (const h of snap.history) {
      const newId = idMap.get(h.oldId);
      if (!newId) continue;
      const payload = encodeHistoryPayload({ todoId: newId as string, counts: new Map(h.counts) });
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
    // plain task switching mode/threshold: keep rendered state stable.
    // storage is always counts — checkbox rendering just compares count >= threshold.
    if (!metadata.recur && ("mode" in patch || "threshold" in patch)) {
      const windowDay = dayIndexLocal(cur._creationTime);
      const c = metadata.counts?.[String(windowDay)] ?? 0;
      const th = thresholdOf(metadata);
      if (patch.mode === "count" && c === 0 && cur.isCompleted) {
        // seed the tally from the checked state so nothing visually changes
        metadata = { ...metadata, counts: { ...metadata.counts, [String(windowDay)]: th } };
      } else if (metadata.counts) {
        isCompleted = (metadata.counts[String(windowDay)] ?? 0) >= th;
      }
    }
    const updated: PlainNode = {
      v: 2,
      title: cur.title,
      isCompleted,
      parentId: cur.parentId,
      order: cur.order,
      metadata,
    };
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
        alert("cannot move a task into its own sub-task");
        return;
      }
    }
    if (draggedId === targetParentId) return;
    // compute new order fractional
    let siblings: TreeNode[];
    if (targetParentId === null) siblings = tree.roots;
    else {
      const p = tree.map.get(targetParentId);
      siblings = p ? p.children : [];
    }
    // siblings excluding dragged if same parent
    const filtered = siblings.filter((s) => s._id !== draggedId);
    if (filtered.some((s) => s.title === dragged.title)) {
      alert("a task with that path already exists at the destination");
      return;
    }
    let newOrder: number;
    if (filtered.length === 0) newOrder = 0;
    else if (targetIndex <= 0) newOrder = filtered[0].order - 1;
    else if (targetIndex >= filtered.length) newOrder = filtered[filtered.length - 1].order + 1;
    else newOrder = (filtered[targetIndex - 1].order + filtered[targetIndex].order) / 2;

    const updated: PlainNode = {
      v: 2,
      title: dragged.title,
      isCompleted: dragged.isCompleted,
      parentId: targetParentId,
      order: newOrder,
      metadata: dragged.metadata,
    };
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

  // Recursive renderer
  function isValidDropTarget(node: TreeNode): boolean {
    if (!dragId) return false;
    if (dragId === node._id) return false;
    const draggedTree = tree.map.get(dragId);
    if (draggedTree) {
      const desc = collectDescendants(draggedTree).map(String);
      // cannot drop onto the dragged subtree, nor as a sibling inside it
      if (desc.includes(node._id as string)) return false;
      if (node.parentId && desc.includes(node.parentId)) return false;
    }
    return true;
  }

  function RenderNode({ node }: { node: TreeNode }) {
    const isExpanded = !collapsed.has(node._id) || !!search; // folders open by default; search auto-expands
    const isEditing = editingId === node._id;
    const isSelected = selectedId === node._id;
    const hasChildren = node.children.length > 0;
    const show = matches(node);
    if (!show) return null;
    const isFading = node.isCompleted && fadingIds.has(node._id as string);
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
          if (!dragId || !isValidDropTarget(node)) return;
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
          if (dragId && isValidDropTarget(node)) {
            const pos = dropPosFor(e);
            if (pos === "child") {
              // nested under this node (append)
              handleMove(dragId, node._id as string, node.children.length);
            } else {
              // sibling insertion — index computed against siblings excluding the dragged node
              const siblings = node.parentId === null ? tree.roots : (tree.map.get(node.parentId)?.children ?? []);
              const filtered = siblings.filter((s) => s._id !== dragId);
              const idx = filtered.findIndex((s) => s._id === node._id);
              handleMove(dragId, node.parentId, pos === "before" ? idx : idx + 1);
            }
          }
          setDragId(null);
          setDropHint(null);
        }}
        className={`border-b border-foreground/10 last:border-b-0 transition-opacity duration-1000 ${dragId === node._id ? "opacity-40" : ""} ${isSelected ? "bg-foreground/5" : ""} ${isFading ? "opacity-20" : "opacity-100"}`}
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

          {mode === "count" ? (
            // tally rendering — storage underneath is still a count
            <div className="flex h-4 shrink-0 items-center">
              {count > 0 && (
                <button
                  onClick={() => handleCountDown(node)}
                  className="h-4 w-4 border border-foreground text-[10px] leading-none opacity-60 hover:opacity-100"
                  aria-label="decrement tally"
                >
                  −
                </button>
              )}
              <button
                onClick={() => handleCountUp(node)}
                className={`h-4 min-w-[20px] border px-0.5 text-[10px] leading-none ${
                  count > 0 ? "border-foreground bg-foreground text-background" : "border-foreground bg-background"
                }`}
                aria-label="increment tally"
                title="click to count +1"
              >
                {count}
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
            </button>
          )}

          <span className="flex gap-2 text-xs shrink-0 items-center">
            <button onClick={() => setAddChildParent(node._id)} className="opacity-40 hover:opacity-100">
              +child
            </button>
            <button onClick={() => startEdit(node)} className="opacity-40 hover:opacity-100 hidden sm:inline">
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
              <RenderNode key={child._id} node={child} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div className="w-full max-w-[720px] border border-foreground bg-background">
      <div className="flex items-center justify-between border-b border-foreground px-3 py-2 text-xs">
        <span className="flex items-center gap-2">
          <span>E2E Encrypted</span>
        </span>
        <span className="flex items-center gap-3">
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
          <button onClick={() => lock()} className="opacity-60 hover:opacity-100 underline underline-offset-4">
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

      {globalCounts && (
        <div className="border-b border-foreground/10 px-3 py-2">
          <div className="mb-1 text-[10px] uppercase opacity-40">activity — past year</div>
          <Heatmap counts={globalCounts} nowTs={nowTs} />
        </div>
      )}

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
            const siblings = targetParentId === null ? tree.roots : (tree.map.get(targetParentId)?.children ?? []);
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
              <RenderNode key={root._id} node={root} />
            ))}
          </ul>
        )}
      </div>

      {confirmNode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
          onClick={() => setConfirmDeleteId(null)}
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
                {`"${confirmNode.title.length > 48 ? `${confirmNode.title.slice(0, 48)}…` : confirmNode.title}"`}
              </span>
            </h2>
            <p className="mt-3 font-mono text-xs leading-relaxed opacity-70">
              {confirmCount > 1
                ? `// ${confirmCount - 1} nested node${confirmCount - 1 === 1 ? "" : "s"} terminated alongside it`
                : "// task will be purged"}
              — recoverable for {UNDO_TTL_SECONDS}s via undo.
            </p>
            <div className="mt-6 flex justify-end gap-2 font-mono text-xs">
              <button
                autoFocus
                onClick={() => setConfirmDeleteId(null)}
                className="border border-foreground bg-background px-4 py-2 hover:bg-foreground/10 focus:outline-none focus:ring-1 focus:ring-foreground"
              >
                cancel
              </button>
              <button
                onClick={() => handleDelete(confirmNode)}
                className="border border-foreground bg-foreground px-4 py-2 text-background hover:opacity-90 focus:outline-none"
              >
                delete
              </button>
            </div>
            <p className="mt-3 text-right font-mono text-[11px] opacity-30">&gt; auto-abort in {confirmCountdown}s • [esc] cancel</p>
          </div>
        </div>
      )}

      {undoState && (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 border border-foreground bg-background px-4 py-2 text-xs shadow-sm">
          <span>
            deleted {undoState.snap.count} task{undoState.snap.count === 1 ? "" : "s"}
          </span>
          <button onClick={handleUndo} className="border border-foreground px-2 py-0.5 hover:bg-foreground hover:text-background">
            undo
          </button>
          <span className="font-mono opacity-40">{undoState.ttl}s</span>
          <button onClick={() => setUndoState(null)} className="opacity-60 hover:opacity-100" aria-label="dismiss undo">
            ×
          </button>
        </div>
      )}

      {selectedNode && (
        <MetadataPanel
          node={selectedNode}
          onUpdateMetadata={handleUpdateMetadata}
          onClose={() => setSelectedId(null)}
          nowTs={nowTs}
          historyCounts={history?.byTodo.get(selectedNode._id as string) ?? null}
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
