"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { AuthForm } from "./AuthForm";
import { useEncryption, getRememberedKey, setRememberedKey } from "./EncryptionContext";
import type { PlainNode } from "@/lib/crypto";
import { deriveExtractableKey, exportKeyB64 } from "@/lib/crypto";
import { usePathname } from "next/navigation";
import { parseBangCd, resolveCdPath, encodePathForUrl } from "@/lib/cdPath";

type Filter = "all" | "active" | "completed";

type DecryptedNode = PlainNode & {
  _id: Id<"todos">;
  _creationTime: number;
  _raw: { ciphertext?: string; iv?: string; title?: string; isCompleted?: boolean };
};

type TreeNode = DecryptedNode & { children: TreeNode[]; depth: number };

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
  const [storeLocally, setStoreLocally] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const convex = useConvex();
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isReady) passwordRef.current?.focus();
  }, [isReady]);

  // initialize checkbox from existing stored key (if user previously opted in)
  useEffect(() => {
    try {
      const remembered = getRememberedKey();
      if (remembered) setStoreLocally(true);
    } catch {}
  }, []);

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
        your queues are end-to-end encrypted — structure, titles, and metadata are opaque to the server. enter
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
}: {
  node: TreeNode | null;
  onUpdateMetadata: (id: Id<"todos">, patch: Partial<PlainNode["metadata"]>) => void;
  onClose: () => void;
}) {
  if (!node) return null;
  return (
    <div className="border-t border-foreground bg-background p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">{node.title} — details</span>
        <button onClick={onClose} className="opacity-60 hover:opacity-100">
          close
        </button>
      </div>
      <div className="mt-3 space-y-2">
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

function TodoQueue() {
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
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [editingId, setEditingId] = useState<Id<"todos"> | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"todos"> | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addChildParent, setAddChildParent] = useState<Id<"todos"> | null>(null);
  const [addChildTitle, setAddChildTitle] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<Id<"todos"> | null>(null);
  const newRootInputRef = useRef<HTMLInputElement>(null);
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

  const listFlat = nodes ?? [];
  const activeCount = listFlat.filter((n) => !n.isCompleted).length;
  const completedCount = listFlat.filter((n) => n.isCompleted).length;

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

  const selectedNode = selectedId ? (tree.map.get(selectedId) ?? null) : null;
  const ancestors = selectedId ? getAncestors(selectedId, tree.map) : [];

  // slash-path intellisense: autocomplete for "/..." input
  const slashComplete = useMemo(() => {
    if (!nodes) return { suggestions: [] as TreeNode[], prefix: "", parentId: null as string | null, dirPath: "" };
    if (!newRootTitle.startsWith("/")) return { suggestions: [] as TreeNode[], prefix: "", parentId: null as string | null, dirPath: "" };
    const withoutLeading = newRootTitle.slice(1);
    const parts = withoutLeading.split("/");
    const prefixRaw = parts[parts.length - 1] ?? "";
    const dirPartsRaw = parts.slice(0, -1);
    let parentId: string | null = null;
    for (const raw of dirPartsRaw) {
      const seg = raw.trim();
      if (!seg) return { suggestions: [] as TreeNode[], prefix: prefixRaw, parentId: null as string | null, dirPath: "" };
      const match = nodes.find((n) => n.title === seg && (n.parentId ?? null) === parentId);
      if (!match) return { suggestions: [] as TreeNode[], prefix: prefixRaw, parentId: null as string | null, dirPath: "" };
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
    return { suggestions: filtered, prefix, parentId, dirPath };
  }, [newRootTitle, nodes, tree]);

  useEffect(() => {
    setActiveSuggestIdx(0);
  }, [slashComplete.suggestions]);

  const applySlashSuggestion = useCallback(
    (title: string) => {
      const withoutLeading = newRootTitle.slice(1);
      const parts = withoutLeading.split("/");
      const dirParts = parts.slice(0, -1);
      const dirPrefix = dirParts.length ? "/" + dirParts.map((s) => s.trim()).filter(Boolean).join("/") + "/" : "/";
      const next = dirPrefix + title;
      setNewRootTitle(next);
      setActiveSuggestIdx(0);
      requestAnimationFrame(() => newRootInputRef.current?.focus());
    },
    [newRootTitle]
  );

  function parseSlashPath(input: string): string[] | null {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/")) return null;
    const parts = trimmed
      .split("/")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (parts.length === 0) return null;
    if (parts.some((p) => p.length > 200)) return null;
    return parts;
  }

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
        setNewRootTitle("");
        return;
      }
      // unknown bang command — just clear and ignore (don’t create a todo)
      setNewRootTitle("");
      return;
    }
    const slashParts = parseSlashPath(raw);
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
      for (const title of slashParts) {
        const existing = virtualNodes.find((n) => n.title === title && (n.parentId ?? null) === parentId);
        if (existing) {
          parentId = existing._id as string;
          chainIds.push(parentId);
          continue;
        }
        const curMax = maxOrderByParent.get(parentId);
        const order = curMax !== undefined ? curMax + 1 : 0;
        maxOrderByParent.set(parentId, order);
        const node: PlainNode = { v: 2, title, isCompleted: false, parentId: parentId as Id<"todos"> | null, order, metadata: {} };
        const { ciphertext, iv } = await cryptoEncNode(node);
        const newId = await createTodo({ ciphertext, iv });
        virtualNodes.push({
          v: 2,
          title,
          isCompleted: false,
          parentId,
          order,
          metadata: {},
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
      // expand all ancestors so newly created path is visible
      if (chainIds.length > 1) {
        setExpanded((prev) => {
          const next = new Set(prev);
          for (let i = 0; i < chainIds.length - 1; i++) next.add(chainIds[i]);
          return next;
        });
      }
      setNewRootTitle("");
      return;
    }
    // fallback: single task/queue
    const title = raw;
    if (title.length > 200) return;
    const roots = tree.roots;
    if (roots.some((r) => r.title === title)) {
      alert("a task with that path already exists");
      return;
    }
    const order = roots.length ? Math.max(...roots.map((r) => r.order)) + 1 : 0;
    const node: PlainNode = { v: 2, title, isCompleted: false, parentId: null, order, metadata: {} };
    const { ciphertext, iv } = await cryptoEncNode(node);
    await createTodo({ ciphertext, iv });
    setNewRootTitle("");
  }

  async function handleAddChild(parentId: Id<"todos">) {
    const title = addChildTitle.trim();
    if (!title || title.length > 200 || !key) return;
    const parent = tree.map.get(parentId);
    if (!parent) return;
    if (parent.children.some((c) => c.title === title)) {
      alert("a task with that path already exists");
      return;
    }
    const order = parent.children.length ? Math.max(...parent.children.map((c) => c.order)) + 1 : 0;
    const node: PlainNode = { v: 2, title, isCompleted: false, parentId, order, metadata: {} };
    const { ciphertext, iv } = await cryptoEncNode(node);
    await createTodo({ ciphertext, iv });
    setAddChildTitle("");
    setAddChildParent(null);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(parentId);
      return next;
    });
  }

  async function handleToggle(node: TreeNode) {
    if (!key) return;
    const updated: PlainNode = {
      v: 2,
      title: node.title,
      isCompleted: !node.isCompleted,
      parentId: node.parentId,
      order: node.order,
      metadata: node.metadata,
    };
    const { ciphertext, iv } = await cryptoEncNode(updated);
    await updateTodo({ id: node._id, ciphertext, iv });
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
    const ids = collectDescendants(node);
    // single op if only self
    if (ids.length === 1) {
      await removeTodo({ id: node._id });
    } else {
      // use bulk clearCompleted pattern (client-computed ids)
      await clearCompleted({ ids });
    }
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    setConfirmDeleteId(null);
  }

  async function handleUpdateMetadata(id: Id<"todos">, patch: Partial<PlainNode["metadata"]>) {
    if (!key || !nodes) return;
    const cur = nodes.find((n) => n._id === id);
    if (!cur) return;
    const updated: PlainNode = {
      v: 2,
      title: cur.title,
      isCompleted: cur.isCompleted,
      parentId: cur.parentId,
      order: cur.order,
      metadata: { ...cur.metadata, ...patch },
    };
    const { ciphertext, iv } = await cryptoEncNode(updated);
    await updateTodo({ id, ciphertext, iv });
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
        alert("cannot move a queue into its own sub-queue");
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
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(targetParentId);
        return next;
      });
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Auto-dismiss delete confirmation after 4s
  useEffect(() => {
    if (!confirmDeleteId) return;
    const t = window.setTimeout(() => setConfirmDeleteId(null), 4000);
    return () => window.clearTimeout(t);
  }, [confirmDeleteId]);

  if (isLocked) {
    if (!isReady) return <p className="text-sm opacity-60">preparing vault…</p>;
    return <UnlockScreen />;
  }

  // Recursive renderer
  function RenderNode({ node }: { node: TreeNode }) {
    const isExpanded = expanded.has(node._id) || !!search; // auto expand when searching
    const isEditing = editingId === node._id;
    const isSelected = selectedId === node._id;
    const hasChildren = node.children.length > 0;
    const show = matches(node);
    if (!show) return null;
    const isFading = node.isCompleted && fadingIds.has(node._id as string);
    // after 3s completed items are hidden by default; button shows them (always below active)
    if (isFading && !showCompleted && filter !== "completed") return null;
    return (
      <li
        draggable={!isEditing}
        onDragStart={(e) => {
          setDragId(node._id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDragId(null)}
        onDragOver={(e) => {
          if (dragId && dragId !== node._id) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (!dragId) return;
          // drop as child of this node (append)
          handleMove(dragId, node._id, node.children.length);
          setDragId(null);
        }}
        className={`border-b border-foreground/10 last:border-b-0 transition-opacity duration-1000 ${dragId === node._id ? "opacity-40" : ""} ${isSelected ? "bg-foreground/5" : ""} ${isFading ? "opacity-20" : "opacity-100"}`}
        style={{ paddingLeft: `${node.depth * 16 + 12}px` }}
      >
        <div className="flex items-center gap-2 py-2 pr-3 text-sm">
          <button
            onClick={() => hasChildren && toggleExpanded(node._id)}
            className={`h-4 w-4 shrink-0 flex items-center justify-center text-[10px] ${hasChildren ? "opacity-60 hover:opacity-100" : "opacity-0"}`}
            aria-label="toggle children"
          >
            {hasChildren ? (isExpanded ? "▾" : "▸") : "•"}
          </button>

          <button
            onClick={() => handleToggle(node)}
            className={`h-4 w-4 shrink-0 border flex items-center justify-center ${node.isCompleted ? "border-foreground bg-foreground text-background" : "border-foreground bg-background"}`}
            aria-label="toggle"
          >
            {node.isCompleted && <span className="text-[10px] leading-none">✓</span>}
          </button>

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
              onDoubleClick={() => startEdit(node)}
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
              <span className="flex items-center gap-1 border border-foreground bg-background px-1 py-0.5">
                <span className="opacity-70">
                  delete{collectDescendants(node).length > 1 ? ` ${collectDescendants(node).length}?` : "?"}
                </span>
                <button
                  onClick={() => handleDelete(node)}
                  className="bg-foreground px-1.5 py-0.5 text-background hover:opacity-90"
                >
                  yes
                </button>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="border border-foreground/20 px-1.5 py-0.5 hover:bg-foreground/10"
                >
                  no
                </button>
              </span>
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
          <div className="flex gap-2 py-2 pr-3" style={{ paddingLeft: `${(node.depth + 1) * 16 + 28}px` }}>
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
              placeholder="new sub-queue…"
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
          <span>🔒 fully encrypted tree</span>
          <span className="hidden sm:inline opacity-60">queues are nested — drag to move</span>
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

      {/* breadcrumb */}
      {selectedNode && (
        <div className="flex items-center gap-1 border-b border-foreground/10 px-3 py-2 text-xs overflow-x-auto">
          <button onClick={() => setSelectedId(null)} className="opacity-60 hover:opacity-100">
            root
          </button>
          {ancestors.map((a) => (
            <span key={a._id} className="flex items-center gap-1">
              <span className="opacity-20">/</span>
              <button onClick={() => setSelectedId(a._id)} className="hover:underline">
                {a.title}
              </button>
            </span>
          ))}
          <span className="opacity-20">/</span>
          <span className="font-medium truncate">{selectedNode.title}</span>
          <span className="ml-auto flex gap-2">
            <button onClick={() => setSelectedId(null)} className="opacity-60 hover:opacity-100">
              close
            </button>
          </span>
        </div>
      )}

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
              placeholder="/host hackathon/outreach write email template"
              maxLength={500}
              className="w-full bg-transparent py-1 text-sm placeholder:text-foreground/40 focus:outline-none"
            />
            {isSlashFocused && slashComplete.suggestions.length > 0 && newRootTitle.startsWith("/") && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[200px] overflow-auto border border-foreground bg-background shadow-sm">
                <div className="px-2 py-1 text-[10px] opacity-40 border-b border-foreground/10">
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
        {completedCount > 0 && (
          <button onClick={() => setShowCompleted((v) => !v)} className="underline underline-offset-4 hover:opacity-60">
            {showCompleted ? `hide completed (${completedCount})` : `show completed (${completedCount})`}
          </button>
        )}
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
          // drop on root area
          const dragged = nodes?.find((n) => n._id === dragId);
          if (dragged && dragged.parentId !== null) {
            handleMove(dragId, null, tree.roots.length);
          }
          setDragId(null);
        }}
      >
        {isLoading || isDecrypting ? (
          <p className="px-3 py-8 text-sm opacity-60">loading…</p>
        ) : listFlat.length === 0 ? (
          <div className="px-3 py-12 text-sm">
            <p>queue empty — add a top-level queue.</p>
            <p className="mt-1 text-xs opacity-60">later add children via +child</p>
          </div>
        ) : tree.roots.length === 0 ? (
          <p className="px-3 py-8 text-sm opacity-60">no matching queues.</p>
        ) : decryptError ? (
          <div className="border-b border-foreground bg-background px-3 py-2 text-xs">{decryptError}</div>
        ) : null}

        {!isLoading && !isDecrypting && listFlat.length > 0 && (
          <ul>
            {tree.roots.map((root) => (
              <RenderNode key={root._id} node={root} />
            ))}
          </ul>
        )}
      </div>

      {selectedNode && (
        <MetadataPanel node={selectedNode} onUpdateMetadata={handleUpdateMetadata} onClose={() => setSelectedId(null)} />
      )}

      {/* footer drop zone for root */}
      <div className="border-t border-foreground/10 px-3 py-2 text-xs opacity-60">
        drag any row onto another to nest • drop on empty area to move to root • double-click title to edit
      </div>
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
        <TodoQueue />
      </Authenticated>
    </>
  );
}
