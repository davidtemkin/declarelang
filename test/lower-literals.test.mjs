// lower-literals — A COMPILED PROGRAM CARRIES VALUES, NOT LITERAL TEXT
// (compiler/src/lower-literals.ts). The compile ships every literal as the value
// the runtime's own coercion gives it, so a production build needs no literal
// parser — the `literal-parsing` capability rides only with rich text, whose
// inline-view tags are read as the text arrives.
//
// Two checks over the corpus, both of which would otherwise fail silently —
// as a build carrying parsers it did not need:
//   1. the compile lowers everything: no program ships a literal it could not
//      turn into a value (ProgramBuild.unlowered is empty);
//   2. nothing the program wrote is parsed at run time: booted headlessly with
//      the literal sink open, a lowered program coerces no literal of its own —
//      only the tag text rich text reads as it arrives (a literal with no source
//      position) and data shapes, which are declarations, not parsed values.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { approximateMeasurer } from "../compiler/dist/headless.js";
import { HeadlessBackend, provideMeasurer, provideTransport, settle } from "../runtime/dist/index.js";
import { buildProgram } from "../runtime/dist/boot.js";
import { withLiteralSink } from "../runtime/dist/value.js";
import { kernelReady } from "../runtime/dist/reactive.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await kernelReady();
provideMeasurer(approximateMeasurer());
provideTransport(() => Promise.reject(new Error("offline")));

const folder = (dir) => existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".declare")).map((f) => resolve(dir, f)) : [];
const files = [
  ...readdirSync(resolve(ROOT, "apps")).map((d) => resolve(ROOT, "apps", d, d + ".declare")).filter(existsSync),
  ...folder(resolve(ROOT, "apps/docs/demos")),
  ...folder(resolve(ROOT, "test/probe")),
];

const unlowered = [], parsed = [];
for (const f of files) {
  let b;
  try { b = await compileProgram(readFileSync(f, "utf8"), { originDir: dirname(f), mainId: f, facts: true, stripPos: false }); } catch { continue; }
  if (b.program === null) continue;
  const where = relative(ROOT, f);
  for (const u of b.unlowered ?? []) unlowered.push(`${where}:${u.pos?.line}: ${u.why}`);
  withLiteralSink((lit) => {
    if (lit.pos?.line === 0 || lit.kind === "schema") return;   // text read at run time; a data shape
    parsed.push(`${where}:${lit.pos?.line}: ${lit.kind}${lit.kind === "ident" ? " " + lit.name : ""}`);
  }, () => {
    try {
      const app = buildProgram(b.program);
      app.attach(new HeadlessBackend(), null);
      settle();
      app.discard();
    } catch { /* booting is verify's subject; only what it parsed is this test's */ }
  });
}

await test(`the compile ships every literal as its value (${files.length} programs)`, () => {
  assert.deepEqual(unlowered.slice(0, 20), [], `${unlowered.length} literal(s) shipped as text`);
});

await test("a compiled program parses none of its own literals at run time", () => {
  assert.deepEqual(parsed.slice(0, 20), [], `${parsed.length} literal(s) parsed at run time — a position the checker does not coerce`);
});

// A provision is computed at compile time too (program-schema.ts provisionValue),
// so one no form admits — which would provide nothing, every reader falling to
// its default — is refused like the same literal in a declared slot.
await test("a provided value that would provide nothing is refused; every real one ships as its value", async () => {
  const bad = await compileProgram(`App [ textColor = #12, Text [ text = "a" ] ]`, {});
  assert.equal(bad.program, null, "#12 provides nothing");
  assert.match(bad.errors.map((e) => e.message).join("\n"), /textColor = .*would provide nothing/);
  for (const [src, want] of [
    [`App [ textColor = navy, Text [ text = "a" ] ]`, 0x000080],
    [`App [ fontWeight = bold, Text [ text = "a" ] ]`, "bold"],
    [`App [ fontFamily = ["Georgia", "serif"], Text [ text = "a" ] ]`, "Georgia, serif"],
  ]) {
    const ok = await compileProgram(src, {});
    assert.ok(ok.program !== null, `${src}: ${ok.errors.map((e) => e.message).join("; ")}`);
    const v = ok.program.root.attrs[0].value;
    assert.deepEqual([v.kind, v.value], ["value", want], src);
  }
  // a built-in preset ships as its record (lowerThemeNames) — the build then
  // needs no preset table; a theme the program declares stays a name, resolved
  // from its own declaration
  const themed = await compileProgram(`App [ theme = Cupertino, Text [ text = "a" ] ]`, {});
  assert.ok(themed.program !== null, "a theme name is a provision");
  const tv = themed.program.root.attrs[0].value;
  assert.equal(tv.kind, "value", "a built-in preset ships as its record");
  assert.equal(typeof tv.value?.accent, "number", "…with the preset's tokens");
  const own = await compileProgram(`theme Mine [ accent = #112233 ]\nApp [ theme = Mine, Text [ text = "a" ] ]`, {});
  assert.ok(own.program !== null, own.errors.map((e) => e.message).join("; "));
  assert.equal(own.program.root.attrs[0].value.kind, "ident", "a declared theme stays a name");
});

summarize("lower-literals");
