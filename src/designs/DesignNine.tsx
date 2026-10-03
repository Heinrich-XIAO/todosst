"use client";
import { useState } from "react";
import Link from "next/link";
import { STARTER_TASKS, type DemoTask } from "./shared";

/* Design Nine — Sunset Editorial: bold editorial type, orange/violet. */
export default function DesignNine() {
  const [tasks, setTasks] = useState<DemoTask[]>(STARTER_TASKS);
  const [input, setInput] = useState("");
  const add = () => { const v = input.trim(); if (!v) return; setTasks((p) => [...p, { id: Date.now(), title: v, done: false, path: "/inbox" }]); setInput(""); };
  return (
    <div className="min-h-screen bg-[#14060f] text-[#ffe9d6]" style={{ fontFamily: "'Arial Black', system-ui, sans-serif" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4">
        <nav className="flex items-center justify-between py-3">
          <span className="text-sm font-black tracking-widest uppercase">Todosst <span className="bg-[#ff4d00] text-white px-1.5 rounded">09</span> — The Evening Edition</span>
          <Link href="/" className="bg-[#ffe9d6] text-black text-sm font-black uppercase px-5 py-2.5 rounded-full min-h-[44px] flex items-center">Read the app</Link>
        </nav>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.25em] text-[#ff9d5c]">Design Nine · Big type for small tasks</p>
        <h1 className="mt-2 font-black uppercase leading-[0.88] tracking-tight text-[17vw] sm:text-[7.5rem]">Clear<br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff4d00] to-[#b537f2]">it all.</span></h1>
        <div className="mt-6 grid gap-5 lg:grid-cols-2 items-start">
          <div className="rounded-2xl bg-[#ffe9d6] text-black p-4 sm:p-6">
            <p className="text-[11px] font-black uppercase tracking-widest opacity-60">Front page · live demo</p>
            <div className="mt-2 flex gap-2">
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Headline your next task…" className="flex-1 min-w-0 border-2 border-black rounded-xl px-4 py-3 text-sm font-bold min-h-[48px]" />
              <button onClick={add} className="shrink-0 bg-black text-white rounded-xl px-5 font-black min-h-[48px]" aria-label="add">+</button>
            </div>
            {tasks.map((t) => (
              <button key={t.id} onClick={() => setTasks((p) => p.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))} className="mt-2 w-full text-left border-b-2 border-black/10 py-3 min-h-[52px]">
                <span className="text-lg font-black uppercase leading-tight block truncate">{t.done ? <s className="opacity-40">{t.title}</s> : t.title}</span>
                <span className="text-[11px] font-bold uppercase opacity-50">{t.path} {t.recur ? `· ${t.recur}` : ""} {t.done ? "· filed ✓" : ""}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-5">
            <p className="text-sm sm:text-lg font-bold leading-snug normal-case" style={{ fontFamily: "Georgia, serif" }}><em>“The all-clear is the best closing paragraph in software — one inverted band, a blinking caret, and the count of what you did today.”</em></p>
            <div className="grid grid-cols-3 gap-3 text-center text-black">
              {[["E2E", "#ff4d00"], ["URL=desk", "#b537f2"], ["Offline", "#ff9d5c"]].map(([a, c]) => (<div key={a} className="rounded-2xl py-5 font-black text-sm uppercase" style={{ background: c }}>{a}</div>))}
            </div>
          </div>
        </div>
        <footer className="mt-8 pb-8 flex flex-col sm:flex-row gap-2 justify-between text-xs font-bold uppercase tracking-widest opacity-60"><span>Design 09/10 — Sunset Editorial</span><div className="flex gap-4"><Link href="/design/8" className="underline">← 08</Link><Link href="/design/10" className="underline">10 →</Link></div></footer>
      </div>
    </div>
  );
}
