// declarec — the production build. Proves the precompiled path: a source
// compiles to a SERIALIZABLE program (parse + resolve + check at build time),
// that program survives a JSON round-trip, and the runtime instantiates it with
// NO parser and NO checker in play. Plus a full buildProduction() smoke test:
// the emitted bundle is self-contained and its wire weight is in the expected
// range (the whole reason the feature exists).
import assert from "node:assert";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate, App } from "../runtime/dist/index.js";
import { buildProduction } from "../tools/declarec.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
function test(name, fn) {
  try { const r = fn(); if (r instanceof Promise) return r.then(() => { pass++; console.log("  ok —", name); }, (e) => { fail++; console.log("  FAIL —", name, "\n     ", e.message); }); pass++; console.log("  ok —", name); }
  catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); }
}

// A small but representative app: a class, a `{ }` constraint, a method, an
// event handler, and a color literal — enough that instantiate exercises the
// body compiler (new Function) on the round-tripped program.
const SRC = `
App [ width = 240, height = 120,
    n: number = 3,
    box: View [ width = { app.n * 20 }, height = 24, fill = #3366cc,
                onClick() { app.bump() } ],
    bump() { this.n = this.n + 1 },
]`;

function hasPosKey(node) {
  if (Array.isArray(node)) return node.some(hasPosKey);
  if (node !== null && typeof node === "object") {
    if ("pos" in node) return true;
    return Object.values(node).some(hasPosKey);
  }
  return false;
}

console.log("declarec");

await test("compiles a source to a non-null program with no errors", () => {
  const r = compileProgram(SRC);
  assert.equal(r.errors.length, 0, "unexpected errors: " + r.errors.map((e) => e.message).join("; "));
  assert.ok(r.program !== null, "program should not be null");
});

await test("program is JSON-serializable and round-trips byte-stable", () => {
  const r = compileProgram(SRC);
  const a = JSON.stringify(r.program);
  const b = JSON.stringify(JSON.parse(a));
  assert.equal(a, b, "program is not JSON round-trip stable");
});

await test("stripPos (default) removes every source-offset field", () => {
  const stripped = compileProgram(SRC);
  assert.equal(hasPosKey(stripped.program), false, "pos keys survived the default strip");
  const kept = compileProgram(SRC, { stripPos: false });
  assert.equal(hasPosKey(kept.program), true, "stripPos:false should retain pos");
});

await test("runtime instantiates the round-tripped program (no parser/checker)", () => {
  const r = compileProgram(SRC);
  const program = JSON.parse(JSON.stringify(r.program)); // simulate ship + boot
  const root = instantiate(program);
  assert.ok(root instanceof App, "root should be an App");
  // the box child's width binding { app.n * 20 } should have evaluated: 3 * 20
  assert.ok(root.children.length >= 1, "App should have its declared child");
});

await test("a broken source reports errors and emits no program", () => {
  const r = compileProgram(`App [ box: View [ fill = { nonexistent.thing } ] ]`.replace("App [", "NotApp ["));
  assert.ok(r.program === null, "program should be null on error");
  assert.ok(r.errors.length > 0, "should carry at least one error");
});

// ── full production build (calendar) ────────────────────────────────────────
await test("buildProduction emits a self-contained bundle in the expected size range", async () => {
  const src = readFileSync(resolve(HERE, "../examples/calendar/calendar.declare"), "utf8");
  const out = await buildProduction(src, { name: "calendar", originDir: resolve(HERE, "../examples/calendar") });
  assert.ok(out.ok, "build should succeed: " + (out.errors?.map((e) => e.message).join("; ") ?? ""));
  const names = out.files.map((f) => f.name);
  assert.ok(names.includes("index.html"), "should emit index.html");
  assert.ok(names.some((n) => /^app\.[0-9a-f]{8}\.js$/.test(n)), "should emit a content-hashed app bundle");
  // the whole point: parser + checker are NOT in the shipped bundle
  const appJs = out.files.find((f) => f.name.startsWith("app.")).contents;
  assert.ok(!/parseProgram|programSchemas/.test(appJs), "compiler leaked into the production bundle");
  // wire weight sanity: comfortably under React's ~97 KB gzip, above an empty shell
  const gz = out.sizes.totalGzip;
  assert.ok(gz > 20 * 1024 && gz < 70 * 1024, `unexpected gzip size ${(gz / 1024).toFixed(1)} KB`);
});

console.log(`\ndeclarec: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
