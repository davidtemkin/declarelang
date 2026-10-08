import { type Program } from "../../runtime/dist/parser.js";
import { DeclareError } from "../../runtime/dist/errors.js";
/** Typecheck every `{ }` body of a program whose bodies are scope-resolved
 *  (bare names already paths). `text` is the source its positions index into —
 *  the lines a diagnostic is reported on. Returns coded DECLARE6001 diagnostics
 *  (empty when clean). Never throws on TS internals: a body that cannot be
 *  framed is skipped, not failed. */
export declare function typecheckBodies(text: string, program: Program): {
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
/** One rewrite the resolver made to a body: the span of the author's body text
 *  it replaced, and what replaced it. */
export interface BodyRewrite {
    start: number;
    end: number;
    text: string;
}
/** Each rewritten body's rewrites, keyed by the body's owner (an attribute's
 *  code value, a declaration's default, a method) — recorded as compile()
 *  applies them, so a diagnostic in the rewritten text is carried back. */
export declare const bodyRewrites: WeakMap<object, readonly BodyRewrite[]>;
