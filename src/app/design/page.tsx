import Link from "next/link";
import { DESIGN_META } from "@/designs/shared";

export default function DesignIndex() {
  return (
    <div className="min-h-screen bg-white text-black px-4 py-10" style={{ fontFamily: "system-ui" }}>
      <main className="mx-auto max-w-5xl">
        <p className="text-xs font-bold tracking-[0.3em] uppercase opacity-60">todosst · design gallery</p>
        <h1 className="mt-2 text-4xl sm:text-6xl font-black tracking-tight">Ten designs, one vault.</h1>
        <p className="mt-3 text-sm sm:text-base opacity-70 max-w-xl">Each is a full original visual design of the entire site — responsive from phones to desktops. Pick a number; every page links back to the live app at <Link href="/" className="underline font-bold">/</Link>.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DESIGN_META.map((d) => (
            <Link key={d.n} href={`/design/${d.n}`} className="group border-2 border-black p-5 hover:bg-black hover:text-white transition min-h-[120px] flex flex-col justify-between">
              <span className="text-4xl font-black">0{d.n}</span>
              <span><span className="block font-black">{d.name}</span><span className="block text-xs opacity-70">{d.tagline}</span></span>
            </Link>
          ))}
        </div>
        <footer className="mt-8 text-xs font-bold opacity-60"><Link href="/" className="underline">← Back to the app</Link></footer>
      </main>
    </div>
  );
}
