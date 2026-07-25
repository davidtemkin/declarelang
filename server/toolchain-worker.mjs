// server/toolchain-worker.mjs — the TOOLCHAIN REALM. Every operation that
// consumes the compiler/runtime dist modules — compiling, extracting,
// production builds, closure freshness, highlighting — runs HERE, in a
// worker_threads realm, so the dev server can reload the toolchain by
// respawning this worker: a new worker is a fresh module registry, the one
// thing ESM cannot give a running realm (cache-busting a URL re-imports only
// the top module of a 20-file graph — a new façade over yesterday's schema).
// The browser solved this shape first (browser/compile-worker.js); this is
// its Node twin, and the same rule crosses the boundary: results are the
// PROJECTED plain shapes, never Error subclasses (structured clone strips
// their custom fields silently — pos, code).
//
// Protocol (server/toolchain.mjs is the one caller; every request carries an
// id, every reply is { id, result } or { id, error }):
//   { type:"compile",    id, source, opts }   → projected compile result
//   { type:"extract",    id, source, originDir, document } → { ok, html, title, doc?, report? }
//   { type:"production", id, args }           → writeProduction's result, errors projected
//   { type:"fresh",      id, closure, props } → boolean (isUpToDate over diskProbe)
//   { type:"highlight",  id, src }            → segments
//   { type:"metrics",    id, src }            → line metrics

import { parentPort } from "node:worker_threads";
import path from "node:path";
import { compile, isUpToDate, diskProbe, crawlExtract, diskDataResolver, crawlerDocument } from "../compiler/dist/compile-node.js";
import { highlight, lineMetrics } from "../compiler/dist/highlight.js";
import { writeProduction } from "../tools/declarec.mjs";

const project = (r) => ({ source: r.source, deps: r.deps, diagnostics: r.diagnostics, report: r.report });

async function handle(m) {
  switch (m.type) {
    case "compile":
      return project(compile(m.source, m.opts ?? {}));
    case "extract": {
      const compiled = compile(m.source, { originDir: m.originDir });
      if (compiled.source === null) return { ok: false, report: compiled.report };
      const ex = await crawlExtract(compiled.source, {
        deps: compiled.deps, links: compiled.links, data: diskDataResolver(m.originDir),
      });
      const title = ex.title || "";
      return { ok: true, html: ex.html, title, doc: m.document ? crawlerDocument(ex.html, title || m.fallbackTitle || path.basename(m.originDir)) : undefined };
    }
    case "production": {
      const built = await writeProduction(m.args);
      // plain projection: the server reads .ok/.report/.errors[].message and the manifest fields
      return {
        ok: built.ok, report: built.report ?? null,
        errors: (built.errors ?? []).map((e) => ({ message: String(e.message ?? e) })),
        closure: built.closure, moduleName: built.moduleName, sizes: built.sizes,
        assets: built.assets, usedComponents: built.usedComponents,
      };
    }
    case "fresh":
      return isUpToDate(m.closure, m.props, diskProbe);
    case "highlight":
      return highlight(m.src);
    case "metrics":
      return lineMetrics(m.src);
    default:
      throw new Error("unknown toolchain op: " + m.type);
  }
}

parentPort.on("message", (m) => {
  Promise.resolve()
    .then(() => handle(m))
    .then((result) => parentPort.postMessage({ id: m.id, result }))
    .catch((e) => parentPort.postMessage({ id: m.id, error: String((e && e.message) || e) }));
});
