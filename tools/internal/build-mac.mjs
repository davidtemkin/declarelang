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

async function bundle(entry, outfile, globalName) {
  const r = await build({
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    globalName,
    platform: "browser",
    target: ["safari17"],
    outfile,
    write: true,
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
await bundle(path.join(ROOT, "browser/mac-boot.js"), path.join(OUT, "declare-mac.js"), "DeclareMac");
await bundle(COMPILER_ENTRY, path.join(OUT, "declare-compiler-mac.js"), "DeclareCompilerMac");
console.log("  (mac-env.js is served as-is — it must run BEFORE the bundle)");
