import type { IncludeHost } from "../../runtime/dist/include.js";
/** An IncludeHost backed by the local filesystem: resolves a path relative to
 *  the including file's directory (`path.resolve`), reads it, and returns null
 *  when the file is absent (any read error — missing, unreadable — reads as
 *  "cannot find"). The absolute path is the canonical include-once key. */
export declare function nodeIncludeHost(): IncludeHost;
