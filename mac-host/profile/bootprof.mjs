// bootprof — STARTUP (program execution → first paint) for a list of apps, main
// vs this tree, in headless Chrome on the DOM renderer, N runs each, plain
// bundles (no metering). With --cpu, V8-samples the boot of ONE app and reports
// self time inside the render stage, so a regression can be read function by
// function rather than guessed at.
//
//   node mac-host/profile/bootprof.mjs --apps marketmap,birds,controls --n 5
//   node mac-host/profile/bootprof.mjs --apps marketmap --n 3 --cpu
//
// Startup, as round4 defines it: first-frame.end − render.start from the stages
// boot-uniform.js stamps on window.__declarePerf. Both trees stamp them.
import http from "node:http";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const APPS = flag("apps", "marketmap").split(",");
const N = +flag("n", "5");
const CPU = argv.includes("--cpu");
// --profile: serve each tree's METERED bundle (build-runtime.mjs --web [--root main]) in place of
// bundles/declare-boot.js — the one build that keeps the runtime-development switches, so --flag can A/B them
const PROFILE = argv.includes("--profile");
// --stages: the median duration of every declare:* boot stage, per tree — the boot split side by side
const STAGES = argv.includes("--stages");
// --flag name=value (repeatable): set globalThis.<name> before the page runs — the runtime-development switches (profiling builds)
const FLAGS = argv.flatMap((a, i) => (a === "--flag" && argv[i + 1] ? [argv[i + 1]] : [])).map((kv) => { const [k, v] = kv.split("="); return [k, v === undefined ? true : v === "true" ? true : v === "false" ? false : v]; });
const RENDER = flag("render", "dom");
// --measure: count canvas measureText calls (and their time) between render start and first frame
const MEASURE = argv.includes("--measure");
// --trace: Chrome's timeline over the render stage — how many style recalcs / layouts the boot forced, and their time
const TRACE = argv.includes("--trace");
// --stackfor "✕": record the JS stack of every measureText of that exact text (with --measure)
const STACKFOR = flag("stackfor", null);
const TREES = { main: "/Users/temkin/Code/Declare", opt: path.resolve(HERE, "../..") };
// --only opt|main: measure one tree (a program that exists only in this tree — a testbed)
const ONLY = (() => { const i = process.argv.indexOf("--only"); return i >= 0 ? process.argv[i + 1] : null; })();
// --apps-from main: serve /apps/ from that tree to BOTH runtimes, so the app source is
// identical and the delta is the runtime's alone (the two trees' apps have drifted)
const APPS_FROM = flag("apps-from", null);

const chrome = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });

async function serve(root) {
  const { createDeclareServer } = await import(path.join(root, "server/create.mjs"));
  const mounts = [{ prefix: "/", dir: root }, { prefix: "/declare/", dir: root, platform: true }];
  if (APPS_FROM) mounts.unshift({ prefix: "/apps-from/", dir: path.join(TREES[APPS_FROM], "apps") });   // a mount may not shadow the tree's own apps/
  const s = createDeclareServer({ mountSpecs: mounts, mode: "distro" });
  const h = http.createServer(s.handler).on("upgrade", s.upgrade);
  await new Promise((r) => h.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${h.address().port}`, close: () => h.close() };
}
const servers = { main: await serve(TREES.main), opt: await serve(TREES.opt) };

const stage = (st, name) => st.find((s) => s.stage === name);
async function boot(tree, app) {
  const page = await browser.newPage();
  if (FLAGS.length) await page.evaluateOnNewDocument((flags) => { for (const [k, v] of flags) globalThis[k] = v; }, FLAGS);
  if (PROFILE) {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(path.join(HERE, `../bundles/declare-boot${tree === "main" ? ".declare" : ""}.profile.js`), "utf8");
    await page.setRequestInterception(true);
    page.on("request", (req) => { if (/\/bundles\/declare-boot\.js(\?|$)/.test(req.url())) req.respond({ status: 200, contentType: "application/javascript", body: src }); else req.continue(); });
  }
  await page.setViewport({ width: 1280, height: 828, deviceScaleFactor: 2 });
  if (MEASURE) await page.evaluateOnNewDocument((STACKFOR) => {
    globalThis.__stackfor = STACKFOR; globalThis.__stacks = [];
    const P = CanvasRenderingContext2D.prototype, orig = P.measureText;
    const c = (globalThis.__mt = { calls: 0, ms: 0, fonts: 0, texts: new Set(), lastFont: null, fontSwitches: 0, log: [] });
    P.measureText = function (t) { const t0 = performance.now(); const r = orig.call(this, t); const d = performance.now() - t0; c.ms += d; c.calls++; c.texts.add(this.font + "|" + t); if (this.font !== c.lastFont) { c.fontSwitches++; c.lastFont = this.font; } c.log.push([+t0.toFixed(1), +d.toFixed(2), this.font, String(t).slice(0, 24)]); if (globalThis.__stackfor && t === globalThis.__stackfor) globalThis.__stacks.push({ at: +t0.toFixed(1), ms: +d.toFixed(2), stack: new Error().stack.split("\n").slice(2, 16).map((l) => l.trim().replace(/https?:\/\/[^ )]*\//, "")).join(" < ") }); return r; };
  }, STACKFOR);
  let cdp = null;
  if (CPU) { cdp = await page.target().createCDPSession(); await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 100 }); await cdp.send("Profiler.start"); }
  if (TRACE) await page.tracing.start({ categories: ["blink", "blink.user_timing", "devtools.timeline", "disabled-by-default-devtools.timeline", "v8.execute"] });
  await page.goto((app.includes("/") ? `${servers[tree].base}/${app}?render=${RENDER}` : `${servers[tree].base}/${APPS_FROM ? "apps-from" : "apps"}/${app}/${app}.declare?render=${RENDER}`), { waitUntil: "load", timeout: 90000 });
  for (let i = 0; i < 300; i++) { if (await page.evaluate(() => !!window.__declarePerf?.completed)) break; await new Promise((r) => setTimeout(r, 100)); }
  const perf = await page.evaluate(() => ({ stages: window.__declarePerf?.stages, path: window.__declarePerf?.path, origin: performance.timeOrigin, kernel: globalThis.__declareKernelKind ?? null,
    mt: globalThis.__mt ? (() => { const r0 = performance.getEntriesByName("declare:render:start")[0]?.startTime ?? 0; const ff = performance.getEntriesByName("declare:first-frame")[0]; const hi = ff ? ff.startTime + ff.duration : Infinity;
      const win = globalThis.__mt.log.filter((l) => l[0] >= r0 && l[0] <= hi);
      return { stacks: (globalThis.__stacks ?? []).map((x) => `${(x.at - r0).toFixed(1)}ms after render start (+${x.ms} ms): ${x.stack}`), all: globalThis.__mt.log.filter((l) => l[3] === globalThis.__stackfor).map((l) => `${(l[0] - r0).toFixed(1)}ms +${l[1]}`), calls: win.length, ms: +win.reduce((a, l) => a + l[1], 0).toFixed(1), distinct: new Set(win.map((l) => l[2] + "|" + l[3])).size, slowest: win.slice().sort((a, b) => b[1] - a[1]).slice(0, 8).map((l) => `${(l[0] - r0).toFixed(1)}ms +${l[1]} ${l[2]} "${l[3]}"`) }; })() : null }));
  let trace = null;
  if (TRACE) {
    const ev = JSON.parse(Buffer.from(await page.tracing.stop()).toString("utf8")).traceEvents ?? [];
    const mark = (n) => ev.find((e) => e.name === n && e.cat.includes("user_timing"));
    const r0 = mark("declare:render:start"), ff = ev.find((e) => e.name === "declare:first-frame" && e.cat.includes("user_timing") && (e.ph === "X" || e.ph === "e" || e.ph === "E"));
    const lo = r0?.ts, hi = ff ? ff.ts + (ff.dur ?? 0) : null;
    const by = new Map();
    if (lo != null && hi != null) for (const e of ev) {
      if (e.ph !== "X") continue;
      const overlap = Math.min(e.ts + (e.dur ?? 0), hi) - Math.max(e.ts, lo);   // clipped to the window: a task may straddle the mark
      if (overlap <= 0) continue;
      const k = e.name; const v = by.get(k) ?? { n: 0, ms: 0 }; v.n++; v.ms += overlap / 1000; by.set(k, v);
    }
    trace = { window: lo != null && hi != null ? (hi - lo) / 1000 : null, top: [...by.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 22).map(([k, v]) => `${v.ms.toFixed(1).padStart(6)} ms ×${String(v.n).padStart(4)}  ${k}`) };
  }
  let profile = null, wallAtStop = null;
  if (CPU) { wallAtStop = await page.evaluate(() => performance.timeOrigin + performance.now()); profile = (await cdp.send("Profiler.stop")).profile; }
  await page.close();
  const st = perf.stages ?? [];
  const r = stage(st, "render"), f = stage(st, "first-frame");
  // V8 samples are on a monotonic-since-boot clock; anchor it to wall time at the stop
  const skew = profile ? wallAtStop - profile.endTime / 1000 : 0;
  return { startup: r && f ? f.start + f.dur - r.start : null, render: r?.dur, path: perf.path, stages: st, origin: perf.origin, profile, skew, mt: perf.mt, trace, kernel: perf.kernel };
}

// CPU: self time by function for samples whose time falls inside [render.start, first-frame.end].
// V8's sample clock is monotonic µs; performance.timeOrigin is on the same clock in ms.
function renderSlice(b) {
  const p = b.profile; const st = b.stages; const r = stage(st, "render"), f = stage(st, "first-frame");
  const lo = b.origin + r.start, hi = b.origin + f.start + f.dur;
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const parent = new Map(); for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const key = (n) => `${n.callFrame.functionName || "(anon)"} ${(n.callFrame.url || "").split("/").slice(-1)[0].split("?")[0]}:${n.callFrame.lineNumber + 1}`;
  const self = new Map(), incl = new Map(); let t = p.startTime, total = 0;
  for (let i = 0; i < p.samples.length; i++) {
    t += p.timeDeltas[i] || 0; const ms = t / 1000 + b.skew;
    if (ms < lo || ms > hi) continue;
    const d = (p.timeDeltas[i] || 0) / 1000; total += d;
    const n = byId.get(p.samples[i]);
    self.set(key(n), (self.get(key(n)) ?? 0) + d);
    const seen = new Set(); for (let id = n.id; id !== undefined; id = parent.get(id)) { const k = key(byId.get(id)); if (seen.has(k)) continue; seen.add(k); incl.set(k, (incl.get(k) ?? 0) + d); }
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(1).padStart(6)} ms  ${k}`);
  return { total, self: top(self, 24), incl: top(incl, 30).filter((l) => !/\(root\)|\(program\)|\(idle\)/.test(l)) };
}

const f1 = (x) => (x == null ? "—" : x.toFixed(1));
const med = (a) => { const s = [...a].filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[(s.length - 1) >> 1] : null; };
console.log(`| app | main startup (median of ${N}) | optimized | change | main runs | optimized runs |\n|---|---|---|---|---|---|`);
for (const app of APPS) {
  const runs = { main: [], opt: [] }; const boots = { main: [], opt: [] };
  for (let i = 0; i < N; i++) for (const tree of (ONLY ? [ONLY] : ["main", "opt"])) { const b = await boot(tree, app); runs[tree].push(b.startup); boots[tree].push(b); }
  const a = med(runs.main), b = med(runs.opt);
  const pct = a && b ? `${b < a ? "−" : "+"}${Math.abs((b - a) / a * 100).toFixed(0)}%` : "";
  console.log(`| ${app} | ${f1(a)} ms | ${f1(b)} ms | ${pct} | ${runs.main.map(f1).join(" ")} | ${runs.opt.map(f1).join(" ")} |   kernels: main=${boots.main[0]?.kernel ?? "—"} opt=${boots.opt[0]?.kernel ?? "—"}`);
  if (TRACE) for (const tree of ["main", "opt"]) { const t = boots[tree][0].trace; console.log(`\n### ${tree} · ${app} · trace of the render stage (${t?.window?.toFixed(1)} ms window), by event (self-inclusive, ms × count)\n${(t?.top ?? []).join("\n")}`); }
  if (MEASURE) for (const tree of ["main", "opt"]) for (const x of boots[tree]) console.log(`  ${tree} measureText in the render stage: ${x.mt.calls} calls, ${x.mt.ms} ms, ${x.mt.distinct} distinct (startup ${f1(x.startup)})\n    slowest: ${x.mt.slowest.join("\n             ")}${STACKFOR ? `\n    "${STACKFOR}" measured at: ${x.mt.all.join(", ") || "never"}\n    stacks: ${x.mt.stacks.join("\n            ")}` : ""}`);
  if (STAGES) {
    const names = [...new Set(["main", "opt"].flatMap((t) => boots[t].flatMap((b) => b.stages.map((s) => s.stage))))];
    console.log(`\n### ${app} · boot stages, median ms of ${N} (start offset from render.start in parentheses)\n| stage | main | optimized |\n|---|---|---|`);
    for (const nm of names) {
      const col = (t) => { const ds = boots[t].map((b) => b.stages.find((s) => s.stage === nm)).filter(Boolean); if (!ds.length) return "—"; const r = boots[t].map((b) => b.stages.find((s) => s.stage === "render")); const d = med(ds.map((s) => s.dur)); const off = med(ds.map((s, i) => s.start - (r[i]?.start ?? 0))); return `${f1(d)} (${off >= 0 ? "+" : ""}${f1(off)})`; };
      console.log(`| ${nm} | ${col("main")} | ${col("opt")} |`);
    }
  }
  if (CPU) {
    for (const tree of (ONLY ? [ONLY] : ["main", "opt"])) {
      // the run nearest the median, so the profile is of a typical boot
      const pick = boots[tree].reduce((best, x) => (Math.abs(x.startup - med(runs[tree])) < Math.abs(best.startup - med(runs[tree])) ? x : best));
      const s = renderSlice(pick);
      console.log(`\n### ${tree} · ${app} · render stage, ${s.total.toFixed(1)} ms sampled (startup ${f1(pick.startup)} ms)\nself:\n${s.self.join("\n")}\ninclusive:\n${s.incl.join("\n")}`);
    }
  }
}
for (const s of Object.values(servers)) s.close();
await browser.close();
