#!/usr/bin/env node
// lzx-transpile — the impure driver: read .lzx, transpile, optionally compile,
// report coverage. lzx/ stays pure; this is where I/O + compile() wiring live.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { lzxToDeclare } from "../lzx/dist/transpile.js";
import { compile } from "../compiler/dist/compile-node.js";

export function transpileFile(path, opts = {}) {
  const r = lzxToDeclare(readFileSync(path, "utf8"));
  let compileErrors = [];
  if (opts.compile && r.declare !== null) {
    try { compileErrors = compile(r.declare, { typecheck: false }).errors ?? []; }
    catch (e) { compileErrors = [{ message: String(e) }]; }
  }
  return { path, declare: r.declare, gaps: r.gaps, diagnostics: r.diagnostics, compileErrors };
}

export function sweep(dir, opts = {}) {
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (p.includes("/.claude/") || p.includes("/.git/")) continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (extname(p) === ".lzx") files.push(p);
    }
  };
  walk(dir);
  const rows = files.map((f) => { try { return transpileFile(f, opts); } catch (e) { return { path: f, declare: null, gaps: [], compileErrors: [], error: String(e) }; } });
  const transpiled = rows.filter((r) => r.declare !== null).length;
  const compiledClean = rows.filter((r) => r.declare !== null && r.compileErrors.length === 0).length;
  // Library-root files (a <library> root, no App) legitimately produce no
  // runnable output — class-only, not a transpile failure.
  const libraryRoots = files.filter((f) => /^\s*(?:<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![^>]*>|\s)*<library\b/i.test(readFileSync(f, "utf8"))).length;
  const byRef = {};
  for (const r of rows) for (const g of r.gaps) byRef[g.s13Ref] = (byRef[g.s13Ref] ?? 0) + 1;
  return { total: rows.length, transpiled, compiledClean, libraryRoots, byRef, rows };
}

function main() {
  const args = process.argv.slice(2);
  const compileFlag = args.includes("--compile");
  const report = args.includes("--report");
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) { console.error("usage: node tools/lzx-transpile.mjs <file|dir> [--compile] [--report]"); process.exit(2); }
  if (statSync(target).isDirectory()) {
    const s = sweep(target, { compile: compileFlag });
    console.log(`transpiled ${s.transpiled}/${s.total}` + (compileFlag ? `, compiled-clean ${s.compiledClean}/${s.total}` : "") + `, library-root (class-only) ${s.libraryRoots}`);
    if (report) {
      const sorted = Object.entries(s.byRef).sort((a, b) => b[1] - a[1]);
      console.log("gaps by category (desc):");
      for (const [ref, n] of sorted) console.log(`  ${String(n).padStart(6)}  ${ref}`);
    } else {
      console.log("gaps by category:", s.byRef);
    }
  } else {
    const r = transpileFile(target, { compile: compileFlag });
    console.log(r.declare ?? "// (no output)");
    if (r.gaps.length) console.error("gaps:", r.gaps);
    if (r.compileErrors.length) console.error("compile errors:", r.compileErrors.map((e) => e.message ?? e));
  }
}
if (import.meta.url === `file://${process.argv[1]}`) main();
