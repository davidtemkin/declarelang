import { type CompileOptions, type Compiled } from "./compile.js";
import type { AutoIncludeHost } from "../../runtime/dist/include.js";
export { highlight } from "./highlight.js";
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
/** `compile` with the in-memory host injected — the browser drop-in for
 *  compile-node's `compile`. Prefetched `files`/`manifest` ride in through opts
 *  (they configure the host, not the compile itself). */
export declare function compile(source: string, opts?: CompileOptions & BrowserFiles): Compiled;
/** FNV-1a 64-bit (16 hex) — the freshness tag hash, replicated from closure.ts
 *  so the browser can re-hash live source and compare to a baked artifact tag
 *  WITHOUT pulling the Node closure module. Pure, browser-safe. */
export declare function fnv1a(s: string): string;
