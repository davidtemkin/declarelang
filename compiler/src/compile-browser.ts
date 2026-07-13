// compile-browser — the browser front-end for `compile`. Counterpart to
// compile-node.ts: where that injects the filesystem include host and the tsc
// typechecker, this injects a SYNCHRONOUS in-memory include host over a map of
// prefetched sources — and NO typecheck (parity with the dev server's
// POST /compile, which compiles with `{}`), so the heavy tsc program/checker
// never loads. Only the expression parser `free-idents` needs is pulled from
// `typescript`, which the bundle includes.
//
// Why in-memory: `compile.ts` is synchronous and so is the include seam
// (IncludeHost.resolve returns source-or-null, not a Promise), but a browser
// can only fetch asynchronously. So the warm-load fetches the FIXED library set
// (the auto-include manifest + its `src/*.declare`) once, up front, and hands it
// here as `files`/`manifest`; this host then reads it synchronously. A path not
// in the map resolves to null — the same "absent file" signal the filesystem
// host gives — so a source with no `include`s (every example today) needs
// nothing prefetched at all.
//
// tools/build-compiler.mjs bundles THIS module (with `typescript`) into
// dist-browser/declare-compiler.js — the artifact the homepage warm-loads.

import { compile as compileCore, type CompileOptions, type Compiled } from "./compile.js";
import type { AutoIncludeHost } from "../../runtime/dist/include.js";
import { searchIncludePath } from "./include-search.js";

/** Collapse `.` / `..` segments in a POSIX-ish path so the resolved key matches
 *  how the warm-load stores prefetched files (e.g. "library/src/bar.declare"). */
function normalizePath(p: string): string {
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

export interface BrowserFiles {
  /** canonicalPath → source, for `include`s and library files prefetched up front. */
  files?: Record<string, string>;
  /** tag → library src path (relative to `<libraryRoot>/src`) — the auto-include manifest. */
  manifest?: Record<string, string>;
  /** Library-root prefix the resolveLibrary canonical keys carry (default "library"). */
  libraryRoot?: string;
}

/** A synchronous IncludeHost + AutoIncludeHost backed by an in-memory map. Mirrors
 *  nodeIncludeHost's canonical-key discipline (the absolute-ish path an explicit
 *  include and an auto-include of the same file both produce), so the two dedup
 *  through one visited set. */
export function memoryHost(opts: BrowserFiles = {}): AutoIncludeHost {
  const files = opts.files ?? {};
  const manifest = opts.manifest ?? {};
  const srcDir = (opts.libraryRoot ?? "library") + "/src";
  const at = (canonical: string) => {
    const source = files[canonical];
    return source === undefined
      ? null
      : { canonical, dir: canonical.split("/").slice(0, -1).join("/"), source };
  };
  // Single-directory read — the search-path primitive (include-search.ts). Search
  // roots after the including file's own dir: the library src dir, mirroring the
  // Node host, so a bare `include [ "x.declare" ]` finds a shared library file.
  const resolveAt = (dir: string, path: string) => at(normalizePath(dir + "/" + path));
  const roots = [srcDir];
  return {
    resolve: (fromDir, path) => searchIncludePath(fromDir, path, roots, resolveAt),
    autoincludes: () => manifest,
    resolveLibrary: (path) => resolveAt(srcDir, path),
  };
}

/** `compile` with the in-memory host injected — the browser drop-in for
 *  compile-node's `compile`. Prefetched `files`/`manifest` ride in through opts
 *  (they configure the host, not the compile itself). */
export function compile(source: string, opts: CompileOptions & BrowserFiles = {}): Compiled {
  const { files, manifest, libraryRoot, host, ...compileOpts } = opts;
  return compileCore(source, {
    ...compileOpts,
    host: host ?? memoryHost({ files, manifest, libraryRoot }),
  });
}

/** FNV-1a 64-bit (16 hex) — the freshness tag hash, replicated from closure.ts
 *  so the browser can re-hash live source and compare to a baked artifact tag
 *  WITHOUT pulling the Node closure module. Pure, browser-safe. */
export function fnv1a(s: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n, mask = 0xffffffffffffffffn;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ BigInt(s.charCodeAt(i))) & mask;
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, "0");
}
