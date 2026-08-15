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
import { compile as compileCore } from "./compile.js";
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
export { crawlLocations, crawlDocument, crawlExtract, fragmentHrefs, canonKey } from "./crawl.js";
export { settleHeadless, approximateMeasurer, DEFAULT_ENV } from "./headless.js";
/** Collapse `.` / `..` segments in a POSIX-ish path so the resolved key matches
 *  how the warm-load stores prefetched files (e.g. "library/bar.declare"). */
function normalizePath(p) {
    const out = [];
    for (const seg of p.split("/")) {
        if (seg === "" || seg === ".")
            continue;
        if (seg === "..")
            out.pop();
        else
            out.push(seg);
    }
    return out.join("/");
}
/** A synchronous IncludeHost + AutoIncludeHost backed by an in-memory map. Mirrors
 *  nodeIncludeHost's canonical-key discipline (the absolute-ish path an explicit
 *  include and an auto-include of the same file both produce), so the two dedup
 *  through one visited set. */
export function memoryHost(opts = {}) {
    const files = opts.files ?? {};
    const manifest = opts.manifest ?? {};
    const srcDir = opts.libraryRoot ?? "library"; // the library is FLAT (src/ layer removed 2026-07-16)
    const at = (canonical) => {
        const source = files[canonical];
        return source === undefined
            ? null
            : { canonical, dir: canonical.split("/").slice(0, -1).join("/"), source };
    };
    // Single-directory read — the search-path primitive (include-search.ts). Search
    // roots after the including file's own dir: the library src dir, mirroring the
    // Node host, so a bare `include [ "x.declare" ]` finds a shared library file.
    const resolveAt = (dir, path) => at(normalizePath(dir + "/" + path));
    const roots = [srcDir];
    return {
        resolve: (fromDir, path) => searchIncludePath(fromDir, path, roots, resolveAt),
        autoincludes: () => manifest,
        resolveLibrary: (path) => resolveAt(srcDir, path),
    };
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
const LIB_CACHE = new Map();
/** An IncludeHost that reads over HTTP, falling back to `files` for anything
 *  already in hand (tests and callers that pass an explicit map keep working,
 *  and a prewarmed page can seed sources it already holds). */
export function fetchHost(opts) {
    const files = opts.files ?? {};
    const manifest = opts.manifest ?? {};
    const srcDir = opts.libraryRoot ?? "library";
    const libPrefix = srcDir + "/";
    const doFetch = opts.fetchImpl ?? fetch;
    const read = async (canonical) => {
        const held = files[canonical];
        if (held !== undefined)
            return held;
        const isLib = canonical.startsWith(libPrefix);
        const cached = isLib ? LIB_CACHE.get(canonical) : undefined;
        if (cached !== undefined)
            return cached;
        let text = null;
        try {
            // ONE base for every canonical — they are all deploy-relative. The library
            // prefix now decides only CACHING, not where to read from. `no-cache`
            // REVALIDATES rather than skipping the HTTP cache: a 304 is the cheap
            // answer for a file that has not changed, and the strong validator is the
            // same one the closure probe compares.
            // an absolute canonical is already the address; a relative one is
            // deploy-relative and reads against the distro
            const url = new URL(canonical, opts.origins.distro);
            const res = await doFetch(url, { cache: "no-cache" });
            if (res.ok)
                text = await res.text();
        }
        catch {
            /* offline, blocked, or genuinely absent — a MISS, reported by the compiler
               as DECLARE5002 with the path named, exactly like a missing file on disk */
        }
        if (isLib && text !== null)
            LIB_CACHE.set(canonical, text);
        return text;
    };
    const at = async (canonical) => {
        const source = await read(canonical);
        return source === null
            ? null
            : { canonical, dir: canonical.split("/").slice(0, -1).join("/"), source };
    };
    // A canonical is normally DEPLOY-RELATIVE ("apps/weather/art.declare") and read
    // against the distro. But a program can live OUTSIDE any distro — a `.declare`
    // opened from disk by the native host, whose own includes sit beside it while
    // its LIBRARY still comes from the distro. No single base spells both, so an
    // ABSOLUTE `originDir` (one carrying a scheme) yields absolute canonicals:
    // `new URL(abs, anything)` is `abs`, so both kinds share one key space and
    // `read` needs no branch. The library root stays relative either way, which is
    // what keeps it pointing at the distro rather than at the document's directory.
    //
    // normalizePath must NOT see an absolute dir: it drops empty segments, so
    // "file:///Users/x/" collapses to "file:/Users/x" — which Node's URL parser
    // quietly repairs and JavaScriptCore's does not, so the mistake reads as
    // "cannot find include" on the native host alone.
    const absolute = (d) => /^[a-z][a-z0-9+.-]*:/i.test(d);
    const resolveAt = (dir, path) => at(absolute(dir) ? new URL(path, dir.endsWith("/") ? dir : dir + "/").href
        : normalizePath(dir + "/" + path));
    const roots = [srcDir];
    return {
        resolve: (fromDir, path) => searchIncludePath(fromDir, path, roots, resolveAt),
        autoincludes: () => manifest,
        resolveLibrary: (path) => resolveAt(srcDir, path),
    };
}
/** Drop the page-lifetime library-source cache. For tests, and for a host that
 *  learns its BUILD_ID moved under it. */
export function clearLibraryCache() {
    LIB_CACHE.clear();
}
// ── The default library ──────────────────────────────────────────────────────
// A host page loads the auto-include library ONCE (manifest + src files) and
// registers it here; from then on every compile — the page's own, a live-edit
// preview's, a worker's — falls back to it when no explicit files/manifest/host
// ride in. This removes the standing caller obligation ("liveCompile MUST feed
// the compiler the library or bare-tag previews render blank") that has bitten
// before: forgetting is no longer possible, because there is nothing to forget.
let DEFAULT_LIB = null;
/** Register the prefetched auto-include library as the default for every
 *  subsequent `compile`/`compileTracked` that names no files/manifest/host. */
export function setDefaultLibrary(lib) {
    DEFAULT_LIB = lib;
}
/** The BrowserFiles a call should use: an explicit host or explicit
 *  files/manifest win; otherwise the registered default library. */
function effectiveLib(opts) {
    if (opts.files !== undefined || opts.manifest !== undefined)
        return opts;
    return DEFAULT_LIB ?? opts;
}
/** `compile` with the in-memory host injected — the browser drop-in for
 *  compile-node's `compile`. Prefetched `files`/`manifest` ride in through opts
 *  (they configure the host, not the compile itself); when absent, the
 *  registered default library serves. */
export async function compile(source, opts = {}) {
    const lib = effectiveLib(opts);
    const { files, manifest, libraryRoot, origins: _o, fetchImpl, host, ...compileOpts } = { ...lib, ...stripLib(opts) };
    return compileCore(source, {
        ...compileOpts,
        host: host ?? includeHost({ files, manifest, libraryRoot, fetchImpl, origins: mergeOrigins(lib, opts) }),
    });
}
/** opts minus the library keys — so effectiveLib's choice isn't overridden by
 *  the caller's undefined placeholders. */
function stripLib(opts) {
    const { files: _f, manifest: _m, libraryRoot: _r, origins: _o, fetchImpl: _fi, ...rest } = opts;
    return rest;
}
/** The registered default supplies the DISTRO (one page, one distro); a later
 *  call may restate it. Merged rather than replaced so a call that names no
 *  origins at all still reaches the library the page registered. */
function mergeOrigins(lib, opts) {
    const merged = { ...(lib.origins ?? {}), ...(opts.origins ?? {}) };
    return merged.distro === undefined ? undefined : merged;
}
/** The host a browser compile runs on: fetch-backed when it knows where to read
 *  from, otherwise the prefetched map. ONE decision, so `compile` and
 *  `compileTracked` cannot drift into resolving includes two different ways. */
function includeHost(cfg) {
    const { origins, ...rest } = cfg;
    return origins === undefined ? memoryHost(rest) : fetchHost({ ...rest, origins });
}
/** `compile`, additionally returning the compile's dependency CLOSURE — the
 *  browser mirror of compile-node's compileTracked: the main source plus every
 *  file the include host actually served, each with an FNV-1a content-hash
 *  validator (the same validator shape boot-uniform's probes re-derive from a
 *  fetch). Feed it to closure.ts isUpToDate() to decide cached-vs-recompile —
 *  a multi-file app's `include`s now invalidate exactly like the main file. */
export async function compileTracked(source, opts = {}) {
    const lib = effectiveLib(opts);
    const inner = includeHost({
        files: lib.files, manifest: lib.manifest, libraryRoot: lib.libraryRoot,
        fetchImpl: opts.fetchImpl ?? lib.fetchImpl,
        origins: mergeOrigins(lib, opts),
    });
    const libPrefix = (lib.libraryRoot ?? "library") + "/";
    const reads = new Map();
    const record = (r) => {
        if (r !== null && !reads.has(r.canonical) && (opts.trackLibrary !== false || !r.canonical.startsWith(libPrefix))) {
            reads.set(r.canonical, { id: r.canonical, kind: "file", v: opts.validators?.[r.canonical] ?? { hash: fnv1a(r.source) } });
        }
        return r;
    };
    // `record` observes each read for the closure. It takes whatever the inner host
    // returns — a value from the memory host, a promise from a fetch host — and
    // records after it settles, so the closure is captured identically on both and
    // in the walk's own sequential order.
    const recordAsync = async (r) => record(await r);
    const host = {
        resolve: (fromDir, path) => recordAsync(inner.resolve(fromDir, path)),
        autoincludes: () => inner.autoincludes(),
        resolveLibrary: (path) => recordAsync(inner.resolveLibrary(path)),
    };
    const { files: _f, manifest: _m, libraryRoot: _r, origins: _o, fetchImpl: _fi, mainId, mainValidator, validators: _v, props, trackLibrary: _t, ...compileOpts } = opts;
    const result = await compileCore(source, {
        ...compileOpts,
        host: opts.host ?? host,
    });
    const entries = [];
    if (mainId !== undefined)
        entries.push({ id: mainId, kind: "file", v: mainValidator ?? { hash: fnv1a(source) } });
    entries.push(...reads.values());
    return { ...result, closure: { entries, props: props ?? {} } };
}
/** FNV-1a 64-bit (16 hex) — the freshness tag hash, replicated from closure.ts
 *  so the browser can re-hash live source and compare to a baked artifact tag
 *  WITHOUT pulling the Node closure module. Pure, browser-safe. */
export function fnv1a(s) {
    let h = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n, mask = 0xffffffffffffffffn;
    for (let i = 0; i < s.length; i++) {
        h = (h ^ BigInt(s.charCodeAt(i))) & mask;
        h = (h * prime) & mask;
    }
    return h.toString(16).padStart(16, "0");
}
//# sourceMappingURL=compile-browser.js.map