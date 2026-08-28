// @ts-nocheck — runs under `bun test` (bun:test types not installed)
import { test, expect } from "bun:test";
import {
  decodePath,
  decodePathToParts,
  encodePathForUrl,
  parseBangCd,
  parseCdArg,
  partsToDecodedPath,
  partsToPath,
  resolveCdParts,
  resolveCdPath,
} from "./cdPath";

test("parseCdArg strips surrounding quotes", () => {
  expect(parseCdArg(null)).toBeNull();
  expect(parseCdArg("")).toBeNull();
  expect(parseCdArg("   ")).toBeNull();
  expect(parseCdArg('"host hackathon"')).toBe("host hackathon");
  expect(parseCdArg("'host hackathon'")).toBe("host hackathon");
  // a lone quote satisfies both start/end checks and is returned as-is
  expect(parseCdArg('"')).toBe('"');
  expect(parseCdArg("host hackathon")).toBe("host hackathon");
});

test("decodePathToParts normalizes slashes and percent-encoding", () => {
  expect(decodePathToParts("/")).toEqual([]);
  expect(decodePathToParts("")).toEqual([]);
  expect(decodePathToParts("/a/b")).toEqual(["a", "b"]);
  expect(decodePathToParts("//a//b/")).toEqual(["a", "b"]);
  expect(decodePathToParts("/a%20b")).toEqual(["a b"]);
  // invalid encoding falls back to the raw segment
  expect(decodePathToParts("/a%zz")).toEqual(["a%zz"]);
  expect(decodePathToParts("/  a  ")).toEqual(["a"]);
});

test("partsToPath encodes segments and round-trips", () => {
  expect(partsToPath([])).toBe("/");
  expect(partsToPath(["a"])).toBe("/a");
  expect(partsToPath(["host hackathon", "sub dir"])).toBe("/host%20hackathon/sub%20dir");
  expect(decodePathToParts(partsToPath(["host hackathon", "sub dir"]))).toEqual(["host hackathon", "sub dir"]);
});

test("partsToDecodedPath keeps literal spaces", () => {
  expect(partsToDecodedPath([])).toBe("/");
  expect(partsToDecodedPath(["host hackathon"])).toBe("/host hackathon");
});

test("resolveCdParts handles absolute, relative, dot and dotdot", () => {
  expect(resolveCdParts("/a/b", null)).toEqual([]);
  expect(resolveCdParts("/a/b", "")).toEqual([]);
  expect(resolveCdParts("/a/b", "/")).toEqual([]);
  expect(resolveCdParts("/a/b", "c")).toEqual(["a", "b", "c"]);
  expect(resolveCdParts("/a/b", "./c")).toEqual(["a", "b", "c"]);
  expect(resolveCdParts("/a/b", "..")).toEqual(["a"]);
  expect(resolveCdParts("/a/b", "../..")).toEqual([]);
  expect(resolveCdParts("/a/b", "../..")).toEqual([]);
  // ".." at root stays at root
  expect(resolveCdParts("/", "../../x")).toEqual(["x"]);
  expect(resolveCdParts("/a/b", "/c/d")).toEqual(["c", "d"]);
  // empty segments collapse
  expect(resolveCdParts("/a/b", "c//d/")).toEqual(["a", "b", "c", "d"]);
});

test("resolveCdPath joins resolved parts", () => {
  expect(resolveCdPath("/a/b", "../c")).toBe("/a/c");
  expect(resolveCdPath("/host hackathon", "outreach")).toBe("/host hackathon/outreach");
});

test("encodePathForUrl round-trips decoded paths", () => {
  expect(encodePathForUrl("/host hackathon")).toBe("/host%20hackathon");
  expect(decodePath(encodePathForUrl("/host hackathon/x"))).toBe("/host hackathon/x");
});

test("decodePath falls back on invalid encoding", () => {
  expect(decodePath("/a%20b")).toBe("/a b");
  expect(decodePath("/a%zz")).toBe("/a%zz");
});

test("parseBangCd accepts cd variants and rejects lookalikes", () => {
  expect(parseBangCd("add task")).toEqual({ isCd: false, target: null });
  expect(parseBangCd("!")).toEqual({ isCd: false, target: null });
  expect(parseBangCd("!help")).toEqual({ isCd: false, target: null });
  expect(parseBangCd("!cdf x")).toEqual({ isCd: false, target: null });
  expect(parseBangCd("!cd")).toEqual({ isCd: true, target: null });
  expect(parseBangCd("!cd ")).toEqual({ isCd: true, target: null });
  expect(parseBangCd("!cd host hackathon")).toEqual({ isCd: true, target: "host hackathon" });
  expect(parseBangCd("!cd /a/b/")).toEqual({ isCd: true, target: "/a/b/" });
  expect(parseBangCd('!cd "host hackathon"')).toEqual({ isCd: true, target: "host hackathon" });
  expect(parseBangCd("!cd 'x'")).toEqual({ isCd: true, target: "x" });
  // matching is case-sensitive: only lowercase "cd" counts
  expect(parseBangCd("!CD /A")).toEqual({ isCd: false, target: null });
});
