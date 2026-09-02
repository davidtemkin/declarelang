// test/script-block.test.mjs — `export` in a script { } block, refused where
// it is WRITTEN.
//
// From the eval report of 2026-08-03 (and A8 of the 07-29 round before it):
// someone wrote `export function …` inside a script block on their first
// compile, out of ordinary module habit, and got eighteen unresolved-name
// errors pointing into LIBRARY source — none of them at the export.
//
// The mechanism: a script block's source is appended to the typecheck
// scaffold, and one top-level `export` turns that file from a script into a
// TypeScript MODULE. Every ambient declaration the scaffold made — every
// component, every member of the program — stops being a global at that
// instant, so everything the program mentions becomes unknown at once. The
// blast radius is the whole program and the cause is invisible in all of it.
//
// It is refused rather than stripped: a script block has no importers, and its
// top-level names are ALREADY visible to every { } in the program. `export`
// does not describe a mechanism that exists here, so accepting it quietly
// would teach a wrong model of where those names go.
import assert from "node:assert/strict";
import { compile } from "../compiler/dist/compile-node.js";
import { test, summarize } from "./harness.mjs";

const errs = async (src) => ((await compile(src, { originDir: process.cwd() })).errors ?? []);
const only = async (src) => {
  const e = await errs(src);
  assert.equal(e.length, 1, `expected exactly ONE error; got ${e.length}:\n  ${e.map((x) => x.message).join("\n  ")}`);
  return e[0];
};

await test("an exported function is refused, once, at the keyword", async () => {
  const e = await only(`script {
    export function twice(n: number): number { return n * 2 }
    }
App [ n: number = 4, Text [ text = { "" + twice(app.n) } ] ]`);
  assert.match(e.message, /'export' has no meaning in a script \{ \} block/);
  assert.equal(e.pos.line, 2, "the line of the export, not of some innocent symbol");
  assert.equal(e.pos.col, 5, "the column of the keyword itself");
});

await test("the SPRAY is gone — no phantom errors naming other symbols", async () => {
  // this is the whole point: before, `Text` and `twice` were both reported
  // unresolved at line 5, and the export was reported nowhere
  const e = await errs(`script {
    export function twice(n: number): number { return n * 2 }
    }
App [ n: number = 4, Text [ text = { "" + twice(app.n) } ] ]`);
  assert.ok(!e.some((x) => /'Text'/.test(x.message)), `'Text' is fine; got: ${e.map((x) => x.message).join(" | ")}`);
  assert.ok(!e.some((x) => /nothing in scope is named 'twice'/.test(x.message)), "the function is declared right there");
});

await test("every export FORM is caught", async () => {
  const forms = {
    "export const": `export const K = 2`,
    "export class": `export class M { n = 1 }`,
    "export let": `export let n = 1`,
    "export default": `function f(): number { return 1 }\n    export default f`,
    "export list": `function f(): number { return 1 }\n    export { f }`,
  };
  for (const [what, body] of Object.entries(forms)) {
    const e = await only(`script {\n    ${body}\n    }\nApp [ Text [ text = "x" ] ]`);
    assert.match(e.message, /script \{ \} block cannot export|'export' has no meaning/, `${what}: ${e.message}`);
  }
});

await test("`import` is REAL on a bundling host — an unresolvable specifier fails the bundle, by name", async () => {
  // composition.md §2's ruling, BUILT 2026-08-24: import-in-a-script-block is
  // the way JS modules arrive, bundled at the compile host's seam. The happy
  // paths are pinned in test/script-module.test.mjs; here, the failure shape:
  // a specifier nothing can resolve is a bundle error naming it — never the
  // old "cannot import yet", and never a spray of unresolved names.
  const e = await only(`script {
    import { z } from "./no-such-module.js"
    }
App [ Text [ text = "x" ] ]`);
  assert.match(e.message, /script imports failed to bundle/, `got: ${e.message}`);
  assert.ok(!/cannot import yet/.test(e.message), "the not-yet era is over");
});

await test("the same block WITHOUT export compiles clean", async () => {
  assert.deepEqual((await errs(`script {
    function twice(n: number): number { return n * 2 }
    }
App [ n: number = 4, Text [ text = { "" + twice(app.n) } ] ]`)).map((e) => e.message), []);
});

await test("a nested export is untouched — only the TOP level modules the file", async () => {
  // `export` inside a class body is a member modifier in some dialects and a
  // syntax error in none of ours; either way it does not turn the scaffold
  // into a module, so the check must not reach for it
  assert.deepEqual((await errs(`script {
    function make(): object { const o = { exported: 1 }; return o }
    }
App [ Text [ text = { "" + make() } ] ]`)).map((e) => e.message), []);
});

await test("a LATER block reports at its own position, not the first one's", async () => {
  // two blocks means the offset arithmetic has to be per-block; a shared base
  // would put the second block's error inside the first
  const e = await only(`script {
    function a(): number { return 1 }
    }
script {
    export function b(): number { return 2 }
    }
App [ Text [ text = { "" + (a() + b()) } ] ]`);
  assert.equal(e.pos.line, 5, `the SECOND block's export; got line ${e.pos.line}`);
});

await test("blocks share ONE scope at runtime — a block-2 function calls block-1's (2026-09-02)", async () => {
  // The checker concatenates the blocks ambient, so this always COMPILED —
  // but per-block evaluation gave each block its own closure and its own
  // early `return`, and the first cross-block call threw ReferenceError.
  // The no-imports path now merges like the imports path: one body, one
  // bindings return.
  const { build, settle } = await import("../runtime/dist/index.js");
  const r = await compile(`
script { function one(n: number): number { return n + 1 } }
script { let base = 100
    function two(n: number): number { return one(n) * 2 + base } }
App [ width=1, height=1, t: Text [ text = { "" + two(5) } ] ]`);
  assert.deepEqual(r.errors.map((e) => e.message), []);
  const app = build(r.source);
  settle();
  assert.equal(app.t.text, "112", "cross-block call AND cross-block state resolve lexically");
});

await test("the delimiter crossings name their rewrite — braces hold the code, brackets hold the files", async () => {
  const say = async (src) => (await compile(src + "\nApp [ width=1, height=1 ]")).errors[0]?.message ?? "clean";
  assert.match(await say(`script { "helpers.ts" }`), /holds one string and no code — braces hold the script ITSELF; for script from a file write script \[ "helpers\.ts" \]/);
  assert.match(await say(`script [ helpers ]`), /a script file path is a quoted string — script \[ "helpers\.ts" \]; for inline code, braces hold the script itself/);
  assert.match(await say(`script { "not a path" }`), /a lone string does nothing/);
});

summarize("script-block");
