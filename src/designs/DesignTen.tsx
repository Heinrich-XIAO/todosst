"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DesignPager } from "./pager";
import { useDemo } from "./demo";
import { FEATURES, GRAMMAR, HEAT_LEVELS, RECURRENCE_TOKENS, SPECS, STATS, pad2 } from "./content";

/* Design 10 — Forest Zen: sage ground, stone panels, hairline rules and one
   deep-green fill. Generous whitespace, a whisper of grain, nothing that shouts. */

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23g)'/%3E%3C/svg%3E\")";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3f5d45]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#eef1ea]";

const PRIMARY = `inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#3f5d45] px-7 text-sm text-[#f7f8f4] transition-colors hover:bg-[#33503a] sm:w-auto ${FOCUS}`;
const SECONDARY = `inline-flex min-h-12 w-full items-center justify-center rounded-full border border-[#d9ded2] px-7 text-sm text-[#3f5d45] transition-colors hover:border-[#3f5d45]/60 hover:bg-[#f7f8f4] sm:w-auto ${FOCUS}`;
const EYEBROW = "text-[10px] font-medium uppercase tracking-[0.3em] text-[#6f8272] sm:text-[11px]";
const LABEL = "text-[10px] uppercase tracking-[0.2em] text-[#6f8272] sm:text-[11px]";

const HEAT = [
  "border border-[#d9ded2] bg-transparent",
  "bg-[#ccd6c4]",
  "bg-[#8ba38f]",
  "bg-[#3f5d45]",
];

function heatClass(lvl: number): string {
  return lvl >= 3 ? HEAT[3] : HEAT[lvl];
}

function SectionHead({
  n,
  label,
  title,
  meta,
}: {
  n: number;
  label: string;
  title: string;
  meta?: string;
}) {
  return (
    <div className="border-t border-[#d9ded2] pt-7">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#3f5d45]/40 text-[11px] tabular-nums text-[#3f5d45]">
          {pad2(n)}
        </span>
        <p className={EYEBROW}>{label}</p>
        {meta ? <span className={`${LABEL} sm:ml-auto`}>{meta}</span> : null}
      </div>
      <h2 className="mt-5 max-w-2xl break-words text-[clamp(1.5rem,5vw,2.125rem)] font-light leading-snug tracking-[-0.02em] text-[#2b3f31]">
        {title}
      </h2>
    </div>
  );
}

export default function DesignTen() {
  const { tasks, draft, setDraft, add, toggle, done, open } = useDemo();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <>
      <a
        href="#main"
        className={`sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:min-h-11 focus:rounded-full focus:border focus:border-[#3f5d45] focus:bg-[#eef1ea] focus:px-4 focus:text-sm focus:text-[#3f5d45] ${FOCUS}`}
      >
        Skip to content
      </a>

      <header
        className={`sticky top-0 z-40 border-b transition-colors duration-300 ${
          scrolled
            ? "border-[#d9ded2] bg-[#eef1ea]/95 backdrop-blur-sm"
            : "border-transparent bg-[#eef1ea]/70"
        }`}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-5 py-3 text-[#3f5d45] sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className={`inline-flex min-h-11 items-center text-[15px] tracking-[-0.01em] text-[#2b3f31] ${FOCUS}`}
            >
              todosst
            </Link>
            <span className={`${EYEBROW} hidden sm:inline`}>design {pad2(10)} / 10</span>
          </div>
          <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link
              href="/design"
              className={`inline-flex min-h-11 items-center rounded-full px-3 text-[12px] text-[#6f8272] transition-colors hover:text-[#3f5d45] ${FOCUS}`}
            >
              10 designs
            </Link>
            <Link
              href="#demo"
              className={`hidden min-h-11 items-center rounded-full px-3 text-[12px] text-[#6f8272] transition-colors hover:text-[#3f5d45] sm:inline-flex ${FOCUS}`}
            >
              Try it
            </Link>
            <Link
              href="/"
              className={`inline-flex min-h-11 items-center rounded-full border border-[#d9ded2] px-4 text-[12px] text-[#3f5d45] transition-colors hover:border-[#3f5d45]/60 hover:bg-[#f7f8f4] ${FOCUS}`}
            >
              Open app
            </Link>
          </nav>
        </div>
      </header>

      <div className="relative min-h-screen overflow-hidden bg-[#eef1ea] text-[#3f5d45]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: GRAIN, backgroundRepeat: "repeat" }}
        />

        <main id="main" className="relative mx-auto max-w-4xl px-5 pt-12 sm:px-8 sm:pt-16">
          {/* hero */}
          <section>
            <p className={`flex items-center gap-2.5 ${EYEBROW}`}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#3f5d45]" aria-hidden />
              design {pad2(10)} / 10 · forest zen
            </p>

            <h1 className="mt-6 max-w-3xl break-words text-[clamp(2.5rem,9vw,4.5rem)] font-light leading-[1.05] tracking-[-0.02em] text-[#2b3f31]">
              Quiet software for loud minds.
            </h1>

            <p className="mt-6 max-w-2xl break-words text-[15px] leading-relaxed text-[#3f5d45] sm:text-base">
              An encrypted place to keep the day. Folders are tasks, deadlines are windows, and not a
              readable word ever leaves your device — write it down, close the surface, and let the
              room go quiet again.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/" className={PRIMARY}>
                Open the app
              </Link>
              <Link href="/" className={SECONDARY}>
                Start free — no card
              </Link>
            </div>

            <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-[#d9ded2] pt-7 sm:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.k} className="min-w-0">
                  <dt className="text-[clamp(1.5rem,5vw,2rem)] font-light leading-none tabular-nums tracking-[-0.02em] text-[#2b3f31]">
                    {s.k}
                  </dt>
                  <dd className="mt-2 break-words text-[10px] uppercase tracking-[0.14em] text-[#6f8272] sm:text-[11px]">
                    {s.v}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {/* live demo */}
          <section id="demo" className="mt-24 sm:mt-32">
            <SectionHead
              n={1}
              label="the input box"
              title="Type it the way you would say it."
              meta={`${open} open · ${done} done`}
            />

            <div className="mt-8 max-w-3xl rounded-2xl border border-[#d9ded2] bg-[#f7f8f4] p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-2 ${EYEBROW}`}>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#3f5d45]" aria-hidden />
                  live demo · local only
                </span>
                <span className="text-[11px] tabular-nums text-[#6f8272]">
                  {done} done · {open} open
                </span>
              </div>

              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  add();
                }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label="Try the input grammar"
                  placeholder="try: stretch ~daily"
                  className={`min-h-12 min-w-0 flex-1 rounded-full border border-[#d9ded2] bg-[#eef1ea] px-5 text-sm text-[#3f5d45] outline-none transition-colors placeholder:text-[#6f8272] focus:border-[#3f5d45]/60 ${FOCUS}`}
                />
                <button
                  type="submit"
                  aria-label="Add task"
                  className={`min-h-12 shrink-0 rounded-full border border-[#d9ded2] px-5 text-sm text-[#3f5d45] transition-colors hover:border-[#3f5d45]/60 hover:bg-[#eef1ea] ${FOCUS}`}
                >
                  Add
                </button>
              </form>

              <ul className="mt-5 divide-y divide-[#d9ded2] border-y border-[#d9ded2]">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => toggle(t.id)}
                      aria-pressed={t.done}
                      className={`flex min-h-12 w-full items-start gap-3 py-3 text-left transition-colors hover:bg-[#eef1ea] ${FOCUS}`}
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                          t.done
                            ? "border-[#3f5d45] bg-[#3f5d45] text-[#f7f8f4]"
                            : "border-[#d9ded2] bg-transparent"
                        }`}
                        aria-hidden
                      >
                        {t.done ? "✓" : ""}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block break-words text-sm ${
                            t.done ? "text-[#6f8272] line-through" : "text-[#3f5d45]"
                          }`}
                        >
                          {t.title}
                        </span>
                        {t.tag ? (
                          <span className="mt-1 inline-block break-all text-[10px] tracking-[0.1em] text-[#6f8272]">
                            {t.tag}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <div
                role="progressbar"
                aria-label="Tasks completed"
                aria-valuemin={0}
                aria-valuemax={Math.max(tasks.length, 1)}
                aria-valuenow={done}
                className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#e2e7db]"
              >
                <div
                  className="h-full rounded-full bg-[#3f5d45] transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-3 break-words text-[11px] leading-relaxed text-[#6f8272]">
                {pct}% closed · {open} open · every row is a toggle, nothing leaves this page
              </p>
            </div>
          </section>

          {/* ritual */}
          <section className="mt-24 sm:mt-32">
            <SectionHead
              n={2}
              label="the daily surface"
              title="Today is the ritual"
              meta="last 28 days"
            />

            <div className="mt-8 max-w-3xl rounded-2xl border border-[#d9ded2] bg-[#f7f8f4] p-5 sm:p-7">
              <p className="max-w-2xl break-words text-[15px] leading-relaxed text-[#3f5d45]">
                Recurring windows and anything due gather on one surface each morning — a single list
                instead of an inbox to dig through, and no badge counting your failures while you
                read it.
              </p>
              <p className="mt-4 max-w-2xl break-words text-[15px] leading-relaxed text-[#3f5d45]">
                Close the last one and the page goes still: a lone all-clear line where the noise
                was. Misses are free — pairs aren&apos;t. A day off costs nothing; two in a row is
                where the habit actually lives.
              </p>

              <div className="mt-7 grid grid-cols-7 gap-1.5" aria-hidden>
                {HEAT_LEVELS.slice(-28).map((lvl, i) => (
                  <span key={i} className={`aspect-square rounded-[3px] ${heatClass(lvl)}`} />
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2" aria-hidden>
                <span className={LABEL}>less</span>
                <span className="flex items-center gap-1">
                  {HEAT.map((cls, i) => (
                    <span key={i} className={`h-2.5 w-2.5 rounded-[3px] ${cls}`} />
                  ))}
                </span>
                <span className={LABEL}>more</span>
              </div>

              <div className="mt-6 flex items-center gap-2.5 border-t border-[#d9ded2] pt-5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#3f5d45]" aria-hidden />
                <span className="min-w-0 break-words text-[13px] text-[#3f5d45]">
                  all clear — nothing is waiting on you
                </span>
              </div>
            </div>
          </section>

          {/* features */}
          <section className="mt-24 sm:mt-32">
            <SectionHead n={3} label="what's inside" title="Six parts, kept quiet." meta="06 features" />

            <div className="mt-8 grid gap-x-10 gap-y-9 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <article key={f.index} className="min-w-0 border-t border-[#d9ded2] pt-5">
                  <p className="text-[11px] tabular-nums tracking-[0.3em] text-[#6f8272]">
                    {f.index}
                  </p>
                  <h3 className="mt-3 break-words text-base font-normal leading-snug tracking-[-0.01em] text-[#2b3f31] sm:text-lg">
                    {f.title}
                  </h3>
                  <p className="mt-2 break-words text-[14px] leading-relaxed text-[#3f5d45]">
                    {f.body}
                  </p>
                </article>
              ))}
            </div>
          </section>

          {/* grammar */}
          <section className="mt-24 sm:mt-32">
            <SectionHead
              n={4}
              label="the grammar"
              title="Say it however it comes out."
              meta="06 rows"
            />

            <ul className="mt-8 divide-y divide-[#d9ded2] border-y border-[#d9ded2]">
              {GRAMMAR.map((g) => (
                <li
                  key={g.input}
                  className="flex flex-col gap-2 py-4 sm:flex-row sm:items-baseline sm:gap-6"
                >
                  <code className="min-w-0 max-w-full break-all rounded-lg border border-[#d9ded2] bg-[#f7f8f4] px-3 py-2 font-mono text-[12px] leading-relaxed text-[#3f5d45] sm:w-[42%] sm:shrink-0">
                    {g.input}
                  </code>
                  <span className="min-w-0 break-words text-[14px] leading-relaxed text-[#3f5d45]">
                    {g.action}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* specs */}
          <section className="mt-24 sm:mt-32">
            <SectionHead n={5} label="the fine print" title="Spec sheet" meta="08 lines" />

            <dl className="mt-8 divide-y divide-[#d9ded2] border-y border-[#d9ded2]">
              {SPECS.map((s) => (
                <div
                  key={s.k}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3.5"
                >
                  <dt className={LABEL}>{s.k}</dt>
                  <dd className="min-w-0 break-words text-right text-[14px] text-[#3f5d45]">
                    {s.v}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-8 max-w-3xl">
              <p className={EYEBROW}>recurrence tokens</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {RECURRENCE_TOKENS.map((r) => (
                  <span
                    key={r}
                    className="inline-flex break-all rounded-full border border-[#d9ded2] px-3 py-1.5 text-[12px] text-[#3f5d45]"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </section>
        </main>

        <footer className="relative mt-24 border-t border-[#d9ded2] sm:mt-32">
          <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className={`break-words ${EYEBROW}`}>
                  design {pad2(10)} of 10 — forest zen
                </p>
                <p className="mt-2 break-words text-sm text-[#3f5d45]">
                  Quiet software for loud minds.
                </p>
              </div>
              <Link
                href="/"
                className={`inline-flex min-h-11 items-center self-start rounded-full border border-[#d9ded2] px-5 text-[12px] text-[#3f5d45] transition-colors hover:border-[#3f5d45]/60 hover:bg-[#f7f8f4] sm:self-auto ${FOCUS}`}
              >
                Open the app →
              </Link>
            </div>

            <DesignPager
              n={10}
              className="mt-8 border-t border-[#d9ded2] pt-4"
              linkClass={`rounded-full text-[12px] text-[#3f5d45] transition-colors hover:bg-[#f7f8f4] ${FOCUS}`}
            />
          </div>
        </footer>
      </div>
    </>
  );
}
