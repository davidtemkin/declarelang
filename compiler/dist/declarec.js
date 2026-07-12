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
import { compile } from "./compile-node.js";
import { parseProgram } from "../../runtime/dist/parser.js";
import { resolveIncludes, NO_INCLUDES } from "../../runtime/dist/include.js";
import { check } from "../../runtime/dist/check.js";
/** Recursively delete `pos` keys. Mutates in place and returns the value. */
function stripPos(node) {
    if (Array.isArray(node)) {
        for (const el of node)
            stripPos(el);
    }
    else if (node !== null && typeof node === "object") {
        delete node.pos;
        for (const k of Object.keys(node))
            stripPos(node[k]);
    }
    return node;
}
/** Compile a Declare source into a serializable, instantiate-ready program:
 *  resolve bare names + includes + typecheck (all the compiler's work), then
 *  parse the resolved source into the program the runtime's `renderProgram`
 *  consumes. On any error, `program` is null and `errors` carries every
 *  diagnostic (nothing is emitted). */
export function compileProgram(source, opts = {}) {
    // 1) The full Node-side compile: bare-name resolution + include/auto-include
    //    inlining. The tsc-over-bodies typecheck is an ADVISORY pass (it can't
    //    fully model an App's dynamically-declared attributes, so it over-reports)
    //    — off by default, matching the dev path; the runtime schema `check()`
    //    below is the real gate. Opt in with `typecheck: true` for its diagnostics.
    const c = compile(source, { ...opts, typecheck: opts.typecheck ?? false });
    if (c.source === null)
        return { program: null, errors: c.errors, warnings: c.warnings };
    // 2) Parse the resolved source into a program. Includes are already inlined,
    //    so NO_INCLUDES is a guard, not a resolver.
    const parsed = parseProgram(c.source);
    const { program, errors: incErrors } = resolveIncludes(parsed, NO_INCLUDES, "");
    // 3) Belt-and-suspenders: typecheck the program we will actually ship (the
    //    resolved re-parse), so the emitted artifact is provably valid.
    const errors = [...incErrors, ...check(program)];
    if (errors.length > 0)
        return { program: null, errors, warnings: c.warnings };
    if (opts.stripPos ?? true)
        stripPos(program);
    return { program, errors: [], warnings: c.warnings };
}
//# sourceMappingURL=declarec.js.map