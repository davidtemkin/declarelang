// cache-node — the disk-side Tracker/Probe for the closure model (closure.ts).
// Node-only (it stats the filesystem), so it lives out of the browser-loadable
// graph, like include-node.ts. A DiskTracker captures each read's {mtime,size}
// at record time; diskProbe re-reads the current validator for isUpToDate().
// The browser counterpart (a fetch-header Tracker/Probe) is the deferred peer.
import { statSync, readFileSync } from "node:fs";
import { fnv1a } from "./closure.js";
/** The current disk validator for a path — `{mtime,size}`, or `{missing:true}`
 *  when it cannot be stat'd (absent / unreadable). mtime is ms since epoch. */
export function statValidator(id) {
    try {
        const s = statSync(id);
        return { mtime: s.mtimeMs, size: s.size };
    }
    catch {
        return { missing: true };
    }
}
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
export function hashValidator(id) {
    try {
        const buf = readFileSync(id);
        return { hash: fnv1a(buf.toString("binary")), size: buf.length };
    }
    catch {
        return { missing: true };
    }
}
/** Re-reads the current validator for a recorded entry — the isUpToDate probe. */
export function diskProbe(entry) {
    return statValidator(entry.id);
}
/** Records every file/dir a compile touches, capturing its validator at read
 *  time (statSync). Dedups by id (first record wins — a diamond dependency is
 *  one entry). `closure(props)` freezes the recorded set with the compiler
 *  properties that also gate staleness. */
export class DiskTracker {
    seen = new Map();
    file(id) {
        if (!this.seen.has(id))
            this.seen.set(id, { id, kind: "file", v: statValidator(id) });
    }
    dir(id) {
        if (!this.seen.has(id))
            this.seen.set(id, { id, kind: "dir", v: statValidator(id) });
    }
    closure(props = {}) {
        return { entries: [...this.seen.values()], props };
    }
}
//# sourceMappingURL=cache-node.js.map