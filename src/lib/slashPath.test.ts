// @ts-nocheck — runs under `bun test` (bun:test types not installed)
import { test, expect } from "bun:test";
import { parseSlashPath } from "./slashPath";

test("single-word segment stays a single part", () => {
  expect(parseSlashPath("/grocery")).toEqual(["grocery"]);
});

test("no interior slash: first word is the dir, rest is the task", () => {
  expect(parseSlashPath("/grocery coffee beans (the good ones)")).toEqual([
    "grocery",
    "coffee beans (the good ones)",
  ]);
});

test("extra whitespace after the first word is trimmed", () => {
  expect(parseSlashPath("/grocery   coffee beans (the good ones) ")).toEqual([
    "grocery",
    "coffee beans (the good ones)",
  ]);
});

test("explicit slash still delimits multi-word dirs", () => {
  expect(parseSlashPath("/host hackathon/ get venue")).toEqual(["host hackathon", "get venue"]);
});

test("deep paths keep explicit segments", () => {
  expect(parseSlashPath("/host hackathon/outreach write email template")).toEqual([
    "host hackathon",
    "outreach write email template",
  ]);
});

test("trailing slash keeps a spaced segment whole (bare dir)", () => {
  expect(parseSlashPath("/host hackathon/")).toEqual(["host hackathon"]);
});

test("trims segments and collapses empty ones", () => {
  expect(parseSlashPath("  /  a  //  b c  /  ")).toEqual(["a", "b c"]);
});

test("rejects non-slash and empty input", () => {
  expect(parseSlashPath("grocery coffee")).toBeNull();
  expect(parseSlashPath("/")).toBeNull();
  expect(parseSlashPath("/   ")).toBeNull();
  expect(parseSlashPath("")).toBeNull();
});

test("rejects overly long segments", () => {
  expect(parseSlashPath("/" + "x".repeat(201))).toBeNull();
  expect(parseSlashPath("/a/" + "x".repeat(201))).toBeNull();
});
