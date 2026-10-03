import type { Metadata } from "next";
import Link from "next/link";
import { DESIGN_META, pad2 } from "@/designs/content";

export const metadata: Metadata = {
  title: "Ten designs — todosst",
  description:
    "Ten separate, original, full visual designs of the todosst website. Each one is responsive from phones to desktops.",
};

export default function DesignGallery() {
  return (
    <div className="min-h-screen bg-[#faf8f4] text-[#111111] antialiased">
      <a
        href="#grid"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-black focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to the ten designs
      </a>

      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 pb-2 pt-6 sm:px-8 sm:pt-10">
        <span className="text-[11px] font-bold uppercase tracking-[0.35em] text-black/50">
          todosst · index
        </span>
        <Link
          href="/"
          className="min-h-11 rounded-full border border-black/20 bg-white px-4 py-2 text-[13px] font-semibold text-black transition hover:border-black hover:bg-black hover:text-white"
        >
          Open the app
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-24 pt-8 sm:px-8 sm:pt-14">
        <div className="flex flex-col gap-6 border-b-2 border-black pb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-black/50">
              Design gallery
            </p>
            <h1 className="mt-3 text-[clamp(2.5rem,11vw,5.5rem)] font-black leading-[0.88] tracking-[-0.04em]">
              Ten designs,
              <br />
              one vault.
            </h1>
          </div>
          <p className="max-w-sm shrink-0 text-[15px] leading-relaxed text-black/70 sm:text-right">
            Ten separate, original, full visual designs of the entire website — each one a complete
            page from navigation to footer, built mobile-first from 360px up. Pick a number.
          </p>
        </div>

        <div id="grid" className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DESIGN_META.map((d) => (
            <Link
              key={d.n}
              href={`/design/${d.n}`}
              className="group relative flex min-h-[168px] flex-col justify-between overflow-hidden rounded-2xl border border-black/12 bg-white p-5 transition duration-200 hover:-translate-y-1 hover:border-black hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] focus-visible:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-[13px] font-black tabular-nums tracking-tight text-black/35">
                  {pad2(d.n)} / 10
                </span>
                <span
                  aria-hidden
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-black/15 text-[13px] font-black text-black/45 transition group-hover:border-black group-hover:bg-black group-hover:text-white"
                >
                  ↗
                </span>
              </div>

              <div className="mt-6">
                <div aria-hidden className="mb-4 flex h-2 w-full overflow-hidden rounded-full">
                  {d.swatch.map((c) => (
                    <span key={c} className="h-full flex-1" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <h2 className="text-[19px] font-black leading-tight tracking-tight text-black">
                  {d.name}
                </h2>
                <p className="mt-1 text-[13px] font-medium leading-snug text-black/55">{d.tagline}</p>
                <p className="mt-3 hidden text-[13px] leading-relaxed text-black/45 sm:block">
                  {d.blurb}
                </p>
              </div>
            </Link>
          ))}
        </div>

        <footer className="mt-12 flex flex-col gap-3 border-t-2 border-black pt-6 text-[13px] font-semibold text-black/60 sm:flex-row sm:items-center sm:justify-between">
          <span>Every design links back to the live vault at /</span>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center underline underline-offset-4 transition hover:text-black"
          >
            ← Back to the app
          </Link>
        </footer>
      </main>
    </div>
  );
}
