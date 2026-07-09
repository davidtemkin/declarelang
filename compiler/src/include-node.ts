// include-node — the filesystem IncludeHost / AutoIncludeHost for the CLI /
// server (Node-side).
//
// Kept in its own module ON PURPOSE: it imports node:fs / node:path, so it must
// NOT reach the zero-dependency, browser-loadable runtime graph (index.ts). The
// pure resolve phase (include.ts) takes the host as an injected parameter; only
// the Node-side front-end (compile.ts and the CLI/server) imports this. The
// browser's fetch-based host (composition.md §1/§3) is the deferred dev-env
// counterpart — a different module implementing the same seam.

import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
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
export function nodeIncludeHost(libraryRoot?: string, tracker?: Tracker): IncludeHost | AutoIncludeHost {
  const readTracked = (canonical: string): string | null => {
    try {
      const source = readFileSync(canonical, "utf8");
      tracker?.file(canonical);
      return source;
    } catch {
      tracker?.file(canonical); // records {missing:true} → later creation busts the cache
      return null;
    }
  };

  const base: IncludeHost = {
    resolve(fromDir, path) {
      const canonical = resolve(fromDir, path);
      const source = readTracked(canonical);
      return source === null ? null : { canonical, dir: dirname(canonical), source };
    },
  };
  if (libraryRoot === undefined) return base;

  const srcDir = join(libraryRoot, "src");
  const manifestPath = join(libraryRoot, "autoincludes.json");
  let manifest: Record<string, string> | null = null;
  const load = (): Record<string, string> => {
    if (manifest !== null) return manifest;
    const raw = readTracked(manifestPath);
    try {
      const parsed = raw === null ? null : JSON.parse(raw);
      manifest = parsed !== null && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
    } catch {
      manifest = {};
    }
    return manifest;
  };

  return {
    ...base,
    autoincludes: load,
    resolveLibrary(path) {
      // The canonical key is the absolute component-file path — the SAME key
      // `resolve` would produce for an explicit include of that file, so the
      // two dedup through one visited set.
      const canonical = resolve(srcDir, path);
      const source = readTracked(canonical);
      return source === null ? null : { canonical, dir: dirname(canonical), source };
    },
  };
}
