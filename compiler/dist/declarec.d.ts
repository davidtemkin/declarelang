import type { CompileOptions } from "./compile.js";
import { type ProgramBuild } from "./program-build.js";
export { usedComponentNames, stripPos, type ProgramBuild } from "./program-build.js";
export interface DeclarecOptions extends CompileOptions {
    /** Drop `pos` source-offset fields from the shipped program. They exist only
     *  for error messages, which a precompiled (already-checked) app never emits
     *  at runtime — stripping them roughly halves the program's raw size and cuts
     *  its gzip near in half. Default true. */
    stripPos?: boolean;
    /** The main source's own path — recorded in the build's closure so an edit
     *  to the app file itself invalidates a cached artifact. */
    mainId?: string;
    /** Build properties frozen into the closure (backend, slim, the toolchain
     *  fingerprint, …) — isUpToDate compares them, so a flag or toolchain change
     *  invalidates like a file change. */
    props?: Record<string, string>;
}
/** Compile a Declare source into a serializable, instantiate-ready program:
 *  resolve bare names + includes + typecheck (all the compiler's work), then
 *  parse the resolved source into the program the runtime's `renderProgram`
 *  consumes. On any error, `program` is null and `errors` carries every
 *  diagnostic (nothing is emitted). */
export declare function compileProgram(source: string, opts?: DeclarecOptions): Promise<ProgramBuild>;
