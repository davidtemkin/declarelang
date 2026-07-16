// browser/compile-worker.js — the in-browser compiler, OFF the main thread (a module
// Worker over the same bundles bundle the inline path imports — one compiler,
// two transports). docs/system-design/in-browser-dev.md's worker rung, built.
//
// Protocol (compiler-client.js is the one caller):
//   { type:"library", lib }                  → setDefaultLibrary(lib), no reply
//   { type:"ping",    id }                   → { id, result:true } (readiness probe)
//   { type:"compile", id, source, opts }     → { id, result }
//   { type:"compileTracked", id, source, opts } → { id, result } (result.closure rides)
//   { type:"highlight", id, src }            → { id, result }
//
// The result crossing the boundary is the PROJECTED compile result —
// { source, deps, diagnostics, report } — never the raw DeclareError lists:
// structured clone would strip an Error subclass's custom fields (pos, code)
// silently, and `diagnostics` already carries everything, structured AND
// rendered. The inline client projects identically, so worker and inline
// results are byte-identical — the identical-output invariant, kept by
// construction rather than by care.

import { compile, compileTracked, setDefaultLibrary, highlight } from "../bundles/declare-compiler.js";

const project = (r) => ({ source: r.source, deps: r.deps, diagnostics: r.diagnostics, report: r.report });

self.onmessage = (e) => {
  const m = e.data ?? {};
  try {
    switch (m.type) {
      case "library":
        setDefaultLibrary(m.lib);
        return;
      case "ping":
        self.postMessage({ id: m.id, result: true });
        return;
      case "compile": {
        const r = compile(m.source, m.opts ?? {});
        self.postMessage({ id: m.id, result: project(r) });
        return;
      }
      case "compileTracked": {
        const r = compileTracked(m.source, m.opts ?? {});
        self.postMessage({ id: m.id, result: { ...project(r), closure: r.closure } });
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
