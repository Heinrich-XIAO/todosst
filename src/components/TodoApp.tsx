"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { AuthForm } from "./AuthForm";
import { useEncryption } from "./EncryptionContext";

type Filter = "all" | "active" | "completed";

type DecryptedTodo = {
  _id: Id<"todos">;
  _creationTime: number;
  title: string;
  isCompleted: boolean;
  // keep raw for patching if needed
  _raw: { ciphertext?: string; iv?: string; title?: string; isCompleted?: boolean };
};

function UnlockScreen() {
  const { unlock, isReady } = useEncryption();
  const viewer = useQuery(api.users.viewer);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const convex = useConvex();

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      // Prefer mySalt from server; fallback to getSalt by email
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
      await unlock(password);
      // Test decryption by fetching one todo? Just succeed — TodoQueue will surface decrypt errors
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
        your todos are end-to-end encrypted. enter your password to derive the encryption key (PBKDF2 → AES-GCM). the
        server never sees your titles.
      </p>
      <form onSubmit={handleUnlock} className="mt-4 space-y-3">
        <input
          type="password"
          autoComplete="current-password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border-b border-foreground bg-transparent py-2 text-sm placeholder:text-foreground/40 focus:outline-none"
        />
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

function TodoQueue() {
  const { key, isLocked, encryptTodo: encTodo, decryptTodo: decTodo, isReady } = useEncryption();
  const todos = useQuery(api.todos.list);
  const createTodo = useMutation(api.todos.create);
  const updateTodo = useMutation(api.todos.update);
  const removeTodo = useMutation(api.todos.remove);
  const clearCompleted = useMutation(api.todos.clearCompleted);

  const [newTitle, setNewTitle] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editingId, setEditingId] = useState<Id<"todos"> | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [decrypted, setDecrypted] = useState<DecryptedTodo[] | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  const isLoading = todos === undefined;

  // Decrypt whenever todos or key changes
  useEffect(() => {
    if (todos === undefined) return;
    if (!key) {
      setDecrypted(null);
      setDecryptError(null);
      return;
    }
    let cancelled = false;
    setIsDecrypting(true);
    setDecryptError(null);
    (async () => {
      try {
        const out: DecryptedTodo[] = [];
        for (const t of todos) {
          // Legacy plaintext todo (no ciphertext) — migrate display as plaintext
          if (!t.ciphertext || !t.iv) {
            out.push({
              _id: t._id,
              _creationTime: t._creationTime,
              title: (t.title as string) ?? "(legacy)",
              isCompleted: (t.isCompleted as boolean) ?? false,
              _raw: { title: t.title, isCompleted: t.isCompleted },
            });
            continue;
          }
          try {
            const plain = await decTodo(t.iv, t.ciphertext);
            // Validate
            if (plain.title.length > 200) throw new Error("title too long");
            out.push({
              _id: t._id,
              _creationTime: t._creationTime,
              title: plain.title,
              isCompleted: plain.isCompleted,
              _raw: { ciphertext: t.ciphertext, iv: t.iv },
            });
          } catch {
            // Wrong key or corrupted — surface as locked
            out.push({
              _id: t._id,
              _creationTime: t._creationTime,
              title: "— unable to decrypt —",
              isCompleted: false,
              _raw: { ciphertext: t.ciphertext, iv: t.iv },
            });
            if (!decryptError) setDecryptError("wrong password or corrupted vault — some items could not be decrypted.");
          }
        }
        if (!cancelled) setDecrypted(out);
      } finally {
        if (!cancelled) setIsDecrypting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [todos, key, decTodo]);

  const list = decrypted ?? [];
  const filtered = list.filter((t) => {
    if (filter === "active") return !t.isCompleted;
    if (filter === "completed") return t.isCompleted;
    return true;
  });
  const activeCount = list.filter((t) => !t.isCompleted).length;
  const completedCount = list.filter((t) => t.isCompleted).length;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || title.length > 200) return;
    if (!key) {
      alert("vault locked");
      return;
    }
    try {
      const { ciphertext, iv } = await encTodo({ title, isCompleted: false });
      await createTodo({ ciphertext, iv });
      setNewTitle("");
    } catch (err) {
      alert(err instanceof Error ? err.message.toLowerCase() : "failed");
    }
  }

  async function handleToggle(todo: DecryptedTodo) {
    if (!key) return;
    try {
      // Legacy todo: needs migration — encrypt first
      if (!todo._raw.ciphertext) {
        const { ciphertext, iv } = await encTodo({ title: todo.title, isCompleted: !todo.isCompleted });
        await updateTodo({ id: todo._id, ciphertext, iv });
        return;
      }
      const { ciphertext, iv } = await encTodo({ title: todo.title, isCompleted: !todo.isCompleted });
      await updateTodo({ id: todo._id, ciphertext, iv });
    } catch (e) {
      alert(e instanceof Error ? e.message.toLowerCase() : "failed");
    }
  }

  function startEdit(todo: DecryptedTodo) {
    setEditingId(todo._id);
    setEditValue(todo.title);
  }

  async function commitEdit(id: Id<"todos">) {
    const v = editValue.trim();
    if (!v || v.length > 200) {
      setEditingId(null);
      return;
    }
    if (!key) {
      setEditingId(null);
      return;
    }
    const current = list.find((t) => t._id === id);
    if (!current) {
      setEditingId(null);
      return;
    }
    try {
      const { ciphertext, iv } = await encTodo({ title: v, isCompleted: current.isCompleted });
      await updateTodo({ id, ciphertext, iv });
    } catch (e) {
      alert(e instanceof Error ? e.message.toLowerCase() : "failed");
    }
    setEditingId(null);
  }

  async function handleClearCompleted() {
    if (completedCount === 0) return;
    const ids = list.filter((t) => t.isCompleted).map((t) => t._id);
    try {
      await clearCompleted({ ids });
    } catch (e) {
      alert(e instanceof Error ? e.message.toLowerCase() : "failed");
    }
  }

  // Locked state — show unlock
  if (isLocked) {
    // Still ready? If not, wait for salt
    if (!isReady) return <p className="text-sm opacity-60">preparing vault…</p>;
    return <UnlockScreen />;
  }

  return (
    <div className="w-full max-w-[640px] border border-foreground bg-background">
      <div className="flex items-center justify-between border-b border-foreground px-3 py-2 text-xs opacity-60">
        <span>🔒 end-to-end encrypted</span>
        <span className="hidden sm:inline">only you can read your titles</span>
      </div>
      {/* queue input */}
      <form onSubmit={handleCreate} className="flex items-center gap-3 border-b border-foreground px-3 py-3">
        <input
          ref={inputRef}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="add to queue…"
          maxLength={200}
          className="flex-1 bg-transparent py-1 text-sm placeholder:text-foreground/40 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!newTitle.trim()}
          className="text-sm underline underline-offset-4 hover:opacity-60 disabled:opacity-20"
        >
          add
        </button>
      </form>

      {/* decrypt error banner */}
      {decryptError && (
        <div className="border-b border-foreground bg-background px-3 py-2 text-xs text-foreground">{decryptError}</div>
      )}

      {/* list */}
      <div className="min-h-[240px]">
        {isLoading || isDecrypting ? (
          <p className="px-3 py-8 text-sm opacity-60">loading…</p>
        ) : list.length === 0 ? (
          <div className="px-3 py-12 text-sm">
            <p>queue empty.</p>
          </div>
        ) : (
          <>
            <ul>
              {filtered.map((todo) => (
                <li
                  key={todo._id}
                  className="flex items-center gap-3 border-b border-foreground/10 px-3 py-3 text-sm last:border-b-0"
                >
                  <button
                    onClick={() => handleToggle(todo)}
                    className={`h-4 w-4 shrink-0 border flex items-center justify-center ${todo.isCompleted ? "border-foreground bg-foreground text-background" : "border-foreground bg-background"}`}
                    aria-label="toggle"
                  >
                    {todo.isCompleted && <span className="text-[10px] leading-none">✓</span>}
                  </button>

                  {editingId === todo._id ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(todo._id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit(todo._id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="flex-1 border-b border-foreground bg-transparent py-0.5 text-sm focus:outline-none"
                    />
                  ) : (
                    <button onClick={() => startEdit(todo)} className={`flex-1 text-left ${todo.isCompleted ? "line-through opacity-40" : ""}`}>
                      {todo.title}
                    </button>
                  )}

                  <span className="flex gap-3 text-xs">
                    {editingId !== todo._id && (
                      <button onClick={() => startEdit(todo)} className="opacity-40 hover:opacity-100">
                        edit
                      </button>
                    )}
                    <button onClick={() => removeTodo({ id: todo._id })} className="opacity-40 hover:opacity-100">
                      delete
                    </button>
                  </span>
                </li>
              ))}
            </ul>

            {filtered.length === 0 && <p className="px-3 py-8 text-sm opacity-60">no {filter} items.</p>}

            {/* queue meta */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-foreground px-3 py-2 text-xs">
              <span className="opacity-60">{activeCount} left</span>
              <span className="flex gap-2">
                {(["all", "active", "completed"] as Filter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={filter === f ? "underline underline-offset-4" : "opacity-60 hover:opacity-100"}
                  >
                    {f}
                  </button>
                ))}
              </span>
              <button
                onClick={handleClearCompleted}
                disabled={completedCount === 0}
                className="opacity-60 hover:opacity-100 disabled:opacity-20"
              >
                clear completed ({completedCount})
              </button>
            </div>
          </>
        )}
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
