// compile-browser — the browser front-end for `compile`. Counterpart to
// compile-node.ts: where that injects the filesystem include host, this injects
// a FETCH host that reads each file over HTTP as the include walk reaches it.
// The compile itself — INCLUDING the tsc-over-bodies typecheck — is the ONE core
// (compile.ts imports the checker directly; no front-end wires it, so no
// front-end can forget it). The only host seam is where lib.d.ts texts come
// from: the bundle EMBEDS the es2022 closure and registers it at init
// (build-compiler.mjs → provideLib), mirroring compile-node's disk provider.
//
// TWO HOSTS LIVE HERE. `fetchHost` is the real one (see its own note below).
// `memoryHost` reads a prefetched map and stays for callers that legitimately
// have every file in hand — tests, and a compile handed an explicit `files`.
// Until the include seam went async (2026-08-13) the map was the ONLY option,
// because a browser cannot read a file synchronously; that constraint is what
// shaped the old warm-load, and it is gone.
//
// tools/internal/build-compiler.mjs bundles THIS module (with `typescript`) into
// bundles/declare-compiler.js — the artifact the homepage warm-loads.

import { compile as compileCore, type CompileOptions, type Compiled } from "./compile.js";
import type { AutoIncludeHost, Resolved } from "../../runtime/dist/include.js";
import type { Closure, ClosureEntry, Validator } from "./closure.js";
import { searchIncludePath } from "./include-search.js";

// Re-exported so the BUNDLE INIT (tools/internal/build-compiler.mjs's generated entry)
// can register the embedded lib.d.ts closure — which is what makes `typecheck`
// a real flag here, identical to Node, instead of a silent no-op.
export { provideLib } from "./typecheck.js";

// Re-exported so the browser bundle also carries the source-viewer highlighter
// (the same highlight() the dev server runs for `?view=reader` / `?segments`). It has
// no dependencies, so it adds negligible weight — browser/boot-source.js reads it here.
export { highlight } from "./highlight.js";

// Static extraction — the same block compile-node.ts exports (parity: the
// browser compiler does everything the Node one can, as architecture and as
// principle). browser/boot-extract.js composes these with compileTracked below for
// the static host's `?extract`. See static-html.ts / headless.ts.
export { extractStatic, extractFromCompiled, staticHtml, blocksHtml, crawlerDocument } from "./static-html.js";
export { crawlLocations, crawlDocument, crawlExtract, fragmentHrefs, canonKey, type CrawlDoc, type CrawlOptions } from "./crawl.js";
export type { ExtractOptions, Extracted } from "./static-html.js";
export { settleHeadless, approximateMeasurer, DEFAULT_ENV } from "./headless.js";
export type { Environment, HeadlessOptions } from "./headless.js";

/** Collapse `.` / `..` segments in a POSIX-ish path so the resolved key matches
 *  how the warm-load stores prefetched files (e.g. "library/bar.declare"). */
function normalizePath(p: string): string {
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

export interface BrowserFiles {
  /** canonicalPath → source, for `include`s and library files prefetched up front. */
  files?: Record<string, string>;
  /** tag → library path (relative to `<libraryRoot>` — the library is flat) — the auto-include manifest. */
  manifest?: Record<string, string>;
  /** Library-root prefix the resolveLibrary canonical keys carry (default "library"). */
  libraryRoot?: string;
  /** Present ⇒ resolve includes over HTTP (fetchHost) instead of demanding a
   *  prefetched map. `files` still wins for anything already in hand. */
  origins?: FetchOrigins;
  /** Injectable transport, so a test can drive the fetch host without a server
   *  (and a host with its own retry/auth policy can supply one). */
  fetchImpl?: typeof fetch;
}

/** A synchronous IncludeHost + AutoIncludeHost backed by an in-memory map. Mirrors
 *  nodeIncludeHost's canonical-key discipline (the absolute-ish path an explicit
 *  include and an auto-include of the same file both produce), so the two dedup
 *  through one visited set. */
export function memoryHost(opts: BrowserFiles = {}): AutoIncludeHost {
  const files = opts.files ?? {};
  const manifest = opts.manifest ?? {};
  const srcDir = opts.libraryRoot ?? "library"; // the library is FLAT (src/ layer removed 2026-07-16)
  const at = (canonical: string) => {
    const source = files[canonical];
    return source === undefined
      ? null
      : { canonical, dir: canonical.split("/").slice(0, -1).join("/"), source };
  };
  // Single-directory read — the search-path primitive (include-search.ts). Search
  // roots after the including file's own dir: the library src dir, mirroring the
  // Node host, so a bare `include [ "x.declare" ]` finds a shared library file.
  const resolveAt = (dir: string, path: string) => at(normalizePath(dir + "/" + path));
  const roots = [srcDir];
  return {
    resolve: (fromDir, path) => searchIncludePath(fromDir, path, roots, resolveAt),
    autoincludes: () => manifest,
    resolveLibrary: (path) => resolveAt(srcDir, path),
  };
}

// ── the FETCH host: load-during-compile ─────────────────────────────────────
// The memory host above needs every file IN HAND before the compile starts,
// which forced two workarounds that this host removes:
//
//   • the page fetched the WHOLE auto-include library up front — manifest plus
//     every source file — on the chance a compile would want some of it. A
//     program that uses two components paid for all of them, on every load.
//   • an app's OWN includes could not be known up front at all, so the client
//     REGEXED the source for `include [ … ]` and prefetched what it found — a
//     second, cruder include discovery running ahead of the real parser, blind
//     to anything it could not see as a literal quoted path.
//
// Now `resolve` may answer with a promise, so the walk simply awaits the file it
// asked for. The host fetches exactly the files the compile actually reaches,
// when it reaches them — the same thing the Node host does with the filesystem,
// through the same shared search path.
//
// CANONICAL KEYS ARE DEPLOY-RELATIVE — "apps/weather/weather-art.declare",
// "library/simplelayout.declare" — so ONE rule reads them all: resolve against
// the distro root. That is already the shape `tools/internal/prewarm.mjs` writes
// (`path.relative(ROOT, e.id)`), so the committed artifacts and a live browser
// compile finally speak one key space instead of two that only never collided
// because prewarm artifacts are loaded unconditionally and never probed.
//
// The browser used to key an app's own includes relative to the PROGRAM
// (originDir ""), which had two costs. `boot-uniform.js closureUrl()` needed a
// special case to know that "library/…" meant the distro while everything else
// meant the program's directory. And a leading `..` was SWALLOWED: with no
// segments above it to pop, `include [ "../shared/x.declare" ]` normalized to
// "shared/x.declare" and fetched from beside the program — where Node's host,
// which resolves properly, found `/apps/shared/x.declare`. The one divergence
// left in include resolution, and it closes here: with a real originDir
// ("apps/prog"), the same normalizer pops a real segment and agrees with Node.

/** Where a fetch host reads from: the distro root, which every deploy-relative
 *  canonical resolves against. (The PROGRAM's location is not needed here — it
 *  reaches the compile as `originDir`, the distro-relative directory the walk
 *  starts in, so canonicals come out deploy-relative already.) */
export interface FetchOrigins {
  /** Absolute URL of the distro root, ending in a slash. */
  distro: string;
}

/** Library sources are immutable within a BUILD_ID bucket (the whole library is
 *  gated by it — that is why library reads stay out of app closures), so one
 *  fetch per file serves the life of the page. App sources are NOT: they are
 *  what the author is editing, so they are re-read every compile exactly as the
 *  Node host re-reads them from disk.
 *
 *  SUCCESSES ONLY. A failure is not an answer worth keeping — the same rule
 *  compiler-client's loadCompiler states and for the same reason. Caching a miss
 *  here made ONE blocked or dropped request permanent for the life of the page:
 *  every later compile re-read the null, the component stayed unresolvable, and
 *  a live-edit loop kept failing with no retry and nothing to explain it. The
 *  cost of not caching a miss is re-asking for a file that is genuinely absent,
 *  which is rare and cheap; the cost of caching one is unbounded. */
const LIB_CACHE = new Map<string, string>();

/** An IncludeHost that reads over HTTP, falling back to `files` for anything
 *  already in hand (tests and callers that pass an explicit map keep working,
 *  and a prewarmed page can seed sources it already holds). */
export function fetchHost(opts: BrowserFiles & { origins: FetchOrigins }): AutoIncludeHost {
  const files = opts.files ?? {};
  const manifest = opts.manifest ?? {};
  const srcDir = opts.libraryRoot ?? "library";
  const libPrefix = srcDir + "/";
  const doFetch = opts.fetchImpl ?? fetch;

  const read = async (canonical: string): Promise<string | null> => {
    const held = files[canonical];
    if (held !== undefined) return held;
    const isLib = canonical.startsWith(libPrefix);
    const cached = isLib ? LIB_CACHE.get(canonical) : undefined;
    if (cached !== undefined) return cached;
    let text: string | null = null;
    try {
      // ONE base for every canonical — they are all deploy-relative. The library
      // prefix now decides only CACHING, not where to read from. `no-cache`
      // REVALIDATES rather than skipping the HTTP cache: a 304 is the cheap
      // answer for a file that has not changed, and the strong validator is the
      // same one the closure probe compares.
      const url = new URL(canonical, opts.origins.distro);
      const res = await doFetch(url, { cache: "no-cache" });
      if (res.ok) text = await res.text();
    } catch {
      /* offline, blocked, or genuinely absent — a MISS, reported by the compiler
         as DECLARE5002 with the path named, exactly like a missing file on disk */
    }
    if (isLib && text !== null) LIB_CACHE.set(canonical, text);
    return text;
  };

  const at = async (canonical: string): Promise<Resolved | null> => {
    const source = await read(canonical);
    return source === null
      ? null
      : { canonical, dir: canonical.split("/").slice(0, -1).join("/"), source };
  };
  const resolveAt = (dir: string, path: string) => at(normalizePath(dir + "/" + path));
  const roots = [srcDir];
  return {
    resolve: (fromDir, path) => searchIncludePath(fromDir, path, roots, resolveAt),
    autoincludes: () => manifest,
    resolveLibrary: (path) => resolveAt(srcDir, path),
  };
}

/** Drop the page-lifetime library-source cache. For tests, and for a host that
 *  learns its BUILD_ID moved under it. */
export function clearLibraryCache(): void {
  LIB_CACHE.clear();
}

// ── The default library ──────────────────────────────────────────────────────
// A host page loads the auto-include library ONCE (manifest + src files) and
// registers it here; from then on every compile — the page's own, a live-edit
// preview's, a worker's — falls back to it when no explicit files/manifest/host
// ride in. This removes the standing caller obligation ("liveCompile MUST feed
// the compiler the library or bare-tag previews render blank") that has bitten
// before: forgetting is no longer possible, because there is nothing to forget.
let DEFAULT_LIB: BrowserFiles | null = null;

/** Register the prefetched auto-include library as the default for every
 *  subsequent `compile`/`compileTracked` that names no files/manifest/host. */
export function setDefaultLibrary(lib: BrowserFiles): void {
  DEFAULT_LIB = lib;
}

/** The BrowserFiles a call should use: an explicit host or explicit
 *  files/manifest win; otherwise the registered default library. */
function effectiveLib(opts: CompileOptions & BrowserFiles): BrowserFiles {
  if (opts.files !== undefined || opts.manifest !== undefined) return opts;
  return DEFAULT_LIB ?? opts;
}

/** `compile` with the in-memory host injected — the browser drop-in for
 *  compile-node's `compile`. Prefetched `files`/`manifest` ride in through opts
 *  (they configure the host, not the compile itself); when absent, the
 *  registered default library serves. */
export async function compile(source: string, opts: CompileOptions & BrowserFiles = {}): Promise<Compiled> {
  const lib = effectiveLib(opts);
  const { files, manifest, libraryRoot, origins: _o, fetchImpl, host, ...compileOpts } = { ...lib, ...stripLib(opts) };
  return compileCore(source, {
    ...compileOpts,
    host: host ?? includeHost({ files, manifest, libraryRoot, fetchImpl, origins: mergeOrigins(lib, opts) }),
  });
}

/** opts minus the library keys — so effectiveLib's choice isn't overridden by
 *  the caller's undefined placeholders. */
function stripLib(opts: CompileOptions & BrowserFiles): CompileOptions {
  const { files: _f, manifest: _m, libraryRoot: _r, origins: _o, fetchImpl: _fi, ...rest } = opts;
  return rest;
}

/** The registered default supplies the DISTRO (one page, one distro); a later
 *  call may restate it. Merged rather than replaced so a call that names no
 *  origins at all still reaches the library the page registered. */
function mergeOrigins(lib: BrowserFiles, opts: BrowserFiles): FetchOrigins | undefined {
  const merged = { ...(lib.origins ?? {}), ...(opts.origins ?? {}) } as Partial<FetchOrigins>;
  return merged.distro === undefined ? undefined : (merged as FetchOrigins);
}

/** The host a browser compile runs on: fetch-backed when it knows where to read
 *  from, otherwise the prefetched map. ONE decision, so `compile` and
 *  `compileTracked` cannot drift into resolving includes two different ways. */
function includeHost(cfg: BrowserFiles): AutoIncludeHost {
  const { origins, ...rest } = cfg;
  return origins === undefined ? memoryHost(rest) : fetchHost({ ...rest, origins });
}

// ── Tracked compile (the closure, in the browser) ───────────────────────────

export interface BrowserTrackedOptions extends CompileOptions, BrowserFiles {
  /** The main source's own identity (its URL) — recorded as a closure entry
   *  with a content-hash validator so an edit to the app file itself busts the
   *  cache. Omit for an unsaved buffer. */
  mainId?: string;
  /** The main entry's validator, when the caller knows a STRONGER one than the
   *  content hash (an HTTP response's ETag/Last-Modified — which a later HEAD
   *  re-probe can answer without a body; a hash-only validator cannot match a
   *  headers-only probe, per validatorsEqual). Defaults to { hash }. */
  mainValidator?: Validator;
  /** Per-canonical-path validator overrides for files the host serves — same
   *  rationale as mainValidator, for a future fetch-backed multi-file host
   *  whose prefetch knows each response's strong validators. */
  validators?: Record<string, Validator>;
  /** Compiler properties that also gate cache staleness (e.g. `{ backend:
   *  "dom" }`). Frozen into the closure and compared by isUpToDate. */
  props?: Record<string, string>;
  /** Whether to record auto-included LIBRARY components in the closure. Default
   *  true: a component's SOURCE is a compile-time dependency — its text shapes the
   *  compiled output exactly like an `include`d file — so it belongs in the closure
   *  and is modification-checked by the same isUpToDate + probe as every other read
   *  (the referenced set only, after auto-include resolution — never the whole
   *  library). This is what keeps a component edit fresh on BOTH hosts without a
   *  build step: the polymorphic probe (disk / fetch) catches it uniformly. Only the
   *  RUNTIME/compiler BUNDLE stays out of the closure, gated by BUILD_ID — it is a
   *  load-time artifact, not a compiled-in source dep. Pass false for a lightweight
   *  buffer compile that wants no library entries. */
  trackLibrary?: boolean;
}

/** `compile`, additionally returning the compile's dependency CLOSURE — the
 *  browser mirror of compile-node's compileTracked: the main source plus every
 *  file the include host actually served, each with an FNV-1a content-hash
 *  validator (the same validator shape boot-uniform's probes re-derive from a
 *  fetch). Feed it to closure.ts isUpToDate() to decide cached-vs-recompile —
 *  a multi-file app's `include`s now invalidate exactly like the main file. */
export async function compileTracked(source: string, opts: BrowserTrackedOptions = {}): Promise<Compiled & { closure: Closure }> {
  const lib = effectiveLib(opts);
  const inner = includeHost({
    files: lib.files, manifest: lib.manifest, libraryRoot: lib.libraryRoot,
    fetchImpl: opts.fetchImpl ?? lib.fetchImpl,
    origins: mergeOrigins(lib, opts),
  });
  const libPrefix = (lib.libraryRoot ?? "library") + "/";
  const reads = new Map<string, ClosureEntry>();
  const record = <T extends { canonical: string; source: string } | null>(r: T): T => {
    if (r !== null && !reads.has(r.canonical) && (opts.trackLibrary !== false || !r.canonical.startsWith(libPrefix))) {
      reads.set(r.canonical, { id: r.canonical, kind: "file", v: opts.validators?.[r.canonical] ?? { hash: fnv1a(r.source) } });
    }
    return r;
  };
  // `record` observes each read for the closure. It takes whatever the inner host
  // returns — a value from the memory host, a promise from a fetch host — and
  // records after it settles, so the closure is captured identically on both and
  // in the walk's own sequential order.
  const recordAsync = async (r: Resolved | null | Promise<Resolved | null>) => record(await r);
  const host: AutoIncludeHost = {
    resolve: (fromDir, path) => recordAsync(inner.resolve(fromDir, path)),
    autoincludes: () => inner.autoincludes(),
    resolveLibrary: (path) => recordAsync(inner.resolveLibrary(path)),
  };
  const { files: _f, manifest: _m, libraryRoot: _r, origins: _o, fetchImpl: _fi, mainId, mainValidator, validators: _v, props, trackLibrary: _t, ...compileOpts } = opts;
  const result = await compileCore(source, {
    ...compileOpts,
    host: opts.host ?? host,
  });
  const entries: ClosureEntry[] = [];
  if (mainId !== undefined) entries.push({ id: mainId, kind: "file", v: mainValidator ?? { hash: fnv1a(source) } });
  entries.push(...reads.values());
  return { ...result, closure: { entries, props: props ?? {} } };
}

/** FNV-1a 64-bit (16 hex) — the freshness tag hash, replicated from closure.ts
 *  so the browser can re-hash live source and compare to a baked artifact tag
 *  WITHOUT pulling the Node closure module. Pure, browser-safe. */
export function fnv1a(s: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n, mask = 0xffffffffffffffffn;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ BigInt(s.charCodeAt(i))) & mask;
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, "0");
}
