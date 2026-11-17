"use client";

import { useMutation, useQuery } from "convex/react";
import type { OptimisticUpdate } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import { evaluateProgram } from "@/lib/engine";
import { addDays, dateKey, type Evaluation, type Files, type LogEntry } from "@/lib/runtime";

const EMPTY_LOG: LogEntry[] = [];
export const HORIZON_DAYS = 7;

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    const wake = () => document.visibilityState === "visible" && setNow(Date.now());
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [intervalMs]);
  return now;
}

const optimisticLog: OptimisticUpdate<FunctionArgs<typeof api.log.add>> = (store, args) => {
  const current = store.getQuery(api.log.list, {});
  if (current) store.setQuery(api.log.list, {}, [...current, { ...args, at: Date.now() }]);
};

export function useProgram() {
  const rows = useQuery(api.program.files);
  const logRows = useQuery(api.log.list);
  const now = useNow();
  const files: Files | undefined = useMemo(
    () => (rows ? Object.fromEntries(rows.map((r) => [r.path, r.source])) : undefined),
    [rows],
  );
  const log = logRows ?? EMPTY_LOG;
  const today = dateKey(new Date(now));
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);

  useEffect(() => {
    if (!files || !logRows) return;
    let live = true;
    const days = Array.from({ length: HORIZON_DAYS }, (_, i) => addDays(today, i));
    evaluateProgram(files, logRows, now, days).then((ev) => live && setEvaluation(ev));
    return () => {
      live = false;
    };
  }, [files, logRows, now, today]);

  const addLog = useMutation(api.log.add).withOptimisticUpdate(optimisticLog);

  return { files, log, now, today, evaluation, loading: !files || !logRows, addLog };
}
