// browser/boot-source.js — the SOURCE VIEWER for a plain static host. The browser
// counterpart of the dev server's sourcePage() (server/index.mjs): given a target
// `.declare`, run the compiler's highlight() over it IN-BROWSER and render
// apps/viewer/ seeded with the resulting segments — the same viewer app,
// through the same host→app seed channel (cfg.seeds → app.demoSources).
//
// The Service Worker routes a top-level navigation to `…/<name>.declare?viewer=reader|source|edit`
// here (service-worker.js), passing the tab as ?mode=. Like the other boot modules, relative
// imports resolve against THIS module's URL (…/browser/), NOT the source page's location, so
// the runtime + the compiler always load from the distro tree regardless of which program is viewed.
import { bootHost } from "./host-client.js";
import { registerServiceWorker } from "./register-sw.js";
import { loadCompiler, ensureLibrary } from "./compiler-client.js";
// highlight + lineMetrics are DEPENDENCY-FREE (no TS, no compiler bundle): the
// segmenter the server runs is the same module, imported directly — so a source
// page never needs the compiler download just to render segments.
import { highlight, lineMetrics } from "../compiler/dist/highlight.js";
import { loadPrewarm } from "./prewarm-cache.js";

const ROOT = new URL("../", import.meta.url);
// The file to display — an absolute URL the SW passed on this module's own URL — and
// the tab to open on ("reader" | "source" | "edit"; empty → the viewer's default,
// reader). Passed as the code viewer's initial location (docs/system-design/location.md §4).
const target = new URL(import.meta.url).searchParams.get("src");
const mode = new URL(import.meta.url).searchParams.get("mode") ?? "";

async function run() {
  registerServiceWorker();
  const host = document.getElementById("host");
  if (!target) return showError(host, "no source URL — the Service Worker did not pass ?src=…");
  try {
    // The compiler client warm-loads in the BACKGROUND from the start — live-edit
    // recompiles await it (first edit waits, nothing else does). It leaves the
    // paint path entirely when the viewer itself comes precompiled below.
    const clientP = loadCompiler().then(ensureLibrary);
    clientP.catch(() => {});                        // surfaces on first use, not as an unhandled rejection
    const raw = await fetch(target, { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error(r.status + " fetching " + target); return r.text(); });

    // The viewer app itself: PREWARM first (bundles/cache/ — the committed
    // precompiled artifact, validated by content hash like every prewarm hit), so
    // a reader/source tab paints with NO compiler download; a stale/absent
    // artifact falls through to the in-browser compile of the viewer source.
    let source, deps;
    const warm = await loadPrewarm({ root: ROOT, relMain: "apps/viewer/viewer.declare",
      kind: "run", props: { render: "dom" }, fetchImpl: fetch });
    if (warm) {
      source = warm.program; deps = warm.deps;
    } else {
      const viewerSrc = await fetch(new URL("apps/viewer/viewer.declare", ROOT), { cache: "no-cache" })
        .then((r) => { if (!r.ok) throw new Error(r.status + " fetching the code viewer"); return r.text(); });
      const out = await (await clientP).compile(viewerSrc);
      if (!out.source) {
        // The compile's own rendered report — the ONE renderer's output.
        return showError(host, out.report || "the code viewer failed to compile");
      }
      source = out.source; deps = out.deps;
    }
    // highlight() → the prose/code SEGMENTS the viewer renders — run DIRECTLY (the
    // dependency-free module above, the very code the compiler bundle re-exports);
    // __raw__ = the verbatim file (the plain-text toggle — segments can't reconstruct
    // it faithfully); __path__ = the tree-relative path shown in the head. The viewer
    // reads them off app.demoSources.
    const segments = highlight(raw);
    const relPath = new URL(target).pathname.replace(new URL(ROOT).pathname, "");
    document.title = (relPath.split("/").pop() || "source") + " — source";
    await bootHost({
      source, deps,
      // The `?viewer=reader|source|edit` request selects the opening tab; the host
      // translates it into the viewer's INITIAL location (docs/system-design/location.md §4).
      // A real URL fragment still wins, so a shared `…#source` deep link holds.
      location: mode,
      seeds: { __source__: JSON.stringify(segments), __raw__: raw, __path__: relPath,
        __metrics__: JSON.stringify(lineMetrics(raw)) },
      // the live-edit mode's recompile seam — the warm-loading client above,
      // reporting failure as `{ report }` so the viewer's diagnostics pane fills
      compile: async (s) => {
        const o = await (await clientP).compile(s);
        return o.source ? { source: o.source, deps: o.deps } : { report: o.report || "compile failed" };
      },
    });
  } catch (e) {
    showError(host, (e && e.message) ? e.message : String(e));
  }
}

// A clean error panel over the host area — a broken/absent target shows why, not a blank page.
function showError(host, msg) {
  const p = document.createElement("div");
  p.setAttribute("role", "alert");
  p.style.cssText = "position:fixed;inset:0;margin:0;padding:24px;background:#0B141B;color:#E7EEF2;"
    + "overflow:auto;box-sizing:border-box;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace";
  const h = document.createElement("div");
  h.textContent = "Declare — source view error";
  h.style.cssText = "font:600 15px/1.4 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#FF6B6B;margin:0 0 12px";
  const m = document.createElement("div");
  m.style.whiteSpace = "pre-wrap";
  m.textContent = String(msg);
  p.appendChild(h); p.appendChild(m);
  (host || document.body).appendChild(p);
  console.error("[Declare] " + msg);
}

run();
