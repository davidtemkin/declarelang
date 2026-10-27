// verify-apps — CI truth-maintenance for the whole corpus (docs/system-design/
// verify-and-evals.md §2.10). Every runnable example must climb the fast rungs
// (1–4: compile, resolve, typecheck, headless boot) on every `npm test`, and every
// library source must do the same under the probe wrapper (--wrap).
// This is the mechanized version of "the examples still work" — a compiler or
// runtime change that breaks a real program fails here, in seconds, no browser.
//
// The slow rungs (5–6: real input, pixels) stay in the perceptual suite and in
// per-app assert/state scripts, run pre-release — not in the main suite. They are
// not optional, only deferred: test/ladder.test.mjs (`npm run test:ladder`)
// climbs them for every app that ships an assert/states script.
import { spawn } from "node:child_process";
import { readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { programDirs, programFile } from "../tools/internal/program-dirs.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;

// Each verify is its own process and shares nothing with the others, so they
// run a few at a time; results are reported in the order they are listed.
function verify(file, extra = []) {
  return new Promise((done) => {
    const p = spawn("node", [join(ROOT, "tools/verify.mjs"), file, "--json", "--rung", "4", ...extra], { cwd: ROOT });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", () => {
      try { done(JSON.parse(out)); } catch { done({ ok: false, _crash: (err || out || "").slice(-300) }); }
    });
  });
}
// two at a time: three Chromes' worth of boots beside the rest of the suite
// timed out on the heaviest apps (an empty reason, a different app each run)
const AT_ONCE = 2;
async function verifyAll(jobs) {
  const results = new Array(jobs.length);
  let next = 0;
  const worker = async () => { while (next < jobs.length) { const i = next++; results[i] = await verify(...jobs[i]); } };
  await Promise.all(Array.from({ length: AT_ONCE }, worker));
  return results;
}

function test(name, fn) {
  try { fn(); pass++; console.log("  ok —", name); }
  catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); }
}

function assertClean(rep, label) {
  if (!rep.ok) {
    const why = rep._crash ?? (rep.diagnostics ?? []).filter((d) => d.severity === "error").map((d) => `${d.code} ${d.message}`).join("; ") ?? `failed at R${rep.rungFailed}`;
    throw new Error(`${label}: did not climb to R4 — ${why}`);
  }
  if (rep.rungClimbed < 4) throw new Error(`${label}: only climbed to R${rep.rungClimbed}`);
}

// ── every runnable example ───────────────────────────────────────────────────
const apps = programDirs(ROOT).map((d) => relative(ROOT, programFile(d)));

// A directory whose ENTRY is an HTML page (not a name-matched program) escapes
// the sweep above; its programs are runnable examples all the same and list
// themselves here. (two-way: the embedding showcase — three apps, one page.)
const htmlEntryPrograms = [
  "apps/two-way/dial.declare",
  "apps/two-way/pulse.declare",
  "apps/two-way/crossings.declare",
  // the platform's own programs (library/platform-apps): booted by the hosts,
  // never browsed to, and runnable examples all the same
  "library/platform-apps/error/error.declare",
  "library/platform-apps/inspector/inspector.declare",
  "library/platform-apps/viewer/viewer.declare",
];

// ── every library source, under the probe wrapper ───────────────────────────
const libDir = join(ROOT, "library");
const libFiles = existsSync(libDir)
  ? readdirSync(libDir).filter((n) => n.endsWith(".declare")).map((n) => join("library", n))
  : [];

const examples = [...apps, ...htmlEntryPrograms];
const reports = await verifyAll([...examples.map((f) => [f]), ...libFiles.map((f) => [f, ["--wrap"]])]);
examples.forEach((f, i) => test(`example ${f} — clean through R4 (compile, typecheck, boot)`, () => assertClean(reports[i], f)));
libFiles.forEach((f, i) => test(`library ${f} — clean through R4 under --wrap probe`, () => assertClean(reports[examples.length + i], f)));

console.log(`\nverify-apps: ${pass} passed, ${fail} failed (${apps.length} apps, ${libFiles.length} library files)`);
process.exit(fail === 0 ? 0 : 1);
