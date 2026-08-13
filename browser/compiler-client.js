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
//   • loadLibraryOnce() — the auto-include library (manifest + every src file),
//     fetched once per page and shared by every compile.
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
      return withAppIncludes(client);
    } catch {
      /* fall through to inline */
    }
  }
  const s = perfStage("compiler-inline");
  const client = await inlineClient();
  s.end();
  return withAppIncludes(client);
}

// ── an app's OWN includes ────────────────────────────────────────────────────
// The include host reads its file map SYNCHRONOUSLY (IncludeHost.resolve
// answers source-or-null, never a promise) because the Node host reads a
// filesystem. A browser can only fetch asynchronously, so anything a program
// includes must already be in hand when the compile starts. The warm-load
// covers the LIBRARY — a fixed, known set. It cannot cover what an app
// includes of its OWN: `include [ "weather-art.declare" ]` naming a file
// beside the program. Those were never fetched, so they resolved to null and
// the compile failed with DECLARE5002 — but only on a static host, because
// the dev server compiles on the Node side where the filesystem answers.
//
// So: read the directives, fetch what they name relative to the program, and
// merge the result into the library map the host already gets. Relative
// first, mirroring the search order (the including file's own dir, then the
// library root) — a 404 is not an error here, it just means the name belongs
// to the library, which still gets its turn. A genuinely missing file is
// still DECLARE5002, reported by the compiler as before.

const INCLUDE_DIRECTIVE = /\binclude\s*\[([^\]]*)\]/g;

/** The paths one source's `include [ … ]` directives name. */
function includedPaths(src) {
  const out = [];
  for (const directive of src.matchAll(INCLUDE_DIRECTIVE))
    for (const q of directive[1].matchAll(/"([^"]+)"|'([^']+)'/g)) out.push(q[1] ?? q[2]);
  return out;
}

/** Collapse `.` / `..` so a key matches the canonical form memoryHost computes
 *  (compile-browser.ts normalizePath) — the two must agree or the map misses. */
function normalizeRel(p) {
  const out = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

/** Walk a program's include graph over HTTP, keyed exactly as the host will
 *  ask for it: relative to the program, whose originDir in the browser is "".
 *  Transitive — an included file may include more. */
async function fetchAppIncludes(source, baseHref) {
  const files = {};
  const seen = new Set();
  const walk = async (src, dir) => {
    await Promise.all(includedPaths(src).map(async (p) => {
      const key = normalizeRel(dir === "" ? p : dir + "/" + p);
      if (seen.has(key)) return;
      seen.add(key);
      let text = null;
      try {
        const res = await fetch(new URL(key, baseHref), { cache: "no-cache" });
        if (res.ok) text = await res.text();
      } catch { /* offline or blocked — the compiler reports the miss */ }
      if (text === null) return;                                   // the library root's turn
      files[key] = text;
      await walk(text, key.split("/").slice(0, -1).join("/"));
    }));
  };
  await walk(source, "");
  return files;
}

/** Wrap a client so every compile carries the app's own includes alongside the
 *  library. MERGES rather than replaces: `files` in opts makes the compiler
 *  take that map INSTEAD of the registered default library (compile-browser
 *  effectiveLib), so handing it the app's two files alone would strand every
 *  bare tag. A program with no includes takes the untouched path. */
function withAppIncludes(client) {
  const augment = async (source, opts) => {
    const base = opts?.mainId ?? (typeof location === "undefined" ? null : location.href);
    if (base === null || includedPaths(source).length === 0) return opts;
    const appFiles = await fetchAppIncludes(source, base);
    if (Object.keys(appFiles).length === 0) return opts;
    const lib = (await loadLibraryOnce()) ?? {};
    return {
      ...opts,
      files: { ...(lib.files ?? {}), ...appFiles },
      manifest: lib.manifest ?? {},
      ...(lib.libraryRoot === undefined ? {} : { libraryRoot: lib.libraryRoot }),
    };
  };
  return {
    ...client,
    compile: async (source, opts) => client.compile(source, await augment(source, opts)),
    compileTracked: async (source, opts) => client.compileTracked(source, await augment(source, opts)),
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
    compile: async (source, opts) => project(mod.compile(source, opts ?? {})),
    compileTracked: async (source, opts) => {
      const r = mod.compileTracked(source, opts ?? {});
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

// The manifest (bare tag → file) IS the library's file list — its values name
// every library file, so one fetch serves both bare tags (`Bar [ ]`) and bare
// includes (`include [ "x.declare" ]`, resolved along the search path's library
// root), mirroring the Node fs host. (A library file that is includable but not
// auto-includable would be a manifest entry, not a second index.) NOT recorded
// in app closures — the whole library is under BUILD_ID, so a bucket change
// already covers it.
async function loadLibrary() {
  try {
    const manifest = await fetch(new URL("library/autoincludes.json", DISTRO), { cache: "no-cache" }).then((r) => r.json());
    // values are filenames — skip the structured entries ($provide is a rule list)
    const names = [...new Set(Object.values(manifest).filter((v) => typeof v === "string"))];
    const files = {};
    await Promise.all(names.map(async (rel) => {
      const res = await fetch(new URL("library/" + rel, DISTRO), { cache: "no-cache" });
      if (res.ok) files["library/" + rel] = await res.text();
    }));
    return { manifest, files };
  } catch {
    return { manifest: {}, files: {} }; // no library → programs without auto-includes still compile
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
