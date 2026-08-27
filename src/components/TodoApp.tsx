"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { AuthForm } from "./AuthForm";

type Filter = "all" | "active" | "completed";

function TodoQueue() {
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
  const inputRef = useRef<HTMLInputElement>(null);

  const list = todos ?? [];
  const isLoading = todos === undefined;

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
    if (!title || title.length > 200) return;
    try {
      await createTodo({ title });
      setNewTitle("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleToggle(id: Id<"todos">) {
    try {
      await toggleTodo({ id });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  function startEdit(todo: (typeof list)[number]) {
    setEditingId(todo._id);
    setEditValue(todo.title);
  }

  async function commitEdit(id: Id<"todos">) {
    const v = editValue.trim();
    if (!v || v.length > 200) {
      setEditingId(null);
      return;
    }
    try {
      await updateTitle({ id, title: v });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    }
    setEditingId(null);
  }

  return (
    <div className="w-full max-w-[640px] border border-foreground bg-background">
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
        <button type="submit" disabled={!newTitle.trim()} className="text-sm underline underline-offset-4 hover:opacity-60 disabled:opacity-20">
          add
        </button>
      </form>

      {/* list */}
      <div className="min-h-[240px]">
        {isLoading ? (
          <p className="px-3 py-8 text-sm opacity-60">loading…</p>
        ) : list.length === 0 ? (
          <div className="px-3 py-12 text-sm">
            <p>queue empty.</p>
            <p className="mt-1 opacity-60">add your first item above. press enter to add.</p>
          </div>
        ) : (
          <>
            <ul>
              {filtered.map((todo: (typeof list)[number]) => (
                <li key={todo._id} className="flex items-center gap-3 border-b border-foreground/10 px-3 py-3 text-sm last:border-b-0">
                  <button
                    onClick={() => handleToggle(todo._id)}
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
                  <button key={f} onClick={() => setFilter(f)} className={filter === f ? "underline underline-offset-4" : "opacity-60 hover:opacity-100"}>
                    {f}
                  </button>
                ))}
              </span>
              <button onClick={() => clearCompleted()} disabled={completedCount === 0} className="opacity-60 hover:opacity-100 disabled:opacity-20">
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
