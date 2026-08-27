"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { AuthForm } from "./AuthForm";

type Filter = "all" | "active" | "completed";

function TodoList() {
  const todos = useQuery(api.todos.list);
  const createTodo = useMutation(api.todos.create);
  const toggleTodo = useMutation(api.todos.toggle);
  const removeTodo = useMutation(api.todos.remove);
  const updateTitle = useMutation(api.todos.updateTitle);
  const clearCompleted = useMutation(api.todos.clearCompleted);

  const [newTitle, setNewTitle] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editingId, setEditingId] = useState<Id<"todos"> | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isLoading = todos === undefined;
  const list = todos ?? [];

  const filtered = list.filter((t: (typeof list)[number]) => {
    if (filter === "active") return !t.isCompleted;
    if (filter === "completed") return t.isCompleted;
    return true;
  });

  const activeCount = list.filter((t: (typeof list)[number]) => !t.isCompleted).length;
  const completedCount = list.filter((t: (typeof list)[number]) => t.isCompleted).length;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    if (title.length > 200) {
      alert("Title too long (max 200)");
      return;
    }
    setIsCreating(true);
    try {
      await createTodo({ title });
      setNewTitle("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create todo");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleToggle(id: Id<"todos">) {
    try {
      await toggleTodo({ id });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function handleDelete(id: Id<"todos">) {
    try {
      await removeTodo({ id });
    } catch {
      // silent
    }
  }

  function startEdit(todo: (typeof list)[number]) {
    setEditingId(todo._id);
    setEditValue(todo.title);
  }

  async function commitEdit(id: Id<"todos">) {
    const v = editValue.trim();
    if (!v) {
      setEditingId(null);
      return;
    }
    if (v.length > 200) {
      alert("Title too long");
      return;
    }
    try {
      await updateTitle({ id, title: v });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update");
    }
    setEditingId(null);
  }

  return (
    <div className="w-full max-w-[640px]">
      <form
        onSubmit={handleCreate}
        className="group relative flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-[0_2px_20px_rgba(0,0,0,0.04)] transition focus-within:border-zinc-300 focus-within:shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3.5V12.5M3.5 8H12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <input
          ref={inputRef}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a new task…"
          className="flex-1 bg-transparent text-[15px] placeholder:text-zinc-400 focus:outline-none"
          maxLength={200}
        />
        <button
          type="submit"
          disabled={!newTitle.trim() || isCreating}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isCreating ? "Adding…" : "Add"}
        </button>
      </form>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_2px_20px_rgba(0,0,0,0.04)]">
        {isLoading ? (
          <div className="p-8">
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-5 w-5 animate-pulse rounded-full bg-zinc-100" />
                  <div className="h-4 flex-1 animate-pulse rounded bg-zinc-100" />
                </div>
              ))}
            </div>
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center px-8 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-50 ring-1 ring-zinc-200">
              <span className="text-xl">✦</span>
            </div>
            <h3 className="mt-4 text-[15px] font-semibold text-zinc-900">No todos yet</h3>
            <p className="mt-1 max-w-sm text-sm leading-6 text-zinc-500">
              Add your first task above. Tasks sync in real-time via Convex and are private to your account.
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-zinc-100">
              {filtered.map((todo: (typeof list)[number]) => (
                <li key={todo._id} className="group flex items-center gap-3 px-4 py-3 hover:bg-zinc-50/70">
                  <button
                    onClick={() => handleToggle(todo._id)}
                    aria-label={todo.isCompleted ? "Mark as active" : "Mark as completed"}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                      todo.isCompleted ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white group-hover:border-zinc-400"
                    }`}
                  >
                    {todo.isCompleted && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
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
                      className="flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-[14px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    />
                  ) : (
                    <button
                      onDoubleClick={() => startEdit(todo)}
                      onClick={() => startEdit(todo)}
                      className={`flex-1 text-left text-[14.5px] leading-6 ${todo.isCompleted ? "text-zinc-400 line-through" : "text-zinc-800"}`}
                    >
                      {todo.title}
                    </button>
                  )}
                  <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    {editingId !== todo._id && (
                      <button onClick={() => startEdit(todo)} className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    )}
                    <button onClick={() => handleDelete(todo._id)} className="rounded-full p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <path d="M3 6h18" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {filtered.length === 0 && <div className="px-6 py-8 text-center text-sm text-zinc-500">No {filter} tasks.</div>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50/60 px-4 py-3">
              <span className="text-xs font-medium text-zinc-600">
                {activeCount} {activeCount === 1 ? "item" : "items"} left
              </span>
              <div className="flex items-center gap-1 rounded-full bg-white p-1 ring-1 ring-zinc-200">
                {(["all", "active", "completed"] as Filter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${filter === f ? "bg-zinc-900 text-white shadow" : "text-zinc-600 hover:bg-zinc-50"}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button onClick={() => clearCompleted()} disabled={completedCount === 0} className="text-xs font-medium text-zinc-500 hover:text-zinc-800 disabled:opacity-40">
                Clear completed ({completedCount})
              </button>
            </div>
          </>
        )}
      </div>
      <p className="mt-4 text-center text-xs leading-5 text-zinc-400">Double-click a task to edit • Real-time sync with Convex • Private per account</p>
    </div>
  );
}

export function TodoApp() {
  return (
    <>
      <AuthLoading>
        <div className="w-full max-w-[640px] rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
          <p className="mt-3 text-sm text-zinc-500">Loading…</p>
        </div>
      </AuthLoading>
      <Unauthenticated>
        <div className="flex w-full flex-col items-center">
          <AuthForm />
          <p className="mt-4 max-w-[420px] text-center text-xs leading-5 text-zinc-400">
            Works on any <code className="rounded bg-zinc-100 px-1 py-0.5">.vercel.app</code> domain — no custom domain required. Passwords are hashed, cookies are HttpOnly and SameSite=Lax.
          </p>
        </div>
      </Unauthenticated>
      <Authenticated>
        <TodoList />
      </Authenticated>
    </>
  );
}
