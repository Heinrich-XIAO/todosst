#!/usr/bin/env node
/**
 * Real-browser first-paint benchmark for todosst.
 *
 * Measures the thing a person actually waits for: how long after the navigation
 * starts until the first frame with visible content lands on screen. The clock
 * is the browser's own compositor, not a synthetic marker:
 *
 *   - every navigation is recorded with CDP Page.startScreencast (frames are
 *     emitted by the compositor as it paints)
 *   - each frame is decoded and compared against its own modal background
 *     colour, so "first thing you see" means at least 0.02% of the frame
 *     differs from the empty background
 *   - frame timestamps are wall-clock; each navigation's performance.timeOrigin
 *     is subtracted so the number is milliseconds from navigation start
 *
 * FCP, TTFB, LCP and load times are collected from the page as cross-checks —
 * if the pixel clock and the browser's FCP disagree by more than a frame or
 * two, the run is flagged.
 *
 * A production server is required (next build && next start). Dev-mode builds
 * are not comparable and the script does not try to use them.
 *
 * Usage (from the repo root):
 *
 *   bun run build
 *   ./node_modules/.bin/next start -p 3100 &
 *   node bench/load-bench.mjs --url http://127.0.0.1:3100/ --runs 5
 *
 * Throttling and browsing: CDP network emulation is applied per page. Chromium
 * exempts localhost from devtools throttling in some builds, so for realistic
 * numbers serve the app on a fake hostname that resolves to the server and pass
 * --map, e.g. `--map todosst.bench=127.0.0.1 --url http://todosst.bench:3100/`.
 * A non-localhost hostname also makes the service worker take its production
 * code path (cache-first static assets instead of the localhost dev path).
 *
 * Caveat: the target is plain HTTP, and service workers only run on secure
 * origins, so no service worker is active here (warm = browser cache, not the
 * cached app shell) and the cold pass does not pay for a TLS handshake. Both
 * are real costs on an HTTPS deployment; add roughly one RTT for TLS.
 *
 * Playwright + Chromium are needed:
 *   npx playwright install chromium     # or set CHROME_PATH=...
 *
 * Options:
 *   --url <url>          page to measure (default http://127.0.0.1:3100/)
 *   --runs <n>           repetitions per network, cold + warm (default 5)
 *   --networks <list>    comma list of none,fiber,4g,fast-3g (default all)
 *   --viewport <w>x<h>   viewport (default 390x844; mobile when width < 600)
 *   --map <host=ip>      comma list of Chromium host resolver rules
 *   --settle <ms>        extra time to keep recording after load (default 1200)
 *   --chrome <path>      Chromium executable (default CHROME_PATH or Playwright)
 *   --json <path>        write raw per-run samples
 *   --save-frames <dir>  save the first visible frame of every run
 *   --no-warm            skip the warm (second navigation, same context) pass
 */

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  const value = i >= 0 ? argv[i + 1] : undefined;
  return value && !value.startsWith("--") ? value : fallback;
};

const URL_TO_MEASURE = opt("url", "http://127.0.0.1:3100/");
const RUNS = Number(opt("runs", "5"));
const NETWORKS = opt("networks", "none,fiber,4g,fast-3g").split(",").map((s) => s.trim()).filter(Boolean);
const [vw, vh] = opt("viewport", "390x844").split("x").map(Number);
const VIEWPORT = { width: vw, height: vh };
const IS_MOBILE = VIEWPORT.width < 600;
const SETTLE_MS = Number(opt("settle", "1200"));
const JSON_OUT = opt("json", null);
const FRAME_DIR = opt("save-frames", null);
const WARM = !flag("no-warm");
const VERBOSE = flag("verbose");
const CHROME = opt("chrome", process.env.CHROME_PATH || "");
const MAPS = (opt("map", "") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// CDP network emulation, bytes per second + RTT. "none" is unthrottled.
const PROFILES = {
  none: null,
  fiber: { latency: 20, downloadThroughput: 6_250_000, uploadThroughput: 2_500_000 },
  "4g": { latency: 150, downloadThroughput: 500_000, uploadThroughput: 375_000 },
  "fast-3g": { latency: 562.5, downloadThroughput: 200_000, uploadThroughput: 93_750 },
};

// A frame counts as "visible" once this fraction of sampled pixels differs from
// the frame's own modal (background) colour. 0.02% of a 390x844 frame is ~66px:
// enough to ignore encoder noise, far below a text glyph or a 1px rule.
const VISIBLE_FRACTION = 0.0002;
const SAMPLE_STEP = 3;
// Pixel clock vs. browser FCP: anything beyond this is a measurement red flag.
const CLOCK_TOLERANCE_MS = 250;

const INIT_SCRIPT = () => {
  window.__bench = { timeOrigin: performance.timeOrigin, paint: [], lcp: 0 };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__bench.paint.push({ name: e.name, startTime: e.startTime });
    }).observe({ type: "paint", buffered: true });
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) window.__bench.lcp = Math.max(window.__bench.lcp, last.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {}
};

// Runs inside the decode page: returns what fraction of the frame is not the
// dominant background colour.
const DECODE_FRAME = async ({ base64, step }) => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const counts = new Map();
  let total = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      counts.set(key, (counts.get(key) || 0) + 1);
      total++;
    }
  }
  let bgKey = 0;
  let bgCount = -1;
  for (const [key, count] of counts) {
    if (count > bgCount) {
      bgCount = count;
      bgKey = key;
    }
  }
  const bgR = ((bgKey >> 8) & 15) * 17;
  const bgG = ((bgKey >> 4) & 15) * 17;
  const bgB = (bgKey & 15) * 17;
  let changed = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const delta = Math.abs(data[i] - bgR) + Math.abs(data[i + 1] - bgG) + Math.abs(data[i + 2] - bgB);
      if (delta > 48) changed++;
    }
  }
  bitmap.close();
  return { fraction: total ? changed / total : 0 };
};

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

const fmt = (v) => (v === null || v === undefined || Number.isNaN(v) ? "—" : `${Math.round(v)}`);

async function waitForServiceWorker(page) {
  // A real returning visitor is controlled by the service worker, so the warm
  // pass waits for it: skipWaiting() + clients.claim() can land a beat after
  // the load event, and a navigation before that measures plain HTTP cache.
  try {
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const sw = navigator.serviceWorker;
          if (!sw) return resolve(false);
          const deadline = Date.now() + 8000;
          const tick = () => {
            if (sw.controller) return resolve(true);
            if (Date.now() > deadline) return resolve(false);
            setTimeout(tick, 100);
          };
          sw.ready.then(tick, tick);
        })
    );
  } catch {
    // page went away — the next navigation is measured without a controller
  }
}

async function traceNavigation({ context, decodePage, networkName, mode, runIndex }) {
  const page = await context.newPage();
  await page.addInitScript(INIT_SCRIPT);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Page.enable");
  await cdp.send("Network.enable");
  const profile = PROFILES[networkName];
  if (profile) {
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: profile.latency,
      downloadThroughput: profile.downloadThroughput,
      uploadThroughput: profile.uploadThroughput,
    });
  }

  const frames = [];
  cdp.on("Page.screencastFrame", (frame) => {
    frames.push({ timestamp: frame.metadata.timestamp, data: frame.data });
    cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "png",
    maxWidth: VIEWPORT.width,
    maxHeight: VIEWPORT.height,
    everyNthFrame: 1,
  });

  let responseStatus = 0;
  let failure = null;
  try {
    const response = await page.goto(URL_TO_MEASURE, { waitUntil: "load", timeout: 90_000 });
    responseStatus = response ? response.status() : 0;
    await page.waitForTimeout(SETTLE_MS);
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
  }

  await cdp.send("Page.stopScreencast").catch(() => {});

  let metrics = null;
  if (!failure) {
    metrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const resources = performance.getEntriesByType("resource");
      return {
        timeOrigin: window.__bench?.timeOrigin ?? performance.timeOrigin,
        paint: window.__bench?.paint ?? [],
        lcp: window.__bench?.lcp ?? 0,
        nav: nav
          ? {
              responseStart: nav.responseStart,
              responseEnd: nav.responseEnd,
              domContentLoaded: nav.domContentLoadedEventEnd,
              load: nav.loadEventEnd,
              transferSize: nav.transferSize,
            }
          : null,
        resourceCount: resources.length,
        resourceKB: Math.round(resources.reduce((sum, r) => sum + (r.transferSize || 0), 0) / 1024),
        controller: !!navigator.serviceWorker?.controller,
        title: document.title,
        hasHeader: !!document.querySelector("header"),
        bodyText: (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 120),
        resources: resources.map((r) => ({
          name: r.name.replace(location.origin, ""),
          start: Math.round(r.startTime),
          dur: Math.round(r.duration),
          size: r.transferSize || 0,
          type: r.initiatorType,
        })),
      };
    });
  }

  // Pixel clock. Frames captured before this navigation started belong to the
  // previous document, so they are dropped (a fresh page makes that a no-op).
  let firstVisible = null;
  let firstVisibleFrame = null;
  const frameSamples = [];
  if (metrics) {
    for (const frame of frames) {
      const at = frame.timestamp * 1000 - metrics.timeOrigin;
      if (at < -40) continue;
      const { fraction } = await decodePage.evaluate(DECODE_FRAME, { base64: frame.data, step: SAMPLE_STEP });
      frameSamples.push({ at: Math.round(at), fraction: Number(fraction.toFixed(4)) });
      if (firstVisible === null && fraction >= VISIBLE_FRACTION) {
        firstVisible = at;
        firstVisibleFrame = frame;
        if (!VERBOSE) break;
      }
    }
  }

  if (FRAME_DIR && firstVisibleFrame) {
    await mkdir(FRAME_DIR, { recursive: true });
    const name = `${networkName}-${mode}-${runIndex}.png`;
    await writeFile(path.join(FRAME_DIR, name), Buffer.from(firstVisibleFrame.data, "base64"));
  }

  const fcpEntry = metrics?.paint.find((e) => e.name === "first-contentful-paint");
  const fcp = fcpEntry ? fcpEntry.startTime : null;
  const row = {
    network: networkName,
    mode,
    run: runIndex,
    status: responseStatus,
    totalMs: firstVisible,
    fcpMs: fcp,
    lcpMs: metrics ? metrics.lcp : null,
    htmlMs: metrics?.nav?.responseEnd ?? null,
    ttfbMs: metrics?.nav?.responseStart ?? null,
    loadMs: metrics?.nav?.load ?? null,
    resourceKB: metrics?.resourceKB ?? null,
    resourceCount: metrics?.resourceCount ?? null,
    controlled: metrics?.controller ?? false,
    title: metrics?.title ?? "",
    hasHeader: metrics?.hasHeader ?? false,
    bodyText: metrics?.bodyText ?? "",
    resources: metrics?.resources ?? [],
    frames: frameSamples,
    error: failure,
  };
  if (VERBOSE) {
    console.log(
      `\n${networkName}/${mode}/${runIndex}: first-visible ${fmt(firstVisible)}ms, FCP ${fmt(fcp)}ms, LCP ${fmt(row.lcpMs)}ms, TTFB ${fmt(row.ttfbMs)}ms, load ${fmt(row.loadMs)}ms, ` +
        `SW ${row.controlled ? "controlling" : "not controlling"}, KB ${fmt(row.resourceKB)}`
    );
    console.log(`  frames: ${frameSamples.map((s) => `${s.at}ms:${(s.fraction * 100).toFixed(2)}%`).join("  ")}`);
    for (const r of [...row.resources].sort((a, b) => a.start - b.start)) {
      console.log(`  start ${String(r.start).padStart(5)}ms  dur ${String(r.dur).padStart(5)}ms  ${String(r.size).padStart(7)}B  ${r.type.padEnd(8)} ${r.name}`);
    }
  }
  await page.close().catch(() => {});
  return row;
}

async function main() {
  for (const name of NETWORKS) {
    if (!(name in PROFILES)) throw new Error(`unknown network "${name}" (have ${Object.keys(PROFILES).join(", ")})`);
  }

  const launchOptions = {
    args: [
      "--no-sandbox",
      ...(MAPS.length ? [`--host-resolver-rules=${MAPS.map((m) => `MAP ${m.replace("=", " ")}`).join(", ")}`] : []),
    ],
  };
  if (CHROME) launchOptions.executablePath = CHROME;

  let browser;
  try {
    browser = await chromium.launch(launchOptions);
  } catch (err) {
    throw new Error(
      `could not launch Chromium (${err instanceof Error ? err.message.split("\n")[0] : err}).\n` +
        `Install it with "npx playwright install chromium", or point CHROME_PATH / --chrome at a Chromium/Chrome binary.`
    );
  }

  const decodeContext = await browser.newContext();
  const decodePage = await decodeContext.newPage();
  await decodePage.goto("about:blank");

  const rows = [];
  const contextOptions = {
    viewport: VIEWPORT,
    screen: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "UTC",
    isMobile: IS_MOBILE,
    hasTouch: IS_MOBILE,
  };

  try {
    for (const network of NETWORKS) {
      for (let run = 1; run <= RUNS; run++) {
        // A fresh context is a cold cache, a fresh profile, no service worker.
        const context = await browser.newContext(contextOptions);
        try {
          const cold = await traceNavigation({ context, decodePage, networkName: network, mode: "cold", runIndex: run });
          rows.push(cold);

          if (WARM) {
            // Warm = same profile, second navigation in a new tab: HTTP cache
            // and (once installed) the service worker are in play, which is
            // what a returning visitor gets.
            const warmPage = await context.newPage();
            await warmPage.goto(URL_TO_MEASURE, { waitUntil: "load", timeout: 90_000 }).catch(() => {});
            await waitForServiceWorker(warmPage);
            await warmPage.close().catch(() => {});
            const warm = await traceNavigation({ context, decodePage, networkName: network, mode: "warm", runIndex: run });
            rows.push(warm);
          }
        } finally {
          await context.close().catch(() => {});
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const failures = rows.filter((r) => r.error || r.status !== 200);
  const blanks = rows.filter((r) => !r.error && r.totalMs === null);
  const headerMissing = rows.filter(
    (r) => !r.error && r.totalMs !== null && !(r.hasHeader && /todosst/i.test(r.title))
  );

  console.log(`\nfirst visible paint — ${URL_TO_MEASURE}`);
  console.log(`viewport ${VIEWPORT.width}x${VIEWPORT.height}${IS_MOBILE ? " (mobile)" : ""}, ${RUNS} runs per network, ${SETTLE_MS}ms settle after load\n`);
  const columns = [
    { label: "network", width: 9, align: "left" },
    { label: "mode", width: 6, align: "left" },
    { label: "n", width: 3, align: "right" },
    { label: "visible p50", width: 12, align: "right" },
    { label: "visible p95", width: 12, align: "right" },
    { label: "visible max", width: 12, align: "right" },
    { label: "FCP p50", width: 9, align: "right" },
    { label: "LCP p50", width: 9, align: "right" },
    { label: "HTML p50", width: 9, align: "right" },
    { label: "load p50", width: 9, align: "right" },
    { label: "KB", width: 6, align: "right" },
  ];
  const cell = (value, col) => (col.align === "left" ? value.padEnd(col.width) : value.padStart(col.width));
  console.log(columns.map((c) => cell(c.label, c)).join(" "));
  console.log(columns.map((c) => "-".repeat(c.width)).join(" "));

  for (const network of NETWORKS) {
    for (const mode of WARM ? ["cold", "warm"] : ["cold"]) {
      const group = rows.filter((r) => r.network === network && r.mode === mode && !r.error && r.totalMs !== null);
      if (group.length === 0) {
        console.log(columns.map((c) => cell("—", c)).join(" "));
        continue;
      }
      const visible = group.map((r) => r.totalMs);
      const fcp = group.map((r) => r.fcpMs).filter((v) => v !== null);
      const lcp = group.map((r) => r.lcpMs).filter((v) => v !== null && v > 0);
      const html = group.map((r) => r.htmlMs).filter((v) => v !== null);
      const load = group.map((r) => r.loadMs).filter((v) => v !== null);
      const kb = group.map((r) => r.resourceKB).filter((v) => v !== null);
      const values = [
        network,
        mode,
        String(group.length),
        fmt(percentile(visible, 50)),
        fmt(percentile(visible, 95)),
        fmt(Math.max(...visible)),
        fmt(percentile(fcp, 50)),
        fmt(percentile(lcp, 50)),
        fmt(percentile(html, 50)),
        fmt(percentile(load, 50)),
        fmt(percentile(kb, 50)),
      ];
      console.log(columns.map((c, i) => cell(values[i], c)).join(" "));
    }
  }
  console.log("\nall times in ms; p50/p95 over the runs listed. KB = decoded resource bytes.");

  if (JSON_OUT) {
    await mkdir(path.dirname(JSON_OUT), { recursive: true });
    await writeFile(
      JSON_OUT,
      JSON.stringify(
        {
          url: URL_TO_MEASURE,
          viewport: VIEWPORT,
          runs: RUNS,
          settleMs: SETTLE_MS,
          measuredAt: new Date().toISOString(),
          rows,
        },
        null,
        2
      )
    );
    console.log(`raw samples: ${JSON_OUT}`);
  }

  // Accuracy self-check: the compositor clock and the browser's own FCP should
  // describe the same paint. A large gap means the pixel detector is lying.
  const clockPairs = rows
    .filter((r) => !r.error && r.totalMs !== null && r.fcpMs !== null)
    .map((r) => Math.abs(r.fcpMs - r.totalMs));
  if (clockPairs.length > 0) {
    const p50 = percentile(clockPairs, 50);
    const max = Math.max(...clockPairs);
    console.log(`\nclock check: |pixel paint − FCP| p50 ${Math.round(p50)}ms, max ${Math.round(max)}ms`);
    if (max > CLOCK_TOLERANCE_MS) {
      console.log(`⚠️  pixel clock and FCP disagree by more than ${CLOCK_TOLERANCE_MS}ms in at least one run`);
    }
  }

  if (failures.length || blanks.length || headerMissing.length) {
    if (failures.length) console.log(`\n❌ ${failures.length} run(s) failed to load: ${failures[0].error || `HTTP ${failures[0].status}`}`);
    if (blanks.length) console.log(`❌ ${blanks.length} run(s) painted nothing before the recording stopped`);
    if (headerMissing.length) console.log(`❌ ${headerMissing.length} run(s) loaded something that is not todosst: "${headerMissing[0].bodyText}"`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exitCode = 1;
});
