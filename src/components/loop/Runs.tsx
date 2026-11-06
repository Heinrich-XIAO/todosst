"use client";

import { useState } from "react";
import type { Doc } from "../../../convex/_generated/dataModel";
import { DAY_MS, daysLeft, workflowRecord } from "../../../convex/loopLogic";
import { ago } from "@/lib/loopModel";
import type { LoopCtx } from "./ctx";
import { Btn, Label, Tag } from "./ui";

// Attempts to fix things. A run is not "done" when its steps are ticked: it
// then waits out a quiet window, and only counts as held if the problem
// really stays away. A recurrence reopens it with the evidence attached.

const STATUS_LABEL: Record<Doc<"runs">["status"], string> = {
  active: "working",
  verifying: "verifying",
  verified: "held",
  reopened: "came back",
  cancelled: "cancelled",
  done: "done",
};

export function Runs({ ctx }: { ctx: LoopCtx }) {
  const runs = ctx.runs;
  const open = runs.filter((r) => r.status === "active" || r.status === "verifying");
  const past = runs.filter((r) => r.status !== "active" && r.status !== "verifying");
  const record = workflowRecord(runs);
  const [showPast, setShowPast] = useState(false);

  return (
    <div className="pb-6">
      {open.length === 0 ? (
        <p className="px-3 py-10 text-center font-mono text-xs opacity-60">
          no fixes in progress. open a problem and start a run — it will tell you whether the fix actually worked.
        </p>
      ) : (
        <ul>
          {open.map((r) => (
            <RunCard key={r._id} run={r} ctx={ctx} />
          ))}
        </ul>
      )}

      {Object.keys(record).length > 0 && (
        <>
          <Label>what has worked</Label>
          <ul className="px-3 font-mono text-xs">
            {Object.entries(record).map(([key, rec]) => (
              <li key={key} className="flex justify-between border-b border-foreground/10 py-1.5">
                <span>{ctx.workflows[key]?.def.name ?? key}</span>
                <span className="opacity-70">
                  held {rec.held} of {rec.held + rec.reopened}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {past.length > 0 && (
        <div className="mt-3 border-t border-foreground/10">
          <button onClick={() => setShowPast((v) => !v)} className="px-3 py-2 font-mono text-[11px] opacity-60 hover:opacity-100">
            {showPast ? "hide" : "show"} past runs ({past.length})
          </button>
          {showPast && (
            <ul>
              {past.map((r) => (
                <RunCard key={r._id} run={r} ctx={ctx} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function RunCard({ run, ctx }: { run: Doc<"runs">; ctx: LoopCtx }) {
  const { now, model } = ctx;
  const items = run.itemIds.map((id) => model.items.get(model.rootOf(id as string))).filter((x) => !!x);
  const doneSteps = run.steps.filter((s) => s.done).length;
  const drafts = ctx.defs.filter((d) => d.runId === run._id && d.status === "draft");
  const everySignal = [...model.items.values()].flatMap((i) => i.signals);
  const evidence = (run.evidence ?? []).map((id) => everySignal.find((s) => s._id === id)).filter((s) => !!s);

  const windowPct =
    run.status === "verifying" && run.verifyStartedAt !== undefined && run.verifyUntil !== undefined
      ? Math.min(100, Math.max(0, ((now - run.verifyStartedAt) / (run.verifyUntil - run.verifyStartedAt)) * 100))
      : null;

  return (
    <li className="border-b border-foreground/10 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-words text-sm leading-snug">{run.title}</p>
        <Tag>{STATUS_LABEL[run.status]}</Tag>
      </div>
      {run.hypothesis && <p className="mt-1 font-mono text-[11px] opacity-60">hypothesis: {run.hypothesis}</p>}
      <p className="mt-1 flex flex-wrap gap-x-3 font-mono text-[11px] opacity-60">
        <span>{ctx.workflows[run.workflowKey]?.def.name ?? run.workflowKey}</span>
        <span>started {ago(run.startedAt, now)}</span>
        <span>was {run.baselineRate}/wk</span>
        {run.resultRate !== undefined && <span>now {run.resultRate}/wk</span>}
      </p>
      <p className="mt-1 flex flex-wrap gap-1.5">
        {items.map((i) => (
          <button
            key={i!.id}
            onClick={() => ctx.openItem(i!.id)}
            className="max-w-full truncate border border-foreground/30 px-1.5 py-px text-left text-[11px] hover:bg-foreground hover:text-background"
          >
            {i!.item.title}
          </button>
        ))}
      </p>

      {run.status === "active" && (
        <ul className="mt-2">
          {run.steps.map((s) => (
            <li key={s.id}>
              <label className="flex cursor-pointer items-start gap-2 py-1 text-xs">
                <input
                  type="checkbox"
                  checked={s.done}
                  onChange={(e) => void ctx.act(ctx.m.toggleStep({ runId: run._id, stepId: s.id, done: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-foreground"
                />
                <span className={s.done ? "line-through opacity-50" : ""}>{s.title}</span>
              </label>
            </li>
          ))}
          <li className="pt-1 font-mono text-[11px] opacity-60">
            {doneSteps}/{run.steps.length} done
            {run.verifyDays > 0 ? ` · then ${run.verifyDays} days quiet to count as fixed` : ""}
          </li>
        </ul>
      )}

      {run.status === "verifying" && run.verifyUntil !== undefined && windowPct !== null && (
        <div className="mt-2">
          <div className="h-1.5 w-full border border-foreground/40">
            <div className="h-full bg-foreground" style={{ width: `${windowPct}%` }} />
          </div>
          <p className="mt-1 font-mono text-[11px]">
            {daysLeft(run.verifyUntil, now)} day{daysLeft(run.verifyUntil, now) === 1 ? "" : "s"} left · any recurrence reopens
            {run.tolerance > 0 ? ` after ${run.tolerance} slip${run.tolerance === 1 ? "" : "s"}` : ""}
          </p>
        </div>
      )}

      {run.status === "reopened" && (
        <div className="mt-2 font-mono text-[11px]">
          <p>it came back{run.endedAt && run.verifyStartedAt ? ` ${Math.max(1, Math.round((run.endedAt - run.verifyStartedAt) / DAY_MS))} day(s) in` : ""}:</p>
          <ul className="mt-1 opacity-70">
            {evidence.slice(0, 5).map((s) => (
              <li key={s!._id} className="truncate">
                · {s!.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {drafts.length > 0 && <p className="mt-2 font-mono text-[11px] opacity-70">{drafts.length} draft change{drafts.length === 1 ? "" : "s"} waiting in the system tab</p>}

      {(run.status === "active" || run.status === "verifying") && (
        <div className="mt-2">
          <Btn onClick={() => void ctx.act(ctx.m.cancelRun({ runId: run._id }))}>cancel run</Btn>
        </div>
      )}
    </li>
  );
}
