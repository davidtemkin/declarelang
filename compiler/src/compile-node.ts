// compile-node — the Node front-end for `compile`. It wires the Node-specific
// pieces that `compile.ts` deliberately does NOT import (so that module stays
// browser-loadable for in-browser compilation): the filesystem include host
// (also the bare-tag auto-include host), the tsc-over-bodies typechecker, and
// the DISK lib.d.ts provider the checker reads its standard library through
// (the browser front-end registers an EMBEDDED provider instead — same
// checker, different host seam). Node callers — the dev server, the CLI,
// tests — import `compile` from HERE; the browser imports compile-browser.

import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { compile as compileCore, type CompileOptions, type Compiled } from "./compile.js";
import { nodeIncludeHost } from "./include-node.js";
import { provideLib } from "./typecheck.js";
import { DiskTracker } from "./cache-node.js";
import type { Closure } from "./closure.js";

// The real lib.*.d.ts sit beside typescript.js — register the disk reader as
// the checker's standard-library source (consulted lazily, only when a
// typecheck actually runs).
const LIB_DIR = dirname(createRequire(import.meta.url).resolve("typescript"));
provideLib((name) => {
  try {
    return readFileSync(join(LIB_DIR, name), "utf8");
  } catch {
    return undefined;
  }
});

export type { CompileOptions, Compiled } from "./compile.js";
// Static extraction (docs/system-design/capabilities.md §4–5) — exported by BOTH entry
// points (compile-browser.ts carries the same block): the browser compiler
// does everything the Node one can, as architecture and as principle.
export { extractStatic, extractFromCompiled, staticHtml, blocksHtml, crawlerDocument } from "./static-html.js";
export { crawlLocations, crawlDocument, fragmentHrefs, canonKey, type CrawlDoc, type CrawlOptions } from "./crawl.js";
export { highlight, lineMetrics, type LineMetrics } from "./highlight.js";
export type { ExtractOptions, Extracted } from "./static-html.js";
export { settleHeadless, approximateMeasurer, DEFAULT_ENV } from "./headless.js";
export type { Environment, HeadlessOptions } from "./headless.js";
export { DiskTracker, diskProbe, statValidator } from "./cache-node.js";
export { isUpToDate, validatorsEqual, lookupKey, contentTag, fnv1a } from "./closure.js";
export type { Closure, ClosureEntry, Validator, Tracker, Probe } from "./closure.js";

/** The bundled component library root (`declarelang/library`) — its `autoincludes.json`
 *  + `src/*.declare` are what make bare tags like `Bar [ … ]` resolve with no
 *  `include`. Resolved from this module's location (compiler/dist/…), so it is
 *  correct wherever the distro is checked out. Callers may override with
 *  `opts.host` (e.g. a fetch host in the browser). */
const LIBRARY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../library");

/** The crawl's own-material data resolver over a program's origin directory (the
 *  build-time data rule, docs/system-design/location.md §9): a RELATIVE DataSource url is a file
 *  beside the app — read it from disk, parsed as JSON; absent → null (the crawl
 *  reports it loudly). Absolute urls never reach this (crawl.ts refuses them as the
 *  network). The browser twin is a same-origin fetch of the same deployed file, so
 *  the two crawls read the same bytes. */
export function diskDataResolver(originDir: string): (url: string) => unknown {
  return (url: string): unknown => {
    let raw: string;
    try {
      raw = readFileSync(resolve(originDir, url), "utf8");
    } catch {
      return null;
    }
    // The file's MATERIAL: parsed JSON when it is JSON, the raw string when it
    // is text (a Markdown article a `format = "text"` source reads verbatim).
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };
}

/** `compile` with the filesystem include+auto-include host and (when `typecheck`
 *  is set) the real typechecker injected. Drop-in for the previous `compile`
 *  import. */
export function compile(source: string, opts: CompileOptions = {}): Compiled {
  return compileCore(source, {
    ...opts,
    host: opts.host ?? nodeIncludeHost(LIBRARY_ROOT),
  });
}

export interface TrackedOptions extends CompileOptions {
  /** The main source's own path (absolute) — recorded as a closure entry so an
   *  edit to the app file itself busts the cache. Omit for an unsaved buffer. */
  mainId?: string;
  /** Compiler properties that also gate cache staleness (e.g. `{ render: "dom" }`).
   *  Frozen into the closure and compared by isUpToDate. */
  props?: Record<string, string>;
}

/** `compile`, additionally returning the compile's full dependency CLOSURE
 *  (closure.ts) — the main file, every `include`, every auto-included component
 *  library, and the manifest, each with a disk validator. The caller owns it:
 *  feed it to isUpToDate()/contentTag() for a disk or HTTP cache, or to fs.watch
 *  for live reload. The disk/browser CACHE layers (get/put, 304s) build on this
 *  and land with the deploy / in-browser-compile paths that need them. */
export function compileTracked(source: string, opts: TrackedOptions = {}): Compiled & { closure: Closure } {
  const tracker = new DiskTracker();
  if (opts.mainId !== undefined) tracker.file(opts.mainId);
  const result = compileCore(source, {
    ...opts,
    host: opts.host ?? nodeIncludeHost(LIBRARY_ROOT, tracker),
  });
  return { ...result, closure: tracker.closure(opts.props ?? {}) };
}
