"use client";
import { useState } from "react";
import Link from "next/link";
import { STARTER_TASKS, type DemoTask } from "./shared";

/* Design Four — Paper Journal: warm serif notebook. */
export default function DesignFour() {
  const [tasks, setTasks] = useState<DemoTask[]>(STARTER_TASKS);
  const [input, setInput] = useState("");
  const add = () => { const v = input.trim(); if (!v) return; setTasks((p) => [...p, { id: Date.now(), title: v, done: false, path: "/inbox" }]); setInput(""); };
  return (
    <div className="min-h-screen bg-[#f7f1e3] text-[#2b2118]" style={{ fontFamily: "Georgia, 'Times New Roman', serif", backgroundImage: "repeating-linear-gradient(transparent, transparent 31px, #2b211812 32px)" }}>
      <nav className="max-w-3xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
        <span className="italic font-bold text-xl">❦ todosst <span className="text-xs not-italic bg-[#2b2118] text-[#f7f1e3] rounded px-1.5 py-0.5">No. 4</span></span>
        <Link href="/" className="not-italic font-sans text-sm font-bold border-b-2 border-[#2b2118] min-h-[44px] flex items-center" style={{ fontFamily: "system-ui" }}>Open the app →</Link>
      </nav>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pb-14">
        <p className="text-xs tracking-[0.25em] uppercase opacity-60 font-sans" style={{ fontFamily: "system-ui" }}>Design Four — Paper Journal · Oct 3, 2026</p>
        <h1 className="mt-2 text-4xl sm:text-6xl leading-[1.0] font-bold">A notebook that<br /><em>encrypts itself.</em></h1>
        <p className="mt-4 italic text-base sm:text-lg opacity-80 max-w-xl">Dear reader — every word AES-GCM sealed before it leaves this desk. The server sees only weather, never words.</p>
        <section className="mt-8 bg-[#fffdf6]/90 border border-[#2b211833] shadow-[0_20px_50px_-30px_#2b211866] rounded-sm p-4 sm:p-7">
          <h2 className="font-bold text-lg">§ Today&apos;s entries</h2>
          <div className="mt-3 flex gap-2 font-sans" style={{ fontFamily: "system-ui" }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Write a line…" className="flex-1 min-w-0 bg-transparent border-b-2 border-[#2b2118] px-1 py-2.5 text-sm outline-none placeholder:italic min-h-[48px]" />
            <button onClick={add} className="shrink-0 border-2 border-[#2b2118] rounded-full px-5 text-sm font-bold min-h-[48px]">ink +</button>
          </div>
          <ul className="mt-4">
            {tasks.map((t) => (
              <li key={t.id} className="border-b border-dashed border-[#2b211833]">
                <button onClick={() => setTasks((p) => p.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))} className="w-full flex items-baseline gap-3 py-3 text-left min-h-[48px]">
                  <span className={`shrink-0 h-5 w-5 rounded-full border-2 border-[#2b2118] inline-flex items-center justify-center text-[10px] ${t.done ? "bg-[#2b2118] text-[#f7f1e3]" : ""}`}>{t.done ? "✓" : ""}</span>
                  <span className={`truncate ${t.done ? "line-through opacity-50" : ""}`}>{t.title}</span>
                  {t.recur && <span className="ml-auto shrink-0 font-sans text-[10px] italic opacity-60" style={{ fontFamily: "system-ui" }}>{t.recur}</span>}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm italic opacity-70">…and when the last entry is crossed, the page writes back: <b>all clear.</b></p>
        </section>
        <div className="mt-6 grid sm:grid-cols-3 gap-4 font-sans" style={{ fontFamily: "system-ui" }}>
          {[["Locked ink", "PBKDF2 · 310k turns of the key"], ["Margins", "Tasks nest like chapters"], ["Candles", "Works offline, replays later"]].map(([a, b]) => (<div key={a} className="bg-[#fffdf6] border border-[#2b211833] p-4 rounded-sm"><p className="font-bold text-sm">{a}</p><p className="text-xs opacity-60 mt-1">{b}</p></div>))}
        </div>
        <footer className="mt-8 flex flex-col sm:flex-row gap-2 justify-between text-xs opacity-60 font-sans" style={{ fontFamily: "system-ui" }}><span>Design 04/10 — Paper Journal</span><div className="flex gap-4"><Link href="/design/3" className="underline">← 03</Link><Link href="/design/5" className="underline">05 →</Link></div></footer>
      </main>
    </div>
  );
}
