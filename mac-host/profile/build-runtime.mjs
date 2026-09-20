// build-runtime — the runtime bundle the PROFILE build of the test host bakes:
// the same entry as tools/internal/build-mac.mjs (browser/mac-boot.js over
// runtime/dist), UNMINIFIED so names survive, with a few meters patched into
// the compiled JS as it is bundled. Nothing in the tree is edited: the patches
// live in an esbuild onLoad plugin and apply to the module text in memory.
//
//   node mac-host/profile/build-runtime.mjs
//   → mac-host/bundles/declare-mac.profile.js
//
// What is metered (globalThis.__prof):
//   settle      count / ms / max / constraint runs — the reactive core per settle
//   runs        every Constraint.run, split wired (static edges) vs tracked
//   stringify   JSON.stringify(ops) per flush: count / ms / bytes
//   commit      host().commit(json): count / ms
//   instantiate instantiate(): count / ms
//   newFunction every `new Function` the runtime compiles: count / ms
//   all         every Constraint ever constructed (for the micro-benchmark)
//
// The clock is performance.now → H.now, ONE BRIDGE CROSSING (~1µs). So the
// meters sit at coarse boundaries only (a settle, a flush, a mount); nothing
// is timed per constraint on the live path. The per-constraint split comes
// from `__prof.bench()`, which re-runs each constraint that ran during the
// stimulus in batches of 32 between two clock reads.

import { build } from "esbuild";
import { mkdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
// --root <tree>: meter ANOTHER tree's runtime (main, for a baseline) — its
// dist is read, the bundle lands in this tree's mac-host/bundles/ with the
// tree's name in the file name. --web: the browser boot bundle instead of
// the Mac one (entry browser/boot-uniform.js, ESM).
const ROOT = flag("root") ? path.resolve(flag("root")) : path.resolve(HERE, "../..");
const WEB = argv.includes("--web");
const TAG = flag("root") ? "." + path.basename(ROOT).toLowerCase() : "";
const OUT = path.join(HERE, `../bundles/${WEB ? "declare-boot" : "declare-mac"}${TAG}.profile.js`);

/** Replace `from` with `to` exactly once, or fail loudly — a missing anchor
 *  means the runtime moved and the meter would silently measure nothing. */
function patch(file, src, from, to) {
  const i = src.indexOf(from);
  if (i < 0) throw new Error(`build-runtime: anchor not found in ${file}:\n${from}`);
  if (src.indexOf(from, i + 1) >= 0) throw new Error(`build-runtime: anchor not unique in ${file}:\n${from}`);
  return src.slice(0, i) + to + src.slice(i + from.length);
}

const PATCHES = {
  "reactive.js": (s) => {
    s = "const __P = globalThis.__prof;\n" + s;
    // the kernel handle, for the driver's crossing micro-benchmark
    s += "\nglobalThis.__declareKernel = () => { try { return K; } catch { return null; } };\n";   // main has no kernel
    s = patch("reactive.js", s, "        this.yielding = yielding;", "        this.yielding = yielding;\n        __P.all.push(this);");
    // every evaluation lands in runBody (the kernel's callback) — settle-driven
    // and direct alike — so that is where a run is counted
    const counter = "        __P.runs++; this.__runs = (this.__runs | 0) + 1; if (this.wired) __P.wired++;\n";
    if (s.includes("    runBody() {\n")) s = patch("reactive.js", s, "    runBody() {\n", "    runBody() {\n" + counter);
    else s = patch("reactive.js", s, "    run() {\n", "    run() {\n" + counter);
    s = patch("reactive.js", s, "export function settle() {\n", "function settle__() {\n");
    // the kernel's own run count (EVERY rule: JS bodies, EXPR, VIS) — the JS
    // counter above sees only the bodies that call back into JS
    if (s.includes("        r = K.settle();\n")) s = patch("reactive.js", s, "        r = K.settle();\n", "        r = K.settle();\n        if (r > 0) __P.kruns += r;\n");
    // the close, metered: afterSettle steps and change events are JS work inside the kernel's settle
    if (s.includes("    afterSteps() {\n        if (after.length === 0)\n            return false;\n")) {
      s = patch("reactive.js", s, "    afterSteps() {\n        if (after.length === 0)\n            return false;\n",
        "    afterSteps() {\n        if (after.length === 0)\n            return false;\n        const __t0 = performance.now(); __P.afterN += after.length;\n        try { return this.afterSteps__(); } finally { __P.afterMs += performance.now() - __t0; }\n    },\n    afterSteps__() {\n        if (after.length === 0)\n            return false;\n");
      s = patch("reactive.js", s, "    fireChanges() {\n        try {\n            return fireChanges();\n",
        "    fireChanges() {\n        const __t0 = performance.now();\n        try { return fireChanges(); }\n        finally { __P.changesMs += performance.now() - __t0; }\n    },\n    fireChanges__() {\n        try {\n            return fireChanges();\n");
    }
    s += `
export function settle() {
    if (__P.inSettle) { settle__(); return; }
    __P.inSettle = true;
    const t0 = performance.now(), r0 = __P.runs, k0 = __P.kruns;
    try { settle__(); }
    finally {
        const dt = performance.now() - t0;
        __P.inSettle = false;
        __P.settleN++; __P.settleMs += dt; __P.settleRuns += __P.runs - r0; if (__P.runs === r0) { if (__P.kruns === k0) { __P.settleEmpty++; __P.settleEmptyMs += dt; } else { __P.settleKernelOnly++; __P.settleKernelOnlyRuns += __P.kruns - k0; __P.settleKernelOnlyMs += dt; } }
        if (dt > __P.settleMax) __P.settleMax = dt;
    }
}
`;
    return s;
  },
  "mac-backend.js": (s) => {
    // A HAND-METERED TREE METERS ITSELF. The measurement copies
    // (Declare-Before / Declare-After) carry their own commit meter, placed by
    // reading the code — and placing it CHANGED the very line this patch
    // matches on, which is the whole argument for hand-placing in the first
    // place. Stand down rather than fail the build; `__M` is the authority
    // there and `__P`'s commit numbers simply do not appear.
    if (s.includes("M.commitN++")) return s;
    s = "const __P = globalThis.__prof;\n" + s;
    // main commits straight to the host (JSON only); this tree goes through commitOps (+ binary geometry)
    if (!s.includes("    commitOps(json);")) return patch("mac-backend.js", s,
      "    const json = JSON.stringify(ops);\n    ops.length = 0;\n    host().commit(json);",
      "    const __t0 = performance.now();\n    const json = JSON.stringify(ops);\n    const __t1 = performance.now();\n    __P.opsN += ops.length;\n    ops.length = 0;\n    __P.bytes += json.length;\n    host().commit(json);\n    const __t2 = performance.now();\n    __P.stringifyN++; __P.stringifyMs += __t1 - __t0;\n    __P.commitMs += __t2 - __t1;");
    s = patch("mac-backend.js", s,
      "    const json = JSON.stringify(ops);\n    ops.length = 0;\n    commitOps(json);",
      "    const __t0 = performance.now();\n    const json = JSON.stringify(ops);\n    const __t1 = performance.now();\n    __P.opsN += ops.length + geomN;\n    ops.length = 0;\n    __P.bytes += json.length + geomN * 48;\n    commitOps(json);\n    const __t2 = performance.now();\n    __P.stringifyN++; __P.stringifyMs += __t1 - __t0;\n    __P.commitMs += __t2 - __t1;");
    return s;
  },
  "instantiate.js": (s) => {
    s = "const __P = globalThis.__prof;\n" + s;
    s = patch("instantiate.js", s, "export function instantiate(input) {\n", "function instantiate__(input) {\n");
    s += `
export function instantiate(input) {
    const t0 = performance.now();
    try { return instantiate__(input); }
    finally { __P.instN++; __P.instMs += performance.now() - t0; }
}
`;
    return s;
  },
  "expr.js": (s) => {
    s = "const __P = globalThis.__prof;\n" + s;
    const n = s.split("new Function(").length - 1;
    if (n !== 3) throw new Error(`build-runtime: expected 3 new Function sites in expr.js, found ${n}`);
    s = s.split("new Function(").join("__newFunction(");
    s += `
function __newFunction(...a) {
    const t0 = performance.now();
    const f = new Function(...a);
    __P.nfN++; __P.nfMs += performance.now() - t0;
    return f;
}
`;
    return s;
  },
};

const BANNER = `
// ── THE IN-PAGE DRIVER: one stimulus implementation for every target ─────
// __profDrive(stim) runs a stimulus against the mounted app (globalThis.__app
// or the host element's __declareApp), frame-timed by requestAnimationFrame,
// and resolves { stim, ms, boot, win, gaps, bench }. On the web a page opened
// with ?autoprofile=<stim>&report=<url> runs it unattended and POSTs the
// result (iOS Safari in the simulator, or any browser without a driver).
globalThis.__profDrive = async function (stim, opts = {}) {
  const P = globalThis.__prof;
  const raf = (fn) => new Promise((r) => requestAnimationFrame((t) => { fn(t); r(); }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const findApp = () => { if (globalThis.__app && globalThis.__app.width > 0) return globalThis.__app; if (typeof document !== "undefined") { const el = [...document.querySelectorAll("*")].find((e) => e.__declareApp); if (el) { globalThis.__app = el.__declareApp; return el.__declareApp; } } return null; };
  let app = null; for (let i = 0; i < 300 && !(app = findApp()); i++) await sleep(100);
  if (!app) throw new Error("no app mounted");
  await sleep(opts.settle ?? 2500);
  // text measurement over the window: how many measureText calls the runtime makes,
  // and how many distinct (font, string) pairs they carry — the memo can only pay
  // where a pair REPEATS
  const MT = { calls: 0, keys: new Set() };
  for (const P2 of [globalThis.CanvasRenderingContext2D?.prototype, globalThis.OffscreenCanvasRenderingContext2D?.prototype]) {
    if (!P2 || P2.__mtHooked) continue;
    const orig = P2.measureText; P2.__mtHooked = 1;
    P2.measureText = function (t) { MT.calls++; if (MT.keys.size < 200000) MT.keys.add(this.font + "\u0000" + t); return orig.call(this, t); };
  }
  const boot = P.snapshot();
  boot.kernelKind = globalThis.__declareKernelKind ?? "?";
  { const K = globalThis.__declareKernel?.(); if (K) { const n = 100000; let t = performance.now(); for (let i = 0; i < n; i++) K.pending(); boot.callNs = (performance.now() - t) * 1e6 / n; t = performance.now(); for (let i = 0; i < n; i++) K.state(0); boot.stateNs = (performance.now() - t) * 1e6 / n;
    // the table's own access cost, as the getters pay it (a Float64Array over the kernel's memory)
    const T = K.table, R = K.ring; let acc = 0; t = performance.now(); for (let i = 0; i < 1000000; i++) acc += T[i & 1023]; boot.tableReadNs = (performance.now() - t) * 1e3; t = performance.now(); for (let i = 0; i < 1000000; i++) R[i & 1023] = i; boot.ringWriteNs = (performance.now() - t) * 1e3; boot.acc = acc; } }
  P.reset();
  MT.calls = 0; MT.keys.clear();
  const memo0 = { ...(globalThis.__declareMeasureMemo ?? {}) };
  // per-label run tally over EVERY constraint for the window (the bench's top
  // list is only the costliest few): runs at reset, diffed at the end
  const runsAt = new Map(P.all.map((c) => [c, c.__runs | 0]));
  const tally = () => { const by = new Map(); for (const c of P.all) { const n = (c.__runs | 0) - (runsAt.get(c) ?? 0); if (n <= 0) continue; const k = String(c.label ?? "?").replace(/ \\(.*$/, "").replace(/#\\d+/g, ""); by.set(k, (by.get(k) ?? 0) + n); } return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24); };
  const gaps = []; let last = 0, going = true;
  const tick = (t) => { if (last) gaps.push(t - last); last = t; if (going) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  const t0 = performance.now();
  let dragInfo = null;
  if (stim === "resize") {
    const w0 = app.hostWidth, h0 = app.hostHeight;
    for (let i = 1; i <= 60; i++) { const f = i / 60; await raf(() => { app.hostWidth = Math.round(w0 - 280 * f); app.hostHeight = Math.round(h0 - 188 * f); }); }
    await sleep(400);
    await raf(() => { app.hostWidth = w0; app.hostHeight = h0; }); await sleep(200);
  } else if (stim === "seed") {
    app.launcher.newFiles(); app.launcher.newFiles(); await sleep(600);
    P.reset(); gaps.length = 0;
    for (let i = 1; i <= 60; i++) await raf(() => { app.scaleSeed = i; });
    await sleep(600);
  } else if (stim === "filter") {
    const qs = ["a", "e", "re", "s", "", "an", "t", "", "o", "in", "", "er"];
    for (let i = 0; i < 24; i++) { await raf(() => { app.query = qs[i % qs.length]; }); await sleep(110); }
    await sleep(500);
  } else if (stim === "minimize") {
    // desktop: open the Calendar window, then minimize it to the dock and
    // restore it, six times — the genie animation is 260 ms each way
    await raf(() => { app.launcher.byId("calendar").launch(null); });
    // wait for the hosted app to be UP, not a fixed time: the launcher's
    // bounce done, its window front, and the window's island linked to the
    // mounted tenant (linkIslandTenant sets tenantSink on the DOM and Mac
    // hosts alike, after the child program's own mount); then a grace for
    // the calendar's first layout to land before the genie starts
    const ready = () => { const a = app.launcher.byId("calendar"), w = app.wm.frontWin; return !!a && !a.launching && !!a.running && !!w && w.island != null && w.island.tenantSink != null; };
    for (const t0 = performance.now(); !ready() && performance.now() - t0 < 15000;) await sleep(100);
    if (!ready()) throw new Error("the calendar did not initialize within 15 s");
    await sleep(1000);
    const w = app.wm.frontWin;
    P.reset(); gaps.length = 0;
    for (let i = 0; i < 6; i++) { await raf(() => { app.wm.minimizeWin(w); }); await sleep(700); await raf(() => { app.wm.focusWin(w); }); await sleep(700); }
  } else if (stim === "city") {
    // weather, phone layout: open a city page and close it, six times (the openT spring)
    if (!app.phone) { await raf(() => { app.hostWidth = 402; app.hostHeight = 874; }); await sleep(1500); }
    const ids = app.cities.map((c) => c.id);
    P.reset(); gaps.length = 0;
    for (let i = 0; i < 6; i++) { const id = ids[i % ids.length]; await raf(() => { app.openRow(id, 200); }); await sleep(900); await raf(() => { app.closeCity(); }); await sleep(900); }
  } else if (stim === "mode") {
    // calendar: month → week → day → month, twice (the grid's springs)
    for (let i = 0; i < 2; i++) for (const m of ["week", "day", "month"]) { await raf(() => { app.mode = m; }); await sleep(900); }
  } else if (stim === "slider") {
    // marketmap: DRAG THE DAY SLIDER left → right, the way a pointer does —
    // the slider's own input(v) (what its onPointerMove calls) once per
    // animation frame, v following wall time over 2.5 s, so a 120 Hz display
    // takes twice the steps a 60 Hz one does; then the flight spring lands.
    const find = (n) => (n && n.scrubber) ? n.scrubber : (n?.children ?? []).map(find).find(Boolean);
    for (const t0r = performance.now(); !(app.market?.ready && app.nDays > 1) && performance.now() - t0r < 30000;) await sleep(100);
    if (!(app.market?.ready && app.nDays > 1)) throw new Error("the market data did not load within 30 s");
    const s = find(app);
    if (!s) throw new Error("no scrubber slider found");
    await raf(() => { s.input(s.min); }); await sleep(1500);   // start at the left end, at rest
    P.reset(); gaps.length = 0;
    const DRAG = 2500, from = s.min, to = s.max;
    let steps = 0, lagSum = 0;
    for (const d0 = performance.now(); ;) {
      const f = Math.min(1, (performance.now() - d0) / DRAG);
      await raf(() => { s.input(Math.round(from + (to - from) * f)); steps++; lagSum += Math.abs(app.targetDay - app.day); });
      if (f >= 1) break;
    }
    dragInfo = { steps, dragMs: DRAG, meanLagDays: lagSum / Math.max(1, steps), days: to - from };
    await sleep(1500);   // the spring lands
  } else if (stim === "drag" || stim === "openclose" || stim === "menus" || stim === "hover" || stim === "memo") {
    // PARTIAL-SCREEN interactions (2026-09-19, for dirty regions): each changes
    // a part of the screen, not all of it.
    const pointer = (type, x, y, buttons = 0) => {
      const el = document.elementFromPoint(x, y) ?? document.body;
      el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerType: "mouse", pointerId: 1, isPrimary: true, buttons, button: type === "pointermove" ? -1 : 0, bubbles: true, cancelable: true, composed: true }));
    };
    await sleep(1200);
    P.reset(); gaps.length = 0;
    globalThis.__declarePaintStats = { n: 0, ms: 0, full: 0, partial: 0, area: 0 }; globalThis.__declarePaintWhy = {}; if (globalThis.__declareDamageWho !== undefined) globalThis.__declareDamageWho = {};
    { const ce = document.createElement.bind(document); globalThis.__canvasMade = 0; document.createElement = (t, o) => { if (String(t).toLowerCase() === "canvas") globalThis.__canvasMade++; return ce(t, o); }; }
    if (stim === "memo") {
      // test/probe/raster-memo.declare: the memo test's own sequence — caption
      // moves (promote), hue round trips (re-record), tick bumps (re-record)
      const a = globalThis.__app;
      for (let i = 0; i < 6; i++) {
        a.cap.x = 42; await sleep(300); a.cap.x = 41; await sleep(300);
        a.hue = 121; await sleep(300); a.hue = 120; await sleep(300);
        a.tick = (a.tick ?? 0) + 1; await sleep(300);
      }
    } else if (stim === "drag") {
      // desktop: the front window dragged around a loop, one step per frame — the model writes dragTo makes
      const w = app.wm?.frontWin; if (!w) throw new Error("no front window to drag");
      const x0 = w.wx, y0 = w.wy, DUR = 3000;
      for (const d0 = performance.now(); ;) {
        const f = Math.min(1, (performance.now() - d0) / DUR), a = f * Math.PI * 2;
        await raf(() => { w.wx = Math.round(x0 + 160 * Math.sin(a)); w.wy = Math.round(y0 + 90 * (1 - Math.cos(a))); });
        if (f >= 1) break;
      }
    } else if (stim === "openclose") {
      // desktop: a Files window opens (its zoom), then closes (the reverse zoom), four times
      for (let i = 0; i < 4; i++) {
        await raf(() => app.launcher.newFiles()); await sleep(900);
        await raf(() => { if (app.wm.frontWin) app.wm.closeWin(app.wm.frontWin); }); await sleep(900);
      }
    } else if (stim === "menus") {
      // desktop: press the first menu title, sweep along the bar so each menu opens in turn, click away
      // the titles, from the MODEL: the menu bar's descendants sized like a title, left to right
      const mb = app.bar?.mb; if (!mb) throw new Error("no menu bar");
      const found = [];
      const walk = (v, d) => { if (!v || d > 5) return; for (const c of v.children ?? []) { if (c.visible !== false && c.width >= 16 && c.width <= 220 && c.height >= 14 && typeof c.rootBounds === "function") found.push(c); walk(c, d + 1); } };
      walk(mb, 0);
      const boxes = found.map((c) => c.rootBounds()).filter((b) => b.y < (app.menuBarH ?? 32)).sort((a, b) => a.x - b.x);
      const centers = []; for (const b of boxes) { const cx = Math.round(b.x + b.width / 2); if (!centers.some((x) => Math.abs(x - cx) < 12)) centers.push(cx); }
      if (centers.length < 2) throw new Error("menu titles not found: " + JSON.stringify(boxes.slice(0, 6)));
      const y = Math.round((app.menuBarH ?? 32) / 2);
      pointer("pointerdown", centers[0], y, 1); pointer("pointerup", centers[0], y, 0); pointer("click", centers[0], y, 0);
      await sleep(400);
      for (let pass = 0; pass < 2; pass++) for (const cx of centers) { for (let k = 0; k < 6; k++) await raf(() => pointer("pointermove", cx - 6 + 2 * k, y)); await sleep(250); }
      pointer("pointerdown", Math.round(innerWidth / 2), Math.round(innerHeight / 2), 1); pointer("pointerup", Math.round(innerWidth / 2), Math.round(innerHeight / 2), 0);
    } else {
      // any app: a mouse zigzagging over the page, one move per frame
      const W = innerWidth, H = innerHeight, ROWS = 9, SWEEP = 4000;
      for (const h0 = performance.now(); ;) {
        const f = Math.min(1, (performance.now() - h0) / SWEEP);
        const row = Math.min(ROWS - 1, Math.floor(f * ROWS)), along = (f * ROWS) % 1;
        await raf(() => pointer("pointermove", Math.round(8 + (row % 2 === 0 ? along : 1 - along) * (W - 16)), Math.round(8 + (row + 0.5) / ROWS * (H - 16))));
        if (f >= 1) break;
      }
    }
    await sleep(700);
  } else throw new Error("unknown stimulus " + stim);
  const ms = performance.now() - t0; going = false;
  const win = P.snapshot();
  const g = [...gaps].sort((a, b) => a - b); const at = (q) => g[Math.min(g.length - 1, Math.floor(q * g.length))] ?? 0;
  // idle frames sit at the display's period; the interaction's cost is in the tail
  const over = (ms) => g.filter((x) => x > ms).length;
  const bench = P.bench();
  return { stim, ms, boot, win, gaps: { n: g.length, p50: at(0.5), p95: at(0.95), max: g[g.length - 1] ?? 0, over20: over(20), over33: over(33) }, bench: { n: bench.n, body: bench.body, run: bench.run, top: bench.top.slice(0, 8) }, byLabel: tally(), drag: dragInfo,
    // the boot stages the runtime stamped (boot-uniform.js perfStage): startup = render.start → first-frame end
    paints: globalThis.__declarePaintStats ? { ...globalThis.__declarePaintStats, canvasesMade: globalThis.__canvasMade ?? null, check: typeof globalThis.__declareDamageCheck === "object" ? globalThis.__declareDamageCheck : null, why: globalThis.__declarePaintWhy ?? null, escape: globalThis.__declareDamageEscape ?? null } : null,
    perf: (() => { const P = globalThis.__declarePerf; if (!P) return null;
      // the kernel file's own fetch, from resource timing: when it started relative to the render stage, and how long it took
      const k = (typeof performance !== "undefined" ? performance.getEntriesByType("resource") : []).find((e) => /declare-kernel/.test(e.name));
      const kernel = k ? { start: +k.startTime.toFixed(1), end: +k.responseEnd.toFixed(1), ms: +(k.responseEnd - k.startTime).toFixed(1), bytes: k.transferSize, initiator: k.initiatorType } : null;
      return { path: P.path ?? null, stages: P.stages ?? [], kernel }; })(),
    text: { measureCalls: MT.calls, distinctPairs: MT.keys.size, memoHits: (globalThis.__declareMeasureMemo?.hits ?? 0) - (memo0.hits ?? 0), memoMisses: (globalThis.__declareMeasureMemo?.misses ?? 0) - (memo0.misses ?? 0), memoClears: (globalThis.__declareMeasureMemo?.clears ?? 0) - (memo0.clears ?? 0) } };
};
if (typeof location !== "undefined" && typeof fetch !== "undefined") {
  const q = new URLSearchParams(location.search); const stim = q.get("autoprofile"), report = q.get("report");
  // ?flags=name=value,… — runtime switches for a device run, set as the bundle evaluates (before boot)
  for (const kv of (q.get("flags") ?? "").split(",").filter(Boolean)) { const [k, v] = kv.split("="); globalThis[k] = v === undefined || v === "true" ? true : v === "false" ? false : v; }
  // ?autocase=<name> runs a CASE from cases.mjs (the three-runtime corpus): the
  // descriptor is fetched from the rig rather than embedded, so the phone runs
  // exactly the steps the Mac and Chrome runs used. ?autoprofile=<stim> is the
  // older single-stimulus path, kept for the rigs that still call it.
  const acase = q.get("autocase");
  if (acase && report) setTimeout(async () => {
    let out;
    try {
      const desc = await (await fetch(new URL("/__case?name=" + encodeURIComponent(acase), report).href)).json();
      out = await globalThis.__profExec(desc);
    } catch (e) { out = { case: acase, error: String(e && e.stack || e) }; }
    out.ua = navigator.userAgent; out.dpr = devicePixelRatio; out.viewport = [innerWidth, innerHeight];
    let next = null;
    try {
      const r = await fetch(report, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(out) });
      if (r.ok && r.status !== 204) next = (await r.json()).next ?? null;
    } catch {}
    if (next) location.replace(next);
  }, 400);
  if (stim && report) setTimeout(async () => {
    let out; try { out = await globalThis.__profDrive(stim); } catch (e) { out = { error: String(e && e.stack || e) }; }
    out.ua = navigator.userAgent; out.dpr = devicePixelRatio; out.viewport = [innerWidth, innerHeight];
    // A round can hand back the NEXT run's URL: this page navigates to it, so
    // every run of the round happens in the SAME tab (no pile of tabs, each
    // holding its own canvases and caches against the next run's measurement).
    let next = null;
    try {
      const r = await fetch(report, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(out) });
      if (r.ok && r.status !== 204) next = (await r.json()).next ?? null;
    } catch (e) { console.error("report failed", e); }
    document.title = "profile done: " + stim;
    if (next) setTimeout(() => location.replace(next), 400);
  }, 500);
}
globalThis.__prof = {
  all: [], inSettle: false,
  runs: 0, wired: 0, settleN: 0, settleMs: 0, settleMax: 0, settleRuns: 0, settleEmpty: 0, settleEmptyMs: 0, kruns: 0, settleKernelOnly: 0, settleKernelOnlyRuns: 0, settleKernelOnlyMs: 0,
  stringifyN: 0, stringifyMs: 0, bytes: 0, opsN: 0, commitMs: 0,
  instN: 0, instMs: 0, nfN: 0, nfMs: 0, afterN: 0, afterMs: 0, changesMs: 0,
  reset() {
    for (const k of ["runs","wired","settleN","settleMs","settleMax","settleRuns","settleEmpty","settleEmptyMs","kruns","settleKernelOnly","settleKernelOnlyRuns","settleKernelOnlyMs","stringifyN","stringifyMs","bytes","opsN","commitMs","instN","instMs","nfN","nfMs","afterN","afterMs","changesMs"]) this[k] = 0;
    for (const c of this.all) c.__runs = 0;
  },
  snapshot() {
    const o = {};
    for (const k of ["runs","wired","settleN","settleMs","settleMax","settleRuns","settleEmpty","settleEmptyMs","kruns","settleKernelOnly","settleKernelOnlyRuns","settleKernelOnlyMs","stringifyN","stringifyMs","bytes","opsN","commitMs","instN","instMs","nfN","nfMs","afterN","afterMs","changesMs"]) o[k] = this[k];
    let live = 0, wired = 0, ran = 0;
    for (const c of this.all) { if (c.dead) continue; live++; if (c.wired) wired++; if ((c.__runs | 0) > 0) ran++; }
    o.constraints = { total: this.all.length, live, wired, ranInWindow: ran };
    return o;
  },
  // Re-run every constraint that ran during the window: batches of REPS between
  // two clock reads, compute() alone (the body, tracking off) and run() (the
  // production path: tracking + apply, or apply alone when wired). Weighted by
  // how many times each ran in the window, the sums estimate where the window's
  // settle time went. Equal re-applies are gated, so the app's state is unchanged.
  bench(REPS = 32) {
    const now = () => performance.now();
    const out = { n: 0, errors: 0, body: 0, run: 0, byLabel: {}, runsCovered: 0, deadRan: 0, deadRuns: 0 };
    for (const c of this.all) { if (c.dead && (c.__runs | 0) > 0) { out.deadRan++; out.deadRuns += c.__runs; } }
    const time = (fn) => {
      const t0 = now(); fn(); const one = now() - t0;
      if (one > 0.5) return one;                       // expensive: one sample is enough
      const t1 = now(); for (let i = 1; i < REPS; i++) fn(); return (now() - t1) / (REPS - 1);
    };
    for (const c of this.all) {
      const w = c.__runs | 0;
      if (c.dead || w === 0) continue;
      let body, run;
      try { body = time(() => c.compute()); run = time(() => c.run()); }
      catch (e) { out.errors++; if (!out.firstError) out.firstError = String(e && e.stack || e).slice(0, 300); continue; }
      const runsBefore = this.runs;                    // run() above counted itself; undo
      this.runs = runsBefore; c.__runs = w;
      out.n++; out.body += body * w; out.run += run * w; out.runsCovered += w;
      const key = (c.label || "?").replace(/ \\(.*$/, "").replace(/#\\d+/g, "");
      const b = out.byLabel[key] ??= { n: 0, runs: 0, body: 0, run: 0, wired: 0 };
      b.n++; b.runs += w; b.body += body * w; b.run += run * w; if (c.wired) b.wired++;
    }
    out.top = Object.entries(out.byLabel).sort((a, b) => b[1].run - a[1].run).slice(0, 20)
      .map(([k, v]) => ({ label: k, n: v.n, wired: v.wired, runs: v.runs, bodyMs: +v.body.toFixed(3), runMs: +v.run.toFixed(3) }));
    delete out.byLabel;
    return out;
  },
};
`;

const DIST = path.join(ROOT, "runtime/dist");
const plugin = {
  name: "declare-profile-meters",
  setup(b) {
    b.onLoad({ filter: /runtime\/dist\/[a-z-]+\.js$/ }, (args) => {
      const name = path.basename(args.path);
      const p = PATCHES[name];
      if (!p) return null;
      return { contents: p(readFileSync(args.path, "utf8")), loader: "js" };
    });
  },
};

mkdirSync(path.dirname(OUT), { recursive: true });
const r = await build({
  entryPoints: [path.join(ROOT, WEB ? "browser/boot-uniform.js" : "browser/mac-boot.js")],
  bundle: true, format: WEB ? "esm" : "iife", globalName: WEB ? undefined : "DeclareMac", platform: "browser",
  target: ["safari17"], outfile: OUT, write: true,
  minify: false, keepNames: true, legalComments: "none", logLevel: "silent",
  // THE PROFILING BUILD IS THE ONE BUILD THAT KEEPS THE RUNTIME-DEVELOPMENT
  // SWITCHES: ab.mjs drives them. The native kernel is the Mac host's, so it
  // rides only in the mac variant.
  define: {
    __DECLARE_DEV_SWITCHES__: "true", __DECLARE_NATIVE_KERNEL__: WEB ? "false" : "true",
    // the WEB profile bundle matches the SHIPPING delivery — the kernel INSIDE
    // the bundle (base64; declarec.mjs has the measurement) — so the rigs
    // exercise what a deploy does; main has no kernel and no flag to set
    ...(WEB && existsSync(path.join(ROOT, "kernel/build/kernel.wasm")) ? { __DECLARE_INLINE_KERNEL__: "true" } : {}),
  },
  // BANNER = the legacy `__profDrive` stimulus chain (browser-only, kept so the
  // older rigs still run) + THE CASE EXECUTOR, which is what the corpus in
  // cases.mjs runs through on all three runtimes. The executor is read from
  // disk rather than embedded here so it stays ordinary, editable JavaScript.
  banner: { js: BANNER + "\n" + readFileSync(path.join(HERE, "driver-exec.js"), "utf8") },
  plugins: [plugin],
});
if (r.errors.length) { console.error(r.errors); process.exit(1); }
const applied = Object.keys(PATCHES).filter((f) => readFileSync(OUT, "utf8").includes(`__P`) ).length;
console.log(`build-runtime: ${OUT.split("/").slice(-3).join("/")} from ${path.basename(ROOT)} (${(readFileSync(OUT).length / 1024).toFixed(0)} KB, unminified, ${WEB ? "web" : "mac"}${applied ? "" : " — ⚠ no meters landed"})`);
void DIST;
