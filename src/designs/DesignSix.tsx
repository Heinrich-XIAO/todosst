"use client";
import { useState } from "react";
import Link from "next/link";
import { STARTER_TASKS, type DemoTask } from "./shared";

/* Design Six — Retro Terminal: phosphor green CRT. */
export default function DesignSix() {
  const [tasks, setTasks] = useState<DemoTask[]>(STARTER_TASKS);
  const [input, setInput] = useState("");
  const add = () => { const v = input.trim(); if (!v) return; setTasks((p) => [...p, { id: Date.now(), title: v, done: false, path: "/inbox" }]); setInput(""); };
  return (
    <div className="min-h-screen bg-[#0a0f0a] text-[#33ff66]" style={{ fontFamily: "ui-monospace, 'Courier New', monospace", textShadow: "0 0 8px #33ff6644" }}>
      <div className="max-w-4xl mx-auto px-4 py-4 sm:py-8">
        <nav className="border border-[#33ff66]/40 rounded px-3 py-2.5 flex items-center justify-between text-xs sm:text-sm">
          <span className="font-bold">todo@vault:~$ <span className="animate-pulse">▊</span> <span className="opacity-60">[design 06]</span></span>
          <Link href="/" className="border border-[#33ff66] rounded px-3 py-2 font-bold hover:bg-[#33ff66] hover:text-black min-h-[44px] flex items-center">./open_app</Link>
        </nav>
        <p className="mt-6 text-xs opacity-70">$ cat manifesto.txt</p>
        <h1 className="text-3xl sm:text-6xl font-bold leading-tight">type it.<br />clear it.<br /><span className="opacity-60">sleep well.</span></h1>
        <p className="mt-3 text-xs sm:text-sm opacity-70 max-w-xl">$ todosst --e2e --offline --recur=~daily # zero-knowledge todo vault, one input grammar, tab-completion included</p>
        <section className="mt-6 border border-[#33ff66]/40 rounded-lg overflow-hidden">
          <div className="border-b border-[#33ff66]/40 px-3 py-2 text-xs flex gap-2 opacity-70"><span>● ● ●</span><span>todosst — zsh</span></div>
          <div className="p-3 sm:p-5">
            <div className="flex flex-col sm:flex-row gap-2">
              <span className="py-3 hidden sm:inline">$</span>
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="buy coffee beans | !cd ../side-quests" className="flex-1 min-w-0 bg-transparent border border-[#33ff66]/40 rounded px-3 py-3 text-sm outline-none placeholder:text-[#33ff66]/30 min-h-[48px]" />
              <button onClick={add} className="border border-[#33ff66] rounded px-5 font-bold hover:bg-[#33ff66] hover:text-black min-h-[48px]">[run]</button>
            </div>
            <ul className="mt-4 text-sm">
              {tasks.map((t) => (
                <li key={t.id}><button onClick={() => setTasks((p) => p.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))} className="w-full text-left py-2.5 border-b border-[#33ff66]/15 min-h-[44px] truncate">
                  <span className={t.done ? "opacity-40" : ""}>[{t.done ? "x" : " "}] {t.done ? <s>{t.title}</s> : t.title} <span className="opacity-50">{t.recur ?? ""}</span></span>
                </button></li>
              ))}
            </ul>
            <p className="mt-3 text-xs opacity-70">$ streak --heatmap | █▓░█▓██░▓ all-clear in {tasks.filter((t) => !t.done).length} tasks…</p>
          </div>
        </section>
        <div className="mt-4 grid sm:grid-cols-3 gap-3 text-xs">
          {[["--e2e", "ciphertext only on server"], ["!help", "grammar in a panel"], ["~every 3d", "rrule windows + grace"]].map(([a, b]) => (<div key={a} className="border border-[#33ff66]/40 rounded p-3"><p className="font-bold">{a}</p><p className="opacity-60">{b}</p></div>))}
        </div>
        <footer className="mt-6 flex flex-col sm:flex-row gap-2 justify-between text-xs opacity-60 pb-8"><span>design 06/10 — retro terminal</span><div className="flex gap-4"><Link href="/design/5" className="underline">← 05</Link><Link href="/design/7" className="underline">07 →</Link></div></footer>
      </div>
    </div>
  );
}
