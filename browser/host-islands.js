// host-islands — the islands a page's app hosts: each `run:` slot's program,
// resolved (precompiled, prewarmed, or compiled here), mounted as an embedded
// child app in its box — or, on canvas, composed into the island's surface —
// and linked across the boundary. Split from host-client.js so a production
// build of a program that hosts no island carries none of it (the `islands`
// capability, compiler/src/capabilities.ts); there, wireIslands is a stand-in
// whose methods do nothing.

import { mapUrl, renderProgramAsync, afterSettle, disposeApp, DomBackend, observe, provideHostServices, onIslandSlot, setAppAssetBase, linkIslandTenant, islandProvisions, mountEmbeddedApp, kernelReady } from "../runtime/dist/host-api.js";

/** Wire the islands of `app`, the app bootHost just mounted in `host`. Returns
 *  `renderChild` (a live edit re-renders an island through it), `retry` (the
 *  compiler just became real: mount what was waiting on it), `discover`
 *  (register for island slots — called last, since the replay fires
 *  synchronously into everything above it) and `dispose` (the page's
 *  teardown, after its wiring is undone). */
export function wireIslands({ app, host, cfg, seeds, compile, navServices, isStopped, undo, live, hasProgram, buildApp }) {
  // Render an ALREADY-COMPILED program as an embedded child app inside <box>. The
  // box lives inside THIS app's marked tree, so the child auto-detects it is embedded
  // (runtime isEmbedded): it sizes to the box, scopes focus/pointer, never touches
  // the page. Old child disposed first (stage listeners) so a live edit swaps cleanly.
  // `compiled` is the ONE compile result `{ source, deps }` — the preview child boots
  // on the SAME static-constraint path as the main app (deps applied), never a
  // divergent runtime-tracking path.
  // Where an island child's RELATIVE assets live — its own program's directory,
  // never the host document's. A named slot IS a path under the demos dir, so
  // the base derives itself; a "__"-named live-edit channel (__raw__, __page__)
  // has no path of its own and the host states it (the Viewer knows the file it
  // is showing). Null leaves the page default in force. The data twin of this
  // is cfg.dataBase above — same rule, different seam.
  const childAssetBase = (name) => {
    if (!name.startsWith("__") && cfg.demoBase) {
      try { return new URL(name + ".declare", new URL(cfg.demoBase, document.baseURI)).href; } catch {}
    }
    if (cfg.assetBase) { try { return new URL(cfg.assetBase, document.baseURI).href; } catch {} }
    return null;
  };

  async function renderChild(box, compiled, name) {
    if (!hasProgram(compiled)) return;                   // keep the last good render
    if (box.__childApp) { disposeApp(box.__childApp); box.__childApp = null; }
    for (const fn of childUndoOf.get(box)?.splice(0) ?? []) { try { fn(); } catch {} }
    box.innerHTML = "";
    // The island is a viewport: a child that won't fit (a fixed-size app, or a
    // floored one holding its minWidth/minHeight) pans natively inside its box.
    // `auto` shows scrollbars only on real overflow, so a fitting app is untouched.
    box.style.overflow = "auto";
    try {
      // An EMBEDDED app never realizes native fragment hrefs (location.md
      // §0.9): a real "#why" anchor inside an island targets the HOST page's
      // fragment, and copy-link copies a lie. linkBase "" suppresses the
      // fragment overlay — in-app routing still works (the router follows);
      // external links keep their real anchors. An embedder that knows the
      // child's true program URL may set it instead, restoring the natives.
      const backend = new DomBackend();
      backend.linkBase = "";
      const childUndo = childUndoOf.get(box) ?? childUndoOf.set(box, []).get(box);
      // THE ISLAND BOUNDARY (islands.md): what the island `provides` goes
      // down, what the tenant `exposes` comes up, and the post/onPost verbs.
      // Built WITH what the island provides, so its first evaluation already
      // sees it, and linked before its first settle to keep it live. A link failure leaves the tenant mounted
      // but unlinked, said loudly — a broken link must not take the render.
      const islView = islandViewOf.get(box);
      const childOpts = {
        assetBase: childAssetBase(name || ""),
        provides: islView && typeof islView.post === "function" ? islandProvisions(islView) : undefined,
        beforeMount: (app) => {
          if (!islView || typeof islView.post !== "function") return;
          try { childUndo.push(linkIslandTenant(islView, app)); }
          catch (e) { console.error(`[Declare] ${name || "island"}: ${e.message}`); }
        },
      };
      const childApp = await renderProgramAsync(compiled.program, box, backend, childOpts);
      box.__childApp = childApp;
      if (childApp) {
        childApp.demoSources = seeds;                     // populate a nested copy's own editors
        // The child's own wiring, by observation (its lifetime is known HERE):
        //  • verbs — a child's navigate()/openWindow() were serviced by nobody
        //    before (every such link was dead); page-level nav is the right
        //    meaning for a preview's outbound link.
        provideHostServices(childApp, navServices);
        //  • appName ↑ childName — the island's name mirror (was a 60Hz page
        //    scan in dom-backend; now one observe per mounted child).
        const view = islandViewOf.get(box);
        if (view) {
          const reflect = () => { const n = typeof childApp.appName === "string" ? childApp.appName : ""; if (view.childName !== n) view.childName = n; };
          reflect();
          childUndo.push(observe(() => childApp.appName, reflect, "host:childName"));
        }
        //  • live edits published on the child's own channels (an embedded
        //    Viewer's Edit tab) — same observation as the page app's.
        live().watchChild(childApp, box, childUndo);
      }
    } catch (e) {
      // The island is already marked wired, so a swallowed failure here is a
      // pane that stays blank forever with nothing said. Say it: a preview that
      // never mounts is a bug in the host or the child, not a quiet outcome.
      console.error(`[Declare] preview '${name || "?"}' failed to render`, e);
    }
  }

  // The source for a preview island. A provided seed wins (the site's editors read the
  // SAME seeds, so those are handed in up front); otherwise the source is fetched ON
  // DEMAND from the demos dir the first time the island goes live — the in-process echo
  // of browse-to-run: no manifest, no bulk pre-seed, just "ask the compiler for the one
  // source when you need it," exactly as a SW dispatches a `.declare` navigation. The
  // result is cached back into `seeds` so retries, a copied editor, and a nested child
  // app all reuse it. Returns null on a failed/absent fetch so the box stays eligible
  // and the next rAF tick retries (a truthy "" only when there's simply no source).
  async function sourceFor(name) {
    if (seeds[name] != null) return seeds[name];
    if (!cfg.demoBase) return "";
    try {
      const base = new URL(cfg.demoBase, document.baseURI);   // demoBase may be relative (dev <base>) or absolute (static host)
      // through the URL map: a package that ships a program's source as a file
      // (ship [ files = […] ]) serves it from its own folder
      const res = await fetch(mapUrl(new URL(name + ".declare", base).href), { cache: "no-cache" });
      if (res.ok) return (seeds[name] = await res.text());
    } catch {}
    return null;
  }

  // Wire EVERY unwired "run:" island to its program. Static mode uses the precompiled
  // output; otherwise it compiles the seed or the on-demand-fetched source. Recurses only
  // as deep as the user clicks: a preview island exists only when its editor is OPEN, and
  // every copied editor starts CLOSED — no action ⇒ no growth.
  //
  // The island for a live-compiled program (e.g. the whole-page "__page__" editor,
  // which has no precompiled artifact) can appear BEFORE the ~1 MB in-browser compiler
  // has warm-loaded — most likely on a slow device (an iPad opening the editor with a
  // quick tap). Until it lands `compile` is a stub returning null, so we must NOT
  // commit `wired` on a null result: mark the box in-flight (`wiring`) to suppress
  // duplicate compiles, and only set `wired` once we actually have output. A null keeps
  // the box eligible so the next rAF tick retries — the preview mounts the moment the
  // compiler is ready, whether the editor was opened before or after it loaded.
  // Wire ONE island box (called per slot event, never per frame — see the
  // registration below). Idempotent: a wired box is left alone — what the
  // host provides reaches the tenant through the island link, not the slot.
  async function mountPreview(box) {
    if (isStopped() || !box.dataset.declareSlot?.startsWith("run:")) return;
    if (!box.isConnected) { deferPreview({ el: box }); return; }   // mid-attach — retry lands it
    const name = box.dataset.declareSlot.slice(4);
    if (box.dataset.wired || box.dataset.wiring) return;
    box.dataset.wiring = "1";                              // in-flight: one compile at a time
    const { compiled, unseeded } = await resolveCompiled(name);
    delete box.dataset.wiring;
    if (unseeded) return;
    if (!hasProgram(compiled)) { deferPreview({ el: box }); return; }  // compiler not warm / fetch missed — retry when it lands
    box.dataset.wired = "1";                               // committed: don't remount
    renderChild(box, compiled, name);
  }

  // Resolve a slot name to its compiled program — the SAME ladder for a DOM
  // box and a canvas island: precompiled artifact → validated prewarm →
  // seed / on-demand fetch + compile. `unseeded` marks the "__"-named
  // LIVE-EDIT channels (__raw__, __page__) with nothing published yet — they
  // mount only when an edit arrives through watchLive, never by fetch.
  const unbuilt = new Set();                             // islands reported once as not built
  async function resolveCompiled(name) {
    let compiled = null;
    // The VALIDATED prewarm tier, same as the page boot's (boot-uniform wires
    // it in): a slot whose program is on the committed prewarm list mounts
    // with no compiler and no compile; null (absent/stale) falls through.
    if (compiled == null && typeof cfg.prewarm === "function") {
      try { compiled = await cfg.prewarm(name); } catch {}
    }
    if (compiled == null) {
      if (name.startsWith("__") && seeds[name] == null) return { compiled: null, unseeded: true };
      // No artifact, and this host cannot compile (a production build carries
      // no compiler — hosting.md, the three models): the island names a
      // program the build did not produce. Said once, with the fix, and the
      // box stays empty rather than retrying forever.
      if (cfg.canCompile === false) {
        if (!unbuilt.has(name)) {
          unbuilt.add(name);
          console.error(`[Declare] island '${name}' names a program this build did not compile — a build compiles the programs its islands name as literals; a computed name is declared at the top of the program: ship [ islands = ["${name}"] ] — then rebuild`);
        }
        return { compiled: null, unseeded: true };
      }
      const src = await sourceFor(name);                  // seed, or fetched on demand
      compiled = src == null ? null : await compile()(src, name); // src null (fetch failed) ⇒ retry via defer; compiled AS the demo's own file (its includes resolve beside it)
    }
    return { compiled, unseeded: false };
  }

  // A CANVAS island (the sealed surface has no element): the tenant is a
  // Declare program, so it mounts by SURFACE COMPOSITION — the child app's
  // root surface becomes a child of the island's surface (mountEmbeddedApp,
  // the mac backend's own pattern) and the page's paint and hit walks reach
  // it like any subtree. Then the same bridge as everywhere: link the
  // boundary (provides down, exposes up), wire the verbs, hand the child the nav services.
  // island element → its VIEW, fed by the discovery events below — the
  // sanctioned successor to reading a backend-planted expando off the box
  // (the scrub, islands design: the event carries the view; nothing needs
  // the back-door)
  const islandViewOf = new WeakMap();
  // island box → the per-tenant undo pile (bridge unlink, name observe, …)
  const childUndoOf = new WeakMap();
  const canvasWiring = new WeakSet();
  async function mountCanvasPreview(view, slotStr) {
    if (isStopped() || !slotStr.startsWith("run:")) return;
    const name = slotStr.slice(4);
    if (view.__childApp) return;                                  // already mounted: the link carries changes
    if (canvasWiring.has(view)) return;
    canvasWiring.add(view);
    const { compiled, unseeded } = await resolveCompiled(name);
    canvasWiring.delete(view);
    if (unseeded || isStopped()) return;
    if (!hasProgram(compiled)) { deferPreview({ view, slot: slotStr }); return; }
    if (view.__childApp || view.$surface == null) return;          // raced a re-mark / detached
    try {
      await kernelReady();
      const childApp = buildApp(compiled, { provides: typeof view.post === "function" ? islandProvisions(view) : undefined });
      const base = childAssetBase(name || "");
      // ASSET base only — deliberately no per-app DATA base: an island child's
      // relative data urls resolve through the PAGE's transport, its host's
      // space (the desktop passes the viewer `program=desktop.declare`, a path
      // in the DESKTOP's directory). Coupling data to the asset base 404'd
      // every such contract — found on the DOM mount 2026-08-19 (ad796537) and
      // AGAIN here on the canvas mount 2026-08-21: the same one-line disease
      // in the twin code path, presenting as "no code in the viewer" on
      // ?render=canvas.
      if (base) setAppAssetBase(childApp, base);
      // the boundary first, so the tenant's first settle sees what the host provides
      if (typeof view.post === "function") {
        try { childApp.__unlink = linkIslandTenant(view, childApp); }
        catch (e) { console.error(`[Declare] ${name || "island"}: ${e.message}`); }
      }
      mountEmbeddedApp(childApp, view);
      childApp.demoSources = seeds;
      provideHostServices(childApp, navServices);
      view.__childApp = childApp;
    } catch (e) {
      console.error(`[Declare] canvas island '${name || "?"}' failed to mount`, e);
    }
  }
  // The RETRY path — the one genuine wait in this shim (a compiler still
  // warm-loading, a fetch that missed). The old loop retried at 60Hz forever;
  // this holds the pending boxes and retries on a short timer that exists
  // ONLY while something is pending — idle-zero the rest of the page's life.
  const pendingPreviews = new Set();     // { el } (a DOM box) or { view, slot } (a canvas island)
  let previewTimer = 0;
  function drainPending() {
    const batch = [...pendingPreviews];
    pendingPreviews.clear();
    if (isStopped()) return;
    for (const p of batch) { if (p.el) mountPreview(p.el); else mountCanvasPreview(p.view, p.slot); }
  }
  function deferPreview(entry) {
    pendingPreviews.add(entry);
    if (previewTimer !== 0) return;
    previewTimer = setTimeout(() => { previewTimer = 0; drainPending(); }, 250);
  }
  undo.push(() => { clearTimeout(previewTimer); previewTimer = 0; pendingPreviews.clear(); });
  // Island DISCOVERY is a registration, not a scan: the runtime calls this for
  // every slot at mark and re-mark (dom-backend setEmbed), replaying slots
  // that already exist — the mtick that scanned the page per frame is gone.
  // Containment keeps the scope the scan had (everything under THIS host,
  // nested children included) while two sibling apps stay out of each other.
  // Registered LAST: the replay fires synchronously into everything above.
  const discover = () => undo.push(onIslandSlot((ev) => {
    if (isStopped() || ev.slot === "") return;
    if (ev.el) {
      // a DOM island: the box mounts content; containment keeps the scope the
      // old scan had (everything under THIS host, nested children included).
      // ⚠ setEmbed fires during the ATTACH WALK, while the subtree is still
      // DETACHED — containment cannot be judged yet, and an edge-triggered
      // event judged too early is missed forever (found live: the docs
      // chapter's later-built islands never mounted; the old 60Hz scan was
      // accidentally immune). Insertion completes within the same settle, so
      // scope at its close.
      const el = ev.el;
      const admit = () => {
        if (isStopped() || !host.contains(el)) return;   // scoped once connected
        if (ev.view) islandViewOf.set(el, ev.view);
        mountPreview(el);
        live().watchAll();
      };
      if (el.isConnected) admit();
      else afterSettle(admit);
    } else if (ev.view && ev.view.root === app) {
      // a CANVAS island of THIS page's app: surface composition (no element)
      mountCanvasPreview(ev.view, ev.slot);
    }
  }));


  // a torn-down page disposes the children it mounted, once its own wiring is undone
  const dispose = () => {
    host.querySelectorAll('[data-declare-slot^="run:"]').forEach((box) => {
      if (box.__childApp) { disposeApp(box.__childApp); box.__childApp = null; }
    });
  };
  const retry = () => {
    host.querySelectorAll('[data-declare-slot^="run:"]').forEach((box) => { if (!box.dataset.wired) mountPreview(box); });
    drainPending();          // canvas islands (and missed fetches) waiting on this very compiler
  };
  return { renderChild, retry, discover, dispose };
}
