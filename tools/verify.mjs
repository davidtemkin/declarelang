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
//   node tools/verify.mjs <app.declare> [--json] [--rung N]
//                          [--assert <script.mjs>] [--fixtures <dir>]
//                          [--states <states.mjs>] [--baselines <dir>] [--bless]
//
// Exit code: 0 = every requested rung passed; 1 = a rung failed; 2 =
// usage/toolchain error.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { compileTracked } from "../compiler/dist/compile-node.js";
import { programFromCompiled } from "../compiler/dist/program-build.js";

// ── rung model ────────────────────────────────────────────────────────────
const RUNGS = [
  { n: 1, name: "structure", phases: ["syntax", "structure", "type", "module"], what: "parse, includes, class/attribute shape, value coercion" },
  { n: 2, name: "resolution", phases: ["name"], what: "every bare name resolves" },
  { n: 3, name: "analysis", phases: ["constraint", "typecheck"], what: "constraint deps statically known; { } bodies typecheck" },
  { n: 4, name: "boot", phases: [], what: "headless instantiate + settle (synthetic text metrics)" },
  { n: 5, name: "behavior", phases: [], what: "drive + assert (--assert <script.mjs>)" },
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
  json: args.includes("--json"),
  rung: Number((args.find((a) => a.startsWith("--rung=")) ?? "--rung=6").split("=")[1] ?? 6),
  assert: argVal("assert"),
  fixtures: argVal("fixtures"),
  states: argVal("states"),
  baselines: argVal("baselines"),
  bless: args.includes("--bless"),
  wrap: args.includes("--wrap"),
  // --only <file>: verify the whole program, report only the diagnostics in
  // ONE of its files (an include, by the path the author would write it). For
  // an include in a program several people edit at once: "is this red mine?"
  // answered without a scratch harness.
  only: argVal("only"),
  // --boot-budget=ms: how long rung 4 waits for the boot to settle before it
  // stops it and reports what was running (default 15 s)
  bootBudget: Number((args.find((a) => a.startsWith("--boot-budget=")) ?? "--boot-budget=15000").split("=")[1] ?? 15000),
  // --samples: print the sample each data source was fed at rung 4
  samples: args.includes("--samples"),
};
if (!file) {
  console.error("usage: node tools/verify.mjs <app.declare> [--json] [--rung=N] [--only <include>] [--wrap] [--boot-budget=ms] [--samples]");
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

// Class-probe mode: a bare class-library file (classes, no `App` root)
// isn't a runnable program, so it can't climb the ladder on its own — the known
// gap that let library/*.declare drift unverified. `--wrap` synthesizes a
// minimal probe App instantiating each top-level `class … extends` in the file,
// so a class's own source compiles, typechecks, and boots standalone. (An
// abstract base or a child-requiring class may not boot from an empty tag —
// that's rung 4's honest report; rungs 1–3 are the real win here.)
let probeNote = null;
// Both probe decisions below read the SOURCE, so they must not read the doc
// comments: a library file's header block carries runnable examples, and an
// example is not the program. Unstripped, a `App [ … ]` example made the probe
// believe the file was already a whole program (it then parsed a class-only file
// and died at eof), and a `class Spark extends Icon` example would have had the
// probe instantiate a class that exists only inside a comment. Stripped text is
// used for these two regexes ONLY, never for compiling, so the crude strip is safe.
const bare = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const hasApp = /^\s*App\s*\[/m.test(bare);
// A file that declares classes but no App is an INCLUDE, not a program, and the
// parser's honest "expected a class name, got 'eof'" says nothing an author
// can act on. Name the two real moves instead.
if (!flags.wrap && !hasApp && /^\s*class\s+[A-Za-z_]\w*\s*(extends\b|\[)/m.test(bare)) {
  console.error(`verify: ${file} declares classes but no App — it is an include, not a program.`);
  console.error(`  verify the program that includes it (add --only ${file} to see just this file's diagnostics),`);
  console.error(`  or --wrap to probe its classes standalone in a synthesized App.`);
  process.exit(2);
}
if (flags.wrap && !hasApp) {
  // A layout strategy is an ATTRIBUTE, not a child (language §5) — probe it in
  // the `layout:` slot of a view with a couple of children to arrange.
  const decls = [...bare.matchAll(/^\s*class\s+([A-Za-z_]\w*)(?:\s+extends\s+([A-Za-z_]\w*))?\s*\[/gm)]
    .map((m) => ({ name: m[1], base: m[2] ?? "View" }));
  if (decls.length === 0) {
    console.error(`verify --wrap: no top-level class found in ${file}`);
    process.exit(2);
  }
  const probe = decls.map((d) =>
    /Layout$/.test(d.base)
      ? `    probe${d.name}: View [ width = 400, height = 200,\n        layout: ${d.name} [ ],\n        View [ width = 40, height = 20 ],\n        View [ width = 40, height = 20 ],\n        ],`
      : `    ${d.name} [ ],`
  ).join("\n");
  source = `${source}\n\nApp [ width = 480, height = 320,\n${probe}\n    ]\n`;
  probeNote = `class probe: App wrapping ${decls.map((d) => d.name).join(", ")}`;
}

// originDir = the app file's own directory, so `include [ "sibling.declare" ]`
// resolves the way every other surface resolves it (declarec, the dev server,
// boot-static all pass it). Missing here until apps/weather grew an art
// include (2026-08-08) and verify alone could not find a file sitting beside
// the program.
const out = await compileTracked(source, { originDir: dirname(resolve(file)), mainId: resolve(file) });
// --only: keep the diagnostics positioned in the named file. Matched by path
// suffix so `--only rooms/pulse.declare` and `--only pulse.declare` both work;
// the main file itself is `--only <the program file>`. The others are counted,
// not hidden silently — a red run elsewhere still blocks the ladder.
let onlyNote = null;
const allDiagnostics = out.diagnostics;
if (flags.only !== null) {
  const want = flags.only.replace(/^\.\//, "");
  const mainName = resolve(file);
  const inFile = (d) => {
    const f = d.pos?.file;
    if (f === undefined) return mainName.endsWith("/" + want) || mainName === resolve(want);
    return f === want || f.endsWith("/" + want) || resolve(dirname(resolve(file)), f) === resolve(want);
  };
  const hiddenErrs = out.diagnostics.filter((d) => !inFile(d) && d.severity === "error").length;
  const hiddenWarns = out.diagnostics.filter((d) => !inFile(d) && d.severity !== "error").length;
  out.diagnostics = out.diagnostics.filter(inFile);
  onlyNote = `--only ${flags.only}: ${out.diagnostics.length} diagnostic(s) in this file`
    + (hiddenErrs > 0 ? `, ${hiddenErrs} error(s) elsewhere in the program (not shown — they still fail the rung)` : "")
    + (hiddenWarns > 0 ? `, ${hiddenWarns} warning(s) elsewhere (not shown)` : "");
}
const failing = out.diagnostics.filter((d) => d.severity === "error");
const warnings = out.diagnostics.filter((d) => d.severity === "warning");
// Hints are the third tier: the program is correct and the compiler knows a
// shorter way to say it. Shown, never counted against the climb.
const hints = out.diagnostics.filter((d) => d.severity === "hint");
// The rung fails on EVERY error the compile found, shown or not: --only narrows
// what is printed, never what is true (a program with a red sibling room
// cannot boot, and saying R2 ✓ would be a lie the next rung exposes).
const failingAll = allDiagnostics.filter((d) => d.severity === "error");
let failedRung = failingAll.length ? Math.min(...failingAll.map((d) => rungOf(d.phase))) : null;

// The browser rungs boot the PROGRAM form — the parsed, checked, deps-applied
// program every host boots from (host-client's bootHost takes `program`, not a
// source string). Built once, on demand, from the compile the rungs above read;
// rung 4 boots the same program headlessly. Instantiating leaves it untouched.
let builtProgram = null;
async function compiledProgram() {
  if (builtProgram === null) {
    const r = await programFromCompiled(out, { stripPos: false });
    if (r.program == null) throw new Error("program build failed: " + (r.report ?? "no report"));
    builtProgram = r.program;
  }
  return builtProgram;
}

// ── rung 4: headless boot ─────────────────────────────────────────────────
// The program built and settled in Node, with synthetic text metrics, in a
// worker under a time budget (internal/verify-boot.mjs): a boot that does not
// settle is stopped and reported with what it was running. Typography-sensitive
// assertions are out of scope at Node rung 4 BY DESIGN (verify-and-evals.md §2.8).
const boot = { ran: false, ok: false, nodes: 0, ms: 0, errors: [], notes: [], samples: [] };
if (failedRung === null && flags.rung >= 4) {
  boot.ran = true;
  try {
    const { bootInWorker } = await import("./internal/verify-boot.mjs");
    Object.assign(boot, await bootInWorker(await compiledProgram(), { budgetMs: flags.bootBudget }));
    if (!boot.ok) failedRung = 4;
  } catch (e) {
    boot.errors.push(`boot: ${e?.message ?? e}`);
    failedRung = 4;
  }
}


// ── rung 5: behavior (drive + assert, real browser) ──────────────────────
const behave = { ran: false, ok: false, failures: [], log: [] };
if (failedRung === null && flags.rung >= 5 && flags.assert !== null) {
  behave.ran = true;
  const { runBehavior } = await import("./internal/verify-behave.mjs");
  const { dirname: dirOf, resolve: resolvePath } = await import("node:path");
  try {
    const r = await runBehavior({
      compiled: { program: await compiledProgram() },
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
  const { runStates } = await import("./internal/verify-behave.mjs");
  const { dirname: dirOf, resolve: resolvePath, join: joinPath } = await import("node:path");
  try {
    const r = await runStates({
      compiled: { program: await compiledProgram() },
      appDir: dirOf(resolvePath(file)),
      statesPath: flags.states,
      // The default sits beside the STATES file, not the app program: the
      // tests/ convention (operational/verify.md) keeps states.mjs and
      // baselines/ together wherever that folder lives.
      baselinesDir: flags.baselines ?? joinPath(dirOf(resolvePath(flags.states)), "baselines"),
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
    probe: probeNote,
    only: onlyNote,
    stats: { constraints: out.deps?.length ?? 0, bootNodes: boot.nodes, bootMs: boot.ms },
    boot: boot.ran ? { ok: boot.ok, errors: boot.errors, notes: boot.notes, samples: boot.samples ?? [] } : null,
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
  if (onlyNote) console.log(`  note ${onlyNote}`);
  for (const w of warnings) console.log(`  warn ${show(w)}`);
  for (const h of hints) console.log(`  hint ${show(h)}`);
  for (const n of boot.notes) console.log(`  note ${n}`);
  if (flags.samples) for (const s of boot.samples ?? []) console.log(`  sample ${s.source}: ${JSON.stringify(s.value)}`);
  if (failedRung === null) {
    // wired = rows with a non-empty dep set; an empty row is a constraint on
    // the runtime-tracking path (a residue, or the alias/closure DYNAMIC class)
    const wired = out.deps ? out.deps.filter((d) => d.length > 0).length : 0;
    console.log(`  verify: ${file} — clean through R${climbed}` +
      (out.deps?.length ? ` (${wired} of ${out.deps.length} constraints statically wired)` : ""));
    // WHAT R4 CANNOT SEE. Rungs 1–4 run in a synthetic Node backend, so a clean
    // climb is proof the program is well-formed — not that the browser bundle
    // agrees. A field report (2026-09-04) lost more time to this than to every
    // other finding combined: a clean R4, then `Track is not defined` in a real
    // browser. verify.md said so; the verdict line did not, and the verdict is
    // what an author reads. Named here, once, where the good news is delivered.
    if (climbed <= 4) {
      console.log(`  note R1–R4 run in a synthetic backend — real fonts, layout, images and the`);
      console.log(`       browser's own module evaluation are not exercised. Drive it for real:`);
      console.log(`       --assert <script.mjs> (R5), or open it in the dev server.`);
    }
  } else {
    console.log(`  verify: ${file} — FAILED at R${failedRung}`);
  }
}
process.exit(failedRung === null ? 0 : 1);
