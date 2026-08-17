// build-mac — the native client's two bundles.
//
//   bundles/declare-mac.js           the runtime + the mac backend + the boot
//                                    ladder, as ONE script (JavaScriptCore has
//                                    no module loader — an IIFE is the honest
//                                    delivery, and it is what the Swift shell
//                                    evaluates after mac-env.js).
//   bundles/declare-compiler-mac.js  the compiler, same treatment, exposing
//                                    globalThis.__declareCompiler — loaded ON
//                                    DEMAND for the client-compile tier, so a
//                                    server-compiled boot never pays for it.
//
// Run after `npm run build` (needs runtime/dist + compiler/dist).

import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "bundles");
mkdirSync(OUT, { recursive: true });

const kb = (n) => (n / 1024).toFixed(0) + " KB";

// MINIFIED, like every other shipped bundle. This was missing, and it cost
// more than whitespace: the compiler entry imports the ALREADY-MINIFIED
// bundles/declare-compiler.js, so esbuild re-parsed it and PRETTY-PRINTED it
// back out — 4.20 MB of input leaving as 5.73 MB. Measured, both bundles:
//
//     declare-mac.js        736 KB → 298 KB   (gz 193 → 96 KB)
//     declare-compiler-mac  5.73 MB → 4.20 MB (gz 1.26 → 1.14 MB)
//
// It is also the ONLY lever on download size. Any container (dmg, zip, pkg)
// compresses in transit, so shipping compressed bytes on disk saves nothing
// there; minification removes content rather than redundancy, so its ~10% off
// the gzipped figure is the part that actually survives the trip.
//
// Safe by precedent: build-boot.mjs and build-compiler.mjs both minify, so
// every browser user already runs this runtime and this compiler mangled.
async function bundle(entry, outfile, globalName, { keepNames = false } = {}) {
  const r = await build({
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    globalName,
    platform: "browser",
    target: ["safari17"],
    outfile,
    write: true,
    minify: true,
    // ⚠ KEEP CLASS NAMES IN THE RUNTIME. The runtime labels constraints and
    // diagnostics with `this.constructor.name` (view.ts `.draw`, markdown.ts
    // `.render`, state.ts's gated-state error, …), and unlike the web — where
    // dev loads runtime/dist unminified and only production ships the bundle —
    // the Mac host ALWAYS runs this bundle. Mangling here would degrade every
    // introspection answer the host can give, permanently. Measured cost: 10 KB.
    // Nothing keys a LOOKUP on a JS name (every `.name` in the runtime is a
    // parsed-program field), so this is legibility, not correctness.
    keepNames,
    legalComments: "none",
    logLevel: "silent",
  });
  if (r.errors.length) { console.error(r.errors); process.exit(1); }
  const buf = readFileSync(outfile);
  console.log(`  ${path.basename(outfile)} — ${kb(buf.length)} raw · ${kb(gzipSync(buf).length)} gzipped`);
}

// The compiler entry: a tiny wrapper so the bundle exposes exactly the four
// calls the client-compile tier uses (the same surface compile-worker.js has).
const COMPILER_ENTRY = path.join(OUT, ".compiler-mac-entry.js");
writeFileSync(COMPILER_ENTRY, `
import { compile, compileTracked, setDefaultLibrary, highlight } from "${path.join(ROOT, "bundles/declare-compiler.js").replace(/\\/g, "/")}";
globalThis.__declareCompiler = { compile, compileTracked, setDefaultLibrary, highlight };
`);

console.log("build-mac:");
await bundle(path.join(ROOT, "browser/mac-boot.js"), path.join(OUT, "declare-mac.js"), "DeclareMac",
             { keepNames: true });
// No keepNames for the compiler: its input is the web bundle, already minified
// without them, so there are no original names left to preserve — asking would
// cost 220 KB to pin identifiers esbuild had already mangled upstream.
await bundle(COMPILER_ENTRY, path.join(OUT, "declare-compiler-mac.js"), "DeclareCompilerMac");
console.log("  (mac-env.js is served as-is — it must run BEFORE the bundle)");
