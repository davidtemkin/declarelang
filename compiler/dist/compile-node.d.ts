import { type CompileOptions, type Compiled } from "./compile.js";
import type { Closure } from "./closure.js";
export type { CompileOptions, Compiled } from "./compile.js";
export { extractStatic, extractFromCompiled, staticHtml, blocksHtml, seoDocument } from "./seo.js";
export type { ExtractOptions, Extracted } from "./seo.js";
export { settleHeadless, approximateMeasurer, DEFAULT_ENV } from "./headless.js";
export type { Environment, HeadlessOptions } from "./headless.js";
export { DiskTracker, diskProbe, statValidator } from "./cache-node.js";
export { isUpToDate, validatorsEqual, lookupKey, contentTag, fnv1a } from "./closure.js";
export type { Closure, ClosureEntry, Validator, Tracker, Probe } from "./closure.js";
/** `compile` with the filesystem include+auto-include host and (when `typecheck`
 *  is set) the real typechecker injected. Drop-in for the previous `compile`
 *  import. */
export declare function compile(source: string, opts?: CompileOptions): Compiled;
export interface TrackedOptions extends CompileOptions {
    /** The main source's own path (absolute) — recorded as a closure entry so an
     *  edit to the app file itself busts the cache. Omit for an unsaved buffer. */
    mainId?: string;
    /** Compiler properties that also gate cache staleness (e.g. `{ render: "dom" }`).
     *  Frozen into the closure and compared by isUpToDate. */
    props?: Record<string, string>;
}
/** `compile`, additionally returning the compile's full dependency CLOSURE
 *  (closure.ts) — the main file, every `include`, every auto-included component
 *  library, and the manifest, each with a disk validator. The caller owns it:
 *  feed it to isUpToDate()/contentTag() for a disk or HTTP cache, or to fs.watch
 *  for live reload. The disk/browser CACHE layers (get/put, 304s) build on this
 *  and land with the deploy / in-browser-compile paths that need them. */
export declare function compileTracked(source: string, opts?: TrackedOptions): Compiled & {
    closure: Closure;
};
