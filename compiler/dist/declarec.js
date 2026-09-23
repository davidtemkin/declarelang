// declarec — Declare's production build (the compiler half).
//
// A dev page ships the app SOURCE and parses + typechecks it in the browser at
// boot, carrying the whole compiler (parser + checker) over the wire. That is
// convenient but not what you deploy. `declarec` moves parse + bare-name
// resolution + typecheck to BUILD time and emits the INSTANTIATED PROGRAM as
// JSON. A production deploy ships that program plus the runtime's run-path only
// (`renderProgram`) — never the parser or checker — exactly as React ships no
// JSX compiler.
//
// This module is the pure compiler half (source → serializable program), so it
// stays server- and browser-usable. The emit half (bundle the runtime with
// esbuild, write the dist tree, copy assets, gzip-measure) lives in the CLI and
// the server, which own the filesystem and the bundler.
import { compileTracked } from "./compile-node.js";
import { programFromCompiled } from "./program-build.js";
// The program-shaped tail — the parse of the merged source, the check, the
// deps, the used set, the trusted stamp, position stripping — is shared with
// the in-browser compiler (compile-browser.ts compileProgram) and lives in
// program-build.ts; this module is the Node front: it compiles from the
// filesystem and hands the result to that tail.
export { usedComponentNames, stripPos } from "./program-build.js";
/** Compile a Declare source into a serializable, instantiate-ready program:
 *  resolve bare names + includes + typecheck (all the compiler's work), then
 *  parse the resolved source into the program the runtime's `renderProgram`
 *  consumes. On any error, `program` is null and `errors` carries every
 *  diagnostic (nothing is emitted). */
export async function compileProgram(source, opts = {}) {
    // The full compile: bare-name resolution + include/auto-include inlining +
    // the tsc-over-bodies typecheck (a phase of THE compile, on by default —
    // compile.ts runs the checker directly; `typecheck: false` is the caller's
    // explicit opt-out). The runtime schema `check()` in the shared tail
    // remains the always-on structural gate.
    const { mainId, props, stripPos: strip, ...compileOpts } = opts;
    const c = await compileTracked(source, { ...compileOpts, mainId, props });
    return programFromCompiled(c, { stripPos: strip });
}
//# sourceMappingURL=declarec.js.map