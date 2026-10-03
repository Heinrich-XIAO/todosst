"use client";

import Link from "next/link";
import { DesignPager } from "./pager";
import { useDemo } from "./demo";
import { FEATURES, GRAMMAR, HEAT_LEVELS, RECURRENCE_TOKENS, SPECS, STATS, pad2 } from "./content";

/* Design 09 — Sunset Editorial: cream newsprint, full-bleed burnt-orange
   colour plates, oversized display serif, thick department rules. A broadsheet
   arts supplement that happens to ship software. */

const LABEL = "font-sans text-[11px] font-bold uppercase tracking-[0.18em]";
const DISPLAY = "font-serif leading-[0.9] tracking-[-0.02em]";
const PLATE_BODY = "text-[20px] font-bold leading-[1.35]";

function Dept({ no, name, meta }: { no: string; name: string; meta: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t-4 border-[#2b1a13] pt-4">
      <p className={`${LABEL} min-w-0 break-words text-[#2b1a13]`}>
        No. {no} — {name}
      </p>
      <p className={`${LABEL} min-w-0 break-words text-[#2b1a13]/70`}>{meta}</p>
    </div>
  );
}

export default function DesignNine() {
  const { tasks, draft, setDraft, add, toggle, done, open } = useDemo();
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#fdf0e4] text-[#2b1a13] antialiased">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-[#2b1a13] focus:px-3 focus:py-2 focus:font-sans focus:text-xs focus:font-bold focus:uppercase focus:tracking-widest focus:text-[#fdf0e4]"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b-4 border-[#2b1a13] bg-[#fdf0e4]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex items-center gap-3 py-2">
            <span aria-hidden className="h-[3px] w-6 shrink-0 bg-[#2b1a13] sm:w-10" />
            <Link
              href="/"
              className={`${DISPLAY} inline-flex min-h-11 shrink-0 items-center font-serif text-[clamp(1.5rem,6vw,2.25rem)] font-semibold`}
            >
              todosst
            </Link>
            <span aria-hidden className="h-[3px] min-w-0 flex-1 bg-[#2b1a13]" />
            <span className={`${LABEL} hidden shrink-0 text-[#2b1a13]/70 sm:inline`}>
              design {pad2(9)} / 10
            </span>
            <Link
              href="/design"
              className={`${LABEL} hidden min-h-11 shrink-0 items-center px-1 text-[#2b1a13] underline decoration-[#e2571f] decoration-2 underline-offset-4 hover:text-[#e2571f] sm:inline-flex`}
            >
              all ten designs
            </Link>
            <Link
              href="/"
              className="ml-auto inline-flex min-h-12 shrink-0 items-center rounded-none bg-[#2b1a13] px-4 font-sans text-[13px] font-bold uppercase tracking-[0.16em] text-[#fdf0e4]"
            >
              Open app
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#2b1a13]/30 py-1.5">
            <span className={LABEL}>Issue 09</span>
            <span aria-hidden className={LABEL}>
              ·
            </span>
            <span className={LABEL}>design 09 of 10</span>
            <span aria-hidden className={`${LABEL} hidden sm:inline`}>
              ·
            </span>
            <span className={`${LABEL} hidden text-[#2b1a13]/70 sm:inline`}>encrypted daily</span>
            <span className={`${LABEL} ml-auto hidden text-[#2b1a13]/70 md:inline`}>
              Sunset Editorial
            </span>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="mx-auto max-w-6xl px-4 pb-14 pt-8 sm:px-6 sm:pt-14">
          <p className={`${LABEL} text-[#2b1a13]/70`}>
            Supplement 09 · the encrypted daily · set in type
          </p>
          <h1 className={`${DISPLAY} mt-5 font-serif text-[clamp(2.75rem,11vw,6rem)] font-semibold`}>
            Big type.
            <br />
            Small tasks.
          </h1>

          <div className="mt-7 grid gap-7 border-t-4 border-[#2b1a13] pt-6 lg:grid-cols-[1.3fr_1fr] lg:gap-10">
            <div className="min-w-0">
              <p className="max-w-[46ch] font-serif text-[clamp(1.05rem,4.6vw,1.3rem)] italic leading-[1.55] text-[#2b1a13]/85">
                A daily list that seals itself before it leaves the page — folders that are only
                tasks, recurrence that opens like a window instead of a streak, and an all-clear you
                can reach before the paper goes to bed.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/"
                  className="inline-flex min-h-12 items-center justify-center rounded-none bg-[#2b1a13] px-6 py-3 text-xl font-bold text-[#fdf0e4]"
                >
                  Start the issue →
                </Link>
                <Link
                  href="/"
                  className="inline-flex min-h-12 items-center justify-center rounded-none bg-[#e2571f] px-6 py-3 text-xl font-bold text-[#fdf0e4]"
                >
                  Open the app →
                </Link>
              </div>
            </div>

            <aside className="flex min-w-0 flex-col justify-between gap-6 bg-[#e2571f] p-5 text-[#fdf0e4] sm:p-7">
              <div className="flex flex-wrap gap-2">
                <span className="bg-[#fdf0e4] px-2 py-1 font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-[#2b1a13]">
                  in this issue
                </span>
                <span className="bg-[#fdf0e4] px-2 py-1 font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-[#2b1a13]">
                  end-to-end
                </span>
              </div>
              <p className={`${DISPLAY} font-serif text-[clamp(4rem,18vw,7.5rem)] font-semibold tabular-nums`}>
                09
              </p>
              <p className={PLATE_BODY}>
                Ten ways to set a todo list. This is the one that keeps the server illiterate — and
                still closes the day on time.
              </p>
            </aside>
          </div>

          <dl className="mt-9 grid grid-cols-2 border-t-4 border-[#2b1a13] sm:grid-cols-4">
            {STATS.map((s) => (
              <div
                key={s.k}
                className="min-w-0 border-b border-[#2b1a13]/30 py-4 pr-3 sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0 sm:last:border-r-0"
              >
                <dt className="font-serif text-[clamp(2rem,7vw,3rem)] leading-none tabular-nums text-[#e2571f]">
                  {s.k}
                </dt>
                <dd className={`${LABEL} mt-2 break-words text-[#2b1a13]/70`}>{s.v}</dd>
              </div>
            ))}
          </dl>
        </section>
        {/* the desk — live demo */}
        <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
          <Dept no="01" name="the desk" meta="live · local · nothing leaves this browser" />
          <div className="mt-4 grid gap-5 lg:grid-cols-[1.1fr_1fr] lg:items-end">
            <h2 className={`${DISPLAY} min-w-0 break-words font-serif text-[clamp(2rem,7vw,3.25rem)] font-semibold`}>
              Type it once.
            </h2>
            <p className="min-w-0 max-w-[52ch] font-serif text-[17px] italic leading-[1.7] text-[#2b1a13]/80">
              Slash a path, bang a command, wave a recurrence token. One box reads all of it without
              ever leaving the home row.
            </p>
          </div>

          <div className="mt-6 grid gap-7 lg:grid-cols-5">
            <div className="min-w-0 border-2 border-[#2b1a13] bg-[#fffaf3] lg:col-span-3">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b-2 border-[#2b1a13] bg-[#2b1a13] px-3 py-2 text-[#fdf0e4]">
                <span className={LABEL}>the desk — set in your browser</span>
                <span className={`${LABEL} tabular-nums`}>
                  {done} done · {open} open
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
                    className="min-h-12 min-w-0 flex-1 rounded-none border-2 border-[#2b1a13] bg-[#fdf0e4] px-3 text-[15px] outline-none placeholder:text-[#2b1a13]/70 focus:border-[#e2571f] focus:ring-2 focus:ring-[#e2571f]"
                  />
                  <button
                    onClick={add}
                    aria-label="Add task"
                    className="min-h-12 min-w-12 shrink-0 rounded-none bg-[#2b1a13] px-4 font-sans text-[13px] font-bold uppercase tracking-[0.16em] text-[#fdf0e4]"
                  >
                    Add
                  </button>
                </div>

                <ul className="mt-4 border-t-2 border-[#2b1a13]">
                  {tasks.map((t) => (
                    <li key={t.id} className="border-b border-[#2b1a13]/30">
                      <button
                        onClick={() => toggle(t.id)}
                        aria-pressed={t.done}
                        className="flex min-h-12 w-full items-center gap-3 px-1 py-3 text-left"
                      >
                        <span
                          aria-hidden
                          className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 border-[#2b1a13] font-sans text-xs font-bold ${
                            t.done ? "bg-[#2b1a13] text-[#fdf0e4]" : "bg-transparent text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                        <span
                          className={`min-w-0 flex-1 break-words font-serif text-[15px] leading-snug ${
                            t.done ? "text-[#2b1a13]/70 line-through decoration-[#e2571f] decoration-2" : ""
                          }`}
                        >
                          {t.title}
                        </span>
                        {t.tag && (
                          <span className="min-w-0 max-w-[45%] shrink-0 break-all border border-[#2b1a13]/40 bg-[#e2571f]/15 px-1.5 py-0.5 font-mono text-[11px] text-[#2b1a13]">
                            {t.tag}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="mt-4">
                  <div className="h-4 w-full border-2 border-[#2b1a13] bg-[#fdf0e4]" aria-hidden>
                    <div
                      className="h-full bg-[#e2571f] transition-[width] duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className={`${LABEL} tabular-nums text-[#2b1a13]/70`}>
                      {pct}% · {done} of {tasks.length} closed
                    </p>
                    <p className="font-serif text-sm italic text-[#2b1a13]/70">
                      everything here lives in this tab
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
              <div className="min-w-0 border-t-4 border-[#e2571f] pt-4">
                <p className={`${LABEL} text-[#2b1a13]/70`}>from the copy desk</p>
                <p className="mt-3 font-serif text-[17px] leading-[1.7] text-[#2b1a13]/85">
                  The list is a directory, the directory is a URL, and the whole structure is
                  ciphertext by the time it reaches the wire. Write the line the way you would say
                  it; the punctuation does the filing.
                </p>
                <p className="mt-3 font-mono text-[13px] break-all text-[#2b1a13]">
                  /host hackathon/outreach write email
                </p>
              </div>

              <div className="min-w-0 border-t-4 border-[#2b1a13] pt-4">
                <p className={`${LABEL} text-[#2b1a13]/70`}>running tally</p>
                <dl className="mt-3 grid grid-cols-3 gap-3">
                  {(
                    [
                      ["open", open],
                      ["done", done],
                      ["on file", tasks.length],
                    ] as [string, number][]
                  ).map(([k, v]) => (
                    <div key={k} className="flex min-w-0 flex-col-reverse">
                      <dt className={`${LABEL} mt-2 break-words text-[#2b1a13]/70`}>{k}</dt>
                      <dd className="font-serif text-[clamp(1.75rem,8vw,2.5rem)] leading-none tabular-nums text-[#e2571f]">
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </section>

        {/* the daily surface — full-bleed colour plate */}
        <section className="mt-16 bg-[#e2571f] text-[#fdf0e4]">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-3 border-t-4 border-[#fdf0e4] pt-4">
              <p className={`${PLATE_BODY} min-w-0 break-words uppercase tracking-[0.12em]`}>
                No. 02 — the daily surface
              </p>
              <span className="bg-[#fdf0e4] px-2 py-1 font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-[#2b1a13]">
                28-day window
              </span>
            </div>

            <div className="mt-8 grid gap-9 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
              <div className="min-w-0">
                <h2 className={`${DISPLAY} font-serif text-[clamp(2.25rem,8vw,4rem)] font-semibold`}>
                  Today is the ritual
                </h2>
                <p className={`mt-5 max-w-[42ch] ${PLATE_BODY}`}>
                  Open recurrence windows and anything due land on one surface each morning. Close
                  the last one and the band types itself clear. Misses are free — pairs aren&apos;t.
                </p>
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-[#fdf0e4] px-2 py-1 font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-[#2b1a13]">
                    last 28 days
                  </span>
                  <span className="bg-[#fdf0e4] px-2 py-1 font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-[#2b1a13]">
                    four heat levels
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2" aria-hidden>
                  {HEAT_LEVELS.slice(-28).map((lvl, i) => (
                    <span
                      key={i}
                      className={`aspect-square border border-[#fdf0e4]/70 ${
                        lvl >= 4
                          ? "bg-[#fdf0e4]"
                          : lvl === 3
                            ? "bg-[#fdf0e4]/75"
                            : lvl === 2
                              ? "bg-[#fdf0e4]/50"
                              : lvl === 1
                                ? "bg-[#fdf0e4]/25"
                                : "bg-transparent"
                      }`}
                    />
                  ))}
                </div>
                <p className={`mt-5 border-t-4 border-[#fdf0e4] pt-4 ${PLATE_BODY}`}>
                  {open === 0
                    ? `✓ all clear — ${done} closed, nothing left open`
                    : `${open} still open — the all-clear band waits`}
                </p>
              </div>
            </div>
          </div>
        </section>
        {/* features */}
        <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
          <Dept no="03" name="departments" meta="06 entries" />
          <div className="mt-4 grid gap-5 lg:grid-cols-[1.1fr_1fr] lg:items-end">
            <h2 className={`${DISPLAY} min-w-0 break-words font-serif text-[clamp(2rem,7vw,3.25rem)] font-semibold`}>
              What&apos;s inside
            </h2>
            <p className="min-w-0 max-w-[52ch] font-serif text-[17px] italic leading-[1.7] text-[#2b1a13]/80">
              Six departments, printed in the order you meet them — from the cipher to the
              all-clear band that closes the day.
            </p>
          </div>

          <div className="mt-7 gap-8 sm:columns-2 lg:columns-3">
            {FEATURES.map((f) => (
              <article
                key={f.index}
                className="mb-8 min-w-0 break-inside-avoid border-t-4 border-[#2b1a13] pt-3"
              >
                <p className="font-serif text-[2.5rem] leading-none font-semibold tabular-nums text-[#e2571f]">
                  {f.index}
                </p>
                <h3 className="mt-3 font-serif text-xl leading-tight">{f.title}</h3>
                <p className="mt-2 break-words text-[15px] leading-relaxed text-[#2b1a13]/80">
                  {f.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* pull quote — the one plum plate */}
        <section className="mt-16 bg-[#6b2d3c] text-[#fdf0e4]">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <blockquote className="min-w-0 max-w-4xl">
              <p className="font-serif text-[clamp(1.6rem,6vw,3rem)] italic leading-[1.15]">
                “The server keeps a filing cabinet full of noise. Your list lives in the part it
                cannot read.”
              </p>
              <footer className={`${LABEL} mt-5 text-[#fdf0e4]`}>
                — from the colophon, issue 09
              </footer>
            </blockquote>
          </div>
        </section>

        {/* grammar */}
        <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
          <Dept no="04" name="the input grammar" meta="06 readings, one line" />
          <div className="mt-4 grid gap-5 lg:grid-cols-[1.1fr_1fr] lg:items-end">
            <h2 className={`${DISPLAY} min-w-0 break-words font-serif text-[clamp(2rem,7vw,3.25rem)] font-semibold`}>
              One line, six readings
            </h2>
            <p className="min-w-0 max-w-[52ch] font-serif text-[17px] italic leading-[1.7] text-[#2b1a13]/80">
              The punctuation is the instruction set. Nothing to memorise, nothing to reach for —
              the box reads the marks as you type them.
            </p>
          </div>

          <ul className="mt-7 border-t-4 border-[#2b1a13]">
            {GRAMMAR.map((g) => (
              <li
                key={g.input}
                className="flex flex-col gap-2 border-b border-[#2b1a13]/30 py-4 sm:flex-row sm:items-baseline sm:gap-5"
              >
                <code className="min-w-0 max-w-full break-all border-2 border-[#2b1a13] bg-[#2b1a13] px-2.5 py-1.5 font-mono text-[13px] leading-relaxed text-[#fdf0e4] sm:w-[44%] sm:shrink-0">
                  {g.input}
                </code>
                <span className="min-w-0 break-words text-[15px] leading-snug text-[#2b1a13]/80">
                  {g.action}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* specs */}
        <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
          <Dept no="05" name="the colophon" meta="08 lines" />
          <div className="mt-4 grid gap-5 lg:grid-cols-[1.1fr_1fr] lg:items-end">
            <h2 className={`${DISPLAY} min-w-0 break-words font-serif text-[clamp(2rem,7vw,3.25rem)] font-semibold`}>
              Set, stamped, shipped
            </h2>
            <p className="min-w-0 max-w-[52ch] font-serif text-[17px] italic leading-[1.7] text-[#2b1a13]/80">
              Everything printed on the back page of the issue: the stack, the cipher and the
              recurrence tokens the box will accept.
            </p>
          </div>

          <div className="mt-7 grid gap-9 lg:grid-cols-2 lg:gap-12">
            <div className="min-w-0">
              <dl className="border-t-4 border-[#2b1a13]">
                {SPECS.map((s) => (
                  <div
                    key={s.k}
                    className="flex flex-col gap-0.5 border-b border-[#2b1a13]/30 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                  >
                    <dt className={`${LABEL} text-[#2b1a13]/70`}>{s.k}</dt>
                    <dd className="min-w-0 break-words text-[15px] font-semibold sm:text-right">
                      {s.v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="min-w-0">
              <p className={`${LABEL} border-t-4 border-[#e2571f] pt-4 text-[#2b1a13]/70`}>
                recurrence tokens
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {RECURRENCE_TOKENS.map((r) => (
                  <span
                    key={r}
                    className="max-w-full break-all border-2 border-[#2b1a13] bg-[#e2571f]/15 px-2.5 py-1.5 font-mono text-[13px] font-bold text-[#2b1a13]"
                  >
                    {r}
                  </span>
                ))}
              </div>

              <p className="mt-6 font-serif text-[17px] italic leading-[1.7] text-[#2b1a13]/80">
                Windows open and close on their own schedule; a miss costs nothing, a pair compounds
                quietly in the heatmap above.
              </p>

              <Link
                href="/"
                className="mt-6 inline-flex min-h-12 items-center justify-center rounded-none bg-[#2b1a13] px-6 py-3 text-xl font-bold text-[#fdf0e4]"
              >
                Read the whole issue →
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t-4 border-[#2b1a13] bg-[#2b1a13] text-[#fdf0e4]">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
            <p className={`${DISPLAY} min-w-0 break-words font-serif text-[clamp(1.5rem,5vw,2.25rem)] font-semibold`}>
              Design {pad2(9)} — Sunset Editorial
            </p>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center font-sans text-[11px] font-bold uppercase tracking-[0.18em] text-[#fdf0e4] underline decoration-[#e2571f] decoration-2 underline-offset-4 hover:text-[#e2571f]"
            >
              Open the live app →
            </Link>
          </div>
          <p className={`${LABEL} text-[#fdf0e4]`}>
            Issue 09 · big type for small tasks · end of section
          </p>
          <DesignPager
            n={9}
            className="border-t border-[#fdf0e4]/40 pt-3"
            linkClass="inline-flex items-center font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-[#fdf0e4] underline decoration-[#e2571f] decoration-2 underline-offset-4 hover:text-[#e2571f]"
          />
        </div>
      </footer>
    </div>
  );
}
