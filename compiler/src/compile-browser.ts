// compile-browser — the browser front-end for `compile`. Counterpart to
// compile-node.ts: where that injects the filesystem include host, this
// injects a SYNCHRONOUS in-memory include host over a map of prefetched
// sources. The compile itself — INCLUDING the tsc-over-bodies typecheck — is
// the ONE core (compile.ts imports the checker directly; no front-end wires
// it, so no front-end can forget it). The only host seam is where lib.d.ts
// texts come from: the bundle EMBEDS the es2022 closure and registers it at
// init (build-compiler.mjs → provideLib), mirroring compile-node's disk
// provider.
//
// Why in-memory: `compile.ts` is synchronous and so is the include seam
// (IncludeHost.resolve returns source-or-null, not a Promise), but a browser
// can only fetch asynchronously. So the warm-load fetches the FIXED library set
// (the auto-include manifest + its *.declare files) once, up front, and hands it
// here as `files`/`manifest`; this host then reads it synchronously. A path not
// in the map resolves to null — the same "absent file" signal the filesystem
// host gives — so a source with no `include`s (every example today) needs
// nothing prefetched at all.
//
// tools/build-compiler.mjs bundles THIS module (with `typescript`) into
// bundles/declare-compiler.js — the artifact the homepage warm-loads.

import { compile as compileCore, type CompileOptions, type Compiled } from "./compile.js";
import type { AutoIncludeHost } from "../../runtime/dist/include.js";
import type { Closure, ClosureEntry, Validator } from "./closure.js";
import { searchIncludePath } from "./include-search.js";

// Re-exported so the BUNDLE INIT (tools/build-compiler.mjs's generated entry)
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
export { crawlLocations, crawlDocument, fragmentHrefs, canonKey, type CrawlDoc, type CrawlOptions } from "./crawl.js";
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
export function compile(source: string, opts: CompileOptions & BrowserFiles = {}): Compiled {
  const { files, manifest, libraryRoot, host, ...compileOpts } = { ...effectiveLib(opts), ...stripLib(opts) };
  return compileCore(source, {
    ...compileOpts,
    host: host ?? memoryHost({ files, manifest, libraryRoot }),
  });
}

/** opts minus the library keys — so effectiveLib's choice isn't overridden by
 *  the caller's undefined placeholders. */
function stripLib(opts: CompileOptions & BrowserFiles): CompileOptions {
  const { files: _f, manifest: _m, libraryRoot: _r, ...rest } = opts;
  return rest;
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
  /** Record LIBRARY reads too. Default false — the library ships with the
   *  distro and is gated by BUILD_ID (the OL5 model: the LFC never enters an
   *  app's closure), so per-app closures stay small and library upgrades
   *  invalidate through the service worker, not per-app probing. */
  trackLibrary?: boolean;
}

/** `compile`, additionally returning the compile's dependency CLOSURE — the
 *  browser mirror of compile-node's compileTracked: the main source plus every
 *  file the include host actually served, each with an FNV-1a content-hash
 *  validator (the same validator shape boot-uniform's probes re-derive from a
 *  fetch). Feed it to closure.ts isUpToDate() to decide cached-vs-recompile —
 *  a multi-file app's `include`s now invalidate exactly like the main file. */
export function compileTracked(source: string, opts: BrowserTrackedOptions = {}): Compiled & { closure: Closure } {
  const lib = effectiveLib(opts);
  const inner = memoryHost({ files: lib.files, manifest: lib.manifest, libraryRoot: lib.libraryRoot });
  const libPrefix = (lib.libraryRoot ?? "library") + "/";
  const reads = new Map<string, ClosureEntry>();
  const record = <T extends { canonical: string; source: string } | null>(r: T): T => {
    if (r !== null && (opts.trackLibrary === true || !r.canonical.startsWith(libPrefix)) && !reads.has(r.canonical)) {
      reads.set(r.canonical, { id: r.canonical, kind: "file", v: opts.validators?.[r.canonical] ?? { hash: fnv1a(r.source) } });
    }
    return r;
  };
  const host: AutoIncludeHost = {
    resolve: (fromDir, path) => record(inner.resolve(fromDir, path)),
    autoincludes: () => inner.autoincludes(),
    resolveLibrary: (path) => record(inner.resolveLibrary(path)),
  };
  const { files: _f, manifest: _m, libraryRoot: _r, mainId, mainValidator, validators: _v, props, trackLibrary: _t, ...compileOpts } = opts;
  const result = compileCore(source, {
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
