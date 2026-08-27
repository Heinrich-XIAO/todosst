"use client";

// Utilities for the `!cd` command. Must handle:
// - absolute vs relative, "." and ".."
// - spaces without escaping, plus quoted forms cd "host hackathon"
// - trailing slash preservation: input ending with "/" -> output with "/" (except root)
// - encoding: each segment encoded for URL but keep "/" separators

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

/**
 * Resolve a cd target against currentPath.
 * currentPath: decoded pathname, e.g. "/a/b" or "/host hackathon"
 * target: decoded path string from user, e.g. "host hackathon", "../x", "/host hackathon/", "./xyz"
 * Returns absolute decoded pathname (possibly with trailing slash if requested or needed), always starts with "/".
 */
export function resolveCdPath(currentPath: string, target: string | null): string {
  if (target == null || target.trim() === "") {
    return "/";
  }
  const wantsTrailingSlash = target.endsWith("/");
  const isAbsolute = target.startsWith("/");

  let baseParts: string[];
  let targetParts: string[];

  if (isAbsolute) {
    baseParts = [];
    // drop leading "/" for target
    targetParts = target.split("/").map((p) => p);
    // first element will be "" due to leading slash
    if (targetParts.length && targetParts[0] === "") targetParts.shift();
  } else {
    // currentPath "/a/b" -> ["a","b"]
    const cur = currentPath.split("/").filter((p) => p.length > 0);
    // decode each part (usePathname already decoded, but be safe)
    baseParts = cur.map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });
    targetParts = target.split("/");
  }

  // Decode target parts except we need to keep "." ".." literal
  const decodedTargetParts = targetParts.map((p) => {
    // empty segments from "//" will be ""
    try {
      // don't decode "." or ".." though they have no encoding anyway
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });

  const stack: string[] = isAbsolute ? [] : [...baseParts];
  for (const seg of decodedTargetParts) {
    if (seg === "" || seg === ".") {
      // collapse // and .
      // but if seg is "" from double slash, ignore
      // For "./xyz" -> first seg "." ignored, next "xyz" pushed
      continue;
    }
    if (seg === "..") {
      if (stack.length > 0) stack.pop();
      continue;
    }
    stack.push(seg);
  }

  let resolved = "/" + stack.join("/");
  if (resolved !== "/" && wantsTrailingSlash) {
    resolved += "/";
  }
  // normalize multiple slashes? already handled
  // ensure "/" for empty
  if (resolved === "") resolved = "/";
  return resolved;
}

/** Encode a decoded path for history.pushState: encode each segment but keep slashes */
export function encodePathForUrl(decodedPath: string): string {
  const hasTrailingSlash = decodedPath.endsWith("/") && decodedPath !== "/";
  const parts = decodedPath.split("/").filter((p) => p.length > 0);
  const encoded = "/" + parts.map((p) => encodeURIComponent(p)).join("/");
  if (encoded !== "/" && hasTrailingSlash) return encoded + "/";
  return encoded;
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
  let rawArg = rest.trimStart();
  // If rawArg starts with quoted string, parseCdArg handles.
  // But for "!cd \"host hackathon\"" rawArg = "\"host hackathon\"" -> parseCdArg strips quotes.
  const parsed = parseCdArg(rawArg === "" ? null : rawArg);
  return { isCd: true, target: parsed };
}
