// test/declare-help.test.mjs — the help tool KEEPS ITS TWO CONTRACTS.
//
// declare-help (tools/declare-help.mjs, design: docs/system-design/
// declare-help.md) promises: negative knowledge is a success (exit 0), a true
// miss is honest (exit 1, naming what was searched), answers are deterministic
// and budgeted, and its manners are the compiler's own — imported from the
// shared teach module, never copied. These gates hold each promise against the
// live model, so a schema change that orphans an answer fails here, not in an
// agent's session.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CSS_ATTRIBUTE_HINTS } from "../runtime/dist/teach.js";
import { test, summarize } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOOL = join(ROOT, "tools/declare-help.mjs");
const model = JSON.parse(readFileSync(join(ROOT, "docs/declare-model.json"), "utf8"));

/** Run the tool; never throws — returns { code, out } for both outcomes. */
function help(...args) {
  try {
    return { code: 0, out: execFileSync("node", [TOOL, ...args], { encoding: "utf8" }) };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

// ── every foreign name in the hint table answers, verbatim ───────────────────
await test("every CSS_ATTRIBUTE_HINTS key answers with its own hint", () => {
  for (const [name, hint] of Object.entries(CSS_ATTRIBUTE_HINTS)) {
    const r = help(name);
    assert.equal(r.code, 0, `'${name}' should answer (exit 0)`);
    assert.ok(r.out.includes(hint), `'${name}' should carry its hint verbatim, got:\n${r.out}`);
  }
});

// ── every schema class and attribute resolves ────────────────────────────────
await test("every kernel and library class answers as a class", () => {
  const classes = [...Object.keys(model.spine.schemas), ...Object.keys(model.spine.librarySchemas)];
  for (const cls of classes) {
    const r = help(cls);
    assert.equal(r.code, 0, `class '${cls}' should answer`);
    assert.ok(r.out.startsWith(`${cls} — `), `class '${cls}' should lead with its own name, got:\n${r.out.slice(0, 120)}`);
  }
});

await test("every attribute of every schema resolves through the scoped form", () => {
  for (const [tier, schemas] of [["kernel", model.spine.schemas], ["library", model.spine.librarySchemas]]) {
    for (const [cls, s] of Object.entries(schemas)) {
      for (const attr of Object.keys(s.attrs)) {
        const r = help(`${cls}.${attr}`);
        assert.equal(r.code, 0, `${tier} ${cls}.${attr} should answer`);
        assert.ok(!r.out.includes("has no member"), `${cls}.${attr} should not read as a miss:\n${r.out.slice(0, 200)}`);
      }
    }
  }
});

// ── the concept table: every synonym target resolves, every negative answers ─
await test("every concept synonym points at a live reference entry", () => {
  for (const [syn, target] of Object.entries(model.spine.concepts.synonyms)) {
    assert.ok(model.reference[target], `synonym '${syn}' targets '${target}', which is not in the reference`);
    const r = help(syn);
    assert.equal(r.code, 0, `concept '${syn}' should answer`);
  }
});

await test("negative knowledge is a SUCCESS: each entry answers its triggers, exit 0", () => {
  for (const neg of model.spine.concepts.negative) {
    for (const term of neg.terms) {
      const r = help(term);
      assert.equal(r.code, 0, `negative term '${term}' should exit 0 — the absence IS the answer`);
      assert.ok(r.out.trim().startsWith("No "), `'${term}' should state the absence first, got:\n${r.out.slice(0, 120)}`);
    }
  }
});

// ── the compiler's manners: near-miss, scoped exactly as check.ts would ──────
await test("Text.lineheight produces the did-you-mean, naming the real entry", () => {
  const r = help("Text.lineheight");
  assert.equal(r.code, 0);
  assert.ok(r.out.includes("did you mean 'lineHeight'"), r.out);
  assert.ok(r.out.includes("Text.lineHeight"), "should hand back the scoped id to ask next");
});

await test("a diagnostic code answers; an out-of-register code says so", () => {
  const known = help("DECLARE7001");
  assert.equal(known.code, 0);
  assert.ok(known.out.includes("constraint analysis"), known.out);
  const unknown = help("DECLARE9999");
  assert.equal(unknown.code, 0, "an out-of-register code is an ANSWER (the register's bounds), not a miss");
  assert.ok(unknown.out.includes("no diagnostic"), unknown.out);
});

// ── the two honesty contracts ────────────────────────────────────────────────
await test("a true miss exits 1 and names what was searched", () => {
  const r = help("quantum entanglement");
  assert.equal(r.code, 1, "nothing answers this — it must exit 1");
  assert.ok(r.out.includes("searched"), "the miss must say what was searched");
  assert.ok(r.out.includes("reference"), r.out);
});

await test("deterministic: same query, same bytes", () => {
  for (const q of ["View", "Slider.value", "scrolls", "borderWidth", "leading"]) {
    assert.equal(help(q).out, help(q).out, `'${q}' must be byte-stable`);
  }
});

// ── the budget: no answer exceeds its ceiling without saying so ──────────────
await test("answers hold the line budget, eliding by pointer", () => {
  for (const q of ["View", "App", "Segmented", "DataGrid"]) {
    const lines = help(q).out.trimEnd().split("\n");
    assert.ok(lines.length <= 41, `'${q}' answered ${lines.length} lines — the budget is 40 (+1 elision pointer)`);
    if (lines.length === 41 || lines.at(-1).includes("elided")) {
      assert.ok(help(q, "--all").out.length > help(q).out.length, `'${q}' elides, so --all must lift it`);
    }
  }
});

// ── the shared { } vocabulary answers as its own tier ────────────────────────
await test("every shared interface, alias, function and namespace answers", () => {
  const sh = model.spine.types.shared;
  for (const [list, label] of [["interfaces", "interface"], ["aliases", "alias"], ["functions", "function"], ["namespaces", "namespace"]]) {
    for (const x of sh[list] ?? []) {
      const r = help(x.name);
      assert.equal(r.code, 0, `shared ${label} '${x.name}' should answer`);
      assert.ok(!r.out.includes("appears in"), `'${x.name}' should answer as a tier, not fall to retrieval:\n${r.out.slice(0, 120)}`);
    }
  }
  const draw = help("draw");
  assert.ok(draw.out.includes("draw(d: Draw)"), "lowercase 'draw' should reach the Draw interface");
});

// ── --help states the contract, not just the flags ───────────────────────────
await test("--help exits 0 and states both flags and the exit-code contract", () => {
  for (const invocation of [["--help"], []]) {
    const r = help(...invocation);
    assert.equal(r.code, 0);
    for (const needle of ["--all", "--json", "exit codes", "true miss"]) {
      assert.ok(r.out.includes(needle), `help text must mention '${needle}'`);
    }
  }
});

// ── --json answers as data ───────────────────────────────────────────────────
await test("--json returns parseable data for hit and miss alike", () => {
  const hit = JSON.parse(help("Text.lineHeight", "--json").out);
  assert.equal(hit.kind, "entry");
  assert.equal(hit.entry.id, "Text.lineHeight");
  const miss = JSON.parse(help("quantum entanglement", "--json").out);
  assert.equal(miss.kind, "miss");
});

// ── a synonym's answer says it is one ────────────────────────────────────────
// `declare-help Popover` printed Menu with no word about why — read as a wrong
// lookup rather than an answer (field report 2026-08-21).
await test("a concept synonym announces the Declare name it answers with", () => {
  const r = help("Popover");
  assert.equal(r.code, 0);
  assert.ok(r.out.startsWith("'Popover' is not a Declare name — the Declare concept is Menu:"), `got:\n${r.out.slice(0, 160)}`);
  assert.ok(r.out.includes("\nMenu — class"));
  // an exact concept name carries no preface
  assert.ok(help("Menu").out.startsWith("Menu — "));
});

await test("a class member table shows method SIGNATURES, not bare names", () => {
  const r = help("Dataset");
  assert.ok(r.out.includes("insert(path: string | readonly (string | number)[], index: number, v: unknown): void — method"), `got:\n${r.out}`);
});

await test("a host global answers with the compiler's own refusal and the Declare way", () => {
  const r = help("localStorage");
  assert.equal(r.code, 0);
  assert.ok(r.out.startsWith("'localStorage' is the host's, not Declare's"), `got:\n${r.out.slice(0, 160)}`);
  assert.ok(r.out.includes("hold the state in a Dataset"));
});

await test("a runtime error code expands to its sentence (the production strip's other half)", async () => {
  const model = JSON.parse(readFileSync(resolve(ROOT, "docs/declare-model.json"), "utf8"));
  const code = Object.keys(model.spine.runtimeErrors ?? {})[0];
  assert.ok(code, "the model publishes runtime error codes");
  const r = help(code);
  assert.equal(r.code, 0, "a known code is answered");
  assert.match(r.out, new RegExp(code), "names the code");
  assert.match(r.out, /a runtime error/, "says what it is");
  assert.match(r.out, /thrown at \w+\.ts:\d+/, "points at the throw site");
  // an unknown code is answered too (informative, like a DECLARE#### miss)
  const miss = help("EFFFFFF");
  assert.match(miss.out, /no runtime error EFFFFFF/);
});

summarize("declare-help");
