// @ts-nocheck — runs under `bun test` (bun:test types not installed)
import { test, expect } from "bun:test";
import { buildTree } from "./tree";
import { resolveSlashSuggest } from "./slashComplete";

let seq = 0;
function node(title, parentId = null, order = 0) {
  seq++;
  return {
    v: 2,
    title,
    isCompleted: false,
    parentId,
    order,
    metadata: {},
    _id: `id${seq}`,
    _creationTime: 1000 + seq,
    _raw: {},
  };
}

// defs: [{ title, parent?: index-of-parent-def, order? }]
function setup(defs) {
  const nodes = defs.map((d) => node(d.title, null, d.order ?? 0));
  for (let i = 0; i < defs.length; i++) {
    if (defs[i].parent != null) nodes[i].parentId = nodes[defs[i].parent]._id;
  }
  const { roots, map } = buildTree(nodes);
  return { nodes, roots, map };
}

test("plain text is not a slash/cd command", () => {
  const { nodes, roots, map } = setup([{ title: "outreach" }]);
  expect(resolveSlashSuggest("write email", nodes, roots, map, "/")).toEqual({
    suggestions: [],
    prefix: "",
    parentId: null,
    dirPath: "",
    mode: "none",
  });
});

test("slash mode suggests root children by prefix", () => {
  const { nodes, roots, map } = setup([{ title: "outreach" }, { title: "hackathon" }]);
  const r = resolveSlashSuggest("/ou", nodes, roots, map, "/");
  expect(r.mode).toBe("slash");
  expect(r.prefix).toBe("ou");
  expect(r.suggestions.map((s) => s.title)).toEqual(["outreach"]);
});

test("slash mode resolves 'dir title' input with spaces", () => {
  // "/host hackathon ou" → first space splits: dir "host" (root), prefix "hackathon ou"
  const { nodes, roots, map } = setup([{ title: "host" }, { title: "hackathon outreach", parent: 0 }]);
  const r = resolveSlashSuggest("/host hackathon ou", nodes, roots, map, "/");
  expect(r.mode).toBe("slash");
  expect(r.dirPath).toBe("/host");
  expect(r.prefix).toBe("hackathon ou");
  expect(r.suggestions.map((s) => s.title)).toEqual(["hackathon outreach"]);
});

test("slash mode with unresolvable dir degrades to none", () => {
  const { nodes, roots, map } = setup([{ title: "outreach" }]);
  const r = resolveSlashSuggest("/nope/out", nodes, roots, map, "/");
  expect(r.mode).toBe("none");
  expect(r.suggestions).toEqual([]);
});

test("slash mode skips empty segments like creation does", () => {
  // "/a//ou" — the double slash must not abort suggestions; creation accepts it
  const { nodes, roots, map } = setup([
    { title: "a" },
    { title: "outreach", parent: 0 },
  ]);
  const r = resolveSlashSuggest("/a//ou", nodes, roots, map, "/");
  expect(r.mode).toBe("slash");
  expect(r.dirPath).toBe("/a");
  expect(r.prefix).toBe("ou");
  expect(r.suggestions.map((s) => s.title)).toEqual(["outreach"]);
});

test("cd mode suggests root children by prefix", () => {
  const { nodes, roots, map } = setup([{ title: "host hackathon" }]);
  const r = resolveSlashSuggest("!cd host", nodes, roots, map, "/");
  expect(r.mode).toBe("cd");
  expect(r.dirPath).toBe("/");
  expect(r.suggestions.map((s) => s.title)).toEqual(["host hackathon"]);
});

test("cd mode with absolute path lists children of the dir", () => {
  const { nodes, roots, map } = setup([{ title: "host hackathon" }, { title: "outreach", parent: 0 }]);
  const r = resolveSlashSuggest("!cd /host hackathon/", nodes, roots, map, "/");
  expect(r.mode).toBe("cd");
  expect(r.dirPath).toBe("/host hackathon");
  expect(r.prefix).toBe("");
  expect(r.suggestions.map((s) => s.title)).toEqual(["outreach"]);
});

test("cd mode resolves '..' against the current path", () => {
  // from /a/b: ".." pops to /a, then suggests a's children by prefix "x"
  const { nodes, roots, map } = setup([
    { title: "a" },
    { title: "b", parent: 0 },
    { title: "x", parent: 0 },
  ]);
  const r = resolveSlashSuggest("!cd ../x", nodes, roots, map, "/a/b");
  expect(r.mode).toBe("cd");
  expect(r.dirPath).toBe("/a");
  expect(r.suggestions.map((s) => s.title)).toEqual(["x"]);
});

test("cd mode with unknown dir degrades to none", () => {
  const { nodes, roots, map } = setup([{ title: "outreach" }]);
  const r = resolveSlashSuggest("!cd /nope/x", nodes, roots, map, "/");
  expect(r.mode).toBe("none");
  expect(r.suggestions).toEqual([]);
});
