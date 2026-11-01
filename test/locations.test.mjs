// test/locations.test.mjs — every diagnostic names where its author wrote it.
//
// The compiler merges a program's included files into one text and works on
// that; each phase's findings are mapped back to the file and line they came
// from. A phase that forgets reports the merged program's line (an 835-line
// file said "line 7047"), or no file at all (an included file's error read as
// the main file's). Found one path at a time in eval runs (2026-10-31); this
// holds every phase to it at once: the same mistake, written in an included
// file and in the main file below an include, must name that file and line.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compile } from "../compiler/dist/compile-node.js";
import { buildProgram, settle } from "../runtime/dist/index.js";
import { test, summarize } from "./harness.mjs";

// Each case: a class body line (it lands on line 3 of its file) that one phase
// refuses or warns about, and what the message should say.
const CASES = [
  { phase: "parse", line: "    junk: any = ({}),", says: /expected a value/ },
  { phase: "structure: unknown attribute", line: "    widht = 10,", says: /widht/ },
  { phase: "structure: a member twice", line: "    home: View [ width = 1, height = 1 ],\n    home() { },", says: /'home' is already/, line2: 4, first: 3 },
  { phase: "resolution: an unknown name", line: "    x = { nosuch + 1 },", says: /nosuch/ },
  { phase: "typecheck", line: "    x = { \"a\" * 2 },", says: /DECLARE|arithmetic|number/ },
  { phase: "accessibility warning: an unnamed field", line: "    f: TextInput [ width = 10 ],", says: /no name|accessibilityLabel/ },
  { phase: "hint: centring by hand", line: "    x = { (parent.width - width) / 2 },", says: /center/ },
  { phase: "warning: tangled decisions", line: "    x = { app.width > 1 ? (app.width > 2 ? 1 : (app.width > 3 ? 2 : 3)) : 4 },", says: /nested|tangled|three deep|choices/, warning: true },
];

const PAD = "// line 1\n";   // so the case's own line is line 3 in every file

async function diagnosticsOf(src, dir) {
  const r = await compile(src, { originDir: dir });
  return [...(r.errors ?? []), ...(r.warnings ?? []), ...(r.hints ?? [])];
}

for (const c of CASES) {
  await test(`${c.phase}: named by its file and line, in an included file and below an include`, async () => {
    const dir = mkdtempSync(join(tmpdir(), "declare-loc-"));
    // 1. in an included file
    writeFileSync(join(dir, "part.declare"), `${PAD}class P [ width = 100, height = 50,\n${c.line}\n    ]\n`);
    writeFileSync(join(dir, "other.declare"), `${PAD}class Q [ width = 1, height = 1 ]\n`);
    const inc = (await diagnosticsOf(`include [ "part.declare" ]\nApp [ width = 300, height = 200, P [ ] ]`, dir)).filter((d) => c.says.test(d.message));
    assert.ok(inc.length > 0, `no diagnostic matched ${c.says} for the included file`);
    const want = c.line2 ?? 3;
    assert.equal(inc[0].pos?.file, "part.declare", `${inc[0].message}`);
    assert.equal(inc[0].pos?.line, want, `${inc[0].message}`);
    if (c.first !== undefined) assert.match(inc[0].message, new RegExp(`first at line ${c.first}, col`), "the first one's line is the file's too");
    // 2. in the main file, below an include that shifts the merged program's lines
    const main = `include [ "other.declare" ]\nclass P [ width = 100, height = 50,\n${c.line}\n    ]\nApp [ width = 300, height = 200, P [ ] ]`;
    const own = (await diagnosticsOf(main, dir)).filter((d) => c.says.test(d.message));
    assert.ok(own.length > 0, `no diagnostic matched ${c.says} in the main file`);
    assert.equal(own[0].pos?.file, undefined, `the main file's own line names no file: ${own[0].message}`);
    assert.equal(own[0].pos?.line, want, `${own[0].message}`);
    if (c.first !== undefined) assert.match(own[0].message, new RegExp(`first at line ${c.first}, col`));
  });
}

// A top-level declaration, not a class body: a schema naming one that doesn't exist.
await test("schema: a schema's refusal is named by its file and line", async () => {
  const dir = mkdtempSync(join(tmpdir(), "declare-loc-"));
  writeFileSync(join(dir, "shapes.declare"), `${PAD}\nschema Row [ id: string, owner: Nobody ]\n`);
  const d = (await diagnosticsOf(`include [ "shapes.declare" ]\nApp [ width = 300, height = 200 ]`, dir)).filter((x) => /Nobody/.test(x.message));
  assert.ok(d.length > 0, "no diagnostic named Nobody");
  assert.equal(d[0].pos?.file, "shapes.declare", d[0].message);
  assert.equal(d[0].pos?.line, 3, d[0].message);
});

await test("an include inside an included file: named by the innermost file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "declare-loc-"));
  writeFileSync(join(dir, "a.declare"), `include [ "b.declare" ]\nclass A [ width = 1, height = 1 ]\n`);
  writeFileSync(join(dir, "b.declare"), `${PAD}class B [ width = 1, height = 1,\n    widht = 3 ]\n`);
  const d = (await diagnosticsOf(`include [ "a.declare" ]\nApp [ width = 300, height = 200, B [ ] ]`, dir)).filter((x) => /widht/.test(x.message));
  assert.equal(d[0]?.pos?.file, "b.declare", d[0]?.message);
  assert.equal(d[0].pos.line, 3);
});

// A refusal that lands on a line inside a library class names the author's own
// line too: the library's line says where it landed, the author's what caused it.
await test("a runtime refusal inside a library class names the author's line that built it", async () => {
  const r = await compile(`App [ width = 400, height = 200,
    s: Slider [ x = 20, y = 20, width = 200, accessibilityLabel = "Volume",
        layout: SimpleLayout [ axis = y ] ] ]`);
  assert.deepEqual((r.errors ?? []).map((e) => e.message), []);
  assert.throws(() => buildProgram(r.program), /library\/slider\.declare:\d+:\d+\) — in the Slider at line 2, col 5/);
});

// A constraint cycle names its loop, not only the rule that hit the limit —
// which can sit downstream of it (a layout reading two widths that feed each
// other). "Depends on its own output" alone sent authors hunting (Codex Venue 2).
await test("a constraint cycle names the loop, in the order values flow", async () => {
  const r = await compile(`App [ width = 400, height = 300,
    box: View [ layout: SimpleLayout [ axis = y ],
        a: View [ height = 20, width = { app.box.b.width + 10 } ],
        b: View [ height = 20, width = { app.box.a.width + 10 } ] ] ]`);
  assert.deepEqual((r.errors ?? []).map((e) => e.message), []);
  assert.throws(() => { buildProgram(r.program); settle(); }, /The loop: View\.width \(at app\.box\.(a|b)\) → View\.width \(at app\.box\.(b|a)\) → View\.width \(at app\.box\.(a|b)\)/);
});

summarize("locations");
