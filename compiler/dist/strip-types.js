// strip-types — TS-only syntax is CHECKED, then STRIPPED before emission
// (2026-07-13). A `{ }` body is authored and type-checked as TypeScript, but
// evaluated at runtime as JavaScript (`new Function` — the zero-dependency
// runtime carries no transpiler). So the compile front-end removes the
// type-level syntax the checker consumed — `x as T` / `x satisfies T` → `x`,
// `x!` → `x`, `<T>x` → `x` — by targeted SPLICES, not a re-emit: every other
// byte (comments, spacing) survives verbatim, so the resolved source stays
// the author's text. The unblocking case is typed parent-collaboration
// (`(parent as RadioGroup).pick(choice)` — the component library's Radio):
// the cast informs the typecheck, the runtime sees `(parent).pick(choice)`,
// and dep extraction's read-path walker already sees through the parentheses
// a stripped cast leaves behind.
//
// Order in compile(): AFTER typecheck (which wants the types), BEFORE dep
// extraction (which then parses plain JS). Bodies containing `:path` datapath
// islands are SKIPPED for now (they don't parse as TS without the island
// rewrite, whose length changes would corrupt splice offsets) — a cast next
// to a datapath island stays unstripped and fails at runtime; noted, rare,
// and the checker's job to reject when the island-aware slice lands.
import ts from "typescript";
/** The body-local spans to delete from one `{ }` body. `expression` selects
 *  the parse mode (a value body is an expression; a method body, statements).
 *  Unparseable text yields no edits — typecheck and dep extraction own those
 *  errors, each with better positions than this pass could give. */
export function stripEditsFor(src, expression) {
    // A statement body parses inside a function wrapper (a bare top-level
    // `return` is a parse error); an expression body parses parenthesized.
    const PRE = expression ? "(" : "(function(){\n";
    const text = expression ? `(${src}\n)` : `(function(){\n${src}\n})`;
    const delta = -PRE.length;
    const sf = ts.createSourceFile("b.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const diags = sf.parseDiagnostics;
    if (diags !== undefined && diags.length > 0)
        return [];
    const edits = [];
    const visit = (n) => {
        if (ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isNonNullExpression(n)) {
            edits.push({ start: n.expression.getEnd() + delta, end: n.getEnd() + delta });
        }
        else if (ts.isTypeAssertionExpression(n)) {
            // `<T>x` — remove the angle-bracket prefix, keep the expression
            edits.push({ start: n.getStart(sf) + delta, end: n.expression.getStart(sf) + delta });
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    // Keep only edits that land inside the body's own span (never the wrapper).
    return edits.filter((e) => e.start >= 0 && e.end <= src.length && e.end > e.start);
}
/** The TS-aware check-time body-syntax validator the compile front-end
 *  installs on the runtime's seam (expr.ts setBodySyntaxValidator): bodies
 *  are authored as TypeScript, so the check-phase gate must parse TS — the
 *  runtime's own `Function` gate stays for compiler-less paths. Receives
 *  datapath-rewritten text. Returns the error fragment or null. */
export function tsBodySyntax(src, expression) {
    const text = expression ? `(${src}\n)` : `(function(){\n${src}\n})`;
    const sf = ts.createSourceFile("b.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const what = expression ? "is not a valid expression" : "is not a valid method body";
    const diags = sf.parseDiagnostics;
    if (diags !== undefined && diags.length > 0) {
        return `${what} — ${ts.flattenDiagnosticMessageText(diags[0].messageText, " ")}`;
    }
    // A digit-first `#hex` (#334455) is an "Invalid character" parse error above; a
    // letter-first one (#f00, #ff0000) lexes as a valid PrivateIdentifier and would
    // surface only at typecheck. Catch it here so a bare-slot color is one structure-
    // phase diagnostic either way — refineBodyError (expr.ts) adds the `0x…` fix. The
    // AST node test means a `#hex` inside a string or comment is never mistaken for one.
    let hexIdent = false;
    const scan = (n) => {
        if (hexIdent)
            return;
        if (ts.isPrivateIdentifier(n) && /^#[0-9a-fA-F]{3,8}$/.test(n.text)) {
            hexIdent = true;
            return;
        }
        ts.forEachChild(n, scan);
    };
    scan(sf);
    if (hexIdent)
        return `${what} — Invalid character.`;
    return null;
}
//# sourceMappingURL=strip-types.js.map