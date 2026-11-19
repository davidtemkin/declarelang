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
import { compile as compileCore, carryProgram, type CompileOptions, type Compiled } from "./compile.js";
import { nodeIncludeHost } from "./include-node.js";
import { provideLib } from "./typecheck.js";
import { DiskTracker } from "./cache-node.js";
import type { Closure } from "./closure.js";
import { parseProgram, type Flags } from "../../runtime/dist/parser.js";
import { resolveIncludes } from "../../runtime/dist/include.js";
import { CSS_COLORS } from "../../runtime/dist/css-colors.js";
import { colorToCss } from "../../runtime/dist/value.js";

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
export { extractFromProgram, staticHtml, blocksHtml, crawlerDocument } from "./static-html.js";
import { extractStatic as extractStaticCore, type ExtractOptions as ExtractOpts, type Extracted as ExtractResult } from "./static-html.js";
/** `extractStatic` with the library on hand, as this module's `compile` has it:
 *  a program's library classes (a TextInput, a Button) resolve. */
export function extractStatic(source: string, opts: ExtractOpts = {}): Promise<ExtractResult> {
  return extractStaticCore(source, { ...opts, host: opts.host ?? nodeIncludeHost(LIBRARY_ROOT) });
}
export { crawlLocations, crawlDocument, crawlExtract, fragmentHrefs, canonKey, type CrawlDoc, type CrawlOptions } from "./crawl.js";
export { highlight, lineMetrics, programMetrics, programIndex, type LineMetrics, type ProgramMetrics, type ProgramIndex } from "./highlight.js";
export type { ExtractOptions, Extracted } from "./static-html.js";
export { settleHeadless, approximateMeasurer, DEFAULT_ENV } from "./headless.js";
export type { Environment, HeadlessOptions } from "./headless.js";
export { DiskTracker, diskProbe, statValidator, hashValidator } from "./cache-node.js";
export { isUpToDate, validatorsEqual, lookupKey, contentTag, fnv1a } from "./closure.js";
export type { Closure, ClosureEntry, Validator, Tracker, Probe } from "./closure.js";

/** The bundled class library root (`declarelang/library`) — its `autoincludes.json`
 *  + `src/*.declare` are what make bare tags like `Gauge [ … ]` resolve with no
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

/** The program's own `defaultFlags [ … ]`, read from its files without compiling it —
 *  what a host needs before it decides how to serve the program. Undefined when
 *  it states none, or when its files do not parse (the compile reports that). */
export async function programFlags(source: string, originDir: string): Promise<Flags | undefined> {
  try {
    const { program, errors } = await resolveIncludes(parseProgram(source), nodeIncludeHost(LIBRARY_ROOT), originDir);
    return errors.length > 0 ? undefined : program.flags;
  } catch {
    return undefined;
  }
}

/** The page color a host paints before the program runs: the App's `fill` when it
 *  is a literal color (`black`, `#1E3A49`, `0x0A0A0A`), as CSS; null when the fill
 *  is a rule, is absent, or the source does not parse. Once the program mounts, the
 *  runtime paints the page with the App's live fill (dom-backend setFill); this only
 *  covers the moment before, so a page opens on the color its app declares. */
export function programPageColor(source: string): string | null {
  try {
    const fill = parseProgram(source).root?.attrs.find((a) => a.name === "fill")?.value;
    if (fill === undefined) return null;
    if (fill.kind === "ident") {
      const n = CSS_COLORS[fill.name.toLowerCase()];
      return n === undefined ? null : colorToCss(n);
    }
    if (fill.kind === "hexColor") return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(fill.raw) ? fill.raw.toLowerCase() : null;
    if (fill.kind === "number" && fill.hex === true) return colorToCss(fill.value);
    return null;
  } catch {
    return null;
  }
}

/** `compile` with the filesystem include+auto-include host and (when `typecheck`
 *  is set) the real typechecker injected. Drop-in for the previous `compile`
 *  import. */
export async function compile(source: string, opts: CompileOptions = {}): Promise<Compiled> {
  return compileCore(source, {
    ...opts,
    host: opts.host ?? nodeIncludeHost(LIBRARY_ROOT),
    bundleScripts: opts.bundleScripts ?? nodeBundleScripts,
  });
}

/** The Node host's script-module bundler (CompileOptions.bundleScripts): esbuild
 *  over the concatenated script sources, resolving relative files from disk and
 *  bare specifiers from node_modules, emitting one CommonJS text the compile
 *  re-embeds. Lazy import — a program with no script imports never loads it. */
async function nodeBundleScripts(entry: string, resolveDir: string, tracker?: DiskTracker): Promise<{ code: string } | { error: string }> {
  try {
    const esbuild = await import("esbuild");
    const r = await esbuild.build({
      stdin: { contents: entry, resolveDir, loader: "ts" },
      bundle: true, write: false, format: "cjs", platform: "browser", target: "es2022",
      logLevel: "silent", metafile: tracker !== undefined,
    });
    // The program's own files the bundle read (a `./plan.ts` and what it imports)
    // join the closure, as an include does: the bundle is inside the compiled
    // program, so an edit to one must make the next load compile again. Installed
    // packages stay out: they change with an install, which a reload of the
    // server already answers, and a package can be hundreds of files to check.
    if (tracker !== undefined && r.metafile !== undefined) {
      for (const input of Object.keys(r.metafile.inputs)) {
        if (input.startsWith("<") || /(^|[\\/])node_modules[\\/]/.test(input)) continue;
        tracker.file(resolve(input));   // esbuild names an input from the working directory
      }
    }
    return { code: r.outputFiles[0].text };
  } catch (e) {
    return { error: String((e as Error)?.message ?? e) };
  }
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
 *  (closure.ts) — the main file, every `include`, every auto-included class
 *  library, the manifest, and the program's own files its script imports bundle
 *  (an imported `.ts` and what it imports), each with a disk validator. The caller owns it:
 *  feed it to isUpToDate()/contentTag() for a disk or HTTP cache, or to fs.watch
 *  for live reload. The disk/browser CACHE layers (get/put, 304s) build on this
 *  and land with the deploy / in-browser-compile paths that need them. */
export async function compileTracked(source: string, opts: TrackedOptions = {}): Promise<Compiled & { closure: Closure }> {
  const tracker = new DiskTracker();
  if (opts.mainId !== undefined) tracker.file(opts.mainId);
  const result = await compileCore(source, {
    ...opts,
    host: opts.host ?? nodeIncludeHost(LIBRARY_ROOT, tracker),
    bundleScripts: opts.bundleScripts ?? ((entry, dir) => nodeBundleScripts(entry, dir, tracker)),
  });
  return carryProgram(result, { closure: tracker.closure(opts.props ?? {}) });
}
