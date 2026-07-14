import { type CompileOptions, type Compiled } from "./compile.js";
import type { AutoIncludeHost } from "../../runtime/dist/include.js";
import type { Closure, Validator } from "./closure.js";
export { provideLib } from "./typecheck.js";
export { highlight } from "./highlight.js";
export { extractStatic, extractFromCompiled, staticHtml, blocksHtml, seoDocument } from "./seo.js";
export type { ExtractOptions, Extracted } from "./seo.js";
export { settleHeadless, approximateMeasurer, DEFAULT_ENV } from "./headless.js";
export type { Environment, HeadlessOptions } from "./headless.js";
export interface BrowserFiles {
    /** canonicalPath → source, for `include`s and library files prefetched up front. */
    files?: Record<string, string>;
    /** tag → library src path (relative to `<libraryRoot>/src`) — the auto-include manifest. */
    manifest?: Record<string, string>;
    /** Library-root prefix the resolveLibrary canonical keys carry (default "library"). */
    libraryRoot?: string;
}
/** A synchronous IncludeHost + AutoIncludeHost backed by an in-memory map. Mirrors
 *  nodeIncludeHost's canonical-key discipline (the absolute-ish path an explicit
 *  include and an auto-include of the same file both produce), so the two dedup
 *  through one visited set. */
export declare function memoryHost(opts?: BrowserFiles): AutoIncludeHost;
/** Register the prefetched auto-include library as the default for every
 *  subsequent `compile`/`compileTracked` that names no files/manifest/host. */
export declare function setDefaultLibrary(lib: BrowserFiles): void;
/** `compile` with the in-memory host injected — the browser drop-in for
 *  compile-node's `compile`. Prefetched `files`/`manifest` ride in through opts
 *  (they configure the host, not the compile itself); when absent, the
 *  registered default library serves. */
export declare function compile(source: string, opts?: CompileOptions & BrowserFiles): Compiled;
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
export declare function compileTracked(source: string, opts?: BrowserTrackedOptions): Compiled & {
    closure: Closure;
};
/** FNV-1a 64-bit (16 hex) — the freshness tag hash, replicated from closure.ts
 *  so the browser can re-hash live source and compare to a baked artifact tag
 *  WITHOUT pulling the Node closure module. Pure, browser-safe. */
export declare function fnv1a(s: string): string;
