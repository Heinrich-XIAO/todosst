"use client";
import { useState } from "react";
import Link from "next/link";
import { STARTER_TASKS, type DemoTask } from "./shared";

/* Design Eight — Oceanic Depth: deep blues, calm. */
export default function DesignEight() {
  const [tasks, setTasks] = useState<DemoTask[]>(STARTER_TASKS);
  const [input, setInput] = useState("");
  const left = tasks.filter((t) => !t.done).length;
  const add = () => { const v = input.trim(); if (!v) return; setTasks((p) => [...p, { id: Date.now(), title: v, done: false, path: "/inbox" }]); setInput(""); };
  return (
    <div className="min-h-screen text-[#e6f4ff]" style={{ background: "linear-gradient(180deg,#02121f 0%,#07304a 55%,#0b5a7d 100%)", fontFamily: "Georgia, system-ui, serif" }}>
      <nav className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
        <span className="font-bold tracking-wide">≋ todosst <span className="text-xs bg-white/15 rounded-full px-2 py-0.5">08</span></span>
        <Link href="/" className="bg-[#7dd3fc] text-[#02121f] text-sm font-bold rounded-full px-5 py-2.5 min-h-[44px] flex items-center" style={{ fontFamily: "system-ui" }}>Dive in</Link>
      </nav>
      <main className="max-w-5xl mx-auto px-4 pb-14">
        <p className="text-[11px] tracking-[0.3em] uppercase opacity-60 font-sans" style={{ fontFamily: "system-ui" }}>Design Eight — Oceanic Depth</p>
        <h1 className="mt-2 text-4xl sm:text-6xl leading-[1.02]">Sink in.<br /><em className="text-[#7dd3fc]">Surface clear.</em></h1>
        <p className="mt-3 text-sm sm:text-base opacity-70 max-w-xl">Pressure-tested encryption. Buoyant daily rituals. {left} thing{left === 1 ? "" : "s"} still below the surface.</p>
        <section className="mt-8 grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3 rounded-3xl bg-white/[0.07] border border-white/15 p-4 sm:p-6 backdrop-blur">
            <div className="flex gap-2 font-sans" style={{ fontFamily: "system-ui" }}>
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Drop a pebble…" className="flex-1 min-w-0 bg-[#02121f]/60 border border-white/20 rounded-2xl px-4 py-3 text-sm placeholder:text-white/30 outline-none focus:border-[#7dd3fc] min-h-[48px]" />
              <button onClick={add} className="shrink-0 rounded-2xl bg-[#7dd3fc] text-[#02121f] font-black px-5 min-h-[48px]" aria-label="add">+</button>
            </div>
            <ul className="mt-4 space-y-2.5">
              {tasks.map((t) => (
                <li key={t.id} className="rounded-2xl bg-gradient-to-r from-white/[0.09] to-transparent border border-white/10">
                  <button onClick={() => setTasks((p) => p.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))} className="w-full flex items-center gap-3 px-4 py-3.5 text-left min-h-[52px]">
                    <span className="text-lg shrink-0">{t.done ? "○" : "●"}</span>
                    <span className={`text-sm truncate ${t.done ? "line-through opacity-40" : "font-semibold"}`}>{t.title}</span>
                    <span className="ml-auto shrink-0 text-[10px] opacity-50 font-sans hidden sm:inline" style={{ fontFamily: "system-ui" }}>{t.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="rounded-3xl bg-[#7dd3fc] text-[#02121f] p-5 sm:p-6">
              <h2 className="font-black font-sans" style={{ fontFamily: "system-ui" }}>Today&apos;s tide</h2>
              <p className="text-sm mt-1 opacity-80">Recurring windows rise daily. Clear them all for the all-clear sunrise.</p>
              <div className="mt-3 flex items-end gap-1 h-16">{[40, 70, 45, 90, 60, 100, 55, 80, 35, 75, 50, 95].map((h, i) => (<div key={i} className="flex-1 rounded-t bg-[#02121f]/80" style={{ height: `${h}%` }} />))}</div>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/[0.05] p-5 text-sm font-sans" style={{ fontFamily: "system-ui" }}>
              <p className="font-bold">Why divers stay down here</p>
              <ul className="mt-2 space-y-1.5 opacity-70 text-[13px]"><li>🔐 Server sees ciphertext only</li><li>🗺️ URL is your dive chart</li><li>📴 Offline capture, replayed on air</li></ul>
            </div>
          </div>
        </section>
        <footer className="mt-8 flex flex-col sm:flex-row gap-2 justify-between text-xs opacity-60 font-sans" style={{ fontFamily: "system-ui" }}><span>Design 08/10 — Oceanic Depth</span><div className="flex gap-4"><Link href="/design/7" className="underline">← 07</Link><Link href="/design/9" className="underline">09 →</Link></div></footer>
      </main>
    </div>
  );
}
