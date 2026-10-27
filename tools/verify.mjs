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
//                          [--assert <script.mjs>] [--fixtures <dir>] [--url <address>]
//                          [--states <states.mjs>] [--baselines <dir>] [--bless]
//
// Exit code: 0 = every requested rung passed; 1 = a rung failed; 2 =
// usage/toolchain error.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
// The compiler, loaded behind a preflight: on a fresh checkout without
// `npm install`, a static import died with Node's bare "Cannot find package
// 'typescript'" before a line of this tool ran.
let compileTracked, programFromCompiled;
try {
  ({ compileTracked } = await import("../compiler/dist/compile-node.js"));
  ({ programFromCompiled } = await import("../compiler/dist/program-build.js"));
} catch (e) {
  const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
  if (e?.code === "ERR_MODULE_NOT_FOUND" && /compiler\/dist/.test(String(e.message))) {
    console.error(`declare-verify: the compiler is not built — run \`npm run build\` in ${root}`);
    process.exit(2);
  }
  if (e?.code === "ERR_MODULE_NOT_FOUND") {
    const pkg = /Cannot find package '([^']+)'/.exec(String(e.message))?.[1] ?? "a dependency";
    console.error(`declare-verify: ${pkg} is not installed — run \`npm install\` in ${root}, then try again`);
    process.exit(2);
  }
  throw e;
}

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
// the program: the .declare named (a flag's value — `--rung 4`, `--assert s.mjs`
// — is not it), else the first bare word
// (a served address — --url http://…/app.declare — is not the file)
const local = (a) => !/^[a-z]+:\/\//i.test(a);
const file = args.find((a) => a.endsWith(".declare") && local(a)) ?? args.find((a) => !a.startsWith("--") && local(a));
const argVal = (name) => {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq !== undefined) return eq.slice(name.length + 3);
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const flags = {
  json: args.includes("--json"),
  rung: Number(argVal("rung") ?? 6),
  assert: argVal("assert"),
  fixtures: argVal("fixtures"),
  // --url <address>: drive the app where it is served (a dev server) instead of
  // the host's copy — rung 5 only; the file's rungs still check the source
  url: argVal("url"),
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
  bootBudget: Number(argVal("boot-budget") ?? 15000),
  // --samples: print the sample each data source was fed at rung 4
  samples: args.includes("--samples"),
  // --no-boot: go to the browser rungs without the headless boot — for
  // declare-look, which runs the program in a browser at once and is asked
  // again and again while a program is written
  noBoot: args.includes("--no-boot"),
  // --size WxH [--touch]: the window the headless boot fills (default: a laptop,
  // then a phone held upright, touch). --read PATH.ATTR (repeatable), --outline
  // [PATH], --semantics [PATH]: answered from that boot, no browser.
  size: argVal("size"),
  touch: args.includes("--touch"),
  reads: args.flatMap((a, i) => a === "--read" && args[i + 1] !== undefined ? [args[i + 1]] : a.startsWith("--read=") ? [a.slice(7)] : []),
  outline: optionalVal("outline"),
  semantics: optionalVal("semantics"),
};
/** A flag that may stand alone (true) or name a path (`--outline app.list`). */
function optionalVal(name) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return null;
  const v = args[i + 1];
  return v !== undefined && !v.startsWith("--") && !v.endsWith(".declare") ? v : true;
}
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
  // the `layout:` slot of a view with a couple of children to arrange. The
  // children declare no size: a layout may size what it places (a carousel's
  // pages), and a child that declared its own would then be refused.
  const decls = [...bare.matchAll(/^\s*class\s+([A-Za-z_]\w*)(?:\s+extends\s+([A-Za-z_]\w*))?\s*\[/gm)]
    .map((m) => ({ name: m[1], base: m[2] ?? "View" }));
  if (decls.length === 0) {
    console.error(`verify --wrap: no top-level class found in ${file}`);
    process.exit(2);
  }
  const probe = decls.map((d) =>
    /Layout$/.test(d.base)
      ? `    probe${d.name}: View [ width = 400, height = 200,\n        layout: ${d.name} [ ],\n        View [ fill = #888888 ],\n        View [ fill = #888888 ],\n        ],`
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
// BOTH WINDOWS. With no --size, the boot fills a laptop window and then a phone
// held upright (touch): a program is written for both, and what goes wrong on
// one — a row past the edge, a target too small for a finger — is seen there.
const sized = (() => {
  const m = /^(\d+)x(\d+)$/.exec(flags.size ?? "");
  return m !== null ? [{ size: [Number(m[1]), Number(m[2])], touch: flags.touch, tag: "" }] : null;
})();
const queries = flags.reads.length > 0 || flags.outline !== null || flags.semantics !== null
  ? { reads: flags.reads, outline: flags.outline, semantics: flags.semantics } : null;
boot.layout = []; boot.unbuilt = []; boot.answers = []; boot.where = null;
// WHERE RUNG 4 BOOTS: in Chrome when there is one — the Chrome kept running
// between checks (tools/internal/chrome.mjs), so a boot there costs about what
// one headless did, with real text where headless measures by a stand-in. With
// no Chrome, or DECLARE_HEADLESS_BOOT=1, it boots headless in Node.
const inChrome = await (async () => {
  if (process.env.DECLARE_HEADLESS_BOOT === "1") return false;
  try { (await import("./internal/chrome.mjs")).findChrome(); return true; } catch { return false; }
})();
if (failedRung === null && flags.rung >= 4 && !flags.noBoot) {
  boot.ran = true;
  boot.where = inChrome ? "chrome" : "headless";
  try {
    const program = await compiledProgram();
    const windows = sized ?? [{ size: [1280, 800], touch: false, tag: "" }, { size: [390, 844], touch: true, tag: "phone 390×844: " }];
    const own = (program.classes ?? []).filter((c) => !String(c.pos?.file ?? "").startsWith("library/")).map((c) => c.name);
    let results;
    if (inChrome) {
      const { runBootInBrowser } = await import("./internal/verify-behave.mjs");
      const { dirname: dirOf, resolve: resolvePath } = await import("node:path");
      results = await runBootInBrowser({ compiled: { program }, appDir: dirOf(resolvePath(file)), windows, queries, classes: own, budgetMs: flags.bootBudget });
    } else {
      const { bootInWorker } = await import("./internal/verify-boot.mjs");
      results = [];
      for (const [i, w] of windows.entries()) results.push(await bootInWorker(program, { budgetMs: flags.bootBudget, size: w.size, touch: w.touch, queries: i === 0 ? queries : null }));
    }
    let first = true;
    for (const [i, r] of results.entries()) {
      const w = windows[i];
      if (first) Object.assign(boot, { ...r, layout: [] });
      else {
        boot.ok = boot.ok && r.ok;
        for (const e of r.errors) if (!boot.errors.includes(e)) boot.errors.push(w.tag + e);
        // the same finding at the other size, with other numbers, is one finding
        const gist = (n) => n.replace(/\([^)]*\)/g, "");
        for (const n of r.notes) if (!boot.notes.some((m) => gist(m) === gist(n))) boot.notes.push(w.tag + n);
        boot.unbuilt = boot.unbuilt.filter((c) => r.unbuilt.includes(c));
      }
      for (const l of r.layout ?? []) boot.layout.push(w.tag + l);
      boot.flagged = [...(boot.flagged ?? []), ...(r.flagged ?? [])];
      first = false;
    }
    if (!boot.ok) failedRung = 4;
  } catch (e) {
    boot.errors.push(`boot: ${e?.message ?? e}`);
    failedRung = 4;
  }
}


// The program's own classes (not the library's): which of them a check saw built.
const ownClasses = async () => ((await compiledProgram()).classes ?? []).filter((c) => !String(c.pos?.file ?? "").startsWith("library/")).map((c) => c.name);
// Rung 4's layout questions asked where rungs 5 and 6 drove the program: each
// finding once, where it was first seen; and the classes no check saw built.
const driven = { checks: [], flagged: [] };

// ── rung 5: behavior (drive + assert, real browser) ──────────────────────
const behave = { ran: false, ok: false, failures: [], log: [], writes: [], serviceNote: null };
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
      budgetMs: flags.bootBudget,
      url: flags.url ?? null,
      classes: await ownClasses(),
      skip: [...boot.flagged ?? [], ...driven.checks.flatMap((c) => c.flagged ?? [])],
    });
    driven.checks.push(...(r.checks ?? []));
    behave.ok = r.ok;
    behave.failures = r.failures;
    behave.log = r.log;
    behave.writes = r.writes ?? [];
    // A LIVE SERVICE REMEMBERS. What earlier runs wrote to a service is still
    // there for this one: a script that bought seats meets them sold the next
    // time. Each run's writes are kept by service and time (in the system's temp
    // folder); a run that fails after talking to a service earlier runs wrote to
    // is told so, since its failure may be the service's state, not the program.
    try {
      const { tmpdir } = await import("node:os");
      const { readFileSync: rd, writeFileSync: wr, mkdirSync: mk } = await import("node:fs");
      const { join: jn } = await import("node:path");
      const dir = jn(tmpdir(), "declare-verify"), rec = jn(dir, "writes.json");
      let past = [];
      try { past = JSON.parse(rd(rec, "utf8")); } catch { /* none yet */ }
      const now = Date.now(), hour = 3600_000;
      past = past.filter((w) => now - w.at < hour);
      if (!r.ok) {
        const before = past.filter((w) => (r.talked ?? []).includes(w.origin));
        if (before.length > 0) {
          const n = before.reduce((a, w) => a + w.count, 0), last = Math.max(...before.map((w) => w.at));
          const mins = Math.max(1, Math.round((now - last) / 60_000));
          behave.serviceNote = `this run failed after talking to ${[...new Set(before.map((w) => w.origin))].join(", ")}, which earlier runs wrote to (${n} write${n === 1 ? "" : "s"} in the last hour, the last ${mins} min ago): what they made is still there, so the failure may be the service's state rather than the program — write the script to take what is available now (a free seat, not a fixed one), reset the service if it has a way, or answer from files with --fixtures <dir>`;
        }
      }
      const mine = (r.wrote ?? []).map((origin) => ({ origin, count: (r.writes ?? []).length, at: now }));
      if (mine.length > 0) { mk(dir, { recursive: true }); wr(rec, JSON.stringify([...past, ...mine])); }
    } catch { /* the record is a courtesy: never the run's failure */ }
    if (!r.ok) failedRung = 5;
  } catch (e) {
    behave.failures.push(e?.constructor?.name === "VerifyAssertion" ? e.message : `behavior harness: ${e?.message ?? e}`);
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
      budgetMs: flags.bootBudget,
      classes: await ownClasses(),
      skip: [...boot.flagged ?? [], ...driven.checks.flatMap((c) => c.flagged ?? [])],
    });
    driven.checks.push(...(r.checks ?? []));
    visual.ok = r.ok;
    visual.failures = r.failures;
    visual.results = r.results;
    if (!r.ok) failedRung = 6;
  } catch (e) {
    visual.failures.push(e?.constructor?.name === "VerifyAssertion" ? e.message : `visual harness: ${e?.message ?? e}`);
    failedRung = 6;
  }
}

// what the driven checks found that the boot did not: each finding once, where
// first seen; and the program's classes built nowhere — at boot or in any
// state the scripts reached — so never checked
const untagged = (l) => l.replace(/^[a-z]+ \d+×\d+: /, "");
const known = new Set(boot.layout.map(untagged));
const drivenLayout = [];
for (const c of driven.checks) for (const l of c.layout ?? []) {
  if (known.has(untagged(l))) continue;
  known.add(untagged(l));
  drivenLayout.push(`${c.where}: ${l}`);
}
const knownNotes = new Set(boot.notes.map(untagged));
const drivenNotes = [];
for (const c of driven.checks) for (const n of c.notes ?? []) {
  if (knownNotes.has(untagged(n))) continue;
  knownNotes.add(untagged(n));
  drivenNotes.push(`${c.where}: ${n}`);
}
const stillUnbuilt = driven.checks.length === 0 ? boot.unbuilt
  : boot.unbuilt.filter((cls) => driven.checks.every((c) => (c.unbuilt ?? []).includes(cls)));
const layoutCount = boot.layout.length + drivenLayout.length;

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
    boot: boot.ran ? { ok: boot.ok, errors: boot.errors, notes: boot.notes, layout: boot.layout, unbuilt: stillUnbuilt, answers: boot.answers, samples: boot.samples ?? [] } : null,
    driven: driven.checks.length > 0 ? { checks: driven.checks.length, layout: drivenLayout, notes: drivenNotes } : null,
    behavior: behave.ran ? { ok: behave.ok, failures: behave.failures, steps: behave.log } : null,
    visual: visual.ran ? { ok: visual.ok, failures: visual.failures, results: visual.results } : null,
    diagnostics: out.diagnostics,
  }, null, 2));
} else {
  // layout findings never fail a rung (a judgement, not an error), so the rung
  // that found them says how many — a ✓ above them read as "nothing to see"
  const findings = (n) => n === 0 ? "" : ` — ${n} layout finding${n === 1 ? "" : "s"} below`;
  for (const r of RUNGS) {
    if (r.n > flags.rung) break;
    const optionalIdle = (r.n === 5 && !behave.ran) || (r.n === 6 && !visual.ran);
    const mark =
      failedRung != null && r.n === failedRung ? "✗" :
      failedRung != null && r.n > failedRung ? "·" :
      optionalIdle || r.n > effectiveBuilt ? "·" : "✓";
    const note =
      optionalIdle || r.n > effectiveBuilt ? ` — ${r.what}` :
      r.n === 4 && boot.ran && boot.ok ? ` (${boot.nodes} nodes, in ${boot.where === "chrome" ? "Chrome, real text" : "Node, stand-in text"}${sized ? "" : ", a laptop and a phone"})${findings(boot.layout.length)}` :
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
  if (behave.serviceNote) console.log(`  note ${behave.serviceNote}`);
  if (behave.writes.length > 0) {
    const shown = [...new Set(behave.writes)];
    console.log(`  note the script sent ${behave.writes.length} write${behave.writes.length === 1 ? "" : "s"} to the live service (${shown.slice(0, 4).join(", ")}${shown.length > 4 ? ", …" : ""}) — what they made stays there; --fixtures <dir> answers requests from files instead, so a run leaves nothing behind (verify.md)`);
  }
  for (const n of drivenNotes) console.log(`  note ${n}`);
  for (const l of boot.layout) console.log(`  layout ${l}`);
  for (const l of drivenLayout) console.log(`  layout ${l}`);
  if (stillUnbuilt.length > 0) {
    const names = `${stillUnbuilt.slice(0, 12).join(", ")}${stillUnbuilt.length > 12 ? ", …" : ""}`;
    if (driven.checks.length > 0) console.log(`  note never built — at boot or in any state the scripts reached (${driven.checks.length} checked) — so never checked for layout: ${names}`);
    else console.log(`  note not built at boot, so not checked here: ${names} — they appear once data arrives or the state changes; an assert script (R5) or a states script (R6) that reaches them has them checked there`);
  }
  for (const a of boot.answers) console.log(a);
  if (flags.samples) for (const s of boot.samples ?? []) console.log(`  sample ${s.source}: ${JSON.stringify(s.value)}`);
  if (failedRung === null) {
    // wired = rows with a non-empty dep set; an empty row is a constraint on
    // the runtime-tracking path (a residue, or the alias/closure DYNAMIC class)
    const wired = out.deps ? out.deps.filter((d) => d.length > 0).length : 0;
    console.log(`  verify: ${file} — clean through R${climbed}` +
      (out.deps?.length ? ` (${wired} of ${out.deps.length} constraints statically wired)` : "") +
      (layoutCount > 0 ? `, with ${layoutCount} layout finding${layoutCount === 1 ? "" : "s"} to look at (the layout lines)` : ""));
    // WHAT R4 CANNOT SEE. Rungs 1–4 run in a synthetic Node backend, so a clean
    // climb is proof the program is well-formed — not that the browser bundle
    // agrees. A field report (2026-09-04) lost more time to this than to every
    // other finding combined: a clean R4, then `Track is not defined` in a real
    // browser. verify.md said so; the verdict line did not, and the verdict is
    // what an author reads. Named here, once, where the good news is delivered.
    if (climbed === 4 && boot.where === "headless") {
      console.log(`  note R4 booted in Node (no Chrome found, or DECLARE_HEADLESS_BOOT=1): the layout is the`);
      console.log(`       runtime's own, but text is measured by a stand-in, so the checks that rest on`);
      console.log(`       text did not run, and nothing was painted.`);
    } else if (climbed === 4) {
      console.log(`  note R4 booted the program as it starts; a screen it reaches only after a press or`);
      console.log(`       data is checked by driving it there: --assert <script.mjs> (R5) asks the same layout`);
      console.log(`       questions wherever the script settles, and --states <states.mjs> (R6) in each state.`);
    }
  } else {
    console.log(`  verify: ${file} — FAILED at R${failedRung}`);
  }
}
process.exit(failedRung === null ? 0 : 1);
