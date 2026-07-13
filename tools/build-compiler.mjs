// tools/build-compiler.mjs — bundle the Declare compiler for the browser.
//
// `compiler/dist/compile-browser.js` is already browser-safe ES (its whole graph
// is the pure `compile.ts` core — no node: imports), EXCEPT for one bare import:
// `free-idents.ts` pulls the TypeScript expression parser (`import ts from
// "typescript"`). A browser can't resolve that bare specifier, and TypeScript
// ships only a CJS/UMD entry — so we bundle it in. That single dependency is the
// ~8 MB (≈1 MB gzipped) the artifact carries; nothing else is heavy.
//
// No typecheck path is reachable (the browser compiles like POST /compile, with
// `{}`), so tsc's program/checker never enters the graph — only the parser does.
//
//   node tools/build-compiler.mjs
// writes dist-browser/declare-compiler.js  (an ES module: compile, compileTracked, setDefaultLibrary, memoryHost, highlight, fnv1a)

import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, statSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const ENTRY = path.join(ROOT, "compiler/dist/compile-browser.js");
const OUT_DIR = path.join(ROOT, "dist-browser");
const OUT = path.join(OUT_DIR, "declare-compiler.js");

mkdirSync(OUT_DIR, { recursive: true });

// TypeScript's UMD builds its Node `sys` object at import time when it detects a
// CommonJS/Node environment — which touches `os.platform()`, `fs`, `path`, etc.
// The Declare compiler uses ONLY the TS expression parser (via free-idents), never
// `ts.sys`, so we stub those builtins: `os.platform` must be a real function (the
// one init call), the rest can be inert. This makes the bundle load in a real
// browser (where it wouldn't hit the Node path anyway) AND in Node — so the
// parity check below can import it directly.
const NODE_BUILTINS = [
  "assert", "buffer", "child_process", "crypto", "events", "fs", "fs/promises",
  "inspector", "module", "net", "os", "path", "path/posix", "path/win32",
  "perf_hooks", "process", "readline", "stream", "tty", "url", "util", "v8", "vm",
  "worker_threads", "zlib",
];
const stubPlugin = {
  name: "node-builtin-stubs",
  setup(b) {
    const filter = new RegExp("^(node:)?(" + NODE_BUILTINS.join("|").replace(/\//g, "\\/") + ")$");
    b.onResolve({ filter }, (a) => ({ path: a.path, namespace: "nbstub" }));
    b.onLoad({ filter: /.*/, namespace: "nbstub" }, (a) => {
      const name = a.path.replace(/^node:/, "");
      if (name === "os")
        return { contents:
          'export const EOL = "\\n";\n' +
          'export const platform = () => "browser";\n' +
          'export const homedir = () => "/";\n' +
          'export const tmpdir = () => "/tmp";\n' +
          'export const cpus = () => [];\n' +
          'export default { EOL, platform, homedir, tmpdir, cpus };\n' };
      // Everything else: an inert object whose members read as no-op functions,
      // so an incidental `x.foo()` at init degrades to undefined rather than a throw.
      return { contents:
        'const d = new Proxy({}, { get: () => (() => {}) });\n' +
        'export default d;\n', loader: "js" };
    });
  },
};

const result = await build({
  entryPoints: [ENTRY],
  bundle: true,
  format: "esm",
  platform: "browser",       // errors on any stray node: import we didn't stub
  target: "es2022",
  minify: true,
  legalComments: "none",
  outfile: OUT,
  metafile: true,
  plugins: [stubPlugin],
  // TypeScript's node-sys init references CJS module globals; the parser never
  // uses the methods that would read them, so define them as harmless constants
  // (an ESM bundle has no real __filename/__dirname).
  define: {
    "process.env.NODE_ENV": '"production"',
    // TypeScript's `isNodeLikeSystem()` is `… && !process.browser && …`. Forcing it
    // true makes TS skip building its Node `sys` (fs/os/path/__filename) — the exact
    // browser behavior — so the bundle never runs that init in EITHER environment.
    "process.browser": "true",
    __filename: '"/declare-compiler.js"',
    __dirname: '"/"',
  },
  logLevel: "warning",
});

if (result.warnings.length) {
  for (const w of result.warnings) console.warn("  ! " + w.text);
}

const raw = statSync(OUT).size;
const gz = gzipSync(readFileSync(OUT)).length;
console.log(`build-compiler: wrote ${path.relative(ROOT, OUT)}`);
console.log(`  ${(raw / 1024 / 1024).toFixed(2)} MB raw · ${(gz / 1024).toFixed(0)} KB gzipped`);
