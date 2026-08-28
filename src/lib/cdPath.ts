"use client";

// Utilities for the `!cd` command. Canonical representation is a list of path segments
// (string[] with no "/" symbols) — e.g. "/haven" and "/haven/" both normalize to ["haven"].
// Handles: absolute vs relative, "." and "..", spaces without escaping,
// quoted forms cd "host hackathon", and // collapse.

export function parseCdArg(rawAfterCd: string | null | undefined): string | null {
  if (rawAfterCd == null) return null;
  let s = rawAfterCd.trim();
  if (s === "") return null; // treat as root
  // strip surrounding quotes if present (single or double)
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    if (s.length >= 2) s = s.slice(1, -1);
    // keep inner exactly, don't trim again? Trim to be forgiving.
    // but we will return as-is for path resolution (inner may have leading/trailing spaces intentionally?)
    return s;
  }
  // Also handle case where arg is quoted but with extra spaces outside: already trimmed.
  // If arg starts with quote but not ends (unclosed), strip leading quote only
  if ((s.startsWith('"') || s.startsWith("'")) && s.length === 1) return "";
  if (s.startsWith('"') || s.startsWith("'")) {
    // try to find matching closing quote at end of first quoted segment?
    // For cd, the entire path after cd is the arg, so we just strip outer if both present above.
    // If not both, maybe user typed "host hackathon" with quotes around but we already handled.
    // Otherwise return as-is.
  }
  return s;
}

/** Shared representation: list of segments with no "/" — e.g. [] for "/", ["haven"], ["host hackathon"] */
export function decodePathToParts(pathname: string): string[] {
  return pathname
    .split("/")
    .map((s) => {
      try {
        return decodeURIComponent(s).trim();
      } catch {
        return s.trim();
      }
    })
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
  const rawTargetParts = target.split("/").map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
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

/**
 * Parse full "!cd ..." command line.
 * Input: full trimmed line starting with "!" e.g. "!cd /host hackathon/" or "!cd host hackathon"
 * Returns absolute decoded target or null if not a cd command.
 */
export function parseBangCd(input: string): { isCd: boolean; target: string | null } {
  const trimmed = input.trim();
  if (!trimmed.startsWith("!")) return { isCd: false, target: null };
  const afterBang = trimmed.slice(1).trimStart();
  // must start with "cd"
  if (!afterBang.startsWith("cd")) return { isCd: false, target: null };
  const rest = afterBang.slice(2);
  // "cd" must be followed by space, end, or quote? Allow "cd/"? we require separator
  if (rest.length > 0 && !/^[\s"'\/]/.test(rest) && rest[0] !== "") {
    // e.g. "!cdf" not cd
    return { isCd: false, target: null };
  }
  // rawArg is rest trimmed start -- includes leading spaces etc.
  // We want everything after "cd" as arg; e.g. "cd /host hackathon/"
  const rawArg = rest.trimStart();
  // If rawArg starts with quoted string, parseCdArg handles.
  // But for "!cd \"host hackathon\"" rawArg = "\"host hackathon\"" -> parseCdArg strips quotes.
  const parsed = parseCdArg(rawArg === "" ? null : rawArg);
  return { isCd: true, target: parsed };
}
