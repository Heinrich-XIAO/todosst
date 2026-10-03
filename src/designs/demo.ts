"use client";

import { useCallback, useState } from "react";
import { STARTER_TASKS, type DemoTask } from "./content";

const RECURRENCE = /(?:^|\s)(~(?:daily|weekly|weekdays|monthly|yearly|every\s?\d+[dwy](?:\s+\w+(?:,\w+)*)?))/i;

/**
 * The interactive demo every /design/* page embeds: a local task list driven by
 * the same input grammar the real app uses. Purely client-side — nothing here
 * touches Convex, so the pages render with or without a backend.
 */
export function useDemo() {
  const [tasks, setTasks] = useState<DemoTask[]>(STARTER_TASKS);
  const [draft, setDraft] = useState("");

  const add = useCallback(() => {
    const raw = draft.trim();
    if (!raw) return;
    setDraft("");

    let title = raw;
    let tag: string | undefined;

    const rec = raw.match(RECURRENCE);
    if (rec) {
      tag = rec[1].replace(/\s+/g, " ");
      title = (raw.slice(0, rec.index) + raw.slice((rec.index ?? 0) + rec[1].length)).trim();
    }

    if (title.startsWith("/")) {
      const path = title.split(" ")[0];
      const rest = title.slice(path.length).trim();
      tag = tag ?? path;
      title = rest || path;
    }

    if (!title) return;
    setTasks((prev) => [
      ...prev,
      { id: Date.now(), title, done: false, tag, ...(tag?.startsWith("~") ? { count: 0, goal: 1 } : {}) },
    ]);
  }, [draft]);

  const toggle = useCallback((id: number) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }, []);

  const done = tasks.filter((t) => t.done).length;
  const open = tasks.length - done;

  return { tasks, draft, setDraft, add, toggle, done, open };
}
