"use client";
import { useState } from "react";
import Link from "next/link";
import { STARTER_TASKS, type DemoTask } from "./shared";

/* Design Three — Midnight Neon: dark + glow. */
export default function DesignThree() {
  const [tasks, setTasks] = useState<DemoTask[]>(STARTER_TASKS);
  const [input, setInput] = useState("");
  const done = tasks.filter((t) => t.done).length;
  const add = () => { const v = input.trim(); if (!v) return; setTasks((p) => [...p, { id: Date.now(), title: v, done: false, path: "/inbox" }]); setInput(""); };
  return (
    <div className="min-h-screen bg-[#05060f] text-[#e8ecff]" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <nav className="border-b border-white/10 px-4 py-3 flex items-center justify-between sticky top-0 z-10 bg-[#05060f]/90 backdrop-blur">
        <span className="font-black tracking-widest text-sm">⚡TODOSST<span className="text-[#00f0ff]">/03</span></span>
        <Link href="/" className="bg-[#00f0ff] text-black font-black text-sm rounded-lg px-4 py-2.5 min-h-[44px] flex items-center shadow-[0_0_24px_#00f0ff66]">Open app</Link>
      </nav>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-14">
        <p className="text-[11px] font-bold tracking-[0.3em] text-[#b537f2]">DESIGN THREE — MIDNIGHT NEON</p>
        <h1 className="mt-3 text-4xl sm:text-7xl font-black leading-[0.95]">Your vault,<br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00f0ff] via-[#b537f2] to-[#ff2fb3]">glowing after hours.</span></h1>
        <p className="mt-4 text-sm sm:text-base text-white/60 max-w-xl">AES-GCM-256 under the hood, laser grid on top. Built for night owls who clear tasks at 1am.</p>
        <section className="mt-8 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5 shadow-[0_0_60px_-20px_#b537f288]">
            <div className="flex justify-between text-xs font-bold text-white/60"><span className="text-[#00f0ff]">▸ live_terminal</span><span>{done}/{tasks.length} cleared</span></div>
            <div className="mt-3 flex gap-2">
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="> new objective…" className="flex-1 min-w-0 bg-black/60 border border-[#00f0ff]/30 rounded-xl px-4 py-3 text-sm text-[#00f0ff] placeholder:text-white/25 outline-none focus:border-[#00f0ff] min-h-[48px]" />
              <button onClick={add} className="shrink-0 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#b537f2] text-black font-black px-5 min-h-[48px]" aria-label="add">+</button>
            </div>
            <ul className="mt-3 space-y-2">
              {tasks.map((t) => (
                <li key={t.id}><button onClick={() => setTasks((p) => p.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))} className={`w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left min-h-[52px] ${t.done ? "border-green-400/30 bg-green-400/10" : "border-white/10 bg-white/[0.03] hover:border-[#00f0ff]/50"}`}>
                  <span className={`h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-xs font-black ${t.done ? "bg-green-400 text-black shadow-[0_0_12px_#4ade80]" : "border border-[#00f0ff]/60 text-transparent"}`}>✓</span>
                  <span className={`text-sm font-semibold truncate ${t.done ? "line-through text-white/40" : ""}`}>{t.title}</span>
                  {t.recur && <span className="ml-auto shrink-0 text-[10px] font-black text-[#ff2fb3] border border-[#ff2fb3]/40 rounded px-1.5 py-0.5">{t.recur}</span>}
                </button></li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-5">
            <div className="rounded-2xl bg-gradient-to-br from-[#b537f2]/25 to-[#00f0ff]/15 border border-white/10 p-5">
              <h2 className="font-black text-lg">◉ All-clear protocol</h2>
              <p className="text-xs sm:text-sm text-white/60 mt-1">Close every window. The band inverts, types “all clear”, counts your day. Reduced-motion aware.</p>
              <div className="mt-3 grid grid-cols-10 gap-1">{Array.from({ length: 40 }).map((_, i) => (<div key={i} className={`aspect-square rounded-[4px] ${i % 6 === 0 ? "bg-[#00f0ff] shadow-[0_0_8px_#00f0ff]" : i % 4 === 0 ? "bg-[#b537f2]" : "bg-white/10"}`} />))}</div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[["AES-256", "E2E"], ["100%", "Offline"], ["∞", "Recur"]].map(([a, b]) => (<div key={b} className="rounded-2xl border border-white/10 bg-white/[0.04] py-4"><div className="font-black text-[#00f0ff]">{a}</div><div className="text-[11px] text-white/50 font-bold">{b}</div></div>))}
            </div>
          </div>
        </section>
        <footer className="mt-8 flex flex-col sm:flex-row gap-2 justify-between text-xs text-white/40 font-bold"><span>Design 03/10 — Midnight Neon</span><div className="flex gap-4"><Link href="/design/2" className="underline">← 02</Link><Link href="/design/4" className="underline">04 →</Link></div></footer>
      </main>
    </div>
  );
}
