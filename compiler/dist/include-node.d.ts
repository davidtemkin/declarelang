import type { IncludeHost, AutoIncludeHost } from "../../runtime/dist/include.js";
import type { Tracker } from "./closure.js";
/** An IncludeHost backed by the local filesystem: resolves a path relative to
 *  the including file's directory (`path.resolve`), reads it, and returns null
 *  when the file is absent. The absolute path is the canonical include-once key.
 *
 *  When `libraryRoot` is given it is ALSO an AutoIncludeHost: the manifest
 *  `<libraryRoot>/autoincludes.json` (tag → path relative to `<libraryRoot>/src`)
 *  drives bare-tag auto-inclusion, so a program can use `Bar [ … ]` with no
 *  `include` and no inline `class Bar`. Manifest read is lazy + cached; a
 *  missing / malformed manifest degrades to an empty map, never a crash.
 *
 *  When `tracker` is given, EVERY read (include, auto-included library, the
 *  manifest) — success or miss — is recorded into it (closure.ts), so the caller
 *  can capture the compile's dependency closure for caching / watch / ETags. */
export declare function nodeIncludeHost(libraryRoot?: string, tracker?: Tracker): IncludeHost | AutoIncludeHost;
