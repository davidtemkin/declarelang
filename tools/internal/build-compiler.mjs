// tools/internal/build-compiler.mjs — bundle the Declare compiler for the browser.
//
// `compiler/dist/compile-browser.js` is already browser-safe ES (its whole graph
// is the pure `compile.ts` core — no node: imports), EXCEPT for one bare import:
// TypeScript (`import ts from "typescript"` — free-idents' expression parser AND
// typecheck.ts's checker ride the same module). A browser can't resolve that
// bare specifier, and TypeScript ships only a CJS/UMD entry — so we bundle it
// in. That single dependency is the ~8 MB (≈1 MB gzipped) the artifact carries.
//
// The FULL typecheck is reachable here, exactly as on Node: the generated entry
// below embeds the ES2022 `lib.*.d.ts` closure (the standard library's typed
// surface — data, ~52 KB gz) and registers it via provideLib() at bundle init,
// so `compile(src, { typecheck: true })` means the same thing in the browser
// and the worker as it does on every other surface (in-browser-dev.md §3).
//
//   node tools/internal/build-compiler.mjs
// writes bundles/declare-compiler.js  (an ES module: compile, compileTracked, setDefaultLibrary, provideLib, memoryHost, highlight, fnv1a)

import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdirSync, statSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const ENTRY = path.join(ROOT, "compiler/dist/compile-browser.js");
const OUT_DIR = path.join(ROOT, "bundles");
const OUT = path.join(OUT_DIR, "declare-compiler.js");

mkdirSync(OUT_DIR, { recursive: true });

// ── The embedded lib.d.ts closure ────────────────────────────────────────────
// Walk the `/// <reference lib="…" />` chain from the compile target's default
// lib (lib.es2022.d.ts) and inline every reachable text — the same files the
// Node provider reads from disk, so browser and Node typechecks see the
// IDENTICAL standard library (the identical-output invariant includes the lib).
const TS_LIB_DIR = path.dirname(createRequire(import.meta.url).resolve("typescript"));
function libClosure(entryLib) {
  const texts = {};
  const queue = [entryLib];
  while (queue.length > 0) {
    const name = queue.shift();
    if (texts[name] !== undefined) continue;
    const text = readFileSync(path.join(TS_LIB_DIR, name), "utf8");
    texts[name] = text;
    for (const m of text.matchAll(/\/\/\/ <reference lib="(.+?)" \/>/g)) queue.push(`lib.${m[1]}.d.ts`);
  }
  return texts;
}
const LIBS = libClosure("lib.es2022.d.ts");

// The generated entry: register the embedded libs, then re-export the whole
// compile-browser surface — the bundle's init IS the provider registration.
const ENTRY_SRC = `
import { provideLib } from ${JSON.stringify(ENTRY)};
const LIBS = ${JSON.stringify(LIBS)};
provideLib((name) => LIBS[name]);
export * from ${JSON.stringify(ENTRY)};
`;

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
  stdin: { contents: ENTRY_SRC, resolveDir: ROOT, loader: "js" },
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
