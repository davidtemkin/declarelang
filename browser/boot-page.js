// browser/boot-page.js — boot ONE program as THIS page.
//
// The page boot: the program is in hand, and this makes it the page — the
// app-relative data and asset base, the demo editors the page names, the
// live-edit compile (through the lazily fetched compiler, only if an editor
// ever publishes an edit), and the host client that gives a running app its
// URL and history, its islands, and its title. Nothing here resolves a program
// or talks to a distro: no artifact ladder, no caches, no service worker, no
// launcher, no server. That is browser/boot-uniform.js's job — the distro's
// resolver — which calls this once it knows the program. A production build
// (tools/declarec.mjs) carries this module and nothing above it: a deployed
// app has no artifacts to load, no worker file, no server to ask.
//
// Relative imports resolve against THIS module's URL (…/browser/) → subpath-portable.
import { bootHost } from "./host-client.js";
import { loadCompiler, ensureLibrary, COMPILER_ABOARD } from "./compiler-client.js";
import { provideTransport, provideAssetBase } from "../runtime/dist/host-api.js";

// ── Stage instrumentation (always on — performance.mark/measure is ~free) ────
// Every boot stage lands on the PERFORMANCE TIMELINE as a `declare:<stage>`
// measure (startTime is relative to navigation start, so overlapping stages —
// the compiler load and the source fetch run in parallel — read as a real
// waterfall in devtools or from a harness). `window.__declarePerf` carries the
// summary: { stages, path, completed } and a `done` promise that resolves at
// the first PAINTED frame after render — the number everything leads to.
export const perfStage = (name) => {
  const startMark = `declare:${name}:start`;
  performance.mark(startMark);
  return {
    end() {
      try { performance.measure(`declare:${name}`, startMark); } catch { /* timeline API absent */ }
    },
  };
};
export const perfDone = (() => {
  let signal;
  const done = new Promise((r) => { signal = r; });
  window.__declarePerf = { done, completed: false };
  return (path) => {
    const stages = performance.getEntriesByType("measure")
      .filter((m) => m.name.startsWith("declare:"))
      .map((m) => ({ stage: m.name.slice(8), start: +m.startTime.toFixed(1), dur: +m.duration.toFixed(1) }));
    Object.assign(window.__declarePerf, { stages, path, completed: true });
    signal(window.__declarePerf);
  };
})();

/**
 * @param cfg {{
 *   main: string,                  // the program's URL, relative to the page — its directory is where
 *                                  //   its data, assets and demos live, whether or not the file itself is served
 *   program: object,               // the compiled program OBJECT — parsed, checked, its dependencies applied
 *                                  //   (a build's, an artifact's, a compile's): instantiated, never parsed here
 *   pageSource?: string|null,      // the program's raw text, for the seeds (`__page__`); the build has none
 *   backend?: "DomBackend"|"CanvasBackend",
 *   host?: HTMLElement, location?: string, provides?: object,
 *   pageWeight?: number, sourceLines?: number,
 *   demos?: string[],              // the demo editors to seed from <main-dir>/demos/<name>.declare; an empty
 *                                  //   array means "none" — only an ABSENT key makes the boot probe demos.json
 *   compile?: (src: string, origin: URL) => Promise<object|null>,
 *                                  // a live edit's compile, when the host has its own (the dev server's);
 *                                  //   default: the external compiler, fetched on first use
 *   prewarm?: (programUrl: URL, name: string) => Promise<object|null>,
 *                                  // an island's program from a build already made: the distro's
 *                                  //   artifacts (boot-uniform), a package's programs/ (declarec);
 *                                  //   default: none — an island compiles through `compile`
 *   path?: string,                 // the boot path's name for the perf summary ("site", "prewarm", …)
 * }}
 * @returns the App, or null after the error panel
 */
export async function bootPage(cfg) {
  const mainUrl = new URL(cfg.main, location.href);
  const mainDir = new URL(".", mainUrl);                          // app-relative assets (demos) live here
  // The app-relative data rule (docs/system-design/location.md §9), made true in the
  // LIVE browser: a relative DataSource url resolves against the PROGRAM's directory
  // — the same base diskDataResolver (Node crawl) and boot-extract (browser crawl)
  // already use. The platform default (page-relative fetch) only agrees when the
  // page IS the program URL; the root index.html boots this same app from the repo
  // root, where "language.json" would otherwise resolve a level too high.
  // Resolve relative data urls against the PROGRAM's directory — and pass
  // `init` through: the transport contract is (url, init), and dropping the
  // second argument silently degraded every DataSource POST/PUT to a bare
  // GET (found 2026-07-30 by the network-browser transport tests).
  provideTransport((url, init) => fetch(new URL(url, mainDir), init));
  // The same correction for BITMAPS: an <img src> resolves against the
  // document, so a relative `source` meant the entry page's directory while
  // the app's DataSources already meant the program's. One base, both.
  provideAssetBase(mainDir.href);

  // Live-edit compile ("Edit this page" + demo previews): the compiler is fetched
  // the first time an editor publishes — never on the path to first paint.
  // A NAMED island (a demo under demos/) compiles as ITS OWN file — the origin its
  // relative paths mean: an `include [ "…" ]` beside it resolves beside it, exactly
  // as `verify` reads the same file on disk. Before this every island compiled as
  // the page's program, so a demo's include looked in the page's directory and
  // the island stayed silently blank (the include form's page, 2026-09-10). The
  // "__"-named live-edit channels have no file and keep the page as their origin.
  const demoBase = new URL("demos/", mainDir).href;              // where mountPreviews fetches unseeded previews
  const liveCompile = async (src, name) => {
    try {
      const origin = name && !name.startsWith("__") ? new URL(name + ".declare", demoBase) : mainUrl;
      // The host's own compile when it has one (the dev server's); else the
      // external compiler. Either way a PROGRAM (compileProgram: parsed,
      // checked, deps applied), so the page instantiates it with no parser.
      const out = cfg.compile
        ? await cfg.compile(src, origin)
        : await loadCompiler().then(ensureLibrary).then((c) => c.compileProgram(src, { mainId: origin.href }));
      // Success is a program; a compile FAILURE hands back { report } so an editing
      // surface can show the diagnostic (the contract host-client documents and the
      // codeviewer host already honors). null stays "compiler not warm — no change".
      return out.program ? { program: out.program }
           : out.report != null ? { report: out.report } : null;
    } catch { return null; }
  };

  // Seed only the demo editors the page NAMES up front (the site's few — whose editors
  // read these seeds directly). Everything else is compiled ON DEMAND: the host fetches
  // a preview's source from `demoBase` the first time that island goes live — the
  // in-process echo of browse-to-run, no manifest, no bulk pre-seed. The docs name none
  // (its ~50 inline examples' editors read their source from the doc model, and their
  // previews are fetched on demand as the reader scrolls to each page).
  const seeds = { __page__: cfg.pageSource ?? null };
  // The page NAMES its demos when its producer could know them — the dev server,
  // the stub baker and a build all read the filesystem, so they always answer, and
  // an EMPTY array is an answer: "this program has none to seed." Only a producer
  // that genuinely cannot know omits the key — the SW's browse-to-run wrapper for a
  // bare `<name>.declare` URL — and only then do we probe for the committed
  // demos.json beside the program (bake-app-stubs writes it for exactly that case).
  //
  // Reading `!demos.length` as "unknown" was the bug: it conflated "none" with "not
  // told", so every program without demo panels — every app in apps/, every program
  // an author writes in my-apps/ — probed for a file that by design would never be
  // there, and opened its console with a 404. Only apps/homepage has a demos.json.
  let demos = Array.isArray(cfg.demos) ? cfg.demos : null;
  if (demos === null) {
    try { const j = await (await fetch(new URL("demos.json", mainDir), { cache: "no-cache" })).json(); demos = Array.isArray(j) ? j : []; } catch { demos = []; }
  }
  if (demos.length) {
    const sDemos = perfStage("demo-seeds");
    await Promise.all(demos.map(async (name) => {
      try { seeds[name] = await (await fetch(new URL("demos/" + name + ".declare", mainDir), { cache: "no-cache" })).text(); } catch {}
    }));
    sDemos.end();
  }

  // An island's program from a build the distro ships, when the host has one to
  // offer (boot-uniform, a site page); a deployed app has none, and its islands
  // compile through `compile`.
  const prewarmChild = cfg.prewarm
    ? async (name) => { try { return await cfg.prewarm(new URL(name + ".declare", demoBase), name); } catch { return null; } }
    : async () => null;

  const sRender = perfStage("render");
  let app;
  try {
    app = await bootHost({                                         // render first — nothing below delays first paint
      program: cfg.program, backend: cfg.backend,
      host: cfg.host,                                              // an explicit mount element — several apps per page, each in its own marked div
      location: cfg.location,
      provides: cfg.provides,                                      // the page as the topmost host: values the app reads with hostProvided("name", …)
      mainAssetBase: mainDir.href,                                 // per-app asset AND data base — N tenants, each its own program dir
      pageWeight: cfg.pageWeight, sourceLines: cfg.sourceLines,
      seeds, demoBase, compile: liveCompile, prewarm: prewarmChild,
      // a host with its own compile (the dev server) or the compiler bundle
      // aboard can produce any program; a production build can produce none
      canCompile: !!cfg.compile || COMPILER_ABOARD,
    });
  } catch (e) {
    // A RUNTIME boot failure gets a banner, never a blank page with an empty
    // console — the one outcome a page must never produce (field report
    // 2026-08-21: all five builders saw it). The distro's boot replaces this
    // panel with the error PAGE (boot-uniform showError); a build has no
    // compiler to raise one, so the panel is what it shows.
    console.error("[Declare] boot failed:", e);
    const msg = "boot failed — the program compiled but did not come up:\n\n" + ((e && e.stack) || e);
    if (cfg.onError) return cfg.onError(msg, mainUrl.href);
    errorPanel(msg);
    return null;
  }
  sRender.end();
  // The number every stage leads to: the first frame the compositor PAINTS
  // after render (double-rAF — the second callback runs after the first
  // frame's paint has been committed).
  const sFrame = perfStage("first-frame");
  requestAnimationFrame(() => requestAnimationFrame(() => { sFrame.end(); perfDone(cfg.path ?? "page"); }));
  return app;
}

/** The last-resort error panel: needs no compiler, no program, nothing but the
 *  document. Shown once; a second failure never stacks a second panel. */
let panelShown = false;
export function errorPanel(msg) {
  console.error("[Declare] " + msg);
  if (panelShown) return;
  panelShown = true;
  const host = document.getElementById("host");
  const p = document.createElement("div");
  p.setAttribute("role", "alert");
  p.style.cssText = "position:fixed;inset:0;margin:0;padding:24px;background:#0B141B;color:#E7EEF2;overflow:auto;box-sizing:border-box;font:13px/1.55 ui-monospace,Menlo,monospace";
  const h = document.createElement("div");
  h.textContent = "Declare — compile error";
  h.style.cssText = "font:600 15px/1.4 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#FF6B6B;margin:0 0 12px";
  const m = document.createElement("div");
  m.style.whiteSpace = "pre-wrap"; m.textContent = String(msg);
  p.appendChild(h); p.appendChild(m);
  (host || document.body).appendChild(p);
}
