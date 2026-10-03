"use client";

import Link from "next/link";
import { DesignPager } from "./pager";
import { useDemo } from "./demo";
import { FEATURES, GRAMMAR, HEAT_LEVELS, RECURRENCE_TOKENS, SPECS, STATS, pad2 } from "./content";

/* Design 02 — Pastel Cloud: warm off-white, fat corner radii, pill buttons and
   candy lavender/mint accents. Diffuse shadows, sentence case, nothing sharp. */

const CARD =
  "rounded-3xl border border-black/5 shadow-[0_18px_40px_-24px_rgba(94,74,160,0.45)]";
const SOFT = "rounded-2xl border border-black/5 bg-white shadow-[0_12px_28px_-24px_rgba(94,74,160,0.5)]";
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9a4ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fff8f3]";
const BTN_PRIMARY = `inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#241f3d] px-7 text-sm font-medium text-white shadow-[0_18px_40px_-24px_rgba(94,74,160,0.45)] transition hover:-translate-y-0.5 sm:w-auto ${FOCUS}`;
const BTN_SECONDARY = `inline-flex min-h-12 w-full items-center justify-center rounded-full border border-black/10 bg-white px-7 text-sm font-medium text-[#241f3d] shadow-[0_12px_28px_-24px_rgba(94,74,160,0.5)] transition hover:-translate-y-0.5 hover:border-[#b9a4ff] sm:w-auto ${FOCUS}`;
const EYEBROW = "text-[11px] font-medium tracking-[0.16em] text-[#6b6288]";

const HEAT = [
  "border border-black/5 bg-white",
  "bg-[#e2faf2]",
  "bg-[#7fd8c0]",
  "bg-[#b9a4ff]",
  "bg-[#8b76f0]",
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className={EYEBROW}>
      <span className="mr-2 text-[#ff9d8a]" aria-hidden>
        ●
      </span>
      {children}
    </p>
  );
}

function Chip({ tone, children }: { tone: "lavender" | "mint" | "coral"; children: React.ReactNode }) {
  const tones = {
    lavender: "border-[#b9a4ff]/50 bg-[#f3efff] text-[#4a3aa8]",
    mint: "border-[#7fd8c0]/60 bg-[#eafaf4] text-[#1f7a63]",
    coral: "border-[#ff9d8a]/50 bg-[#fff1ed] text-[#a8442a]",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-medium tracking-[0.12em] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export default function DesignTwo() {
  const { tasks, draft, setDraft, add, toggle, done, open } = useDemo();
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <div className="relative min-h-screen bg-[#fff8f3] text-[#241f3d]">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-24 h-80 w-80 rounded-full bg-[#b9a4ff] opacity-30 blur-3xl" />
        <div className="absolute -right-28 top-40 h-96 w-96 rounded-full bg-[#7fd8c0] opacity-25 blur-3xl" />
        <div className="absolute left-1/3 top-[52%] h-72 w-72 rounded-full bg-[#ff9d8a] opacity-20 blur-3xl" />
        <div className="absolute bottom-10 -left-24 h-72 w-72 rounded-full bg-[#ffe3d6] opacity-40 blur-3xl" />
      </div>

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-[#241f3d] focus:px-4 focus:py-3 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-white/70 bg-[#fff8f3]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link
              href="/"
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full text-base font-semibold tracking-tight sm:text-lg ${FOCUS}`}
            >
              todosst
            </Link>
            <span className="min-w-0 truncate rounded-full border border-black/5 bg-white px-2.5 py-1 text-[10px] font-medium tracking-[0.06em] text-[#6b6288]">
              design {pad2(2)} / 10
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/design"
              className={`hidden min-h-11 items-center rounded-full border border-black/10 bg-white px-4 text-xs font-medium sm:inline-flex ${FOCUS}`}
            >
              All 10 designs
            </Link>
            <Link
              href="/"
              className={`inline-flex min-h-11 items-center rounded-full bg-[#241f3d] px-4 text-xs font-medium text-white ${FOCUS}`}
            >
              Open app
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="relative mx-auto max-w-6xl px-4 pb-4 pt-10 sm:px-6 sm:pt-16">
        {/* hero */}
        <section>
          <div className="flex flex-wrap gap-2">
            <Chip tone="lavender">design {pad2(2)} / 10</Chip>
            <Chip tone="mint">pastel cloud</Chip>
            <Chip tone="coral">end-to-end encrypted</Chip>
          </div>

          <h1 className="mt-6 text-[clamp(2.5rem,10vw,5.5rem)] font-semibold leading-[0.95] tracking-[-0.03em] break-words">
            <span className="block">Heavy days,</span>
            <span className="block">lighter touch.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#241f3d]/70 break-words sm:text-lg">
            An encrypted to-do vault that keeps the whole day in one gentle place. Folders are tasks,
            deadlines are windows, and nothing readable ever leaves your device.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/" className={BTN_PRIMARY}>
              Start free — no card
            </Link>
            <Link href="/" className={BTN_SECONDARY}>
              Open the app →
            </Link>
          </div>

          <dl className="mt-9 grid grid-cols-2 gap-3 sm:mt-12 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.k} className={`${SOFT} p-4`}>
                <dt className="text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">{s.k}</dt>
                <dd className="mt-1 break-words text-[11px] leading-snug text-[#6b6288]">{s.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* live demo + ritual */}
        <section className="mt-14 sm:mt-20">
          <div className="min-w-0 max-w-2xl">
            <Eyebrow>the input box</Eyebrow>
            <h2 className="mt-2 text-[clamp(1.75rem,6vw,2.75rem)] font-semibold leading-tight tracking-[-0.02em] break-words">
              A box that listens
            </h2>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-5 lg:gap-6">
            <div className={`${CARD} min-w-0 bg-white p-4 sm:p-5 lg:col-span-3`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`${EYEBROW} inline-flex items-center gap-2`}>
                  <span className="h-2 w-2 rounded-full bg-[#ff9d8a]" aria-hidden />
                  live demo · local only
                </span>
                <span className="rounded-full bg-[#f3efff] px-2.5 py-1 text-[11px] font-medium tabular-nums text-[#4a3aa8]">
                  {done} done · {open} open
                </span>
              </div>

              <form
                className="mt-4 flex gap-2"
                onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  add();
                }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label="Try the input grammar"
                  placeholder="try: stretch ~daily"
                  className={`min-h-12 min-w-0 flex-1 rounded-2xl border border-black/10 bg-[#fffdfb] px-4 text-sm outline-none placeholder:text-[#241f3d]/35 focus:border-[#b9a4ff] focus:bg-white ${FOCUS}`}
                />
                <button
                  type="submit"
                  aria-label="Add task"
                  className={`min-h-12 min-w-12 shrink-0 rounded-full bg-[#241f3d] px-5 text-sm font-medium text-white transition hover:bg-[#4a3aa8] ${FOCUS}`}
                >
                  Add
                </button>
              </form>

              <ul className="mt-3 divide-y divide-black/5">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => toggle(t.id)}
                      aria-pressed={t.done}
                      className={`flex min-h-12 w-full items-start gap-3 rounded-2xl px-2 py-3 text-left transition hover:bg-[#faf7ff] ${FOCUS}`}
                    >
                      <span
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                          t.done ? "bg-[#7fd8c0] text-[#124f42]" : "border border-black/10 bg-white"
                        }`}
                        aria-hidden
                      >
                        {t.done ? "✓" : ""}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block break-words text-sm ${
                            t.done ? "text-[#241f3d]/45 line-through" : ""
                          }`}
                        >
                          {t.title}
                        </span>
                        {t.tag && (
                          <span className="mt-1.5 inline-flex break-all rounded-full bg-[#eafaf4] px-2 py-0.5 text-[10px] font-medium text-[#1f7a63]">
                            {t.tag}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <div
                role="progressbar"
                aria-label="Tasks completed today"
                aria-valuemin={0}
                aria-valuemax={tasks.length}
                aria-valuenow={done}
                className="mt-4 h-3 overflow-hidden rounded-full bg-[#f1ecfb]"
              >
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${pct}%`,
                    background: "linear-gradient(90deg,#b9a4ff,#7fd8c0)",
                  }}
                />
              </div>
              <p className="mt-2.5 break-words text-xs text-[#6b6288]">
                {pct}% closed · {open} still open · every row is a toggle, nothing leaves this page
              </p>
            </div>

            <div className={`${CARD} min-w-0 bg-[#f4f0ff] p-5 sm:p-6 lg:col-span-2`}>
              <Eyebrow>the daily surface</Eyebrow>
              <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-[-0.02em] break-words sm:text-3xl">
                Today is the ritual
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[#241f3d]/75 break-words">
                Recurring windows and anything due arrive on the same surface each morning. Close the
                last one and the band turns to all-clear. Misses are free — pairs aren&apos;t.
              </p>

              <div className="mt-5 grid grid-cols-7 gap-1.5" aria-hidden>
                {HEAT_LEVELS.slice(-28).map((lvl, i) => (
                  <span key={i} className={`aspect-square rounded-md ${HEAT[lvl] ?? HEAT[0]}`} />
                ))}
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-2" aria-hidden>
                <span className="text-[10px] text-[#6b6288]">less</span>
                <span className="flex items-center gap-1">
                  {HEAT.map((cls, i) => (
                    <span key={i} className={`h-2.5 w-2.5 rounded-[4px] ${cls}`} />
                  ))}
                </span>
                <span className="text-[10px] text-[#6b6288]">more</span>
              </div>

              <div className="mt-5 flex items-center gap-2.5 rounded-full bg-[#7fd8c0]/30 px-3.5 py-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#2fa98a]" aria-hidden />
                <span className="min-w-0 break-words text-xs font-medium text-[#14614f]">
                  all clear — nothing is waiting on you
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* features */}
        <section className="mt-16 sm:mt-24">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <Eyebrow>what&apos;s inside</Eyebrow>
              <h2 className="mt-2 text-[clamp(1.75rem,6vw,2.75rem)] font-semibold leading-tight tracking-[-0.02em] break-words">
                Six parts, one calm surface
              </h2>
            </div>
            <span className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] text-[#6b6288]">
              06 features
            </span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.index} className={`${CARD} min-w-0 bg-white p-5`}>
                <span className="inline-flex rounded-full bg-[#f3efff] px-2.5 py-1 text-[11px] font-medium tabular-nums text-[#4a3aa8]">
                  {f.index}
                </span>
                <h3 className="mt-3 break-words text-lg font-semibold leading-snug">{f.title}</h3>
                <p className="mt-2 break-words text-sm leading-relaxed text-[#241f3d]/70">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* grammar + specs */}
        <section className="mt-16 grid gap-5 sm:mt-24 lg:grid-cols-2 lg:gap-6">
          <div className={`${CARD} min-w-0 bg-white p-5 sm:p-6`}>
            <Eyebrow>the grammar</Eyebrow>
            <h2 className="mt-2 break-words text-[clamp(1.6rem,5vw,2.25rem)] font-semibold leading-tight tracking-[-0.02em]">
              Say it how you&apos;d say it
            </h2>
            <ul className="mt-5 divide-y divide-black/5">
              {GRAMMAR.map((g) => (
                <li key={g.input} className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-start sm:gap-4">
                  <code className="min-w-0 break-all rounded-xl bg-[#f6f2ff] px-3 py-2 text-[12px] font-medium text-[#4a3aa8] sm:w-[46%] sm:shrink-0">
                    {g.input}
                  </code>
                  <span className="min-w-0 break-words text-sm leading-relaxed text-[#241f3d]/70">
                    {g.action}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className={`${CARD} min-w-0 bg-white p-5 sm:p-6`}>
            <Eyebrow>the fine print</Eyebrow>
            <h2 className="mt-2 break-words text-[clamp(1.6rem,5vw,2.25rem)] font-semibold leading-tight tracking-[-0.02em]">
              Under the soft shell
            </h2>
            <dl className="mt-5 divide-y divide-black/5">
              {SPECS.map((s) => (
                <div key={s.k} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                  <dt className={EYEBROW}>{s.k}</dt>
                  <dd className="min-w-0 break-words text-right text-sm font-medium">{s.v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 rounded-2xl border border-black/5 bg-[#faf7ff] p-4">
              <h3 className={EYEBROW}>recurrence tokens</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {RECURRENCE_TOKENS.map((r) => (
                  <span
                    key={r}
                    className="inline-flex break-all rounded-full border border-[#b9a4ff]/40 bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#4a3aa8]"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative mt-16 border-t border-white/70 bg-[#f4f0ff]/70 sm:mt-24">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="break-words text-[11px] font-medium tracking-[0.16em] text-[#6b6288]">
              Design {pad2(2)} of 10 — Pastel Cloud
            </span>
            <Link
              href="/"
              className={`inline-flex min-h-11 items-center self-start rounded-full border border-black/10 bg-white px-4 text-xs font-medium sm:self-auto ${FOCUS}`}
            >
              Open the live app →
            </Link>
          </div>
          <DesignPager
            n={2}
            className="border-t border-black/5 pt-3"
            linkClass={`inline-flex items-center rounded-full text-xs font-medium text-[#5b5170] transition hover:bg-white hover:text-[#4a3aa8] ${FOCUS}`}
          />
        </div>
      </footer>
    </div>
  );
}
