"use client";

import { useAction, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { changedFiles, runAgent, type Activity, type PriorTurn } from "@/lib/agentLoop";
import { evaluateProgram } from "@/lib/engine";
import type { Files, LogEntry } from "@/lib/runtime";

export type AgentRun = { text: string; activity: Activity[]; error?: string };

export function useAgent(files: Files | undefined, log: LogEntry[], prior: PriorTurn[]) {
  const step = useAction(api.agent.step);
  const post = useMutation(api.program.post);
  const addLog = useMutation(api.log.add);
  const [run, setRun] = useState<AgentRun | null>(null);
  const abort = useRef(false);
  const state = useRef({ files, log, prior });
  useEffect(() => {
    state.current = { files, log, prior };
  }, [files, log, prior]);

  const send = useCallback(
    async (text: string) => {
      const { files, log, prior } = state.current;
      if (!files || !text.trim() || (run && !run.error)) return;
      abort.current = false;
      setRun({ text, activity: [] });
      const onActivity = (a: Activity) =>
        setRun((r) => {
          if (!r) return r;
          const last = r.activity[r.activity.length - 1];
          const activity = last?.label === "thinking" ? [...r.activity.slice(0, -1), a] : [...r.activity, a];
          return { ...r, activity };
        });
      try {
        await post({ role: "user", text });
        const result = await runAgent(text, files, prior, {
          step: (messages) => step({ messages }),
          evaluate: (f, now, days) => evaluateProgram(f, state.current.log, now, days),
          log: async (task, period, amount) => {
            await addLog({ task, period, amount });
          },
          history: log,
          now: Date.now(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          onActivity,
          aborted: () => abort.current,
        });
        await post({ role: "agent", text: result.reply, changes: changedFiles(files, result.draft) });
        setRun(null);
      } catch (err) {
        const message = err instanceof ConvexError ? String(err.data) : err instanceof Error ? err.message.split("\n")[0] : String(err);
        setRun((r) => (r ? { ...r, error: message } : r));
      }
    },
    [run, post, step, addLog],
  );

  return {
    run,
    send,
    stop: () => {
      abort.current = true;
    },
    dismiss: () => setRun(null),
  };
}
