import { type Program } from "../../runtime/dist/parser.js";
import { DeclareError } from "../../runtime/dist/errors.js";
/** Typecheck every resolved `{ }` body in `resolved` (compile()'s output — a
 *  self-contained program whose bare names are already paths). Returns coded
 *  DECLARE6001 diagnostics (empty when clean). Never throws on TS internals: a
 *  body that cannot be framed is skipped, not failed. */
export declare function typecheckBodies(resolved: string, program: Program): DeclareError[];
/** Register where `lib.*.d.ts` texts come from (Node: disk; browser: embedded).
 *  Consulted lazily, only when a typecheck actually runs. */
export declare function provideLib(provider: (name: string) => string | undefined): void;
