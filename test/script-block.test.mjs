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

await test("`import` is refused as NOT YET, never as a prohibition", async () => {
  // composition.md §2 RULES import-in-a-script-block as the way JS modules
  // arrive (`include` moves Declare declarations, `import` moves JS bindings).
  // It is unbuilt, not unwanted — resolution is deferred with the dev-env rung,
  // and the block is emitted as a `new Function` body where an import statement
  // is illegal outright. A diagnostic that said "cannot import" would contradict
  // the design document; today the same source sprays unresolved names instead,
  // which is worse than either. So: refuse, and say which it is.
  const e = await only(`script {
    import { z } from "./z.js"
    }
App [ Text [ text = "x" ] ]`);
  assert.match(e.message, /cannot import yet/, `it must read as unbuilt; got: ${e.message}`);
  assert.match(e.message, /composition\.md/, "and point at the ruling");
  assert.ok(!/has no meaning|nothing imports it/.test(e.message),
    `it must not borrow the export message's finality; got: ${e.message}`);
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

summarize("script-block");
