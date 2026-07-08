import { type Program } from "../../runtime/dist/parser.js";
import { NeoError } from "../../runtime/dist/errors.js";
/** Typecheck every resolved `{ }` body in `resolved` (compile()'s output — a
 *  self-contained program whose bare names are already paths). Returns coded
 *  NEO6001 diagnostics (empty when clean). Never throws on TS internals: a
 *  body that cannot be framed is skipped, not failed. */
export declare function typecheckBodies(resolved: string, program: Program): NeoError[];
