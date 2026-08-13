// browser/boot-extract.js — the STATIC-EXTRACTION view for a plain static host: the
// browser counterpart of the dev server's serveSeo() (server/index.mjs). Given
// a target `.declare` (?src=, passed by the service worker), compile it with
// the IN-BROWSER compiler and execute it headlessly to its t=0 snapshot
// (compiler/src/headless.ts — real fonts and metrics here, since a page HAS a
// measurer; no mount), then replace this page with the extracted document.
// The SAME extractor module the Node server runs — the browser compiler does
// everything the Node one can (docs/system-design/capabilities.md §5).
//
// Inline import, not the compile worker: extraction EXECUTES the program
// against the runtime in this page — a settled tree cannot be projected
// across a worker boundary (only { source, deps, diagnostics, report } can).
import { loadLibraryOnce } from "./compiler-client.js";

const ROOT = new URL("../", import.meta.url);
const target = new URL(import.meta.url).searchParams.get("src");

function writeDoc(doc) {
  // The extracted document IS the page — same bytes the dev server sends for this
  // URL, arrived at by the in-browser path.
  document.open();
  document.write(doc);
  document.close();
}

async function run() {
  try {
    if (!target) throw new Error("no source URL — the Service Worker did not pass ?src=…");
    // NO committed tier here, by design (2026-08-12). A precompiled extraction
    // artifact used to be written and this asked for it — under a kind string
    // (`seo`) the writer never used (`crawler`), so it had never once hit. It was
    // also the wrong shape: this page is only reachable through `?extract`, which
    // needs a browser running JS with the service worker installed, and a crawler
    // is neither. Crawler content has to be IN THE HTML the crawler fetches —
    // tools/internal/bake-homepage-crawler.mjs bakes the homepage's extraction into
    // index.html itself. This path is the developer's inspection view (and the
    // browser twin of the dev server's serveSeo), so it compiles, every time.
    const [mod, lib, source] = await Promise.all([
      import("../bundles/declare-compiler.js"),
      loadLibraryOnce(),
      fetch(target, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(r.status + " fetching " + target); return r.text(); }),
    ]);
    mod.setDefaultLibrary(lib);
    const compiled = mod.compile(source);
    const name = new URL(target).pathname.split("/").pop() || "app";
    // The CRAWLED document (docs/system-design/location.md §7) — every reachable location's
    // content in the one page, identical bytes to the Node server's ?extract. The
    // data resolver is the browser twin of the server's disk read: a RELATIVE
    // DataSource url is the app's own material, fetched same-origin from beside the
    // program (the deployed copy of the same file the Node crawl reads from disk);
    // an absolute url is the network and fails the crawl loudly (the error page).
    const ex = compiled.source === null ? null : await mod.crawlExtract(compiled.source, {
      deps: compiled.deps, links: compiled.links,
      // Parse-else-raw, matching diskDataResolver byte for byte: JSON is the
      // parsed value, a text file (a Markdown article) is its raw string.
      data: (url) => fetch(new URL(url, target), { cache: "no-cache" })
        .then((r) => (r.ok ? r.text() : null))
        .then((raw) => { if (raw === null) return null; try { return JSON.parse(raw); } catch { return raw; } })
        .catch(() => null),
    });
    const esc = (s) => s.replace(/[&<]/g, (c) => (c === "&" ? "&amp;" : "&lt;"));
    const doc = ex === null
      ? `<!doctype html><meta charset="utf-8"><title>${esc(name)} — extraction failed</title>
<pre style="white-space:pre-wrap;font:13px/1.5 ui-monospace,monospace;padding:20px">${esc(compiled.report || "compile failed")}</pre>`
      : mod.crawlerDocument(ex.html, ex.title || name);
    writeDoc(doc);
  } catch (e) {
    document.body.textContent = "Declare — static extraction failed: " + ((e && e.message) || e);
    console.error("[Declare] static extraction failed:", e);
  }
}

run();
