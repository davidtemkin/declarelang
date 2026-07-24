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
// extraction (which then parses plain JS). A body containing `:path` datapath
// islands strips like any other: the islands are rewritten to same-role marker
// calls so the body parses as TS (dep-extract's own trick), the edits are
// computed on the rewritten text, and each edit is mapped back through the
// islands' length deltas. That mapping is total because a deleted span is
// always a type SUFFIX (`as T` / `satisfies T` / `!`) or PREFIX (`<T>`) and a
// type cannot contain a datapath island (scanDatapaths does not read type or
// ternary colons as islands) — the overlap guard below drops, rather than
// misapplies, any edit that would cross a replacement.
import ts from "typescript";
import { scanDatapaths } from "../../runtime/dist/datapath.js";
/** The body-local spans to delete from one `{ }` body. `expression` selects
 *  the parse mode (a value body is an expression; a method body, statements).
 *  Unparseable text yields no edits — typecheck and dep extraction own those
 *  errors, each with better positions than this pass could give. */
export function stripEditsFor(src, expression) {
    // Rewrite `:path` islands to marker calls (`$DP("path")`) so the body parses;
    // record each replacement's span (rewritten coords) and length delta for the
    // map back to original coordinates below.
    let islands = [];
    try {
        islands = scanDatapaths(src);
    }
    catch {
        islands = [];
    }
    let rsrc = "";
    let at = 0;
    const reps = [];
    for (const p of islands) {
        rsrc += src.slice(at, p.start);
        const rStart = rsrc.length;
        rsrc += `$DP(${JSON.stringify(p.path)})`;
        reps.push({ rStart, rEnd: rsrc.length, delta: rsrc.length - rStart - (p.end - p.start) });
        at = p.end;
    }
    rsrc += src.slice(at);
    // A statement body parses inside a function wrapper (a bare top-level
    // `return` is a parse error); an expression body parses parenthesized.
    const PRE = expression ? "(" : "(function(){\n";
    const text = expression ? `(${rsrc}\n)` : `(function(){\n${rsrc}\n})`;
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
    // Keep only edits that land inside the body's own span (never the wrapper),
    // then map rewritten coordinates back to the ORIGINAL source: shift each
    // position by the summed deltas of the replacements before it, and drop any
    // edit with an endpoint inside a replacement (cannot happen for well-formed
    // type syntax; conservative — an unmapped edit is left unstripped, never
    // misapplied).
    const toOrig = (p) => {
        let shift = 0;
        for (const r of reps) {
            if (r.rEnd <= p)
                shift += r.delta;
            else if (r.rStart < p)
                return null;
        }
        return p - shift;
    };
    const out = [];
    for (const e of edits) {
        if (e.start < 0 || e.end > rsrc.length || e.end <= e.start)
            continue;
        const s = toOrig(e.start);
        const t = toOrig(e.end);
        if (s !== null && t !== null && t > s)
            out.push({ start: s, end: t });
    }
    return out;
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
    // TS forms that PARSE but are neither runnable nor stripped — a body carries
    // type OPERATORS (`x as T`, `satisfies`, `!`, `<T>x` — strip-then-run, above),
    // but never type ANNOTATIONS or type DECLARATIONS. Unrejected, an annotation
    // survives to `new Function` and dies at runtime; the language rule (bodies are
    // where a compile-time error is guaranteed instead) is enforced here, at check,
    // with the rewrite named.
    let tsOnly = null;
    const scanTsOnly = (n) => {
        if (tsOnly !== null)
            return;
        if (ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isEnumDeclaration(n) || ts.isModuleDeclaration(n)) {
            tsOnly = `declares a type — type declarations don't live in a { } body; narrow with a cast (x as T), and declare shapes on attributes (name: type = …)`;
        }
        else if ((ts.isParameter(n) && (n.type !== undefined || n.questionToken !== undefined)) ||
            (ts.isVariableDeclaration(n) && (n.type !== undefined || n.exclamationToken !== undefined))) {
            tsOnly = `annotates a binding ('${n.name.getText(sf)}') — bindings in a body take no type annotation (contextual typing covers them); a cast narrows an expression (x as T), and declared types live on the attribute (name: type = …)`;
        }
        else if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n)) && (n.typeParameters !== undefined || n.type !== undefined)) {
            tsOnly = n.typeParameters !== undefined
                ? `declares a type parameter — generics don't live in a { } body; narrow with a cast (x as T) at the use site`
                : `annotates a return type — a body's functions take no signature annotations; a cast on the result (f() as T) narrows it`;
        }
        if (tsOnly === null)
            ts.forEachChild(n, scanTsOnly);
    };
    scanTsOnly(sf);
    if (tsOnly !== null)
        return `${what} — ${tsOnly}`;
    return null;
}
//# sourceMappingURL=strip-types.js.map