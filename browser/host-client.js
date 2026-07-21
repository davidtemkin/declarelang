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
import { renderAsync, build, mountApp, loadFonts, fontFacesOf, settle, disposeApp, reflectAppName, DomBackend, CanvasBackend } from "../runtime/dist/index.js";

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
 * }}
 */
export async function bootHost(cfg) {
  const host = document.getElementById("host");
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
  const app = (window.__app = build(cfg.source, { deps: cfg.deps }));
  const locationInitial = app.location;               // the declared initial = the default (§3)
  const seedFrag = fragmentOf() || cfg.location;       // the URL fragment wins; else a host override (?view=)
  if (seedFrag) {
    app.location = seedFrag;                           // an empty fragment leaves the initial alone (§3)
    settle();                                          // propagate to the location-derived constraints SYNCHRONOUSLY,
  }                                                     // before the first paint — the deep link's view, no home→target flash
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
  app.__setCompile = (fn) => { if (typeof fn === "function") compile = fn; };

  // Teardown: a static-host stale-recompile re-boots the whole page in-browser, so
  // this boot's rAF loops + listener + child apps must stop first or they'd fire
  // against a disposed app. `stopped` short-circuits every tick; teardown cancels
  // the pending frames, drops the listener, and disposes the preview children.
  let stopped = false;
  const raf = {};
  const onKey = (e) => { if (e.key === "Escape") app.editing = false; };
  addEventListener("keydown", onKey);

  // app.location ⟷ the URL fragment (docs/system-design/location.md §2–3). Mirror OUTWARD per
  // settle: one history push when the app changed it (push-only, §10.1), a clean URL
  // when the app sits at its declared initial (the default rule, §3). Write it BACK
  // on the browser's back/forward — the ambient-data direction, state re-derives, no
  // popstate handling in app code. Universal and inert when unused: an app that never
  // writes location holds location == initial, so the fragment stays empty, nothing
  // pushes. Retires the homepage's hand-wired `route`↔`#why` mirror.
  let mirrored = app.location;                          // what the URL currently reflects (seeded above)
  // Canonicalize a default-valued deep link (`#home`) to a clean URL — once, and by
  // REPLACE (not push), so it leaves no dead history entry.
  if (app.location === locationInitial && location.hash) {
    history.replaceState(null, "", location.pathname + location.search);
  }
  const onPop = () => {
    if (stopped) return;
    app.location = fragmentOf() || locationInitial;    // an empty fragment restores the initial (§3)
    mirrored = app.location;                            // the host wrote it — don't echo it back as a push
  };
  addEventListener("popstate", onPop);
  // app.appName → document.title, the same mirror-per-settle discipline as
  // location (the app never touches document; the name rides a declared attr
  // the host owns). "" = no opinion — the served title stands. The MAPPING
  // lives once in the runtime (boot.js reflectAppName) — declarec builds drive
  // the same function from their own frame loop; this host drives it here,
  // BEFORE the history push below, so back/forward entries are labeled with
  // the state they represent (the browser snapshots document.title at push).
  const servedTitle = document.title;
  let titled = "";                                      // what document.title currently reflects
  const locTick = () => {
    if (stopped) return;
    titled = reflectAppName(app, servedTitle, titled);
    if (app.location !== mirrored) {                   // the app navigated — one push per changed settle
      mirrored = app.location;
      const frag = app.location === locationInitial ? "" : app.location;   // clean URL at the default (§3)
      history.pushState(null, "", frag ? "#" + frag : location.pathname + location.search);
    }
    // The `@name` reveal (docs/system-design/location.md §6) — a retained intent, resolved each
    // frame so a cold deep link fires once the target (a DataSource-fed heading) is
    // in the settled tree. Inert with no anchor. Runs post-paint, so DOM headings exist.
    app.resolveReveal();
    raf.loc = requestAnimationFrame(locTick);
  };
  raf.loc = requestAnimationFrame(locTick);

  app.__teardown = () => {
    stopped = true;
    for (const k in raf) cancelAnimationFrame(raf[k]);
    removeEventListener("keydown", onKey);
    removeEventListener("popstate", onPop);
    host.querySelectorAll('[data-declare-slot^="run:"]').forEach((box) => {
      if (box.__childApp) { disposeApp(box.__childApp); box.__childApp = null; }
    });
  };

  // app→host navigation: a link/button calls App.navigate(url) (the service action,
  // capabilities.md §6), which writes the `pendingNav` channel; open it + clear.
  // Same-document nav (not window.open) so it isn't popup-blocked a frame after the click.
  const navTick = () => {
    if (stopped) return;
    if (app.pendingNav) { const u = app.pendingNav; app.pendingNav = ""; location.href = new URL(u, DISTRO_ROOT).href; }
    // openWindow's channel: a NEW window/tab. The rAF after the click is still
    // inside the browser's transient user activation, so this isn't popup-blocked.
    if (app.pendingOpen) { const u = app.pendingOpen; app.pendingOpen = ""; window.open(new URL(u, DISTRO_ROOT).href, "_blank"); }
    raf.nav = requestAnimationFrame(navTick);
  };
  raf.nav = requestAnimationFrame(navTick);

  const runIsland = (demo) => host.querySelector('[data-declare-slot^="run:' + demo + '"]');   // ^= : the slot may carry an env segment

  // Render an ALREADY-COMPILED program as an embedded child app inside <box>. The
  // box lives inside THIS app's marked tree, so the child auto-detects it is embedded
  // (runtime isEmbedded): it sizes to the box, scopes focus/pointer, never touches
  // the page. Old child disposed first (stage listeners) so a live edit swaps cleanly.
  // `compiled` is the ONE compile result `{ source, deps }` — the preview child boots
  // on the SAME static-constraint path as the main app (deps applied), never a
  // divergent runtime-tracking path.
  async function renderChild(box, compiled) {
    if (!compiled || !compiled.source) return;           // keep the last good render
    if (box.__childApp) { disposeApp(box.__childApp); box.__childApp = null; }
    box.innerHTML = "";
    // The island is a viewport: a child that won't fit (a fixed-size app, or a
    // floored one holding its minWidth/minHeight) pans natively inside its box.
    // `auto` shows scrollbars only on real overflow, so a fitting app is untouched.
    box.style.overflow = "auto";
    try {
      const childApp = await renderAsync(compiled.source, box, new DomBackend(), { deps: compiled.deps });
      box.__childApp = childApp;
      if (childApp) childApp.demoSources = seeds;         // populate a nested copy's own editors
    } catch (e) {}
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

  function mountPreviews() {
    host.querySelectorAll('[data-declare-slot^="run:"]').forEach(async (box) => {
      const spec = box.dataset.declareSlot.split(":").slice(1).join(":").split("|");
      const name = spec[0];
      const env = parseEnv(spec[1]);
      const ejson = JSON.stringify(env);
      // live env sync for an already-mounted child
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
        // through watchLive — skip quietly instead of 404-ing every frame.
        if (name.startsWith("__") && seeds[name] == null) { delete box.dataset.wiring; return; }
        const src = await sourceFor(name);                  // seed, or fetched on demand
        compiled = src == null ? null : await compile(src); // src null (fetch failed) ⇒ retry next tick
      }
      delete box.dataset.wiring;
      if (!compiled || !compiled.source) return;             // compiler not warm / source not in yet — retry next tick
      box.dataset.wired = "1";                               // committed: don't remount
      renderChild(box, compiled).then(() => {
        if (box.__childApp) { box.dataset.envJson = ejson; box.__childApp.env = env; }
      });
    });
  }
  const mtick = () => { if (stopped) return; mountPreviews(); raf.mount = requestAnimationFrame(mtick); };
  raf.mount = requestAnimationFrame(mtick);

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
    if (!theApp.liveCard) return;                        // nothing published yet
    const sig = theApp.liveCard + "\x00" + theApp.liveSource;
    if (liveSigs.get(theApp) === sig) return;
    const box = scope.querySelector('[data-declare-slot^="run:' + theApp.liveCard + '"]');
    // the island may not be MOUNTED yet (the viewer's edit pane slots its
    // island only in edit mode; the channel can publish first) — don't burn
    // the signature; retry each tick until the box appears
    if (!box) return;
    liveSigs.set(theApp, sig);
    const body = theApp.liveSource;
    clearTimeout(liveTimers.get(theApp));
    liveTimers.set(theApp, setTimeout(async () => {
      const r = await compile(body);
      if (r && r.source) { theApp.liveReport = ""; renderChild(box, r); }
      else if (r && r.report != null) theApp.liveReport = String(r.report);
      else liveSigs.delete(theApp);                      // compiler not warm — retry
    }, 180));
  };
  const liveTick = () => {
    if (stopped) return;
    watchLive(app, host);
    host.querySelectorAll('[data-declare-slot^="run:"]').forEach((box) => {
      if (box.__childApp) watchLive(box.__childApp, box);
    });
    raf.live = requestAnimationFrame(liveTick);
  };
  raf.live = requestAnimationFrame(liveTick);

  return app;
}
