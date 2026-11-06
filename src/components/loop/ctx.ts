"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { LoopModel, NamedDef, TypeMap, WorkflowMap } from "@/lib/loopModel";
import type { RuleDef, ViewDef } from "../../../convex/loopLogic";

export function useLoopMutations() {
  return {
    capture: useMutation(api.loop.capture),
    attach: useMutation(api.loop.attach),
    detach: useMutation(api.loop.detach),
    dismissSignal: useMutation(api.loop.dismissSignal),
    createItem: useMutation(api.loop.createItem),
    updateItem: useMutation(api.loop.updateItem),
    mergeItems: useMutation(api.loop.mergeItems),
    unmergeItem: useMutation(api.loop.unmergeItem),
    linkItems: useMutation(api.loop.linkItems),
    unlinkItems: useMutation(api.loop.unlinkItems),
    startRun: useMutation(api.loop.startRun),
    // ticks land instantly; the server confirms (and may advance the run) a beat later
    toggleStep: useMutation(api.loop.toggleStep).withOptimisticUpdate((store, args) => {
      const runs = store.getQuery(api.loop.runs, {});
      if (!runs) return;
      store.setQuery(
        api.loop.runs,
        {},
        runs.map((r) =>
          r._id === args.runId
            ? { ...r, steps: r.steps.map((st) => (st.id === args.stepId ? { ...st, done: args.done } : st)) }
            : r,
        ),
      );
    }),
    cancelRun: useMutation(api.loop.cancelRun),
    saveDef: useMutation(api.loop.saveDef),
    applyDraft: useMutation(api.loop.applyDraft),
    discardDraft: useMutation(api.loop.discardDraft),
    rollbackDef: useMutation(api.loop.rollbackDef),
    retireDef: useMutation(api.loop.retireDef),
    startSystemChange: useMutation(api.loop.startSystemChange),
  };
}
export type LoopMutations = ReturnType<typeof useLoopMutations>;

/** Everything a loop screen needs, assembled once by LoopView. */
export type LoopCtx = {
  now: number;
  online: boolean;
  model: LoopModel;
  types: TypeMap;
  workflows: WorkflowMap;
  views: NamedDef<ViewDef>[];
  rules: NamedDef<RuleDef>[];
  defs: Doc<"defs">[];
  links: Doc<"links">[];
  runs: Doc<"runs">[];
  m: LoopMutations;
  /** await a mutation; a failure becomes a visible notice instead of an unhandled rejection */
  act: <T>(p: Promise<T>) => Promise<T | undefined>;
  /** like act, but reports whether it succeeded (for mutations that return nothing) */
  actOk: (p: Promise<unknown>) => Promise<boolean>;
  notify: (message: string) => void;
  openItem: (id: string) => void;
};

/** Convex wraps server errors in request ids and stack text — show only the message. */
export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const m = /Uncaught Error:\s*([^\n]+)/.exec(raw);
  return (m ? m[1] : raw.split("\n")[0]).replace(/\s+at handler.*$/, "").trim() || "something went wrong";
}
