import { type CompileOptions, type Compiled } from "./compile.js";
import type { Closure } from "./closure.js";
import { type Flags } from "../../runtime/dist/parser.js";
export type { CompileOptions, Compiled } from "./compile.js";
export { extractFromProgram, staticHtml, blocksHtml, crawlerDocument } from "./static-html.js";
import { type ExtractOptions as ExtractOpts, type Extracted as ExtractResult } from "./static-html.js";
/** `extractStatic` with the library on hand, as this module's `compile` has it:
 *  a program's library classes (a TextInput, a Button) resolve. */
export declare function extractStatic(source: string, opts?: ExtractOpts): Promise<ExtractResult>;
export { crawlLocations, crawlDocument, crawlExtract, fragmentHrefs, canonKey, type CrawlDoc, type CrawlOptions } from "./crawl.js";
export { highlight, lineMetrics, programMetrics, programIndex, type LineMetrics, type ProgramMetrics, type ProgramIndex } from "./highlight.js";
export type { ExtractOptions, Extracted } from "./static-html.js";
export { settleHeadless, approximateMeasurer, DEFAULT_ENV } from "./headless.js";
export type { Environment, HeadlessOptions } from "./headless.js";
export { DiskTracker, diskProbe, statValidator, hashValidator } from "./cache-node.js";
export { isUpToDate, validatorsEqual, lookupKey, contentTag, fnv1a } from "./closure.js";
export type { Closure, ClosureEntry, Validator, Tracker, Probe } from "./closure.js";
/** The crawl's own-material data resolver over a program's origin directory (the
 *  build-time data rule, docs/system-design/location.md §9): a RELATIVE DataSource url is a file
 *  beside the app — read it from disk, parsed as JSON; absent → null (the crawl
 *  reports it loudly). Absolute urls never reach this (crawl.ts refuses them as the
 *  network). The browser twin is a same-origin fetch of the same deployed file, so
 *  the two crawls read the same bytes. */
export declare function diskDataResolver(originDir: string): (url: string) => unknown;
/** The program's own `defaultFlags [ … ]`, read from its files without compiling it —
 *  what a host needs before it decides how to serve the program. Undefined when
 *  it states none, or when its files do not parse (the compile reports that). */
export declare function programFlags(source: string, originDir: string): Promise<Flags | undefined>;
/** `compile` with the filesystem include+auto-include host and (when `typecheck`
 *  is set) the real typechecker injected. Drop-in for the previous `compile`
 *  import. */
export declare function compile(source: string, opts?: CompileOptions): Promise<Compiled>;
export interface TrackedOptions extends CompileOptions {
    /** The main source's own path (absolute) — recorded as a closure entry so an
     *  edit to the app file itself busts the cache. Omit for an unsaved buffer. */
    mainId?: string;
    /** Compiler properties that also gate cache staleness (e.g. `{ render: "dom" }`).
     *  Frozen into the closure and compared by isUpToDate. */
    props?: Record<string, string>;
}
/** `compile`, additionally returning the compile's full dependency CLOSURE
 *  (closure.ts) — the main file, every `include`, every auto-included class
 *  library, and the manifest, each with a disk validator. The caller owns it:
 *  feed it to isUpToDate()/contentTag() for a disk or HTTP cache, or to fs.watch
 *  for live reload. The disk/browser CACHE layers (get/put, 304s) build on this
 *  and land with the deploy / in-browser-compile paths that need them. */
export declare function compileTracked(source: string, opts?: TrackedOptions): Promise<Compiled & {
    closure: Closure;
}>;
