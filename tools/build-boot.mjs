// tools/build-boot.mjs — bundle the BOOT PATH into one file.
//
// The static host page used to import web/boot-uniform.js and let the browser
// walk its module graph — ~50 ES modules (host-client, compiler-client, the
// whole runtime run-path), each a request + parse cycle for content that is
// IMMUTABLE within a platform build (BUILD_ID gates it wholesale; nothing here
// is ever probed for freshness). This bundles that fixed graph the way
// build-compiler.mjs bundles the compiler: one committed, minified ES module —
// dist-browser/declare-boot.js (~23 KB gz) — so a page makes ONE platform
// request instead of fifty. Bundling is a TRANSPORT change only: the same
// modules, same behavior; web/*.js stay in the tree for unbundled use (the dev
// server's pages, tests) and MUST be rebundled here after any runtime or web
// client change (the same rhythm as the compiler bundle; the commit-hook stamp
// hashes dist-browser, so a stale bundle can't ship silently).
//
// Two runtime-resolved references survive bundling by construction:
//   • the compiler bundle stays LAZY (external) — the ~1 MB gz compiler is
//     still only fetched on the slow path / first live edit;
//   • the compile worker is spawned via new URL("compile-worker.js",
//     import.meta.url), which resolves against the BUNDLE's own directory —
//     so the worker file is copied to dist-browser/ alongside (its own
//     ../dist-browser/declare-compiler.js import still resolves from there).
//
//   node tools/build-boot.mjs
// writes dist-browser/declare-boot.js + dist-browser/compile-worker.js

import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, copyFileSync, statSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT_DIR = path.join(ROOT, "dist-browser");
const OUT = path.join(OUT_DIR, "declare-boot.js");

mkdirSync(OUT_DIR, { recursive: true });

await build({
  entryPoints: [path.join(ROOT, "web/boot-uniform.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "none",
  outfile: OUT,
  // The compiler bundle is fetched lazily on the slow path — never inlined here.
  external: ["*declare-compiler.js"],
});

// The worker rides ALONGSIDE the bundle (see header).
copyFileSync(path.join(ROOT, "web/compile-worker.js"), path.join(OUT_DIR, "compile-worker.js"));

const raw = statSync(OUT).size;
const gz = gzipSync(readFileSync(OUT)).length;
console.log(`build-boot: wrote dist-browser/declare-boot.js (+ compile-worker.js)`);
console.log(`  ${(raw / 1024).toFixed(0)} KB raw · ${(gz / 1024).toFixed(0)} KB gzipped`);
