"use client";

// Task-vibe math — pure functions, no model dependency (fully unit-testable).
//
// The timing model is k-nearest-neighbors over on-device embeddings, not a
// gradient-trained net: with ~1 label a day there is nothing to train, and kNN
// gives exactly the wanted semantics — a single label acts as ground truth
// (similarity 1.0 to itself wins), similar-vibe tasks share timing via cosine
// similarity, and there is no parametric model to collapse into memorization.
// Augmentation densifies each label's neighborhood instead.

export const VIBE_MIN_SIM = 0.75;
export const VIBE_K = 3;

export type VibeLabel = {
  vec: number[];
  /** best hour of day for this vibe, 0–23 */
  hour: number;
  at: number;
  augmented?: boolean;
};

/** Cosine similarity. Defensive: mismatched/empty/zero vectors score 0, never throw. */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na <= 0 || nb <= 0) return 0;
  const s = dot / Math.sqrt(na * nb);
  return Math.min(1, Math.max(-1, s));
}

/**
 * Circular mean of hours (0–23), weighted. Plain averaging breaks across
 * midnight (23:00 + 01:00 would give 12:00); angles fix that. Returns an
 * integer hour.
 */
export function circularMeanHour(items: { hour: number; weight?: number }[]): number {
  let sx = 0;
  let sy = 0;
  let total = 0;
  for (const it of items) {
    const w = it.weight ?? 1;
    if (!Number.isFinite(it.hour) || !(w > 0)) continue;
    const a = ((Math.floor(it.hour) % 24 + 24) % 24) / 24;
    const rad = a * 2 * Math.PI;
    sx += Math.cos(rad) * w;
    sy += Math.sin(rad) * w;
    total += w;
  }
  if (total <= 0) return 9;
  let deg = (Math.atan2(sy, sx) / (2 * Math.PI)) * 24;
  if (deg < 0) deg += 24;
  return Math.round(deg) % 24;
}

/**
 * Best delivery hour for an embedding from labeled neighbors.
 * Returns null when nothing is similar enough — the caller falls back to the
 * contextual bandit. `sim` is the top similarity (the confidence signal).
 */
export function nearestHour(
  vec: ArrayLike<number>,
  labels: VibeLabel[],
  k: number = VIBE_K,
  minSim: number = VIBE_MIN_SIM
): { hour: number; sim: number } | null {
  const scored: { hour: number; sim: number }[] = [];
  for (const l of labels) {
    if (!Array.isArray(l.vec) || l.vec.length === 0) continue;
    if (!Number.isFinite(l.hour)) continue;
    const sim = cosineSimilarity(vec, l.vec);
    if (sim >= minSim) scored.push({ hour: Math.floor(l.hour) % 24, sim });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.sim - a.sim);
  const top = scored.slice(0, Math.max(1, Math.floor(k)));
  return {
    hour: circularMeanHour(top.map((t) => ({ hour: t.hour, weight: Math.max(0, t.sim) }))),
    sim: top[0].sim,
  };
}

/** Cheap content hash to invalidate cached vectors when a title changes. */
export function hashTitle(title: string): string {
  let h = 5381;
  const s = title.normalize("NFC");
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/**
 * Deterministic surface variants of a task title, embedded alongside the
 * original so one label covers its neighborhood (case/punctuation/phrasing
 * wobble). A paraphrasing LLM can replace/extend this later — the store
 * treats every variant as just another neighbor with the same hour.
 */
export function augmentTitle(title: string): string[] {
  const base = title.trim().replace(/\s+/g, " ");
  if (!base) return [];
  const lower = base.toLowerCase();
  const out = new Set<string>();
  const add = (s: string) => {
    const t = s.trim().replace(/\s+/g, " ");
    if (t && t !== base) out.add(t);
  };
  add(lower);
  add(base.replace(/[!?….,;:]+$/u, ""));
  add(lower.replace(/[!?….,;:]+$/u, ""));
  if (/^(please|pls)\b/i.test(base)) add(base.replace(/^(please|pls)\b\s*/i, ""));
  else add(`please ${lower}`);
  add(`need to ${lower.replace(/^(to\s+)/i, "")}`);
  return Array.from(out).slice(0, 5);
}
