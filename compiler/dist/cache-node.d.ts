import type { Tracker, Closure, ClosureEntry, Validator } from "./closure.js";
/** The current disk validator for a path — `{mtime,size}`, or `{missing:true}`
 *  when it cannot be stat'd (absent / unreadable). mtime is ms since epoch. */
export declare function statValidator(id: string): Validator;
/** The CONTENT validator for a path — `{hash,size}`.
 *
 *  `statValidator` above is right for a live working copy: mtime+size is cheap and
 *  a compile touches many files. It is wrong for a COMMITTED artifact, for two
 *  reasons that both bit. It is not reproducible — mtimes move on every rebuild,
 *  so a BUILD.json rewritten from identical inputs differs, and any "is this
 *  current?" check on it fails forever. And it does not survive a clone: a fresh
 *  checkout gives every file a new mtime, so the gate reports stale on a tree it
 *  has never seen, which means it can never run in CI or for a new contributor.
 *
 *  Content hashing fixes both, at the cost of reading the files — acceptable for
 *  an artifact written once per build and validated once per gate. `validatorsEqual`
 *  already prefers `hash` (closure.ts), so a stored hash meets a probed hash. */
export declare function hashValidator(id: string): Validator;
/** Re-reads the current validator for a recorded entry — the isUpToDate probe. */
export declare function diskProbe(entry: ClosureEntry): Validator;
/** Records every file/dir a compile touches, capturing its validator at read
 *  time (statSync). Dedups by id (first record wins — a diamond dependency is
 *  one entry). `closure(props)` freezes the recorded set with the compiler
 *  properties that also gate staleness. */
export declare class DiskTracker implements Tracker {
    private readonly seen;
    file(id: string): void;
    dir(id: string): void;
    closure(props?: Record<string, string>): Closure;
}
