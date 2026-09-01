import { type Program } from "../../runtime/dist/parser.js";
import { DeclareError } from "../../runtime/dist/errors.js";
/** Typecheck every resolved `{ }` body in `resolved` (compile()'s output — a
 *  self-contained program whose bare names are already paths). Returns coded
 *  DECLARE6001 diagnostics (empty when clean). Never throws on TS internals: a
 *  body that cannot be framed is skipped, not failed. */
export declare function typecheckBodies(resolved: string, program: Program): {
    errors: DeclareError[];
    oracle: TypeOracle | null;
};
/** The L-21 TYPE ORACLE (RULED 2026-09-01: method calls resolve with TS
 *  semantics, no deviation). Dependency extraction asks, for a { } body it is
 *  walking and a method name called there, what the CHECKER says the
 *  receivers' static types are — answered from the very ts.Program the
 *  typecheck just ran, so the answer is exactly TypeScript's. The extractor
 *  then follows only that family's bodies; a receiver TS types as `any` sends
 *  the constraint to the runtime tracking path instead of any name-keyed union. */
export interface TypeOracle {
    /** The static targets of every `<recv>.<method>(…)` call inside the body
     *  whose opening `{` sits at (line, col) in the resolved source. `classes`
     *  are class/tag names, resolved by the extractor through its class chain
     *  (plus the override closure); `braces` are INSTANCE methods, identified by
     *  their own body's `{` position. "any" = some receiver is untypeable, or
     *  the call could not be located; null = the body is unknown to the check.
     *  The caller treats both as: go dynamic. */
    methodTargets(line: number, col: number, method: string): {
        classes: string[];
        braces: {
            line: number;
            col: number;
        }[];
    } | "any" | null;
}
/** Register where `lib.*.d.ts` texts come from (Node: disk; browser: embedded).
 *  Consulted lazily, only when a typecheck actually runs. */
export declare function provideLib(provider: (name: string) => string | undefined): void;
