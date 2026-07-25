import type { Program } from "./parser.js";
/** Restore elided structural fields in place and return the program.
 *  Idempotent; a never-compacted program passes through untouched. */
export declare function hydrateProgram(program: Program): Program;
