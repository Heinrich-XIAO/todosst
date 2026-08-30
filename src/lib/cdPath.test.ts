// @ts-nocheck — runs under `bun test` (bun:test types not installed)
import { test, expect } from "bun:test";
import {
  decodePath,
  decodePathToParts,
  encodePathForUrl,
  partsToDecodedPath,
  partsToPath,
  resolveCdParts,
  resolveCdPath,
} from "./cdPath";

test("decodePathToParts normalizes slashes (input is already percent-decoded)", () => {
  expect(decodePathToParts("/")).toEqual([]);
  expect(decodePathToParts("")).toEqual([]);
  expect(decodePathToParts("/a/b")).toEqual(["a", "b"]);
  expect(decodePathToParts("//a//b/")).toEqual(["a", "b"]);
  // segments are literal — percent-decoding happens once at the URL boundary
  // (titles may legitimately contain "%", e.g. "50%20off")
  expect(decodePathToParts("/a%20b")).toEqual(["a%20b"]);
  expect(decodePathToParts("/  a  ")).toEqual(["a"]);
});

test("partsToPath encodes segments and round-trips", () => {
  expect(partsToPath([])).toBe("/");
  expect(partsToPath(["a"])).toBe("/a");
  expect(partsToPath(["host hackathon", "sub dir"])).toBe("/host%20hackathon/sub%20dir");
  // full URL round trip: encode -> percent-decode at the boundary -> parts
  expect(decodePathToParts(decodePath(partsToPath(["host hackathon", "sub dir"])))).toEqual(["host hackathon", "sub dir"]);
  // a literal "%20" inside a title survives the round trip
  expect(decodePathToParts(decodePath(partsToPath(["50%20off"])))).toEqual(["50%20off"]);
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
