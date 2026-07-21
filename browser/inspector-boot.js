// browser/inspector-boot.js — mount the Declare Inspector over a running app.
//
// The Inspector is an ordinary Declare program (apps/inspector/inspector.declare)
// that happens to be ABOUT another program. This module is the only glue: it
// names the subject (setInspectionTarget), compiles the Inspector, and mounts it
// as a CHROME app — page-level, but never seizing the focus root, the keys
// adapter, or the `__declare` bridge, all of which belong to the subject.
//
// The overlay host covers the viewport with `pointer-events: none`, and the
// Inspector's own root declares `pointerEvents = "none"` so only its window and
// highlight take the pointer; everything else falls through to the app being
// inspected, which must stay fully usable while you inspect it.
//
// Relative imports, like every other boot module — subpath-portable.
import { build, mountApp, loadFonts, fontFacesOf, settle, DomBackend, setInspectionTarget } from "../runtime/dist/index.js";
import { loadCompiler, ensureLibrary } from "./compiler-client.js";

const ROOT = new URL("../", import.meta.url);

let mounted = null;

/** Mount (or reveal) the Inspector over `subject`.
 *
 *  `origin` is the subject's root-space position on the PAGE — {0,0} for a
 *  top-level app, the island's box for an embedded one. Every coordinate that
 *  crosses that boundary is offset by it (inspect-service), so picking and
 *  highlighting land correctly on a demo running inside a panel.
 *
 *  Idempotent, and re-targetable: calling it again with a different subject
 *  re-points the running Inspector rather than mounting a second one. */
export async function openInspector(subject, origin = undefined) {
  if (mounted !== null) {
    setInspectionTarget(subject, origin);
    mounted.app.shown = true;
    mounted.app.sel = "app";
    mounted.app.selAttr = "";
    return mounted.app;
  }
  const host = document.createElement("div");
  host.id = "declare-inspector";
  host.style.cssText =
    "position:fixed;inset:0;z-index:2147483000;pointer-events:none;" +
    "font:13px/1.4 ui-sans-serif,system-ui,sans-serif";
  document.body.appendChild(host);

  // The subject is named BEFORE the Inspector's first settle: its constraints
  // read the subject through the `Inspect` service on their very first run.
  setInspectionTarget(subject, origin);

  const [client, src] = await Promise.all([
    loadCompiler().then(ensureLibrary),
    fetch(new URL("apps/inspector/inspector.declare", ROOT), { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error(r.status + " fetching the Inspector"); return r.text(); }),
  ]);
  const out = await client.compile(src);
  if (!out.source) {
    host.style.pointerEvents = "auto";
    host.innerHTML =
      '<pre style="position:absolute;inset:24px;overflow:auto;background:#12161C;color:#FF8B8B;' +
      'padding:20px;border-radius:10px;white-space:pre-wrap">' +
      (out.report || "the Inspector failed to compile").replace(/[&<]/g, (c) => (c === "&" ? "&amp;" : "&lt;")) +
      "</pre>";
    throw new Error("Inspector failed to compile");
  }
  const app = build(out.source, { deps: out.deps });
  await loadFonts(fontFacesOf(app));
  mountApp(app, host, new DomBackend(), { chrome: true });
  settle();
  mounted = { app, host };
  window.__inspector = app;
  return app;
}

export function closeInspector() {
  if (mounted !== null) mounted.app.shown = false;
}

/** A LIVE origin for an island box — read each time it is needed, because the
 *  box moves whenever anything scrolls. Viewport coordinates, matching the
 *  Inspector's own position:fixed overlay. */
export function originOfElement(el) {
  return () => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top }; };
}

/** Wire the toggle: ⌥⌘D anywhere, and auto-open when the page URL carries
 *  `?inspector`. Called by host-client once the subject app is mounted. */
export function wireInspector(subject) {
  addEventListener("keydown", (e) => {
    if (e.altKey && e.metaKey && (e.key === "d" || e.key === "D" || e.code === "KeyD")) {
      e.preventDefault();
      if (mounted !== null && mounted.app.shown) closeInspector();
      else openInspector(subject).catch((err) => console.error("[Declare] Inspector:", err));
    }
  });
  const q = new URLSearchParams(location.search);
  if (q.has("inspector")) {
    openInspector(subject).catch((err) => console.error("[Declare] Inspector:", err));
  }
}
