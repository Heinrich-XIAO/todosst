import { compileWithFunction, evaluate, type Files, type LogEntry } from "./runtime";

type Request = { id: number; files: Files; log: LogEntry[]; now: number; days: string[] };

self.onmessage = (e: MessageEvent<Request>) => {
  const { id, files, log, now, days } = e.data;
  try {
    const result = evaluate(files, log, { now, days, compile: compileWithFunction });
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
