// The native gate: every program in a corpus, rendered by the NATIVE host and
// by Chrome's DOM backend, compared, and held against a recorded baseline.
//
// WHY A BASELINE AND NOT A THRESHOLD. Native text will never be byte-identical
// to Skia's, and the residual differs per program — a page of prose sits higher
// than a page of rectangles. A single global threshold would either pass
// everything or fail the text-heavy programs forever. So each program records
// what it currently is, and the gate fails on REGRESSION against that number.
// Improvements are reported and, with --bless, written back.
//
//   node gate.mjs                 # check against baseline
//   node gate.mjs --bless         # record current numbers as the baseline
//   node gate.mjs --only arc,blur # a subset
//   node gate.mjs --lanes 1       # one program at a time (default: 6 lanes —
//                                 # windows of their own, measured side by side)
//
// The app is navigated IN PROCESS (`__declareBoot`) rather than relaunched, so
// a whole corpus costs one launch — its own, when no controllable host is
// running (window at the back, light appearance, closed at the end).
//
// WHERE THE PROGRAMS COME FROM. The gate measures the tree it sits in, and
// serves it itself. The host opens most programs from disk (`file:`), the way
// a person opens a .declare file; the few in OVER_HTTP it opens from a plain
// static server the gate starts — files and 404s, no compiler — because the
// host compiles for itself and must find includes and assets by relative
// address there too. Chrome, the reference side, loads every program from a
// Declare server the gate starts on the same tree.

import { readFileSync, writeFileSync, existsSync, unlinkSync, statSync } from "node:fs";
import { CTL_IN, CTL_OUT, APP_NAME, hostBinary } from "./app.mjs";
import { execFile, execFileSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import { channel, openLane } from "./channel.mjs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDeclareServer } from "../server/create.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const BASELINE = path.join(HERE, "gate-baseline.json");
const IN = CTL_IN, OUT = CTL_OUT;
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

/** Programs under test. Small probes pin one drawing stage each; the apps are
 *  the integration end — between them they cover the surface the backend has. */
// The DRAWING probes pin one rasterization stage each; the SEAM probes pin one
// Surface capability each, in a state where its ABSENCE shows. That second
// group exists because likeness testing is blind to a missing feature: the
// desktop is shot at scroll 0, where fixed chrome and ordinary chrome sit in
// the same place, so `ignoreScroll` being entirely unimplemented on the native
// backend passed this gate for as long as both have existed (found 2026-07-31
// by diffing the backends' seam coverage, not by any render — see
// test/seam.test.mjs). A capability with no probe is a capability this gate
// cannot report on.
const CORPUS = [
  "test/probe/arc.declare",
  "test/probe/blend.declare",
  "test/probe/blur.declare",
  "test/probe/roundrect.declare",
  "test/probe/vignette.declare",
  "test/probe/ignorescroll.declare",
  "test/probe/pinned-pane.declare",
  "test/probe/blendview.declare",
  "test/probe/frost.declare",
  "test/probe/rotation.declare",
  "test/probe/richtext.declare",
  "test/probe/editable.declare",
  "test/probe/glowclip.declare",   // a glow on a clipping card: the clip host keeps the shadow (2026-09-10)
  // the graphics pass (graphics-pass.md, 2026-09-12): filter tiers, masks, the
  // gradients, aligned fits, the affine, 3D, drawImage, tight line boxes
  "test/probe/textfixes.declare",   // the seven-defect probe (rendering-gaps.md §11), fixed 2026-09-13
  "test/probe/gfx-filter.declare",
  "test/probe/gfx-mask.declare",
  "test/probe/gfx-gradients.declare",
  "test/probe/gfx-fit.declare",
  "test/probe/gfx-affine.declare",
  "test/probe/gfx-transform3d.declare",
  "test/probe/gfx-drawimage.declare",
  "test/probe/gfx-tightline.declare",
  // the text round (2026-09-13/14): ONE row — leading, both clamps, a web face and
  // OpenType figures in a single frame, so the text features cost one live render
  "test/probe/text.declare",
  // the capability pass (2026-09-25): box paint and text arms a renderer can drop
  // without moving a pixel of layout — per-side strokes, four radii, run fills,
  // a tight line in a tall face
  "test/probe/seams-box.declare",
  "test/probe/seams-text.declare",
  "apps/calendar/calendar.declare",
  "apps/lzx-weather/lzx-weather.declare",
  "apps/desktop/desktop.declare",
  "apps/lzx-dashboard/lzx-dashboard.declare",
];

/** The programs the host opens over HTTP rather than from disk: one with no
 *  includes, one that includes a sibling source, and one that hosts other
 *  programs in islands. */
const OVER_HTTP = new Set(["calendar", "lzx-dashboard", "desktop"]);

/** Listen on a free local port; resolves to the origin. */
async function listen(handler) {
  const s = http.createServer(handler);
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  s.unref();
  return `http://127.0.0.1:${s.address().port}`;
}
const declareServer = createDeclareServer({
  mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
  mode: "distro",
});
const WEB = await listen(declareServer.handler);
// a static host and nothing more: a file, a directory's index.html, or 404
const STATIC = await listen((req, res) => {
  let fp;
  try { fp = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname)); }
  catch { res.writeHead(400); return res.end(); }
  if (fp !== ROOT && !fp.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  try {
    if (statSync(fp).isDirectory()) fp = path.join(fp, "index.html");
    res.writeHead(200);
    res.end(readFileSync(fp));
  } catch { res.writeHead(404); res.end(); }
});
/** Where the host opens `prog` from. */
const hostUrl = (prog) => OVER_HTTP.has(path.basename(prog, ".declare"))
  ? `${STATIC}/${prog}` : pathToFileURL(path.join(ROOT, prog)).href;
const via = (prog) => OVER_HTTP.has(path.basename(prog, ".declare")) ? "http" : "file";

const args = process.argv.slice(2);
const bless = args.includes("--bless");
const onlyArg = args.indexOf("--only");
const only = onlyArg >= 0 ? args[onlyArg + 1].split(",") : null;
// SEVERAL PROGRAMS AT ONCE. Each lane (Control.swift, LANES) is a window with
// its own channel and its own runtime thread, so the corpus is spread over a
// few of them and each program is measured in its own window — captured by
// that window's id, never "the frontmost Declare window", which another
// host's window (a variant app from a second tree) can be. `--lanes 1`
// measures one program at a time in the host's main window.
const lanesArg = args.indexOf("--lanes");
const LANES = Math.max(1, lanesArg >= 0 ? Number(args[lanesArg + 1]) || 1 : 6);

async function ctl(cmd) {
  if (existsSync(OUT)) unlinkSync(OUT);
  writeFileSync(IN, cmd + "\n");
  // the reply file can exist before the host has written it: an empty read
  // is "not yet", not an answer (it read as a NaN layer count)
  for (let i = 0; i < 1000; i++) {
    await sleep(0.02);
    if (existsSync(OUT)) { const t = readFileSync(OUT, "utf8").trim(); if (t) return t; }
  }
  throw new Error("no reply — is the app running with DECLARE_CONTROL=1?");
}

/** The layer count, which is this host's cheapest per-program fingerprint
 *  (`geom` → "content WxH layers=N subviews=M"). NaN if it cannot be read. */
async function layerCount(send = ctl) {
  const m = (await send("geom")).match(/layers=(\d+)/);
  return m ? +m[1] : NaN;
}

/** Wait for the program just booted to actually be the one on screen.
 *
 *  The gate navigates IN PROCESS (`__declareBoot`) rather than relaunching —
 *  that is what buys a whole corpus for one launch. It used to follow the
 *  navigation with a flat `sleep(4)` and shoot whatever was there. On a COLD
 *  run (first compile, empty caches) boot can outrun four seconds, and the
 *  shot then captures the PREVIOUS program: measured 2026-07-31, calendar
 *  reported 53.5% differing against a 0.71% baseline — a loud, plausible,
 *  entirely false regression that cost a bisect across two commits to
 *  disbelieve, and which never reproduced once the caches were warm. A timing
 *  race that only fires when cold is the worst kind of number to publish,
 *  because it fires exactly when someone is checking something new.
 *
 *  So: watch the layer count instead of the clock. Wait for it to CHANGE from
 *  the outgoing program's and then hold still for two consecutive reads. Two
 *  programs can coincidentally have the same count, so there is a floor and a
 *  ceiling — and if the ceiling is hit, the row says so rather than quietly
 *  reporting whatever was on screen. */
async function awaitProgram(before, send = ctl) {
  const t0 = Date.now();
  let changed = Number.isNaN(before), stable = 0, last = NaN;
  while (Date.now() - t0 < 20000) {
    await sleep(0.25);
    const n = await layerCount(send);
    if (!changed && n !== before) changed = true;
    stable = n === last ? stable + 1 : 0;
    last = n;
    // A CHANGED count is the strong signal that the new program is up. But
    // re-booting the SAME program (a `--only` rerun, or two corpus entries of
    // equal size) legitimately produces the same count forever, so holding out
    // for a change turns an ordinary rerun into a 20s timeout and a NaN row.
    // Stability is the fallback: quiet for longer, and accept.
    if (changed && stable >= 2 && Date.now() - t0 > 1500) { await sleep(1); return ""; }
    if (stable >= 6 && Date.now() - t0 > 3000) { await sleep(1); return ""; }
  }
  return `settle timeout (layers stuck at ${last}${changed ? "" : ", never changed from " + before})`;
}

// A host of our own when none answers: launched behind whatever the person is
// using, in light mode (headless Chrome's), rendering even while covered.
let ownHost = null;
async function ensureHost() {
  try { if ((await ctlQuick("ping")) === "ok") return; } catch { /* none */ }
  const bin = hostBinary();
  if (bin === null) throw new Error("no native host is built — npm run build:mac");
  ownHost = spawn(bin, [], { detached: true, stdio: "ignore",
    env: { ...process.env, DECLARE_CONTROL: "1", DECLARE_APPEARANCE: "light", DECLARE_URL: hostUrl(CORPUS[0]) } });
  for (let i = 0; i < 150; i++) { await sleep(0.1); try { if ((await ctlQuick("ping")) === "ok") break; } catch { /* booting */ } }
  await ctl("waitload 30");
  await ctl("occlusion ignore");
}
async function ctlQuick(cmd) {
  if (existsSync(OUT)) unlinkSync(OUT);
  writeFileSync(IN, cmd + "\n");
  for (let i = 0; i < 10; i++) { await sleep(0.02); if (existsSync(OUT)) { const t = readFileSync(OUT, "utf8").trim(); if (t) return t; } }
  throw new Error("no reply");
}
await ensureHost();
// the title bar says who is driving the host (Automation.swift); `detach` below
await ctl("attach gate");

const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
const now = {};
const rows = [];
/** Which theme this run measured in — fidelity reads it off the host and makes
 *  the web side match, so it is a property of the run, recorded with the
 *  numbers. See the note under the table. */
let theme = "light";

const execFileP = promisify(execFile);
/** One program, in the window `send` addresses (id `windowId`): navigate there
 *  in process, wait for it to be the program on screen, then compare that
 *  window with Chrome's DOM rendering. */
async function measure(prog, send, windowId, outDir, booted = false) {
  const name = path.basename(prog, ".declare");
  const url = `${WEB}/${prog}`;
  // navigate the running app, in process — then wait for the program itself,
  // not for a guess at how long it takes (awaitProgram: the cold-run race)
  let before = NaN, loaded = "ok";
  if (!booted) {
    before = await layerCount(send);
    await send(`eval __declareBoot(${JSON.stringify(hostUrl(prog))}); 'ok'`);
    // the host's own verdict: `ok` at the new program's first frame, or its error
    // (__declareBoot announces the load before eval returns, so this is this load's)
    loaded = await send("waitload 30", 35000);
  }
  let differing = NaN, structural = NaN, scheme = null;
  let err = loaded === "ok" ? await awaitProgram(before, send) : `load: ${loaded}`.slice(0, 60);
  try {
    if (err) throw new Error(err);
    const { stdout: out } = await execFileP("node", [path.join(HERE, "fidelity.mjs"), url, "--out", outDir],
      { encoding: "utf8", timeout: 180000, env: { ...process.env, DECLARE_WINDOW: String(windowId) } });
    const m = out.match(/differing\s+([\d.]+)%\s+structural\s+([\d.]+)%/);
    if (m) { differing = +m[1]; structural = +m[2]; } else err = "no number";
    scheme = out.match(/\b(dark|light)\b/)?.[1] ?? null;
  } catch (e) { err = (e.message || String(e)).slice(0, 60); }
  return { name, via: via(prog), differing, structural, err, scheme };
}

// Each run captures into directories of its own: /tmp/fidelity is shared by
// every fidelity run on the machine, and a second tree's gate running at the
// same time overwrote this run's pictures between capture and compare (a
// calendar shot scored against an arc page, 99.9% differing).
const OUT_BASE = `/tmp/fidelity-gate-${process.pid}`;
const todo = CORPUS.filter((prog) => !only || only.includes(path.basename(prog, ".declare")));
const results = new Array(todo.length);
// a run that throws still leaves no host of its own behind, nor lanes open
const cleanup = async (lanes) => {
  for (const lane of lanes) { try { await lane.send("detach"); await lane.send("closewindow"); } catch { /* gone */ } }
};
try {
  if (LANES === 1) {
    // the main window: its id is the `*` row of `windows`
    const id = Number((await ctl("windows")).match(/^\* #(\d+)/m)?.[1]);
    for (let i = 0; i < todo.length; i++) results[i] = await measure(todo[i], ctl, id, `${OUT_BASE}-main`);
  } else {
    // each lane opens on its first program and then takes the next unmeasured one
    let next = 0;
    const lanes = [];
    const main = channel();          // one client for the main channel: the lanes are opened through it in turn
    try {
      await Promise.all(Array.from({ length: Math.min(LANES, todo.length) }, async (_, k) => {
        let i = next++;
        // named for this run, so a lane a crashed run left open never blocks the next
        const lane = await openLane(`gate${process.pid}-${k + 1}`, hostUrl(todo[i]), main);
        lanes.push(lane);
        await lane.send("attach gate");
        const v = await lane.send("waitload 30", 35000);
        const out = `${OUT_BASE}-${k + 1}`;
        results[i] = v === "ok" ? await measure(todo[i], lane.send, lane.window, out, true)
          : { name: path.basename(todo[i], ".declare"), via: via(todo[i]), differing: NaN, structural: NaN, err: `load: ${v}`.slice(0, 60), scheme: null };
        while (next < todo.length) { i = next++; results[i] = await measure(todo[i], lane.send, lane.window, out); }
      }));
    } finally { await cleanup(lanes); }
  }
} catch (e) {
  if (ownHost !== null) { try { process.kill(ownHost.pid); } catch { /* gone */ } }
  throw e;
}
for (const r of results) {
  now[r.name] = { differing: r.differing, structural: r.structural, theme: r.scheme ?? theme };
  if (r.scheme) theme = r.scheme;
  rows.push(r);
}

// ── report ──────────────────────────────────────────────────────────────────
const TOL = 0.75;                        // %-points of regression tolerated
let failed = 0, fresh = 0;
console.log("\n  program            via   differing   structural      vs baseline");
console.log("  " + "─".repeat(68));
for (const r of rows) {
  const b = base[r.name];
  let verdict;
  if (r.err) { verdict = "ERROR " + r.err; failed++; }
  else if (!b) { verdict = "(no baseline — record with --bless)"; fresh++; }
  else {
    const d = r.structural - b.structural;
    const sign = d >= 0 ? "+" : "";
    if (d > TOL) { verdict = `REGRESSED ${sign}${d.toFixed(2)}pt`; failed++; }
    else if (d < -TOL) verdict = `improved ${sign}${d.toFixed(2)}pt`;
    else verdict = `ok (${sign}${d.toFixed(2)}pt)`;
  }
  console.log(`  ${r.name.padEnd(18)} ${r.via.padEnd(5)} ${String(r.differing).padStart(7)}%  ${String(r.structural).padStart(8)}%   ${verdict}`);
}
// PROGRAMS THAT RENDER A CLOCK. The date itself cancels — both sides render
// the same instant, so the native-vs-DOM residual is what is measured and a
// moving highlight moves on both. What does NOT cancel is the SHAPE the date
// implies: a 6-week month lays out a row more than a 5-week one, which is more
// glyphs, which is more of the text residual that is this comparison's whole
// noise floor. So the month a baseline was blessed in is recorded with it, and
// a later run says so rather than letting the drift read as a regression.
// THE THEME THE RUN MEASURED IN. Both sides are now held to the same one
// (fidelity reads it off the host and emulates it in Chrome), so a dark run is
// a real measurement rather than a comparison of two themes — but it is not
// necessarily the SAME measurement, because light-on-dark text carries a
// different rasterization residual than dark-on-light. So the theme is recorded
// with the numbers and a run that changes it says so, rather than letting the
// difference read as a regression.
//
// ⚠ This is what the gate could not see on 2026-08-17: run against a host on a
// machine that had gone dark while Chrome stayed light, it reported calendar
// 99.98% differing and desktop 33.27% as REGRESSIONS. Deterministic across
// runs, unmoved by stashing the whole working tree, and entirely false — the
// numbers were the theme. Two days of bisecting a renderer that was fine.
const wasTheme = Object.values(base).map((b) => b.theme).find((t) => t !== undefined);
if (wasTheme !== undefined && wasTheme !== theme && rows.some((r) => !r.err)) {
  console.log(`\n  note: this run measured in ${theme.toUpperCase()} — the baseline was blessed in ${wasTheme}.` +
              `\n        Both sides were held to ${theme}, so the numbers are real; but the text residual` +
              `\n        differs by theme, so re-bless in one theme rather than reading the delta as a regression.`);
}

const CLOCKED = { calendar: () => new Date().toISOString().slice(0, 7) };
for (const [name, stamp] of Object.entries(CLOCKED)) {
  if (now[name] !== undefined) now[name].blessedIn = stamp();
  const was = base[name]?.blessedIn;
  if (!bless && was !== undefined && now[name] !== undefined && was !== stamp()) {
    console.log(`\n  note: ${name} renders the current month — baseline blessed in ${was}, now ${stamp()}.` +
                `\n        A row of layout more or less shifts the text residual; re-bless if the delta is small and stable.`);
  }
}
if (bless) {
  // MERGE, never replace. `now` holds only the programs this run measured, so
  // `--only arc --bless` used to silently delete every other program's
  // baseline — a one-flag way to destroy the record the gate exists to keep.
  // Per-program merge that keeps a `note`: a baseline is sometimes not a clean
  // agreement but a RECORDED HOLE (ignorescroll's number is the size of the
  // native backend's missing setIgnoreScroll), and that context has to survive
  // the next bless or the figure silently reads as "fine".
  const merged = { ...base };
  for (const [name, row] of Object.entries(now)) {
    const note = base[name]?.note;
    merged[name] = note === undefined ? row : { ...row, note };
  }
  // Never record a failed measurement as the thing to compare against.
  for (const [name, row] of Object.entries(merged)) {
    if (row.differing === null || Number.isNaN(row.differing)) delete merged[name];
  }
  writeFileSync(BASELINE, JSON.stringify(merged, null, 2) + "\n");
  const names = Object.keys(now).join(", ");
  console.log(`\n  baseline written: ${BASELINE}\n  updated: ${names}` +
              (only ? `  (the other ${Object.keys(base).length - Object.keys(now).length} kept)` : ""));
}
console.log(`\n  ${rows.length} programs · ${failed} failing · ${fresh} without a baseline\n`);
await ctl("detach");
if (ownHost !== null) { try { await ctl("closewindow"); } catch { /* gone */ } try { process.kill(ownHost.pid); } catch { /* gone */ } }
process.exit(failed > 0 && !bless ? 1 : 0);
