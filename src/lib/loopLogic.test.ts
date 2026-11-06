// @ts-nocheck — runs under `bun test` (bun:test types not installed)
import { test, expect } from "bun:test";
import {
  BUILTIN_TYPES,
  BUILTIN_WORKFLOWS,
  DAY_MS,
  buildSteps,
  canMerge,
  daysLeft,
  initialState,
  matchesView,
  parseCaptureInput,
  parseRuleDef,
  parseTypeDef,
  parseViewDef,
  parseWorkflowDef,
  ratePerWeek,
  rootOf,
  ruleMatches,
  sigilMapFromTypes,
  similarity,
  stateForRole,
  suggestMatches,
  trendOf,
  validateDefBody,
  validateFields,
  verifyRun,
  workflowRecord,
} from "../../convex/loopLogic";

const NOW = 1_800_000_000_000;

// ---------- capture grammar ----------

test("? captures a problem, ?? captures a system problem", () => {
  expect(parseCaptureInput("? slow cold open")).toEqual({ text: "slow cold open", typeKey: "problem", system: false });
  expect(parseCaptureInput("?? header toggle is in the way")).toEqual({
    text: "header toggle is in the way",
    typeKey: "problem",
    system: true,
  });
});

test("a sigil needs a following space so ordinary text is never swallowed", () => {
  expect(parseCaptureInput("?slow")).toBeNull();
  expect(parseCaptureInput("???")).toBeNull();
  expect(parseCaptureInput("buy milk")).toBeNull();
  expect(parseCaptureInput("")).toBeNull();
  expect(parseCaptureInput("/a/b task")).toBeNull();
});

test("a bare sigil is a capture with empty text (callers ignore it)", () => {
  expect(parseCaptureInput("?")).toEqual({ text: "", typeKey: "problem", system: false });
  expect(parseCaptureInput("??")).toEqual({ text: "", typeKey: "problem", system: true });
});

test("user-defined sigils extend the map", () => {
  const types = { ...BUILTIN_TYPES, win: parseTypeDef({ name: "win", sigil: "+", fields: [], states: [{ key: "n", role: "open" }] }).value };
  const map = sigilMapFromTypes(types);
  expect(parseCaptureInput("+ shipped the thing", map)).toEqual({ text: "shipped the thing", typeKey: "win", system: false });
  expect(parseCaptureInput("% try a standing desk", map)?.typeKey).toBe("idea");
});

// ---------- definitions ----------

test("built-in definitions are valid under their own validators", () => {
  for (const def of Object.values(BUILTIN_TYPES)) expect(parseTypeDef(def).ok).toBe(true);
  for (const def of Object.values(BUILTIN_WORKFLOWS)) expect(parseWorkflowDef(def).ok).toBe(true);
});

test("type validation rejects bad shapes with a useful message", () => {
  expect(parseTypeDef("not json").ok).toBe(false);
  expect(parseTypeDef({ name: "x", fields: [], states: [] }).ok).toBe(false);
  const noOpen = parseTypeDef({ name: "x", fields: [], states: [{ key: "a", role: "done" }] });
  expect(noOpen.ok).toBe(false);
  expect(noOpen.error).toContain("open");
  expect(parseTypeDef({ name: "x", sigil: "a", fields: [], states: [{ key: "a", role: "open" }] }).ok).toBe(false);
  expect(parseTypeDef({ name: "x", fields: [{ key: "Bad Key", label: "b", kind: "text" }], states: [{ key: "a", role: "open" }] }).ok).toBe(false);
  expect(parseTypeDef({ name: "x", fields: [{ key: "k", label: "k", kind: "enum" }], states: [{ key: "a", role: "open" }] }).ok).toBe(false);
  expect(
    parseTypeDef({ name: "x", fields: [], states: [{ key: "a", role: "open" }, { key: "a", role: "done" }] }).ok,
  ).toBe(false);
});

test("workflow validation bounds the verify window and accepts string steps", () => {
  const w = parseWorkflowDef({ name: "w", steps: ["one", { title: "two" }], verifyDays: 7 });
  expect(w.ok).toBe(true);
  expect(w.value.steps).toEqual([{ title: "one" }, { title: "two" }]);
  expect(w.value.tolerance).toBe(0);
  expect(parseWorkflowDef({ name: "w", steps: [], verifyDays: 9999 }).ok).toBe(false);
  expect(parseWorkflowDef({ name: "w", steps: [""], verifyDays: 1 }).ok).toBe(false);
});

test("rules need an action; views validate their filters", () => {
  expect(parseRuleDef({ name: "r", atLeast: 3, withinDays: 14 }).ok).toBe(false);
  expect(parseRuleDef({ name: "r", atLeast: 3, withinDays: 14, setRole: "fixing" }).ok).toBe(true);
  expect(parseRuleDef({ name: "r", atLeast: 0, withinDays: 14, setRole: "fixing" }).ok).toBe(false);
  expect(parseViewDef({ name: "v", minRate: 2, noRun: true }).ok).toBe(true);
  expect(parseViewDef({ name: "v", minRate: -1 }).ok).toBe(false);
});

test("validateDefBody returns normalized JSON and rejects oversized definitions", () => {
  const good = validateDefBody("view", { name: "v", extra: "dropped" });
  expect(good.ok).toBe(true);
  expect(JSON.parse(good.value)).toEqual({ name: "v" });
  expect(validateDefBody("workflow", { name: "w", description: "d", steps: ["a"], verifyDays: 1, hypothesis: "h" }).ok).toBe(true);
});

// ---------- state roles ----------

test("stateForRole falls back when a type lacks a role", () => {
  const idea = BUILTIN_TYPES.idea;
  expect(stateForRole(idea, "fixing").key).toBe("doing");
  expect(stateForRole(idea, "watching").key).toBe("doing"); // no watching state -> fixing
  expect(stateForRole(idea, "done").key).toBe("shipped");
  expect(initialState(BUILTIN_TYPES.problem).key).toBe("open");
});

test("validateFields enforces kinds and rejects unknown keys", () => {
  const t = BUILTIN_TYPES.problem;
  expect(validateFields(t, { severity: "painful", context: "mornings" }).ok).toBe(true);
  expect(validateFields(t, { severity: "huge" }).ok).toBe(false);
  expect(validateFields(t, { nope: 1 }).ok).toBe(false);
  expect(validateFields(t, undefined).value).toEqual({});
  expect(validateFields(t, { severity: "" }).value).toEqual({});
});

// ---------- similarity ----------

test("similar phrasings score above the suggestion threshold; unrelated ones do not", () => {
  expect(similarity("cold open is slow", "slow cold open")).toBeGreaterThan(0.5);
  expect(similarity("slow cold open", "forgot to buy milk")).toBe(0);
  expect(similarity("", "anything")).toBe(0);
});

test("suggestMatches ranks and limits", () => {
  const items = [
    { id: "1", title: "app is slow on cold open" },
    { id: "2", title: "forgot my keys again" },
    { id: "3", title: "cold open takes forever" },
  ];
  const m = suggestMatches("slow cold open", items);
  expect(m.map((x) => x.item.id)).toEqual(["1", "3"]);
  expect(suggestMatches("completely different words here", items)).toEqual([]);
});

// ---------- rates ----------

test("ratePerWeek counts the trailing 28 days", () => {
  const times = [NOW - DAY_MS, NOW - 2 * DAY_MS, NOW - 27 * DAY_MS, NOW - 29 * DAY_MS];
  expect(ratePerWeek(times, NOW)).toBe(0.8); // 3 in 4 weeks
  expect(ratePerWeek([], NOW)).toBe(0);
});

test("trendOf compares the last two weeks-pairs", () => {
  expect(trendOf([], NOW).trend).toBe("quiet");
  expect(trendOf([NOW - DAY_MS], NOW).trend).toBe("new");
  expect(trendOf([NOW - DAY_MS, NOW - 20 * DAY_MS, NOW - 21 * DAY_MS], NOW).trend).toBe("falling");
  expect(trendOf([NOW - DAY_MS, NOW - 2 * DAY_MS, NOW - 20 * DAY_MS], NOW).trend).toBe("rising");
  expect(trendOf([NOW - DAY_MS, NOW - 20 * DAY_MS], NOW).trend).toBe("flat");
});

// ---------- merging ----------

test("rootOf follows merges and survives cycles", () => {
  const m = { a: "b", b: "c" };
  expect(rootOf("a", (id) => m[id])).toBe("c");
  expect(rootOf("c", (id) => m[id])).toBe("c");
  const cyc = { a: "b", b: "a" };
  expect(typeof rootOf("a", (id) => cyc[id])).toBe("string"); // terminates
});

test("canMerge refuses self, already-merged, and cycles", () => {
  const m = { a: "b" };
  const f = (id) => m[id];
  expect(canMerge("a", "a", f)).toBe(false);
  expect(canMerge("a", "c", f)).toBe(false); // a is already merged away
  expect(canMerge("b", "a", f)).toBe(false); // would cycle: a -> b, b -> a
  expect(canMerge("c", "b", f)).toBe(true);
});

// ---------- verification ----------

test("a clean window verifies; a recurrence reopens immediately; before the window it waits", () => {
  const run = { verifyStartedAt: NOW, verifyUntil: NOW + 14 * DAY_MS, tolerance: 0 };
  expect(verifyRun(run, [], NOW + DAY_MS)).toEqual({ verdict: "waiting", count: 0 });
  expect(verifyRun(run, [], NOW + 14 * DAY_MS)).toEqual({ verdict: "verified", count: 0 });
  expect(verifyRun(run, [NOW + 3 * DAY_MS], NOW + 3 * DAY_MS)).toEqual({ verdict: "reopen", count: 1 });
});

test("occurrences from before the fix do not count against it", () => {
  const run = { verifyStartedAt: NOW, verifyUntil: NOW + DAY_MS, tolerance: 0 };
  expect(verifyRun(run, [NOW - 5 * DAY_MS, NOW - 1], NOW + DAY_MS).verdict).toBe("verified");
});

test("tolerance allows some recurrences", () => {
  const run = { verifyStartedAt: NOW, verifyUntil: NOW + 7 * DAY_MS, tolerance: 2 };
  expect(verifyRun(run, [NOW + 1, NOW + 2], NOW + 7 * DAY_MS).verdict).toBe("verified");
  expect(verifyRun(run, [NOW + 1, NOW + 2, NOW + 3], NOW + 7 * DAY_MS).verdict).toBe("reopen");
});

test("buildSteps ids are stable and daysLeft never goes negative", () => {
  const steps = buildSteps(BUILTIN_WORKFLOWS["fix-problem"]);
  expect(steps.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  expect(steps.every((s) => !s.done)).toBe(true);
  expect(daysLeft(NOW + 2 * DAY_MS - 1, NOW)).toBe(2);
  expect(daysLeft(NOW - DAY_MS, NOW)).toBe(0);
});

test("workflowRecord counts only finished runs", () => {
  const rec = workflowRecord([
    { workflowKey: "a", status: "verified" },
    { workflowKey: "a", status: "reopened" },
    { workflowKey: "a", status: "active" },
    { workflowKey: "b", status: "verifying" },
    { workflowKey: "b", status: "verified" },
  ]);
  expect(rec).toEqual({ a: { held: 1, reopened: 1 }, b: { held: 1, reopened: 0 } });
});

// ---------- rules & views ----------

test("rules match on count within a window and optional type", () => {
  const rule = { name: "r", atLeast: 3, withinDays: 7, setRole: "fixing" };
  expect(ruleMatches(rule, "problem", [NOW - DAY_MS, NOW - 2 * DAY_MS, NOW - 3 * DAY_MS], NOW)).toBe(true);
  expect(ruleMatches(rule, "problem", [NOW - DAY_MS, NOW - 2 * DAY_MS, NOW - 9 * DAY_MS], NOW)).toBe(false);
  expect(ruleMatches({ ...rule, type: "idea" }, "problem", [NOW, NOW, NOW], NOW)).toBe(false);
});

test("views filter rows", () => {
  const row = { type: "problem", state: "open", rate: 2, signals: 5, hasActiveRun: false };
  expect(matchesView({ name: "v", minRate: 1, noRun: true }, row)).toBe(true);
  expect(matchesView({ name: "v", noRun: false }, row)).toBe(false);
  expect(matchesView({ name: "v", states: ["fixing"] }, row)).toBe(false);
  expect(matchesView({ name: "v", minSignals: 6 }, row)).toBe(false);
  expect(matchesView({ name: "v", type: "idea" }, row)).toBe(false);
});
