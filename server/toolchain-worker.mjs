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
//   { type:"compileProgram", id, source, opts } → { program, diagnostics, report, closure }
//   { type:"extract",    id, source, originDir, document } → { ok, html, title, doc?, report? }
//   { type:"flags",      id, source, originDir } → the program's own flags, or undefined
//   { type:"pageColor",  id, source }         → the App's literal fill as CSS, or null
//   { type:"production", id, args }           → writeProduction's result, errors projected
//   { type:"sizes",      id, args }           → the build's sizes report, nothing written
//   { type:"fresh",      id, closure, props } → boolean (isUpToDate over diskProbe)
//   { type:"highlight",  id, src }            → segments
//   { type:"index",      id, src, file, libraryDir } → { metrics, defs } (highlight.ts programIndex)

import { parentPort } from "node:worker_threads";
import path from "node:path";
import { isUpToDate, diskProbe, crawlExtract, diskDataResolver, crawlerDocument, programFlags, programPageColor } from "../compiler/dist/compile-node.js";
// the PROGRAM-shaped compile (compiler/src/declarec.ts: the Node front over the
// shared program tail) — what /compile answers with, so a page never parses
import { compileProgram } from "../compiler/dist/declarec.js";
import { readFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { highlight, programIndex } from "../compiler/dist/highlight.js";
import { writeProduction, buildProduction } from "../tools/declarec.mjs";

async function handle(m) {
  switch (m.type) {
    case "compileProgram": {
      // the PROGRAM-shaped result (compiler/src/program-build.ts): the parsed,
      // checked, deps-applied program the runtime instantiates with no parser
      // aboard — what every host boots from now
      const r = await compileProgram(m.source, m.opts ?? {});
      return { program: r.program, diagnostics: r.diagnostics, report: r.report, closure: r.closure };
    }
    case "extract": {
      const built = await compileProgram(m.source, { originDir: m.originDir, links: true });
      if (built.program === null) return { ok: false, report: built.report };
      const ex = await crawlExtract(built.program, {
        registry: built.compiled.linkRegistry, warm: true, data: diskDataResolver(m.originDir),
      });
      const title = ex.title || "";
      return { ok: true, html: ex.html, title, doc: m.document ? crawlerDocument(ex.html, title || m.fallbackTitle || path.basename(m.originDir)) : undefined };
    }
    case "flags":
      return programFlags(m.source, m.originDir);
    case "pageColor":
      return programPageColor(m.source);
    case "production": {
      const built = await writeProduction(m.args);
      // plain projection: the server reads .ok/.report/.errors[].message and the manifest fields
      return {
        ok: built.ok, report: built.report ?? null,
        errors: (built.errors ?? []).map((e) => ({ message: String(e.message ?? e) })),
        closure: built.closure, moduleName: built.moduleName, sizes: built.sizes,
        assets: built.assets, usedClasses: built.usedClasses,
      };
    }
    case "sizes": {
      const { source, ...opts } = m.args;
      const built = await buildProduction(source, { ...opts, sizes: true });
      return { ok: built.ok, report: built.report ?? null, closure: built.closure, sizes: built.ok ? built.sizesReport : null };
    }
    case "fresh":
      return isUpToDate(m.closure, m.props, diskProbe);
    case "highlight":
      return highlight(m.src);
    case "index": {
      // what the reader is told about the program: the file's count and the
      // whole app's, and where each class lives — its files read from disk,
      // the library's left out
      const library = pathToFileURL(m.libraryDir).href + "/";
      return programIndex(m.src, pathToFileURL(m.file).href,
        (u) => { try { return readFileSync(fileURLToPath(u), "utf8"); } catch { return null; } },
        (u) => u.startsWith(library));
    }
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
