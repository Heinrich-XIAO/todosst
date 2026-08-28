"use client";

export function parseSlashPath(input: string): string[] | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const endsWithSlash = trimmed.length > 1 && trimmed.endsWith("/");
  let parts = trimmed
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return null;
  if (parts.length === 1 && !endsWithSlash) {
    const m = /^(\S+)\s+([\s\S]+?)\s*$/.exec(parts[0]);
    if (m && m[2]) parts = [m[1], m[2]];
  }
  if (parts.some((p) => p.length > 200)) return null;
  return parts;
}
