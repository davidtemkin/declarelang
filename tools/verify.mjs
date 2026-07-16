#!/usr/bin/env node
// verify — one command, the whole ladder (docs/system-design/verify-and-evals.md §2).
//
// Climbs the verifiability ladder as far as it can and reports everything at
// the failed rung in the unified diagnostic register. Built through rung 4:
// rungs 1–3 (compile / resolve / static analysis + typecheck) and rung 4
// (headless boot: instantiate + settle in Node under a SYNTHETIC deterministic
// text measurer — structure-grade geometry; typography-accurate verification
// belongs to the browser rungs, §2.8). Rungs 5–6 land per the phase plan.
//
//   node tools/verify.mjs <app.declare> [--no-typecheck] [--json] [--rung N]
//                          [--assert <script.mjs>] [--fixtures <dir>]
//                          [--states <states.mjs>] [--baselines <dir>] [--bless]
//
// Typecheck is ON BY DEFAULT (flipped 2026-07-13: the typecheck integration
// landed at zero false positives corpus-wide — verify-and-evals.md §4's gate
// met; its first default-on run caught a real latent bug in tour.declare).
// --no-typecheck opts out. Exit code: 0 = every requested rung passed;
// 1 = a rung failed; 2 = usage/toolchain error.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compile } from "../compiler/dist/compile-node.js";

// ── rung model ────────────────────────────────────────────────────────────
const RUNGS = [
  { n: 1, name: "structure", phases: ["syntax", "structure", "type", "module"], what: "parse, includes, component/attribute shape, value coercion" },
  { n: 2, name: "resolution", phases: ["name"], what: "every bare name resolves" },
  { n: 3, name: "analysis", phases: ["constraint", "typecheck"], what: "constraint deps statically known; { } bodies typecheck" },
  { n: 4, name: "boot", phases: [], what: "headless instantiate + settle (synthetic text metrics)" },
  { n: 5, name: "behavior", phases: [], what: "drive + assert (give --assert <script.mjs>)" },
  { n: 6, name: "visual", phases: [], what: "named states vs baselines (give --states <states.mjs>)" },
];
const BUILT_THROUGH = 6;

function rungOf(phase) {
  const r = RUNGS.find((r) => r.phases.includes(phase));
  return r ? r.n : 1; // an unknown phase is treated as structural — fail early, loudly
}

// ── args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const argVal = (name) => {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq !== undefined) return eq.slice(name.length + 3);
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const flags = {
  typecheck: !args.includes("--no-typecheck"),
  json: args.includes("--json"),
  rung: Number((args.find((a) => a.startsWith("--rung=")) ?? "--rung=6").split("=")[1] ?? 6),
  assert: argVal("assert"),
  fixtures: argVal("fixtures"),
  states: argVal("states"),
  baselines: argVal("baselines"),
  bless: args.includes("--bless"),
  wrap: args.includes("--wrap"),
};
if (!file) {
  console.error("usage: node tools/verify.mjs <app.declare> [--no-typecheck] [--json] [--rung=N]");
  process.exit(2);
}

// ── rungs 1–3: compile ────────────────────────────────────────────────────
let source;
try {
  source = readFileSync(resolve(file), "utf8");
} catch (e) {
  console.error(`verify: cannot read ${file}: ${e.message}`);
  process.exit(2);
}

// Component-probe mode: a bare component-library file (classes, no `App` root)
// isn't a runnable program, so it can't climb the ladder on its own — the known
// gap that let library/src/*.declare drift unverified. `--wrap` synthesizes a
// minimal probe App instantiating each top-level `class … extends` in the file,
// so a component's own source compiles, typechecks, and boots standalone. (An
// abstract base or a child-requiring component may not boot from an empty tag —
// that's rung 4's honest report; rungs 1–3 are the real win here.)
let probeNote = null;
if (flags.wrap && !/^\s*App\s*\[/m.test(source)) {
  const classes = [...source.matchAll(/^\s*class\s+([A-Za-z_]\w*)\s+extends\b/gm)].map((m) => m[1]);
  if (classes.length === 0) {
    console.error(`verify --wrap: no top-level 'class … extends' found in ${file}`);
    process.exit(2);
  }
  const probe = classes.map((c) => `    ${c} [ ],`).join("\n");
  source = `${source}\n\nApp [ width = 480, height = 320,\n${probe}\n    ]\n`;
  probeNote = `component probe: App wrapping ${classes.join(", ")}`;
}

const out = compile(source, { typecheck: flags.typecheck });
const failing = out.diagnostics.filter((d) => d.severity === "error");
const warnings = out.diagnostics.filter((d) => d.severity === "warning");
let failedRung = failing.length ? Math.min(...failing.map((d) => rungOf(d.phase))) : null;

// ── rung 4: headless boot ─────────────────────────────────────────────────
// The synthetic measurer: measure.ts creates one offscreen 2D context lazily
// via `document.createElement("canvas")` — in Node we stand a deterministic
// fake at exactly that seam. Fixed per-character advance (0.6em) + ascent
// 0.8em / descent 0.25em: stable, obviously synthetic, sufficient for
// structure/reactivity/settle checks. Typography-sensitive assertions are out
// of scope at Node rung 4 BY DESIGN (verify-and-evals.md §2.8).
function installSyntheticHost() {
  if (globalThis.document?.__declareSyntheticMeasurer) return;
  const ctx = {
    font: "16px synthetic",
    letterSpacing: "0px",
    measureText(s) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 16);
      const ls = Number(/(-?\d+(?:\.\d+)?)px/.exec(this.letterSpacing)?.[1] ?? 0);
      return {
        width: s.length * size * 0.6 + Math.max(0, s.length - 1) * ls,
        fontBoundingBoxAscent: size * 0.8,
        fontBoundingBoxDescent: size * 0.25,
      };
    },
  };
  globalThis.document = { __declareSyntheticMeasurer: true, createElement: () => ({ getContext: () => ctx }) };
  globalThis.requestAnimationFrame ??= () => 0; // motion needs the driven clock (phase 2)
  globalThis.cancelAnimationFrame ??= () => {};
}

const boot = { ran: false, ok: false, nodes: 0, ms: 0, errors: [], notes: [] };
if (failedRung === null && flags.rung >= 4) {
  boot.ran = true;
  installSyntheticHost();
  // Async failures during boot (a DataSource fetching a relative URL with no
  // host, say) are expected headless — fixtures arrive with rung 5. Capture
  // them as notes, not errors; a SYNCHRONOUS throw is a real rung-4 failure.
  const rejections = [];
  const onRej = (reason) => rejections.push(String(reason?.message ?? reason));
  process.on("unhandledRejection", onRej);
  try {
    const { parseProgram } = await import("../runtime/dist/parser.js");
    const { instantiate, settle } = await import("../runtime/dist/index.js");
    const t0 = performance.now();
    const app = instantiate(parseProgram(out.source));
    settle();
    boot.ms = Math.round((performance.now() - t0) * 10) / 10;
    const walk = (n) => { boot.nodes++; for (const c of n.children ?? []) walk(c); };
    walk(app);
    boot.ok = true;
  } catch (e) {
    boot.errors.push(`boot: ${e?.message ?? e}`);
    failedRung = 4;
  } finally {
    await new Promise((r) => setImmediate(r)); // let queued rejections surface
    process.off("unhandledRejection", onRej);
    for (const r of rejections) boot.notes.push(`async during boot (expected headless; fixtures land at rung 5): ${r}`);
  }
}

// ── rung 5: behavior (drive + assert, real browser) ──────────────────────
const behave = { ran: false, ok: false, failures: [], log: [] };
if (failedRung === null && flags.rung >= 5 && flags.assert !== null) {
  behave.ran = true;
  const { runBehavior } = await import("./verify-behave.mjs");
  const { dirname: dirOf, resolve: resolvePath } = await import("node:path");
  try {
    const r = await runBehavior({
      compiled: { source: out.source, deps: out.deps },
      appDir: dirOf(resolvePath(file)),
      assertPath: flags.assert,
      fixturesDir: flags.fixtures,
    });
    behave.ok = r.ok;
    behave.failures = r.failures;
    behave.log = r.log;
    if (!r.ok) failedRung = 5;
  } catch (e) {
    behave.failures.push(`behavior harness: ${e?.message ?? e}`);
    failedRung = 5;
  }
}

// ── rung 6: named visual states vs blessed baselines ─────────────────────
const visual = { ran: false, ok: false, failures: [], results: [] };
if (failedRung === null && flags.rung >= 6 && flags.states !== null) {
  visual.ran = true;
  const { runStates } = await import("./verify-behave.mjs");
  const { dirname: dirOf, resolve: resolvePath, join: joinPath } = await import("node:path");
  try {
    const r = await runStates({
      compiled: { source: out.source, deps: out.deps },
      appDir: dirOf(resolvePath(file)),
      statesPath: flags.states,
      baselinesDir: flags.baselines ?? joinPath(dirOf(resolvePath(file)), "baselines"),
      bless: flags.bless,
      fixturesDir: flags.fixtures,
    });
    visual.ok = r.ok;
    visual.failures = r.failures;
    visual.results = r.results;
    if (!r.ok) failedRung = 6;
  } catch (e) {
    visual.failures.push(`visual harness: ${e?.message ?? e}`);
    failedRung = 6;
  }
}

const effectiveBuilt = flags.states !== null ? 6 : flags.assert !== null ? 5 : 4;
const topRequested = Math.min(flags.rung, effectiveBuilt);
const climbed = failedRung ? failedRung - 1 : topRequested;

// ── report ────────────────────────────────────────────────────────────────
// Diagnostics print their producer-rendered form (`d.rendered`) — one
// renderer, every consumer shows the same bytes.
const show = (d) => d.rendered ?? `${d.message} [${d.code}]`;

if (flags.json) {
  console.log(JSON.stringify({
    file,
    ok: failedRung === null,
    rungClimbed: climbed,
    rungFailed: failedRung,
    builtThrough: BUILT_THROUGH,
    typecheck: flags.typecheck ? "on" : "off (--no-typecheck)",
    probe: probeNote,
    stats: { constraints: out.deps?.length ?? 0, bootNodes: boot.nodes, bootMs: boot.ms },
    boot: boot.ran ? { ok: boot.ok, errors: boot.errors, notes: boot.notes } : null,
    behavior: behave.ran ? { ok: behave.ok, failures: behave.failures, steps: behave.log } : null,
    visual: visual.ran ? { ok: visual.ok, failures: visual.failures, results: visual.results } : null,
    diagnostics: out.diagnostics,
  }, null, 2));
} else {
  for (const r of RUNGS) {
    if (r.n > flags.rung) break;
    const optionalIdle = (r.n === 5 && !behave.ran) || (r.n === 6 && !visual.ran);
    const mark =
      failedRung != null && r.n === failedRung ? "✗" :
      failedRung != null && r.n > failedRung ? "·" :
      optionalIdle || r.n > effectiveBuilt ? "·" : "✓";
    const note =
      optionalIdle || r.n > effectiveBuilt ? ` — ${r.what}` :
      r.n === 3 ? (flags.typecheck ? " (typecheck on)" : " (typecheck OFF — --no-typecheck)") :
      r.n === 4 && boot.ran && boot.ok ? ` (${boot.nodes} nodes, settled in ${boot.ms} ms, synthetic metrics)` :
      r.n === 5 && behave.ran && behave.ok ? ` (${behave.log.length} steps, real input)` :
      r.n === 6 && visual.ran && visual.ok ? ` (${visual.results.length} states${flags.bless ? ", blessed" : ""})` : "";
    console.log(`  R${r.n} ${mark} ${r.name}${note}`);
    if (failedRung != null && r.n === failedRung) {
      if (r.n === 4) for (const m of boot.errors) console.log(`       ${m}`);
      else if (r.n === 5) for (const m of behave.failures) console.log(`       ${m}`);
      else if (r.n === 6) for (const m of visual.failures) console.log(`       ${m}`);
      else for (const d of failing.filter((d) => rungOf(d.phase) === r.n)) console.log(`       ${show(d)}`);
    }
  }
  if (probeNote) console.log(`  note ${probeNote}`);
  for (const w of warnings) console.log(`  warn ${show(w)}`);
  for (const n of boot.notes) console.log(`  note ${n}`);
  if (failedRung === null) {
    console.log(`  verify: ${file} — clean through R${climbed}` +
      (out.deps?.length ? ` (${out.deps.length} constraints statically wired)` : ""));
  } else {
    console.log(`  verify: ${file} — FAILED at R${failedRung}`);
  }
}
process.exit(failedRung === null ? 0 : 1);
