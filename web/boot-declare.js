// web/boot-declare.js — boot a single `.declare` program that the Service Worker routed a
// top-level navigation to (see service-worker.js hostPageResponse). This is the "browse to a .declare on
// the static domain and see it run" path: fetch the source + the auto-include library,
// compile IN-BROWSER (the warm-loadable ~1 MB bundle), and render the result into #host.
//
// Relative imports resolve against THIS module's URL (…/web/), NOT the host page's <base>
// (static import specifiers are module-relative), so the runtime + compiler always load from
// the distro tree regardless of which program's directory the page is based at.
import { renderAsync, DomBackend, CanvasBackend } from "../runtime/dist/index.js";
import { parseFlags, DEFAULT_FLAGS } from "../compiler/dist/flags.js";

// The target program's absolute URL — passed by the SW on this module's own import URL.
const target = new URL(import.meta.url).searchParams.get("app");

// Fetch the auto-include manifest + its library sources so bare component tags (e.g. `Bar [ ]`)
// resolve during the in-browser compile. Keyed exactly as the in-memory host expects
// ("library/src/<file>"); an absent/empty library is fine — a program with no auto-includes
// needs none. See compiler/src/compile-browser.ts memoryHost.
async function loadLibrary() {
  try {
    const manifest = await (await fetch(new URL("../library/autoincludes.json", import.meta.url), { cache: "no-cache" })).json();
    const files = {};
    await Promise.all(Object.values(manifest).map(async (rel) => {
      const res = await fetch(new URL("../library/src/" + rel, import.meta.url), { cache: "no-cache" });
      if (res.ok) files["library/src/" + rel] = await res.text();
    }));
    return { manifest, files };
  } catch {
    return {};   // no library → programs without auto-includes still compile
  }
}

async function run() {
  const host = document.getElementById("host");
  if (!target) return showError(host, "no program URL — the Service Worker did not pass ?app=…");
  try {
    // The compiler bundle, the library, and the source in parallel — nothing depends on another.
    const [{ compile }, lib, source] = await Promise.all([
      import("../dist-browser/declare-compiler.js"),
      loadLibrary(),
      fetch(target, { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error(r.status + " fetching " + target);
        return r.text();
      }),
    ]);
    const out = compile(source, lib);
    if (!out.source) {
      return showError(host, (out.errors || []).map((e) => e.message).join("\n") || "compile failed");
    }
    // URL flags (flags.ts, the shared model): `?backend=canvas` renders through the
    // Canvas backend. slim/prod are bundling concerns — they don't apply to this
    // live in-browser compile, which ships no bundle.
    const flags = parseFlags(new URLSearchParams(location.search), DEFAULT_FLAGS);
    const backend = flags.backend === "canvas" ? new CanvasBackend() : new DomBackend();
    await renderAsync(out.source, host, backend);
  } catch (e) {
    showError(host, (e && e.message) ? e.message : String(e));
  }
}

// A clean error panel over the host area — a broken/absent program shows why, not a blank page.
function showError(host, msg) {
  const p = document.createElement("div");
  p.setAttribute("role", "alert");
  p.style.cssText = "position:fixed;inset:0;margin:0;padding:24px;background:#0B141B;color:#E7EEF2;"
    + "overflow:auto;box-sizing:border-box;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace";
  const h = document.createElement("div");
  h.textContent = "Declare — compile error";
  h.style.cssText = "font:600 15px/1.4 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#FF6B6B;margin:0 0 12px";
  const m = document.createElement("div");
  m.style.whiteSpace = "pre-wrap";
  m.textContent = String(msg);
  p.appendChild(h); p.appendChild(m);
  (host || document.body).appendChild(p);
  console.error("[Declare] " + msg);
}

run();
