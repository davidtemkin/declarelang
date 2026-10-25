// slim-signals — a production build leaves a runtime module out only on a signal
// with no exceptions (docs/system-design/app-slimming.md, "The signals"): a class
// the program uses, a global its code names, syntax its source contains, or the
// build's settings. Generated from the runtime's own tables, every way the
// language gives a program to reach each class, global and construct must be
// seen; and every import from core into a slimmable module is on a reviewed list,
// so a new one fails here until it is classified.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { CAPABILITIES, neededCapabilities } from "../compiler/dist/capabilities.js";
import { REGISTRY_MANIFEST } from "../runtime/dist/registry.js";
import { THEME_PRESET_NAMES } from "../runtime/dist/themes.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOM = { render: "dom", debug: false, inspector: false, compiler: false, hosts: false };

async function facts(src) {
  const b = await compileProgram(src, { facts: true });
  assert.equal(b.errors.length, 0, src + "\n" + b.errors.map((e) => e.message).join("\n"));
  return { used: new Set(b.usedClasses), needed: neededCapabilities(b.facts, DOM), facts: b.facts };
}

// ── classes: every way to use one puts it in the permitted set ────────────────
const CLASSES = REGISTRY_MANIFEST.map((e) => e.name).filter((n) => n !== "App");
// `use` keeps a class a program may construct; an abstract base is refused there
const CONCRETE = CLASSES.filter((n) => n !== "Layout");
const CLASS_WAYS = {
  "named as a value": (C) => `App [ k: any = { ${C} } ]`,
  "tested with instanceof": (C) => `App [ b: boolean = { (this as any) instanceof ${C} } ]`,
  "aliased in a method": (C) => `App [ onInit() { const K: any = ${C}; console.log(K) } ]`,
  "kept with use": (C) => `use [ ${C} ]\nApp [ ]`,
};
for (const [way, src] of Object.entries(CLASS_WAYS)) {
  await test(`every built-in class ${way} is permitted`, async () => {
    const missed = [];
    for (const C of way === "kept with use" ? CONCRETE : CLASSES) if (!(await facts(src(C))).used.has(C)) missed.push(C);
    assert.deepEqual(missed, []);
  });
}
await test("a class classFor picks is permitted", async () => {
  const { used } = await facts(`App [ d: Dataset [ contents = { [{ k: true }] } ],\n View [ datapath = :d[], classFor = { :k ? TextInput : View } ] ]`);
  assert.ok(used.has("TextInput"));
});
await test("a built-in a literal rich text names as a tag is permitted", async () => {
  const { used } = await facts(`App [ Markdown [ text = "a <Image/> b" ] ]`);
  assert.ok(used.has("Image"));
});

// ── globals: naming one carries what it reaches ───────────────────────────────
// the body's names that come from the effects module, read from the runtime's
// own import of it (expr.ts), not listed by hand
const EFFECT_GLOBALS = (() => {
  const m = /import\s*\{([^}]*)\}\s*from\s*"\.\/effects\.js"/.exec(readFileSync(resolve(HERE, "../runtime/dist/expr.js"), "utf8"));
  assert.ok(m !== null, "expr.js imports the decoration constructors from effects.js");
  return m[1].split(",").map((x) => x.trim()).filter(Boolean);
})();
const GLOBAL_WAYS = {
  "named in a body": (G) => `App [ k: any = { ${G} } ]`,
  "aliased": (G) => `App [ onInit() { const f: any = ${G}; console.log(f) } ]`,
  "named in a script": (G) => `script {\n  function pick(): any { return ${G} }\n}\nApp [ k: any = { pick() } ]`,
};
for (const [way, src] of Object.entries(GLOBAL_WAYS)) {
  await test(`every decoration constructor ${way} carries effects`, async () => {
    const missed = [];
    for (const G of EFFECT_GLOBALS) if (!(await facts(src(G))).needed.has("effects")) missed.push(G);
    assert.deepEqual(missed, []);
  });
  await test(`every theme preset ${way} survives the table's cut`, async () => {
    const missed = [];
    for (const P of THEME_PRESET_NAMES) if (!(await facts(src(P))).facts.mentions.has(P)) missed.push(P);
    assert.deepEqual(missed, []);
  });
}
await test("a direct eval keeps every global: effects, and the whole theme table", async () => {
  const { needed, facts: f } = await facts(`App [ k: any = { eval("blur") } ]`);
  assert.ok(needed.has("effects"));
  assert.ok(f.mentions.has("eval"));
});

// ── syntax: each construct carries its capability ─────────────────────────────
const SYNTAX = [
  ["a replicating path", `App [ d: Dataset [ contents = { [1, 2] } ], View [ datapath = :d[] ] ]`, ["replication"]],
  ["a two-way binding", `App [ d: Dataset [ contents = { ({ s: "" }) } ], TextInput [ datapath = :d, text <-> :s ] ]`, ["editor"]],
  ["virtualize written on a replicated child", `App [ d: Dataset [ contents = { [1, 2] } ], View [ datapath = :d[], virtualize = false ] ]`, ["virtualize", "replication"]],
  ["classFor written on a replicated child", `App [ d: Dataset [ contents = { [1] } ], View [ datapath = :d[], classFor = { View } ] ]`, ["class-for", "replication"]],
];
for (const [what, src, caps] of SYNTAX) {
  await test(`${what} carries ${caps.join(" and ")}`, async () => {
    const { needed } = await facts(src);
    for (const c of caps) assert.ok(needed.has(c), `${c} is not carried`);
  });
}

// ── nothing is keyed on a view's members ──────────────────────────────────────
// An attribute, a method or a handler can be set from data (rich text tags,
// createView props) or by a name code assembles; so no capability's signal is a
// member's name, a mention of one, or a value written into one.
await test("no capability is decided by a view member", () => {
  const MEMBER_KINDS = ["methods", "attributes", "attributesUnless", "writes", "dynamicSlots", "scoped"];
  const bad = [];
  for (const c of CAPABILITIES) for (const t of c.when) for (const k of MEMBER_KINDS) if (t[k] !== undefined) bad.push(`${c.id}.${k}`);
  // the two replication slots are read from the replicated child's element, which
  // the compile sees whole: a `slots` signal, not a member
  assert.deepEqual(bad, []);
});

// ── every import from core into a slimmable module is classified ──────────────
// A left-out module is a stand-in. Core reaching one must either be reached only
// under that module's own signal (a class's code through the class), or call an
// export proven inert when the module is absent. This is the reviewed list; an
// edge not on it fails here until it is placed.
const CLASSIFIED = {
  // reached only under the capability's own signal
  "instantiate→animator": "class", "registry→animator": "class", "instantiate→animator-group": "class",
  "registry→animator-group": "class", "instantiate→spring": "class", "registry→spring": "class",
  "instantiate→state": "class", "registry→state": "class", "registry→tween-layout": "class",
  "registry→islands": "class", "text-input→editor": "class (TextInput is an Editor)",
  "instantiate→editor": "syntax (<->)", "instantiate→class-for": "slot (classFor)", "instantiate→virtualize": "slot (virtualize)",
  "instantiate→replication": "syntax ([])", "expr→effects": "global (the constructors are the body's names)",
  "rich-text→rich-doc": "build (dom)", "rich-text→rich-views": "class (rich text) or build (canvas)",
  "dom-backend→rich-dom": "class (rich text); the inert three proven: only rich text sets the slots they read",
  "instantiate→routing": "syntax (unrouted), class (rich text), build",
  "instantiate→checker": "build: an untrusted tree is checked; a production program is trusted",
  "value→literal-parsing": "syntax (an unlowered literal)",
  "view→size-report": "build (debug); inert",
  "boot→bridge": "build; inert", "expr→datapath-scanner": "build (debug, hosting); inert",
  "services→inspector-service": "build; the Inspect façade answers ready() false",
  "semantics→replication": "inert, proven: only a Replicator writes the blocks table",
};
await test("every import from core into a slimmable module is classified", () => {
  const RT = resolve(HERE, "../runtime/dist");
  const owner = new Map();
  for (const c of CAPABILITIES) if (c.subset === undefined) for (const m of c.modules) if (!m.startsWith("browser/")) owner.set(m, c.id);
  const edges = new Set();
  for (const f of readdirSync(RT)) {
    if (!f.endsWith(".js")) continue;
    const mod = f.slice(0, -3);
    if (owner.has(mod)) continue;                       // a slimmable module's own imports ride its closure
    for (const m of readFileSync(resolve(RT, f), "utf8").matchAll(/import\s*(?:\{[^}]*\}|\*\s+as\s+\w+)\s*from\s*"\.\/([\w-]+)\.js"/g)) {
      const cap = owner.get(m[1]);
      if (cap !== undefined) edges.add(`${mod}→${cap}`);
    }
  }
  const unclassified = [...edges].filter((e) => !(e in CLASSIFIED)).sort();
  const gone = Object.keys(CLASSIFIED).filter((e) => !edges.has(e)).sort();
  assert.deepEqual(unclassified, [], "an import from core into a slimmable module: place it on the list, with what makes it sound");
  assert.deepEqual(gone, [], "a classified edge no longer exists: take it off the list");
});

summarize("slim-signals");
