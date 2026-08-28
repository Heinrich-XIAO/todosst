"use client";

// Intellisense resolution for the command input: autocomplete for "/..." path
// creation and "!cd ..." navigation. Pure — extracted from TodoTask so it can
// be unit tested.

import { decodePathToParts, parseBangCd } from "./cdPath";
import { childrenOf, findChildByTitle, type DecryptedNode, type TreeNode } from "./tree";

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
      const first = m ? findChildByTitle(nodes, null, m[1]) : undefined;
      if (m && first) {
        dirPartsRaw = [m[1]];
        prefixRaw = m[2];
      }
    }
    let parentId: string | null = null;
    for (const raw of dirPartsRaw) {
      const seg = raw.trim();
      if (!seg) return { ...NONE, prefix: prefixRaw };
      const match = findChildByTitle(nodes, parentId, seg);
      if (!match) return { ...NONE, prefix: prefixRaw };
      parentId = match._id as string;
    }
    const dirPath = dirPartsRaw.length ? "/" + dirPartsRaw.map((s) => s.trim()).filter(Boolean).join("/") : "";
    const siblings = childrenOf(roots, map, parentId);
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
    const match = findChildByTitle(nodes, parentId, part);
    if (!match) return { ...NONE, prefix: prefixRaw };
    parentId = match._id as string;
  }
  const siblings = childrenOf(roots, map, parentId);
  const prefix = prefixRaw.trim();
  const lower = prefix.toLowerCase();
  const filtered = !prefix ? siblings.slice(0, 8) : siblings.filter((s) => s.title.toLowerCase().startsWith(lower)).slice(0, 8);
  return { suggestions: filtered, prefix, parentId, dirPath: "/" + dirParts.join("/"), mode: "cd" as const };
}
