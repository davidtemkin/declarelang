// The production error-prose strip (tools/internal/error-codes.mjs).
//
// A shipped app carries every DeclareError message it can throw as a string
// literal — esbuild minifies names, never string contents. In a production
// build each message becomes `[Declare E42] <its runtime values>`: the throw,
// the position and every interpolated value survive, and `declare-help E42`
// gives the sentence back. Dev builds keep the prose.
//
// What these pin: the transform is faithful (values kept, prose gone, codes
// stable), the boundaries hold (dev untouched, app-renderable text untouched,
// concatenated and multiline literals left alone), and the round trip works
// (a stripped runtime throws a code the catalog can expand).

import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripSource, skeletonOf, codeFor, findMessages, catalogFor } from "../tools/internal/error-codes.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await test("a message becomes its code plus the values it interpolated — nothing computed is lost", () => {
  const src = 'throw new DeclareError(`${a}.${b} is already bound (by ${c.label}) — drop one`);';
  const { src: out, entries } = stripSource(src);
  assert.equal(entries.length, 1);
  assert.match(out, /\[Declare E[0-9A-F]{6}\]/, "the code is in the emitted literal");
  assert.ok(out.includes("${a}"), "value kept");
  assert.ok(out.includes("${b}"), "value kept");
  assert.ok(out.includes("${c.label}"), "value kept");
  assert.ok(!out.includes("already bound"), "prose gone");
  assert.ok(!out.includes("drop one"), "prose gone");
});

await test("the code is the message's identity — stable across values, different when reworded", () => {
  const a = codeFor(skeletonOf("`${x} is not a component`"));
  const b = codeFor(skeletonOf("`${somethingElse} is not a component`"));
  assert.equal(a, b, "same sentence, different value expressions → one code");
  const c = codeFor(skeletonOf("`${x} is not a COMPONENT`"));
  assert.notEqual(a, c, "reworded message → a new code (it is a different message)");
  assert.match(a, /^E[0-9A-F]{6}$/);
});

await test("nested templates inside a hole survive whole (the shape-resolve case)", () => {
  const src = 'new DeclareError(`${n} names no schema — ${t > 0 ? `declared: ${list.join(", ")}` : "none"} here`)';
  const { src: out } = stripSource(src);
  assert.ok(out.includes('${t > 0 ? `declared: ${list.join(", ")}` : "none"}'), "the whole hole came through: " + out);
  assert.ok(!out.includes("names no schema"), "outer prose gone");
});

await test("the boundaries: concatenated, multiline, and non-Declare messages are left alone", () => {
  // a literal that is only PART of the argument (prose follows via +) — coding
  // it would spend a code and ship the sentence anyway
  const concat = 'console.error("[Declare] " + buildMessage(x));';
  assert.equal(stripSource(concat).entries.length, 0, "concatenated literal skipped");
  // a plain Error is app-renderable text (a DataSource's .error) — never coded
  const plain = 'throw new Error(`the response does not match the schema — ${err}`);';
  assert.equal(stripSource(plain).entries.length, 0, "plain Error untouched");
  // ordinary logging is not a diagnostic
  const log = 'console.error(`some ordinary log about ${x}`);';
  assert.equal(stripSource(log).entries.length, 0, "non-[Declare] console.error untouched");
  // a multiline literal is left rather than mangled
  const multi = "throw new DeclareError(`line one\nline two ${x}`);";
  assert.equal(stripSource(multi).entries.length, 0, "multiline skipped");
});

await test("a [Declare] diagnostic IS coded (the contained-report path)", () => {
  const src = 'console.error(`[Declare] ${phase} a replicated ${n} instance threw: ${e}`);';
  const { src: out, entries } = stripSource(src);
  assert.equal(entries.length, 1, "coded");
  assert.ok(out.includes("${phase}") && out.includes("${e}"), "values kept");
  assert.ok(!out.includes("replicated"), "prose gone");
});

await test("the catalog covers the runtime and answers by code", () => {
  const catalog = catalogFor(resolve(ROOT, "runtime/src"));
  const codes = Object.keys(catalog);
  assert.ok(codes.length > 150, `the runtime carries many coded messages, got ${codes.length}`);
  for (const c of codes) assert.match(c, /^E[0-9A-F]{6}$/);
  // every entry names where it is thrown and what it says
  const sample = catalog[codes[0]];
  assert.ok(sample.message.length > 0 && /\.ts$/.test(sample.file) && sample.line > 0);
});

await test("the committed model carries the catalog — declare-help's source", () => {
  const model = JSON.parse(readFileSync(resolve(ROOT, "docs/declare-model.json"), "utf8"));
  const runtimeErrors = model.spine?.runtimeErrors;
  assert.ok(runtimeErrors !== undefined, "spine.runtimeErrors exists");
  const n = Object.keys(runtimeErrors).length;
  assert.ok(n > 150, `catalog is published, got ${n}`);
  // and it agrees with a fresh scan (derive keeps it fresh; this is the gate)
  const fresh = catalogFor(resolve(ROOT, "runtime/src"));
  assert.deepEqual(
    Object.keys(runtimeErrors).sort(),
    Object.keys(fresh).sort(),
    "the committed catalog matches the runtime's messages — run `npm run derive`"
  );
});

await test("every real runtime message round-trips: strip → code → catalog", () => {
  const catalog = catalogFor(resolve(ROOT, "runtime/src"));
  const src = readFileSync(resolve(ROOT, "runtime/src/data.ts"), "utf8");
  const { entries } = stripSource(src);
  assert.ok(entries.length > 5, "data.ts has coded messages");
  for (const e of entries) {
    assert.ok(catalog[e.code] !== undefined, `${e.code} is in the catalog`);
    assert.equal(catalog[e.code].message, e.message, "same sentence both ways");
  }
});

await test("the strip shrinks the runtime it touches (the whole point)", () => {
  let before = 0, after = 0;
  for (const f of ["data.ts", "instantiate.ts", "attributes.ts", "bind.ts"]) {
    const src = readFileSync(resolve(ROOT, "runtime/src", f), "utf8");
    before += src.length;
    after += stripSource(src).src.length;
  }
  assert.ok(after < before, `stripped sources are smaller (${before} → ${after})`);
});

summarize("error-codes");
