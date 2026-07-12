// web/host-client.js — the shared client that boots a Declare host page in EITHER
// hosting mode from one code path:
//
//   • dynamic  — a Node dev server inlines the compiled program and delegates live
//                recompiles to POST /compile (cfg.compile fetches it);
//   • static   — a committed precompiled artifact supplies the program and the
//                demos' compiled output (cfg.precompiled); cfg.compile is the
//                in-browser compiler (or a no-op until it's wired).
//
// The page passes a config; this module renders the app, seeds the neo editors,
// wires the live demo previews (embedded child apps — no iframe), the whole-page
// editor, and the app→host navigation channel. Moving it out of the server's HTML
// template also kills the template-escaping traps that plagued the inline version.
//
// Relative import so the whole tree is subpath-portable (GitHub Pages project
// pages live under /<repo>/): resolved against THIS module's URL, not the page's.
import { renderAsync, disposeApp, DomBackend, CanvasBackend } from "../runtime/dist/index.js";

const BACKENDS = { DomBackend, CanvasBackend };

/**
 * @param cfg {{
 *   source: string,              // the compiled main program
 *   backend?: "DomBackend"|"CanvasBackend",
 *   pageWeight?: number, sourceLines?: number,
 *   seeds?: Record<string,string>,        // { <demo>: editorSeedSource, __page__: rawPageSource }
 *   precompiled?: Record<string,string>,  // { <demo>: compiledSource } — static initial previews
 *   compile?: (source: string) => Promise<string|null>,  // live recompile (server/in-browser); null = keep last
 * }}
 */
export async function bootHost(cfg) {
  const host = document.getElementById("host");
  const Backend = BACKENDS[cfg.backend] ?? DomBackend;
  const app = (window.__app = await renderAsync(cfg.source, host, new Backend(), { deps: cfg.deps }));
  if (cfg.pageWeight != null) app.pageWeight = cfg.pageWeight;
  if (cfg.sourceLines != null) app.sourceLines = cfg.sourceLines;

  const seeds = cfg.seeds ?? {};
  app.demoSources = seeds;                 // host→neo: seeds every editor by demo name (+ __page__)
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
  app.__teardown = () => {
    stopped = true;
    for (const k in raf) cancelAnimationFrame(raf[k]);
    removeEventListener("keydown", onKey);
    host.querySelectorAll('[data-neo-slot^="run:"]').forEach((box) => {
      if (box.__childApp) { disposeApp(box.__childApp); box.__childApp = null; }
    });
  };

  // app→host navigation: a link/button sets App.navigate to a URL; open it + clear.
  // Same-document nav (not window.open) so it isn't popup-blocked a frame after the click.
  const navTick = () => {
    if (stopped) return;
    if (app.navigate) { const u = app.navigate; app.navigate = ""; location.href = u; }
    raf.nav = requestAnimationFrame(navTick);
  };
  raf.nav = requestAnimationFrame(navTick);

  const runIsland = (demo) => host.querySelector('[data-neo-slot="run:' + demo + '"]');

  // Render an ALREADY-COMPILED program as an embedded child app inside <box>. The
  // box lives inside THIS app's marked tree, so the child auto-detects it is embedded
  // (runtime isEmbedded): it sizes to the box, scopes focus/pointer, never touches
  // the page. Old child disposed first (stage listeners) so a live edit swaps cleanly.
  async function renderChild(box, compiledSource) {
    if (!compiledSource) return;                         // keep the last good render
    if (box.__childApp) { disposeApp(box.__childApp); box.__childApp = null; }
    box.innerHTML = "";
    try {
      const childApp = await renderAsync(compiledSource, box, new DomBackend());
      box.__childApp = childApp;
      if (childApp) childApp.demoSources = seeds;         // populate a nested copy's own editors
    } catch (e) {}
  }

  // Wire EVERY unwired "run:" island to its program. Static mode uses the precompiled
  // output; otherwise it compiles the seed. Recurses only as deep as the user clicks:
  // a preview island exists only when its editor is OPEN, and every copied editor
  // starts CLOSED — no action ⇒ no growth.
  //
  // The island for a live-compiled program (e.g. the whole-page "__page__" editor,
  // which has no precompiled artifact) can appear BEFORE the ~1 MB in-browser compiler
  // has warm-loaded — most likely on a slow device (an iPad opening the editor with a
  // quick tap). Until it lands `compile` is a stub returning null, so we must NOT
  // commit `wired` on a null result: mark the box in-flight (`wiring`) to suppress
  // duplicate compiles, and only set `wired` once we actually have output. A null keeps
  // the box eligible so the next rAF tick retries — the preview mounts the moment the
  // compiler is ready, whether the editor was opened before or after it loaded.
  function mountPreviews() {
    host.querySelectorAll('[data-neo-slot^="run:"]').forEach(async (box) => {
      if (box.dataset.wired || box.dataset.wiring) return;
      box.dataset.wiring = "1";                              // in-flight: one compile at a time
      const name = box.dataset.neoSlot.split(":")[1];
      const compiled = precompiled[name] ?? (await compile(seeds[name] || ""));
      delete box.dataset.wiring;
      if (!compiled) return;                                 // compiler not warm yet (or failed) — retry next tick
      box.dataset.wired = "1";                               // committed: don't remount
      renderChild(box, compiled);
    });
  }
  const mtick = () => { if (stopped) return; mountPreviews(); raf.mount = requestAnimationFrame(mtick); };
  raf.mount = requestAnimationFrame(mtick);

  // Re-render a preview when its neo editor publishes an edit (or a Revert): recompile
  // the edited text and swap. Debounced; a compile failure keeps the last good render.
  let liveSig = app.liveCard + "\x00" + app.liveSource, liveTimer;
  const liveTick = () => {
    if (stopped) return;
    const sig = app.liveCard + "\x00" + app.liveSource;
    if (sig !== liveSig) {
      liveSig = sig;
      const box = runIsland(app.liveCard), body = app.liveSource;
      clearTimeout(liveTimer);
      if (box) liveTimer = setTimeout(async () => renderChild(box, await compile(body)), 180);
    }
    raf.live = requestAnimationFrame(liveTick);
  };
  raf.live = requestAnimationFrame(liveTick);

  return app;
}
