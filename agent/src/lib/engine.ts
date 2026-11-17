import type { Evaluation, Files, LogEntry } from "./runtime";

// Runs program evaluations in a Web Worker so user code can neither touch the
// page nor freeze it. A run that takes too long kills the worker.

const TIMEOUT_MS = 2000;

type Pending = { resolve: (e: Evaluation) => void; timer: ReturnType<typeof setTimeout> };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function timedOut(): Evaluation {
  return { days: [], tasks: [], errors: [{ file: "(program)", message: `evaluation took longer than ${TIMEOUT_MS / 1000}s; is there an infinite loop?` }] };
}

function spawn(): Worker {
  const w = new Worker(new URL("./program.worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<{ id: number; result?: Evaluation; error?: string }>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(e.data.id);
    p.resolve(e.data.result ?? { days: [], tasks: [], errors: [{ file: "(program)", message: e.data.error ?? "unknown error" }] });
  };
  return w;
}

export function evaluateProgram(files: Files, log: LogEntry[], now: number, days: string[]): Promise<Evaluation> {
  worker ??= spawn();
  const id = nextId++;
  const w = worker;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      w.terminate();
      if (worker === w) worker = null;
      for (const [otherId, p] of pending) {
        clearTimeout(p.timer);
        p.resolve(timedOut());
        pending.delete(otherId);
      }
      resolve(timedOut());
    }, TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    w.postMessage({ id, files, log, now, days });
  });
}
