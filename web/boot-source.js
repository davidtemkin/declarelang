// web/boot-source.js — the SOURCE VIEWER for a plain static host. The browser
// counterpart of the dev server's sourcePage() (server/index.mjs): given a target
// `.declare`, run the compiler's highlight() over it IN-BROWSER and render
// examples/codeviewer/ seeded with the resulting segments — the same viewer app,
// through the same host→app seed channel (cfg.seeds → app.demoSources).
//
// The Service Worker routes a top-level navigation to `…/<name>.declare?view=source`
// here (service-worker.js). Like the other boot modules, relative imports resolve against
// THIS module's URL (…/web/), NOT the source page's location, so the runtime + the
// compiler always load from the distro tree regardless of which program is viewed.
import { bootHost } from "./host-client.js";
import { registerServiceWorker } from "./register-sw.js";
import { loadCompiler, ensureLibrary } from "./compiler-client.js";

const ROOT = new URL("../", import.meta.url);
// The file to display — an absolute URL the SW passed on this module's own URL.
const target = new URL(import.meta.url).searchParams.get("src");

async function run() {
  registerServiceWorker();
  const host = document.getElementById("host");
  if (!target) return showError(host, "no source URL — the Service Worker did not pass ?src=…");
  try {
    const viewerUrl = new URL("examples/codeviewer/codeviewer.declare", ROOT);
    // In parallel: the one compiler client (worker or inline, library registered
    // as its default), the viewer shell source, and the target file being viewed.
    // Nothing depends on another, so one round-trip.
    const [client, viewerSrc, raw] = await Promise.all([
      loadCompiler().then(ensureLibrary),
      fetch(viewerUrl, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(r.status + " fetching the code viewer"); return r.text(); }),
      fetch(target, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(r.status + " fetching " + target); return r.text(); }),
    ]);
    const out = await client.compile(viewerSrc);
    if (!out.source) {
      // The compile's own rendered report — the ONE renderer's output.
      return showError(host, out.report || "the code viewer failed to compile");
    }
    // highlight() → the prose/code SEGMENTS the viewer renders; __raw__ = the verbatim
    // file (the plain-text toggle — segments can't reconstruct it faithfully); __path__ =
    // the tree-relative path shown in the head. The viewer reads them off app.demoSources.
    const segments = await client.highlight(raw);
    const relPath = new URL(target).pathname.replace(new URL(ROOT).pathname, "");
    document.title = (relPath.split("/").pop() || "source") + " — source";
    await bootHost({
      source: out.source,
      seeds: { __source__: JSON.stringify(segments), __raw__: raw, __path__: relPath },
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
