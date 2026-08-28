// @ts-nocheck — runs under `bun test` (bun:test types not installed)
import { test, expect } from "bun:test";
import { buildTree, childrenOf, collectDescendants, findChildByTitle, getAncestors } from "./tree";

let seq = 0;
function node(overrides = {}) {
  seq++;
  return {
    v: 2,
    title: `t${seq}`,
    isCompleted: false,
    parentId: null,
    order: seq,
    metadata: {},
    _id: `id${seq}`,
    _creationTime: 1000 + seq,
    _raw: {},
    ...overrides,
  };
}

test("buildTree attaches children and computes depth", () => {
  const a = node({ title: "a", order: 1 });
  const b = node({ title: "b", parentId: a._id, order: 1 });
  const c = node({ title: "c", order: 2 });
  const { roots, map, orphans } = buildTree([a, b, c]);
  expect(orphans).toBe(0);
  expect(roots.map((r) => r.title)).toEqual(["a", "c"]);
  expect(roots[0].children.map((ch) => ch.title)).toEqual(["b"]);
  expect(map.get(a._id).depth).toBe(0);
  expect(map.get(b._id).depth).toBe(1);
});

test("buildTree sorts active before completed, then by order", () => {
  const done = node({ title: "done", order: 1, isCompleted: true });
  const active = node({ title: "active", order: 2 });
  const { roots } = buildTree([done, active]);
  expect(roots.map((r) => r.title)).toEqual(["active", "done"]);
});

test("buildTree breaks cycles and counts them as orphans", () => {
  const a = node({ title: "a" });
  const b = node({ title: "b", parentId: a._id });
  a.parentId = b._id;
  const { roots, orphans } = buildTree([a, b]);
  expect(roots.length).toBe(2);
  expect(orphans).toBe(2);
});

test("buildTree treats nodes with missing parents as orphans", () => {
  const a = node({ title: "a" });
  const orphan = node({ title: "o", parentId: "nope" });
  const { roots, orphans } = buildTree([a, orphan]);
  expect(roots.map((r) => r.title)).toEqual(["a", "o"]);
  expect(orphans).toBe(1);
});

test("collectDescendants returns the subtree in DFS order", () => {
  const a = node({ title: "a", order: 1 });
  const b = node({ title: "b", parentId: a._id, order: 1 });
  const d = node({ title: "d", parentId: b._id, order: 1 });
  const c = node({ title: "c", parentId: a._id, order: 2 });
  const { map } = buildTree([a, b, d, c]);
  expect(collectDescendants(map.get(a._id))).toEqual([a._id, b._id, d._id, c._id]);
});

test("getAncestors walks root-first to the parent", () => {
  const a = node({ title: "a", order: 1 });
  const b = node({ title: "b", parentId: a._id, order: 1 });
  const d = node({ title: "d", parentId: b._id, order: 1 });
  const { map } = buildTree([a, b, d]);
  const chain = getAncestors(d._id, map);
  expect(chain.map((n) => n.title)).toEqual(["a", "b"]);
  expect(getAncestors(a._id, map)).toEqual([]);
});

test("findChildByTitle scopes the match to the given parent", () => {
  const a = node({ title: "dup", order: 1 });
  const b = node({ title: "b", order: 2 });
  const child = node({ title: "dup", parentId: b._id, order: 1 });
  const nodes = [a, b, child];
  expect(findChildByTitle(nodes, null, "dup")).toBe(a);
  expect(findChildByTitle(nodes, b._id, "dup")).toBe(child);
  expect(findChildByTitle(nodes, a._id, "dup")).toBeUndefined();
  expect(findChildByTitle(nodes, null, "missing")).toBeUndefined();
});

test("childrenOf returns roots for null parent and children otherwise", () => {
  const a = node({ title: "a", order: 1 });
  const b = node({ title: "b", parentId: a._id, order: 1 });
  const { roots, map } = buildTree([a, b]);
  expect(childrenOf(roots, map, null)).toBe(roots);
  expect(childrenOf(roots, map, a._id).map((n) => n.title)).toEqual(["b"]);
  expect(childrenOf(roots, map, "nope")).toEqual([]);
});
