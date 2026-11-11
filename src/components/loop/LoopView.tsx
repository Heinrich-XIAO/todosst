"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { parseCaptureInput, sigilMapFromTypes } from "../../../convex/loopLogic";
import { captureSignal } from "@/lib/loopCapture";
import {
  buildModel,
  buildRules,
  buildTypes,
  buildViews,
  buildWorkflows,
  saveSigils,
} from "@/lib/loopModel";
import { errorMessage, useLoopMutations, type LoopCtx } from "./ctx";
import { Inbox } from "./Inbox";
import { Detail, Items } from "./Items";
import { MicButton } from "./MicButton";
import { Runs } from "./Runs";
import { System } from "./System";
import { Chip } from "./ui";

// The loop screen: capture bar on top (always one tap from a thought), then
// four tabs — inbox (untriaged), problems (everything tracked, loudest first),
// runs (fixes and whether they held), system (the app's own definitions).

type Tab = "inbox" | "problems" | "runs" | "system";

type Toast = { text: string; undo?: () => void };

/** What the share sheet / shortcuts passed in the URL, consumed once. */
function readLaunchParams(): { share: string | null; voice: boolean } {
  try {
    const p = new URLSearchParams(window.location.search);
    const parts = [p.get("title"), p.get("text"), p.get("url")].map((x) => (x ?? "").trim()).filter(Boolean);
    // many apps put the same link in both text and url: keep the longest of any overlap, first of any equal pair
    const unique = parts.filter((x, i) => !parts.some((y, j) => j !== i && y.includes(x) && (y.length > x.length || j < i)));
    const share = unique.length ? unique.join(" — ") : null;
    return { share, voice: p.get("capture") === "voice" };
  } catch {
    return { share: null, voice: false };
  }
}

export function LoopView({
  online,
  nowTs,
  onParked,
}: {
  online: boolean;
  nowTs: number;
  /** a capture went to the offline outbox — let the shell refresh its queue count */
  onParked: () => void;
}) {
  const items = useQuery(api.loop.items);
  const signals = useQuery(api.loop.signals);
  const runs = useQuery(api.loop.runs);
  const defs = useQuery(api.loop.defs);
  const links = useQuery(api.loop.links);
  const m = useLoopMutations();
  const settle = useMutation(api.loop.settle);

  const [tab, setTab] = useState<Tab>("inbox");
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const types = useMemo(() => buildTypes(defs ?? []), [defs]);
  const workflows = useMemo(() => buildWorkflows(defs ?? []), [defs]);
  const views = useMemo(() => buildViews(defs ?? []), [defs]);
  const rules = useMemo(() => buildRules(defs ?? []), [defs]);
  const sigils = useMemo(() => sigilMapFromTypes(types), [types]);
  const model = useMemo(
    () => buildModel(items ?? [], signals ?? [], runs ?? [], types, nowTs),
    [items, signals, runs, types, nowTs],
  );

  // the main input reads sigils from here without subscribing to anything
  useEffect(() => {
    if (defs) saveSigils(types);
  }, [defs, types]);

  // verify windows end on the server's clock via cron; this settles anything
  // that came due while the app was closed the moment it is opened
  const dueRun = (runs ?? []).some((r) => r.status === "verifying" && r.verifyUntil !== undefined && r.verifyUntil <= nowTs);
  useEffect(() => {
    if (dueRun) void settle({}).catch(() => {});
  }, [dueRun, settle]);

  const act = useCallback(async <T,>(p: Promise<T>): Promise<T | undefined> => {
    try {
      return await p;
    } catch (err) {
      setNotice(errorMessage(err));
      return undefined;
    }
  }, []);
  const actOk = useCallback(async (p: Promise<unknown>): Promise<boolean> => {
    try {
      await p;
      return true;
    } catch (err) {
      setNotice(errorMessage(err));
      return false;
    }
  }, []);

  const ctx: LoopCtx | null =
    items && signals && runs && defs && links
      ? {
          now: nowTs,
          online,
          model,
          types,
          workflows,
          views,
          rules,
          defs,
          links,
          runs,
          m,
          act,
          actOk,
          notify: setNotice,
          openItem: setOpenId,
        }
      : null;

  // toasts clear themselves
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const capture = useCallback(
    async (text: string, source: "typed" | "voice" | "share", typeKey?: string, system?: boolean): Promise<boolean> => {
      const res = await captureSignal(
        (args) => m.capture(args),
        { text, typeKey, system, source },
        online,
        sigils,
      );
      if (res.kind === "saved") {
        const id = res.id as Id<"signals">;
        setToast({
          text: `captured: ${text.length > 60 ? text.slice(0, 57) + "…" : text}`,
          undo: () => void m.dismissSignal({ signalId: id }).catch(() => {}),
        });
        setTab("inbox");
        return true;
      }
      if (res.kind === "parked") {
        onParked();
        setToast({ text: "captured offline — syncs when you're back online" });
        return true;
      }
      setNotice(res.message);
      return false;
    },
    [m, online, sigils, onParked],
  );

  // share target + home-screen shortcut launches
  const [launch] = useState(readLaunchParams);
  const launchedRef = useRef(false);
  useEffect(() => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    if (!launch.share && !launch.voice) return;
    // consume the params so a refresh doesn't capture the share twice
    try {
      window.history.replaceState(null, "", "/loop");
    } catch {}
    // (deferred a tick: capture reports through state, and that belongs after the effect)
    const shared = launch.share;
    if (shared) window.setTimeout(() => void capture(shared.slice(0, 1000), "share"), 0);
  }, [capture, launch]);

  const inboxCount = model.inbox.length;
  const liveRuns = (runs ?? []).filter((r) => r.status === "active" || r.status === "verifying").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CaptureBar sigils={sigils} onCapture={capture} autoVoice={launch.voice} onProblem={setNotice} />

      <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-foreground/10 px-1.5 py-2">
        <Chip on={tab === "inbox"} onClick={() => setTab("inbox")}>
          inbox{inboxCount > 0 ? ` ${inboxCount}` : ""}
        </Chip>
        <Chip on={tab === "problems"} onClick={() => setTab("problems")}>
          problems{model.items.size > 0 ? ` ${model.items.size}` : ""}
        </Chip>
        <Chip on={tab === "runs"} onClick={() => setTab("runs")}>
          runs{liveRuns > 0 ? ` ${liveRuns}` : ""}
        </Chip>
        <Chip on={tab === "system"} onClick={() => setTab("system")}>
          system
        </Chip>
      </div>

      {!ctx ? (
        <p className="px-3 py-8 font-mono text-xs opacity-60">loading…</p>
      ) : (
        <>
          {tab === "inbox" && <Inbox ctx={ctx} />}
          {tab === "problems" && <Items ctx={ctx} />}
          {tab === "runs" && <Runs ctx={ctx} />}
          {tab === "system" && <System ctx={ctx} />}
          {openId && <Detail id={openId} ctx={ctx} onClose={() => setOpenId(null)} />}
        </>
      )}

      {notice && (
        <div className="fixed inset-x-0 bottom-[calc(var(--tabbar-clear)+1rem)] z-[60] mx-auto w-[min(560px,92vw)] border border-foreground bg-background px-3 py-2 font-mono text-xs md:bottom-4">
          <div className="flex items-start justify-between gap-3">
            <span className="break-words">{notice}</span>
            <button onClick={() => setNotice(null)} className="shrink-0 underline underline-offset-4">
              ok
            </button>
          </div>
        </div>
      )}
      {toast && !notice && (
        <div className="fixed inset-x-0 bottom-[calc(var(--tabbar-clear)+1rem)] z-[60] mx-auto w-[min(560px,92vw)] border border-foreground bg-background px-3 py-2 font-mono text-xs md:bottom-4">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate">{toast.text}</span>
            <span className="flex shrink-0 gap-3">
              {toast.undo && (
                <button
                  onClick={() => {
                    toast.undo?.();
                    setToast(null);
                  }}
                  className="underline underline-offset-4"
                >
                  undo
                </button>
              )}
              <button onClick={() => setToast(null)} className="opacity-60 underline underline-offset-4">
                close
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function CaptureBar({
  sigils,
  onCapture,
  autoVoice,
  onProblem,
}: {
  sigils: Record<string, string>;
  onCapture: (text: string, source: "typed" | "voice", typeKey?: string, system?: boolean) => Promise<boolean>;
  autoVoice: boolean;
  onProblem: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [heard, setHeard] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // the bottom nav's "+" means "capture" on this screen
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener("loop:focus-capture", focus);
    return () => window.removeEventListener("loop:focus-capture", focus);
  }, []);

  const submit = async () => {
    const raw = text.trim();
    if (!raw || busy) return;
    const parsed = parseCaptureInput(raw, sigils);
    // no sigil needed here: this box only captures. "? " / "?? " / "% " still work.
    const body = parsed ? parsed.text : raw;
    if (!body) {
      setText("");
      return;
    }
    setBusy(true);
    try {
      if (await onCapture(body, "typed", parsed?.typeKey, parsed?.system)) setText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shrink-0 border-b border-foreground px-3 py-3">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={heard || "what just went wrong?"}
          maxLength={1000}
          enterKeyHint="send"
          autoComplete="off"
          aria-label="capture"
          className="h-9 min-w-0 flex-1 border border-foreground bg-transparent px-2 text-sm placeholder:text-foreground/60 focus:outline-none"
        />
        <MicButton
          autoStart={autoVoice}
          onInterim={setHeard}
          onProblem={onProblem}
          onFinal={(spoken) => void onCapture(spoken, "voice")}
        />
        <button
          type="submit"
          disabled={!text.trim() || busy}
          className="h-9 shrink-0 border border-foreground bg-foreground px-3 font-mono text-xs text-background disabled:bg-transparent disabled:text-foreground disabled:opacity-40"
        >
          capture
        </button>
      </form>
      <p className="mt-1.5 font-mono text-[11px] opacity-60">
        no folder, no decision — sort it later. <code>??</code> = about this app, <code>%</code> = idea
      </p>
    </div>
  );
}
