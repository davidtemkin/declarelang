// test/hydrate.test.mjs — the COMPACTION ROUND-TRIP invariant, over the real
// app corpus. A production build elides what a checked program repeats
// (tools/declarec.mjs compactValue: empty member arrays, `name`/`def` nulls,
// false flags) and hydrateProgram restores the structural fields at load. The
// contract this locks: for every program we ship,
//
//   canon(hydrate(parse(stringify(program, compactValue)))) === canon(program)
//
// where canon() serializes with the false-only flags dropped on BOTH sides —
// because hydrate deliberately does NOT restore those (`hex`, `many`, …;
// every reader treats absence as false, which this equivalence encodes rather
// than papers over). Any field the compaction drops that hydration cannot
// restore — a new parser field missing from ELIDE_EMPTY's mirror in
// hydrate.ts, a null that isn't `name`/`def` — fails here, per app, with the
// first divergence, long before it becomes a production-only render bug.

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { hydrateProgram } from "../runtime/dist/hydrate.js";
import { compactValue, ELIDE_FALSE } from "../tools/declarec.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// the corpus: every apps/<dir>/<dir>.declare (the directory-program rule)
const APPS = ["calendar", "controls", "desktop", "docs", "homepage", "inspector",
  "lzx-calendar", "lzx-weather", "sampler", "tracker", "viewer"]
  .map((d) => ({ name: d, file: path.join(ROOT, "apps", d, d + ".declare") }))
  .filter((a) => existsSync(a.file));

/** Canonical serialization for equivalence: false flags elided on both sides
 *  (the deliberate non-restoration), object keys SORTED (hydration re-adds
 *  fields at the end of insertion order — position is not part of the
 *  contract, presence and value are), everything else verbatim. */
const canon = (p) => JSON.stringify(p, (k, v) => {
  if (v === false && ELIDE_FALSE.has(k)) return undefined;
  if (v !== null && typeof v === "object" && !Array.isArray(v))
    return Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]]));
  return v;
});

/** First index where two long strings diverge, with context — a findable report. */
function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `at char ${i}: …${a.slice(Math.max(0, i - 60), i + 60)}… vs …${b.slice(Math.max(0, i - 60), i + 60)}…`;
}

for (const app of APPS) {
  await test(`compact→hydrate round-trips ${app.name}`, async () => {
    const built = await compileProgram(readFileSync(app.file, "utf8"), { originDir: path.dirname(app.file), stripPos: true });
    assert.ok(built.program !== null, "corpus app should compile: " + (built.report ?? ""));
    const before = canon(built.program);
    const compacted = JSON.parse(JSON.stringify(built.program, compactValue));
    const after = canon(hydrateProgram(compacted));
    if (after !== before) assert.fail(`round-trip diverged — ${firstDiff(before, after)}`);
  });
}

// hydrate is documented idempotent — a never-compacted program passes through
// untouched; hydrating twice changes nothing.
await test("hydrateProgram is idempotent", async () => {
  const app = APPS[0];
  const built = await compileProgram(readFileSync(app.file, "utf8"), { originDir: path.dirname(app.file), stripPos: true });
  const once = canon(hydrateProgram(JSON.parse(JSON.stringify(built.program, compactValue))));
  const twice = canon(hydrateProgram(JSON.parse(once)));
  assert.equal(twice, once);
});

summarize("hydrate");
