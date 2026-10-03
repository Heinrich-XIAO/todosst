"use client";

import Link from "next/link";
import { DesignPager } from "./pager";
import { useDemo } from "./demo";
import { FEATURES, GRAMMAR, HEAT_LEVELS, RECURRENCE_TOKENS, SPECS, STATS, pad2 } from "./content";

/* Design 03 — Midnight Neon: near-black indigo over a quiet 44px grid, cyan
   and magenta signals on dark glass, corner brackets, tabular readouts — a
   cockpit for the vault after hours. */

const LABEL = "text-[10px] font-semibold uppercase tracking-[0.28em]";
const PANEL = "relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22e6ff]";
const PRIMARY = `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#22e6ff] px-6 text-sm font-bold text-[#07070f] shadow-[0_0_30px_-8px_rgba(34,230,255,0.45)] transition-colors hover:bg-[#7df1ff] ${FOCUS}`;
const GHOST = `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#22e6ff]/45 px-6 text-sm font-semibold text-white transition-colors hover:border-[#22e6ff] hover:bg-[#22e6ff]/10 ${FOCUS}`;

function Brackets() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      <span className="absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 border-[#22e6ff]" />
      <span className="absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2 border-[#22e6ff]" />
      <span className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-[#22e6ff]" />
      <span className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-[#22e6ff]" />
    </span>
  );
}

function heatClass(lvl: number): string {
  if (lvl >= 4) return "border-[#22e6ff] bg-[#22e6ff] shadow-[0_0_10px_-2px_rgba(34,230,255,0.85)]";
  if (lvl === 3) return "border-[#22e6ff]/70 bg-[#22e6ff]/70";
  if (lvl === 2) return "border-[#22e6ff]/45 bg-[#22e6ff]/45";
  if (lvl === 1) return "border-[#22e6ff]/20 bg-[#22e6ff]/20";
  return "border-white/10 bg-white/[0.05]";
}

function SectionHead({ index, title, note }: { index: string; title: string; note: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-white/10 pb-4">
      <div className="min-w-0">
        <p className={`${LABEL} text-[#22e6ff]`}>{index}</p>
        <h2 className="mt-2 min-w-0 break-words text-[clamp(1.6rem,5.5vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-white">
          {title}
        </h2>
      </div>
      <span className={`${LABEL} shrink-0 text-white/70`}>{note}</span>
    </div>
  );
}

export default function DesignThree() {
  const { tasks, draft, setDraft, add, toggle, done, open } = useDemo();
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-[#07070f] font-sans text-white selection:bg-[#22e6ff] selection:text-[#07070f]"
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
      }}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:min-h-11 focus:rounded-lg focus:border focus:border-[#22e6ff] focus:bg-[#07070f] focus:px-3 focus:py-2 focus:text-xs focus:text-[#22e6ff]"
      >
        Skip to content
      </a>

      {/* cockpit header */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#07070f]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className={`inline-flex min-h-11 items-center text-[15px] font-semibold tracking-[-0.02em] text-white ${FOCUS}`}
            >
              todosst
            </Link>
            <span aria-hidden className="h-4 w-px shrink-0 bg-white/15" />
            <span className={`${LABEL} shrink-0 text-[#22e6ff]/90`}>
              <span className="hidden sm:inline">design {pad2(3)} / 10</span>
              <span className="sm:hidden">{pad2(3)}/10</span>
            </span>
          </div>
          <nav className="flex shrink-0 items-center gap-2">
            <Link
              href="/design"
              className={`hidden min-h-12 items-center rounded-lg border border-white/15 px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80 transition-colors hover:border-[#22e6ff]/60 hover:text-[#22e6ff] sm:inline-flex ${FOCUS}`}
            >
              All ten
            </Link>
            <Link
              href="/"
              className={`inline-flex min-h-12 items-center rounded-lg bg-[#22e6ff] px-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[#07070f] transition-colors hover:bg-[#7df1ff] ${FOCUS}`}
            >
              Open app
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-24 sm:px-6 sm:pt-32">
        {/* hero */}
        <section>
          <div className="flex flex-wrap gap-2">
            {["design 03 / 10", "midnight neon", "sealed client-side"].map((c) => (
              <span
                key={c}
                className="rounded-full border border-[#22e6ff]/35 bg-[#22e6ff]/[0.07] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#22e6ff]"
              >
                {c}
              </span>
            ))}
          </div>

          <h1 className="mt-6 min-w-0 break-words text-[clamp(2.35rem,10.5vw,6rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-white [text-shadow:0_0_60px_rgba(34,230,255,0.35)]">
            Your vault
            <br />
            after midnight.
          </h1>

          <p className="mt-6 max-w-2xl break-words text-[15px] leading-relaxed text-[#c9c9d4] sm:text-base">
            An end-to-end encrypted todo vault where a folder is just a task and the command box
            parses paths, commands and recurrence in one line. Everything is sealed on your device
            before a byte moves — you keep the keys, the server keeps noise.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/" className={PRIMARY}>
              Enter the vault →
            </Link>
            <Link href="/" className={GHOST}>
              Open the app
            </Link>
          </div>

          <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/15 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.k} className="min-w-0 bg-[#0a0a14] px-4 py-4">
                <dt className="text-[clamp(1.6rem,6vw,2.4rem)] font-semibold leading-none tabular-nums text-white">
                  {s.k}
                </dt>
                <dd className={`${LABEL} mt-2 break-words leading-relaxed text-white/70`}>{s.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* live console + daily ritual */}
        <div className="mt-16 grid gap-6 lg:grid-cols-12">
          <section aria-label="Live demo" className={`${PANEL} min-w-0 lg:col-span-7`}>
            <Brackets />
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-white/10 bg-white/[0.03] px-4 py-3">
              <h2 className={`${LABEL} min-w-0 text-[#22e6ff]`}>● live console · local only</h2>
              <p className="shrink-0 text-[11px] font-semibold tabular-nums text-white/75">
                <span className="text-[#ff3ea5]">{open} open</span> · {done} done
              </p>
            </div>

            <div className="p-4 sm:p-5">
              <label htmlFor="d3-input" className={`${LABEL} block text-white/70`}>
                one box · five grammars · press enter
              </label>
              <div className="mt-3 flex gap-2">
                <input
                  id="d3-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && add()}
                  placeholder="stretch ~daily"
                  className="min-h-12 min-w-0 flex-1 rounded-xl border border-white/15 bg-[#07070f]/80 px-3 text-sm text-white outline-none transition-colors placeholder:text-white/55 focus:border-[#22e6ff] focus:shadow-[0_0_20px_-8px_rgba(34,230,255,0.7)]"
                />
                <button
                  type="button"
                  onClick={add}
                  aria-label="Add task"
                  className={`min-h-12 min-w-12 rounded-xl border border-[#22e6ff]/50 bg-[#22e6ff]/10 px-4 text-lg font-bold text-[#22e6ff] transition-colors hover:bg-[#22e6ff] hover:text-[#07070f] ${FOCUS}`}
                >
                  +
                </button>
              </div>

              <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => toggle(t.id)}
                      aria-pressed={t.done}
                      className={`flex min-h-12 w-full items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-white/[0.05] ${FOCUS}`}
                    >
                      <span
                        aria-hidden
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold ${
                          t.done
                            ? "border-[#22e6ff] bg-[#22e6ff] text-[#07070f]"
                            : "border-white/30 text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                      <span
                        className={`min-w-0 flex-1 break-words text-sm leading-snug ${
                          t.done ? "text-white/55 line-through" : "text-[#e6e6ee]"
                        }`}
                      >
                        {t.title}
                      </span>
                      {t.tag && (
                        <span className="min-w-0 max-w-[42%] shrink-0 truncate rounded-md border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[10px] leading-tight text-[#22e6ff]/90">
                          {t.tag}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>

              <div className="mt-4">
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-white/10"
                  role="progressbar"
                  aria-label="Demo completion"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                >
                  <div
                    className="h-full rounded-full bg-[#22e6ff] shadow-[0_0_16px_-2px_rgba(34,230,255,0.9)] transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className={`${LABEL} tabular-nums text-white/70`}>
                    {done} / {tasks.length} closed · {pct}%
                  </p>
                  <p className="text-[11px] text-white/70">nothing here leaves this browser</p>
                </div>
              </div>
            </div>
          </section>

          <section aria-label="Today is the ritual" className={`${PANEL} min-w-0 p-4 sm:p-5 lg:col-span-5`}>
            <Brackets />
            <p className={`${LABEL} text-[#ff3ea5]`}>daily surface</p>
            <h2 className="mt-2 break-words text-[clamp(1.5rem,5vw,2rem)] font-semibold leading-tight tracking-[-0.02em] text-white">
              Today is the ritual
            </h2>
            <p className="mt-3 break-words text-[14px] leading-relaxed text-[#c9c9d4]">
              Open recurrence windows and anything due land on one surface each morning. Close the
              last one and the all-clear band sweeps the day. Misses are free — pairs aren&apos;t.
            </p>

            <p className={`${LABEL} mt-6 text-white/70`}>last 28 days · 4 levels</p>
            <div className="mt-3 grid grid-cols-7 gap-1.5" aria-hidden>
              {HEAT_LEVELS.slice(-28).map((lvl, i) => (
                <span key={i} className={`aspect-square rounded-[3px] border ${heatClass(lvl)}`} />
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1" aria-hidden>
              <span className={`${LABEL} text-white/70`}>less</span>
              {[0, 1, 2, 3, 4].map((lvl) => (
                <span key={lvl} className={`h-3.5 w-3.5 rounded-[3px] border ${heatClass(lvl)}`} />
              ))}
              <span className={`${LABEL} text-white/70`}>more</span>
            </div>

            <p
              className={`mt-5 break-words border-t border-white/10 pt-4 text-sm leading-relaxed ${
                open === 0 ? "text-[#22e6ff]" : "text-[#ff3ea5]"
              }`}
            >
              {open === 0
                ? `● all clear — ${done} closed, nothing pending`
                : `● ${open} still open — the all-clear band waits`}
            </p>
          </section>
        </div>

        {/* features */}
        <section className="mt-20">
          <SectionHead index="01 / systems" title="What runs in the dark" note="06 modules" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article
                key={f.index}
                className="group min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition-colors hover:border-[#22e6ff]/50 hover:bg-white/[0.06]"
              >
                <div className="flex items-center gap-3">
                  <span aria-hidden className="h-px flex-1 bg-white/10 transition-colors group-hover:bg-[#22e6ff]/50" />
                  <span className={`${LABEL} text-[#22e6ff]`}>{f.index}</span>
                </div>
                <h3 className="mt-3 min-w-0 break-words text-base font-semibold leading-snug text-white">
                  {f.title}
                </h3>
                <p className="mt-2 break-words text-[13px] leading-relaxed text-[#c9c9d4]">
                  {f.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* grammar */}
        <section className="mt-20">
          <SectionHead index="02 / input" title="One box, six readings" note="input → action" />
          <ul className="mt-2">
            {GRAMMAR.map((g, i) => (
              <li
                key={g.input}
                className="flex flex-col gap-2 border-b border-white/10 py-4 sm:grid sm:grid-cols-[2.5rem_minmax(0,16rem)_minmax(0,1fr)] sm:items-baseline sm:gap-5"
              >
                <span className={`${LABEL} text-white/70`}>{pad2(i + 1)}</span>
                <code className="min-w-0 max-w-full break-all rounded-lg border border-[#22e6ff]/30 bg-[#22e6ff]/[0.07] px-2.5 py-1.5 text-[12px] leading-relaxed text-[#22e6ff]">
                  {g.input}
                </code>
                <span className="min-w-0 break-words text-[14px] leading-relaxed text-[#c9c9d4]">
                  {g.action}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* spec sheet */}
        <section className="mt-20">
          <SectionHead index="03 / build" title="Spec sheet" note="08 keys" />
          <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SPECS.map((s) => (
              <div key={s.k} className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <dt className={`${LABEL} break-words text-white/70`}>{s.k}</dt>
                <dd className="mt-2 break-words text-[14px] leading-snug text-white">{s.v}</dd>
              </div>
            ))}
          </dl>

          <p className={`${LABEL} mt-8 text-white/70`}>recurrence tokens</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {RECURRENCE_TOKENS.map((r) => (
              <span
                key={r}
                className="min-w-0 max-w-full break-all rounded-lg border border-[#22e6ff]/30 bg-[#22e6ff]/[0.07] px-2.5 py-1.5 text-[12px] leading-relaxed text-[#22e6ff]"
              >
                {r}
              </span>
            ))}
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10 bg-[#05050b]">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className={`${LABEL} min-w-0 break-words text-[#22e6ff]`}>
              design {pad2(3)} of 10 — midnight neon
            </span>
            <Link
              href="/"
              className={`inline-flex min-h-12 items-center self-start rounded-lg border border-white/15 px-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/85 transition-colors hover:border-[#22e6ff]/60 hover:text-[#22e6ff] sm:self-auto ${FOCUS}`}
            >
              Open the live vault →
            </Link>
          </div>
          <DesignPager
            n={3}
            className="border-t border-white/10 pt-3"
            linkClass={`inline-flex items-center rounded-md text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75 transition-colors hover:bg-white/[0.06] hover:text-[#22e6ff] ${FOCUS}`}
          />
        </div>
      </footer>
    </div>
  );
}
