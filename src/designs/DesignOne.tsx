"use client";
import { useState } from "react";
import Link from "next/link";
import { STARTER_TASKS, type DemoTask } from "./shared";

/* Design One — Brutalist Mono: hard 3px borders, offset shadows, uppercase mono. */
export default function DesignOne() {
  const [tasks, setTasks] = useState<DemoTask[]>(STARTER_TASKS);
  const [input, setInput] = useState("");
  const done = tasks.filter((t) => t.done).length;
  const add = () => {
    const v = input.trim();
    if (!v) return;
    setTasks((p) => [...p, { id: Date.now(), title: v, done: false, path: "/inbox" }]);
    setInput("");
  };
  return (
    <div className="min-h-screen bg-[#f4f1ea] text-black" style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>
      <nav className="border-b-[3px] border-black bg-[#f4f1ea] px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <span className="bg-black text-white px-2 py-1 text-sm font-bold tracking-widest">TODOSST/01</span>
        <div className="hidden sm:flex gap-5 text-xs font-bold uppercase">
          <span>Vault</span><span>Today</span><span>Heatmap</span>
        </div>
        <Link href="/" className="border-[3px] border-black bg-[#ffe600] px-3 py-1.5 text-xs font-bold uppercase shadow-[4px_4px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none min-h-[44px] flex items-center">Open app →</Link>
      </nav>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-14">
        <p className="inline-block border-[3px] border-black bg-white px-2 py-1 text-[11px] font-bold uppercase tracking-widest">Design One — Brutalist Mono</p>
        <h1 className="mt-4 text-4xl sm:text-7xl font-black uppercase leading-[0.95] tracking-tight">Hard borders.<br />Soft mind.</h1>
        <p className="mt-4 max-w-xl text-sm sm:text-base font-bold">E2E-encrypted tasks. Folders are tasks. The URL is your desk. No gradients were harmed.</p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <Link href="/" className="text-center border-[3px] border-black bg-black text-white px-6 py-3 font-bold uppercase text-sm shadow-[6px_6px_0_#999] min-h-[48px]">Start — it&apos;s free</Link>
          <Link href="/design" className="text-center border-[3px] border-black bg-white px-6 py-3 font-bold uppercase text-sm shadow-[6px_6px_0_#000] min-h-[48px]">All 10 designs</Link>
        </div>
        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="border-[3px] border-black bg-white shadow-[8px_8px_0_#000]">
            <div className="border-b-[3px] border-black bg-[#ffe600] px-4 py-2 font-bold uppercase text-xs flex justify-between"><span>● live demo</span><span>{done}/{tasks.length} done</span></div>
            <div className="p-4">
              <div className="flex gap-2">
                <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder='try: buy beans / stretch ~daily' className="flex-1 border-[3px] border-black px-3 py-2.5 text-sm font-bold placeholder:text-neutral-400 min-h-[48px] min-w-0" />
                <button onClick={add} className="border-[3px] border-black bg-black text-white px-4 font-bold min-h-[48px] min-w-[48px]">+</button>
              </div>
              <ul className="mt-3 divide-y-[3px] divide-black border-[3px] border-black">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <button onClick={() => setTasks((p) => p.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))} className="w-full flex items-center gap-3 px-3 py-3 text-left min-h-[48px]">
                      <span className={`h-5 w-5 shrink-0 border-[3px] border-black flex items-center justify-center ${t.done ? "bg-black text-white text-xs" : "bg-white"}`}>{t.done ? "✓" : ""}</span>
                      <span className={`text-sm font-bold truncate ${t.done ? "line-through opacity-50" : ""}`}>{t.title}</span>
                      {t.recur && <span className="ml-auto shrink-0 border-2 border-black bg-[#ffe600] px-1 text-[10px] font-bold">{t.recur}</span>}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-3 h-4 border-[3px] border-black bg-white"><div className="h-full bg-black transition-all" style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} /></div>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div className="border-[3px] border-black bg-black text-white p-5 shadow-[8px_8px_0_#999]">
              <h2 className="font-black uppercase text-xl">Today is the ritual</h2>
              <p className="mt-2 text-xs font-bold opacity-80">Recurring windows + due items. Close the last one → ALL CLEAR band types out. Misses are free; pairs aren&apos;t.</p>
              <div className="mt-3 grid grid-cols-7 gap-1">{Array.from({ length: 28 }).map((_, i) => (<div key={i} className={`aspect-square border border-white/40 ${i % 5 === 0 ? "bg-[#ffe600]" : i % 4 === 0 ? "bg-white/70" : "bg-transparent"}`} />))}</div>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              {[["E2E", "AES-GCM-256, PBKDF2 310k"], ["PATHS", "/host hackathon/outreach"], ["OFFLINE", "Encrypted outbox replay"]].map(([a, b]) => (
                <div key={a} className="border-[3px] border-black bg-white p-3 shadow-[5px_5px_0_#000]"><p className="font-black text-lg">{a}</p><p className="text-[11px] font-bold">{b}</p></div>
              ))}
            </div>
          </div>
        </section>
        <footer className="mt-10 border-[3px] border-black bg-white p-4 text-[11px] font-bold uppercase flex flex-col sm:flex-row gap-2 justify-between"><span>Design 01/10 — Brutalist Mono</span><Link href="/design/2" className="underline">Next: 02 Pastel Cloud →</Link></footer>
      </main>
    </div>
  );
}
