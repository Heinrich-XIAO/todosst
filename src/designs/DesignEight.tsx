"use client";

import Link from "next/link";
import { DesignPager } from "./pager";
import { useDemo } from "./demo";
import { FEATURES, GRAMMAR, HEAT_LEVELS, RECURRENCE_TOKENS, SPECS, STATS, pad2 } from "./content";

/* Design 08 — Oceanic Depth: teal-to-ink water, aqua hairline waves, buoyant
   glass panels and drifting bubbles. It gets deeper — and quieter — as you scroll. */

const INK = "#010f16";
const EYEBROW = "text-[11px] font-medium uppercase tracking-[0.28em] text-[#12b3c4]";
const PANEL =
  "rounded-[28px] border border-white/10 bg-white/[0.05] backdrop-blur shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)]";
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12b3c4] focus-visible:ring-offset-2 focus-visible:ring-offset-[#03222c]";
const PRIMARY = `inline-flex min-h-12 items-center justify-center rounded-full bg-[#12b3c4] px-7 text-sm font-semibold text-[#010f16] transition hover:brightness-110 ${FOCUS}`;
const SECONDARY = `inline-flex min-h-12 items-center justify-center rounded-full border border-white/25 px-7 text-sm font-semibold text-[#eafffb] transition hover:border-[#12b3c4] hover:text-[#12b3c4] ${FOCUS}`;

const HEAT_FILL = [
  "bg-white/[0.06] ring-1 ring-white/10",
  "bg-[#0e7490]/50",
  "bg-[#0e7490]",
  "bg-[#12b3c4]/75",
  "bg-[#12b3c4]",
];

const BUBBLES = [
  "left-[6%] top-[4%] h-14 w-14 bg-white/[0.07]",
  "left-[24%] top-[13%] h-5 w-5 bg-white/[0.10]",
  "right-[9%] top-[7%] h-24 w-24 bg-white/[0.05]",
  "right-[27%] top-[23%] h-8 w-8 bg-white/[0.09]",
  "left-[12%] top-[41%] h-32 w-32 bg-white/[0.04]",
  "right-[7%] top-[52%] h-10 w-10 bg-white/[0.09]",
  "left-[44%] top-[66%] h-6 w-6 bg-white/[0.10]",
  "left-[17%] top-[81%] h-20 w-20 bg-white/[0.05]",
  "right-[19%] top-[91%] h-14 w-14 bg-white/[0.06]",
];

const WAVE_A = "M0,42 C160,64 320,10 480,22 C640,34 800,62 960,50 C1120,38 1280,14 1440,30";
const WAVE_B = "M0,30 C180,6 340,54 520,46 C700,38 860,6 1040,18 C1220,30 1340,58 1440,46";
const WAVE_C = "M0,48 C200,20 360,58 560,50 C760,42 900,14 1080,24 C1260,34 1360,54 1440,44";

function Wave({
  curve,
  fillOpacity,
  className = "",
}: {
  curve: string;
  fillOpacity: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 1440 64"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={`block h-8 w-full sm:h-14 ${className}`}
    >
      <path d={`${curve} L1440,64 L0,64 Z`} fill={INK} fillOpacity={fillOpacity} />
      <path
        d={curve}
        fill="none"
        stroke="rgba(18,179,196,0.45)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function SectionHead({ eyebrow, title, note }: { eyebrow: string; title: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-white/10 pb-4">
      <div className="min-w-0">
        <p className={EYEBROW}>{eyebrow}</p>
        <h2 className="mt-2 min-w-0 break-words text-[clamp(1.6rem,5.5vw,2.5rem)] font-medium leading-[1.1] tracking-[-0.02em] text-[#eafffb]">
          {title}
        </h2>
      </div>
      {note && (
        <span className="shrink-0 text-[11px] uppercase tracking-[0.22em] text-white/55">{note}</span>
      )}
    </div>
  );
}

export default function DesignEight() {
  const { tasks, draft, setDraft, add, toggle, done, open } = useDemo();
  const pct = tasks.length ? (done / tasks.length) * 100 : 0;

  return (
    <div className="relative min-h-screen bg-[#010f16] text-[#eafffb]">
      {/* water: gradient field + drifting bubbles, all clipped to this layer */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#03222c] via-[#04191f] to-[#010f16]"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[15%] top-[6%] h-[55vw] w-[55vw] rounded-full bg-[#12b3c4]/15 blur-[90px]" />
        <div className="absolute -right-[20%] top-[44%] h-[65vw] w-[65vw] rounded-full bg-[#0e7490]/20 blur-[110px]" />
        {BUBBLES.map((b, i) => (
          <span key={i} className={`absolute rounded-full ${b}`} />
        ))}
      </div>

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-[#12b3c4] focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-[#010f16]"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#03222c]/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link
              href="/"
              className={`inline-flex min-h-11 shrink-0 items-center text-lg font-medium tracking-[-0.02em] text-[#eafffb] ${FOCUS}`}
            >
              todosst
            </Link>
            <span className="min-w-0 truncate rounded-full border border-[#12b3c4]/35 bg-[#12b3c4]/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-[#7fe0ec]">
              design {pad2(8)} / 10
            </span>
          </div>
          <nav className="flex shrink-0 items-center gap-1">
            <Link
              href="/design"
              className={`hidden min-h-11 items-center rounded-full px-3 text-[11px] uppercase tracking-[0.18em] text-white/70 transition hover:text-[#12b3c4] sm:inline-flex ${FOCUS}`}
            >
              All ten
            </Link>
            <Link
              href="/"
              className={`inline-flex min-h-12 items-center rounded-full bg-[#12b3c4] px-4 text-xs font-semibold text-[#010f16] transition hover:brightness-110 ${FOCUS}`}
            >
              Open app
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="relative z-10">
        {/* hero */}
        <section className="mx-auto max-w-6xl px-4 pb-12 pt-12 sm:px-6 sm:pb-16 sm:pt-20">
          <p className={EYEBROW}>Oceanic depth · design {pad2(8)} · encrypted vault</p>
          <h1 className="mt-5 break-words text-[clamp(2.5rem,10vw,5.5rem)] font-medium leading-[0.98] tracking-[-0.035em]">
            <span className="block">Sink in.</span>
            <span className="block text-[#12b3c4]">Surface clear.</span>
          </h1>
          <p className="mt-6 max-w-2xl break-words text-base leading-relaxed text-white/75 sm:text-lg">
            Every title, path and streak is sealed on your device before the network sees a byte.
            Directories are just tasks, recurrence is a window, and the day ends the moment the last
            box closes.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/" className={`${PRIMARY} w-full sm:w-auto`}>
              Open the app →
            </Link>
            <Link href="/" className={`${SECONDARY} w-full sm:w-auto`}>
              Start free
            </Link>
          </div>

          <dl className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.k} className={`${PANEL} min-w-0 px-4 py-4`}>
                <dt className="break-words text-[clamp(1.5rem,6vw,2rem)] font-medium leading-none tabular-nums text-[#12b3c4]">
                  {s.k}
                </dt>
                <dd className="mt-2 break-words text-[10px] uppercase leading-snug tracking-[0.16em] text-white/55">
                  {s.v}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* live demo, in its own pocket of water */}
        <Wave curve={WAVE_A} fillOpacity={0.45} />
        <section className="bg-[#010f16]/45">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <SectionHead eyebrow="live demo · nothing leaves this tab" title="Type it like you think it" note="local only" />

            <div className={`${PANEL} mx-auto mt-8 max-w-4xl p-4 sm:p-6`}>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="flex min-w-0 items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/55">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[#12b3c4]" aria-hidden />
                  <span className="min-w-0 break-words">one box, five grammars</span>
                </p>
                <p className="shrink-0 text-[11px] uppercase tracking-[0.18em] tabular-nums text-[#12b3c4]">
                  {done}/{tasks.length} done
                </p>
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && add()}
                  aria-label="Try the input grammar"
                  placeholder="try: stretch ~daily"
                  className={`min-h-12 min-w-0 flex-1 rounded-full border border-white/15 bg-[#010f16]/70 px-4 py-2 text-sm text-[#eafffb] outline-none transition placeholder:text-white/45 focus:border-[#12b3c4] ${FOCUS}`}
                />
                <button
                  type="button"
                  onClick={add}
                  aria-label="Add task"
                  className={`min-h-12 min-w-12 shrink-0 rounded-full bg-[#12b3c4] px-4 text-lg font-semibold leading-none text-[#010f16] transition hover:brightness-110 ${FOCUS}`}
                >
                  +
                </button>
              </div>

              <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">
                {tasks.map((t) => {
                  const tally = typeof t.count === "number" && typeof t.goal === "number";
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => toggle(t.id)}
                        aria-pressed={t.done}
                        className="flex min-h-12 w-full flex-col gap-1.5 px-1 py-3 text-left transition hover:bg-white/[0.04]"
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-3">
                          <span
                            aria-hidden
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] leading-none ${
                              t.done
                                ? "border-[#12b3c4] bg-[#12b3c4] text-[#010f16]"
                                : "border-white/30 text-transparent"
                            }`}
                          >
                            ✓
                          </span>
                          <span
                            className={`min-w-0 flex-1 break-words text-sm ${
                              t.done ? "text-white/40 line-through" : "text-[#eafffb]"
                            }`}
                          >
                            {t.title}
                          </span>
                        </span>
                        {(t.tag || tally) && (
                          <span className="ml-8 flex shrink-0 flex-wrap items-center gap-1.5 sm:ml-0 sm:justify-end">
                            {tally && (
                              <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] tabular-nums text-white/55">
                                {t.count}/{t.goal}
                              </span>
                            )}
                            {t.tag && (
                              <span className="max-w-full break-words rounded-full border border-[#0e7490]/60 bg-[#0e7490]/25 px-2.5 py-0.5 text-[10px] text-[#a8ecf5]">
                                {t.tag}
                              </span>
                            )}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-white/10" aria-hidden>
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#0e7490] to-[#12b3c4] transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] uppercase tracking-[0.16em] text-white/60">
                <p className="min-w-0 break-words">
                  <span className="tabular-nums text-[#12b3c4]">{open}</span> open ·{" "}
                  <span className="tabular-nums text-[#12b3c4]">{done}</span> closed
                </p>
                <p className="min-w-0 break-words">this list lives in your browser</p>
              </div>
            </div>
          </div>
        </section>

        {/* today is the ritual */}
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
          <SectionHead eyebrow="daily surface" title="Today is the ritual" note="last 28 days" />

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <div className={`${PANEL} min-w-0 p-5 sm:p-7`}>
              <p className="break-words text-base leading-relaxed text-white/75 sm:text-lg">
                Recurring windows and anything due collect on one surface every morning — no second
                list, no separate habit app. Close the last one and an all-clear band sweeps up from
                the foot of the screen.
              </p>
              <p className="mt-5 break-words border-l-2 border-[#12b3c4] pl-4 text-lg font-medium leading-snug text-[#eafffb] sm:text-xl">
                Misses are free — pairs aren&apos;t.
              </p>
              <p className="mt-6 flex min-w-0 items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#12b3c4]">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#12b3c4]" aria-hidden />
                <span className="min-w-0 break-words">
                  {open === 0
                    ? `all clear — ${done} closed, 0 open`
                    : `all clear pending — ${open} open, ${done} closed`}
                </span>
              </p>
            </div>

            <div className={`${PANEL} min-w-0 p-5 sm:p-7`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className={EYEBROW}>window heatmap</p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/55">28 cells</p>
              </div>
              <div
                className="mt-4 grid grid-cols-7 gap-1.5 sm:grid-cols-[repeat(14,minmax(0,1fr))]"
                aria-hidden
              >
                {HEAT_LEVELS.slice(-28).map((lvl, i) => (
                  <span key={i} className={`aspect-square rounded-[4px] ${HEAT_FILL[lvl]}`} />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/55">
                <span>quieter</span>
                {HEAT_FILL.map((cls, i) => (
                  <span key={i} className={`h-3 w-3 rounded-[3px] ${cls}`} aria-hidden />
                ))}
                <span>deeper</span>
              </div>
              <p className="mt-4 break-words text-[13px] leading-relaxed text-white/60">
                Four intensity levels, one per closed window — the strip you clear before you come
                up for air.
              </p>
            </div>
          </div>
        </section>

        {/* features */}
        <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6 sm:pb-20">
          <SectionHead eyebrow="what is under the surface" title="Six reasons it stays calm" note="06 parts" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article
                key={f.index}
                className={`${PANEL} min-w-0 p-5 transition duration-300 hover:-translate-y-1 hover:border-[#12b3c4]/40 hover:bg-white/[0.08]`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#12b3c4]">
                  {f.index}
                </p>
                <h3 className="mt-3 break-words text-lg font-medium leading-snug text-[#eafffb]">
                  {f.title}
                </h3>
                <p className="mt-2 break-words text-[13px] leading-relaxed text-white/65">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* grammar + specs, deeper still */}
        <Wave curve={WAVE_B} fillOpacity={0.6} />
        <section className="bg-[#010f16]/60">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-8">
              <div className="min-w-0">
                <SectionHead eyebrow="input grammar" title="Five grammars, one line" note="06 rows" />
                <ul className="mt-6 flex flex-col gap-3">
                  {GRAMMAR.map((g) => (
                    <li key={g.input} className={`${PANEL} min-w-0 p-4`}>
                      <code className="block min-w-0 break-all rounded-2xl border border-[#0e7490]/40 bg-[#010f16]/70 px-3 py-2 text-[13px] leading-relaxed text-[#8fe6f2]">
                        {g.input}
                      </code>
                      <p className="mt-2.5 min-w-0 break-words text-[13px] leading-relaxed text-white/65">
                        {g.action}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="min-w-0">
                <SectionHead eyebrow="under the hull" title="Spec sheet" note="08 lines" />
                <div className={`${PANEL} mt-6 min-w-0 p-5`}>
                  <dl className="divide-y divide-white/10">
                    {SPECS.map((s) => (
                      <div
                        key={s.k}
                        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
                      >
                        <dt className="min-w-0 break-words text-[11px] uppercase tracking-[0.18em] text-white/60">
                          {s.k}
                        </dt>
                        <dd className="min-w-0 break-words text-right text-[13px] text-[#eafffb]">
                          {s.v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="mt-6 min-w-0">
                  <p className={EYEBROW}>recurrence tokens</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {RECURRENCE_TOKENS.map((r) => (
                      <span
                        key={r}
                        className="max-w-full break-words rounded-full border border-[#0e7490]/50 bg-[#0e7490]/20 px-3 py-1.5 text-[11px] text-[#a8ecf5]"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <Wave curve={WAVE_C} fillOpacity={1} />
        </section>
      </main>

      <footer className="relative z-10 bg-[#010f16]">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="min-w-0 break-words text-[11px] uppercase tracking-[0.25em] text-[#12b3c4]">
              Design {pad2(8)} of 10 — Oceanic Depth
            </span>
            <Link
              href="/"
              className={`inline-flex min-h-11 items-center text-[11px] uppercase tracking-[0.2em] text-white/70 underline underline-offset-4 transition hover:text-[#12b3c4] ${FOCUS}`}
            >
              Surface for the app →
            </Link>
          </div>
          <DesignPager
            n={8}
            className="border-t border-white/10 pt-3"
            linkClass={`rounded-full text-[12px] tracking-[0.06em] text-white/70 transition-colors hover:text-[#12b3c4] ${FOCUS}`}
          />
        </div>
      </footer>
    </div>
  );
}
