export interface StripEdit {
    start: number;
    end: number;
}
/** The body-local spans to delete from one `{ }` body. `expression` selects
 *  the parse mode (a value body is an expression; a method body, statements).
 *  Unparseable text yields no edits — typecheck and dep extraction own those
 *  errors, each with better positions than this pass could give. */
export declare function stripEditsFor(src: string, expression: boolean): StripEdit[];
/** The TS-aware check-time body-syntax validator the compile front-end
 *  installs on the runtime's seam (expr.ts setBodySyntaxValidator): bodies
 *  are authored as TypeScript, so the check-phase gate must parse TS — the
 *  runtime's own `Function` gate stays for compiler-less paths. Receives
 *  datapath-rewritten text. Returns the error fragment or null. */
export declare function tsBodySyntax(src: string, expression: boolean): string | null;
