// web — the same profile as run.mjs, in headless Chrome: serve a tree, open a
// program on the DOM or canvas renderer, swap the served declare-boot.js for
// the METERED bundle (build-runtime.mjs --web [--root <tree>]), drive a
// stimulus, read __prof and the page's own rAF cadence.
//
//   node mac-host/profile/web.mjs apps/weather/weather.declare --stim resize --render dom --label opt
//   node mac-host/profile/web.mjs apps/weather/weather.declare --stim resize --render canvas --root /Users/temkin/Code/Declare --label main
//
// Stimuli:  resize — viewport 1280x828 → 1000x640 over 60 steps
//           seed   — desktop: two extra Files windows, then scaleSeed = i × 60
//           filter — tracker: cycle the query 24 times
import http from "node:http";
import path from "node:path";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const target = argv.find((a) => a.endsWith(".declare"));
const STIM = flag("stim", "resize"), RENDER = flag("render", "dom"), LABEL = flag("label", "opt");
const ROOT = flag("root") ? path.resolve(flag("root")) : path.resolve(HERE, "../..");
const TAG = flag("root") ? "." + path.basename(ROOT).toLowerCase() : "";
const PROFILE = path.join(HERE, `../bundles/declare-boot${TAG}.profile.js`);
if (!target) { console.error("usage: web.mjs <path.declare> --stim resize|seed|filter --render dom|canvas [--root tree] --label x"); process.exit(2); }
if (!existsSync(PROFILE)) { console.error(`no metered bundle at ${PROFILE} — node mac-host/profile/build-runtime.mjs --web${flag("root") ? " --root " + ROOT : ""}`); process.exit(1); }

const { createDeclareServer } = await import(path.join(ROOT, "server/create.mjs"));
const server = createDeclareServer({ mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }], mode: "distro" });
const httpServer = http.createServer(server.handler).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${httpServer.address().port}`;

function findChrome() {
  for (const c of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean))
    if (existsSync(c)) return c;
  throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
}
// the in-page (interaction) mode measures frame PACING, so it keeps vsync;
// the driver-timed modes measure settle cost and run unthrottled
const VSYNC = argv.includes("--inpage") && !argv.includes("--no-vsync");
// --headful: a real window on screen (the in-page pass DT watches); the viewport is still emulated at 1280x828
const HEADFUL = argv.includes("--headful");
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: !HEADFUL, defaultViewport: null,
  args: ["--no-sandbox", ...(HEADFUL ? ["--window-size=1300,960", "--window-position=40,40"] : []), ...(VSYNC ? [] : ["--disable-gpu-vsync", "--disable-frame-rate-limit"]),
    // the damage CHECK compares pixels across canvases: Chrome picks GPU or software per canvas (and they antialias
    // differently), so the check runs every canvas in software
    ...(argv.some((a) => a.startsWith("__declareDamageCheck")) ? ["--disable-accelerated-2d-canvas"] : [])] });
const page = await browser.newPage();
if (argv.includes("--noextent")) await page.evaluateOnNewDocument(() => { globalThis.__declareNoKernelExtent = true; });
if (argv.includes("--noring")) await page.evaluateOnNewDocument(() => { globalThis.__declareNoTrackRing = true; });
if (argv.includes("--nomemo")) await page.evaluateOnNewDocument(() => { globalThis.__declareNoMeasureMemo = true; });
if (argv.includes("--placepersize")) await page.evaluateOnNewDocument(() => { globalThis.__declareLayoutPlacePerSize = true; });
// --flag name=value (repeatable): any global set before the page runs — e.g. --flag __declareKernelJS=true for the JS twin
for (const kv of argv.flatMap((a, i) => (a === "--flag" && argv[i + 1] ? [argv[i + 1]] : []))) { const [k, v] = kv.split("="); await page.evaluateOnNewDocument((k, v) => { globalThis[k] = v; }, k, v === undefined || v === "true" ? true : v === "false" ? false : v); }
// --exprtrace: why each compiler-lowered EXPR body was declined at BIND time (bind.ts exprWhy; dev switches only)
if (argv.includes("--exprtrace")) await page.evaluateOnNewDocument(() => { globalThis.__declareExprTrace = []; });
if (argv.includes("--settleempty")) await page.evaluateOnNewDocument(() => { globalThis.__declareSettleEmpty = true; });
// --viewport WxH[@dpr] — the damage CHECKER ran only at desktop sizes, and a
// dirty-region bug that blanked marketmap's treemap at PHONE width survived
// every gate because of it (2026-09-20). The size is a parameter now.
const VP = (flag("viewport", "1280x828@2").match(/^(\d+)x(\d+)(?:@([\d.]+))?$/) ?? []).slice(1);
await page.setViewport({ width: +(VP[0] ?? 1280), height: +(VP[1] ?? 828), deviceScaleFactor: +(VP[2] ?? 2) });
const profileSrc = readFileSync(PROFILE, "utf8");
await page.setRequestInterception(true);
let swapped = 0;
page.on("request", (req) => {
  if (/\/bundles\/declare-boot\.js(\?|$)/.test(req.url())) { swapped++; req.respond({ status: 200, contentType: "application/javascript", body: profileSrc }); }
  else req.continue();
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

const url = `${B}/${target}?render=${RENDER}`;
await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
const appReady = async () => page.evaluate(() => { const el = [...document.querySelectorAll("*")].find((e) => e.__declareApp); if (!el) return false; window.__app = el.__declareApp; return window.__app.width > 0; });
for (let i = 0; i < 100 && !(await appReady()); i++) await new Promise((r) => setTimeout(r, 200));
if (!(await appReady())) { console.error("the program did not mount", errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 2500));
const boot = await page.evaluate(() => __prof.snapshot());
if (argv.includes("--exprtrace")) {
  const t = await page.evaluate(() => { const by = {}; for (const e of globalThis.__declareExprTrace ?? []) { const k = e.why.replace(/:.*$/, ""); by[k] = (by[k] ?? 0) + 1; } return { n: (globalThis.__declareExprTrace ?? []).length, by, sample: (globalThis.__declareExprTrace ?? []).slice(0, 400).map((e) => e.why) }; });
  const ex = {}; for (const w of t.sample) { const k = w.replace(/:.*$/, ""); if (!ex[k]) ex[k] = w; }
  console.log(`exprtrace: ${t.n} bind-time declines — ` + Object.entries(t.by).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", "));
  for (const [k, w] of Object.entries(ex)) console.log(`           e.g. ${w.slice(0, 110)}`);
}
const renderer = await page.evaluate(() => document.querySelectorAll("div").length > 40 ? `dom (${document.querySelectorAll("div").length} divs)` : `canvas (${document.querySelectorAll("div").length} divs)`);
const probe = await page.evaluate(() => ({ all: __prof.all.length, ran: __prof.all.filter((c) => (c.__runs | 0) > 0).length, dead: __prof.all.filter((c) => c.dead).length, sample: String(__prof.all[0]?.label) }));
// probe

// ── the window ──────────────────────────────────────────────────────────────
// --cpuprofile: V8's sampling profiler over the window, aggregated by self time
const CPU = argv.includes("--cpuprofile");
// --alloc: V8's sampling heap profiler over the window — BYTES ALLOCATED per function (garbage pressure)
const ALLOC = argv.includes("--alloc");
const cdp = CPU || ALLOC ? await page.target().createCDPSession() : null;
if (ALLOC) { await cdp.send("HeapProfiler.enable"); await cdp.send("HeapProfiler.startSampling", { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }
if (CPU) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start"); }
await page.evaluate(() => { __prof.reset(); window.__gaps = []; let last = 0; const f = (t) => { if (last) window.__gaps.push(t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
const t0 = Date.now();
// --trace: Chrome's own timeline over the window — how a frame's time splits
// between script, style recalc, layout, paint and compositing
const TRACE = argv.includes("--trace");
if (TRACE) await page.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "v8.execute", "blink", "cc", "gpu", "toplevel", "viz"] });
const INPAGE = argv.includes("--inpage");
let driven = null, census = null, memoTally = null;
if (INPAGE) {
  driven = await page.evaluate((stim) => globalThis.__profDrive(stim), STIM);
  const who = await page.evaluate(() => globalThis.__declareDamageWho ?? null);
  if (who && typeof who === "object") { console.log("big invalidations:"); for (const [k, v] of Object.entries(who).sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${String(v).padStart(4)}  ${k}`); }
  memoTally = await page.evaluate(() => globalThis.__declareProvidedMemo ?? null);
  census = await page.evaluate(() => { const c = globalThis.__declareProvidedCensus; return c && typeof c === "object" ? { reads: c.reads, hops: c.hops, sameAnswer: c.sameAnswer, firstRead: c.firstRead, changed: c.changed, byHops: c.byHops, byKind: c.byKind } : null; });
  const shots = await page.evaluate(() => globalThis.__declareDamageShots ?? null);
  if (shots) { const fs = await import("node:fs"); shots.forEach((u, i) => fs.writeFileSync(`${process.env.SHOTDIR ?? "/tmp"}/damage-${i ? "full" : "screen"}.png`, Buffer.from(u.split(",")[1], "base64"))); console.log("damage shots written"); }
} else if (STIM === "resize") {
  for (let i = 1; i <= 60; i++) {
    const f = i / 60;
    await page.setViewport({ width: Math.round(1280 + (1000 - 1280) * f), height: Math.round(828 + (640 - 828) * f), deviceScaleFactor: 2 });
  }
  await new Promise((r) => setTimeout(r, 1200));
} else if (STIM === "seed") {
  await page.evaluate(() => { __app.launcher.newFiles(); __app.launcher.newFiles(); });
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate(() => { __prof.reset(); window.__gaps = []; });
  for (let i = 1; i <= 60; i++) { await page.evaluate((i) => { __app.scaleSeed = i; }, i); await new Promise((r) => setTimeout(r, 16)); }
  await new Promise((r) => setTimeout(r, 800));
} else if (STIM === "filter") {
  const qs = ["a", "e", "re", "s", "", "an", "t", "", "o", "in", "", "er"];
  for (let i = 0; i < 24; i++) { await page.evaluate((q) => { __app.query = q; }, qs[i % qs.length]); await new Promise((r) => setTimeout(r, 120)); }
  await new Promise((r) => setTimeout(r, 800));
}
const windowS = (Date.now() - t0) / 1000;
let traceSplit = null;
if (TRACE) {
  const buf = await page.tracing.stop();
  const ev = JSON.parse(Buffer.from(buf).toString("utf8")).traceEvents ?? [];
  // EVERY THREAD'S busy time over the window: top-level task spans (category
  // `toplevel`) per thread, named from the trace's own thread_name metadata —
  // canvas rasterizes on the GPU process, which the renderer's CPU profile never sees
  {
    const names = new Map(), procs = new Map();
    for (const e of ev) if (e.ph === "M" && e.name === "thread_name") names.set(e.pid + ":" + e.tid, e.args?.name ?? "?");
    for (const e of ev) if (e.ph === "M" && e.name === "process_name") procs.set(e.pid, e.args?.name ?? "?");
    const busy = new Map(), top = new Map();
    for (const e of ev) {
      if (e.ph !== "X" || !e.cat || !e.cat.includes("toplevel")) continue;
      const k = e.pid + ":" + e.tid; busy.set(k, (busy.get(k) ?? 0) + (e.dur ?? 0) / 1000);
    }
    for (const e of ev) {
      if (e.ph !== "X" || !(e.dur > 0)) continue;
      const k = e.pid + ":" + e.tid; const nm = names.get(k) ?? "";
      if (!/CrGpuMain|VizCompositor|Compositor|CompositorTileWorker|CrRendererMain|ThreadPoolForegroundWorker|DedicatedWorker/.test(nm)) continue;
      const m = top.get(k) ?? new Map(); m.set(e.name, (m.get(e.name) ?? 0) + e.dur / 1000); top.set(k, m);
    }
    const rows = [...busy.entries()].filter(([, ms]) => ms > 5).sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log(`threads: busy ms over the ${windowS.toFixed(1)} s window (top-level tasks)`);
    for (const [k, ms] of rows) {
      const pid = +k.split(":")[0];
      console.log(`  ${ms.toFixed(0).padStart(7)} ms  ${(procs.get(pid) ?? "?").padEnd(10)} ${names.get(k) ?? k}`);
      const nm = names.get(k) ?? "";
      if (/CrGpuMain|VizCompositor|CompositorTileWorker|ThreadPoolForegroundWorker|DedicatedWorker/.test(nm)) {
        const t = [...(top.get(k) ?? new Map()).entries()].filter(([n]) => !/RunTask|ThreadController|TaskGraphRunner|MessageLoop|ThreadPool/.test(n)).sort((a, b) => b[1] - a[1]).slice(0, 6);
        for (const [n, v] of t) console.log(`             ${v.toFixed(0).padStart(6)} ms  ${n}`);
      }
    }
  }
  // SELF time per timeline event name on the renderer main thread (nested events subtract from their parent)
  const main = ev.filter((e) => e.cat && /devtools\.timeline|v8|blink/.test(e.cat) && (e.ph === "B" || e.ph === "E" || e.ph === "X"));
  const byThread = new Map();
  for (const e of main) { const k = e.pid + ":" + e.tid; if (!byThread.has(k)) byThread.set(k, []); byThread.get(k).push(e); }
  let best = null, bestN = 0;
  for (const [k, list] of byThread) { const n = list.filter((e) => e.name === "UpdateLayoutTree" || e.name === "Layout").length; if (n > bestN) { bestN = n; best = list; } }
  const self = new Map(); const stack = [];
  const open = (name, ts) => stack.push({ name, ts, child: 0 });
  const close = (ts) => { const f = stack.pop(); if (!f) return; const dur = (ts - f.ts) / 1000; self.set(f.name, (self.get(f.name) ?? 0) + dur - f.child); if (stack.length) stack[stack.length - 1].child += dur; };
  const flat = [];
  for (const e of best ?? []) { if (e.ph === "X") { flat.push({ ts: e.ts, kind: "B", name: e.name }); flat.push({ ts: e.ts + (e.dur ?? 0), kind: "E", name: e.name }); } else flat.push({ ts: e.ts, kind: e.ph, name: e.name }); }
  flat.sort((a, b) => a.ts - b.ts || (a.kind === "E" ? -1 : 1));
  for (const f of flat) { if (f.kind === "B") open(f.name, f.ts); else close(f.ts); }
  traceSplit = [...self.entries()].filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]).slice(0, 16);
}
let allocTop = null;
if (ALLOC) {
  const { profile } = await cdp.send("HeapProfiler.stopSampling");
  const self = new Map(); let total = 0;
  const key = (n) => `${n.callFrame.functionName || "(anon)"} ${(n.callFrame.url || "").split("/").slice(-1)[0]}:${n.callFrame.lineNumber + 1}`;
  const walk = (n) => { if (n.selfSize > 0) { total += n.selfSize; self.set(key(n), (self.get(key(n)) ?? 0) + n.selfSize); } for (const c of n.children ?? []) walk(c); };
  walk(profile.head);
  allocTop = { total, top: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20) };
}
let cpuTop = [];
if (CPU) {
  const { profile } = await cdp.send("Profiler.stop");
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map(); const incl = new Map();
  const parent = new Map(); for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const key = (n) => `${n.callFrame.functionName || "(anon)"} ${(n.callFrame.url || "").split("/").slice(-1)[0]}:${n.callFrame.lineNumber + 1}`;
  const dt = profile.timeDeltas; let total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const n = byId.get(profile.samples[i]); const d = (dt[i] || 0) / 1000; total += d;
    self.set(key(n), (self.get(key(n)) ?? 0) + d);
    const seen = new Set(); for (let id = n.id; id !== undefined; id = parent.get(id)) { const k = key(byId.get(id)); if (seen.has(k)) continue; seen.add(k); incl.set(k, (incl.get(k) ?? 0) + d); }
  }
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22).map(([k, v]) => `${(100 * v / total).toFixed(1).padStart(5)}%  ${k}`);
  // --categorize: EVERY sample's self time sorted into what a frame is made of.
  // The profiling bundle keeps real names, so function and file say which part
  // of the runtime ran. First match wins; order matters.
  if (argv.includes("--categorize")) {
    const CATS = [
      ["idle", (n) => n.callFrame.functionName === "(idle)"],
      ["garbage collection", (n) => n.callFrame.functionName === "(garbage collector)"],
      ["browser (program)", (n) => n.callFrame.functionName === "(program)"],
      ["kernel (wasm + crossings)", (n) => /^wasm-function|^js-to-wasm|^wasm-to-js|\$kernel_/.test(n.callFrame.functionName)],
      ["text measurement", (n) => /textWidth|wrapLines|wrapMemo|fontMetrics|fontString|measureText|capHeight|xHeight|featureFamily|trackFamilies|cssFamilyName|clampLines|ellipsize/.test(n.callFrame.functionName)],
      ["layout strategies", (n) => /Layout|arrange|place[A-Z]|placeChildren|extentOf|shape|flow/.test(n.callFrame.functionName)],
      ["DOM surface writes", (n) => /^set[A-Z]|^apply[A-Z]|^flush|placeContent|DomSurface|reposition|insertChild|removeChild|setStyle|style/.test(n.callFrame.functionName) && /declare-boot/.test(n.callFrame.url)],
      ["canvas painting", (n) => /paint|replay|raster|composite|Frost|drawImage|fillText|fillRect|setTransform|save|restore|clip|fill$|stroke$/.test(n.callFrame.functionName)],
      ["rule bodies + applies", (n) => /runBody|compute|apply|setBound|write|provideWrite|writeOwned|Constraint|evalDefault|defBinding/.test(n.callFrame.functionName)],
      ["reactive core (JS side)", (n) => /settle|drainTrack|track|flushChanges|afterSettle|fireChanges|schedule|pushSweep|bindKernel|reactive|runQueued/.test(n.callFrame.functionName)],
      ["event / input handling", (n) => /pointer|Pointer|handle[A-Z]|dispatch|hitAt|hit[A-Z]|onInput|keydown|Key/.test(n.callFrame.functionName)],
      ["the in-page driver", (n) => /__profDrive|raf/.test(n.callFrame.functionName)],
      ["attribute get/set (JS)", (n) => /^get$|^set$|^get [a-zA-Z]|^set [a-zA-Z]/.test(n.callFrame.functionName) && /declare-boot/.test(n.callFrame.url)],
      ["other runtime JS", (n) => /declare-boot/.test(n.callFrame.url)],
      ["other (browser natives, anonymous)", () => true],
    ];
    const cat = new Map(); const perCat = new Map();
    let t2 = 0;
    for (let i = 0; i < profile.samples.length; i++) {
      const n = byId.get(profile.samples[i]); const d = (dt[i] || 0) / 1000; t2 += d;
      const c = CATS.find(([, f]) => f(n))[0];
      cat.set(c, (cat.get(c) ?? 0) + d);
      const pm = perCat.get(c) ?? new Map(); pm.set(key(n), (pm.get(key(n)) ?? 0) + d); perCat.set(c, pm);
    }
    const busy = t2 - (cat.get("idle") ?? 0);
    globalThis.__cats = [...cat.entries()].filter(([k]) => k !== "idle").sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v.toFixed(0).padStart(7)} ms ${(100 * v / busy).toFixed(0).padStart(4)}% of busy  ${k}`);
    globalThis.__busy = busy;
    globalThis.__catTop = ["other runtime JS", "other (browser natives, anonymous)"].map((c) => [c, [...(perCat.get(c) ?? new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 9)]);
  }
  cpuTop = { total, self: top(self), incl: top(incl).filter((l) => !/\(root\)|\(program\)|\(idle\)|\(garbage/.test(l)) };
  // --callers <fn>: who calls a hot function (the parents of its samples, by self-time weight)
  const want = (() => { const i = argv.indexOf("--callers"); return i >= 0 ? argv[i + 1] : null; })();
  if (want) {
    const by = new Map();
    for (let i = 0; i < profile.samples.length; i++) {
      const n = byId.get(profile.samples[i]); if ((n.callFrame.functionName || "") !== want) continue;
      const chain = []; for (let id = parent.get(n.id); id !== undefined && chain.length < 4; id = parent.get(id)) chain.push(key(byId.get(id)).replace(/declare-boot\.js/, "b"));
      const k = chain.join(" < "); by.set(k, (by.get(k) ?? 0) + (profile.timeDeltas[i] || 0) / 1000);
    }
    cpuTop.callers = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${v.toFixed(1).padStart(7)} ms  ${k}`);
  }
}
const win = INPAGE ? driven.win : await page.evaluate(() => __prof.snapshot());
const gaps = INPAGE ? driven.gaps : await page.evaluate(() => { const g = [...window.__gaps].sort((a, b) => a - b); const at = (q) => g[Math.min(g.length - 1, Math.floor(q * g.length))] ?? 0; return { n: g.length, p50: at(0.5), p95: at(0.95), max: g[g.length - 1] ?? 0 }; });
const memoStats = await page.evaluate(() => globalThis.__declareMeasureMemo ?? null);
if (memoStats) console.log("memo:   ", JSON.stringify(memoStats));
const probe2 = await page.evaluate(() => ({ all: __prof.all.length, ran: __prof.all.filter((c) => (c.__runs | 0) > 0).length, runs: __prof.runs }));
const bench = INPAGE ? driven.bench : await page.evaluate(() => { try { return __prof.bench(); } catch (e) { return { n: -1, body: 0, run: 0, top: [], errors: String(e) }; } });
// probe after
await browser.close(); httpServer.close();

const base = `${path.basename(target, ".declare")}-${STIM}${INPAGE ? "-inpage" : ""}-${RENDER}-${LABEL}`;
mkdirSync(path.join(HERE, "results"), { recursive: true });
writeFileSync(path.join(HERE, "results", "web-" + base + ".json"), JSON.stringify({ ms: driven?.ms ?? null,  target, STIM, RENDER, LABEL, root: ROOT, boot, win, gaps, bench, byLabel: driven?.byLabel ?? null, text: driven?.text ?? null, perf: driven?.perf ?? null, drag: driven?.drag ?? null, errors, swapped }, null, 2));
const ms = (x) => x.toFixed(1);
console.log(`\n${base}   (${path.basename(ROOT)}, renderer ${renderer}, boot bundle swapped ${swapped}×${errors.length ? ", " + errors.length + " page errors" : ""})`);
console.log(`boot:    instantiate ${ms(boot.instMs)}ms · new Function ${boot.nfN} in ${ms(boot.nfMs)}ms · settles ${boot.settleN} = ${ms(boot.settleMs)}ms (${boot.settleRuns} runs, ${boot.wired} wired) · constraints live ${boot.constraints.live} (wired ${boot.constraints.wired})`);
console.log(`window:  ${windowS.toFixed(1)}s · settles ${win.settleN} = ${ms(win.settleMs)}ms (max ${ms(win.settleMax)}, ${win.settleRuns} runs; ${win.wired} wired) · rAF gaps n=${gaps.n} p50=${ms(gaps.p50)} p95=${ms(gaps.p95)} max=${ms(gaps.max)}${gaps.over33 !== undefined ? ` · >20ms ${gaps.over20} · >33ms ${gaps.over33}` : ""}`);
console.log(`bench:   ${bench.n} constraints ran · weighted body ${ms(bench.body)}ms · weighted run ${ms(bench.run)}ms → residue ≈ ${ms(win.settleMs - bench.run)}ms`);
for (const t of bench.top.slice(0, 6)) console.log(`           ${t.label.padEnd(34)} n=${String(t.n).padStart(4)} wired=${String(t.wired).padStart(4)} runs=${String(t.runs).padStart(6)} body=${ms(t.bodyMs).padStart(7)}ms run=${ms(t.runMs).padStart(7)}ms`);
if (errors.length) console.log("errors:  " + errors.slice(0, 3).join(" | ").slice(0, 300));
if (driven?.paints) console.log(`paints:  ${driven.paints.n} paints (${driven.paints.full} full, ${driven.paints.partial} partial, mean area ${(driven.paints.area / Math.max(1, driven.paints.n) * 100).toFixed(0)}%), ${driven.paints.ms.toFixed(0)} ms of paint JS, ${driven.paints.canvasesMade ?? "?"} canvases created`);
if (driven?.paints?.why && Object.keys(driven.paints.why).length) console.log("full repaints, why: " + JSON.stringify(driven.paints.why));
if (memoTally) console.log(`provider memo: ${memoTally.hit} hits, ${memoTally.walk} walks, ${memoTally.bump} generation bumps, ${memoTally.clear} subtree clears`);
if (census) { console.log(`provided reads: ${census.reads} reads, ${(census.hops / Math.max(1, census.reads)).toFixed(2)} ancestors walked each (${census.hops} hops)`);
  console.log(`    answer: ${census.sameAnswer} same as last (${(100 * census.sameAnswer / Math.max(1, census.reads)).toFixed(1)}% cacheable), ${census.firstRead} first read, ${census.changed} changed`);
  console.log(`    hops: ${Object.entries(census.byHops).sort((a, b) => a[0] - b[0]).map(([k, v]) => k + ":" + v).join(" ")}`);
  console.log(`    ended at: ${Object.entries(census.byKind).map(([k, v]) => k + " " + v).join(", ")}`); }
if (driven?.paints?.escape) { console.log(`clip escapes: ${driven.paints.escape.length}`); for (const e of driven.paints.escape.slice(0, 3)) console.log("    " + JSON.stringify(e).slice(0, 400)); }
if (driven?.paints?.check) { const c = driven.paints.check; console.log(`damage check: ${c.partials} partial frames checked, ${c.mismatches.length} mismatched`); for (const m of c.mismatches.slice(0, +(process.env.CHECKN ?? 5))) console.log("    " + JSON.stringify(process.env.CHECKN ? { ...m, suspects: undefined, why: undefined } : m)); }
if (allocTop) { console.log(`alloc:   ${(allocTop.total / 1048576).toFixed(0)} MB allocated over the window (sampled, incl. collected), by function:`); for (const [k, v] of allocTop.top) console.log(`           ${(v / 1048576).toFixed(1).padStart(7)} MB  ${(100 * v / allocTop.total).toFixed(0).padStart(3)}%  ${k}`); }
if (traceSplit) { console.log("trace:   renderer main thread, self ms by event:"); for (const [k, v] of traceSplit) console.log(`           ${v.toFixed(1).padStart(8)} ms  ${k}`); }
if (CPU && cpuTop.callers) { console.log("callers:"); for (const l of cpuTop.callers) console.log("  " + l); }
if (CPU && globalThis.__cats) { console.log(`categories: ${globalThis.__busy.toFixed(0)} ms busy on the main thread over the window`); for (const l of globalThis.__cats) console.log("  " + l);
  for (const [c, list] of globalThis.__catTop) { console.log(`  inside "${c}":`); for (const [k, v] of list) console.log(`      ${v.toFixed(0).padStart(6)} ms  ${k}`); } }
if (CPU) { console.log(`cpu:     ${cpuTop.total.toFixed(0)}ms sampled — SELF:`); for (const l of cpuTop.self) console.log("           " + l); console.log("         INCLUSIVE:"); for (const l of cpuTop.incl.slice(0, 18)) console.log("           " + l); }
