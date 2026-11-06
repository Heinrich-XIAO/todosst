// Pure logic for the loop engine: signals -> problems -> runs -> verification.
//
// No Convex or React imports on purpose: the server (convex/loop.ts) and the
// UI both import this file, and it is unit-tested directly (loopLogic.test.ts).
//
// Vocabulary:
//   signal   one timestamped "this happened / I noticed this" capture. Append-only.
//   item     a thing you track (a problem, an idea, anything you define a type for).
//            Signals attach to items; an item's rate is signals per week.
//   run      one attempt to fix items using a workflow. It is only "held" once the
//            items stay quiet for the workflow's verify window.
//   def      a versioned definition (type / workflow / view / rule) — the system's
//            own shape, stored as data so it can be edited like any other thing.

export const DAY_MS = 86_400_000;
export const RATE_WINDOW_DAYS = 28;
/** signals stamped further in the future than this are clamped to "now" */
export const CLOCK_SKEW_MS = 60_000;

// ---------- result helper ----------

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T = never>(error: string): Result<T> => ({ ok: false, error });

// ---------- definitions ----------

/** What a state *means*, so runs can move items around without knowing a type's vocabulary. */
export type StateRole = "open" | "fixing" | "watching" | "done" | "dropped";
export const STATE_ROLES: readonly StateRole[] = ["open", "fixing", "watching", "done", "dropped"];

export type FieldKind = "text" | "number" | "date" | "enum" | "bool";
export const FIELD_KINDS: readonly FieldKind[] = ["text", "number", "date", "enum", "bool"];

export type FieldDef = { key: string; label: string; kind: FieldKind; options?: string[] };
export type StateDef = { key: string; label: string; role: StateRole };
export type TypeDef = {
  name: string;
  /** one punctuation character that, typed before a space, captures into this type */
  sigil?: string;
  description?: string;
  fields: FieldDef[];
  states: StateDef[];
};
export type WorkflowDef = {
  name: string;
  description?: string;
  steps: { title: string }[];
  /** how long the items must stay quiet after the last step; 0 = no verification */
  verifyDays: number;
  /** signals tolerated inside the verify window (0 = any recurrence reopens) */
  tolerance: number;
  /** what the run claims will happen, shown on the run */
  hypothesis?: string;
};
export type ViewDef = {
  name: string;
  /** only items of this type key */
  type?: string;
  /** only items in one of these state keys */
  states?: string[];
  /** only items whose rate (per week) is at least this */
  minRate?: number;
  /** only items with at least this many signals (all time in the loaded window) */
  minSignals?: number;
  /** true = only items with no active run; false = only items with one */
  noRun?: boolean;
};
export type RuleDef = {
  name: string;
  /** limit to one type key */
  type?: string;
  /** fire when an item collects this many signals ... */
  atLeast: number;
  /** ... within this many days */
  withinDays: number;
  /** then move the item to the state with this role ... */
  setRole?: StateRole;
  /** ... and/or start a run of this workflow key */
  startWorkflow?: string;
};

export type DefKind = "type" | "workflow" | "view" | "rule";
export const DEF_KINDS: readonly DefKind[] = ["type", "workflow", "view", "rule"];

const KEY_RE = /^[a-z][a-z0-9-]{0,31}$/;
export const isValidKey = (k: string): boolean => KEY_RE.test(k);

/** Sigil characters user types may claim. `?` and `??` are reserved. */
export const USER_SIGIL_CHARS = "%&;$^|=+";
export const RESERVED_SIGIL = "?";

// ---------- built-ins (used until the user saves their own version) ----------

export const BUILTIN_TYPES: Record<string, TypeDef> = {
  problem: {
    name: "problem",
    sigil: "?",
    description: "Something that keeps going wrong. Tracked by how often it happens.",
    fields: [
      { key: "severity", label: "severity", kind: "enum", options: ["annoying", "painful", "blocking"] },
      { key: "context", label: "where / when", kind: "text" },
    ],
    states: [
      { key: "open", label: "open", role: "open" },
      { key: "fixing", label: "fixing", role: "fixing" },
      { key: "watching", label: "watching", role: "watching" },
      { key: "resolved", label: "resolved", role: "done" },
      { key: "dismissed", label: "dismissed", role: "dropped" },
    ],
  },
  idea: {
    name: "idea",
    sigil: "%",
    description: "A thing worth trying. Rate = how often you keep coming back to it.",
    fields: [],
    states: [
      { key: "new", label: "new", role: "open" },
      { key: "doing", label: "doing", role: "fixing" },
      { key: "shipped", label: "shipped", role: "done" },
      { key: "parked", label: "parked", role: "dropped" },
    ],
  },
};

export const BUILTIN_WORKFLOWS: Record<string, WorkflowDef> = {
  "fix-problem": {
    name: "fix a problem",
    description: "Pin it down, pick one change, make it, then see whether it actually stops.",
    steps: [
      { title: "pin down when and why it happens" },
      { title: "pick one change to try" },
      { title: "make the change" },
    ],
    verifyDays: 14,
    tolerance: 0,
    hypothesis: "this stops happening",
  },
  "system-change": {
    name: "change the system",
    description: "Something about this app itself is off. Draft a change, try it, apply it, then see if the annoyance stops.",
    steps: [
      { title: "write down what is wrong with the system" },
      { title: "draft the change" },
      { title: "try the draft (preview)" },
      { title: "apply it" },
    ],
    verifyDays: 14,
    tolerance: 0,
    hypothesis: "this part of the system stops getting in the way",
  },
};

// ---------- validation ----------

function asObject(input: unknown): Record<string, unknown> | null {
  let v = input;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown, max: number, min = 1): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length >= min && t.length <= max ? t : null;
}

function int(v: unknown, lo: number, hi: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null;
}

export function parseTypeDef(input: unknown): Result<TypeDef> {
  const o = asObject(input);
  if (!o) return fail("type definition must be a JSON object");
  const name = str(o.name, 60);
  if (!name) return fail("type needs a name (1–60 characters)");
  let sigil: string | undefined;
  if (o.sigil !== undefined && o.sigil !== null && o.sigil !== "") {
    if (typeof o.sigil !== "string" || o.sigil.length !== 1) return fail("sigil must be a single character");
    if (o.sigil !== RESERVED_SIGIL && !USER_SIGIL_CHARS.includes(o.sigil)) {
      return fail(`sigil must be one of ${USER_SIGIL_CHARS.split("").join(" ")}`);
    }
    sigil = o.sigil;
  }
  const description = o.description === undefined ? undefined : (str(o.description, 400, 0) ?? undefined);
  if (!Array.isArray(o.fields)) return fail("fields must be a list");
  if (o.fields.length > 20) return fail("at most 20 fields");
  const fields: FieldDef[] = [];
  const seenFields = new Set<string>();
  for (const f of o.fields) {
    const fo = asObject(f);
    if (!fo) return fail("every field must be an object");
    const key = typeof fo.key === "string" ? fo.key : "";
    if (!isValidKey(key)) return fail(`field key "${key}" must be lowercase letters, digits or dashes`);
    if (seenFields.has(key)) return fail(`duplicate field key "${key}"`);
    seenFields.add(key);
    const label = str(fo.label, 60) ?? key;
    const kind = fo.kind as FieldKind;
    if (!FIELD_KINDS.includes(kind)) return fail(`field "${key}" has an unknown kind`);
    let options: string[] | undefined;
    if (kind === "enum") {
      if (!Array.isArray(fo.options) || fo.options.length < 1 || fo.options.length > 20) {
        return fail(`enum field "${key}" needs 1–20 options`);
      }
      options = [];
      for (const op of fo.options) {
        const t = str(op, 60);
        if (!t) return fail(`enum field "${key}" has an empty option`);
        options.push(t);
      }
    }
    fields.push(options ? { key, label, kind, options } : { key, label, kind });
  }
  if (!Array.isArray(o.states) || o.states.length < 1) return fail("a type needs at least one state");
  if (o.states.length > 12) return fail("at most 12 states");
  const states: StateDef[] = [];
  const seenStates = new Set<string>();
  for (const s of o.states) {
    const so = asObject(s);
    if (!so) return fail("every state must be an object");
    const key = typeof so.key === "string" ? so.key : "";
    if (!isValidKey(key)) return fail(`state key "${key}" must be lowercase letters, digits or dashes`);
    if (seenStates.has(key)) return fail(`duplicate state key "${key}"`);
    seenStates.add(key);
    const role = so.role as StateRole;
    if (!STATE_ROLES.includes(role)) return fail(`state "${key}" needs a role: ${STATE_ROLES.join(", ")}`);
    states.push({ key, label: str(so.label, 40) ?? key, role });
  }
  if (!states.some((s) => s.role === "open")) return fail('at least one state needs the role "open" (where new items start)');
  return ok({ name, ...(sigil ? { sigil } : {}), ...(description ? { description } : {}), fields, states });
}

export function parseWorkflowDef(input: unknown): Result<WorkflowDef> {
  const o = asObject(input);
  if (!o) return fail("workflow definition must be a JSON object");
  const name = str(o.name, 60);
  if (!name) return fail("workflow needs a name (1–60 characters)");
  if (!Array.isArray(o.steps) || o.steps.length > 20) return fail("steps must be a list of at most 20");
  const steps: { title: string }[] = [];
  for (const s of o.steps) {
    const title = str(typeof s === "string" ? s : asObject(s)?.title, 120);
    if (!title) return fail("every step needs a title (1–120 characters)");
    steps.push({ title });
  }
  const verifyDays = int(o.verifyDays ?? 14, 0, 365);
  if (verifyDays === null) return fail("verifyDays must be a whole number from 0 to 365");
  const tolerance = int(o.tolerance ?? 0, 0, 100);
  if (tolerance === null) return fail("tolerance must be a whole number from 0 to 100");
  const description = o.description === undefined ? undefined : (str(o.description, 400, 0) ?? undefined);
  const hypothesis = o.hypothesis === undefined ? undefined : (str(o.hypothesis, 200, 0) ?? undefined);
  return ok({
    name,
    ...(description ? { description } : {}),
    steps,
    verifyDays,
    tolerance,
    ...(hypothesis ? { hypothesis } : {}),
  });
}

export function parseViewDef(input: unknown): Result<ViewDef> {
  const o = asObject(input);
  if (!o) return fail("view definition must be a JSON object");
  const name = str(o.name, 60);
  if (!name) return fail("view needs a name (1–60 characters)");
  const view: ViewDef = { name };
  if (o.type !== undefined) {
    if (typeof o.type !== "string" || !isValidKey(o.type)) return fail("view type must be a type key");
    view.type = o.type;
  }
  if (o.states !== undefined) {
    if (!Array.isArray(o.states) || o.states.length > 12 || !o.states.every((s) => typeof s === "string" && isValidKey(s))) {
      return fail("view states must be a list of state keys");
    }
    view.states = o.states as string[];
  }
  if (o.minRate !== undefined) {
    if (typeof o.minRate !== "number" || !(o.minRate >= 0) || o.minRate > 10_000) return fail("minRate must be a number ≥ 0");
    view.minRate = o.minRate;
  }
  if (o.minSignals !== undefined) {
    const n = int(o.minSignals, 0, 100_000);
    if (n === null) return fail("minSignals must be a whole number ≥ 0");
    view.minSignals = n;
  }
  if (o.noRun !== undefined) {
    if (typeof o.noRun !== "boolean") return fail("noRun must be true or false");
    view.noRun = o.noRun;
  }
  return ok(view);
}

export function parseRuleDef(input: unknown): Result<RuleDef> {
  const o = asObject(input);
  if (!o) return fail("rule definition must be a JSON object");
  const name = str(o.name, 60);
  if (!name) return fail("rule needs a name (1–60 characters)");
  const atLeast = int(o.atLeast, 1, 10_000);
  if (atLeast === null) return fail("atLeast must be a whole number ≥ 1");
  const withinDays = int(o.withinDays, 1, 365);
  if (withinDays === null) return fail("withinDays must be a whole number from 1 to 365");
  const rule: RuleDef = { name, atLeast, withinDays };
  if (o.type !== undefined) {
    if (typeof o.type !== "string" || !isValidKey(o.type)) return fail("rule type must be a type key");
    rule.type = o.type;
  }
  if (o.setRole !== undefined) {
    if (!STATE_ROLES.includes(o.setRole as StateRole)) return fail(`setRole must be one of ${STATE_ROLES.join(", ")}`);
    rule.setRole = o.setRole as StateRole;
  }
  if (o.startWorkflow !== undefined) {
    if (typeof o.startWorkflow !== "string" || !isValidKey(o.startWorkflow)) return fail("startWorkflow must be a workflow key");
    rule.startWorkflow = o.startWorkflow;
  }
  if (!rule.setRole && !rule.startWorkflow) return fail("a rule needs an action: setRole and/or startWorkflow");
  return ok(rule);
}

/** Validate a definition body for its kind; returns the normalized JSON string to store. */
export function validateDefBody(kind: DefKind, body: unknown): Result<string> {
  const parsed =
    kind === "type"
      ? parseTypeDef(body)
      : kind === "workflow"
        ? parseWorkflowDef(body)
        : kind === "view"
          ? parseViewDef(body)
          : parseRuleDef(body);
  if (!parsed.ok) return fail(parsed.error);
  const text = JSON.stringify(parsed.value);
  if (text.length > 8_000) return fail("definition is too large");
  return ok(text);
}

// ---------- state helpers ----------

export function roleOfState(def: TypeDef, stateKey: string): StateRole | undefined {
  return def.states.find((s) => s.key === stateKey)?.role;
}

/** Where new items of this type start. */
export function initialState(def: TypeDef): StateDef {
  return def.states.find((s) => s.role === "open") ?? def.states[0];
}

const ROLE_FALLBACK: Record<StateRole, StateRole[]> = {
  open: ["open"],
  fixing: ["fixing", "open"],
  watching: ["watching", "fixing", "open"],
  done: ["done", "dropped", "watching", "fixing"],
  dropped: ["dropped", "done"],
};

/** The state a run should move an item to for a role, falling back sensibly when the type lacks it. */
export function stateForRole(def: TypeDef, role: StateRole): StateDef | undefined {
  for (const r of ROLE_FALLBACK[role]) {
    const hit = def.states.find((s) => s.role === r);
    if (hit) return hit;
  }
  return undefined;
}

/** Does this item still count as live work? (not done/dropped) */
export function isLiveRole(role: StateRole | undefined): boolean {
  return role !== "done" && role !== "dropped";
}

// ---------- item fields ----------

/** Validate a fields map against a type's field defs; unknown keys are rejected. Returns normalized JSON. */
export function validateFields(def: TypeDef, fields: unknown): Result<Record<string, string | number | boolean>> {
  if (fields === undefined || fields === null) return ok({});
  const o = asObject(fields);
  if (!o) return fail("fields must be an object");
  const out: Record<string, string | number | boolean> = {};
  for (const [key, val] of Object.entries(o)) {
    const f = def.fields.find((x) => x.key === key);
    if (!f) return fail(`"${key}" is not a field of ${def.name}`);
    if (val === "" || val === null) continue;
    switch (f.kind) {
      case "text": {
        const t = str(val, 500);
        if (!t) return fail(`${f.label} is too long (500 max)`);
        out[key] = t;
        break;
      }
      case "number":
        if (typeof val !== "number" || !Number.isFinite(val)) return fail(`${f.label} must be a number`);
        out[key] = val;
        break;
      case "date":
        if (typeof val !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(val)) return fail(`${f.label} must be a date (YYYY-MM-DD)`);
        out[key] = val;
        break;
      case "enum":
        if (typeof val !== "string" || !f.options?.includes(val)) return fail(`${f.label} must be one of ${f.options?.join(", ")}`);
        out[key] = val;
        break;
      case "bool":
        if (typeof val !== "boolean") return fail(`${f.label} must be true or false`);
        out[key] = val;
        break;
    }
  }
  return ok(out);
}

// ---------- capture grammar ----------

export type Capture = { text: string; typeKey: string; system: boolean };

/** sigil character -> type key. The built-ins; saved types add to it (see sigilMapFromTypes). */
export const DEFAULT_SIGILS: Record<string, string> = { "?": "problem", "%": "idea" };

export function sigilMapFromTypes(types: Record<string, TypeDef>): Record<string, string> {
  const map: Record<string, string> = { ...DEFAULT_SIGILS };
  for (const [key, def] of Object.entries(types)) {
    if (def.sigil && (def.sigil === RESERVED_SIGIL ? key === "problem" : true)) map[def.sigil] = key;
  }
  return map;
}

/**
 * Parse "<sigil> text" into a capture. Returns null when the input is not a
 * capture. `??` captures a problem *about the system itself*. A sigil must be
 * followed by whitespace ("? slow", not "?slow") so ordinary text is never
 * swallowed. `text` is empty when the sigil stands alone (callers ignore that).
 */
export function parseCaptureInput(raw: string, sigils: Record<string, string> = DEFAULT_SIGILS): Capture | null {
  const s = raw.trim();
  if (s.length === 0) return null;
  if (s === "??" || s.startsWith("?? ") || s.startsWith("??\t")) {
    return { text: s.slice(2).trim(), typeKey: "problem", system: true };
  }
  const c = s[0];
  const typeKey = sigils[c];
  if (!typeKey) return null;
  if (s.length > 1 && !/\s/.test(s[1])) return null;
  return { text: s.slice(1).trim(), typeKey, system: false };
}

export const MAX_SIGNAL_CHARS = 1000;

// ---------- similarity (duplicate suggestions) ----------

const STOP = new Set(
  "a an the and or but of to in on at for with is are was were be been it its this that these those i me my we our you your so as by from do does did not no too very just when why how what again still always never".split(
    " ",
  ),
);

function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
  return w;
}

export function tokens(s: string): string[] {
  const out = new Set<string>();
  for (const w of s.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length < 2 || STOP.has(w)) continue;
    out.add(stem(w));
  }
  return [...out];
}

/** 0..1 — how likely two short texts describe the same thing. */
export function similarity(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  if (inter === 0) return 0;
  const jaccard = inter / (A.size + B.size - inter);
  if (inter < 2) return jaccard;
  return Math.max(jaccard, 0.8 * (inter / Math.min(A.size, B.size)));
}

export const SUGGEST_MIN = 0.34;

export function suggestMatches<T extends { id: string; title: string }>(
  text: string,
  candidates: readonly T[],
  limit = 3,
  min = SUGGEST_MIN,
): { item: T; score: number }[] {
  return candidates
    .map((item) => ({ item, score: similarity(text, item.title) }))
    .filter((m) => m.score >= min)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}

// ---------- rates ----------

/** Signals per week over the trailing window, one decimal. */
export function ratePerWeek(times: readonly number[], now: number, windowDays = RATE_WINDOW_DAYS): number {
  const from = now - windowDays * DAY_MS;
  let n = 0;
  for (const t of times) if (t >= from && t <= now + CLOCK_SKEW_MS) n++;
  return Math.round((n / (windowDays / 7)) * 10) / 10;
}

export type Trend = "new" | "rising" | "falling" | "flat" | "quiet";

/** Compare the last 14 days with the 14 before. */
export function trendOf(times: readonly number[], now: number): { trend: Trend; last: number; prev: number } {
  let last = 0;
  let prev = 0;
  for (const t of times) {
    if (t > now - 14 * DAY_MS && t <= now + CLOCK_SKEW_MS) last++;
    else if (t > now - 28 * DAY_MS && t <= now - 14 * DAY_MS) prev++;
  }
  let trend: Trend;
  if (last === 0 && prev === 0) trend = "quiet";
  else if (prev === 0) trend = "new";
  else if (last > prev) trend = "rising";
  else if (last < prev) trend = "falling";
  else trend = "flat";
  return { trend, last, prev };
}

// ---------- merging ----------

/** Follow mergedInto pointers to the surviving item. Cycle-safe. */
export function rootOf(id: string, mergedInto: (id: string) => string | null | undefined): string {
  let cur = id;
  for (let i = 0; i < 50; i++) {
    const next = mergedInto(cur);
    if (!next || next === cur) return cur;
    cur = next;
  }
  return cur;
}

/** Merging `from` into `into` is allowed unless it would merge an item into itself or form a cycle. */
export function canMerge(from: string, into: string, mergedInto: (id: string) => string | null | undefined): boolean {
  if (from === into) return false;
  if (rootOf(from, mergedInto) !== from) return false; // already merged away
  return rootOf(into, mergedInto) !== from;
}

// ---------- runs & verification ----------

export type RunStep = { id: string; title: string; done: boolean; doneAt?: number };
export type RunStatus = "active" | "verifying" | "verified" | "reopened" | "cancelled" | "done";

export function buildSteps(def: WorkflowDef): RunStep[] {
  return def.steps.map((s, i) => ({ id: `s${i + 1}`, title: s.title, done: false }));
}

export function allStepsDone(steps: readonly RunStep[]): boolean {
  return steps.every((s) => s.done);
}

export type Verdict = { verdict: "waiting" | "verified" | "reopen"; count: number };

/**
 * Decide a verifying run. `times` are occurrence timestamps of the run's items.
 * Only occurrences at/after verifyStartedAt count — earlier ones were what the
 * fix was for. More than `tolerance` occurrences reopens it immediately; a clean
 * window at/after verifyUntil verifies it.
 */
export function verifyRun(
  run: { verifyStartedAt: number; verifyUntil: number; tolerance: number },
  times: readonly number[],
  now: number,
): Verdict {
  let count = 0;
  for (const t of times) if (t >= run.verifyStartedAt && t <= now + CLOCK_SKEW_MS) count++;
  if (count > run.tolerance) return { verdict: "reopen", count };
  if (now >= run.verifyUntil) return { verdict: "verified", count };
  return { verdict: "waiting", count };
}

/** Days left in a verify window (rounded up, never negative). */
export function daysLeft(verifyUntil: number, now: number): number {
  return Math.max(0, Math.ceil((verifyUntil - now) / DAY_MS));
}

export type WorkflowRecord = { held: number; reopened: number };

/** How often a workflow's runs actually held, from finished runs. */
export function workflowRecord(runs: readonly { workflowKey: string; status: RunStatus }[]): Record<string, WorkflowRecord> {
  const out: Record<string, WorkflowRecord> = {};
  for (const r of runs) {
    if (r.status !== "verified" && r.status !== "reopened") continue;
    const rec = (out[r.workflowKey] ??= { held: 0, reopened: 0 });
    if (r.status === "verified") rec.held++;
    else rec.reopened++;
  }
  return out;
}

// ---------- rules & views ----------

export function ruleMatches(rule: RuleDef, itemType: string, times: readonly number[], now: number): boolean {
  if (rule.type && rule.type !== itemType) return false;
  const from = now - rule.withinDays * DAY_MS;
  let n = 0;
  for (const t of times) if (t >= from && t <= now + CLOCK_SKEW_MS) n++;
  return n >= rule.atLeast;
}

export type ViewRow = { type: string; state: string; rate: number; signals: number; hasActiveRun: boolean };

export function matchesView(view: ViewDef, row: ViewRow): boolean {
  if (view.type && view.type !== row.type) return false;
  if (view.states && !view.states.includes(row.state)) return false;
  if (view.minRate !== undefined && row.rate < view.minRate) return false;
  if (view.minSignals !== undefined && row.signals < view.minSignals) return false;
  if (view.noRun !== undefined && view.noRun === row.hasActiveRun) return false;
  return true;
}

export const EVENT_KINDS = [
  "created",
  "state",
  "merged",
  "unmerged",
  "attached",
  "detached",
  "run-started",
  "run-step",
  "run-verifying",
  "run-verified",
  "run-reopened",
  "run-cancelled",
  "def-saved",
  "def-applied",
  "def-rolled-back",
  "rule-fired",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
