"use client";

// Utilities for cd-path resolution ("!cd" arguments live in grammar.ts).
// Canonical representation is a list of path segments
// (string[] with no "/" symbols) — e.g. "/haven" and "/haven/" both normalize to ["haven"].
// Handles: absolute vs relative, "." and "..", spaces without escaping,
// quoted forms cd "host hackathon", and // collapse.
//
// Percent-decoding happens exactly ONCE, at the URL boundary: usePathname
// returns percent-encoded segments, and decodePath/decodeURIComponent turns
// them into the decoded paths this module works with. Titles may legitimately
// contain "%" (e.g. "50%20off"), so re-decoding decoded input here would
// corrupt them.

/** Shared representation: list of segments with no "/" — e.g. [] for "/", ["haven"], ["host hackathon"].
 * Input must already be percent-decoded (see above). */
export function decodePathToParts(pathname: string): string[] {
  return pathname
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function partsToPath(parts: string[]): string {
  if (parts.length === 0) return "/";
  return "/" + parts.map((p) => encodeURIComponent(p)).join("/");
}

export function partsToDecodedPath(parts: string[]): string {
  if (parts.length === 0) return "/";
  return "/" + parts.join("/");
}

/**
 * Resolve a cd target against currentPath.
 * currentPath: decoded pathname, e.g. "/a/b" or "/host hackathon"
 * target: decoded path string from user, e.g. "host hackathon", "../x", "/host hackathon/", "./xyz"
 * Returns canonical absolute decoded pathname (no trailing-slash distinction), always starts with "/".
 */
export function resolveCdPath(currentPath: string, target: string | null): string {
  return partsToDecodedPath(resolveCdParts(currentPath, target));
}

/** Canonical resolver returning parts (no "/" in elements) — shared representation */
export function resolveCdParts(currentPath: string, target: string | null): string[] {
  if (target == null || target.trim() === "") {
    return [];
  }
  const isAbsolute = target.startsWith("/");

  const baseParts = isAbsolute ? [] : decodePathToParts(currentPath);
  // the target is user-typed text — already literal, never percent-encoded
  const rawTargetParts = target.split("/");
  // Drop leading "" from absolute ("/a" -> ["","a"])
  const targetParts = isAbsolute && rawTargetParts.length && rawTargetParts[0] === "" ? rawTargetParts.slice(1) : rawTargetParts;

  const stack: string[] = [...baseParts];
  if (isAbsolute) stack.length = 0;
  for (const seg of targetParts) {
    const trimmed = seg.trim();
    if (trimmed === "" || trimmed === ".") continue;
    if (trimmed === "..") {
      if (stack.length > 0) stack.pop();
      continue;
    }
    stack.push(trimmed);
  }
  return stack;
}

/** Encode a decoded path for history.pushState: encode each segment but keep slashes */
export function encodePathForUrl(decodedPath: string): string {
  return partsToPath(decodePathToParts(decodedPath));
}

export function decodePath(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}
