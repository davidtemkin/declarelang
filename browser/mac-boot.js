// mac-boot — the native client's boot ladder and app host.
//
// TWO TIERS, and the second one does the work:
//
//   PRODUCTION  a built artifact (declarec --render mac) — program JSON
//               beside its assets, loaded from disk. No compiler, no server.
//   CLIENT      the compiler, compiling the fetched source locally — on the
//               host's compile thread, behind a source-hash cache.
//
// THE DEV SERVER IS NOT A TIER ANY MORE. It used to be, and it made the native
// client's performance a property of something else's process: `?program&render=mac`
// missed the server's own COMPILE_CACHE entirely (which only the `POST /compile`
// handler reads or writes), so every single boot paid a cold server recompile —
// 330–580ms of "slow fetch" that was neither slow nor a fetch. Meanwhile the
// client tier, which is the one a shipped app must use anyway, was the path
// least exercised and the only one with no cache at all.
//
// So the native client compiles natively, always, and caches what it compiled.
// One path, exercised on every boot, and the same one a program opened from
// disk with no server in sight has always taken. The dev server keeps its OTHER
// job — serving the distro: the library, the compiler bundle, the program.
//
// WHERE THE COMPILE HAPPENS is the host's business, not this file's: `H.compile`
// hands the source to a worker thread with its own JSContext and answers with
// compiled JS (see CompileService.swift). The in-context compiler below stays as
// the fallback for a host too old to have it.
//
// Mounting is the ordinary runtime call: build() → mountApp() with the mac
// backend. Because the runtime's environment probes are shimmed (mac-env.js),
// the SAME wireInput/wireEnvironment paths the DOM client uses run here —
// pointer capture, hover, keyboard, host sizing — and only the drawing is
// native.

import { build, mountApp, settle, provideTransport, provideMeasurer, loadFonts, fontFacesOf, bridgeFor,
         Keys, Focus, deliverKeys, setInspectionTarget, linkIslandTenant, setAppAssetBase } from "../runtime/dist/index.js";
import { MacBackend, flushOps, provideHitPath, macScroll, macWheel, macRichHeight, macRichLink,
         macEditInput, macEditFocus, macEditEnter, embedsPending, mountEmbed, clearEmbed, surfaceById,
         publishChildName, islandViewById, macScrollTo, surfaceOrigin, createOverlaySurface, rootBox,
         countOps, peekOps, macTraceHit } from "../runtime/dist/mac-backend.js";

const H = globalThis.__declareMacHost;
const log = (m) => H.log("log", m);

// ── host seams the runtime already exposes ──────────────────────────────────
provideMeasurer(globalThis.__declareMeasurer);
provideHitPath((d, x, y) => H.pathHit(d, x, y));
// Relative data URLs resolve against the PROGRAM's directory — the web
// client's rule (boot-uniform's `new URL(url, mainDir)`), which is what makes
// `url = "../../docs/declare-model.json"` mean the same thing in every host.
provideTransport((url, opts) => {
  const href = new URL(url, globalThis.__declareBase || "http://localhost/").href;
  return readerRequest(href) ?? fetch(href, opts);
});

/** THE READER'S TWO REQUESTS, answered natively.
 *
 *  The Viewer reads a program through `<program>?segments` (highlighted spans +
 *  line metrics) and `<program>?file` (the bytes). Those are DEV SERVER
 *  endpoints — `server/create.mjs serveSource` — and Source mode on this host
 *  routinely points at a `file:` program with no server anywhere, where they
 *  answer nothing and the Viewer shows its chrome over an empty document.
 *
 *  So the host answers them itself. It can: `?file` is the read the host already
 *  does, and `?segments` is `highlight()` on the compiler this app carries. Only
 *  `file:` URLs are intercepted — an http program still gets the real endpoints
 *  from the server that is serving it, which is the same answer by construction
 *  (both sides call the same `highlight`).
 *
 *  `metrics` is deliberately absent: it costs a second toolchain entry point,
 *  and viewer.declare already counts lines locally when the payload omits it
 *  (`localMetrics`, written for static hosts, which is exactly this case).
 *
 *  Returns null when the request is not one of these, so the caller falls
 *  through to the ordinary fetch. */
function readerRequest(href) {
  if (!/^file:/i.test(href)) return null;
  const q = href.lastIndexOf("?");
  if (q < 0) return null;
  const kind = href.slice(q + 1);
  if (kind !== "file" && kind !== "segments") return null;
  const path = href.slice(0, q);
  // ⚠ THE SHIM'S SHAPE, not `new Response`. There is no Response class in this
  // context — mac-env's fetch resolves a plain object with exactly these
  // members, and a synthesized reply that does not match it fails wherever a
  // real one would have worked.
  const reply = (status, body, type) => ({
    ok: status >= 200 && status < 300,
    status,
    url: href,
    headers: { get: (k) => (String(k).toLowerCase() === "content-type" ? type : null) },
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  });
  return (async () => {
    const res = await fetch(path);
    if (!res.ok) return reply(404, "not found: " + path, "text/plain");
    const source = await res.text();
    if (kind === "file") return reply(200, source, "text/plain");
    // The compiler is loaded on demand; the reader is often the first thing to
    // want it in a window that booted from cache.
    if (!(await loadCompiler(platformBase()))) return reply(503, "no compiler", "text/plain");
    try {
      const segments = await globalThis.__declareCompiler.highlight(source);
      return reply(200, JSON.stringify({ path: path.split("/").pop(), segments }), "application/json");
    } catch (e) {
      return reply(500, String((e && e.message) || e), "text/plain");
    }
  })();
}

// ── the ladder ──────────────────────────────────────────────────────────────

async function fromProduction(dirUrl) {
  // A built artifact: program.json beside its assets (declarec --render mac).
  try {
    const res = await fetch(new URL("program.json", dirUrl).href);
    if (!res.ok) return null;
    const j = await res.json();
    if (!j || !j.source) return null;
    log("boot: production artifact");
    return { source: j.source, deps: j.deps ?? {}, base: dirUrl };
  } catch { return null; }
}

/** WHERE THE LIBRARY AND THE COMPILER COME FROM: this app's baked platform,
 *  for every program, always. `H.platform` is Contents/Resources laid out like
 *  the tree (Bridge.platformBase), so the same URL joins resolve there.
 *
 *  ⚠ THE POINT IS THAT THERE IS NO CHOICE HERE. This used to pick between the
 *  baked platform, a tree named by the host's stamp, and the serving origin of
 *  an http program — three answers, resolved per program, at run time. That is
 *  how an app could pair its own runtime with some other tree's compiler, which
 *  is the mixture behind both recorded misdiagnoses on this host (2026-08-01
 *  and 2026-08-17). The platform is now decided when the app is BUILT.
 *
 *  A program's OWN includes and assets still resolve beside the program — that
 *  is the document, and it is a different question from this one. */
const platformBase = () => H.platform || "";

let compilerLoaded = false;
async function loadCompiler(distro) {
  if (compilerLoaded) return true;
  // Only reachable from a bundle with no Resources, which Bridge.assertPlatform
  // has already complained about by name.
  if (!distro) { log("no baked platform: cannot load the compiler — rebuild with mac-host/bundle.sh"); return false; }
  const url = new URL("bundles/declare-compiler-mac.js", distro).href;
  const res = await fetch(url);
  if (!res.ok) return false;
  const src = await res.text();
  H.evaluate(src, url);          // into this same JSC context
  compilerLoaded = typeof globalThis.__declareCompiler === "object";
  return compilerLoaded;
}

/** The auto-include library, exactly as the web client supplies it.
 *
 *  Required by EVERY client-side compile, not just the boot fall-through: a
 *  program compiled without it fails with `unknown component 'Button'` on every
 *  bare tag. The live-edit channel compiles in this same context, and when boot
 *  took the server tier this had never run — so the workbench reported ten
 *  unknown components for a file that compiles clean. */
async function ensureLibrary(distro) {
  if (globalThis.__declareLibLoaded) return;
  if (!distro) return;
  try {
    const manifest = await (await fetch(new URL("library/autoincludes.json", distro).href)).json();
    // The MANIFEST is what must be in hand: the auto-include pass needs the
    // tag→file table to know WHICH components a program names. The sources are
    // NOT prefetched — `origins` hands the compiler a fetch host, so it reads the
    // handful a program actually reaches, from the distro, during the walk. (The
    // web dropped its equivalent preload the same way. It also could not have
    // worked here: a program opened from disk has no origin to prefetch from.)
    globalThis.__declareCompiler.setDefaultLibrary({ manifest, libraryRoot: "library", origins: { distro } });
    globalThis.__declareLibLoaded = true;
  } catch (e) { log("client compile: library fetch failed — " + e.message); }
}

// ── the compile call ────────────────────────────────────────────────────────
//
// `H.compile` is the host's compile thread (CompileService.swift): its own
// JSContext on its own JSVirtualMachine, a source-hash cache in front of it, and
// neither on this thread. It is the whole reason a cold compile no longer stalls
// the window it is opening.
//
// The in-context path below it is a genuine fallback, not dead code: a host
// binary older than this bundle has no `H.compile`, and the two must agree about
// what a compile MEANS — so they call the same compiler with the same options.

let compileSeq = 1;
const compilesPending = new Map();
globalThis.__declareCompileDone = (id, ok, source, depsJson, report, origin, ms) => {
  const p = compilesPending.get(id);
  if (!p) return;
  compilesPending.delete(id);
  let deps = {};
  try { deps = depsJson ? JSON.parse(depsJson) : {}; } catch {}
  p.resolve({ source: ok ? source : "", deps, report, origin, ms });
};

/** Compile a source string. `url` identifies the program to the cache; `dir` is
 *  where its own includes resolve from. Answers `{source, deps, report}`. */
function compileSource(url, src, dir, distro) {
  if (typeof H.compile === "function") {
    return new Promise((resolve) => {
      const id = compileSeq++;
      compilesPending.set(id, { resolve });
      H.compile(id, url, src, dir, distro);
    });
  }
  return (async () => {
    if (!(await loadCompiler(distro))) return { source: "", deps: {}, report: "no compiler" };
    await ensureLibrary(distro);
    const out = await globalThis.__declareCompiler.compile(src, { originDir: dir });
    return { source: out.source ?? "", deps: out.deps ?? {}, report: out.report ?? "", origin: "in-context" };
  })();
}

async function fromClient(programUrl) {
  const distro = platformBase();
  const src = await (await fetch(programUrl)).text();
  // The program's OWN directory, absolute — which is what makes its includes
  // resolve beside IT while the library still resolves against the distro.
  const dir = programUrl.replace(/[^/]*$/, "");
  const out = await compileSource(programUrl, src, dir, distro);
  if (!out.source) throw new Error(out.report || "compile failed");
  log("boot: " + (out.origin === "cache" ? "compile cache hit" : "compiled")
      + (out.ms != null ? " (" + Math.round(out.ms) + "ms)" : ""));
  return { source: out.source, deps: out.deps ?? {}, base: programUrl };
}

/** The ladder, in order, with each tier falling through on absence. */
async function resolveProgram(url) {
  if (url.endsWith("/") || url.endsWith("program.json")) {
    const p = await fromProduction(url.endsWith("/") ? url : url.replace(/program\.json$/, ""));
    if (p) return p;
  }
  const c = await fromClient(url);
  if (c) return c;
  throw new Error("could not load " + url);
}

// ── mounting ────────────────────────────────────────────────────────────────

let currentApp = null;
let backend = null;

export async function macBoot(url) {
  const { source, deps, base } = await resolveProgram(url);
  // Assets (images, data) resolve against the program's own directory — the
  // same rule the web client uses, expressed through the transport's base.
  globalThis.__declareBase = base.replace(/[^/]*$/, "");
  // The program URL itself, for `POST /compile?main=` — the web passes its page's
  // program the same way, and it is what resolves a live edit's includes.
  globalThis.__declareMain = base;
  const app = build(source, { deps });
  // THE BOOT URL'S QUERY IS THE APP'S ENV. On the web a top-level app is reached
  // by a URL and an EMBEDDED one is handed `env` by its host (host-client's
  // parseEnv); natively there is no embedder, so the query is the only channel a
  // window has for "run this program WITH these parameters".
  //
  // Source mode is what needed it: the window boots
  // `apps/viewer/viewer.declare?program=<the program>`, and the Viewer reads
  // `app.env.program` to know what to read. Without this it came up with its
  // chrome and an empty document — the program it was pointed at simply never
  // reached it.
  const env = envFrom(base);
  if (env !== null) app.env = env;       // REPLACE, never mutate (view.ts EMPTY_ENV)
  currentApp = app;
  globalThis.__app = app;
  liveApps.set(app, null);       // the root app can publish live edits too
  installChildPointerEnv();

  // A deep link is an initial state: seed location BEFORE the first paint.
  const hash = new URL(base).hash.replace(/^#/, "");
  if (hash) { app.location = hash; settle(); }

  try { await loadFonts(fontFacesOf(app)); } catch {}

  backend = new MacBackend();
  mountApp(app, hostStub(), backend);
  // wireInput (inside mountApp) treats the host stub as a TOP-LEVEL app and
  // wires everything a browser page gets: Focus root, Keys.listen, deliverKeys,
  // and `window.__declare`. Two native realities on top of that:
  //
  //   THE BRIDGE lands on the shim's `window` object, which is not JSC's
  //   global — so it is re-published on globalThis, where the control
  //   channel's `eval` (and a human at the FIFO) can reach it bare. One
  //   vocabulary, three transports.
  //
  //   RE-MOUNTING is this host's normal life — one process, many
  //   `__declareBoot`s — where a browser gets one mount per document. The
  //   runtime's wiring is idempotent for exactly this reason (keys.ts
  //   `listen` replaces the liveness probe per target; focus.ts `deliverKeys`
  //   is once per service pair): before it was, each boot stacked another
  //   listener × another delivery handler, and one Tab advanced focus N²
  //   times — measured 2026-08-01 as nextCalls 9/16/25/36 on four consecutive
  //   boots, N²'s parity alternating per boot, presenting for two days as a
  //   focus "coin toss". The alive probe below is the one per-host refinement:
  //   it tracks the CURRENT app, not the app that happened to mount first.
  globalThis.__declare = bridgeFor(app);
  Focus.setRoot(app);
  Keys.listen(() => currentApp?.surface != null);
  deliverKeys(Keys, Focus);
  wireDiag();
  settle();
  flushOps();
  H.setTitle(app.appName || programName(base));
  startPumps(app);
  return app;
}

/** mountApp expects a host element; natively the host is the window's root
 *  layer, so this stub answers only what wireInput probes (never embedded,
 *  no ancestors). */
function hostStub() {
  return { closest: () => null, clientWidth: globalThis.innerWidth, clientHeight: globalThis.innerHeight,
           style: {}, appendChild() {}, querySelectorAll: () => [], querySelector: () => null,
           addEventListener() {}, removeEventListener() {}, isConnected: true, ownerDocument: globalThis.document };
}

/** What to call a program that does not name itself: its FILE NAME.
 *
 *  ⚠ THE PATH ONLY — no query, no fragment. This used to be a bare
 *  `split("/").pop()`, so a URL's query rode into the window title and the
 *  Viewer announced itself as `desktop.declare?render=mac`.
 *
 *  Stripped unconditionally rather than by an allowlist, because none of the
 *  three things a query can carry belongs in a title:
 *
 *    · the COMPILE MODIFIERS (`render`, `crawler`) address the host — the same
 *      document rendered natively is the same document;
 *    · the REQUEST TYPES (`viewer`, `file`, `segments`, `extract`, `build`,
 *      `program`) name a representation, and where one is showing, the titlebar
 *      already says so — the lit "View Source" chip is that statement;
 *    · anything else is the program's own `env`, and a program that wants the
 *      title to reflect it has `appName`, which is reactive, formatted, and
 *      preferred over this.
 *
 *  An allowlist would also rot: reqtypes.ts is explicitly extensible ("a new
 *  artifact slots in as a new REQ value"). "The file name" needs no upkeep.
 *
 *  Percent-decoded, so a path with spaces reads as a path and not as %20. */
const programName = (u) => {
  const file = u.split(/[?#]/)[0].split("/").pop() || "app";
  let name = file.replace(/\.declare$/, "");
  try { name = decodeURIComponent(name); } catch { /* leave it as written */ }
  return name;
};

/** The boot URL's query as an `env` record, or null when there is no query.
 *
 *  Same coercions as the web's island env (host-client.js parseEnv) so that
 *  `env.dark` is a boolean and `env.scale` a number in both places — a program
 *  written against one host must not have to re-parse for the other. The
 *  RENDER control (`?render=mac`) is dropped: it addresses the host, not the
 *  program, and every gate URL carries it. */
function envFrom(url) {
  const q = url.indexOf("?");
  if (q < 0) return null;
  const env = {};
  let any = false;
  for (const [k, raw] of new URLSearchParams(url.slice(q + 1))) {
    if (k === "render") continue;
    any = true;
    env[k] = raw === "true" || raw === "1" ? true
           : raw === "false" || raw === "0" ? false
           : raw !== "" && !isNaN(Number(raw)) ? Number(raw) : raw;
  }
  return any ? env : null;
}

/** Per-frame work the native host drives: settle-driven title, and the embed
 *  (AppIsland) wiring — the native peer of host-client's mountPreviews.
 *  A frame OBSERVER, not a rAF loop: a rAF re-arm demands the next frame, and
 *  that demand held the display link — and the process — awake at the display's
 *  refresh rate while the app sat idle. Everything this watches (appName, new
 *  islands, live-edit publishes) changes only under an event, a timer, or a
 *  completion, each of which already requests a frame for the observer to
 *  ride. The one H.needFrame() below covers boot itself, where islands are
 *  already pending but nothing else may ever ask for a frame. */
function startPumps(app) {
  let title = "";
  globalThis.__declareObserveFrames(() => {
    if (currentApp !== app) return false;
    if (app.appName !== title) { title = app.appName; H.setTitle(title || "Declare"); }
    wireEmbeds();
    liveTick();
    navTick(app);
    inspectTick(app);
  });
  H.needFrame();
}

/** THE TWO NAVIGATION CHANNELS, serviced. `app.navigate(url)` and
 *  `app.openWindow(url)` are SERVICE ACTIONS (capabilities.md §6): the verb
 *  writes a plain field, the host polls it on the next frame, acts, and clears
 *  it. host-client.js does exactly this for the web.
 *
 *  ⚠ NOTHING SERVICED THEM HERE. Both fields were written and never read, so
 *  every link in every program was dead on this host — silently, because a link
 *  that does nothing looks like a link you missed. Found while adding
 *  back/forward, which is what made it visible: a history with no way to travel
 *  has nothing to remember.
 *
 *  Resolved against the PROGRAM, not the platform: a link says where it is
 *  going relative to the file it is written in, the same rule its includes and
 *  assets already follow. (The web resolves against DISTRO_ROOT because there a
 *  program and the distro share an origin; here they need not.) */
function navTick(app) {
  const base = globalThis.__declareMain || globalThis.__declareBase || "";
  if (app.pendingNav) {
    const u = app.pendingNav; app.pendingNav = "";
    H.navigate(new URL(u, base).href, false);
  }
  if (app.pendingOpen) {
    const u = app.pendingOpen; app.pendingOpen = "";
    H.navigate(new URL(u, base).href, true);   // true = a window of its own
  }
}

// ── the Inspector, as chrome over the running program ───────────────────────
//
// `inspect(slot)` sets `pendingInspect` and the HOST decides what that means —
// the same discipline as navigate() and openWindow(), so a `{ }` body never
// reaches for a window. On the web `host-client` imports inspector-boot and
// appends an overlay div; here the overlay is a chrome SURFACE at the top of
// the layer tree (mac-backend createOverlaySurface) and the Inspector mounts
// into it exactly as an island tenant does.
//
// ⚠ THIS ONLY WORKS BECAUSE `pointerEvents = "none"` STOPPED SEALING SUBTREES
// (0762f6fb). The Inspector's root is transparent so presses fall through to
// the program it is inspecting, while its own window states `"auto"` and takes
// them back. Until that fix the native walk returned null at the transparent
// root, so this overlay would have rendered perfectly and been completely dead
// to input.

let inspectorOverlay = null;   // the chrome surface, while the Inspector is up
let inspectorApp = null;       // the Inspector's own app instance
let inspectorBusy = false;

function inspectTick(app) {
  // Keep the overlay on the window: the root's box is the frame, and a resize
  // moves it without anything else noticing.
  if (inspectorOverlay !== null) {
    const r = rootBox();
    if (r !== null && (inspectorOverlay.width !== r.width || inspectorOverlay.height !== r.height)) {
      inspectorOverlay.setWidth(r.width);
      inspectorOverlay.setHeight(r.height);
      if (inspectorApp !== null) { inspectorApp.hostWidth = r.width; inspectorApp.hostHeight = r.height; }
    }
  }
  if (app.pendingInspect === null || inspectorBusy) return;
  const slot = app.pendingInspect;
  app.pendingInspect = null;
  toggleInspector(app, slot).catch((e) => log("inspector: " + e.message));
}

/** Open the Inspector over `subject` (or over the child app in `slot`), or —
 *  called again while it is up — take it down. A toggle, because the titlebar
 *  control and ⌥⌘I are both toggles and there is one Inspector per window. */
async function toggleInspector(subject, slot = "") {
  if (inspectorOverlay !== null) { closeInspector(); return; }
  inspectorBusy = true;
  try {
    // The subject: this app, or the tenant of a named island. An embedded
    // subject also needs its ORIGIN — every coordinate the Inspector picks or
    // highlights crosses that boundary (inspect-service), so a demo inside a
    // panel highlights in the right place.
    let target = subject, origin = undefined;
    if (slot) {
      for (const [child, sid] of childIslands) {
        const box = surfaceById(sid);
        if (box && wiredEmbeds.get(sid) === slot) { target = child; origin = surfaceOrigin(sid); break; }
      }
    }
    const compiled = await inspectorProgram();
    if (compiled === null) { log("inspector: could not load apps/inspector"); return; }
    const ov = createOverlaySurface();
    if (ov === null) { log("inspector: no root to overlay"); return; }
    inspectorOverlay = ov;
    // ⚠ NAME THE SUBJECT BEFORE THE FIRST SETTLE — the same order, and the same
    // reason, as inspector-boot on the web. `Inspect.ready()` reads a plain
    // module variable, not a reactive cell, so a constraint that runs before
    // the target is set caches its answer and never re-derives: the Inspector
    // came up with a populated tree and "no subject" in its header, because
    // different constraints happened to run on different sides of the call.
    setInspectionTarget(target, origin);
    inspectorApp = mountCompiled(ov.id, compiled, {});
    if (inspectorApp === null) { closeInspector(); return; }
    settle(); flushOps(); H.needFrame();
    H.inspectorState && H.inspectorState(true);
    log("inspector: open over " + (slot || "the app"));
  } finally { inspectorBusy = false; }
}

function closeInspector() {
  setInspectionTarget(null);
  if (inspectorOverlay !== null) {
    clearEmbed(inspectorOverlay.id);
    inspectorOverlay.destroy();
    inspectorOverlay = null;
  }
  inspectorApp = null;
  settle(); flushOps(); H.needFrame();
  H.inspectorState && H.inspectorState(false);
  log("inspector: closed");
}

/** The Inspector's own program. PLATFORM, not one of the apps: it ships inside
 *  the bundle beside the compiler and the library (bundle.sh), so a host with
 *  no Declare tree can still open it — the same self-containment the rest of
 *  the platform now has. Compiled once per process and kept. */
let inspectorCompiled = null;
async function inspectorProgram() {
  if (inspectorCompiled !== null) return inspectorCompiled;
  // The Inspector is PLATFORM, not an application: it ships inside the app at
  // the same relative path the tree uses (bundle.sh), so one URL names it.
  const base = platformBase();
  if (!base) return null;
  const url = new URL("apps/inspector/inspector.declare", base).href;
  try {
    const src = await (await fetch(url)).text();
    const dir = url.replace(/[^/]*$/, "");
    const out = await compileSource(url, src, dir, base);
    if (!out.source) { log("inspector: " + (out.report || "compile failed")); return null; }
    inspectorCompiled = { source: out.source, deps: out.deps ?? {} };
    return inspectorCompiled;
  } catch (e) { log("inspector: " + e.message); return null; }
}

/** The host's own entry — what ⌥⌘I and the titlebar control call. */
globalThis.__declareToggleInspector = () => {
  if (currentApp) toggleInspector(currentApp).catch((e) => log("inspector: " + e.message));
};
globalThis.__declareInspectorOpen = () => inspectorOverlay !== null;

// ── AppIsland: a whole program inside a box, natively ───────────────────────
//
// The web host mounts a child app into an island's ELEMENT. Natively there is
// no element — and none is needed: the child's root surface is inserted as a
// CHILD SURFACE of the island's, so it lands in the same layer tree. Paint and
// hit-testing then reach it by the ordinary walk (no second router, no
// coordinate sync) — the embedding is strictly simpler than the web's.

const wiredEmbeds = new Map();
const embedGen = new Map();
const embedUnlinks = new Map();   // surfaceId -> the bridge unlink (islands design)
/** Every app that could publish a live edit → the island surface it lives in
 *  (null for the root app). The web watches the page app AND each embedded
 *  child, because an embedded Viewer's Edit tab publishes liveCard/liveSource on
 *  ITS OWN app; the same is true here. */
const liveApps = new Map();
/** The last (card, source) each app published, so a mount happens once per edit. */
const liveSigs = new Map();
/** Each mounted child app → the island surface it sits in, for the pointer
 *  environment below. */
const childIslands = new Map();
// debug handle: the mounted child apps, for `ctl.mjs eval`
globalThis.__children = () => [...liveApps.keys()].filter((a) => childIslands.has(a));

// ── the child pointer environment ───────────────────────────────────────────
//
// A child app is ATTACHED, not mounted, so `wireEnvironment` never runs for it:
// its `app.pointerX/Y`, `hovering` and `pointerDown` sit at their defaults
// forever. Every child-app interaction that reads them is then silently dead —
// the Viewer's edit-pane divider reads `app.pointerY`, so its press registered
// (a hit, routed through the shared surface tree) and the drag then computed
// against a pointerY frozen at 0.
//
// The web gets this from `wireEnvironmentEmbedded`, offsetting the event by the
// island element's rect. There is no element here, so the surface tree supplies
// the origin instead.
//
// ⚠ This MUST run before the event is routed. Doing it from the per-frame
// follow loop (the obvious place) leaves the child's pointer one event stale,
// and a press-then-drag inside a single frame reads the PRESS point for the
// whole gesture — the divider then jumped to wherever it was grabbed and
// stayed. Hooking the one entry point is what makes the ordering right.
function installChildPointerEnv() {
  const g = globalThis;
  const orig = g.__declarePointer;
  if (typeof orig !== "function" || g.__declareChildPointerEnv) return;
  g.__declareChildPointerEnv = true;
  g.__declarePointer = (type, x, y, buttons, mods) => {
    for (const [child] of liveApps) {
      const islandId = childIslands.get(child);
      if (islandId === undefined) continue;
      const [ox, oy] = surfaceOrigin(islandId);
      const px = x - ox, py = y - oy;
      if (child.pointerX !== px) child.pointerX = px;
      if (child.pointerY !== py) child.pointerY = py;
      if (type === "pointerdown" && !child.pointerDown) child.pointerDown = true;
      if (type === "pointerup" && child.pointerDown) child.pointerDown = false;
      if (!child.hovering) child.hovering = true;
    }
    orig(type, x, y, buttons, mods);
  };
}

function wireEmbeds() {
  const pend = embedsPending();
  if (pend.length === 0) return;
  for (const { id, slot } of pend) {
    const prev = wiredEmbeds.get(id);
    if (prev === slot) continue;
    wiredEmbeds.set(id, slot);
    if (!slot || !slot.startsWith("run:")) continue;
    const spec = slot.slice(4).split("|");
    const name = spec[0];
    const env = parseEnv(spec[1] || "");
    if (!name || name.startsWith("__")) continue;      // live-edit channels: not on this path yet
    log("island mount: " + name + " env=" + JSON.stringify(env) + " slot=" + slot);
    mountChild(id, name, env).catch((e) => log("island " + name + ": " + e.message));
  }
}

// ── the live-edit channel ───────────────────────────────────────────────────
//
// A `run:__`-named slot is NOT a fetchable file: it is a channel an editing
// surface publishes into. The Viewer's Edit tab sets `liveCard = "__raw__"` and
// `liveSource` to the text in its editor, and the island named `run:__raw__`
// shows that source COMPILED AND RUNNING. Without this the workbench's lower
// pane was simply empty natively, where the DOM ran a whole nested desktop.
//
// The web does this from an rAF loop in host-client.js (`watchLive`); this is the
// same contract, scoped the same way — the island must belong to the app that
// published, so two hosted viewers never cross wires.

/** Is `s` inside the subtree rooted at `root`? */
function within(s, root) {
  for (let c = s; c; c = c.parent) if (c === root) return true;
  return false;
}

/** The island surface for a live card, scoped to the publishing app. */
function liveIsland(card, scopeBox, appRoot) {
  for (const { id, slot } of embedsPending()) {
    if (!slot.startsWith("run:" + card)) continue;
    const s = surfaceById(id);
    if (!s) continue;
    // scoped: inside the publishing app's own surface tree
    if (scopeBox !== null && !within(s, scopeBox)) continue;
    if (scopeBox === null && appRoot && !within(s, appRoot)) continue;
    return id;
  }
  return -1;
}

function watchLive(app, scopeBox) {
  const card = typeof app.liveCard === "string" ? app.liveCard : "";
  if (card === "") return;                       // nothing published yet
  const body = typeof app.liveSource === "string" ? app.liveSource : "";
  const sig = card + " " + body;
  if (liveSigs.get(app) === sig) return;
  const id = liveIsland(card, scopeBox, app.surface);
  // The island may not be mounted yet — the edit pane slots its island only in
  // edit mode, and the channel can publish first. Don't burn the signature.
  if (id < 0) return;
  liveSigs.set(app, sig);
  compileLive(body).then((r) => {
    if (r && r.source) { app.liveReport = ""; mountCompiled(id, r, null); }
    else if (r && r.report != null) app.liveReport = String(r.report);
    else liveSigs.delete(app);                   // compiler not warm — retry
  }).catch(() => liveSigs.delete(app));
}

/** Compile a SOURCE STRING (not a URL) — the editing surface's channel.
 *
 *  This used to `POST /compile?main=…` to the dev server, for one real reason:
 *  `?main=` is what tells the compiler where the program lives, and without it
 *  the in-context path reported ten `unknown component` errors for a file that
 *  compiles clean. That reason is gone — `originDir` says the same thing, and
 *  `ensureLibrary`/the worker's own `setDefaultLibrary` supply the auto-include
 *  manifest a bare tag needs — so a live edit now compiles exactly where boot
 *  does, and a `.declare` opened from disk (no server, no origin at all) gets a
 *  working Edit tab for the first time.
 *
 *  NOT CACHED, and deliberately: the whole point of the buffer is that it is
 *  different from what is on disk on every keystroke, so every compile is a
 *  miss. It still runs on the compile thread, which is what keeps typing smooth
 *  in the editor above it. */
async function compileLive(src) {
  const main = globalThis.__declareMain || "";
  const distro = platformBase();
  const dir = main.replace(/[^/]*$/, "");
  try {
    // "" as the cache key: nothing to cache against, and the host skips the
    // cache entirely for an empty url.
    const out = await compileSource("", src, dir, distro);
    return out.source ? { source: out.source, deps: out.deps ?? {} }
                      : { report: out.report || "compile failed" };
  } catch (e) {
    return { report: e && e.message ? e.message : String(e) };
  }
}

function liveTick() {
  for (const [app, box] of liveApps) watchLive(app, box);
}

function parseEnv(q) {
  const env = {};
  for (const pair of q.split("&")) {
    if (!pair) continue;
    const i = pair.indexOf("=");
    const k = i < 0 ? pair : pair.slice(0, i);
    const v = i < 0 ? "true" : pair.slice(i + 1);
    env[k] = v === "true" || v === "1" ? true : v === "false" || v === "0" ? false
      : v !== "" && !isNaN(Number(v)) ? Number(v) : v;
  }
  return env;
}

async function mountChild(surfaceId, name, env) {
  const box = surfaceById(surfaceId);
  if (!box) return;
  // `program` is a name or a relative path, resolved from the host program's
  // demos/ folder — the web client's rule, kept.
  const base = globalThis.__declareBase || "";
  const url = new URL(name.endsWith(".declare") ? name : name + ".declare", new URL("demos/", base)).href;
  const { source, deps } = await resolveProgram(url);
  mountCompiled(surfaceId, { source, deps }, env, url);
  log("island: " + name + " mounted");
}

/** Put an already-compiled program into an island. Shared by the URL path and
 *  the live-edit channel, which differ only in where the source came from.
 *  `assetUrl` is the child's own program URL — the base its relative assets
 *  resolve against (host-client's childAssetBase rule); the live-edit channel
 *  has no program URL and leaves it unset. */
function mountCompiled(surfaceId, compiled, env, assetUrl) {
  const box = surfaceById(surfaceId);
  if (!box) return null;
  // One island, one tenant: evict whatever is mounted before mounting again,
  // and stamp this mount so the previous tenant's size-follow loop retires.
  const gen = (embedGen.get(surfaceId) || 0) + 1;
  embedGen.set(surfaceId, gen);
  // the previous tenant's bridge dies with it
  const priorUnlink = embedUnlinks.get(surfaceId);
  if (priorUnlink) { embedUnlinks.delete(surfaceId); try { priorUnlink(); } catch {} }
  clearEmbed(surfaceId);
  const child = build(compiled.source, { deps: compiled.deps ?? {} });
  child.attach(backend, null);
  // The child's RELATIVE assets live in its own program's directory, never the
  // host's (host-client's childAssetBase). Without this, birds-in-a-desktop-
  // window resolved every plate against the DESKTOP's directory — all 404.
  if (assetUrl) setAppAssetBase(child, assetUrl);
  mountEmbed(surfaceId, child.surface);
  child.hostWidth = box.width;
  child.hostHeight = box.height;
  // The ISLAND is a viewport — the DOM's renderChild sets `overflow: auto` on
  // the island element UNCONDITIONALLY, so any tenant taller than its box pans
  // inside the island: a size floor holding the root large, or a page app
  // whose content outruns the box (birds). The scroll RANGE flows from the
  // tenant's own model — the root's setPageExtent, which the island's
  // contentExtent honors along the tenant's declared scroll axis — and clamps
  // to zero when the tenant fits, exactly `auto`'s behavior. The old gate here
  // (only on a declared minWidth/minHeight floor) left content-tall tenants
  // unscrollable.
  if (box.setScroll) {
    box.setScroll(true, (y) => { /* island pan — no model attribute to mirror */ });
  }
  if (env && Object.keys(env).length) child.env = env;
  // The OS colour scheme, as `mountApp`'s wireColorScheme gives the root app. A
  // child is ATTACHED, not mounted, so nothing wires it — and the live-edit
  // pane's nested desktop came up LIGHT against the DOM's dark. (Distinct from
  // `env.dark`, which is a host→child message the Viewer reads.)
  child.dark = H.appearance() === "dark";
  liveApps.set(child, box);          // a child can itself publish live edits
  childIslands.set(child, surfaceId);
  // THE ISLAND BRIDGE (islands design, 2026-08-20) — the native runner is a
  // full peer of the web hosts: pair the island's `external` surface with the
  // tenant's (type handshake at link time), then facts both ways per settle
  // and post/onPost verbs. A link error leaves the tenant mounted, unbridged,
  // and said loudly — same rule as host-client's renderChild.
  const islView = islandViewById(surfaceId);
  if (islView && typeof islView.post === "function") {
    try { embedUnlinks.set(surfaceId, linkIslandTenant(islView, child)); }
    catch (e) { log("island link: " + e.message); }
  }
  // The sanctioned handle (guide 18): with no element anywhere, `__childApp`
  // rides the island VIEW — the canvas convention, kept native.
  if (islView) islView.__childApp = child;
  // Keep the tenant sized to its box (the box is a constraint target that can
  // change with the window; the child re-derives from hostWidth/Height). An
  // observer, not a rAF loop, for the same reason as startPumps: the box only
  // moves under a resize, the appearance only flips under __declareEnvChanged,
  // and both already produce the frame this rides on.
  globalThis.__declareObserveFrames(() => {
    if (embedGen.get(surfaceId) !== gen) {
      liveApps.delete(child); childIslands.delete(child);
      if (islView && islView.__childApp === child) islView.__childApp = null;
      return false;                                  // a newer tenant owns this island
    }
    if (surfaceById(surfaceId) !== box) {
      liveApps.delete(child); childIslands.delete(child);
      if (islView && islView.__childApp === child) islView.__childApp = null;
      const un = embedUnlinks.get(surfaceId);
      if (un) { embedUnlinks.delete(surfaceId); try { un(); } catch {} }   // the island surface is gone — the bridge with it
      return false;
    }
    if (child.hostWidth !== box.width || child.hostHeight !== box.height) {
      child.hostWidth = box.width; child.hostHeight = box.height;
    }
    const dark = H.appearance() === "dark";
    if (child.dark !== dark) child.dark = dark;      // keep live, as the root app is

    // Reflect the tenant's name up to the island, so a hosting window can title
    // itself by what it shows (the viewer names its window by the open file).
    publishChildName(surfaceId, typeof child.appName === "string" ? child.appName : "");
  });
  settle();
  flushOps();
  return child;
}

// ── host → JS entry points ──────────────────────────────────────────────────

globalThis.__declareBoot = (url) => macBoot(url).catch((e) => {
  // MESSAGE FIRST, then the stack. A compile failure throws with the compiler's
  // whole rendered report as its message — naming the file, line and fix — and
  // logging `e.stack` alone threw that away, leaving a bundle offset
  // ("fromClient@…declare-mac.js:18168:37") as the entire diagnosis.
  H.log("error", "boot failed: " + ((e && e.message) || e) + (e && e.stack ? "\n  at " + e.stack : ""));
  H.bootFailed(String(e && e.message || e));
});
globalThis.__declareScroll = (x, y, dy, dx) => macScroll(x, y, dy, dx || 0);
// The wheel with its CLAIM walk (gestures.md's desktop contract): the nearest
// onWheel view under the point hears the stream — `pinch` true for a trackpad
// magnify or ctrl+wheel — and only what no claim takes reaches the scrollers.
globalThis.__declareWheel = (x, y, dx, dy, pinch) => macWheel(x, y, dx || 0, dy || 0, !!pinch);
// A scrollbar DRAG addresses one specific scroller by id, rather than routing a
// delta through the geometric wheel walk.
globalThis.__declareScrollTo = (id, y, x) => {
  macScrollTo(id, y, x === undefined || x === null ? null : x);
  settle(); flushOps();
};
globalThis.__declareTraceHit = (x, y) => macTraceHit(x, y);
globalThis.__declareRichHeight = (id, h) => { macRichHeight(id, h); settle(); flushOps(); };
globalThis.__declareRichLink = (id, href) => { macRichLink(id, href); settle(); flushOps(); };
globalThis.__declareEditInput = (id, v) => { macEditInput(id, v); settle(); flushOps(); };
globalThis.__declareEditFocus = (id, f) => { macEditFocus(id, f); settle(); flushOps(); };
globalThis.__declareEditEnter = (id) => { macEditEnter(id); settle(); flushOps(); };
globalThis.__declareSettle = () => { settle(); flushOps(); };

// ── benchmarks ──────────────────────────────────────────────────────────────
// The engine bench is shared code (bench-core.js); these measure the pipeline
// that is actually ours: a settle over the live app, the op buffer it produces,
// and the JSON round trip that crosses to Swift.
globalThis.__declareBench = () => {
  const app = currentApp;
  const out = { ops: 0, settleMs: 0, serializeMs: 0, settles: 0 };
  if (!app) return JSON.stringify(out);
  const t = () => H.now();

  // A settle that genuinely re-derives: nudge the app's own size, which every
  // responsive constraint in the tree depends on.
  const w = app.hostWidth, h = app.hostHeight;
  const N = 60;
  let settleTotal = 0, opTotal = 0, serTotal = 0;
  for (let i = 0; i < N; i++) {
    app.hostWidth = w + (i % 2 ? 1 : -1);
    const a = t(); settle(); settleTotal += t() - a;
    // measure the buffer this settle produced without disturbing delivery
    const b = t(); const json = peekOps(); serTotal += t() - b;
    opTotal += countOps();
    flushOps();
  }
  app.hostWidth = w; app.hostHeight = h; settle(); flushOps();
  out.settles = N;
  out.settleMs = +(settleTotal / N).toFixed(3);
  out.serializeMs = +(serTotal / N).toFixed(3);
  out.ops = Math.round(opTotal / N);
  return JSON.stringify(out);
};
/** Reset every SINGLETON service to a fresh state — the native equivalent of
 *  loading a new page.
 *
 *  `__declareBoot` rebuilds the whole tree, so per-program state goes with it.
 *  What survives is the module-level services — Focus holds the focused view
 *  and its root, Keys holds the held-set — because the host is one long-lived
 *  process where a browser would have been a new document. That carryover is
 *  why parity.mjs relaunches by default, and why the conformance suite's first
 *  keyboard run was not reproducible: successive runs inherited whichever field
 *  the previous program had left focused.
 *
 *  Resetting is cheaper than relaunching and, unlike a relaunch, is scriptable
 *  from a test between two programs. Call it BEFORE booting the next program:
 *  `Focus.setRoot` re-establishes the root on the way back up.
 */
/** Diagnostic: counters at EVERY stage of the key path, reset per boot.
 *  Counts, not booleans — the bugs chased here are accumulations — and per
 *  stage, because "where focus landed" proved un-inferable: the same end state
 *  can mean one advance from the wrong start or two from the right one.
 *    rawKeydowns   window keydown events seen (the shim's dispatch)
 *    deliveries    Keys' onKeyDown fan-out (what deliverKeys hears)
 *    nextCalls     Focus.next() invocations (the advance itself)
 *  One Tab must read 1/1/1. Any stage reading 2 names the doubling layer. */
const diag = { rawKeydowns: 0, deliveries: 0, nextCalls: 0 };
globalThis.__declareDiag = () => ({
  ...diag,
  focused: Focus.getFocus()?.constructor?.name ?? null,
});
globalThis.__declareDiagReset = () => { diag.rawKeydowns = 0; diag.deliveries = 0; diag.nextCalls = 0; return "ok"; };
let diagWired = false;
function wireDiag() {
  if (diagWired) return;
  diagWired = true;
  window.addEventListener("keydown", () => { diag.rawKeydowns++; });
  Keys.onKeyDown(() => { diag.deliveries++; });
  const origNext = Focus.next.bind(Focus);
  Focus.next = () => { diag.nextCalls++; origNext(); };
}

globalThis.__declareReset = () => {
  Focus.reset();
  Keys.clearHeld();
  return "ok";
};

globalThis.__declareEnvChanged = () => {
  globalThis.__declareAppearanceChanged?.();
  if (currentApp) { currentApp.dark = H.appearance() === "dark"; settle(); flushOps(); }
};
