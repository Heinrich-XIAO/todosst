"use client";

// Intellisense resolution for the command input: autocomplete for "/..." path
// creation and "!cd ..." navigation. Pure — extracted from TodoTask so it can
// be unit tested.

import { decodePathToParts, parseBangCd } from "./cdPath";
import type { DecryptedNode, TreeNode } from "./tree";

export type SlashSuggestMode = "none" | "slash" | "cd";

export type SlashSuggestState = {
  suggestions: TreeNode[];
  prefix: string;
  parentId: string | null;
  dirPath: string;
  mode: SlashSuggestMode;
};

const NONE: SlashSuggestState = { suggestions: [], prefix: "", parentId: null, dirPath: "", mode: "none" };

export function resolveSlashSuggest(
  query: string,
  nodes: DecryptedNode[] | null,
  roots: TreeNode[],
  map: Map<string, TreeNode>,
  decodedPath: string
): SlashSuggestState {
  if (!nodes) return NONE;
  if (query.startsWith("/")) {
    const withoutLeading = query.slice(1);
    const parts = withoutLeading.split("/");
    let prefixRaw = parts[parts.length - 1] ?? "";
    let dirPartsRaw = parts.slice(0, -1);
    if (dirPartsRaw.length === 0) {
      const m = /^(\S+)\s+(\S.*)$/.exec(prefixRaw.trim());
      const first = m ? nodes.find((n) => n.title === m[1] && (n.parentId ?? null) === null) : undefined;
      if (m && first) {
        dirPartsRaw = [m[1]];
        prefixRaw = m[2];
      }
    }
    let parentId: string | null = null;
    for (const raw of dirPartsRaw) {
      const seg = raw.trim();
      if (!seg) return { ...NONE, prefix: prefixRaw };
      const match = nodes.find((n) => n.title === seg && (n.parentId ?? null) === parentId);
      if (!match) return { ...NONE, prefix: prefixRaw };
      parentId = match._id as string;
    }
    const dirPath = dirPartsRaw.length ? "/" + dirPartsRaw.map((s) => s.trim()).filter(Boolean).join("/") : "";
    let siblings: TreeNode[];
    if (parentId === null) siblings = roots;
    else {
      const par = map.get(parentId);
      siblings = par ? par.children : [];
    }
    const prefix = prefixRaw.trim();
    const lower = prefix.toLowerCase();
    const filtered = !prefix ? siblings.slice(0, 8) : siblings.filter((s) => s.title.toLowerCase().startsWith(lower)).slice(0, 8);
    return { suggestions: filtered, prefix, parentId, dirPath, mode: "slash" as const };
  }
  // "!cd <path>" intellisense — segments are "/"-separated, resolved against pwd
  const { isCd: isCdCmd, target: cdTarget } = parseBangCd(query);
  if (!isCdCmd) return NONE;
  const segs = cdTarget ? cdTarget.split("/") : [];
  const prefixRaw = segs.length ? segs[segs.length - 1] : "";
  const dirSegs = segs.length ? segs.slice(0, -1) : [];
  const absolute = !!cdTarget && cdTarget.startsWith("/");
  const dirParts: string[] = absolute ? [] : decodePathToParts(decodedPath);
  for (const raw of dirSegs) {
    const seg = raw.trim();
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      dirParts.pop();
      continue;
    }
    dirParts.push(seg);
  }
  let parentId: string | null = null;
  for (const part of dirParts) {
    const match = nodes.find((n) => n.title === part && (n.parentId ?? null) === parentId);
    if (!match) return { ...NONE, prefix: prefixRaw };
    parentId = match._id as string;
  }
  const siblings = parentId === null ? roots : (map.get(parentId)?.children ?? []);
  const prefix = prefixRaw.trim();
  const lower = prefix.toLowerCase();
  const filtered = !prefix ? siblings.slice(0, 8) : siblings.filter((s) => s.title.toLowerCase().startsWith(lower)).slice(0, 8);
  return { suggestions: filtered, prefix, parentId, dirPath: "/" + dirParts.join("/"), mode: "cd" as const };
}
