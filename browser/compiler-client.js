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
// The raw NeoError lists deliberately do NOT cross this surface: `diagnostics`
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
  return (clientPromise ??= create());
}

async function create() {
  if (typeof Worker === "function") {
    const s = perfStage("compiler-worker");                       // spawn + module import (the ~1 MB gz bundle) + ping
    try {
      const client = await workerClient();
      s.end();
      return client;
    } catch {
      /* fall through to inline */
    }
  }
  const s = perfStage("compiler-inline");
  const client = await inlineClient();
  s.end();
  return client;
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
    libraryPromise = loadLibrary().then((lib) => { s.end(); return lib; });
  }
  return libraryPromise;
}

// The manifest (bare tag → file) plus EVERY src file listed in
// library/index.json — so both bare tags (`Bar [ ]`) and bare includes
// (`include [ "x.declare" ]`, resolved along the search path's library root)
// work in-browser, mirroring the Node fs host. Falls back to the manifest's
// files if the index is absent. NOT recorded in app closures — the whole
// library is under BUILD_ID, so a bucket change already covers it.
async function loadLibrary() {
  try {
    const [manifest, index] = await Promise.all([
      fetch(new URL("library/autoincludes.json", DISTRO), { cache: "no-cache" }).then((r) => r.json()),
      fetch(new URL("library/index.json", DISTRO), { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const names = Array.isArray(index) ? index : Object.values(manifest);
    const files = {};
    await Promise.all(names.map(async (rel) => {
      const res = await fetch(new URL("library/src/" + rel, DISTRO), { cache: "no-cache" });
      if (res.ok) files["library/src/" + rel] = await res.text();
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
