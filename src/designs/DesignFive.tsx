"use client";
import { useState } from "react";
import Link from "next/link";
import { STARTER_TASKS, type DemoTask } from "./shared";

/* Design Five — Aurora Glass: frosted cards over animated gradient. */
export default function DesignFive() {
  const [tasks, setTasks] = useState<DemoTask[]>(STARTER_TASKS);
  const [input, setInput] = useState("");
  const done = tasks.filter((t) => t.done).length;
  const add = () => { const v = input.trim(); if (!v) return; setTasks((p) => [...p, { id: Date.now(), title: v, done: false, path: "/inbox" }]); setInput(""); };
  return (
    <div className="min-h-screen text-white" style={{ background: "linear-gradient(135deg,#0f2027,#203a43 40%,#2c5364 60%,#4a3aff 100%)", fontFamily: "system-ui" }}>
      <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6">
        <nav className="flex items-center justify-between rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 px-4 sm:px-5 py-3 sticky top-3 z-10">
          <span className="font-black">◍ todosst <span className="text-xs bg-white/20 rounded-full px-2 py-0.5">05</span></span>
          <Link href="/" className="bg-white text-black text-sm font-bold rounded-xl px-4 py-2.5 min-h-[44px] flex items-center">Open app</Link>
        </nav>
        <p className="mt-8 text-[11px] font-bold tracking-[0.3em] text-white/60">DESIGN FIVE — AURORA GLASS</p>
        <h1 className="mt-2 text-4xl sm:text-6xl font-black leading-[1.0] max-w-2xl">Frosted glass over deep color.</h1>
        <p className="mt-3 text-white/70 text-sm sm:text-lg max-w-xl">Every panel floats. Every byte encrypted. Clarity without exposure.</p>
        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl bg-white/10 backdrop-blur-2xl border border-white/20 p-4 sm:p-6">
            <div className="flex justify-between text-xs font-bold text-white/70"><span>✦ live demo</span><span>{done}/{tasks.length} · {(tasks.length ? Math.round(done/tasks.length*100) : 0)}%</span></div>
            <div className="mt-2 h-2 rounded-full bg-white/15 overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-300 to-sky-300 transition-all" style={{ width: `${tasks.length ? done/tasks.length*100 : 0}%` }} /></div>
            <div className="mt-3 flex gap-2">
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Type, it focuses itself…" className="flex-1 min-w-0 bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-sm placeholder:text-white/40 outline-none focus:border-white/60 min-h-[48px]" />
              <button onClick={add} className="shrink-0 rounded-2xl bg-white text-black font-black px-5 min-h-[48px]" aria-label="add">+</button>
            </div>
            <ul className="mt-3 space-y-2">
              {tasks.map((t) => (
                <li key={t.id}><button onClick={() => setTasks((p) => p.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))} className="w-full flex items-center gap-3 rounded-2xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 px-4 py-3 text-left min-h-[52px]">
                  <span className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-xs font-black ${t.done ? "bg-emerald-300 text-black" : "border border-white/40"}`}>{t.done ? "✓" : ""}</span>
                  <span className={`text-sm font-semibold truncate ${t.done ? "line-through opacity-50" : ""}`}>{t.title}</span>
                </button></li>
              ))}
            </ul>
          </div>
          <div className="grid gap-4">
            <div className="rounded-3xl bg-white/10 backdrop-blur-2xl border border-white/20 p-5 sm:p-6">
              <h2 className="font-black text-lg">The daily ritual, afloat</h2>
              <p className="text-sm text-white/70 mt-1">Today view · miss-nudge after two days · auto habit <code>open todosst ~daily</code>.</p>
              <div className="mt-3 flex gap-1">{Array.from({ length: 26 }).map((_, i) => (<div key={i} className={`h-8 flex-1 rounded-md ${i % 5 === 0 ? "bg-emerald-300/90" : "bg-white/15"}`} />))}</div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[["🔐", "E2E"], ["⌨️", "!cd"], ["🔁", "~daily"], ["📴", "Offline"]].map(([e, t]) => (<div key={t} className="rounded-2xl bg-white/10 border border-white/20 py-4 text-center backdrop-blur-xl"><div className="text-xl">{e}</div><div className="text-xs font-bold mt-1">{t}</div></div>))}
            </div>
          </div>
        </section>
        <footer className="mt-8 pb-6 flex flex-col sm:flex-row gap-2 justify-between text-xs text-white/50 font-bold"><span>Design 05/10 — Aurora Glass</span><div className="flex gap-4"><Link href="/design/4" className="underline">← 04</Link><Link href="/design/6" className="underline">06 →</Link></div></footer>
      </div>
    </div>
  );
}
