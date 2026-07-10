/** The value-constructor names — the compile layer (compile.ts) skips these
 *  in callee position, and the checker reserves the two that are not already
 *  attribute names. */
export declare const CONSTRUCTOR_NAMES: readonly string[];
/** A compiled body. Called with `this` bound to the owning node and its
 *  parent and classroot as arguments, so all three scope nouns resolve
 *  naturally. */
export type ExprFn = (this: unknown, parent: unknown, classroot: unknown) => unknown;
/** Compile a body's source to a function, or say why it can't be. The
 *  error text is a fragment ("is not a valid expression — …") for callers
 *  to prefix with the slot's name; one wording, used by check() at check
 *  time and bindConstraint() at instantiate time.
 *
 *  Strict mode, and the body is parenthesized into a `return`, so only an
 *  expression parses. (A determined string can still smuggle statements
 *  through balanced parens — expression-*enforcement*, like typechecking,
 *  is the tsc path's job; this is a syntax gate, not a sandbox.) */
export declare function compileExpr(src: string): {
    fn: ExprFn;
} | {
    error: string;
};
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
