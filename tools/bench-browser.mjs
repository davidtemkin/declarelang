// tools/bench-browser.mjs — stage-by-stage benchmarks of the IN-BROWSER compile
// path, against a real deployment (network latency included) or a local server.
//
//   node tools/bench-browser.mjs [baseUrl] [--runs N] [--json]
//
// Drives real Chrome (headless) at each app page and reads the `declare:*`
// performance measures boot-uniform.js / compiler-client.js write, plus the
// browser's own paint and resource timings. For every app it reports:
//
//   FIRST LOAD  — a fresh browser context (empty HTTP cache, no service worker,
//                 no CacheStorage): the cold slow path — compiler download +
//                 in-browser compile (typecheck included) — to first paint.
//   SECOND LOAD — a reload in the same context: the service worker and the
//                 compiled-output cache are live — the fast path (closure
//                 re-probe, NO compiler, NO compile) to first paint.
//
// Stages are on the one performance timeline (startTime relative to navigation
// start), so overlapping work — the compiler load and the source fetch run in
// parallel — reads as a real waterfall. Medians across --runs (default 3).

import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const BASE = args.find((a) => !a.startsWith("--")) ?? "https://davidtemkin.github.io/declarelang/";
const RUNS = Number(args[args.indexOf("--runs") + 1]) || 3;
const JSON_OUT = args.includes("--json");

const APPS = [
  { name: "site (homepage)", path: "" },
  // Reached by its PROGRAM URL via browse-to-run — so the measurement installs the
  // service worker first (homepage), exactly as a real visitor arrives. Directories
  // no longer serve a page (design/hosting.md).
  { name: "calendar", path: "examples/calendar/calendar.declare", browseToRun: true },
];

// The fetches worth itemizing on a cold load, by URL substring.
const RESOURCES = [
  ["compiler bundle", "declare-compiler.js"],
  ["app source", ".declare"],
  ["version.json", "version.json"],
  ["library manifest", "autoincludes.json"],
  ["library index", "library/index.json"],
];

function findChrome() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
}

/** Everything the page can tell us once __declarePerf completes. */
async function collect(page) {
  return page.evaluate(async () => {
    const perf = await window.__declarePerf.done;
    const nav = performance.getEntriesByType("navigation")[0];
    const paint = {};
    for (const p of performance.getEntriesByType("paint")) paint[p.name] = +p.startTime.toFixed(1);
    const resources = performance.getEntriesByType("resource").map((r) => ({
      url: r.name,
      start: +r.startTime.toFixed(1),
      dur: +r.duration.toFixed(1),
      transfer: r.transferSize,          // 0 → served by the SW / HTTP cache
      body: r.encodedBodySize,
    }));
    return {
      path: perf.path,
      stages: perf.stages,
      paint,
      nav: nav ? { ttfb: +nav.responseStart.toFixed(1), html: +nav.responseEnd.toFixed(1) } : null,
      resources,
    };
  });
}

async function measure(browser, url, run, warmupUrl) {
  // Fresh incognito context = a genuinely FIRST load: empty HTTP cache, no SW,
  // no CacheStorage. (createBrowserContext on newer puppeteer, the incognito
  // spelling on older.)
  const ctx = browser.createBrowserContext
    ? await browser.createBrowserContext()
    : await browser.createIncognitoBrowserContext();
  const page = await ctx.newPage();
  // A browse-to-run program only becomes a run page once the service worker is
  // installed — as a real visitor arrives (homepage first, then navigates). Load
  // the homepage once to install + activate it; CacheStorage stays empty, so the
  // app is still a genuinely cold first render (only the SW is warm). The timeout
  // race keeps this from hanging against the dev server, where there is no SW and
  // the program URL is compiled server-side regardless.
  if (warmupUrl) {
    await page.goto(warmupUrl, { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => window.__declarePerf?.completed === true, { timeout: 120000 });
    await page.evaluate(() => Promise.race([
      navigator.serviceWorker?.ready,
      new Promise((r) => setTimeout(r, 2000)),
    ]));
  }
  await page.goto(url, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.__declarePerf?.completed === true, { timeout: 120000 });
  const cold = await collect(page);

  // SECOND load: same context — the SW is registered and CacheStorage holds
  // the compiled output; a reload takes the fast path.
  await page.reload({ waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.__declarePerf?.completed === true, { timeout: 120000 });
  const warm = await collect(page);

  await ctx.close();
  process.stderr.write(`    run ${run}: cold ${tot(cold)} ms (${cold.path}) / warm ${tot(warm)} ms (${warm.path})\n`);
  return { cold, warm };
}

const tot = (r) => {
  const ff = r.stages.find((s) => s.stage === "first-frame");
  return ff ? (ff.start + ff.dur).toFixed(0) : "?";
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** Median-merge one load kind across runs: stages keyed by name (start AND
 *  duration median'd independently — stable stage order by median start). */
function summarize(runs) {
  const byStage = new Map();
  for (const r of runs) for (const s of r.stages) {
    if (!byStage.has(s.stage)) byStage.set(s.stage, { start: [], dur: [] });
    byStage.get(s.stage).start.push(s.start);
    byStage.get(s.stage).dur.push(s.dur);
  }
  const stages = [...byStage].map(([stage, v]) => ({
    stage, start: median(v.start), dur: median(v.dur), n: v.dur.length,
  })).sort((a, b) => a.start - b.start);
  const paint = {};
  for (const k of ["first-paint", "first-contentful-paint"]) {
    const xs = runs.map((r) => r.paint[k]).filter((x) => x !== undefined);
    if (xs.length) paint[k] = median(xs);
  }
  const ttfb = median(runs.map((r) => r.nav?.ttfb ?? 0));
  const path = runs[0]?.path;
  const resources = RESOURCES.map(([label, needle]) => {
    const hits = runs.flatMap((r) => r.resources.filter((x) => x.url.includes(needle)));
    if (!hits.length) return null;
    return {
      label,
      count: Math.round(hits.length / runs.length),
      transfer: median(hits.map((h) => h.transfer)),
      dur: median(hits.map((h) => h.dur)),
    };
  }).filter(Boolean);
  return { path, ttfb, stages, paint, resources };
}

const kb = (n) => (n / 1024).toFixed(0) + " KB";
const BAR_SCALE = 60; // chars for the widest waterfall

function printSummary(name, kind, s) {
  const end = Math.max(...s.stages.map((x) => x.start + x.dur), 1);
  console.log(`\n  ${name} — ${kind}  (path: ${s.path}, TTFB ${s.ttfb.toFixed(0)} ms)`);
  console.log(`    ${"stage".padEnd(18)} ${"start".padStart(7)} ${"dur".padStart(7)}   waterfall`);
  for (const st of s.stages) {
    const off = Math.round((st.start / end) * BAR_SCALE);
    const len = Math.max(1, Math.round((st.dur / end) * BAR_SCALE));
    console.log(`    ${st.stage.padEnd(18)} ${st.start.toFixed(0).padStart(6)}ms ${st.dur.toFixed(0).padStart(6)}ms   ${" ".repeat(off)}${"█".repeat(len)}`);
  }
  for (const [k, v] of Object.entries(s.paint)) console.log(`    ${k.padEnd(26)} ${v.toFixed(0).padStart(6)}ms`);
  if (s.resources.length) {
    console.log(`    network:`);
    for (const r of s.resources) {
      console.log(`      ${r.label.padEnd(18)} ${kb(r.transfer).padStart(8)} wire ${r.dur.toFixed(0).padStart(6)}ms${r.count > 1 ? `  ×${r.count}` : ""}`);
    }
  }
}

const chrome = findChrome();
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });
const out = {};
try {
  for (const app of APPS) {
    const url = new URL(app.path, BASE).href;
    console.log(`\n═══ ${app.name} — ${url} (${RUNS} runs) ═══`);
    const runs = [];
    const warmupUrl = app.browseToRun ? BASE : null;
    for (let i = 1; i <= RUNS; i++) runs.push(await measure(browser, url, i, warmupUrl));
    const cold = summarize(runs.map((r) => r.cold));
    const warm = summarize(runs.map((r) => r.warm));
    out[app.name] = { url, cold, warm };
    printSummary(app.name, "FIRST load (cold)", cold);
    printSummary(app.name, "SECOND load (warm)", warm);
  }
} finally {
  await browser.close();
}
if (JSON_OUT) console.log("\n" + JSON.stringify(out, null, 2));
