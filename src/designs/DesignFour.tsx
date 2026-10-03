"use client";

import Link from "next/link";
import { DesignPager } from "./pager";
import { useDemo } from "./demo";
import { FEATURES, GRAMMAR, HEAT_LEVELS, RECURRENCE_TOKENS, SPECS, STATS, pad2 } from "./content";

/* Design 04 — Paper Journal: warm ruled stock, navy serif display, hairline
   printed rules and one red-pen accent. A notebook that encrypts itself. */

const LABEL = "font-sans text-[10px] font-semibold uppercase tracking-[0.2em]";
const SECTION_TITLE = "font-serif text-[clamp(1.7rem,5.5vw,2.6rem)] leading-[1.1] tracking-[-0.01em]";
const RULED = "repeating-linear-gradient(to bottom, transparent 0 31px, rgba(27,42,74,0.09) 31px 32px)";

export default function DesignFour() {
  const { tasks, draft, setDraft, add, toggle, done, open } = useDemo();
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#f6f1e6] text-[#1b2a4a] antialiased">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:border focus:border-[#1b2a4a] focus:bg-[#f6f1e6] focus:px-3 focus:py-2 focus:font-sans focus:text-xs focus:uppercase focus:tracking-widest"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-[#1b2a4a]/30 bg-[#f6f1e6]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center font-serif text-xl tracking-[-0.02em]"
            >
              todosst
            </Link>
            <span className="hidden min-w-0 truncate font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[#1b2a4a]/50 sm:inline">
              page {pad2(4)} · design {pad2(4)} / 10
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/design"
              className={`${LABEL} hidden min-h-11 items-center border-b border-[#c8452f] px-1 text-[#c8452f] sm:inline-flex`}
            >
              all ten designs
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-12 items-center rounded-sm bg-[#1b2a4a] px-4 font-sans text-xs font-semibold uppercase tracking-[0.18em] text-[#f6f1e6]"
            >
              Open app
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 pb-20 sm:px-6" style={{ backgroundImage: RULED }}>
        <section className="pt-8 sm:pt-14">
          <p className={`${LABEL} text-[#c8452f]`}>Design {pad2(4)} · Paper Journal</p>
          <h1 className="mt-4 font-serif text-[clamp(2.35rem,9.5vw,5.5rem)] font-medium leading-[1.04] tracking-[-0.02em]">
            A notebook that
            <br />
            keeps secrets.
          </h1>

          <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-10">
            <p className="max-w-2xl font-serif text-[17px] leading-[1.85] first-letter:float-left first-letter:mr-2 first-letter:text-[3.5em] first-letter:leading-[0.8] first-letter:font-serif first-letter:text-[#c8452f]">
              Every line you write is sealed before it leaves the page — titles, folders, streaks, the
              whole index — and only your password holds the key. What comes back is plain ink again:
              a directory, a due list, a day you are allowed to close.
            </p>
            <p className="w-full border-l-2 border-[#c8452f]/50 pl-3 font-serif text-sm italic leading-relaxed text-[#1b2a4a]/75 lg:w-[15rem] lg:rotate-[-1.5deg]">
              pencilled in the margin — the server keeps no dictionary, only noise it cannot read.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center rounded-sm bg-[#1b2a4a] px-6 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-[#f6f1e6]"
            >
              Start a page
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center rounded-sm border border-[#c8452f] px-6 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-[#c8452f]"
            >
              Open the app →
            </Link>
          </div>

          <dl className="mt-10 grid grid-cols-2 border-t border-[#1b2a4a]/30 sm:grid-cols-4">
            {STATS.map((s) => (
              <div
                key={s.k}
                className="min-w-0 border-b border-[#1b2a4a]/20 px-1 py-4 sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0 sm:last:border-r-0"
              >
                <dt className="font-serif text-[2rem] leading-none tabular-nums sm:text-[2.5rem]">
                  {s.k}
                </dt>
                <dd className={`${LABEL} mt-2 text-[#1b2a4a]/55`}>{s.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-14 grid gap-6 lg:grid-cols-5">
          <div className="min-w-0 border border-[#1b2a4a]/40 bg-[#fbf8f0] lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[#1b2a4a]/40 bg-[#1b2a4a] px-3 py-2 text-[#f6f1e6]">
              <span className={LABEL}>the desk · live, local</span>
              <span className={`${LABEL} tabular-nums`}>
                {done} closed · {open} open
              </span>
            </div>

            <div className="p-3 sm:p-4">
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && add()}
                  aria-label="Try the input grammar"
                  placeholder="a line, e.g. stretch ~daily"
                  className="min-h-12 min-w-0 flex-1 rounded-sm border border-[#1b2a4a]/40 bg-[#f6f1e6]/70 px-3 font-serif text-sm outline-none placeholder:text-[#1b2a4a]/40 focus:border-[#c8452f] focus:bg-white"
                />
                <button
                  onClick={add}
                  aria-label="Add task"
                  className="min-h-12 min-w-12 rounded-sm bg-[#1b2a4a] px-4 font-sans text-xs font-semibold uppercase tracking-[0.15em] text-[#f6f1e6]"
                >
                  Add
                </button>
              </div>

              <ul className="mt-4 border-t border-[#1b2a4a]/30">
                {tasks.map((t) => (
                  <li key={t.id} className="border-b border-[#1b2a4a]/15">
                    <button
                      onClick={() => toggle(t.id)}
                      aria-pressed={t.done}
                      className="flex min-h-12 w-full items-center gap-3 px-1 py-3 text-left"
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center border font-sans text-xs leading-none ${
                          t.done ? "border-[#c8452f] text-[#c8452f]" : "border-[#1b2a4a]/50"
                        }`}
                        aria-hidden
                      >
                        {t.done ? "✓" : ""}
                      </span>
                      <span
                        className={`min-w-0 flex-1 break-words font-serif text-[15px] leading-snug ${
                          t.done
                            ? "text-[#1b2a4a]/45 line-through decoration-[#c8452f] decoration-[1.5px]"
                            : ""
                        }`}
                      >
                        {t.title}
                      </span>
                      {t.tag && (
                        <span className="min-w-0 max-w-[45%] break-all border border-[#1b2a4a]/25 bg-[#1b2a4a]/5 px-1.5 py-0.5 font-mono text-[10px] text-[#1b2a4a]/70">
                          {t.tag}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>

              <div className="mt-4">
                <div className="h-2 w-full border border-[#1b2a4a]/30 bg-[#f6f1e6]" aria-hidden>
                  <div
                    className="h-full bg-[#1b2a4a] transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className={`${LABEL} tabular-nums text-[#1b2a4a]/55`}>
                    {done} of {tasks.length} closed · {pct}%
                  </p>
                  <p className="font-serif text-xs italic text-[#1b2a4a]/50">
                    nothing leaves this browser
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
            <div className="border border-[#1b2a4a]/40 bg-[#efe8d8] p-4 sm:p-5">
              <p className={`${LABEL} text-[#c8452f]`}>folio 02</p>
              <h2 className="mt-2 font-serif text-2xl leading-tight sm:text-[1.75rem]">
                Today is the ritual
              </h2>
              <p className="mt-3 font-serif text-[15px] leading-[1.75] text-[#1b2a4a]/80">
                Open recurrence windows and anything due land on one surface each morning. Close the
                last one and the page stamps itself clear. Misses are free — pairs aren&apos;t.
              </p>

              <div className="mt-5">
                <p className={`${LABEL} text-[#1b2a4a]/50`}>last 28 days</p>
                <div className="mt-2 grid grid-cols-7 gap-1" aria-hidden>
                  {HEAT_LEVELS.slice(-28).map((lvl, i) => (
                    <span
                      key={i}
                      className={`aspect-square border border-[#1b2a4a]/25 ${
                        lvl >= 4
                          ? "bg-[#1b2a4a]"
                          : lvl === 3
                            ? "bg-[#1b2a4a]/60"
                            : lvl === 2
                              ? "bg-[#1b2a4a]/35"
                              : lvl === 1
                                ? "bg-[#1b2a4a]/15"
                                : "bg-transparent"
                      }`}
                    />
                  ))}
                </div>
              </div>

              <p className="mt-4 border-t border-[#1b2a4a]/25 pt-3 font-serif text-sm text-[#c8452f]">
                {open === 0
                  ? `✓ all clear — ${done} closed, nothing open`
                  : `${open} still open — the all clear waits`}
              </p>
            </div>

            <div className="border border-[#1b2a4a]/40 bg-[#fbf8f0] p-4">
              <p className={`${LABEL} text-[#1b2a4a]/50`}>running tally</p>
              <dl className="mt-3 border-t border-[#1b2a4a]/25">
                <div className="flex items-baseline justify-between gap-3 border-b border-[#1b2a4a]/15 py-2">
                  <dt className="font-serif text-[15px]">closed today</dt>
                  <dd className="font-serif text-lg tabular-nums">{done}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-[#1b2a4a]/15 py-2">
                  <dt className="font-serif text-[15px]">still open</dt>
                  <dd className="font-serif text-lg tabular-nums text-[#c8452f]">{open}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="font-serif text-[15px]">on the page</dt>
                  <dd className="font-serif text-lg tabular-nums">{tasks.length}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className="mt-16 border-t-2 border-[#1b2a4a]/40 pt-6">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <h2 className={`${SECTION_TITLE} min-w-0 break-words`}>What the cover keeps in</h2>
            <span className={`${LABEL} text-[#1b2a4a]/45`}>06 entries</span>
          </div>
          <div className="mt-6 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.index} className="min-w-0 border-t border-[#1b2a4a]/30 pt-4">
                <p className={`${LABEL} text-[#c8452f]`}>{f.index}</p>
                <h3 className="mt-2 font-serif text-lg leading-snug sm:text-xl">{f.title}</h3>
                <p className="mt-2 break-words font-serif text-[15px] leading-[1.7] text-[#1b2a4a]/75">
                  {f.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-10 border-t-2 border-[#1b2a4a]/40 pt-6 lg:grid-cols-2 lg:gap-12">
          <div className="min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <h2 className={`${SECTION_TITLE} min-w-0 break-words`}>One line, six readings</h2>
              <span className={`${LABEL} text-[#1b2a4a]/45`}>input</span>
            </div>
            <ul className="mt-5 border-t border-[#1b2a4a]/30">
              {GRAMMAR.map((g) => (
                <li
                  key={g.input}
                  className="flex flex-col gap-2 border-b border-[#1b2a4a]/15 py-3 sm:flex-row sm:items-baseline sm:gap-4"
                >
                  <code className="min-w-0 max-w-full break-all border border-[#1b2a4a]/30 bg-[#1b2a4a]/5 px-2 py-1 font-mono text-[12px] leading-relaxed sm:w-[46%] sm:shrink-0">
                    {g.input}
                  </code>
                  <span className="min-w-0 break-words font-serif text-[15px] leading-snug text-[#1b2a4a]/75">
                    {g.action}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-6 w-full border-l-2 border-[#c8452f]/50 pl-3 font-serif text-sm italic leading-relaxed text-[#1b2a4a]/70 lg:w-[92%] lg:rotate-[-1.5deg]">
              in the margin: the box reads the punctuation so you never have to reach for the mouse.
            </p>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <h2 className={`${SECTION_TITLE} min-w-0 break-words`}>The colophon</h2>
              <span className={`${LABEL} text-[#1b2a4a]/45`}>08 lines</span>
            </div>
            <dl className="mt-5 border-t border-[#1b2a4a]/30">
              {SPECS.map((s) => (
                <div
                  key={s.k}
                  className="flex flex-col gap-0.5 border-b border-[#1b2a4a]/15 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                >
                  <dt className={`${LABEL} text-[#1b2a4a]/55`}>{s.k}</dt>
                  <dd className="min-w-0 break-words font-serif text-[15px] sm:text-right">
                    {s.v}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-6">
              <p className={`${LABEL} text-[#1b2a4a]/55`}>recurrence tokens</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {RECURRENCE_TOKENS.map((r) => (
                  <span
                    key={r}
                    className="max-w-full break-all border border-[#1b2a4a]/30 bg-[#fbf8f0] px-2 py-1 font-mono text-[11px] text-[#1b2a4a]/80"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-[#1b2a4a]/40 bg-[#efe8d8]">
        <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
            <span className="min-w-0 break-words font-serif text-lg">
              Design {pad2(4)} of 10 — Paper Journal
            </span>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center font-sans text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c8452f] underline underline-offset-4"
            >
              Open the live app →
            </Link>
          </div>
          <p className={`${LABEL} text-[#1b2a4a]/45`}>page {pad2(4)} · end of entry</p>
          <DesignPager
            n={4}
            className="border-t border-[#1b2a4a]/25 pt-3"
            linkClass="inline-flex min-h-11 items-center font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1b2a4a]/70 underline underline-offset-4 hover:text-[#c8452f]"
          />
        </div>
      </footer>
    </div>
  );
}
