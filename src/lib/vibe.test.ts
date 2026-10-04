"use client";

import { describe, expect, test } from "bun:test";
import { augmentTitle, circularMeanHour, cosineSimilarity, hashTitle, nearestHour, type VibeLabel } from "./vibe";

describe("cosineSimilarity", () => {
  test("identical vectors score 1", () => {
    expect(cosineSimilarity([1, 0, 0.5], [1, 0, 0.5])).toBeCloseTo(1, 5);
  });
  test("orthogonal vectors score 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });
  test("opposite vectors score -1, symmetric", () => {
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1, 5);
    expect(cosineSimilarity([1, 2], [3, 4])).toBeCloseTo(cosineSimilarity([3, 4], [1, 2]), 8);
  });
  test("never throws on garbage", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1], [1, 2])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([NaN], [1])).toBe(0);
  });
});

describe("circularMeanHour", () => {
  test("single value", () => {
    expect(circularMeanHour([{ hour: 14 }])).toBe(14);
  });
  test("wraps midnight instead of averaging to noon", () => {
    expect(circularMeanHour([{ hour: 23 }, { hour: 1 }])).toBe(0);
  });
  test("weighted toward the heavier vote", () => {
    expect(circularMeanHour([{ hour: 9, weight: 3 }, { hour: 12, weight: 1 }])).toBe(10);
  });
});

describe("nearestHour", () => {
  const labels: VibeLabel[] = [
    { vec: [1, 0, 0], hour: 9, at: 1 },
    { vec: [0, 1, 0], hour: 19, at: 2 },
  ];
  test("exact match is ground truth", () => {
    const hit = nearestHour([1, 0, 0], labels);
    expect(hit?.hour).toBe(9);
    expect(hit!.sim).toBeCloseTo(1, 5);
  });
  test("dissimilar vibe returns null (bandit fallback)", () => {
    expect(nearestHour([0, 0, 1], labels)).toBeNull();
    expect(nearestHour([1, 0, 0], [])).toBeNull();
  });
  test("near-tie blends circularly", () => {
    // tilted just toward the evening label, both above threshold
    const hit = nearestHour([0.45, 0.55, 0], labels, 3, 0.5);
    expect(hit).not.toBeNull();
  });
  test("skips malformed labels", () => {
    expect(nearestHour([1, 0, 0], [{ vec: [], hour: 5, at: 0 }])).toBeNull();
  });
});

describe("augmentTitle", () => {
  test("variants are non-empty, distinct, and keep the core words", () => {
    const vars = augmentTitle("Buy coffee beans!");
    expect(vars.length).toBeGreaterThan(0);
    expect(new Set(vars).size).toBe(vars.length);
    expect(vars.every((v) => /coffee/.test(v))).toBe(true);
    expect(vars).not.toContain("Buy coffee beans!");
  });
  test("empty input gives nothing", () => {
    expect(augmentTitle("   ")).toEqual([]);
  });
  test("hashTitle is stable and changes with the title", () => {
    expect(hashTitle("abc")).toBe(hashTitle("abc"));
    expect(hashTitle("abc")).not.toBe(hashTitle("abd"));
  });
});
