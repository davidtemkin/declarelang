// browser/compiler-client.js — THE in-browser compiler client, shared by every boot
// path (uniform, static, browse-to-run, source viewer). One module owns what
// each boot used to hand-roll:
//
//   • loadCompiler() — the compiler behind ONE async surface. Prefers a module
//     Worker (browser/compile-worker.js — keystroke compiles never block the main
//     thread; the ~100 ms typecheck rung becomes viable in-page); falls back to
//     an inline import of the same bundle when module workers are unavailable
//     or the worker fails to boot. Either transport returns the identical
//     PROJECTED result — { source, deps, diagnostics, report [, closure] } —
//     so a caller cannot tell (or care) where the compile ran.
//   • loadLibraryOnce() — the auto-include MANIFEST (tag → file), fetched once
//     per page. The sources themselves are read by the compiler's fetch host,
//     during the compile that reaches them.
//   • ensureLibrary(client) — loads the library and registers it as the
//     compiler's DEFAULT (setDefaultLibrary), on whichever transport is live.
//     After this, `client.compile(src)` just works — bare tags (`Bar [ ]`)
//     resolve with no per-call ceremony.
//
// The raw DeclareError lists deliberately do NOT cross this surface: `diagnostics`
// is the public structured view (each entry carrying its `rendered` form) and
// `report` the whole compile rendered — the same dual-form contract the Node
// API, the dev server's POST /compile, and the CLI all speak.

const DISTRO = new URL("..", import.meta.url); // browser/ → the distro root

// Stage instrumentation — the same `declare:<stage>` measures boot-uniform
// writes, so the client's internals (worker spawn + bundle import; library
// prefetch) land on the one performance-timeline waterfall.
const perfStage = (name) => {
  const startMark = `declare:${name}:start`;
  try { performance.mark(startMark); } catch { /* no timeline (non-window host) */ }
  return { end() { try { performance.measure(`declare:${name}`, startMark); } catch {} } };
};

// ── the compiler, worker-first ───────────────────────────────────────────────

let clientPromise = null;
export function loadCompiler() {
  // A FAILURE MUST NOT BE MEMOIZED. `??=` retained a rejected promise, so one bad
  // moment — offline, a CDN blip during the boot-time warm-load — would poison every
  // later call for the life of the page: liveCompile catches the rejection, returns
  // null ("compiler not warm — no change"), and the editor stops recompiling with no
  // error shown and no retry. Drop the memo on failure so the next call tries again.
  //
  // NOT a repair for an observed fault: the scenario is reasoned, not reproduced. An
  // attempt to force it in a browser (2026-08-13) failed to prove anything, because
  // CDP request-blocking applies to the page target and a module worker fetches from
  // its own — the compiler loaded anyway and the test measured nothing. `?warm=0`
  // (boot-uniform) is the switch that could actually stage it.
  return (clientPromise ??= create().catch((e) => { clientPromise = null; throw e; }));
}

async function create() {
  if (typeof Worker === "function") {
    const s = perfStage("compiler-worker");                       // spawn + module import (the ~1 MB gz bundle) + ping
    try {
      const client = await workerClient();
      s.end();
      return withOrigins(client);
    } catch {
      /* fall through to inline */
    }
  }
  const s = perfStage("compiler-inline");
  const client = await inlineClient();
  s.end();
  return withOrigins(client);
}

// ── where a compile reads from ───────────────────────────────────────────────
// Every compile is told the distro root it reads against and the deploy-relative
// directory it starts in, and the compiler's fetch host reads what the walk
// actually reaches. Nothing is prefetched on the chance it might be wanted.
//
// This replaces two things that were here until 2026-08-13, both of them
// consequences of a synchronous include seam that could not fetch:
//
//   • `withAppIncludes` — a REGEX over the source (`/\binclude\s*\[([^\]]*)\]/`)
//     that discovered includes ahead of the real parser and prefetched them. A
//     second implementation of include resolution, necessarily cruder than the
//     one it was feeding: it saw only literal quoted paths, and any disagreement
//     with the parser was a file the compiler then could not find.
//   • the eager library preload — the manifest AND all ~28 source files, on
//     every page, before knowing whether a compile would happen at all.
//
// The manifest still loads up front: it is one small JSON, and the auto-include
// pass needs the tag→file table in hand to know WHICH components a program
// refers to. Its VALUES are now fetched only when a program actually names them.

/** The program's own DEPLOY-RELATIVE directory — the dir the include walk starts
 *  in, which is what makes every canonical it produces deploy-relative too
 *  ("apps/weather/weather-art.declare"), matching the ids prewarm writes and the
 *  one rule `boot-uniform.js closureUrl()` resolves them with.
 *
 *  `mainId` is the program's URL when the caller knows it; an unsaved buffer has
 *  none and falls back to the page, the same base its relative paths mean. A
 *  program somehow outside the distro yields "" — it can only reach the library,
 *  which is the honest answer for something the distro cannot address. */
function originDirFor(opts) {
  const program = opts?.mainId ?? (typeof location === "undefined" ? null : location.href);
  if (program === null) return null;
  const dir = new URL(".", program).href;
  return dir.startsWith(DISTRO.href) ? dir.slice(DISTRO.href.length).replace(/\/$/, "") : "";
}

/** Wrap a client so every compile carries where it reads from: the distro root,
 *  and its own directory within it. A caller that passes an explicit `files` map
 *  still wins for anything in it — the host consults what it was handed before
 *  it reaches for the network. An explicit `originDir` is left alone. */
function withOrigins(client) {
  const augment = (opts) => {
    const originDir = originDirFor(opts);
    if (originDir === null) return opts;
    return { originDir, ...opts, origins: { distro: DISTRO.href, ...(opts?.origins ?? {}) } };
  };
  return {
    ...client,
    compile: (source, opts) => client.compile(source, augment(opts)),
    compileTracked: (source, opts) => client.compileTracked(source, augment(opts)),
  };
}

function workerClient() {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL("compile-worker.js", import.meta.url), { type: "module" });
    } catch (e) {
      return reject(e);
    }
    let n = 0;
    const pending = new Map();
    worker.onmessage = (e) => {
      const { id, result, error } = e.data ?? {};
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      error !== undefined ? p.reject(new Error(error)) : p.resolve(result);
    };
    // A module worker whose import fails (older browser, blocked fetch) surfaces
    // here — reject so create() falls back to the inline transport.
    worker.onerror = (e) => {
      reject(e.error ?? new Error(e.message || "compile worker failed"));
      for (const p of pending.values()) p.reject(new Error("compile worker failed"));
      pending.clear();
    };
    const call = (type, payload) =>
      new Promise((res, rej) => {
        const id = ++n;
        pending.set(id, { resolve: res, reject: rej });
        worker.postMessage({ type, id, ...payload });
      });
    const client = {
      transport: "worker",
      compile: (source, opts) => call("compile", { source, opts }),
      compileTracked: (source, opts) => call("compileTracked", { source, opts }),
      highlight: (src) => call("highlight", { src }),
      setDefaultLibrary: (lib) => worker.postMessage({ type: "library", lib }),
    };
    // Readiness probe: the first round-trip proves the bundle imported and the
    // protocol answers; only then does the client win over the inline fallback.
    call("ping", {}).then(() => resolve(client), reject);
  });
}

async function inlineClient() {
  const mod = await import("../bundles/declare-compiler.js");
  const project = (r) => ({ source: r.source, deps: r.deps, diagnostics: r.diagnostics, report: r.report });
  return {
    transport: "inline",
    compile: async (source, opts) => project(await mod.compile(source, opts ?? {})),
    compileTracked: async (source, opts) => {
      const r = await mod.compileTracked(source, opts ?? {});
      return { ...project(r), closure: r.closure };
    },
    highlight: async (src) => mod.highlight(src),
    setDefaultLibrary: (lib) => mod.setDefaultLibrary(lib),
  };
}

// ── the auto-include library, once per page ──────────────────────────────────

let libraryPromise = null;
export function loadLibraryOnce() {
  if (libraryPromise === null) {
    const s = perfStage("library");
    // Same rule as loadCompiler: a failed fetch is not an answer worth keeping.
    libraryPromise = loadLibrary().then((lib) => { s.end(); return lib; })
      .catch((e) => { libraryPromise = null; throw e; });
  }
  return libraryPromise;
}

// The manifest (bare tag → file) is the tag→file TABLE the auto-include pass
// reads to decide which components a program refers to, so it must be in hand
// before a compile starts: one small JSON, fetched once per page.
//
// Its VALUES are no longer fetched here. Until 2026-08-13 this downloaded every
// library source too — the sync include seam left no other option, so a page
// that compiled nothing still paid for the whole library, and a program using
// two components paid for all of them. The fetch host reads the referenced ones
// during the walk instead, and caches them for the life of the page (they are
// immutable within a BUILD_ID bucket, which is also why library reads stay out
// of app closures).
async function loadLibrary() {
  try {
    const manifest = await fetch(new URL("library/autoincludes.json", DISTRO), { cache: "no-cache" }).then((r) => r.json());
    return { manifest, origins: { distro: DISTRO.href } };
  } catch {
    return { manifest: {} }; // no library → programs without auto-includes still compile
  }
}

/** Load the library once and register it as the compiler's default — after
 *  this, `client.compile(src)` resolves bare tags with no per-call ceremony.
 *  Idempotent; returns the client for chaining. */
export async function ensureLibrary(client) {
  const lib = await loadLibraryOnce();
  client.setDefaultLibrary(lib);
  return client;
}
