export declare function setBodyServices(services: Record<string, unknown>): void;
/** Run `build` with `scope` as the prevailing script scope. */
export declare function withScriptScope<T>(scope: Record<string, unknown>, build: () => T): T;
/** Evaluate one compiled `script { … }` body, returning the bindings it
 *  declares. The compiler appended the `return { … }` that makes this possible
 *  (there is no way to enumerate a function's scope from outside it). */
export declare function evalScript(js: string): Record<string, unknown>;
/** The value-constructor names — the compile layer (compile.ts) skips these
 *  in callee position, and the checker reserves the two that are not already
 *  attribute names. */
export declare const CONSTRUCTOR_NAMES: readonly string[];
/** A compiled body. Called with `this` bound to the owning node and its
 *  parent and classroot as arguments, so all three scope nouns resolve
 *  naturally. */
export type ExprFn = (this: unknown, parent: unknown, classroot: unknown) => unknown;
export declare function compileExpr(src: string): {
    fn: ExprFn;
} | {
    error: string;
};
/** Check-time body-SYNTAX validation, injectable (2026-07-13): bodies are
 *  authored as TypeScript — the compile front-end type-checks them and strips
 *  the type-level syntax before emission (compiler strip-types.ts) — so at
 *  check time the gate must accept TS. The compiler installs a ts-parser
 *  validator here (both hosts carry `typescript`); the runtime-only path
 *  (build() with no compiler) keeps the JS `Function` gate below — its
 *  callers hand it plain-JS bodies by contract. The validator receives the
 *  DATAPATH-REWRITTEN text (islands are neither JS nor TS). */
export type BodySyntaxValidator = (src: string, expression: boolean) => string | null;
export declare function setBodySyntaxValidator(v: BodySyntaxValidator): void;
/** Check `src` as an expression body — the injected TS validator when the
 *  compiler is present, else the JS gate. Returns the error fragment or null. */
export declare function validateExpr(src: string): string | null;
/** Check `src` as a statement body — same seam, statement-shaped. */
export declare function validateBody(params: readonly string[], src: string): string | null;
/** A compiled method body: `this` = the owning node, `parent` its view-tree
 *  parent, `classroot` its enclosing class instance, then the declared
 *  parameters. */
export type BodyFn = (this: unknown, parent: unknown, classroot: unknown, ...args: unknown[]) => unknown;
/** Compile a method member's *statement* body (R5) — the same seam as
 *  compileExpr, statement-shaped: no `return (…)` wrapping, so bodies hold
 *  ordinary TS statements and may `return` a value themselves. Parameter
 *  names precede the body in the Function signature, so they are in scope
 *  exactly as language §4 promises ("their names are in scope in the body").
 *  Scope rules and the replacement plan are compileExpr's, unchanged. The
 *  error fragment matches the compileExpr pattern for callers to prefix. */
export declare function compileBody(params: readonly string[], src: string): {
    fn: BodyFn;
} | {
    error: string;
};
