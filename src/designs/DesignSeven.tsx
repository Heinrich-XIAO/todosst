"use client";

import Link from "next/link";
import { DesignPager } from "./pager";
import { useDemo } from "./demo";
import {
  DESIGN_META,
  FEATURES,
  GRAMMAR,
  HEAT_LEVELS,
  RECURRENCE_TOKENS,
  SPECS,
  STATS,
  pad2,
} from "./content";

/* Design 07 — Swiss Grid: white stock, hairline rules, black grotesque display
   type, oversized red section numerals. One signal red, square corners, no shadow. */

const LABEL = "text-[10px] font-semibold uppercase tracking-[0.24em] text-[#6b6b6b]";
const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a0a0a]";
const BLACK_BTN = `inline-flex min-h-12 items-center justify-center bg-[#0a0a0a] px-6 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#6b6b6b] ${FOCUS}`;
const RED_BTN = `inline-flex min-h-12 items-center justify-center bg-[#e63329] px-6 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#0a0a0a] ${FOCUS}`;
const LINE_BTN = `inline-flex min-h-12 items-center justify-center border border-[#0a0a0a] bg-white px-6 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#0a0a0a] transition-colors hover:bg-[#0a0a0a] hover:text-white ${FOCUS}`;
const HEAT = ["bg-white border border-black/15", "bg-black/20", "bg-black/50", "bg-[#0a0a0a]"];

function SectionHead({ n, title, note }: { n: string; title: string; note: string }) {
  return (
    <div className="grid grid-cols-4 gap-x-6 gap-y-1 border-b border-[#0a0a0a] pb-3 lg:grid-cols-12 lg:items-end">
      <span className="col-span-4 block text-[clamp(3rem,12vw,7rem)] font-black leading-[0.78] tracking-[-0.06em] text-[#e63329] lg:col-span-3">
        {n}
      </span>
      <h2 className="col-span-4 min-w-0 break-words text-[clamp(1.5rem,5vw,2.5rem)] font-black leading-[0.95] tracking-[-0.04em] lg:col-span-6">
        {title}
      </h2>
      <p className={`col-span-4 min-w-0 break-words lg:col-span-3 lg:text-right ${LABEL}`}>
        {note}
      </p>
    </div>
  );
}

export default function DesignSeven() {
  const { tasks, draft, setDraft, add, toggle, done, open } = useDemo();
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-white font-sans text-[#0a0a0a] antialiased">
      <a
        href="#main"
        className={`sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:border focus:border-[#0a0a0a] focus:bg-white focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:uppercase focus:tracking-[0.2em] ${FOCUS}`}
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-[#0a0a0a] bg-white">
        <div
          aria-hidden
          className="h-2.5 w-full border-b border-black/15"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to right, rgba(10,10,10,0.28) 0 1px, transparent 1px 24px)",
          }}
        />
        <div className="mx-auto flex max-w-6xl items-stretch justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className={`inline-flex min-h-11 items-center text-[17px] font-black tracking-[-0.045em] ${FOCUS}`}
            >
              todosst
            </Link>
            <span aria-hidden className="hidden h-4 w-px bg-black/20 sm:block" />
            <span className={`hidden min-w-0 truncate sm:inline ${LABEL}`}>
              design {pad2(7)} / 10 · swiss grid
            </span>
          </div>
          <nav className="flex items-stretch">
            <Link
              href="/design"
              className={`hidden min-h-11 items-center border-l border-black/15 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6b6b6b] transition-colors hover:text-[#0a0a0a] sm:inline-flex ${FOCUS}`}
            >
              Index
            </Link>
            <a
              href="#demo"
              className={`hidden min-h-11 items-center border-l border-black/15 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6b6b6b] transition-colors hover:text-[#0a0a0a] sm:inline-flex ${FOCUS}`}
            >
              Demo
            </a>
            <Link
              href="/"
              className={`inline-flex min-h-11 items-center border-l border-black/15 bg-[#0a0a0a] px-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white ${FOCUS}`}
            >
              Open app
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        {/* hero */}
        <section className="relative pt-10 sm:pt-16">
          <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            <div className="hidden h-full grid-cols-12 gap-x-6 lg:grid">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="border-l border-black/[0.06] last:border-r" />
              ))}
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-4 gap-x-6 gap-y-6 pb-8 lg:grid-cols-12">
            <div className="col-span-4 min-w-0 lg:col-span-3">
              <p className={LABEL}>Design {pad2(7)} / 10</p>
              <p className="mt-2 text-[13px] font-black uppercase tracking-[0.1em]">Swiss Grid</p>
              <p className="mt-4 hidden text-[13px] leading-relaxed text-[#6b6b6b] lg:block">
                International Typographic Style applied to a todo vault: rules, scale and exactly
                one red signal.
              </p>
            </div>

            <div className="col-span-4 min-w-0 lg:col-span-8 lg:col-start-5">
              <h1 className="break-words text-[clamp(2.75rem,13vw,7rem)] font-black leading-[0.86] tracking-[-0.04em]">
                Order is a
                <br />
                feature.
              </h1>
              <p className="mt-6 max-w-2xl break-words text-[15px] leading-relaxed text-[#6b6b6b] sm:text-[17px]">
                todosst is an end-to-end encrypted todo vault where a folder is only a task with
                children, and the URL is the desk you are standing at. One box takes paths, commands
                and recurrence tokens — everything is sealed in the browser before it travels.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link href="/" className={RED_BTN}>
                  Open the app →
                </Link>
                <Link href="/" className={LINE_BTN}>
                  Start typing
                </Link>
              </div>
            </div>
          </div>

          <dl className="relative z-10 grid grid-cols-2 sm:grid-cols-4">
            {STATS.map((s) => (
              <div
                key={s.k}
                className="min-w-0 border-t border-black/15 py-5 pr-4 sm:border-l sm:pl-4 sm:first:border-l-0 sm:first:pl-0"
              >
                <dt className="break-words text-[clamp(1.6rem,6vw,2.5rem)] font-black leading-none tracking-[-0.04em] tabular-nums">
                  {s.k}
                </dt>
                <dd className={`mt-2 break-words ${LABEL}`}>{s.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* live demo */}
        <section id="demo" className="mt-16 scroll-mt-24 sm:mt-20">
          <SectionHead n="01" title="Try the box" note="live · runs in this page" />

          <div className="mt-6 grid grid-cols-4 gap-x-6 gap-y-8 lg:grid-cols-12">
            <div className="col-span-4 min-w-0 border border-[#0a0a0a] lg:col-span-7">
              <div className="flex items-center justify-between gap-3 border-b border-[#0a0a0a] bg-[#0a0a0a] px-3 py-2 text-white">
                <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.2em]">
                  Live demo — local only
                </span>
                <span className="shrink-0 text-[11px] font-bold tabular-nums">
                  {done}/{tasks.length} done
                </span>
              </div>

              <div className="p-3 sm:p-5">
                <label htmlFor="d7-input" className={`block ${LABEL}`}>
                  Add a line — enter submits
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="d7-input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && add()}
                    placeholder="stretch ~daily"
                    className={`min-h-12 min-w-0 flex-1 border border-black/25 bg-white px-3 text-[15px] text-[#0a0a0a] placeholder:text-[#6b6b6b]/70 focus:border-[#0a0a0a] ${FOCUS}`}
                  />
                  <button
                    type="button"
                    onClick={add}
                    aria-label="Add task"
                    className={`min-h-12 min-w-12 border border-[#0a0a0a] bg-[#0a0a0a] px-4 text-lg font-black text-white transition-colors hover:bg-[#6b6b6b] ${FOCUS}`}
                  >
                    +
                  </button>
                </div>

                <ul className="mt-4 border-t border-black/15">
                  {tasks.map((t) => (
                    <li key={t.id} className="border-b border-black/15">
                      <button
                        type="button"
                        onClick={() => toggle(t.id)}
                        aria-pressed={t.done}
                        className={`flex min-h-12 w-full items-center gap-3 py-3 text-left ${FOCUS}`}
                      >
                        <span
                          aria-hidden
                          className={`flex h-5 w-5 shrink-0 items-center justify-center border text-[11px] font-black ${
                            t.done
                              ? "border-[#e63329] bg-[#e63329] text-white"
                              : "border-[#0a0a0a] bg-white"
                          }`}
                        >
                          {t.done ? "✓" : ""}
                        </span>
                        <span
                          className={`min-w-0 flex-1 break-words text-[14px] leading-snug ${
                            t.done ? "text-[#6b6b6b] line-through" : "text-[#0a0a0a]"
                          }`}
                        >
                          {t.title}
                        </span>
                        {t.tag && (
                          <span className="max-w-[45%] shrink-0 break-words border border-black/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6b6b6b]">
                            {t.tag}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 h-2 w-full bg-black/10" aria-hidden>
                  <div
                    className="h-full bg-[#e63329] transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0a0a0a] tabular-nums">
                    {open} open · {done} done · {pct}%
                  </p>
                  <p className={LABEL}>state never leaves this tab</p>
                </div>
              </div>
            </div>

            <div className="col-span-4 min-w-0 lg:col-span-4 lg:col-start-9">
              <p className={LABEL}>How the box reads</p>
              <ul className="mt-3 border-t border-black/15">
                <li className="border-b border-black/15 py-4">
                  <code className="block min-w-0 break-all text-[13px] font-black">
                    /host hackathon/outreach
                  </code>
                  <span className="mt-1 block break-words text-[13px] leading-relaxed text-[#6b6b6b]">
                    a leading slash nests the line under a directory you already have
                  </span>
                </li>
                <li className="border-b border-black/15 py-4">
                  <code className="block min-w-0 break-all text-[13px] font-black">
                    !cd ../side-quests
                  </code>
                  <span className="mt-1 block break-words text-[13px] leading-relaxed text-[#6b6b6b]">
                    a bang moves the working directory instead of writing anything down
                  </span>
                </li>
                <li className="border-b border-black/15 py-4">
                  <code className="block min-w-0 break-all text-[13px] font-black">stretch ~daily</code>
                  <span className="mt-1 block break-words text-[13px] leading-relaxed text-[#6b6b6b]">
                    a wave opens a recurring window and is stripped from the title
                  </span>
                </li>
              </ul>
              <p className="mt-4 break-words text-[13px] leading-relaxed text-[#6b6b6b]">
                Everything added above lives in component state only — reload and it is gone. The
                shipped app seals the same lines with AES-GCM-256 before any of it leaves the tab.
              </p>
            </div>
          </div>
        </section>

        {/* ritual */}
        <section className="mt-16 sm:mt-20">
          <SectionHead n="02" title="Today is the ritual" note="the daily surface" />

          <div className="mt-6 grid grid-cols-4 gap-x-6 gap-y-8 lg:grid-cols-12">
            <div className="col-span-4 min-w-0 lg:col-span-5">
              <p className="break-words text-[clamp(1rem,2.6vw,1.2rem)] font-medium leading-relaxed">
                Open recurrence windows and anything due land on one surface every morning — no
                inbox, no triage queue, no deciding where a thought belongs.
              </p>
              <p className="mt-4 break-words text-[14px] leading-relaxed text-[#6b6b6b]">
                Close the final item and the day stamps itself shut: an all-clear band runs across
                the surface and the list goes quiet until tomorrow opens it again.
              </p>
              <p className="mt-5 border-l-2 border-[#e63329] pl-4 text-[clamp(1.05rem,3vw,1.4rem)] font-black leading-tight tracking-[-0.03em]">
                Misses are free — pairs aren&apos;t.
              </p>
            </div>

            <div className="col-span-4 min-w-0 lg:col-span-6 lg:col-start-7">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className={LABEL}>Last 28 days</p>
                <p className={LABEL}>Four intensity levels</p>
              </div>

              <div
                className="mt-3 grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1"
                aria-hidden
              >
                {HEAT_LEVELS.slice(-28).map((lvl, i) => (
                  <span key={i} className={`aspect-square ${HEAT[Math.min(lvl, 3)]}`} />
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2" aria-hidden>
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6b6b6b]">
                  less
                </span>
                {HEAT.map((cls, i) => (
                  <span key={i} className={`h-3 w-3 ${cls}`} />
                ))}
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6b6b6b]">
                  more
                </span>
              </div>

              <p
                className={`mt-4 break-words px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white ${
                  open === 0 ? "bg-[#e63329]" : "bg-[#0a0a0a]"
                }`}
              >
                {open === 0
                  ? `All clear — ${done} closed, nothing pending`
                  : `${open} still open · ${done} closed`}
              </p>
            </div>
          </div>
        </section>

        {/* features */}
        <section className="mt-16 sm:mt-20">
          <SectionHead n="03" title="The whole system" note="06 parts" />

          <div className="mt-2">
            {FEATURES.map((f) => (
              <article
                key={f.index}
                className="grid grid-cols-4 gap-x-6 gap-y-2 border-b border-black/15 py-6 lg:grid-cols-12"
              >
                <span className="col-span-1 text-[13px] font-black tabular-nums tracking-[0.1em] text-[#6b6b6b] lg:col-span-2">
                  {f.index}
                </span>
                <h3 className="col-span-3 min-w-0 break-words text-[clamp(1.05rem,3.4vw,1.5rem)] font-black leading-[1.05] tracking-[-0.03em] lg:col-span-4">
                  {f.title}
                </h3>
                <p className="col-span-4 min-w-0 break-words text-[13.5px] leading-relaxed text-[#6b6b6b] lg:col-span-6">
                  {f.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* grammar */}
        <section className="mt-16 sm:mt-20">
          <SectionHead n="04" title="Input grammar" note="06 rules" />

          <ul className="mt-6 border-t border-black/15">
            {GRAMMAR.map((g) => (
              <li
                key={g.input}
                className="grid grid-cols-4 gap-x-6 gap-y-2 border-b border-black/15 py-4 lg:grid-cols-12 lg:items-baseline"
              >
                <code className="col-span-4 min-w-0 break-all bg-[#0a0a0a] px-2 py-1.5 text-[12px] leading-snug text-white lg:col-span-5">
                  {g.input}
                </code>
                <span className="col-span-4 min-w-0 break-words text-[13px] leading-snug text-[#6b6b6b] lg:col-span-6 lg:col-start-7">
                  {g.action}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* specs */}
        <section className="mt-16 sm:mt-20">
          <SectionHead n="05" title="Spec sheet" note="08 keys" />

          <dl className="mt-6 border-t border-black/15">
            {SPECS.map((s) => (
              <div
                key={s.k}
                className="grid grid-cols-4 gap-x-6 gap-y-1 border-b border-black/15 py-3 lg:grid-cols-12 lg:items-baseline"
              >
                <dt className={`col-span-4 min-w-0 break-words lg:col-span-4 ${LABEL}`}>{s.k}</dt>
                <dd className="col-span-4 min-w-0 break-words text-[14px] font-black lg:col-span-6 lg:col-start-5">
                  {s.v}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-6">
            <p className={LABEL}>Recurrence tokens</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {RECURRENCE_TOKENS.map((r) => (
                <span
                  key={r}
                  className="min-w-0 break-words border border-black/15 px-2.5 py-1.5 text-[12px] font-semibold"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-20 border-t-2 border-[#0a0a0a]">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="grid grid-cols-4 gap-x-6 gap-y-8 lg:grid-cols-12">
            <span className="col-span-4 block text-[clamp(3rem,12vw,7rem)] font-black leading-[0.78] tracking-[-0.06em] text-[#e63329] lg:col-span-3">
              06
            </span>

            <div className="col-span-4 min-w-0 lg:col-span-5">
              <p className={LABEL}>Design {pad2(7)} of 10</p>
              <p className="mt-2 break-words text-[clamp(1.4rem,4.5vw,2rem)] font-black tracking-[-0.04em]">
                {DESIGN_META[6].name}
              </p>
              <p className="mt-3 break-words text-[13px] leading-relaxed text-[#6b6b6b]">
                Set on a twelve-column grid. Rules at one pixel, corners square, signal red at
                #e63329.
              </p>
              <Link href="/" className={`${BLACK_BTN} mt-5 self-start border border-[#0a0a0a]`}>
                Open the live app →
              </Link>
            </div>

            <div className="col-span-4 min-w-0 border-t border-black/15 pt-4 lg:col-span-4 lg:border-t-0 lg:pt-0">
              <DesignPager
                n={7}
                className="mt-1"
                linkClass={`inline-flex items-center border border-black/15 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0a0a0a] transition-colors hover:bg-[#0a0a0a] hover:text-white ${FOCUS}`}
              />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
