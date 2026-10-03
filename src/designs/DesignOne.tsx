"use client";

import Link from "next/link";
import { DesignPager } from "./pager";
import { useDemo } from "./demo";
import { FEATURES, GRAMMAR, HEAT_LEVELS, RECURRENCE_TOKENS, SPECS, pad2 } from "./content";

/* Design 01 — Brutalist Mono: cream stock, 3px black rules, offset block
   shadows, uppercase monospace, one screaming yellow. */

const BORDER = "border-[3px] border-black";
const SHADOW = "shadow-[6px_6px_0_#000]";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className={`${BORDER} bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-widest`}>
      {children}
    </span>
  );
}

export default function DesignOne() {
  const { tasks, draft, setDraft, add, toggle, done, open } = useDemo();

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-black [font-family:ui-monospace,Menlo,Consolas,monospace]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:border-[3px] focus:border-black focus:bg-[#ffe600] focus:px-3 focus:py-2 focus:text-xs focus:font-bold focus:uppercase"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b-[3px] border-black bg-[#f4f1ea]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 bg-black px-2 py-1 text-xs font-bold tracking-[0.2em] text-[#ffe600]">
              TODOSST
            </span>
            <span className="hidden text-[11px] font-bold uppercase tracking-widest text-black/60 sm:inline">
              design {pad2(1)}/10 · brutalist mono
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/design"
              className={`${BORDER} hidden min-h-11 items-center bg-white px-3 py-2 text-[11px] font-bold uppercase sm:inline-flex`}
            >
              All 10
            </Link>
            <Link
              href="/"
              className={`${BORDER} ${SHADOW} inline-flex min-h-11 items-center bg-[#ffe600] px-3 py-2 text-[11px] font-bold uppercase active:translate-x-[3px] active:translate-y-[3px] active:shadow-none`}
            >
              Open app →
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
        {/* hero */}
        <section>
          <div className="flex flex-wrap gap-2">
            <Chip>Design {pad2(1)} / 10</Chip>
            <Chip>No gradients</Chip>
            <Chip>E2E encrypted</Chip>
          </div>
          <h1 className="mt-5 text-[clamp(2.75rem,13vw,7rem)] font-black uppercase leading-[0.86] tracking-[-0.03em]">
            Hard borders.
            <br />
            Soft mind.
          </h1>
          <p className="mt-5 max-w-2xl text-sm font-bold leading-relaxed sm:text-base">
            An end-to-end encrypted todo vault where folders are tasks and the URL is your desk.
            Type a path, wave a recurrence token, close the day. Done means done.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/"
              className={`${BORDER} ${SHADOW} inline-flex min-h-12 items-center justify-center bg-black px-6 py-3 text-sm font-bold uppercase text-white`}
            >
              Start — it&apos;s free
            </Link>
            <Link
              href="/design"
              className={`${BORDER} inline-flex min-h-12 items-center justify-center bg-white px-6 py-3 text-sm font-bold uppercase shadow-[6px_6px_0_#999]`}
            >
              See all ten designs
            </Link>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["310k", "PBKDF2 rounds"],
              ["0", "plaintext bytes"],
              ["10s", "undo window"],
              ["48h", "max grace"],
            ].map(([k, v]) => (
              <div key={k} className={`${BORDER} bg-white p-3 shadow-[4px_4px_0_#000]`}>
                <dt className="text-2xl font-black tabular-nums leading-none">{k}</dt>
                <dd className="mt-1 text-[10px] font-bold uppercase tracking-wide text-black/60">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* live demo */}
        <section className="mt-14 grid gap-6 lg:grid-cols-5">
          <div className={`${BORDER} bg-white shadow-[10px_10px_0_#000] lg:col-span-3`}>
            <div className={`${BORDER} flex items-center justify-between gap-2 bg-[#ffe600] px-3 py-2 text-[11px] font-bold uppercase`}>
              <span>● live demo — local only</span>
              <span className="tabular-nums">
                {done}/{tasks.length} done
              </span>
            </div>
            <div className="p-3 sm:p-4">
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && add()}
                  aria-label="Try the input grammar"
                  placeholder="try: stretch ~daily"
                  className={`${BORDER} min-h-12 min-w-0 flex-1 px-3 py-2 text-sm font-bold outline-none placeholder:text-black/35 focus:bg-[#fffbe6]`}
                />
                <button
                  onClick={add}
                  aria-label="Add task"
                  className={`${BORDER} min-h-12 min-w-12 bg-black px-4 text-lg font-black text-white`}
                >
                  +
                </button>
              </div>

              <ul className={`mt-3 divide-y-[3px] divide-black border-y-[3px] border-black`}>
                {tasks.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => toggle(t.id)}
                      className="flex min-h-12 w-full items-center gap-3 px-2 py-3 text-left"
                    >
                      <span
                        className={`${BORDER} flex h-5 w-5 shrink-0 items-center justify-center text-[11px] font-black ${
                          t.done ? "bg-black text-[#ffe600]" : "bg-white"
                        }`}
                        aria-hidden
                      >
                        {t.done ? "✓" : ""}
                      </span>
                      <span className={`min-w-0 flex-1 break-words text-sm font-bold ${t.done ? "text-black/40 line-through" : ""}`}>
                        {t.title}
                      </span>
                      {t.tag && (
                        <span className={`${BORDER} shrink-0 bg-[#ffe600] px-1.5 py-0.5 text-[10px] font-bold`}>
                          {t.tag}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>

              <div className={`${BORDER} mt-3 h-4 bg-white`} aria-hidden>
                <div
                  className="h-full bg-black transition-[width] duration-300"
                  style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }}
                />
              </div>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-black/60">
                {open} open · everything here lives in your browser
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:col-span-2">
            <div className={`${BORDER} bg-black p-4 text-white shadow-[10px_10px_0_#999]`}>
              <h2 className="text-xl font-black uppercase leading-tight">Today is the ritual</h2>
              <p className="mt-2 text-[11px] font-bold leading-relaxed text-white/75">
                Recurring windows and due items on one surface. Close the last one and an inverted
                all-clear band types itself out. Misses are free — pairs aren&apos;t.
              </p>
              <div className="mt-4 grid grid-cols-7 gap-1" aria-hidden>
                {HEAT_LEVELS.slice(-28).map((lvl, i) => (
                  <span
                    key={i}
                    className={`aspect-square border border-white/50 ${
                      lvl >= 3 ? "bg-[#ffe600]" : lvl === 2 ? "bg-white/70" : lvl === 1 ? "bg-white/25" : "bg-transparent"
                    }`}
                  />
                ))}
              </div>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-[#ffe600]">
                all clear — 4 done, 0 open
              </p>
            </div>

            <div className={`${BORDER} bg-white p-4 shadow-[6px_6px_0_#000]`}>
              <h3 className="text-xs font-black uppercase tracking-widest">Recurrence tokens</h3>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {RECURRENCE_TOKENS.map((r) => (
                  <span key={r} className={`${BORDER} bg-[#f4f1ea] px-1.5 py-1 text-[10px] font-bold`}>
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* features */}
        <section className="mt-16">
          <div className="flex items-end justify-between gap-4 border-b-[3px] border-black pb-3">
            <h2 className="text-2xl font-black uppercase sm:text-4xl">The whole thing</h2>
            <span className="text-[11px] font-bold uppercase text-black/50">06 parts</span>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.index} className={`${BORDER} bg-white p-4 shadow-[5px_5px_0_#000]`}>
                <p className="text-[11px] font-black uppercase tracking-[0.25em] text-black/40">
                  {f.index}
                </p>
                <h3 className="mt-2 text-base font-black uppercase leading-tight">{f.title}</h3>
                <p className="mt-2 text-[13px] font-medium leading-relaxed text-black/75">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* grammar */}
        <section className="mt-16 grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="border-b-[3px] border-black pb-3 text-2xl font-black uppercase sm:text-4xl">
              One box, five grammars
            </h2>
            <ul className="mt-4 divide-y-[3px] divide-black border-y-[3px] border-black">
              {GRAMMAR.map((g) => (
                <li key={g.input} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                  <code className="shrink-0 break-all bg-[#ffe600] px-2 py-1 text-[12px] font-bold sm:max-w-[46%]">
                    {g.input}
                  </code>
                  <span className="text-[13px] font-bold text-black/70">{g.action}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="border-b-[3px] border-black pb-3 text-2xl font-black uppercase sm:text-4xl">
              Spec sheet
            </h2>
            <dl className="mt-4 divide-y-[3px] divide-black border-y-[3px] border-black">
              {SPECS.map((s) => (
                <div key={s.k} className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-[11px] font-bold uppercase tracking-widest text-black/55">{s.k}</dt>
                  <dd className="break-all text-right text-[13px] font-black">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="border-t-[3px] border-black bg-black text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[11px] font-black uppercase tracking-[0.25em] text-[#ffe600]">
              Design {pad2(1)} of 10 — Brutalist Mono
            </span>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center text-[11px] font-bold uppercase tracking-widest underline underline-offset-4"
            >
              Open the live vault →
            </Link>
          </div>
          <DesignPager
            n={1}
            className="border-t-[3px] border-white/30 pt-3"
            linkClass="text-[11px] font-bold uppercase tracking-widest text-white/80 underline underline-offset-4 hover:text-[#ffe600]"
          />
        </div>
      </footer>
    </div>
  );
}
