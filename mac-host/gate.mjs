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
//
// The app is navigated IN PROCESS (`__declareBoot`) rather than relaunched, so
// a whole corpus costs one launch. Requires DECLARE_CONTROL=1 and a dev server.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(HERE, "gate-baseline.json");
const ORIGIN = process.env.DECLARE_ORIGIN ?? "http://127.0.0.1:8260";
const IN = "/tmp/declare-ctl.in", OUT = "/tmp/declare-ctl.out";
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
  "test/probe/richtext.declare",
  "test/probe/editable.declare",
  "apps/calendar/calendar.declare",
  "apps/lzx-weather/lzx-weather.declare",
  "apps/controls/controls.declare",
  "apps/desktop/desktop.declare",
];

const args = process.argv.slice(2);
const bless = args.includes("--bless");
const onlyArg = args.indexOf("--only");
const only = onlyArg >= 0 ? args[onlyArg + 1].split(",") : null;

async function ctl(cmd) {
  if (existsSync(OUT)) unlinkSync(OUT);
  writeFileSync(IN, cmd + "\n");
  for (let i = 0; i < 200; i++) {
    await sleep(0.02);
    if (existsSync(OUT)) return readFileSync(OUT, "utf8").trim();
  }
  throw new Error("no reply — is the app running with DECLARE_CONTROL=1?");
}

/** The layer count, which is this host's cheapest per-program fingerprint
 *  (`geom` → "content WxH layers=N subviews=M"). NaN if it cannot be read. */
async function layerCount() {
  const m = (await ctl("geom")).match(/layers=(\d+)/);
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
async function awaitProgram(before) {
  const t0 = Date.now();
  let changed = Number.isNaN(before), stable = 0, last = NaN;
  while (Date.now() - t0 < 20000) {
    await sleep(0.25);
    const n = await layerCount();
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

const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
const now = {};
const rows = [];

for (const prog of CORPUS) {
  const name = path.basename(prog, ".declare");
  if (only && !only.includes(name)) continue;
  const url = `${ORIGIN}/${prog}`;
  // navigate the running app, in process — then wait for the program itself,
  // not for a guess at how long it takes (awaitProgram: the cold-run race)
  const before = await layerCount();
  await ctl(`eval __declareBoot(${JSON.stringify(url + "?render=mac")}); 'ok'`);
  let differing = NaN, structural = NaN, err = await awaitProgram(before);
  try {
    if (err) throw new Error(err);
    const out = execFileSync("node", [path.join(HERE, "fidelity.mjs"), url],
                             { encoding: "utf8", timeout: 180000 });
    const m = out.match(/differing\s+([\d.]+)%\s+structural\s+([\d.]+)%/);
    if (m) { differing = +m[1]; structural = +m[2]; } else err = "no number";
  } catch (e) { err = (e.message || String(e)).slice(0, 60); }
  now[name] = { differing, structural };
  rows.push({ name, differing, structural, err });
}

// ── report ──────────────────────────────────────────────────────────────────
const TOL = 0.75;                        // %-points of regression tolerated
let failed = 0, fresh = 0;
console.log("\n  program            differing   structural      vs baseline");
console.log("  " + "─".repeat(62));
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
  console.log(`  ${r.name.padEnd(18)} ${String(r.differing).padStart(7)}%  ${String(r.structural).padStart(8)}%   ${verdict}`);
}
// PROGRAMS THAT RENDER A CLOCK. The date itself cancels — both sides render
// the same instant, so the native-vs-DOM residual is what is measured and a
// moving highlight moves on both. What does NOT cancel is the SHAPE the date
// implies: a 6-week month lays out a row more than a 5-week one, which is more
// glyphs, which is more of the text residual that is this comparison's whole
// noise floor. So the month a baseline was blessed in is recorded with it, and
// a later run says so rather than letting the drift read as a regression.
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
process.exit(failed > 0 && !bless ? 1 : 0);
