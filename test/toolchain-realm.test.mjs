// test/toolchain-realm.test.mjs — the dev server must never compile with a
// stale toolchain. The compiler lives in a respawnable worker realm
// (server/toolchain.mjs): before every delegated operation the dist
// fingerprint is re-checked, and a change respawns the realm — a fresh module
// registry, since ESM cannot reload a module graph in place. This locks the
// exact failure that shipped once: a long-running server whose in-memory
// compiler predated a schema change served "View has no attribute …" for
// every delegated compile (the editor, ?render=canvas) while prewarm-backed
// DOM pages kept working — silent, asymmetric, and misread as a compiler bug.

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { statSync, utimesSync } from "node:fs";
import { test, summarize } from "./harness.mjs";
import { createToolchain } from "../server/toolchain.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toolchain = createToolchain(ROOT);

// a program only the CURRENT schema accepts (ignoreClip is a recent View attr)
const PROGRAM = `App [ View [ width = 40, height = 40, View [ ignoreClip = true ] ] ]`;

try {
  await test("the realm compiles with the current schema", async () => {
    const r = await toolchain.compile(PROGRAM, {});
    assert.notEqual(r.source, null, "current-schema program should compile: " + (r.report ?? ""));
  });

  await test("an unchanged toolchain never respawns the realm", async () => {
    await toolchain.compile(PROGRAM, {});
    await toolchain.highlight("View [ ]");
    assert.equal(toolchain.stats().spawns, 1, "repeat operations must reuse the realm");
  });

  await test("a dist change respawns the realm before the next compile", async () => {
    const probe = path.join(ROOT, "compiler", "dist", "compile.js");
    const before = statSync(probe);
    utimesSync(probe, new Date(), new Date()); // the fingerprint's input is mtime
    try {
      const r = await toolchain.compile(PROGRAM, {});
      assert.notEqual(r.source, null, "the respawned realm should compile");
      assert.equal(toolchain.stats().spawns, 2, "the fingerprint change must respawn the realm");
    } finally {
      utimesSync(probe, before.atime, before.mtime); // leave the tree as found
    }
  });

  await test("after the restore the realm respawns once more and settles", async () => {
    await toolchain.compile(PROGRAM, {});
    const settled = toolchain.stats().spawns;
    await toolchain.compile(PROGRAM, {});
    assert.equal(toolchain.stats().spawns, settled, "no further respawns without a change");
  });
} finally {
  // the realm's worker is unref'd — the process exits without teardown
}

summarize("toolchain-realm");
