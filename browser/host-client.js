// browser/host-client.js — the shared client that boots a Declare host page in EITHER
// hosting mode from one code path:
//
//   • dynamic  — a Node dev server inlines the compiled program and delegates live
//                recompiles to POST /compile (cfg.compile fetches it);
//   • static   — a committed precompiled artifact supplies the program and the
//                demos' compiled output (cfg.precompiled); cfg.compile is the
//                in-browser compiler (or a no-op until it's wired).
//
// The page passes a config; this module renders the app, seeds the Declare editors,
// wires the live demo previews (embedded child apps — no iframe), the whole-page
// editor, and the app→host navigation channel. Moving it out of the server's HTML
// template also kills the template-escaping traps that plagued the inline version.
//
// Relative import so the whole tree is subpath-portable (GitHub Pages project
// pages live under /<repo>/): resolved against THIS module's URL, not the page's.
import { renderAsync, build, mountApp, loadFonts, fontFacesOf, settle, disposeApp, reflectAppName, DomBackend, CanvasBackend, provideTransport, observe, isEmbedded, provideHostServices, onIslandSlot, setAppAssetBase } from "../runtime/dist/index.js";

const BACKENDS = { DomBackend, CanvasBackend };

// The distro ROOT (this module lives at <root>/browser/…). App-navigation targets are
// resolved against it, so a distro-relative link ("apps/calendar/") lands
// correctly whether the distro is served from the origin root (dev server) or a
// project subpath (GitHub Pages /<repo>/). Absolute URLs (https://…) pass through.
const DISTRO_ROOT = new URL("../", import.meta.url);

// The app's slice of the URL — the fragment minus its leading `#`, decoded
// (docs/system-design/location.md §4). "" when there is no fragment. The one place the host
// reads window.location for `app.location`; everything else flows through it.
const fragmentOf = () => decodeURIComponent(location.hash.replace(/^#/, ""));

/**
 * @param cfg {{
 *   source: string,              // the compiled main program
 *   backend?: "DomBackend"|"CanvasBackend",
 *   pageWeight?: number, sourceLines?: number,
 *   seeds?: Record<string,string>,        // { <demo>: editorSeedSource, __page__: rawPageSource }
 *   demoBase?: string,                    // abs URL of the demos dir; previews with no seed fetch <demoBase><name>.declare on demand
 *   precompiled?: Record<string,string>,  // { <demo>: compiledSource } — static initial previews
 *   compile?: (source: string) => Promise<{source:string, deps?:any}|null>,  // live recompile (server/in-browser); null = keep last
 *   location?: string,           // initial app.location when it is NOT in the URL fragment — the host's ?view= → initial-location translation (docs/system-design/location.md §4); a real fragment still wins
 *   dataBase?: string,           // abs/page-relative URL of the VIEWED program's directory: a source page's <base> points at the Viewer, so the island's relative DataSource urls (its data lives beside its file) are re-based here via the transport seam
 *   assetBase?: string,          // the same rule for the island child's BITMAPS and web FACES (asset-base.ts): a "__"-named live-edit island (the Viewer's edit pane) has no path of its own, so the host states the viewed program's directory. A named demo derives its own from demoBase.
 * }}
 */
export async function bootHost(cfg) {
  // The mount point: an explicit element (cfg.host — several apps per page, each
  // in its own marked div) or the page's #host. TENANCY is decided here, once,
  // by the DOM itself (runtime isEmbedded): a top-level app owns the page —
  // title, URL, history, the __app/__declare debug handles; an embedded app
  // owns its box and gets NONE of the page-scoped wiring below, which is what
  // the embedding guide promises ("leaves the page's background, scroll, and
  // title alone") — now structural rather than remembered.
  const host = cfg.host ?? document.getElementById("host");
  const embedded = isEmbedded(host);
  // The transport seam (data.ts): on a source page every island runs the VIEWED
  // file, whose relative data urls mean "beside my .declare" — but the document
  // <base> points at the Viewer's own directory. Re-base RELATIVE urls against
  // the viewed program's directory; absolute urls pass through untouched.
  if (cfg.dataBase) {
    const dataBase = new URL(cfg.dataBase, document.baseURI);
    provideTransport((url, init) => fetch(new URL(url, dataBase), init));
  }
  // The `?crawler` flag's embedded static document (docs/system-design/capabilities.md §5): content
  // for crawlers that never run any script. The page already removes #declare-static
  // in a SYNCHRONOUS pre-paint script (serve-core.js / index.html / declarec) so a
  // human never flashes the bare text; this second removal is the belt-and-braces for
  // any boot path that didn't emit that pre-paint remover. Null-safe + idempotent.
  document.getElementById("declare-static")?.remove();
  const Backend = BACKENDS[cfg.backend] ?? DomBackend;
  // Build (parse+check+instantiate), then SEED app.location from the URL BEFORE the
  // first paint (docs/system-design/location.md §2): a deep link is just an initial state, so
  // every constraint derives from it as if the user had already navigated there —
  // no home→target flash. Un-fused from renderAsync so the seed lands pre-mount.
  const app = build(cfg.source, { deps: cfg.deps });
  host.__declareApp = app;                            // the per-box handle (an embedder's way in)
  // The MAIN app's own asset directory (boot-uniform passes the program's dir).
  // Global provideAssetBase is last-boot-wins — fine for one app per page, wrong
  // for several: a per-app base keeps each tenant's relative bitmaps its own.
  if (cfg.mainAssetBase) setAppAssetBase(app, cfg.mainAssetBase);
  if (!embedded) window.__app = app;                  // the page's debug handle — top-level only
  const locationInitial = app.location;               // the declared initial = the default (§3)
  // HOW this document was entered, by the browser's own classification
  // (PerformanceNavigationTiming.type). Only "back_forward" is a TRAVERSAL —
  // the user walked the route, so the entry's coordinate is theirs to have
  // back. "navigate" and "reload" are ARRIVALS, and an arrival rebuilds the
  // app from the URL and nothing else. We defer to the platform's own notion
  // of which happened rather than inventing a second one.
  // (optional-called: a host whose `performance` is the runtime's minimal one —
  // the Mac bridge furnishes `now()` and nothing else — falls back to "navigate",
  // i.e. an arrival, which is the right default for a host with no history.)
  const arrival = performance.getEntriesByType?.("navigation")?.[0]?.type ?? "navigate";
  const traversed = !embedded && arrival === "back_forward";
  // Seed the STEP first, then the address, so location-derived constraints see
  // a consistent pair at first settle. A history ENTRY is the pair (URL,
  // waypoint): the URL carries the address in its fragment; the entry's state
  // object carries the step. Both halves are COORDINATES ON THE ENTRY, never
  // storage — which settles the whole rule in one line: an ARRIVAL rebuilds
  // from the URL (a reload therefore starts at the declared initial step,
  // exactly as a pasted link does — the session was never in the URL to come
  // back), a TRAVERSAL restores the entry's pair. The entries BEHIND this one
  // keep their own steps either way, which is why Back still walks into the
  // session a reload just left: a coordinate sits on its entry. The stale
  // coordinate on THIS entry is squared away by syncByReplace() below.
  const stepOf = () => (typeof history.state?.declare?.w === "string" ? history.state.declare.w : "");
  const stepSeed = traversed ? stepOf() : "";
  if (stepSeed !== "" && app.waypoint !== stepSeed) app.waypoint = stepSeed;
  // An EMBEDDED app never reads the page's URL — the fragment belongs to the
  // page (location.md §0.9); only the embedder's explicit initial applies.
  const seedFrag = embedded ? (cfg.location ?? "") : (fragmentOf() || cfg.location);  // the URL fragment wins; else a host override (?view=)
  if (seedFrag) {
    // A COLD ARRIVAL is a follow (location.md §0.5): the app-scoped onFollow
    // hook applies — at t=0, declared initials, before any data loads (§0.6's
    // stated caveat) — and a redirect leaves the URL out of step with the app,
    // which the canonicalize-by-replace below squares up, minting no entry.
    if (typeof app.follow === "function") app.follow("#" + seedFrag);
    else app.location = seedFrag;                      // an empty fragment leaves the initial alone (§3)
  }
  if (seedFrag || stepSeed !== "") settle();           // propagate to the derived constraints SYNCHRONOUSLY,
                                                       // before the first paint — the deep link's view, no home→target flash
  await loadFonts(fontFacesOf(app));
  mountApp(app, host, new Backend());
  if (cfg.pageWeight != null) app.pageWeight = cfg.pageWeight;
  if (cfg.sourceLines != null) app.sourceLines = cfg.sourceLines;

  const seeds = cfg.seeds ?? {};
  app.demoSources = seeds;                 // host→Declare: seeds every editor by demo name (+ __page__)
  const precompiled = cfg.precompiled ?? {};

  // `compile` is a live binding, not a captured const: on a static host it starts
  // as a stub (edits keep the last render) and is HOT-SWAPPED for the real
  // in-browser compiler once boot-static.js warm-loads it. Every use below reads
  // the current value, so previews/live-edits become live the moment it lands.
  let compile = cfg.compile ?? (async () => null);
  app.__setCompile = (fn) => {
    if (typeof fn !== "function") return;
    compile = fn;
    // The compiler just became real (static host warm-load): everything that
    // was waiting on it gets one retry — unwired islands and unburnt edits.
    // (The old 60Hz loops retried implicitly; this is the explicit moment.)
    host.querySelectorAll('[data-declare-slot^="run:"]').forEach((box) => { if (!box.dataset.wired) mountPreview(box); });
    watchLiveAll();
  };

  // Teardown: a static-host stale-recompile re-boots the whole page in-browser, so
  // this boot's observers + listeners + child apps must stop first or they'd fire
  // against a disposed app. Every wiring below pushes its own undo — there are
  // no standing frame loops left to cancel (the polling ticks this shim ran for
  // every page's lifetime are gone; the runtime notifies instead).
  let stopped = false;
  const undo = [];
  if (!embedded) {
    const onKey = (e) => { if (e.key === "Escape") app.editing = false; };
    addEventListener("keydown", onKey);
    undo.push(() => removeEventListener("keydown", onKey));
  }

  // (app.location, app.waypoint) ⟷ the browser's history — PAGE-scoped wiring,
  // installed for the top-level tenant only: an embedded app's location is its
  // own state, never the page's URL. A history ENTRY is
  // the PAIR: the URL's fragment carries the address (`location`, §2–3 of
  // docs/system-design/location.md), the entry's STATE OBJECT carries the step
  // (`waypoint` — session state Back retraces but the URL never shows). Mirror
  // OUTWARD per settle: one entry when either changed (both changed = ONE
  // entry, so Back restores the pair atomically), a clean URL when the app
  // sits at its declared initial (§3). Write both BACK on back/forward — the
  // ambient-data direction, state re-derives, no popstate handling in app
  // code. Universal and inert when unused: an app that writes neither holds
  // both initials, and nothing pushes.
  if (!embedded) wirePageLocation();
  function wirePageLocation() {
  let mirrored = app.location;                          // what the entry currently reflects (seeded above)
  let mirroredW = app.waypoint;
  // The entry's state object. Namespaced under `declare` so nothing else's
  // pushState collides; `w` is the waypoint, `s` a scroll snapshot stamped at
  // DEPARTURE (below) so a traversal can land where the user left. Coordinates,
  // never data: past ~64KB the contract is being violated and we say so —
  // loudly, before some browser's serialization limit says it cryptically.
  const entryState = (w, s) => ({ declare: s == null ? { w } : { w, s } });
  const guardStep = () => {
    if (app.waypoint.length > 64 * 1024)
      console.error("[Declare] waypoint exceeds 64KB — a waypoint is coordinates in the session, not the session's data; derive the data from it instead (guide ch. 13)");
  };
  // The page's OWN path+query, never a bare "#frag": history resolves against
  // the DOCUMENT BASE, and a source page's <base> points elsewhere (measured
  // on ?viewer, 2026-08-01). Clean URL at the declared initial (§3).
  const urlFor = (loc) => location.pathname + location.search +
    (loc === locationInitial ? "" : "#" + loc);
  // Square the ENTRY to the app BY REPLACE — no entry minted. Covers: the
  // default-valued deep link (`#home` → clean URL, the old rule), a cold
  // arrival the onFollow hook redirected or vetoed, and every history
  // traversal (below). Also consumes a pending replace verb: the entry now
  // agrees with the app, so there is nothing left for the mirror to do.
  const syncByReplace = () => {
    const url = urlFor(app.location);
    if (location.pathname + location.search + location.hash !== url || stepOf() !== app.waypoint)
      history.replaceState(entryState(app.waypoint, history.state?.declare?.s), "", url);   // the scroll stamp survives the squaring
    mirrored = app.location;
    mirroredW = app.waypoint;
    if (app.pendingHistoryVerb !== undefined) app.pendingHistoryVerb = "push";
  };
  syncByReplace();
  // Scroll is PER-ENTRY, manually: the browser's own restoration fires before
  // the traversal's settle (wrong extent), so the host owns it — each entry is
  // stamped with its scroll at departure (the push below) and at pagehide, and
  // restored after the TRAVERSAL's settle. The pagehide stamp serves leaving
  // the site and coming Back (a cross-document traversal re-creates the
  // document and reads it at boot); it is measurably NOT what a reload sees —
  // Chrome discards a replaceState issued from pagehide when the navigation is
  // a reload. Anchor arrivals keep the reveal instead: a stored `@name` intent
  // is the truer landing than a pixel offset against re-derived content.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  const stampScroll = () => {
    history.replaceState(entryState(stepOf(), scrollY), "", location.pathname + location.search + location.hash);
  };
  addEventListener("pagehide", stampScroll);
  const restoreScroll = (s) => {
    if (typeof s !== "number") return;
    // two frames: the traversal's writes settle and paint first, so the extent
    // the scroll lands against is the restored entry's, not the departed one's
    requestAnimationFrame(() => requestAnimationFrame(() => { if (!stopped) scrollTo(0, s); }));
  };
  // Only a TRAVERSAL lands where the user left the entry. An arrival lands at
  // the top, because the top is what the URL says — the same rule as the step.
  // (An `@name` reveal still wins: that one IS in the URL.)
  if (traversed && (!seedFrag || seedFrag.indexOf("@") < 0)) restoreScroll(history.state?.declare?.s);
  const onPop = (e) => {
    if (stopped) return;
    // A TRAVERSAL arrival restores the PAIR: the step first (written directly —
    // a waypoint has no door to guard, since it can never arrive from outside
    // the app; every restored value is one this app wrote earlier), then the
    // address through follow (location.md §0.5.6): the onFollow hook applies,
    // and whatever it decides — pass, redirect, veto — the result is squared
    // to THIS entry by replace. A traversal never pushes, so a redirect rule
    // can never trap Back in a loop.
    const w = typeof e.state?.declare?.w === "string" ? e.state.declare.w : "";
    if (app.waypoint !== w) app.waypoint = w;
    const ref = fragmentOf() || locationInitial;       // an empty fragment restores the initial (§3)
    if (typeof app.follow === "function") app.follow("#" + ref);
    else app.location = ref;
    syncByReplace();
    if (ref.indexOf("@") < 0) restoreScroll(e.state?.declare?.s);
  };
  addEventListener("popstate", onPop);
  // A held reveal intent dies on the user's first gesture (location.md
  // §0.5.5): wheel/touch are unambiguously the user's; the reveal's own
  // programmatic scroll cannot self-cancel because a LANDED reveal already
  // cleared the intent synchronously, before its scroll event dispatches.
  const onUserScroll = () => { if (!stopped && typeof app.cancelReveal === "function") app.cancelReveal(); };
  addEventListener("wheel", onUserScroll, { passive: true });
  addEventListener("touchstart", onUserScroll, { passive: true });
  undo.push(() => {
    removeEventListener("popstate", onPop);
    removeEventListener("pagehide", stampScroll);
    removeEventListener("wheel", onUserScroll);
    removeEventListener("touchstart", onUserScroll);
  });
  // app.appName → document.title, the mirror-per-settle discipline made
  // literal: `observe` runs the mirror at the close of any settle that changed
  // the name (the app never touches document; the name rides a declared attr
  // the host owns). "" = no opinion — the served title stands. The MAPPING
  // lives once in the runtime (boot.js reflectAppName) — declarec builds drive
  // the same function from their own settle hook; this host drives it here,
  // and the mirror below re-reflects BEFORE any history push, so back/forward
  // entries are labeled with the state they represent (the browser snapshots
  // document.title at push). This and the pair mirror replaced a standing rAF
  // loop (locTick) that re-asked both questions every frame for the life of
  // the page; the `@name` reveal pump it also drove is the runtime's own now
  // (App.scheduleReveal — armed only while an intent is held).
  const servedTitle = document.title;
  let titled = reflectAppName(app, servedTitle, "");
  undo.push(observe(() => app.appName, () => { if (!stopped) titled = reflectAppName(app, servedTitle, titled); }, "host:title"));
  const mirrorPair = () => {
    if (stopped) return;
    titled = reflectAppName(app, servedTitle, titled);   // the entry's label, before the push snapshots it
    if (app.location !== mirrored || app.waypoint !== mirroredW) {
      // The app moved — one entry per changed settle, for the PAIR: address,
      // step, or both together (a submit that navigates AND records its turn
      // is one entry, restored atomically by Back). The history VERB
      // (location.md §0.5.6): "push" (the default) makes an entry; a follow
      // whose link declared `replace = true` armed "replace" — fine-grained
      // movement within a place overwrites instead of burying the Back
      // button. The verb governs the whole pair. Consumed here, exactly once.
      // (A verb armed by a follow that changed NOTHING — a vetoed or
      // same-place follow — is consumed by that follow's own syncByReplace or
      // simply sits until the next mirror; the per-frame disarm this replaced
      // closed that window a frame sooner, at the cost of running forever.)
      const verb = app.pendingHistoryVerb === "replace" ? "replace" : "push";
      if (app.pendingHistoryVerb !== undefined) app.pendingHistoryVerb = "push";
      guardStep();
      if (verb === "replace") history.replaceState(entryState(app.waypoint), "", urlFor(app.location));
      else {
        // stamp the OUTGOING entry with its own pair and the departure scroll,
        // so Back can land the user exactly where they left it…
        history.replaceState(entryState(mirroredW, scrollY), "", urlFor(mirrored));
        // …then mint the new one
        history.pushState(entryState(app.waypoint), "", urlFor(app.location));
      }
      mirrored = app.location;
      mirroredW = app.waypoint;
    }
  };
  undo.push(observe(() => [app.location, app.waypoint], mirrorPair, "host:history"));
  }  // wirePageLocation

  // The Inspector (browser/inspector-boot.js) — ⌥⌘D, or `?inspector` on the URL.
  // Lazily imported so a page that never opens it pays nothing. Page-scoped:
  // an embedded widget on a foreign page must not grab the page's keys.
  if (!embedded) import("./inspector-boot.js").then((m) => m.wireInspector(app)).catch(() => {});

  app.__teardown = () => {
    stopped = true;
    for (const fn of undo.splice(0)) { try { fn(); } catch {} }
    host.querySelectorAll('[data-declare-slot^="run:"]').forEach((box) => {
      if (box.__childApp) { disposeApp(box.__childApp); box.__childApp = null; }
    });
  };

  // app→host VERBS — the service table (runtime provideHostServices), called
  // SYNCHRONOUSLY inside the verb, still within the click's transient user
  // activation (which is what window.open needs — the old next-frame poll sat
  // a frame later, not earlier). This replaced navTick, a 60Hz loop that
  // re-read three channels for the life of every page. An embedded app gets
  // navigate/openWindow — a widget's outbound link legitimately navigates the
  // page, and a foreign embedder can re-provide its own table to intercept —
  // but never the Inspector, which is the page tenant's tool.
  const navServices = {
    navigate: (u) => { if (!stopped) location.href = new URL(u, DISTRO_ROOT).href; },
    openWindow: (u) => { if (!stopped) window.open(new URL(u, DISTRO_ROOT).href, "_blank"); },
  };
  provideHostServices(app, embedded ? navServices : {
    ...navServices,
    // app.inspect(slot) — open the Inspector on an embedded app (or on this one
    // when the slot is empty). The island's box gives the subject's page origin,
    // which the Inspector needs to pick and highlight in the right place.
    inspect: (slot) => {
      if (stopped) return;
      const box = slot ? host.querySelector(`[data-declare-slot="${slot}"]`) : null;
      const child = box && box.__childApp ? box.__childApp : null;
      import("./inspector-boot.js")
        .then((m) => m.openInspector(child ?? app, child && box ? m.originOfElement(box) : undefined))
        .catch((e) => console.error("[Declare] Inspector:", e));
    },
  });

  const runIsland = (demo) => host.querySelector('[data-declare-slot^="run:' + demo + '"]');   // ^= : the slot may carry an env segment

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
    if (!compiled || !compiled.source) return;           // keep the last good render
    if (box.__childApp) { disposeApp(box.__childApp); box.__childApp = null; }
    for (const fn of box.__childUndo?.splice(0) ?? []) { try { fn(); } catch {} }
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
      const childApp = await renderAsync(compiled.source, box, backend,
        { deps: compiled.deps, assetBase: childAssetBase(name || "") });
      box.__childApp = childApp;
      if (childApp) {
        childApp.demoSources = seeds;                     // populate a nested copy's own editors
        const childUndo = (box.__childUndo = box.__childUndo ?? []);
        // The child's own wiring, by observation (its lifetime is known HERE):
        //  • verbs — a child's navigate()/openWindow() were serviced by nobody
        //    before (every such link was dead); page-level nav is the right
        //    meaning for a preview's outbound link.
        provideHostServices(childApp, navServices);
        //  • appName ↑ childName — the island's name mirror (was a 60Hz page
        //    scan in dom-backend; now one observe per mounted child).
        const view = box.__declareView;
        if (view) {
          const reflect = () => { const n = typeof childApp.appName === "string" ? childApp.appName : ""; if (view.childName !== n) view.childName = n; };
          reflect();
          childUndo.push(observe(() => childApp.appName, reflect, "host:childName"));
        }
        //  • live edits published on the child's own channels (an embedded
        //    Viewer's Edit tab) — same observation as the page app's.
        childUndo.push(observe(() => [childApp.liveCard, childApp.liveSource], () => watchLive(childApp, box), "host:childLive"));
      }
    } catch (e) {
      // The island is already marked wired, so a swallowed failure here is a
      // pane that stays blank forever with nothing said. Say it: a preview that
      // never mounts is a bug in the host or the child, not a quiet outcome.
      console.error("[Declare] preview '" + (name || "?") + "' failed to render", e);
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
      const res = await fetch(new URL(name + ".declare", base), { cache: "no-cache" });
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
  // The slot marker's ENV segment: after the program path, `|k=v&k2=v2` is the
  // embedding environment — parsed here, coerced (true/false/numeric), and
  // written WHOLESALE to the child app's reactive `app.env`, at mount and on
  // every later change (the invoker's slot is a constraint, so a host flipping
  // dark mode re-marks the slot and the child re-derives — the clean
  // pass-through).
  const parseEnv = (q) => {
    const env = {};
    for (const pair of (q || "").split("&")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      const k = eq < 0 ? pair : pair.slice(0, eq);
      const v = eq < 0 ? "true" : pair.slice(eq + 1);
      env[k] = v === "true" || v === "1" ? true : v === "false" || v === "0" ? false
        : v !== "" && !isNaN(Number(v)) ? Number(v) : v;
    }
    return env;
  };

  // Wire ONE island box (called per slot event, never per frame — see the
  // registration below). Idempotent: a wired box only re-syncs env.
  async function mountPreview(box) {
    if (stopped || !box.isConnected || !box.dataset.declareSlot?.startsWith("run:")) return;
    const spec = box.dataset.declareSlot.split(":").slice(1).join(":").split("|");
    const name = spec[0];
    const env = parseEnv(spec[1]);
    const ejson = JSON.stringify(env);
    // live env sync for an already-mounted child (an env change arrives as a
    // slot RE-MARK — the invoker's slot is a constraint — so this runs then)
    if (box.__childApp && box.dataset.envJson !== ejson) {
      box.dataset.envJson = ejson;
      box.__childApp.env = env;
    }
    if (box.dataset.wired || box.dataset.wiring) return;
    box.dataset.wiring = "1";                              // in-flight: one compile at a time
    // precompiled entries are a bare compiled-source string (the legacy static
    // artifact channel); normalize to the `{ source }` result shape renderChild
    // takes. A live compile already returns `{ source, deps }`.
    let compiled = precompiled[name] != null ? { source: precompiled[name] } : null;
    // The VALIDATED prewarm tier, same as the page boot's (boot-uniform wires
    // it in): a slot whose program is on the committed prewarm list mounts
    // with no compiler and no compile; null (absent/stale) falls through.
    if (compiled == null && typeof cfg.prewarm === "function") {
      try { compiled = await cfg.prewarm(name); } catch {}
    }
    if (compiled == null) {
      // "__"-named slots are LIVE-EDIT channels (__raw__, __page__), never
      // fetchable files: unseeded, they mount only when an edit publishes
      // through watchLive — skip quietly instead of 404-ing on a retry.
      if (name.startsWith("__") && seeds[name] == null) { delete box.dataset.wiring; return; }
      const src = await sourceFor(name);                  // seed, or fetched on demand
      compiled = src == null ? null : await compile(src); // src null (fetch failed) ⇒ retry below
    }
    delete box.dataset.wiring;
    if (!compiled || !compiled.source) { deferPreview(box); return; }  // compiler not warm / fetch missed — retry when it lands
    box.dataset.wired = "1";                               // committed: don't remount
    renderChild(box, compiled, name).then(() => {
      if (box.__childApp) { box.dataset.envJson = ejson; box.__childApp.env = env; }
    });
  }
  // The RETRY path — the one genuine wait in this shim (a compiler still
  // warm-loading, a fetch that missed). The old loop retried at 60Hz forever;
  // this holds the pending boxes and retries on a short timer that exists
  // ONLY while something is pending — idle-zero the rest of the page's life.
  const pendingPreviews = new Set();
  let previewTimer = 0;
  function deferPreview(box) {
    pendingPreviews.add(box);
    if (previewTimer !== 0) return;
    previewTimer = setTimeout(() => {
      previewTimer = 0;
      const batch = [...pendingPreviews];
      pendingPreviews.clear();
      if (!stopped) for (const b of batch) mountPreview(b);
    }, 250);
  }
  undo.push(() => { clearTimeout(previewTimer); previewTimer = 0; pendingPreviews.clear(); });
  // (Island DISCOVERY registration sits at the END of bootHost — everything
  // it can reach must be initialized before the replay fires.)

  // Re-render a preview when its Declare editor publishes an edit (or a Revert): recompile
  // the edited text and swap. Debounced; a compile failure keeps the last good render
  // AND feeds the rendered report to `app.liveReport` (a delegate that reports failure
  // returns `{ report }` instead of null), so an editing surface can show the error; a
  // clean compile clears it. A null result (compiler not warm / network) changes nothing.
  // Live edits are watched on EVERY app on the page — the page app AND each
  // embedded child (an embedded Declare Viewer's Edit tab publishes
  // liveCard/liveSource on ITS OWN app) — with the child's preview island
  // scoped to the child's box so two hosted viewers never cross wires.
  const liveSigs = new WeakMap(), liveTimers = new WeakMap();
  const watchLive = (theApp, scope) => {
    if (stopped || !theApp.liveCard) return;             // nothing published yet
    const sig = theApp.liveCard + "\x00" + theApp.liveSource;
    if (liveSigs.get(theApp) === sig) return;
    const box = scope.querySelector('[data-declare-slot^="run:' + theApp.liveCard + '"]');
    // the island may not be MOUNTED yet (the viewer's edit pane slots its
    // island only in edit mode; the channel can publish first) — don't burn
    // the signature; the island's own mark event (onIslandSlot above) re-runs
    // this the moment the box appears
    if (!box) return;
    liveSigs.set(theApp, sig);
    const body = theApp.liveSource;
    const card = theApp.liveCard;                        // captured with the body: both name the edit this timer serves
    clearTimeout(liveTimers.get(theApp));
    liveTimers.set(theApp, setTimeout(async () => {
      const r = await compile(body);
      if (stopped) return;
      if (r && r.source) { theApp.liveReport = ""; renderChild(box, r, card); }
      else if (r && r.report != null) theApp.liveReport = String(r.report);
      else { liveSigs.delete(theApp); watchLive(theApp, scope); }  // compiler not warm — re-arm (compile resolves only once it loaded)
    }, 180));
  };
  // Watch every app on the page — the page app AND each mounted child — by
  // OBSERVATION: the publish is a write to that app's liveCard/liveSource, so
  // the runtime tells us at the settle that carried the edit (this replaced
  // liveTick, a 60Hz page scan). watchChild is called from renderChild at
  // child mount; watchLiveAll re-checks everyone after an island appears.
  function watchLiveAll() {
    watchLive(app, host);
    host.querySelectorAll('[data-declare-slot^="run:"]').forEach((box) => {
      if (box.__childApp) watchLive(box.__childApp, box);
    });
  }
  undo.push(observe(() => [app.liveCard, app.liveSource], () => watchLive(app, host), "host:live"));
  watchLive(app, host);

  // Island DISCOVERY is a registration, not a scan: the runtime calls this for
  // every slot at mark and re-mark (dom-backend setEmbed), replaying slots
  // that already exist — the mtick that scanned the page per frame is gone.
  // Containment keeps the scope the scan had (everything under THIS host,
  // nested children included) while two sibling apps stay out of each other.
  // Registered LAST: the replay fires synchronously into everything above.
  undo.push(onIslandSlot((box) => {
    if (stopped || !host.contains(box)) return;
    mountPreview(box);
    watchLiveAll();
  }));

  return app;
}
