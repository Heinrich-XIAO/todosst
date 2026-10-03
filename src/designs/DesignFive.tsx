"use client";

import Link from "next/link";
import { DesignPager } from "./pager";
import { useDemo } from "./demo";
import { FEATURES, GRAMMAR, HEAT_LEVELS, RECURRENCE_TOKENS, SPECS, STATS, pad2 } from "./content";

/* Design 05 — Aurora Glass: frosted panes floating over deep colour fields,
   hairline highlights, one luminous cyan accent, weightless type. */

const PANEL =
  "rounded-3xl border border-white/15 bg-white/8 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]";
const EYEBROW = "text-[11px] font-medium uppercase tracking-[0.3em] text-white/45";
const GLOW = "pointer-events-none absolute rounded-full blur-[100px]";
const HEAT_FILL = [
  "bg-white/5",
  "bg-[#22d3ee]/25",
  "bg-[#22d3ee]/50",
  "bg-[#22d3ee]/75",
  "bg-[#22d3ee]",
];

function SectionHead({ eyebrow, title, note }: { eyebrow: string; title: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-white/10 pb-4">
      <div className="min-w-0">
        <p className={EYEBROW}>{eyebrow}</p>
        <h2 className="mt-2 break-words text-[clamp(1.75rem,6vw,2.75rem)] font-light leading-[1.05] tracking-[-0.02em]">
          {title}
        </h2>
      </div>
      {note && <span className="text-[11px] uppercase tracking-[0.25em] text-white/35">{note}</span>}
    </div>
  );
}

export default function DesignFive() {
  const { tasks, draft, setDraft, add, toggle, done, open } = useDemo();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b1020] font-sans text-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-[#22d3ee] focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:text-[#04121a]"
      >
        Skip to content
      </a>

      {/* colour fields */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className={`${GLOW} -left-[20%] -top-[12%] h-[75vw] w-[75vw] bg-[#6a5cff] opacity-45`} />
        <div className={`${GLOW} -right-[18%] top-[6%] h-[60vw] w-[60vw] bg-[#22d3ee] opacity-40`} />
        <div className={`${GLOW} -left-[10%] -bottom-[18%] h-[70vw] w-[70vw] bg-[#a855f7] opacity-40`} />
        <div className={`${GLOW} right-[6%] top-[52%] h-[45vw] w-[45vw] bg-[#ff7ad9] opacity-25`} />
        <div className="absolute inset-0 bg-[#0b1020]/30" />
      </div>

      {/* floating pill header */}
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] sm:px-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link
              href="/"
              className="min-h-11 shrink-0 text-[15px] font-semibold tracking-[-0.02em] text-white"
            >
              todosst
            </Link>
            <span className="hidden shrink-0 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55 sm:inline-block">
              design {pad2(5)} / 10
            </span>
            <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-white/55 sm:hidden">
              {pad2(5)} / 10
            </span>
          </div>
          <nav className="flex items-center gap-1">
            <Link
              href="/design"
              className="hidden min-h-11 items-center rounded-full px-3 text-[11px] uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              All ten
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-full bg-[#22d3ee] px-4 text-[12px] font-semibold text-[#04121a] transition hover:brightness-110"
            >
              Open app
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-20 pt-24 sm:px-6 sm:pt-32">
        {/* hero */}
        <section>
          <p className={EYEBROW}>Aurora Glass · design {pad2(5)}</p>
          <h1 className="mt-5 break-words text-[clamp(2.5rem,10vw,5.5rem)] leading-[0.98] tracking-[-0.035em]">
            <span className="block font-extralight">Depth you can</span>
            <span className="block bg-gradient-to-r from-[#22d3ee] to-[#a855f7] bg-clip-text font-bold text-transparent">
              see through.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl break-words text-sm leading-relaxed text-white/75 sm:text-base">
            An end-to-end encrypted todo vault where directories are just tasks and the command box
            speaks five grammars. Everything is sealed on your device before a byte moves — the
            server holds noise, you hold the day.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#22d3ee] px-7 text-sm font-semibold text-[#04121a] transition hover:brightness-110"
            >
              Open the vault →
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/20 bg-white/10 px-7 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/15"
            >
              Start free
            </Link>
          </div>

          <dl className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.k} className="min-w-0 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <dt className="break-words text-2xl font-light tabular-nums leading-none sm:text-3xl">
                  {s.k}
                </dt>
                <dd className="mt-2 break-words text-[10px] uppercase leading-snug tracking-[0.14em] text-white/50">
                  {s.v}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* live demo + ritual */}
        <section className="mt-16 grid gap-5 lg:grid-cols-5">
          <div className={`${PANEL} min-w-0 p-4 sm:p-6 lg:col-span-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <span className="text-[11px] uppercase tracking-[0.22em] text-white/55">
                ● live demo — local only
              </span>
              <span className="text-[11px] uppercase tracking-[0.22em] tabular-nums text-[#22d3ee]">
                {done}/{tasks.length} done
              </span>
            </div>

            <div className="mt-4 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                aria-label="Try the input grammar"
                placeholder="try: stretch ~daily"
                className="min-h-12 min-w-0 flex-1 rounded-2xl border border-white/15 bg-white/10 px-4 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-[#22d3ee] focus:bg-white/15"
              />
              <button
                onClick={add}
                aria-label="Add task"
                className="min-h-12 min-w-12 shrink-0 rounded-2xl bg-[#22d3ee] px-4 text-lg font-semibold text-[#04121a] transition hover:brightness-110"
              >
                +
              </button>
            </div>

            <ul className="mt-4 space-y-1">
              {tasks.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => toggle(t.id)}
                    aria-pressed={t.done}
                    className="flex min-h-12 w-full items-start gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-white/5"
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] ${
                        t.done
                          ? "border-[#22d3ee] bg-[#22d3ee] text-[#04121a]"
                          : "border-white/30 bg-white/5 text-transparent"
                      }`}
                      aria-hidden
                    >
                      ✓
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block break-words text-sm ${
                          t.done ? "text-white/40 line-through" : "text-white/90"
                        }`}
                      >
                        {t.title}
                      </span>
                      {t.tag && (
                        <span className="mt-1.5 inline-block max-w-full break-all rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] tracking-[0.08em] text-white/65">
                          {t.tag}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div
              className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={tasks.length}
              aria-valuenow={done}
              aria-label="Tasks completed"
            >
              <div
                className="h-full rounded-full bg-[#22d3ee] transition-[width] duration-300"
                style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-3 break-words text-[10px] uppercase tracking-[0.18em] text-white/45">
              {open} open · {done} done · everything here lives in your browser
            </p>
          </div>

          <div className="min-w-0 lg:col-span-2">
            <div className={`${PANEL} h-full p-4 sm:p-6`}>
              <p className={EYEBROW}>the daily surface</p>
              <h2 className="mt-3 break-words text-[clamp(1.5rem,5vw,2rem)] font-light leading-tight tracking-[-0.02em]">
                Today is the ritual
              </h2>
              <p className="mt-3 break-words text-[13px] leading-relaxed text-white/70">
                Open recurrence windows and anything due land on a single pane. Close the last one
                and the all-clear band lights up. Misses are free — pairs aren&apos;t.
              </p>

              <div className="mt-5 grid grid-cols-7 gap-1.5" aria-hidden>
                {HEAT_LEVELS.slice(-28).map((lvl, i) => (
                  <span key={i} className={`aspect-square rounded-[4px] ${HEAT_FILL[lvl]}`} />
                ))}
              </div>
              <p className="mt-4 break-words text-[10px] uppercase tracking-[0.2em] text-[#22d3ee]">
                ● all clear — 4 done, 0 open
              </p>
            </div>
          </div>
        </section>

        {/* features */}
        <section className="mt-16">
          <SectionHead eyebrow="what it is" title="Six panes, one surface" note="06 parts" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.index} className={`${PANEL} min-w-0 p-5`}>
                <p className="text-[11px] uppercase tracking-[0.3em] text-[#22d3ee]">{f.index}</p>
                <h3 className="mt-3 break-words text-base font-semibold leading-snug tracking-[-0.01em]">
                  {f.title}
                </h3>
                <p className="mt-2.5 break-words text-[13px] leading-relaxed text-white/70">
                  {f.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* grammar + specs */}
        <section className="mt-16 grid gap-8 lg:grid-cols-2 lg:gap-6">
          <div className="min-w-0">
            <SectionHead eyebrow="the input box" title="One box, five grammars" note="06 rules" />
            <ul className="mt-4 divide-y divide-white/10 border-b border-white/10">
              {GRAMMAR.map((g) => (
                <li key={g.input} className="flex flex-col gap-1.5 py-3.5 sm:flex-row sm:items-baseline sm:gap-4">
                  <code className="min-w-0 break-all rounded-lg border border-white/15 bg-white/10 px-2 py-1.5 text-[12px] leading-relaxed text-[#a5f3fc] sm:max-w-[48%] sm:shrink-0">
                    {g.input}
                  </code>
                  <span className="min-w-0 break-words text-[13px] leading-relaxed text-white/70">
                    {g.action}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="min-w-0">
            <SectionHead eyebrow="under the glass" title="Spec sheet" note="08 rows" />
            <div className={`${PANEL} mt-4 p-4 sm:p-6`}>
              <dl className="divide-y divide-white/10">
                {SPECS.map((s) => (
                  <div key={s.k} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                    <dt className="text-[11px] uppercase tracking-[0.18em] text-white/50">{s.k}</dt>
                    <dd className="min-w-0 break-all text-right text-[13px] text-white">{s.v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-5 border-t border-white/10 pt-5">
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/45">
                  Recurrence tokens
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {RECURRENCE_TOKENS.map((r) => (
                    <span
                      key={r}
                      className="break-all rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] tracking-[0.08em] text-white/75"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10 bg-[#0b1020]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[11px] uppercase tracking-[0.3em] text-white/55">
              Design {pad2(5)} of 10 — Aurora Glass
            </span>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center text-[11px] uppercase tracking-[0.2em] text-white/80 underline decoration-white/30 underline-offset-4 transition hover:text-[#22d3ee]"
            >
              Open the live vault →
            </Link>
          </div>
          <DesignPager
            n={5}
            className="border-t border-white/10 pt-3"
            linkClass="rounded-full text-[11px] uppercase tracking-[0.16em] text-white/70 transition hover:bg-white/10 hover:text-[#22d3ee]"
          />
        </div>
      </footer>
    </div>
  );
}
