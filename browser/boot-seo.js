// browser/boot-seo.js — the STATIC-EXTRACTION view for a plain static host: the
// browser counterpart of the dev server's serveSeo() (server/index.mjs). Given
// a target `.declare` (?src=, passed by the service worker), compile it with
// the IN-BROWSER compiler and execute it headlessly to its t=0 snapshot
// (compiler/src/headless.ts — real fonts and metrics here, since a page HAS a
// measurer; no mount), then replace this page with the extracted document.
// The SAME extractor module the Node server runs — the browser compiler does
// everything the Node one can (design/capabilities.md §5).
//
// Inline import, not the compile worker: extraction EXECUTES the program
// against the runtime in this page — a settled tree cannot be projected
// across a worker boundary (only { source, deps, diagnostics, report } can).
import { loadLibraryOnce } from "./compiler-client.js";
import { loadPrewarm, relativize } from "./prewarm-cache.js";

const ROOT = new URL("../", import.meta.url);
const target = new URL(import.meta.url).searchParams.get("src");

function writeDoc(doc) {
  // The extracted document IS the page — same bytes the dev server sends for this
  // URL, arrived at by the in-browser path (or lifted verbatim from the committed tier).
  document.open();
  document.write(doc);
  document.close();
}

async function run() {
  try {
    if (!target) throw new Error("no source URL — the Service Worker did not pass ?src=…");
    // COMMITTED tier first: a precompiled SEO document (bundles/cache/) that still
    // validates against the deployed source renders with NO compiler at all — the
    // same drift-proof gate as the run tier (browser/prewarm-cache.js).
    const warm = await loadPrewarm({
      root: ROOT, relMain: relativize(new URL(target, location.href).href, ROOT),
      kind: "seo", props: {}, fetchImpl: fetch,
    });
    if (warm) { writeDoc(warm.document); return; }
    const [mod, lib, source] = await Promise.all([
      import("../bundles/declare-compiler.js"),
      loadLibraryOnce(),
      fetch(target, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(r.status + " fetching " + target); return r.text(); }),
    ]);
    mod.setDefaultLibrary(lib);
    const compiled = mod.compile(source);
    const name = new URL(target).pathname.split("/").pop() || "app";
    const html = mod.extractFromCompiled(compiled);
    const esc = (s) => s.replace(/[&<]/g, (c) => (c === "&" ? "&amp;" : "&lt;"));
    const doc = html === null
      ? `<!doctype html><meta charset="utf-8"><title>${esc(name)} — extraction failed</title>
<pre style="white-space:pre-wrap;font:13px/1.5 ui-monospace,monospace;padding:20px">${esc(compiled.report || "compile failed")}</pre>`
      : mod.seoDocument(html, name);
    writeDoc(doc);
  } catch (e) {
    document.body.textContent = "Declare — static extraction failed: " + ((e && e.message) || e);
    console.error("[Declare] static extraction failed:", e);
  }
}

run();
