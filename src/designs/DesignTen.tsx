"use client";
import { useState } from "react";
import Link from "next/link";
import { STARTER_TASKS, type DemoTask } from "./shared";

/* Design Ten — Forest Zen: calm greens, breathing room. */
export default function DesignTen() {
  const [tasks, setTasks] = useState<DemoTask[]>(STARTER_TASKS);
  const [input, setInput] = useState("");
  const [breath, setBreath] = useState(false);
  const add = () => { const v = input.trim(); if (!v) return; setTasks((p) => [...p, { id: Date.now(), title: v, done: false, path: "/inbox" }]); setInput(""); };
  return (
    <div className="min-h-screen bg-[#f0f4ec] text-[#1d2b1f]" style={{ fontFamily: "system-ui, sans-serif" }}>
      <nav className="max-w-4xl mx-auto px-4 py-5 flex items-center justify-between">
        <span className="font-bold">🌿 todosst <span className="text-xs bg-[#1d2b1f] text-[#f0f4ec] rounded-full px-2 py-0.5">10</span></span>
        <Link href="/" className="bg-[#1d2b1f] text-[#f0f4ec] text-sm font-semibold rounded-full px-5 py-2.5 min-h-[44px] flex items-center">Enter quietly</Link>
      </nav>
      <main className="max-w-4xl mx-auto px-4 pb-14">
        <p className="text-center text-[11px] tracking-[0.3em] uppercase opacity-50 font-bold">Design Ten — Forest Zen</p>
        <h1 className="mt-3 text-center text-4xl sm:text-6xl font-light leading-tight">Quiet software<br />for <em className="font-semibold">loud minds.</em></h1>
        <p className="mt-3 text-center text-sm sm:text-base opacity-60 max-w-lg mx-auto">One input. One breath. Encrypted end to end, patient with misses, strict about pairs.</p>
        <div className="mt-6 text-center">
          <button onClick={() => setBreath((b) => !b)} className="rounded-full border border-[#1d2b1f]/20 bg-white px-6 py-3 text-sm font-semibold min-h-[48px] shadow-sm">{breath ? "◉ breathing… tap to rest" : "○ take one breath before tasks"}</button>
          {breath && <div className="mx-auto mt-4 h-24 w-24 rounded-full bg-[#7ba889]/40 animate-ping" />}
        </div>
        <section className="mt-6 rounded-[2rem] bg-white p-4 sm:p-7 shadow-[0_30px_60px_-40px_#1d2b1f66]">
          <div className="flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Plant one small thing…" className="flex-1 min-w-0 bg-[#f0f4ec] rounded-full px-5 py-3 text-sm outline-none focus:ring-2 ring-[#7ba889] min-h-[48px]" />
            <button onClick={add} className="shrink-0 h-12 w-12 rounded-full bg-[#1d2b1f] text-white font-bold" aria-label="add">+</button>
          </div>
          <ul className="mt-4 divide-y divide-[#1d2b1f]/10">
            {tasks.map((t) => (
              <li key={t.id}><button onClick={() => setTasks((p) => p.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))} className="w-full flex items-center gap-4 py-3.5 text-left min-h-[52px]">
                <span className={`h-6 w-6 shrink-0 rounded-full border-2 transition ${t.done ? "bg-[#4a7c59] border-[#4a7c59] text-white text-xs flex items-center justify-center" : "border-[#1d2b1f]/30"}`}>{t.done ? "✓" : ""}</span>
                <span><span className={`block text-[15px] ${t.done ? "line-through opacity-40" : "font-medium"}`}>{t.title}</span><span className="block text-xs opacity-40">{t.path}{t.recur ? ` · ${t.recur}` : ""}</span></span>
              </button></li>
            ))}
          </ul>
        </section>
        <div className="mt-5 grid sm:grid-cols-3 gap-4 text-center">
          {[["Misses are free", "nudge after two days"], ["Pairs aren't", "today is what matters"], ["Streaks grow", "open todosst ~daily"]].map(([a, b]) => (<div key={a} className="rounded-3xl bg-[#dce8d4]/60 p-5"><p className="font-semibold text-sm">{a}</p><p className="text-xs opacity-60 mt-1">{b}</p></div>))}
        </div>
        <footer className="mt-8 flex flex-col sm:flex-row gap-2 justify-between text-xs opacity-50 font-semibold"><span>Design 10/10 — Forest Zen · fin.</span><div className="flex gap-4"><Link href="/design/9" className="underline">← 09</Link><Link href="/design" className="underline">All designs</Link></div></footer>
      </main>
    </div>
  );
}
