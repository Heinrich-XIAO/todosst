"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import { AgentPanel, Composer, type Message } from "./AgentPanel";
import { AuthForm } from "./AuthForm";
import { CodeView } from "./CodeView";
import { TodayView } from "./TodayView";
import { useAgent } from "./useAgent";
import { useProgram } from "./useProgram";

type Tab = "today" | "agent" | "code";

export function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <div className="p-8 text-muted">…</div>;
  if (!isAuthenticated) return <AuthForm />;
  return <Workspace />;
}

function Workspace() {
  const { signOut } = useAuthActions();
  const seed = useMutation(api.program.seed);
  const program = useProgram();
  const messages = useQuery(api.program.messages) as Message[] | undefined;
  const prior = useMemo(() => (messages ?? []).map((m) => ({ role: m.role, text: m.text })), [messages]);
  const agent = useAgent(program.files, program.log, prior);
  const [tab, setTab] = useState<Tab>("today");
  const [file, setFile] = useState<string | null>(null);

  useEffect(() => {
    seed().catch(() => {});
  }, [seed]);

  const openFile = (path: string | null) => {
    setFile(path);
    setTab("code");
  };
  const send = (text: string) => {
    agent.send(text);
  };
  const busy = Boolean(agent.run && !agent.run.error);

  const tabs: { id: Tab; label: string; mobileOnly?: boolean }[] = [
    { id: "today", label: "Today" },
    { id: "agent", label: "Agent", mobileOnly: true },
    { id: "code", label: "Code" },
  ];

  const errorCount = program.evaluation?.errors.length ?? 0;

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-line px-4 h-12">
          <div className="flex items-center gap-5">
            <span className="font-mono text-sm text-accent">todosst</span>
            <nav className="hidden sm:flex gap-1">
              {tabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`rounded-md px-2.5 py-1 text-sm ${t.mobileOnly ? "lg:hidden" : ""} ${tab === t.id ? "bg-panel text-ink" : "text-muted hover:text-ink"}`}
                  >
                    {t.label}
                    {t.id === "code" && errorCount > 0 && <span className="ml-1.5 text-late">●</span>}
                  </button>
                ))}
            </nav>
          </div>
          <button onClick={() => signOut()} className="text-sm text-muted hover:text-ink">
            sign out
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">
          <div className={`h-full overflow-y-auto scroll-thin ${tab === "today" ? "block" : tab === "agent" ? "hidden lg:block" : "hidden"}`}>
            <TodayView
              evaluation={program.evaluation}
              today={program.today}
              onLog={program.addLog}
              onOpenFile={openFile}
              onShowErrors={() => openFile(program.evaluation?.errors[0]?.file ?? null)}
            />
          </div>
          {tab === "code" && program.files && (
            <CodeView files={program.files} log={program.log} now={program.now} selected={file} onSelect={setFile} />
          )}
          {tab === "agent" && (
            <div className="h-full lg:hidden">
              <AgentPanel
                messages={messages}
                run={agent.run}
                onSend={send}
                onStop={agent.stop}
                onDismiss={agent.dismiss}
                onOpenFile={openFile}
              />
            </div>
          )}
        </main>

        {tab === "today" && (
          <div className="lg:hidden shrink-0 px-3 pt-2">
            {agent.run && (
              <button onClick={() => setTab("agent")} className="mb-2 w-full text-left text-xs font-mono text-muted">
                {agent.run.error ? "agent hit an error, tap to see" : `agent: ${agent.run.activity.at(-1)?.label ?? "starting"}…`}
              </button>
            )}
            <Composer
              busy={busy}
              onStop={agent.stop}
              onSend={(t) => {
                send(t);
                setTab("agent");
              }}
            />
          </div>
        )}

        <nav className="sm:hidden shrink-0 grid grid-cols-3 border-t border-line mt-2 pb-[env(safe-area-inset-bottom)]">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-3 text-sm ${tab === t.id ? "text-ink font-medium" : "text-muted"}`}
            >
              {t.label}
              {t.id === "agent" && busy && <span className="ml-1 text-accent">●</span>}
              {t.id === "code" && errorCount > 0 && <span className="ml-1 text-late">●</span>}
            </button>
          ))}
        </nav>
      </div>

      <aside className="hidden lg:flex w-[420px] shrink-0 flex-col border-l border-line bg-bg">
        <div className="flex h-12 shrink-0 items-center border-b border-line px-4 text-sm">
          <span className="font-medium">Agent</span>
          <span className="ml-2 text-muted">writes your program</span>
        </div>
        <div className="min-h-0 flex-1">
          <AgentPanel
            messages={messages}
            run={agent.run}
            onSend={send}
            onStop={agent.stop}
            onDismiss={agent.dismiss}
            onOpenFile={openFile}
          />
        </div>
      </aside>
    </div>
  );
}
