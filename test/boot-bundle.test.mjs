// test/boot-bundle.test.mjs — the boot bundle carries no compiler.
//
// Every compile result is a PROGRAM OBJECT (compiler/src/program-build.ts), so
// the browser host only ever instantiates; the parser, the checker and the
// teaching text live in the lazily fetched compiler bundle and nowhere in
// bundles/declare-boot.js. Two things keep it so: the host imports the runtime
// through runtime/host-api.js (a barrel import would pin the compiler's half
// back in), and the boot build substitutes the checker with the production
// stand-in (tools/internal/stubs.mjs). The witness is esbuild's own metafile
// from the boot's own build options — never a grep over minified names.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { test, summarize } from "./harness.mjs";
import { bootBuildOptions } from "../tools/internal/build-boot.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
console.log("boot bundle");

await test("the boot bundle carries no parser, checker, or teaching text", async () => {
  const r = await build(bootBuildOptions({ write: false, metafile: true }));
  const out = Object.values(r.metafile.outputs).find((o) => o.entryPoint);
  const bytesOf = (file) => {
    const k = Object.keys(out.inputs).find((p) => p.endsWith("runtime/dist/" + file));
    return k === undefined ? 0 : out.inputs[k].bytesInOutput;
  };
  // the checker is its stand-in — a few hundred bytes of refusals, never the validator
  assert.ok(bytesOf("check.js") < 2048, `check.js is ${bytesOf("check.js")} bytes in the boot — the validator is aboard`);
  assert.equal(bytesOf("parser.js"), 0, "the parser is aboard the boot — a host module reads Declare at run time; take the parser from the compiler bundle (inspect-service provideEvalParser)");
  assert.equal(bytesOf("teach.js"), 0, "the teaching text is aboard the boot (it rides the checker)");
  const total = r.outputFiles.find((f) => f.path.endsWith("declare-boot.js")).contents.length;
  console.log(`    boot bundle ${(total / 1024).toFixed(0)} KB raw`);
});

await test("no web host module imports the runtime barrel", () => {
  // mac-boot is the native host's world and imports what it needs directly;
  // boot-extract executes a program headlessly and legitimately carries the
  // compiler; bench/serve cores are not host modules
  const exempt = new Set(["mac-boot.js", "mac-env.js", "boot-extract.js", "boot-static.js", "bench-core.js", "serve-core.js"]);
  for (const f of readdirSync(join(ROOT, "browser")).filter((n) => n.endsWith(".js") && !exempt.has(n))) {
    const text = readFileSync(join(ROOT, "browser", f), "utf8");
    assert.ok(!/from "\.\.\/runtime\/dist\/index\.js"/.test(text), `browser/${f} imports the runtime barrel — use ../runtime/dist/host-api.js`);
  }
});

summarize("boot bundle");
