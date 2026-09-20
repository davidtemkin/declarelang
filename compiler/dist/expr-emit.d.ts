import type { Program, Method } from "../../runtime/dist/parser.js";
/** The opcodes — declare_kernel.h's enum, kept in step by kernel/test. */
export declare const OP: Readonly<{
    END: 0;
    LOAD: 1;
    CONST: 2;
    ADD: 3;
    SUB: 4;
    MUL: 5;
    DIV: 6;
    MOD: 7;
    NEG: 8;
    MIN: 9;
    MAX: 10;
    ABS: 11;
    FLOOR: 12;
    CEIL: 13;
    ROUND: 14;
    SQRT: 15;
    LT: 16;
    LE: 17;
    GT: 18;
    GE: 19;
    EQ: 20;
    NE: 21;
    AND: 22;
    OR: 23;
    NOT: 24;
    SELECT: 25;
    CLAMP: 26;
}>;
export interface ExprCode {
    code: number[];
    paths: string[];
    consts: number[];
}
/** The marker: a deps entry that starts with this is the body's EXPR code. */
export declare const EXPR_MARK = "=E";
export declare function pathsOf(deps: readonly string[]): string[];
export declare const OP_LETTERS: Record<number, string>;
export declare function encodeExpr(e: ExprCode, deps: readonly string[]): string;
export interface InlineScope {
    /** The methods visible for a receiver at this body's site, or null. */
    lookup(receiver: "app" | "classroot" | "this", name: string): Method | null;
}
/** Emit, or null when the body is not a pure numeric expression. */
export declare function emitExpr(src: string, scope?: InlineScope | null): ExprCode | null;
/** Attach the EXPR entry to every candidate body's deps (after dep
 *  extraction: a body without deps is not bindable statically anyway). */
export declare function annotateExprs(program: Program): {
    candidates: number;
    emitted: number;
};
