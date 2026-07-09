// cache-node — the disk-side Tracker/Probe for the closure model (closure.ts).
// Node-only (it stats the filesystem), so it lives out of the browser-loadable
// graph, like include-node.ts. A DiskTracker captures each read's {mtime,size}
// at record time; diskProbe re-reads the current validator for isUpToDate().
// The browser counterpart (a fetch-header Tracker/Probe) is the deferred peer.

import { statSync } from "node:fs";
import type { Tracker, Closure, ClosureEntry, Validator } from "./closure.js";

/** The current disk validator for a path — `{mtime,size}`, or `{missing:true}`
 *  when it cannot be stat'd (absent / unreadable). mtime is ms since epoch. */
export function statValidator(id: string): Validator {
  try {
    const s = statSync(id);
    return { mtime: s.mtimeMs, size: s.size };
  } catch {
    return { missing: true };
  }
}

/** Re-reads the current validator for a recorded entry — the isUpToDate probe. */
export function diskProbe(entry: ClosureEntry): Validator {
  return statValidator(entry.id);
}

/** Records every file/dir a compile touches, capturing its validator at read
 *  time (statSync). Dedups by id (first record wins — a diamond dependency is
 *  one entry). `closure(props)` freezes the recorded set with the compiler
 *  properties that also gate staleness. */
export class DiskTracker implements Tracker {
  private readonly seen = new Map<string, ClosureEntry>();

  file(id: string): void {
    if (!this.seen.has(id)) this.seen.set(id, { id, kind: "file", v: statValidator(id) });
  }
  dir(id: string): void {
    if (!this.seen.has(id)) this.seen.set(id, { id, kind: "dir", v: statValidator(id) });
  }
  closure(props: Record<string, string> = {}): Closure {
    return { entries: [...this.seen.values()], props };
  }
}
