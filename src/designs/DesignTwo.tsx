"use client";
import { useState } from "react";
import Link from "next/link";
import { STARTER_TASKS, type DemoTask } from "./shared";

/* Design Two — Pastel Cloud: extra-rounded, airy, friendly. */
export default function DesignTwo() {
  const [tasks, setTasks] = useState<DemoTask[]>(STARTER_TASKS);
  const [input, setInput] = useState("");
  const done = tasks.filter((t) => t.done).length;
  const add = () => { const v = input.trim(); if (!v) return; setTasks((p) => [...p, { id: Date.now(), title: v, done: false, path: "/inbox" }]); setInput(""); };
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fff7fb] via-[#eef4ff] to-[#e9fbf0] text-[#3a3550]" style={{ fontFamily: "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif" }}>
      <nav className="mx-3 sm:mx-6 mt-3 rounded-full bg-white/80 backdrop-blur px-4 sm:px-6 py-3 flex items-center justify-between shadow-lg shadow-pink-100 sticky top-3 z-10">
        <span className="font-black text-lg">☁️ todosst <span className="text-xs font-bold bg-pink-200 rounded-full px-2 py-0.5 align-middle">02</span></span>
        <Link href="/" className="bg-[#3a3550] text-white rounded-full px-5 py-2.5 text-sm font-bold min-h-[44px] flex items-center">Open app</Link>
      </nav>
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-14 text-center">
        <p className="inline-block bg-white rounded-full px-4 py-1.5 text-xs font-bold shadow">✨ Design Two — Pastel Cloud</p>
        <h1 className="mt-4 text-4xl sm:text-6xl font-black leading-[1.02] tracking-tight">Soft rounds<br />for heavy days.</h1>
        <p className="mt-3 text-sm sm:text-lg opacity-70 max-w-xl mx-auto">Encrypted todos that feel like a weighted blanket. Big tap targets, gentle colors, zero sharp edges.</p>
        <section className="mt-8 text-left grid gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3 bg-white rounded-[2rem] p-4 sm:p-6 shadow-xl shadow-purple-100 border border-white">
            <div className="flex items-center justify-between"><h2 className="font-black">Today&apos;s cloud</h2><span className="text-xs font-bold bg-green-100 text-green-800 rounded-full px-3 py-1">{done}/{tasks.length} floated ✓</span></div>
            <div className="mt-3 flex gap-2">
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Add something kind…" className="flex-1 min-w-0 bg-[#f4f2ff] rounded-full px-5 py-3 text-sm font-semibold outline-none focus:ring-2 ring-purple-300 min-h-[48px]" />
              <button onClick={add} className="shrink-0 h-12 w-12 rounded-full bg-gradient-to-br from-pink-400 to-purple-400 text-white text-xl font-black shadow-lg" aria-label="add">+</button>
            </div>
            <ul className="mt-4 space-y-2">
              {tasks.map((t) => (
                <li key={t.id}><button onClick={() => setTasks((p) => p.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))} className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left min-h-[52px] transition ${t.done ? "bg-green-50" : "bg-[#faf9ff] hover:bg-purple-50"} border border-purple-100`}>
                  <span className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center font-black ${t.done ? "bg-green-400 text-white" : "bg-white border-2 border-purple-200"}`}>{t.done ? "✓" : ""}</span>
                  <span className={`text-sm font-bold truncate ${t.done ? "line-through opacity-50" : ""}`}>{t.title}</span>
                  {t.recur && <span className="ml-auto shrink-0 text-[10px] font-black bg-purple-100 text-purple-700 rounded-full px-2 py-0.5">{t.recur}</span>}
                </button></li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-2 flex flex-col gap-5">
            <div className="bg-gradient-to-br from-[#ffd6ec] to-[#d9ccff] rounded-[2rem] p-5 sm:p-6 shadow-lg">
              <h3 className="font-black text-lg">🌈 All-clear moment</h3>
              <p className="text-xs sm:text-sm font-semibold opacity-70 mt-1">Finish the last window and the whole sky clears. Streaks grow like flowers.</p>
              <div className="mt-3 flex gap-1.5 flex-wrap">{Array.from({ length: 30 }).map((_, i) => (<span key={i} className={`h-5 w-5 rounded-md ${i % 4 === 0 ? "bg-white" : i % 3 === 0 ? "bg-green-300" : "bg-white/50"}`} />))}</div>
            </div>
            <div className="bg-white rounded-[2rem] p-5 shadow-lg grid grid-cols-2 gap-3 text-center">
              {[["🔐", "E2E safe"], ["📴", "Offline OK"], ["🔁", "Smart recur"], ["📅", "Daily ritual"]].map(([e, t]) => (<div key={t} className="bg-[#f6f4ff] rounded-2xl py-4"><div className="text-2xl">{e}</div><div className="text-xs font-black mt-1">{t}</div></div>))}
            </div>
          </div>
        </section>
        <footer className="mt-8 flex flex-col sm:flex-row gap-3 items-center justify-between text-xs font-bold opacity-70"><span>Design 02/10 — Pastel Cloud</span><div className="flex gap-4"><Link href="/design/1" className="underline">← 01</Link><Link href="/design/3" className="underline">03 →</Link></div></footer>
      </main>
    </div>
  );
}
