"use client";

// Pure tree helpers for the encrypted todo hierarchy: build parent/child
// structure from the flat decrypted list, cycle/orphan-safe, with depth and
// display ordering (active first, then by order/creationTime).

import type { DragEvent } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { PlainNode } from "./crypto";

export type DecryptedNode = PlainNode & {
  _id: Id<"todos">;
  _creationTime: number;
  _raw: { ciphertext?: string; iv?: string };
};

export type TreeNode = DecryptedNode & { children: TreeNode[]; depth: number };

export type DropPos = "before" | "after" | "child";

/** Upper half of the row inserts above, lower half below; Alt means "drop as child". */
export function dropPosFor(e: DragEvent): DropPos {
  if (e.altKey) return "child";
  // measure the visible row (direct child marked data-drop-row), not the whole
  // <li> — a folder's li also contains its expanded children, which would put
  // the before/after split line deep inside the subtree
  const li = e.currentTarget as HTMLElement;
  const row = li.querySelector<HTMLElement>(":scope > [data-drop-row]") ?? li;
  const rect = row.getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

export function buildTree(nodes: DecryptedNode[]): { roots: TreeNode[]; map: Map<string, TreeNode>; orphans: number } {
  const map = new Map<string, TreeNode>();
  // init
  for (const n of nodes) {
    map.set(n._id, { ...n, children: [], depth: 0 });
  }
  const roots: TreeNode[] = [];
  let orphans = 0;
  // attach, detect cycles (simple: if parent chain leads back to self, break)
  for (const n of nodes) {
    const tn = map.get(n._id)!;
    const parentId = n.parentId;
    if (!parentId || !map.has(parentId)) {
      if (parentId && !map.has(parentId)) orphans++;
      roots.push(tn);
      continue;
    }
    // cycle check: walk up from parent
    let cur: string | null = parentId;
    let cyclic = false;
    const seen = new Set<string>([n._id]);
    while (cur) {
      if (seen.has(cur)) { cyclic = true; break; }
      seen.add(cur);
      const p = map.get(cur);
      if (!p) break;
      cur = p.parentId;
    }
    if (cyclic) {
      roots.push(tn);
      orphans++;
      continue;
    }
    const parent = map.get(parentId)!;
    parent.children.push(tn);
  }
  // compute depth + sort: active first, then by order/creationTime (so completed always below)
  function sortAndDepth(list: TreeNode[], depth: number) {
    list.sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
      if (a.order !== b.order) return a.order - b.order;
      return a._creationTime - b._creationTime;
    });
    for (const n of list) {
      n.depth = depth;
      if (n.children.length) sortAndDepth(n.children, depth + 1);
    }
  }
  sortAndDepth(roots, 0);
  return { roots, map, orphans };
}

export function collectDescendants(node: TreeNode): Id<"todos">[] {
  const out: Id<"todos">[] = [];
  function dfs(n: TreeNode) {
    out.push(n._id);
    for (const c of n.children) dfs(c);
  }
  dfs(node);
  return out;
}

export function getAncestors(
  id: string,
  map: Map<string, TreeNode>
): TreeNode[] {
  const out: TreeNode[] = [];
  // buildTree tolerates cyclic parentId data (it detaches cycles from the
  // rendered tree but leaves the links) — guard the walk so a cycle in the
  // raw records can't hang the caller
  const seen = new Set<string>([id]);
  let cur = map.get(id);
  while (cur?.parentId) {
    const p = map.get(cur.parentId);
    if (!p || seen.has(p._id as string)) break;
    seen.add(p._id as string);
    out.unshift(p);
    cur = p;
  }
  return out;
}

/** Find a node by exact title under a given parent in the flat decrypted list. */
export function findChildByTitle(
  nodes: DecryptedNode[],
  parentId: string | null,
  title: string
): DecryptedNode | undefined {
  return nodes.find((n) => n.title === title && (n.parentId ?? null) === parentId);
}

/** Siblings under parentId — the roots list for null (top level), else the parent's children. */
export function childrenOf(roots: TreeNode[], map: Map<string, TreeNode>, parentId: string | null): TreeNode[] {
  if (parentId === null) return roots;
  return map.get(parentId)?.children ?? [];
}

/** Whether the current drag may target this row: not itself, not inside the dragged subtree, not a sibling within it. */
export function isValidDropTarget(node: TreeNode, dragId: string | null, map: Map<string, TreeNode>): boolean {
  if (!dragId) return false;
  if (dragId === node._id) return false;
  const draggedTree = map.get(dragId);
  if (draggedTree) {
    const desc = collectDescendants(draggedTree).map(String);
    // cannot drop onto the dragged subtree, nor as a sibling inside it
    if (desc.includes(node._id as string)) return false;
    if (node.parentId && desc.includes(node.parentId)) return false;
  }
  return true;
}
