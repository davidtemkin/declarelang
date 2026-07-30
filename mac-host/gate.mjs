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
const CORPUS = [
  "apps/probe/arc.declare",
  "apps/probe/blend.declare",
  "apps/probe/blur.declare",
  "apps/probe/roundrect.declare",
  "apps/probe/vignette.declare",
  "apps/calendar/calendar.declare",
  "apps/weather/weather.declare",
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

const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
const now = {};
const rows = [];

for (const prog of CORPUS) {
  const name = path.basename(prog, ".declare");
  if (only && !only.includes(name)) continue;
  const url = `${ORIGIN}/${prog}`;
  // navigate the running app, in process
  await ctl(`eval __declareBoot(${JSON.stringify(url + "?render=mac")}); 'ok'`);
  await sleep(4);                       // boot + first settle (+ any async images)
  let differing = NaN, structural = NaN, err = "";
  try {
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
if (bless) {
  writeFileSync(BASELINE, JSON.stringify(now, null, 2) + "\n");
  console.log(`\n  baseline written: ${BASELINE}`);
}
console.log(`\n  ${rows.length} programs · ${failed} failing · ${fresh} without a baseline\n`);
process.exit(failed > 0 && !bless ? 1 : 0);
