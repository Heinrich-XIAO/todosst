"use client";

// AutoNudgeSync — dateless auto-nudge scheduler + reward reporter.
//
// Once per local day: picks ONE eligible dateless task uniformly at random,
// chooses its delivery hour from the contextual bandit (task-kind × hour arm,
// personal history blended with the global population prior, epsilon
// exploration), and uploads (a) anonymous numeric features + (b) a
// vault-encrypted FULL DUMP for future NN training. Battles/negatives,
// habits, due-date tasks and completed tasks are never picked.
// Rewards: opening the app from the push reports clicked (0.5); finishing the
// task within the window reports completed (1.0) — the server derives reward
// from the two timestamps.
//
// Wiring note: the policy lives here, client-side, because this is the only
// place with task plaintext. The server only stores anonymous aggregates
// (myStats/globalStats) and fires the chosen time blind.

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { PlainNode } from "@/lib/crypto";
import { dayIndexLocal, modeOf, thresholdOf, type RecurState } from "@/lib/recur";
import {
  appendLocalDump,
  buildAnonymousFeatures,
  buildFullDump,
  chooseHour,
  contextKeyOf,
  deliveryAtHour,
  eligibleAutoNudgeTasks,
  pickCandidate,
  randomDeliveryTime,
  recurKindOf,
} from "@/lib/autoNudge";
import { augmentTitle, nearestHour } from "@/lib/vibe";
import { embed, embedOne, embeddingsReady, warmEmbeddings } from "@/lib/embeddings";
import { getVector, listLabels, putVector, saveLabel, vectorIds } from "@/lib/vibeStore";
import { TimingDialog } from "./TimingDialog";
import { childrenOf, type DecryptedNode, type TreeNode } from "@/lib/tree";

type Props = {
  nodes: DecryptedNode[] | null;
  tree: { roots: TreeNode[]; map: Map<string, TreeNode> };
  recurStates: Map<string, RecurState> | null;
  history: { byTodo: Map<string, Map<number, number>> } | null;
  nowTs: number;
};

const DAY_KEY = "todosst:autoNudgeDay";
const PENDING_KEY = "todosst:autoNudgePending";
const LABELED_KEY = "todosst:labeledAuto";
const CLICK_PARAM = "auto";

// background embed sweep: a few unvectorized tasks per tick so creation-time
// embedding never blocks anything and covers every create path (input,
// composer, outbox replay) without touching them
const EMBED_BATCH = 5;

function readLabeled(): Set<string> {
  try {
    const raw = localStorage.getItem(LABELED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function markLabeled(eventId: string) {
  try {
    const set = readLabeled();
    set.add(eventId);
    localStorage.setItem(LABELED_KEY, JSON.stringify(Array.from(set).slice(-200)));
  } catch {}
}

type Pending = { eventId: string; todoId: string; day: number };

function readPending(): Pending | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Pending;
    if (typeof o.eventId !== "string" || typeof o.todoId !== "string") return null;
    return o;
  } catch {
    return null;
  }
}

export function AutoNudgeSync({ nodes, tree, recurStates, history, nowTs }: Props) {
  const schedule = useMutation(api.autoNudge.schedule);
  const reportOutcome = useMutation(api.autoNudge.reportOutcome);
  const myStats = useQuery(api.autoNudge.myStats);
  const globalStats = useQuery(api.autoNudge.globalStats);
  // label prompt state derives from the URL once (initializer, not an
  // effect) — the click effect below only reports + cleans the URL
  const doneRef = useRef<string | null>(null);
  const [labelReq, setLabelReq] = useState<{ eventId: string; todoId: string } | null>(() => {
    try {
      if (typeof window === "undefined") return null;
      const eid = new URL(window.location.href).searchParams.get(CLICK_PARAM);
      if (!eid || readLabeled().has(eid)) return null;
      const raw = localStorage.getItem(PENDING_KEY);
      const p = raw ? (JSON.parse(raw) as Pending) : null;
      if (p && p.eventId === eid && typeof p.todoId === "string") return { eventId: eid, todoId: p.todoId };
      return null;
    } catch {
      return null;
    }
  });

  // background model download: idle-first so first paint never waits for ~23MB
  useEffect(() => {
    try {
      const start = () => window.setTimeout(() => warmEmbeddings(), 1000);
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
      if (typeof ric === "function") ric(() => warmEmbeddings());
      else start();
    } catch {}
  }, []);

  // click attribution: ?auto=<eventId> from the push → half reward
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const eid = u.searchParams.get(CLICK_PARAM);
      if (eid) {
        u.searchParams.delete(CLICK_PARAM);
        window.history.replaceState(null, "", u.toString());
        void reportOutcome({ eventId: eid as Id<"autoNudgeEvents">, clicked: true }).catch(() => {});
      }
    } catch {}
  }, [reportOutcome]);

  // embed sweep: vectorize tasks created while the model was still
  // downloading (or on this device for the first time), a few per tick
  useEffect(() => {
    if (!nodes || !embeddingsReady()) return;
    let cancelled = false;
    void (async () => {
      try {
        const known = await vectorIds();
        const missing = nodes.filter((n) => !known.has(n._id as string) && n.title.trim().length > 0).slice(0, EMBED_BATCH);
        for (const n of missing) {
          if (cancelled) return;
          const hit = await getVector(n._id as string, n.title);
          if (hit || cancelled) continue;
          const vec = await embedOne(n.title);
          if (vec && !cancelled) await putVector(n._id as string, n.title, vec);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [nodes, nowTs]);

  // completion attribution: pending nudged task finished → full reward.
  // The server only honors completions inside the post-dispatch window.
  useEffect(() => {
    if (!nodes) return;
    const p = readPending();
    if (!p) return;
    const n = nodes.find((x) => (x._id as string) === p.todoId);
    if (!n) {
      try {
        localStorage.removeItem(PENDING_KEY);
      } catch {}
      return;
    }
    const rs = recurStates?.get(p.todoId);
    const meta = n.metadata as PlainNode["metadata"];
    const done = rs?.isRecurring ? rs.count >= thresholdOf(meta) : n.isCompleted;
    if (done) {
      try {
        localStorage.removeItem(PENDING_KEY);
      } catch {}
      void reportOutcome({ eventId: p.eventId as Id<"autoNudgeEvents">, completed: true }).catch(() => {});
    }
  }, [nodes, recurStates, reportOutcome]);

  // daily scheduling: one dateless task at the bandit-chosen hour
  useEffect(() => {
    if (!nodes || !recurStates) return;
    // stats still loading — retry on the next tick rather than scheduling blind
    if (myStats === undefined || globalStats === undefined) return;
    const today = dayIndexLocal(nowTs);
    let lastDay: number | null = null;
    try {
      const raw = localStorage.getItem(DAY_KEY);
      lastDay = raw === null ? null : Number(raw);
    } catch {}
    const sig = `${today}`;
    if (lastDay === today || doneRef.current === sig) return;
    doneRef.current = sig;

    const eligible = eligibleAutoNudgeTasks(nodes, recurStates, nowTs);
    if (eligible.length === 0) return;
    const picked = pickCandidate(eligible);
    if (!picked) return;
    // the task conditions the hour: same policy, different task-kind →
    // different delivery time once the aggregates say so
    const pickedMeta = picked.metadata as PlainNode["metadata"];
    const pickedRs = recurStates.get(picked._id as string);
    const ctxKey = contextKeyOf({
      mode: modeOf(pickedMeta),
      isRecurring: !!pickedRs?.isRecurring,
      recurKind: pickedRs?.isRecurring ? recurKindOf(String(pickedMeta.recur ?? "")) : undefined,
    });

    void (async () => {
      try {
        // vibe override: an explicit "best time" label on a similar-vibe task
        // beats the bandit's inferred hour — a single label is ground truth
        let vibeSim: number | undefined;
        let hour = chooseHour(ctxKey, myStats, globalStats, nowTs);
        try {
          const vec =
            (await getVector(picked._id as string, picked.title)) ?? (await embedOne(picked.title));
          if (vec) {
            await putVector(picked._id as string, picked.title, vec).catch(() => {});
            const hit = nearestHour(vec, await listLabels());
            if (hit) {
              hour = hit.hour;
              vibeSim = hit.sim;
            }
          }
        } catch {}
        const scheduledFor = hour === null ? randomDeliveryTime(nowTs) : deliveryAtHour(hour, nowTs);
        if (scheduledFor <= nowTs) {
          doneRef.current = null;
          return;
        }
        const tn = tree.map.get(picked._id as string);
        const rs = recurStates.get(picked._id as string);
        const siblings = childrenOf(tree.roots, tree.map, picked.parentId);
        const openCount = eligible.length;
        const feats = buildAnonymousFeatures({
          node: (tn ?? { ...picked, children: [], depth: 0 }) as TreeNode,
          rs,
          historyCounts: history?.byTodo.get(picked._id as string),
          openCount,
          siblingCount: Math.max(0, siblings.length - 1),
          scheduledFor,
        });
        const dump = buildFullDump({
          node: picked,
          treeNode: tn,
          rs,
          historyCounts: history?.byTodo.get(picked._id as string),
          openCount,
          siblingCount: Math.max(0, siblings.length - 1),
          scheduledFor,
        });
        appendLocalDump(dump);
        const eventId = await schedule({
          todoId: picked._id,
          scheduledFor,
          utcOffsetMin: -new Date().getTimezoneOffset(),
          ...feats,
          ctxKey,
          vibeSim,
          fb: JSON.stringify(dump),
          name: picked.title,
          min: -1,
        });
        try {
          localStorage.setItem(DAY_KEY, String(today));
          localStorage.setItem(
            PENDING_KEY,
            JSON.stringify({ eventId, todoId: picked._id, day: today } satisfies Pending)
          );
        } catch {}
      } catch {
        doneRef.current = null; // failed — retry on the next tick
      }
    })();
  }, [nodes, recurStates, history, nowTs, tree, schedule, myStats, globalStats]);

  const labelTitle = labelReq ? (nodes?.find((x) => (x._id as string) === labelReq.todoId)?.title ?? null) : null;

  async function saveLabelHour(hour: number) {
    if (!labelReq || !labelTitle) {
      setLabelReq(null);
      return;
    }
    const { eventId, todoId } = labelReq;
    setLabelReq(null);
    markLabeled(eventId);
    try {
      // the label + its augmented neighbors share the hour — the neighborhood
      // generalizes from day one instead of memorizing one phrasing
      const vec = (await getVector(todoId, labelTitle)) ?? (await embedOne(labelTitle));
      if (vec) {
        const variants = await embed(augmentTitle(labelTitle)).catch(() => null);
        await saveLabel(
          { vec, hour, at: Date.now(), todoId },
          (variants ?? []).filter((v) => Array.isArray(v) && v.length === vec.length)
        );
      }
      await reportOutcome({ eventId: eventId as Id<"autoNudgeEvents">, labeled: true }).catch(() => {});
    } catch {}
  }

  return (
    <>
      {labelReq && labelTitle ? (
        <TimingDialog
          taskTitle={labelTitle}
          onSave={(h) => void saveLabelHour(h)}
          onDismiss={() => {
            markLabeled(labelReq.eventId);
            setLabelReq(null);
          }}
        />
      ) : null}
    </>
  );
}
