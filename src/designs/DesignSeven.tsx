"use client";
import { useState } from "react";
import Link from "next/link";
import { STARTER_TASKS, type DemoTask } from "./shared";

/* Design Seven — Swiss Grid: red accent, strict grid, huge numbers. */
export default function DesignSeven() {
  const [tasks, setTasks] = useState<DemoTask[]>(STARTER_TASKS);
  const [input, setInput] = useState("");
  const done = tasks.filter((t) => t.done).length;
  const add = () => { const v = input.trim(); if (!v) return; setTasks((p) => [...p, { id: Date.now(), title: v, done: false, path: "/inbox" }]); setInput(""); };
  return (
    <div className="min-h-screen bg-white text-black" style={{ fontFamily: "Helvetica, Arial, system-ui, sans-serif" }}>
      <nav className="border-b-2 border-black px-4 sm:px-8 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <span className="font-black text-lg tracking-tight">todosst<sup className="text-[#e30613]">®</sup> <span className="text-xs font-bold text-white bg-black px-1.5 py-0.5">07</span></span>
        <div className="hidden md:flex gap-8 text-sm font-bold"><span>01 Vault</span><span>02 Today</span><span>03 Archive</span></div>
        <Link href="/" className="bg-[#e30613] text-white text-sm font-bold px-5 py-2.5 min-h-[44px] flex items-center">Open app</Link>
      </nav>
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
        <div className="grid gap-8 md:grid-cols-12">
          <div className="md:col-span-7">
            <p className="text-xs font-bold tracking-widest">DESIGN 07 — SWISS GRID</p>
            <h1 className="text-5xl sm:text-8xl font-black leading-[0.9] tracking-tighter">Order<br />is a<br /><span className="text-[#e30613]">feature.</span></h1>
            <p className="mt-4 max-w-md text-sm sm:text-base font-medium text-neutral-600">A strict 12-column system for unstructured minds. Encrypted hierarchy, URL-navigated, completable.</p>
            <div className="mt-6 grid grid-cols-3 border-2 border-black divide-x-2 divide-black text-center">
              {[["256", "bit E2E"], [`${done}/${tasks.length}`, "cleared"], ["10s", "undo window"]].map(([a, b]) => (<div key={b} className="py-3 sm:py-4"><div className="text-xl sm:text-3xl font-black">{a}</div><div className="text-[10px] sm:text-xs font-bold uppercase">{b}</div></div>))}
            </div>
          </div>
          <div className="md:col-span-5 border-2 border-black">
            <div className="bg-black text-white px-4 py-2 text-xs font-bold flex justify-between"><span>● LIVE DEMO</span><span>TODOSST/07</span></div>
            <div className="p-3 sm:p-4">
              <div className="flex gap-2">
                <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="New item…" className="flex-1 min-w-0 border-2 border-black px-3 py-2.5 text-sm font-bold min-h-[48px]" />
                <button onClick={add} className="bg-black text-white px-5 font-black min-h-[48px]" aria-label="add">→</button>
              </div>
              {tasks.map((t, i) => (
                <button key={t.id} onClick={() => setTasks((p) => p.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))} className="mt-2 w-full grid grid-cols-[auto_1fr_auto] items-center gap-3 border-2 border-black px-3 py-2.5 text-left min-h-[52px] hover:bg-neutral-100">
                  <span className="text-2xl font-black text-neutral-200">0{i + 1}</span>
                  <span className={`text-sm font-bold truncate ${t.done ? "line-through opacity-40" : ""}`}>{t.title}</span>
                  <span className={`h-4 w-4 border-2 border-black ${t.done ? "bg-[#e30613]" : ""}`} />
                </button>
              ))}
            </div>
          </div>
        </div>
        <footer className="mt-10 border-t-2 border-black pt-3 flex flex-col sm:flex-row gap-2 justify-between text-xs font-bold"><span>Design 07/10 — Swiss Grid</span><div className="flex gap-4"><Link href="/design/6" className="underline">← 06</Link><Link href="/design/8" className="underline">08 →</Link></div></footer>
      </main>
    </div>
  );
}
