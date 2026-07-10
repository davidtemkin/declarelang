// compile-node — the Node front-end for `compile`. It wires the two Node-only
// dependencies that `compile.ts` deliberately does NOT import (so that module
// stays browser-loadable for in-browser compilation): the filesystem include
// host (also the bare-tag auto-include host), and the tsc-over-bodies
// typechecker. Node callers — the dev server, the CLI, tests — import `compile`
// from HERE; the browser imports the pure `./compile.js` directly and gets
// neither (no `include`s, no auto-include, no typecheck).

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { compile as compileCore, type CompileOptions, type Compiled } from "./compile.js";
import { nodeIncludeHost } from "./include-node.js";
import { typecheckBodies } from "./typecheck.js";
import { DiskTracker } from "./cache-node.js";
import type { Closure } from "./closure.js";

export type { CompileOptions, Compiled } from "./compile.js";
export { DiskTracker, diskProbe, statValidator } from "./cache-node.js";
export { isUpToDate, validatorsEqual, lookupKey, contentTag, fnv1a } from "./closure.js";
export type { Closure, ClosureEntry, Validator, Tracker, Probe } from "./closure.js";

/** The bundled component library root (`declarelang/library`) — its `autoincludes.json`
 *  + `src/*.declare` are what make bare tags like `Bar [ … ]` resolve with no
 *  `include`. Resolved from this module's location (compiler/dist/…), so it is
 *  correct wherever the distro is checked out. Callers may override with
 *  `opts.host` (e.g. a fetch host in the browser). */
const LIBRARY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../library");

/** `compile` with the filesystem include+auto-include host and (when `typecheck`
 *  is set) the real typechecker injected. Drop-in for the previous `compile`
 *  import. */
export function compile(source: string, opts: CompileOptions = {}): Compiled {
  return compileCore(source, {
    ...opts,
    host: opts.host ?? nodeIncludeHost(LIBRARY_ROOT),
    typecheckBodies: opts.typecheckBodies ?? (opts.typecheck ? typecheckBodies : undefined),
  });
}

export interface TrackedOptions extends CompileOptions {
  /** The main source's own path (absolute) — recorded as a closure entry so an
   *  edit to the app file itself busts the cache. Omit for an unsaved buffer. */
  mainId?: string;
  /** Compiler properties that also gate cache staleness (e.g. `{ backend: "dom" }`).
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
    typecheckBodies: opts.typecheckBodies ?? (opts.typecheck ? typecheckBodies : undefined),
  });
  return { ...result, closure: tracker.closure(opts.props ?? {}) };
}
