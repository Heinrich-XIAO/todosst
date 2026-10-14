"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { parseNlpDate, describeNlp } from "@/lib/nlpDate";
import { jevFixture } from "@/lib/jevDate";
import { SEED_CASES, BENCH_NOW, runBench, suggestVariants, ymdToTs, type BenchCase } from "@/lib/nlpBench";

const LS_KEY = "todosst-date-labels-v1";

type Label = { text: string; ymd: string; recur: string; family: string };

function loadLabels(): Label[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as Label[];
  } catch {
    return [];
  }
}

export default function DatesLabPage() {
  const [input, setInput] = useState("make sure email for haven is sent tmrw");
  const [template, setTemplate] = useState("every monday till in 2 weeks");
  const [labels, setLabels] = useState<Label[]>(() =>
    typeof window === "undefined" ? [] : loadLabels()
  );
  const [extra, setExtra] = useState<BenchCase[]>([]);

  const now = useMemo(() => Date.now(), []);
  const normal = useMemo(() => parseNlpDate(input, now), [input, now]);
  const jev = useMemo(() => jevFixture(input, new Date(now)), [input, now]);

  const rows = useMemo(
    () =>
      runBench(
        [...SEED_CASES, ...extra],
        (t, n) => parseNlpDate(t, n),
        (t) => jevFixture(t, new Date(BENCH_NOW))
      ),
    [extra]
  );
  const normalAcc = rows.filter((r) => r.normalOk).length;
  const jevAcc = rows.filter((r) => r.jevOk).length;

  const variants = useMemo(() => suggestVariants(template), [template]);

  function saveLabels(next: Label[]) {
    setLabels(next);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {}
  }

  function addLabel(text: string) {
    const r = parseNlpDate(text, now);
    const ymd = r.dueAt !== null
      ? (() => { const d = new Date(r.dueAt); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })()
      : "";
    saveLabels([{ text, ymd, recur: r.recur ?? "", family: "collected" }, ...labels].slice(0, 5000));
  }

  // inline highlight renderer shared with the entry bar approach
  const parts: { key: number; text: string; hot: boolean }[] = [];
  {
    let pos = 0;
    normal.spans.forEach((s, i) => {
      if (s.start > pos) parts.push({ key: i * 2, text: input.slice(pos, s.start), hot: false });
      parts.push({ key: i * 2 + 1, text: input.slice(s.start, s.end), hot: true });
      pos = s.end;
    });
    if (pos < input.length) parts.push({ key: 9999, text: input.slice(pos), hot: false });
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 text-sm">
      <Link href="/" className="text-xs opacity-60 underline">← back</Link>
      <h1 className="mt-2 text-xl font-semibold">dates lab — normal code vs Jev</h1>
      <p className="mt-1 text-xs opacity-60">
        Approach A is handwritten regex in <code>src/lib/nlpDate.ts</code> (deterministic, offline, span-preserving).
        Approach B is Jev/TypeSafe: the model only answers 7 Choice questions (mode, month, day, year, day_anchor,
        weekday, week_offset); <code>assembleJev</code> in <code>src/lib/jevDate.ts</code> does all calendar math.
        The bench below runs Jev in fixture mode (regex stand-in, no key); set{" "}
        <code>NEXT_PUBLIC_TYPESAFE_API_KEY</code> for the live call. Recurrence + spans are normal-code-only by design.
      </p>

      {/* live try */}
      <h2 className="mt-6 font-medium">try it</h2>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="mt-2 w-full border border-foreground/20 bg-transparent px-2 py-1.5"
        placeholder="type a task…"
      />
      <div className="mt-2 border border-foreground/10 px-2 py-1.5">
        {parts.map((p) =>
          p.hot
            ? <mark key={p.key} className="bg-amber-300/60 px-0.5">{p.text}</mark>
            : <span key={p.key}>{p.text}</span>
        )}
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <div className="border border-foreground/10 p-2">
          <div className="text-xs opacity-60">A · normal code</div>
          <div className="mt-1">{describeNlp(normal)}</div>
          <div className="mt-1 text-xs opacity-60">title → “{normal.cleanTitle}”</div>
        </div>
        <div className="border border-foreground/10 p-2">
          <div className="text-xs opacity-60">B · Jev (fixture)</div>
          <div className="mt-1">
            {jev.date !== null ? new Date(jev.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "no date heard"}
            {jev.needsReview ? " · needs review" : ""} · conf {jev.confidence?.toFixed(2)}
          </div>
          <div className="mt-1 text-xs opacity-60">{jev.note}</div>
        </div>
      </div>

      {/* bench */}
      <h2 className="mt-6 font-medium">
        bench · A {normalAcc}/{rows.length} · B {jevAcc}/{rows.length}
      </h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left opacity-60">
              <th className="py-1 pr-2">input</th><th className="pr-2">expected</th>
              <th className="pr-2">A</th><th className="pr-2">B</th><th>A ms</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-foreground/10">
                <td className="py-1 pr-2">{r.text}</td>
                <td className="pr-2 opacity-60">{r.expected}</td>
                <td className="pr-2">{r.normalOk ? "✓ " : "✗ "}{r.normalGot}</td>
                <td className="pr-2 opacity-80">{r.jevOk ? "✓ " : "✗ "}{r.jevGot}</td>
                <td className="opacity-60">{r.normalMs.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-xs opacity-60">
        Jev fixture only answers single dates; recurrence rows are expected ✗ for B — that&apos;s the point:
        Jev reads <em>which day the text names</em>, recurrence/UNTIL assembly stays in code (or normal-code spans).
      </p>

      {/* data collection */}
      <h2 className="mt-6 font-medium">collect — seed → variants → labels ({labels.length})</h2>
      <div className="mt-2 flex gap-2">
        {["this monday", "next week's monday", "next next week's monday", "every monday till in 2 weeks"].map((s) => (
          <button key={s} onClick={() => setTemplate(s)} className="border border-foreground/20 px-2 py-1 text-xs hover:bg-foreground/5">
            {s}
          </button>
        ))}
      </div>
      <input
        value={template}
        onChange={(e) => setTemplate(e.target.value)}
        className="mt-2 w-full border border-foreground/20 bg-transparent px-2 py-1.5"
      />
      <ul className="mt-2 border border-foreground/10">
        {variants.map((v) => (
          <li key={v} className="flex items-center gap-2 border-b border-foreground/5 px-2 py-1 last:border-b-0">
            <span className="flex-1">{v}</span>
            <button onClick={() => addLabel(v)} className="text-xs underline">+ bank</button>
            <button
              onClick={() => setExtra((p) => [...p, { id: `x${p.length}`, text: v, family: "collected" }])}
              className="text-xs opacity-60 underline"
            >
              + bench
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => {
            const lines = labels.map((l) => JSON.stringify(l)).join("\n");
            void navigator.clipboard?.writeText(lines).catch(() => {});
          }}
          className="border border-foreground/20 px-2 py-1 text-xs"
        >
          copy JSONL ({labels.length})
        </button>
        <button onClick={() => saveLabels([])} className="px-2 py-1 text-xs opacity-60 underline">
          clear
        </button>
      </div>
      {labels.slice(0, 8).map((l, i) => (
        <div key={i} className="mt-1 text-xs opacity-70">“{l.text}” → {l.ymd || l.recur || "?"}</div>
      ))}
      <p className="mt-4 text-xs opacity-60">
        Verdict so far: normal code wins on latency (µs, offline), spans (highlight needs exact offsets — an LLM
        won&apos;t give you those reliably), and recurrence. Jev wins on long-tail phrasing (&quot;the monday after
        next&quot;, typos, &quot;2moro&quot;) without you hand-writing every variant. Recommended shape: normal code
        first, Jev as fallback when A hears nothing and confidence-gated (≥0.6) — bank every fallback hit here and
        promote frequent ones into regex. That&apos;s how the database compounds.
      </p>
    </div>
  );
}

export function __unusedBenchRef() {
  return { ymdToTs };
}
