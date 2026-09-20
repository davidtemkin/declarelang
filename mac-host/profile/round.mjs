// round — the before/after run: every case in cases.mjs, on every runtime
// asked for, against BOTH trees, with the results held to each other.
//
//   node mac-host/profile/round.mjs --targets chrome,chrome-canvas,mac,ios \
//        --before ~/Code/Declare-Before --after ~/Code/Declare-After [--cases a,b]
//
// WHAT "BEFORE" AND "AFTER" ARE. Two working copies, each with the meters
// placed BY HAND in its own source (runtime/src/meters.ts and the points named
// there), because the two runtimes share almost no code and a meter injected by
// string-matching compiled JS lands in places that do not mean the same thing.
// Main itself carries none of this and is never measured directly.
//
// THE LANDMARK CHECK IS THE POINT OF THIS FILE. Before any pair of numbers is
// reported, the two runs must have recorded the SAME app-level landmarks the
// SAME number of times (meters.ts `mark`, placed on the work each stimulus
// provokes). A settle time is only comparable if the two runs did the same
// thing, and nothing in a runtime meter can tell you they did: a case whose
// query cycled 24 times in one tree and 20 in the other produces two perfectly
// believable numbers whose difference means nothing. A mismatch here VOIDS the
// row — it is not a warning at the bottom of a table.

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CASES, BY_NAME, plan } from "./cases.mjs";
import { checkRun, checkPair } from "./checks.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const TARGETS = flag("targets", "chrome").split(",");
const TREES = {
  before: path.resolve(flag("before", path.join(process.env.HOME ?? "", "Code/Declare-Before"))),
  after: path.resolve(flag("after", path.join(process.env.HOME ?? "", "Code/Declare-After"))),
};
const ONLY = flag("cases", "") ? flag("cases", "").split(",") : null;
const REPS = Number(flag("reps", "1"));
const RESULTS = path.join(HERE, "results");
mkdirSync(RESULTS, { recursive: true });

for (const [label, dir] of Object.entries(TREES)) {
  if (!existsSync(path.join(dir, "runtime/src/meters.ts")))
    fail(`${label} tree at ${dir} has no runtime/src/meters.ts — it is not an instrumented measurement copy`);
}
function fail(msg) { console.error("round: " + msg); process.exit(1); }

// ── the per-target runners ───────────────────────────────────────────────────
// Each returns a run record for one (case, tree). They are thin: the case says
// what happens, the executor performs it, this decides where.

async function runChrome(desc, treeDir, { render }) {
  const { runCaseInChrome } = await import("./exec-chrome.mjs");
  return runCaseInChrome(desc, treeDir, { render });
}

// THE MAC HOST LOADS ITS PROGRAM OVER HTTP. The app is not a served tree — it
// is an app — but the programs it runs are fetched, so each tree needs a server
// of its own and each host has to be pointed at the right one. Skipping this is
// what left both hosts sitting on "Could not load this program" at the default
// 127.0.0.1:8260, which has nothing behind it.
const macOrigins = {};
async function macOrigin(treeDir) {
  if (macOrigins[treeDir]) return macOrigins[treeDir];
  const http = await import("node:http");
  const { createDeclareServer } = await import(path.join(treeDir, "server/create.mjs"));
  const srv = createDeclareServer({
    mountSpecs: [{ prefix: "/", dir: treeDir }, { prefix: "/declare/", dir: treeDir, platform: true }],
    mode: "distro",
  });
  const hs = http.createServer(srv.handler).on("upgrade", srv.upgrade);
  await new Promise((r) => hs.listen(0, "127.0.0.1", r));
  macOrigins[treeDir] = `http://127.0.0.1:${hs.address().port}`;
  macServers.push(hs);
  return macOrigins[treeDir];
}
const macServers = [];

async function runMac(desc, treeDir) {
  const { runCaseOnMac } = await import("./exec-mac.mjs");
  // Each tree has its OWN host app and its OWN control pipe (bake-mac.mjs), so
  // the pipe is derived from the tree and never the ambient one — that is how a
  // round could otherwise measure one app twice and label the second run with
  // the other tree's name.
  return runCaseOnMac(desc, { tree: treeDir, origin: await macOrigin(treeDir) });
}

async function runIOS(desc, treeDir) {
  const { runCaseOnDevice } = await import("./exec-ios.mjs");
  return runCaseOnDevice(desc, treeDir);
}

const RUNNERS = {
  chrome: (d, t) => runChrome(d, t, { render: "dom" }),
  "chrome-canvas": (d, t) => runChrome(d, t, { render: "canvas" }),
  mac: runMac,
  ios: runIOS,
};

// ── the round ────────────────────────────────────────────────────────────────
const cases = (ONLY ? ONLY.map((n) => BY_NAME[n] ?? fail(`no such case: ${n}`)) : CASES);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = { stamp, targets: TARGETS, trees: TREES, rows: [], voided: [], skipped: [] };

for (const target of TARGETS) {
  const runner = RUNNERS[target] ?? fail(`unknown target: ${target}`);
  const p = plan(target === "chrome-canvas" ? "chrome" : target);
  for (const desc of cases) {
    if (p.skips.some((s) => s.name === desc.name)) {
      const why = p.skips.find((s) => s.name === desc.name).why;
      out.skipped.push({ target, case: desc.name, why });
      console.log(`  skip  ${target} ${desc.name} — ${why}`);
      continue;
    }
    const pair = {};
    for (const tree of ["before", "after"]) {
      const runs = [];
      for (let r = 0; r < REPS; r++) {
        const run = await runner(desc, TREES[tree]);
        const problems = checkRun(desc, run);
        if (problems.length) {
          out.voided.push({ target, case: desc.name, tree, problems });
          console.log(`  VOID  ${target} ${desc.name} [${tree}] — ${problems.join("; ")}`);
        }
        runs.push(run);
      }
      // the median run by settle time, so one hiccup does not decide a row
      runs.sort((x, y) => (x.meters?.settle?.ms ?? 0) - (y.meters?.settle?.ms ?? 0));
      pair[tree] = runs[Math.floor(runs.length / 2)];
    }
    const mismatch = checkPair(desc, pair.before, pair.after);
    if (mismatch.length) {
      out.voided.push({ target, case: desc.name, tree: "pair", problems: mismatch });
      console.log(`  VOID  ${target} ${desc.name} — ${mismatch.join("; ")}`);
      continue;
    }
    out.rows.push({ target, case: desc.name, before: pair.before, after: pair.after });
    const b = pair.before.meters, a = pair.after.meters;
    const pc = (x, y) => (x === 0 ? "—" : ((y - x) / x * 100).toFixed(0) + "%");
    console.log(`  ${target.padEnd(14)} ${desc.name.padEnd(20)} settle ${b.settle.ms.toFixed(0)} → ${a.settle.ms.toFixed(0)} ms (${pc(b.settle.ms, a.settle.ms)})   paint ${b.paint.ms.toFixed(0)} → ${a.paint.ms.toFixed(0)} ms   area ${b.paint.area ?? "—"} → ${a.paint.area ?? "—"}`);
  }
}

for (const hs of macServers) hs.close();

const file = path.join(RESULTS, `round-${stamp}.json`);
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`\n${out.rows.length} comparable row(s), ${out.voided.length} voided, ${out.skipped.length} skipped`);
console.log(file);
