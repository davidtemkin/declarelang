import type { Tracker, Closure, ClosureEntry, Validator } from "./closure.js";
/** The current disk validator for a path — `{mtime,size}`, or `{missing:true}`
 *  when it cannot be stat'd (absent / unreadable). mtime is ms since epoch. */
export declare function statValidator(id: string): Validator;
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
