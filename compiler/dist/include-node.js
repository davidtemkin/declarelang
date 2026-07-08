// include-node — the filesystem IncludeHost for the CLI / server (Node-side).
//
// Kept in its own module ON PURPOSE: it imports node:fs / node:path, so it must
// NOT reach the zero-dependency, browser-loadable runtime graph (index.ts). The
// pure resolve phase (include.ts) takes the host as an injected parameter; only
// the Node-side front-end (compile.ts and the CLI/server) imports this. The
// browser's fetch-based host (composition.md §1/§3) is the deferred dev-env
// counterpart — a different module implementing the same IncludeHost seam.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
/** An IncludeHost backed by the local filesystem: resolves a path relative to
 *  the including file's directory (`path.resolve`), reads it, and returns null
 *  when the file is absent (any read error — missing, unreadable — reads as
 *  "cannot find"). The absolute path is the canonical include-once key. */
export function nodeIncludeHost() {
    return {
        resolve(fromDir, path) {
            const canonical = resolve(fromDir, path);
            let source;
            try {
                source = readFileSync(canonical, "utf8");
            }
            catch {
                return null;
            }
            return { canonical, dir: dirname(canonical), source };
        },
    };
}
//# sourceMappingURL=include-node.js.map