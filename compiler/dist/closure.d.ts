/** A cheap change-detection signal for one dependency. Any field the environment
 *  can supply is used; comparison is field-by-field over the fields PRESENT in
 *  the stored validator (a probe that can no longer supply a field → changed).
 *  - disk:    `{ mtime, size }`            (fs.stat)
 *  - browser: `{ etag }` or `{ lastModified, size }`  (HTTP validators)
 *  - any:     `{ hash }`                   (content hash — universal fallback)
 *  `missing: true` records that the dependency did not exist at compile time (so
 *  its later CREATION also busts the cache). */
export interface Validator {
    mtime?: number;
    size?: number;
    etag?: string;
    lastModified?: string;
    hash?: string;
    missing?: boolean;
}
export interface ClosureEntry {
    /** Environment-local identity: an absolute path on disk, a URL in the browser. */
    id: string;
    kind: "file" | "dir";
    v: Validator;
}
/** The full dependency closure of one compile + the compiler properties that
 *  also gate staleness (backend, debug, …). */
export interface Closure {
    entries: ClosureEntry[];
    props: Record<string, string>;
}
/** Collects the dependencies touched during a compile. The environment supplies
 *  an implementation that captures the validator at record time (disk: statSync;
 *  browser: from fetch response headers). The compiler core never sees it — the
 *  host it is threaded through records each read. */
export interface Tracker {
    file(id: string): void;
    dir(id: string): void;
}
/** Two validators match iff every field present in BOTH agrees, and neither
 *  flips the `missing` flag. */
export declare function validatorsEqual(stored: Validator, current: Validator): boolean;
/** A probe re-reads the CURRENT validator for a dependency (disk: statSync;
 *  browser: HEAD / conditional GET). Returns `{missing:true}` if now gone. */
export type Probe = (entry: ClosureEntry) => Validator;
/** The cached compile is fresh iff the props are unchanged and every recorded
 *  dependency's current validator still matches. */
export declare function isUpToDate(closure: Closure, currentProps: Record<string, string>, probe: Probe): boolean;
/** FNV-1a 64-bit (16 hex chars) — a small dependency-free content hash for cache
 *  keys / ETags. Not cryptographic; the validator re-check catches a stale hit. */
export declare function fnv1a(s: string): string;
/** The cache LOOKUP key — computable BEFORE compiling (the closure is only known
 *  after). `main path + sorted props + compiler version`. The manifest stored
 *  under this key carries the closure; freshness is then isUpToDate(). */
export declare function lookupKey(mainId: string, props: Record<string, string>, compilerVersion: string): string;
/** The content TAG (ETag) for a finished compile: a stable hash of the closure's
 *  identities + validators + version + props. Computed AFTER a compile and
 *  served as the HTTP ETag so conditional requests still 304. */
export declare function contentTag(mainId: string, closure: Closure, compilerVersion: string): string;
