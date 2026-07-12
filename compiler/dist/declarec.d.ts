import type { CompileOptions } from "./compile.js";
import { type Program } from "../../runtime/dist/parser.js";
import type { NeoError } from "../../runtime/dist/errors.js";
export interface DeclarecOptions extends CompileOptions {
    /** Drop `pos` source-offset fields from the shipped program. They exist only
     *  for error messages, which a precompiled (already-checked) app never emits
     *  at runtime — stripping them roughly halves the program's raw size and cuts
     *  its gzip near in half. Default true. */
    stripPos?: boolean;
}
export interface ProgramBuild {
    /** The instantiate-ready program, or null when the source did not compile. */
    program: Program | null;
    errors: readonly NeoError[];
    warnings: readonly NeoError[];
}
/** Compile a Declare source into a serializable, instantiate-ready program:
 *  resolve bare names + includes + typecheck (all the compiler's work), then
 *  parse the resolved source into the program the runtime's `renderProgram`
 *  consumes. On any error, `program` is null and `errors` carries every
 *  diagnostic (nothing is emitted). */
export declare function compileProgram(source: string, opts?: DeclarecOptions): ProgramBuild;
