"use client";

// On-device embedding model — Transformers.js + MiniLM, lazy and defensive.
//
// Lifecycle: nothing loads at import. `warmEmbeddings()` (fire-and-forget on
// app load) starts the ~23MB quantized download in the background;
// `embed(texts)` awaits readiness then returns L2-normalized 384-dim vectors.
// Every failure path resolves null — the bandit policy is the permanent
// fallback, so the app never depends on the model. Dynamic import keeps the
// ~1MB transformers runtime out of the initial bundle.

const MODEL_ID = "onnx-community/all-MiniLM-L6-v2-ONNX";
const EMBED_TIMEOUT_MS = 10_000;

type Extractor = (texts: string | string[], opts?: Record<string, unknown>) => Promise<{ tolist(): number[][] }>;

let extractorPromise: Promise<Extractor> | null = null;
let failed = false;

async function loadExtractor(): Promise<Extractor> {
  // dynamic import: transformers + onnxruntime stay out of the main bundle
  // until first use, and never touch SSR (callers are client effects)
  const { pipeline, env } = await import("@huggingface/transformers");
  try {
    // keep model files out of the default shared cache dir
    env.allowLocalModels = false;
  } catch {}
  // quantized first (~23MB); fall back to full precision on failure
  try {
    return (await pipeline("feature-extraction", MODEL_ID, { dtype: "q8" })) as unknown as Extractor;
  } catch {
    return (await pipeline("feature-extraction", MODEL_ID)) as unknown as Extractor;
  }
}

function getExtractor(): Promise<Extractor> | null {
  if (failed || typeof window === "undefined") return null;
  if (!extractorPromise) {
    extractorPromise = loadExtractor().catch((e) => {
      failed = true;
      extractorPromise = null;
      throw e;
    });
  }
  return extractorPromise;
}

/** Start downloading the model in the background. Never throws. */
export function warmEmbeddings(): void {
  try {
    const p = getExtractor();
    if (p) void p.catch(() => {});
  } catch {}
}

/** True once the model is ready (for gating kNN without waiting). */
export function embeddingsReady(): boolean {
  return extractorPromise !== null && !failed;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error("embed timeout")), ms);
    p.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    );
  });
}

/**
 * Embed one or more texts. Returns null on any failure (model not ready,
 * download blocked, timeout) — callers must fall back, never surface errors.
 */
export async function embed(texts: string[]): Promise<number[][] | null> {
  try {
    const p = getExtractor();
    if (!p) return null;
    const clean = texts.map((t) => t.slice(0, 512));
    const extractor = await withTimeout(p, EMBED_TIMEOUT_MS);
    const out = await withTimeout(
      extractor(clean, { pooling: "mean", normalize: true }),
      EMBED_TIMEOUT_MS
    );
    const rows = out.tolist();
    if (!Array.isArray(rows) || rows.length !== clean.length) return null;
    return rows;
  } catch {
    return null;
  }
}

export async function embedOne(text: string): Promise<number[] | null> {
  const rows = await embed([text]);
  return rows?.[0] ?? null;
}
