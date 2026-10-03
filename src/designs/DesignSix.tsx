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

/* Design 06 — Terminal Green: phosphor #3dff7a on CRT black, scanlines, ASCII
   frames, prompt-line section headers, character progress bars, one caret. */

const BAR_CELLS = 20;
const FOCUS = "focus-visible:outline-2 focus-visible:outline-[#3dff7a] focus-visible:outline-offset-2";
const GHOST_BTN = `inline-flex min-h-12 items-center justify-center gap-2 border border-[#3dff7a]/50 px-5 py-3 text-[13px] text-[#3dff7a] transition-colors hover:border-[#3dff7a] hover:bg-[#0a3d14] ${FOCUS}`;
const SOLID_BTN = `inline-flex min-h-12 items-center justify-center gap-2 border border-[#3dff7a] bg-[#3dff7a] px-5 py-3 text-[13px] font-bold text-[#020604] transition-colors hover:bg-transparent hover:text-[#3dff7a] ${FOCUS}`;

function SectionHead({ path, cmd, meta }: { path: string; cmd: string; meta?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-dashed border-[#3dff7a]/30 pb-2">
      <h2 className="min-w-0 break-words text-[12px] leading-relaxed sm:text-[13px]">
        <span className="text-[#1f8f4a]">user@todosst</span>
        <span className="text-[#3dff7a]/70">:{path}$ </span>
        <span className="font-bold text-[#3dff7a]">{cmd}</span>
      </h2>
      {meta ? <span className="shrink-0 text-[10px] tracking-wider text-[#1f8f4a]">{meta}</span> : null}
    </div>
  );
}

function Prompt({ path, cmd, tail }: { path: string; cmd: string; tail?: string }) {
  return (
    <p className="min-w-0 break-words text-[11px] leading-relaxed sm:text-xs">
      <span className="text-[#1f8f4a]">user@todosst</span>
      <span className="text-[#3dff7a]/70">:{path}$ </span>
      <span className="font-bold text-[#3dff7a]">{cmd}</span>
      {tail ? <span className="ml-2 text-[#1f8f4a]">{tail}</span> : null}
    </p>
  );
}

export default function DesignSix() {
  const { tasks, draft, setDraft, add, toggle, done, open } = useDemo();

  const ratio = tasks.length ? done / tasks.length : 0;
  const filled = Math.round(ratio * BAR_CELLS);

  return (
    <div
      className="min-h-screen bg-[#020604] text-[#3dff7a] [font-family:ui-monospace,Menlo,Consolas,monospace]"
      style={{
        backgroundImage:
          "repeating-linear-gradient(to bottom, rgba(61,255,122,0.05) 0 2px, transparent 2px 4px)",
      }}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:flex focus:min-h-11 focus:items-center focus:border focus:border-[#3dff7a] focus:bg-[#020604] focus:px-3 focus:text-xs focus:text-[#3dff7a]"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-dashed border-[#3dff7a]/40 bg-[#020604]/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="shrink-0 text-[13px] text-[#3dff7a]">
              $
            </span>
            <Link
              href="/"
              className={`inline-flex min-h-12 items-center text-[13px] font-bold tracking-tight text-[#3dff7a] transition-opacity hover:opacity-70 ${FOCUS}`}
            >
              todosst
            </Link>
            <span className="shrink-0 text-[11px] text-[#1f8f4a]">
              <span className="sm:hidden">[{pad2(6)}/10]</span>
              <span className="hidden sm:inline">[ design {pad2(6)}/10 · terminal green ]</span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/design"
              className={`hidden min-h-12 items-center border border-[#3dff7a]/40 px-3 text-[11px] text-[#3dff7a] transition-colors hover:bg-[#0a3d14] sm:inline-flex ${FOCUS}`}
            >
              ls /design
            </Link>
            <Link
              href="/"
              className={`inline-flex min-h-12 items-center border border-[#3dff7a] bg-[#3dff7a] px-3 text-[11px] font-bold text-[#020604] transition-colors hover:bg-transparent hover:text-[#3dff7a] ${FOCUS}`}
            >
              Open app
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pt-14">
        <section>
          <Prompt path="~/today" cmd="todosst --new" tail="[ok]" />

          <h1 className="mt-4 break-words text-[clamp(2rem,9vw,5.5rem)] font-bold leading-[1.04] tracking-[-0.02em] text-[#3dff7a]">
            todo$ — type it,
            <br />
            clear it.
            <span aria-hidden className="all-clear-caret ml-1 inline-block text-[#3dff7a]">
              ▍
            </span>
          </h1>

          <p className="mt-5 max-w-2xl break-words text-[13px] leading-relaxed text-[#3dff7a]/85 sm:text-sm">
            todosst is an encrypted todo vault where folders are tasks and the URL is your working
            directory. One input box takes paths, commands and recurrence tokens. Everything is
            sealed in the browser before it ships, so the server only ever stores noise.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/" className={SOLID_BTN}>
              <span aria-hidden>$</span>
              open the app
            </Link>
            <Link href="/" className={GHOST_BTN}>
              <span aria-hidden>&gt;</span>
              start typing
            </Link>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.k} className="min-w-0 border border-[#3dff7a]/30 bg-[#04120a] p-3">
                <dt className="truncate text-2xl font-bold tabular-nums leading-none text-[#3dff7a]">
                  {s.k}
                </dt>
                <dd className="mt-1.5 break-words text-[10px] leading-snug tracking-wide text-[#1f8f4a]">
                  {s.v}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <div className="mt-14 grid gap-6 lg:grid-cols-5">
          <section
            aria-label="Live demo"
            className="min-w-0 border border-[#3dff7a]/40 bg-[#04120a] lg:col-span-3"
          >
            <div className="flex items-center justify-between gap-2 border-b border-dashed border-[#3dff7a]/40 bg-[#0a3d14] px-3 py-2">
              <h2 className="min-w-0 truncate text-[11px] text-[#3dff7a]">
                [···] live demo — local only
              </h2>
              <span className="shrink-0 text-[11px] tabular-nums text-[#3dff7a]">
                {done}/{tasks.length} done
              </span>
            </div>

            <div className="p-3 sm:p-4">
              <label htmlFor="d6-input" className="block text-[11px] text-[#1f8f4a]">
                $ type a task, then press enter
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="d6-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && add()}
                  placeholder="stretch ~daily"
                  className="min-h-12 min-w-0 flex-1 border border-[#3dff7a]/40 bg-[#020604] px-3 py-2 text-[13px] text-[#3dff7a] outline-none placeholder:text-[#1f8f4a] focus:border-[#3dff7a]"
                />
                <button
                  type="button"
                  onClick={add}
                  aria-label="Add task"
                  className={`min-h-12 min-w-12 border border-[#3dff7a] bg-[#0a3d14] px-4 text-base font-bold text-[#3dff7a] transition-colors hover:bg-[#3dff7a] hover:text-[#020604] ${FOCUS}`}
                >
                  <span aria-hidden>↵</span>
                </button>
              </div>

              <ul className="mt-3 divide-y divide-[#3dff7a]/20 border-y border-[#3dff7a]/30">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => toggle(t.id)}
                      aria-pressed={t.done}
                      className="flex min-h-11 w-full items-start gap-2.5 px-1 py-3 text-left transition-colors hover:bg-[#0a3d14] sm:px-2"
                    >
                      <span
                        aria-hidden
                        className={`shrink-0 whitespace-pre text-[13px] font-bold ${
                          t.done ? "text-[#3dff7a]" : "text-[#1f8f4a]"
                        }`}
                      >
                        {t.done ? "[x]" : "[ ]"}
                      </span>
                      <span
                        className={`min-w-0 flex-1 break-words text-[13px] leading-snug ${
                          t.done ? "text-[#1f8f4a] line-through" : "text-[#3dff7a]"
                        }`}
                      >
                        {t.title}
                      </span>
                      {t.tag ? (
                        <span className="max-w-[42%] shrink-0 truncate border border-[#3dff7a]/30 bg-[#0a3d14] px-1.5 py-0.5 text-[10px] leading-tight text-[#3dff7a]">
                          {t.tag}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>

              <div
                aria-hidden
                className="mt-4 overflow-hidden border border-[#3dff7a]/30 bg-[#020604] px-2 py-1.5 text-[13px] leading-none"
              >
                <span className="whitespace-pre text-[#3dff7a]/70">[</span>
                <span className="whitespace-pre text-[#3dff7a]">{"#".repeat(filled)}</span>
                <span className="whitespace-pre text-[#1f8f4a]">{"-".repeat(BAR_CELLS - filled)}</span>
                <span className="whitespace-pre text-[#3dff7a]/70">]</span>
                <span className="ml-2 whitespace-pre text-[#1f8f4a] tabular-nums">
                  {Math.round(ratio * 100)}%
                </span>
              </div>

              <p className="mt-2 min-w-0 break-words text-[10px] leading-relaxed text-[#1f8f4a]">
                <span className="text-[#3dff7a]">[ok]</span> {open} open · {done} done · this list
                never leaves your browser
              </p>
            </div>
          </section>

          <section
            aria-label="Today is the ritual"
            className="min-w-0 border border-[#3dff7a]/40 bg-[#04120a] p-4 lg:col-span-2"
          >
            <h2 className="min-w-0 break-words text-[12px] leading-relaxed">
              <span className="text-[#1f8f4a]">user@todosst</span>
              <span className="text-[#3dff7a]/70">:~/today$ </span>
              <span className="font-bold text-[#3dff7a]">today --ritual</span>
            </h2>

            <p className="mt-3 break-words text-[12px] leading-relaxed text-[#3dff7a]/85">
              Open recurrence windows and anything due land on one surface. Clear the last one and
              the all-clear band types itself out across the top of the day.
            </p>

            <p className="mt-3 min-w-0 break-words text-[11px] text-[#ffcf4d]">
              [!] misses are free, pairs aren&apos;t
            </p>

            <p className="mt-4 text-[10px] tracking-wider text-[#1f8f4a]">
              last 28 days · 4 levels
            </p>
            <div className="mt-2 grid grid-cols-7 gap-1.5" aria-hidden>
              {HEAT_LEVELS.slice(-28).map((lvl, i) => (
                <span
                  key={i}
                  className={`aspect-square border border-[#3dff7a]/20 ${
                    lvl >= 3
                      ? "bg-[#3dff7a]"
                      : lvl === 2
                        ? "bg-[#1f8f4a]"
                        : lvl === 1
                          ? "bg-[#0a3d14]"
                          : "bg-[#020604]"
                  }`}
                />
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[#1f8f4a]">
              <span>less</span>
              <span className="h-3 w-3 border border-[#3dff7a]/20 bg-[#020604]" aria-hidden />
              <span className="h-3 w-3 border border-[#3dff7a]/20 bg-[#0a3d14]" aria-hidden />
              <span className="h-3 w-3 border border-[#3dff7a]/20 bg-[#1f8f4a]" aria-hidden />
              <span className="h-3 w-3 border border-[#3dff7a]/20 bg-[#3dff7a]" aria-hidden />
              <span>more</span>
            </div>

            <p className="mt-4 min-w-0 break-words border-t border-dashed border-[#3dff7a]/30 pt-3 text-[11px] text-[#3dff7a]">
              {open === 0 ? (
                <>
                  <span className="text-[#1f8f4a]">[ok]</span> all clear — {done} closed, nothing
                  pending
                </>
              ) : (
                <>
                  <span className="text-[#1f8f4a]">[···]</span> {open} still open · {done} closed
                </>
              )}
            </p>
          </section>
        </div>
        <section className="mt-16">
          <SectionHead path="~/today" cmd="ls -la ./features" meta="06 files" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article
                key={f.index}
                className="min-w-0 border border-[#3dff7a]/30 bg-[#04120a] p-4 transition-colors hover:border-[#3dff7a]/70"
              >
                <p className="text-[10px] tracking-widest text-[#1f8f4a]">[{f.index}]</p>
                <h3 className="mt-2 break-words text-[15px] font-bold leading-snug text-[#3dff7a]">
                  {f.title}
                </h3>
                <p className="mt-2 break-words text-[12px] leading-relaxed text-[#3dff7a]/80">
                  {f.body}
                </p>
              </article>
            ))}
          </div>
        </section>
        <div className="mt-16 grid gap-8 lg:grid-cols-2 lg:gap-6">
          <section className="min-w-0">
            <SectionHead path="~" cmd="cat ./grammar" meta="06 rules" />
            <ul className="mt-4 divide-y divide-[#3dff7a]/20 border-y border-[#3dff7a]/30">
              {GRAMMAR.map((g) => (
                <li
                  key={g.input}
                  className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-baseline sm:gap-4"
                >
                  <code className="min-w-0 max-w-full shrink-0 break-all border border-[#3dff7a]/40 bg-[#0a3d14] px-2 py-1.5 text-[12px] leading-snug text-[#3dff7a] sm:max-w-[52%]">
                    {g.input}
                  </code>
                  <span className="min-w-0 break-words text-[12px] leading-snug text-[#3dff7a]/80">
                    {g.action}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="min-w-0">
            <SectionHead path="~" cmd="cat ./specs" meta="08 keys" />
            <dl className="mt-4 divide-y divide-[#3dff7a]/20 border-y border-[#3dff7a]/30">
              {SPECS.map((s) => (
                <div key={s.k} className="flex items-baseline justify-between gap-3 py-2.5">
                  <dt className="shrink-0 text-[10px] uppercase tracking-wider text-[#1f8f4a]">
                    {s.k}
                  </dt>
                  <dd className="min-w-0 break-all text-right text-[12px] text-[#3dff7a]">{s.v}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-4 text-[10px] tracking-wider text-[#1f8f4a]">[~] recurrence tokens</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {RECURRENCE_TOKENS.map((r) => (
                <span
                  key={r}
                  className="break-all border border-[#3dff7a]/40 bg-[#0a3d14] px-2 py-1 text-[11px] leading-tight text-[#3dff7a]"
                >
                  {r}
                </span>
              ))}
            </div>
          </section>
        </div>
      </main>
      <footer className="border-t border-dashed border-[#3dff7a]/40 bg-[#04120a]">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="min-w-0 break-words text-[11px] text-[#3dff7a]">
              design {pad2(6)} of 10 — {DESIGN_META[5].name}{" "}
              <span className="text-[#1f8f4a]">[ok]</span>
            </span>
            <Link
              href="/"
              className={`inline-flex min-h-12 items-center self-start border border-[#3dff7a]/50 px-3 text-[11px] text-[#3dff7a] transition-colors hover:bg-[#0a3d14] sm:self-auto ${FOCUS}`}
            >
              open the app →
            </Link>
          </div>
          <DesignPager
            n={6}
            className="border-t border-dashed border-[#3dff7a]/30 pt-3"
            linkClass={`inline-flex items-center text-[11px] text-[#3dff7a]/85 transition-colors hover:bg-[#0a3d14] hover:text-[#3dff7a] ${FOCUS}`}
          />
        </div>
      </footer>
    </div>
  );
}
