// browser/compile-worker.js — the in-browser compiler, OFF the main thread (a module
// Worker over the same bundles bundle the inline path imports — one compiler,
// two transports). docs/system-design/in-browser-dev.md's worker rung, built.
//
// Protocol (compiler-client.js is the one caller):
//   { type:"library", lib }                  → setDefaultLibrary(lib), no reply
//   { type:"ping",    id }                   → { id, result:true } (readiness probe)
//   { type:"compileProgram", id, source, opts } → { id, result }
//   { type:"highlight", id, src }            → { id, result }
//
// The result crossing the boundary is the PROJECTED program compile —
// { program, diagnostics, report, closure, usedClasses } — never the raw DeclareError lists:
// structured clone would strip an Error subclass's custom fields (pos, code)
// silently, and `diagnostics` already carries everything, structured AND
// rendered. The inline client projects identically, so worker and inline
// results are byte-identical — the identical-output invariant, kept by
// construction rather than by care.

import { compileProgram, setDefaultLibrary, highlight } from "../bundles/declare-compiler.js";

self.onmessage = async (e) => {
  const m = e.data ?? {};
  try {
    switch (m.type) {
      case "library":
        setDefaultLibrary(m.lib);
        return;
      case "ping":
        self.postMessage({ id: m.id, result: true });
        return;
      case "compileProgram": {
        // the PROGRAM-shaped result (compiler/src/program-build.ts): the parsed,
        // checked, deps-applied program the runtime instantiates with no parser —
        // what a live edit on a static host renders, and what a deploy ships
        const r = await compileProgram(m.source, m.opts ?? {});
        self.postMessage({ id: m.id, result: { program: r.program, diagnostics: r.diagnostics, report: r.report, closure: r.closure, usedClasses: r.usedClasses } });
        return;
      }
      case "highlight":
        self.postMessage({ id: m.id, result: highlight(m.src) });
        return;
      default:
        return; // unknown message — ignore, never throw across the boundary
    }
  } catch (err) {
    self.postMessage({ id: m.id, error: String((err && err.message) || err) });
  }
};
