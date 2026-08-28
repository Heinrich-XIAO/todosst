"use client";

import { useEffect, useMemo, useState } from "react";
import type { Options, RRule as RRuleType } from "rrule";
import { normalizeRruleString } from "@/lib/recur";
import { MONTHS } from "@/lib/months";

// Full-coverage graphical RRULE builder + bidirectional text editor.
// Underlying format: RFC 5545 RRULE via https://github.com/jakubroztocil/rrule

const FREQ_LABELS = ["yearly", "monthly", "weekly", "daily", "hourly", "minutely", "secondly"] as const;
const WD = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const ORDINALS: { v: string; label: string }[] = [
  { v: "", label: "every" },
  { v: "1", label: "1st" },
  { v: "2", label: "2nd" },
  { v: "3", label: "3rd" },
  { v: "4", label: "4th" },
  { v: "-1", label: "last" },
];

type GState = {
  freq: number;
  interval: number;
  dtstart: string; // yyyy-mm-dd
  dtstartTime: string; // HH:MM
  count: string;
  until: string; // yyyy-mm-dd
  wkst: number;
  // selected weekdays: key present = selected, value null = plain, number = n-th (1st..4th, -1 last)
  weekdayN: Record<number, number | null>;
  bymonth: number[]; // 0-11
  bymonthday: string;
  byyearday: string;
  byweekno: string;
  bysetpos: string;
  byeaster: string;
  byhour: string;
  byminute: string;
  bysecond: string;
};

type RRuleModule = typeof import("rrule");

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function emptyG(anchorTs: number): GState {
  const d = new Date(anchorTs);
  return {
    freq: 2, // weekly
    interval: 1,
    dtstart: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    dtstartTime: "00:00",
    count: "",
    until: "",
    wkst: 0,
    weekdayN: {},
    bymonth: [],
    bymonthday: "",
    byyearday: "",
    byweekno: "",
    bysetpos: "",
    byeaster: "",
    byhour: "",
    byminute: "",
    bysecond: "",
  };
}

function listToState(v: unknown): string {
  if (v == null) return "";
  const arr = Array.isArray(v) ? v : [v];
  return arr.map((n) => String(n)).join(",");
}

function stateToList(s: string): number[] | null {
  const t = s.trim();
  if (!t) return null;
  const parts = t.split(/[,\s]+/).filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n)) return null;
    out.push(n);
  }
  return out.length ? out : null;
}

function buildRule(mod: RRuleModule, g: GState): { rule?: RRuleType; error?: string } {
  const opts: Partial<Options> = {
    freq: g.freq,
    interval: Math.max(1, Math.floor(Number(g.interval)) || 1),
    wkst: g.wkst,
  };
  const [Y, M, D] = g.dtstart.split("-").map(Number);
  if (Y && M && D) {
    const [h, min] = g.dtstartTime.split(":").map(Number);
    opts.dtstart = new Date(Y, M - 1, D, h || 0, min || 0, 0);
  }
  if (g.count.trim()) {
    const c = Number(g.count);
    if (!Number.isInteger(c) || c <= 0) return { error: "count must be a positive integer" };
    opts.count = c;
  }
  if (g.until.trim()) {
    const [UY, UM, UD] = g.until.split("-").map(Number);
    if (!UY || !UM || !UD) return { error: "until must be a valid date" };
    opts.until = new Date(UY, UM - 1, UD, 23, 59, 59);
  }
  if (opts.count && opts.until) return { error: "count and until are mutually exclusive" };
  const wds = Object.entries(g.weekdayN).map(([k, n]) => {
    const wd = Number(k);
    return n == null ? wd : new mod.Weekday(wd, n);
  });
  if (wds.length) opts.byweekday = wds;
  const assign = (key: string, raw: string, allowEmpty: boolean): string | null => {
    const list = stateToList(raw);
    if (list) {
      (opts as Record<string, unknown>)[key] = list;
    } else if (!allowEmpty && raw.trim()) {
      return `${key} must be comma-separated integers`;
    }
    return null;
  };
  if (g.bymonth.length) opts.bymonth = g.bymonth.map((m) => m + 1);
  for (const err of [
    assign("bymonthday", g.bymonthday, true),
    assign("byyearday", g.byyearday, true),
    assign("byweekno", g.byweekno, true),
    assign("bysetpos", g.bysetpos, true),
    assign("byhour", g.byhour, true),
    assign("byminute", g.byminute, true),
    assign("bysecond", g.bysecond, true),
  ]) {
    if (err) return { error: err };
  }
  if (g.byeaster.trim()) {
    const e = Number(g.byeaster);
    if (!Number.isInteger(e)) return { error: "byeaster must be an integer day offset" };
    opts.byeaster = e;
  }
  try {
    return { rule: new mod.RRule(opts) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "invalid rule" };
  }
}

export function RruleEditor({
  ruleStr,
  anchorTs,
  onApply,
  onCancel,
}: {
  ruleStr: string | undefined;
  anchorTs: number;
  onApply: (ruleStr: string | null) => void;
  onCancel: () => void;
}) {
  const [mod, setMod] = useState<RRuleModule | null>(null);
  const [tab, setTab] = useState<"build" | "text">("build");
  const [g, setG] = useState<GState>(() => emptyG(anchorTs));
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // load module + existing rule into both editors
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await import("rrule");
        if (cancelled) return;
        setMod(m);
        const clean = ruleStr ? normalizeRruleString(ruleStr) : "";
        setText(clean);
        if (!clean) {
          setG(emptyG(anchorTs));
          return;
        }
        const anchor = new Date(anchorTs);
        anchor.setHours(0, 0, 0, 0);
        const rule = m.rrulestr(clean, { dtstart: anchor }) as RRuleType;
        if (cancelled) return;
        if (rule.origOptions.tzid) {
          setError("rule uses TZID — edit as text to keep the timezone.");
          setTab("text");
          return;
        }
        const o = rule.options;
        const weekdayN: Record<number, number | null> = {};
        for (const wd of o.byweekday ?? []) weekdayN[wd] = null;
        for (const pair of o.bynweekday ?? []) {
          if (Array.isArray(pair) && pair.length >= 2) weekdayN[pair[0] as number] = pair[1] as number;
        }
        const ds = o.dtstart;
        setG({
          freq: o.freq,
          interval: o.interval,
          dtstart: `${ds.getFullYear()}-${pad(ds.getMonth() + 1)}-${pad(ds.getDate())}`,
          dtstartTime: `${pad(ds.getHours())}:${pad(ds.getMinutes())}`,
          count: o.count != null ? String(o.count) : "",
          until: o.until ? `${o.until.getFullYear()}-${pad(o.until.getMonth() + 1)}-${pad(o.until.getDate())}` : "",
          wkst: o.wkst ?? 0,
          weekdayN,
          bymonth: (o.bymonth ?? []).map((mm) => mm - 1).filter((mm) => mm >= 0 && mm < 12),
          bymonthday: listToState(o.bymonthday),
          byyearday: listToState(o.byyearday),
          byweekno: listToState(o.byweekno),
          bysetpos: listToState(o.bysetpos),
          byeaster: o.byeaster != null ? String(o.byeaster) : "",
          byhour: listToState(o.byhour),
          byminute: listToState(o.byminute),
          bysecond: listToState(o.bysecond),
        });
      } catch (e) {
        if (!cancelled) {
          setError(`could not parse existing rule — edit as text${e instanceof Error ? `: ${e.message}` : ""}`);
          setTab("text");
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // canonical string + occurrence preview for the graphical tab
  const built = useMemo(() => {
    if (!loaded || !mod) return null;
    return buildRule(mod, g);
  }, [mod, g, loaded]);

  const preview = useMemo(() => {
    if (tab !== "build" || !built?.rule) return null;
    try {
      const now = new Date();
      const dates = built.rule.between(new Date(now.getTime() - 86_400_000), new Date(now.getTime() + 90 * 86_400_000), false);
      return dates.slice(0, 6);
    } catch {
      return null;
    }
  }, [built, tab]);

  const textValid = useMemo(() => {
    if (tab !== "text" || !mod) return null;
    const clean = normalizeRruleString(text);
    if (!clean) return null;
    try {
      const anchor = new Date(anchorTs);
      anchor.setHours(0, 0, 0, 0);
      mod.rrulestr(clean, { dtstart: anchor });
      return clean;
    } catch {
      return null;
    }
  }, [mod, text, tab, anchorTs]);

  function apply() {
    if (tab === "text") {
      const clean = normalizeRruleString(text);
      if (!clean) return;
      if (!textValid) {
        setError("invalid RRULE text — fix errors before applying");
        return;
      }
      onApply(clean);
      return;
    }
    if (!built?.rule) {
      setError(built?.error ?? "incomplete rule");
      return;
    }
    onApply(normalizeRruleString(built.rule.toString()));
  }

  const inputCls = "w-full border border-foreground/20 bg-transparent p-1 text-xs focus:outline-none";
  const labelCls = "block";

  if (!loaded || !mod) return <p className="py-2 text-xs opacity-60">loading rule editor…</p>;

  return (
    <div className="space-y-2 border border-foreground/20 p-2">
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {(["build", "text"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-2 py-0.5 text-[10px] uppercase ${tab === t ? "bg-foreground text-background" : "border border-foreground/20 opacity-60 hover:opacity-100"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <a
          href="https://github.com/jakubroztocil/rrule"
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-[10px] opacity-40 underline underline-offset-2 hover:opacity-100"
        >
          rrule (RFC 5545) ↗
        </a>
      </div>

      {tab === "build" ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <label className={`${labelCls} flex-1`}>
              <span className="opacity-60">frequency</span>
              <select value={g.freq} onChange={(e) => setG({ ...g, freq: Number(e.target.value) })} className={`mt-1 ${inputCls}`}>
                {FREQ_LABELS.map((label, i) => (
                  <option key={label} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${labelCls} w-20`}>
              <span className="opacity-60">every</span>
              <input
                type="number"
                min={1}
                max={366}
                value={g.interval}
                onChange={(e) => setG({ ...g, interval: Number(e.target.value) })}
                className={`mt-1 ${inputCls}`}
              />
            </label>
            <label className={`${labelCls} w-24`}>
              <span className="opacity-60">wkst</span>
              <select value={g.wkst} onChange={(e) => setG({ ...g, wkst: Number(e.target.value) })} className={`mt-1 ${inputCls}`}>
                {WD.map((w, i) => (
                  <option key={w} value={i}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex gap-2">
            <label className={`${labelCls} flex-1`}>
              <span className="opacity-60">dtstart</span>
              <input type="date" value={g.dtstart} onChange={(e) => setG({ ...g, dtstart: e.target.value })} className={`mt-1 ${inputCls}`} />
            </label>
            <label className={`${labelCls} w-24`}>
              <span className="opacity-60">time</span>
              <input type="time" value={g.dtstartTime} onChange={(e) => setG({ ...g, dtstartTime: e.target.value })} className={`mt-1 ${inputCls}`} />
            </label>
          </div>

          <div className="flex gap-2">
            <label className={`${labelCls} flex-1`}>
              <span className="opacity-60">count (max occurrences)</span>
              <input
                type="number"
                min={1}
                placeholder="∞"
                value={g.count}
                onChange={(e) => setG({ ...g, count: e.target.value })}
                className={`mt-1 ${inputCls}`}
              />
            </label>
            <label className={`${labelCls} flex-1`}>
              <span className="opacity-60">until</span>
              <input type="date" value={g.until} onChange={(e) => setG({ ...g, until: e.target.value })} className={`mt-1 ${inputCls}`} />
            </label>
          </div>

          <div>
            <span className="opacity-60">by weekday</span>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {WD.map((label, wd) => {
                const selected = wd in g.weekdayN;
                return (
                  <div key={label} className="flex flex-col items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        setG((prev) => {
                          const next = { ...prev.weekdayN };
                          if (selected) delete next[wd];
                          else next[wd] = null;
                          return { ...prev, weekdayN: next };
                        })
                      }
                      className={`w-full border px-0 py-1 text-[10px] ${selected ? "border-foreground bg-foreground text-background" : "border-foreground/20 hover:bg-foreground/10"}`}
                    >
                      {label}
                    </button>
                    {selected && (g.freq === 0 || g.freq === 1) ? (
                      <select
                        value={g.weekdayN[wd] == null ? "" : String(g.weekdayN[wd])}
                        onChange={(e) =>
                          setG((prev) => ({
                            ...prev,
                            weekdayN: { ...prev.weekdayN, [wd]: e.target.value === "" ? null : Number(e.target.value) },
                          }))
                        }
                        className="w-full border border-foreground/20 bg-transparent p-0 text-[9px]"
                      >
                        {ORDINALS.map((o) => (
                          <option key={o.v} value={o.v}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <span className="opacity-60">by month</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {MONTHS.map((label, m) => {
                const selected = g.bymonth.includes(m);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() =>
                      setG((prev) => ({
                        ...prev,
                        bymonth: selected ? prev.bymonth.filter((x) => x !== m) : [...prev.bymonth, m].sort((a, b) => a - b),
                      }))
                    }
                    className={`border px-1.5 py-0.5 text-[10px] ${selected ? "border-foreground bg-foreground text-background" : "border-foreground/20 hover:bg-foreground/10"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer opacity-60 hover:opacity-100">advanced BY* rules</summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(
                [
                  ["bymonthday", "month day(s)", "e.g. 1,15,-1"],
                  ["byyearday", "year day(s)", "e.g. 1,365,-1"],
                  ["byweekno", "week number(s)", "e.g. 1,20,-1"],
                  ["bysetpos", "set position(s)", "e.g. 1,-1"],
                  ["byeaster", "easter offset (days)", "e.g. 0, -2, 49"],
                  ["byhour", "hour(s)", "e.g. 9,18"],
                  ["byminute", "minute(s)", "e.g. 0,30"],
                  ["bysecond", "second(s)", "e.g. 0"],
                ] as [keyof GState, string, string][]
              ).map(([key, label, hint]) => (
                <label key={key} className={labelCls}>
                  <span className="opacity-60">{label}</span>
                  <input
                    value={String(g[key] ?? "")}
                    placeholder={hint}
                    onChange={(e) => setG({ ...g, [key]: e.target.value })}
                    className={`mt-1 ${inputCls}`}
                  />
                </label>
              ))}
            </div>
            <p className="mt-1 text-[10px] opacity-40">negative values count from the end. byhour/minute/second affect window open time.</p>
          </details>

          {built?.error ? (
            <p className="border border-foreground/20 px-2 py-1 text-[10px]">{built.error}</p>
          ) : (
            <div className="space-y-1 text-[10px]">
              {preview && preview.length > 0 && (
                <p className="opacity-60">
                  next: {preview.map((d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" })).join(", ")}{built?.rule ? " …" : ""}
                </p>
              )}
              {built?.rule && <p className="truncate font-mono opacity-40" title={built.rule.toString()}>{built.rule.toString()}</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder={"DTSTART:20260101T000000\nFREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH"}
            className="w-full border border-foreground/20 bg-transparent p-2 font-mono text-xs focus:outline-none"
          />
          <p className="text-[10px] opacity-40">
            {normalizeRruleString(text).trim() === ""
              ? "empty"
              : textValid
                ? "valid — DTSTART optional, server never sees this text"
                : "invalid rrule syntax"}
          </p>
        </div>
      )}

      {error && (
        <p className="border border-foreground/20 px-2 py-1 text-[10px]">{error}</p>
      )}

      <div className="flex items-center gap-2 text-xs">
        <button type="button" onClick={apply} className="border border-foreground bg-foreground px-3 py-1 text-background hover:opacity-90">
          apply
        </button>
        {ruleStr ? (
          <button type="button" onClick={() => onApply(null)} className="border border-foreground/20 px-3 py-1 opacity-60 hover:opacity-100">
            remove recurrence
          </button>
        ) : null}
        <button type="button" onClick={onCancel} className="ml-auto opacity-60 hover:opacity-100">
          cancel
        </button>
      </div>
    </div>
  );
}
