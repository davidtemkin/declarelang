// Compile a `{ }` body — the in-runtime evaluation path, and deliberately a
// seam: the compiler front-end (APPROACH §5) will hand these bodies to tsc,
// typecheck them against the component's declared attributes, and emit
// prewired dependencies; this module is exactly what that replaces. Until
// then a body is compiled with the platform's own parser (`new Function`) —
// full TypeScript-*expression* syntax minus type annotations, zero
// dependencies, and a real syntax check the checker can report at check time
// with a source position.
//
// Scope inside a body: the three injected scope nouns of language §11 — `this`
// (the node the code is on), `parent` (its view-tree parent), and `classroot`
// (the enclosing class instance, R6). (The `app` noun needs no runtime binding
// — compile.ts rewrites it to `this.root`.) Bare reads of enclosing-scope
// attributes (`count`, `label`) are COMPILE-TIME scope resolution (compile.ts
// rewrites them to explicit reads through these nouns — never runtime
// `with`-style scoping, per the R4 ruling); a body that skipped the compile step and kept
// a bare name fails loudly here as a ReferenceError on first evaluation.
//
// Runtime-free on purpose (this module may import the lexical layers only):
// check.ts uses it for syntax validation, so it must not drag the runtime in.
//
// R8: a body may contain datapath islands (`:location.city` — language §9's
// value mode). They rewrite to their explicit form `this.$data("…")` before
// compilation — the same discipline as R6's bare-name rewrites, done here
// because `:` is not TypeScript (the compile layer neutralizes islands for
// its own TS parse and ships them through; the runtime is where they become
// calls). `$` is outside the language's identifier grammar, so `$data` can
// never collide with a member.
import { rewriteDatapaths } from "./datapath.js";
import { colorWithAlpha, gradient, shadow, stop, stroke } from "./value.js";
// The ruled value constructors, in scope inside every `{ }` body — the "one
// vocabulary, two lexical homes" ruling: the same names the literal grammar
// admits (`stroke = stroke(1, #B0B0B0)`) are ordinary functions in TS
// position (`shadow(0, 1, hover ? 6 : 2, 0x222222)`). They enter through a
// leading hidden argument (never globals); the compile layer leaves
// CALLEE-position uses of these names unresolved so `stroke(…)` is the
// constructor while bare `stroke` stays the slot.
const DECOR = { gradient, stroke, shadow, stop };
// The lowering target for `0xRRGGBBAA` literals (compile.ts rewrites each 8-hex
// color literal to a colorWithAlpha(…) call): in scope so the resolved body can
// call it, but NOT a user-written value constructor — kept out of DECOR so
// CONSTRUCTOR_NAMES stays the four the grammar names.
const LOWERED = { colorWithAlpha };
// Runtime SERVICES in body scope — `Focus.focus(this)` in a click handler is
// the canonical use. Injected by index.ts at load through this registry (not
// an import: expr.ts sits below focus.ts in the module graph). The scope
// object and prelude are rebuilt on injection, never per body evaluation.
let SCOPE = { ...DECOR, ...LOWERED };
let PRELUDE = `const { ${Object.keys(SCOPE).join(", ")} } = $d;`;
export function setBodyServices(services) {
    SCOPE = { ...DECOR, ...LOWERED, ...services };
    PRELUDE = `const { ${Object.keys(SCOPE).join(", ")} } = $d;`;
}
/** The value-constructor names — the compile layer (compile.ts) skips these
 *  in callee position, and the checker reserves the two that are not already
 *  attribute names. */
export const CONSTRUCTOR_NAMES = Object.keys(DECOR);
/** Compile a body's source to a function, or say why it can't be. The
 *  error text is a fragment ("is not a valid expression — …") for callers
 *  to prefix with the slot's name; one wording, used by check() at check
 *  time and bindConstraint() at instantiate time.
 *
 *  Strict mode, and the body is parenthesized into a `return`, so only an
 *  expression parses. (A determined string can still smuggle statements
 *  through balanced parens — expression-*enforcement*, like typechecking,
 *  is the tsc path's job; this is a syntax gate, not a sandbox.) */
export function compileExpr(src) {
    const r = rewriteDatapaths(src);
    if ("error" in r)
        return r;
    try {
        const raw = new Function("$d", "parent", "classroot", `"use strict"; ${PRELUDE} return (${r.src});`);
        return {
            fn: function (parent, classroot) {
                return raw.call(this, SCOPE, parent, classroot);
            },
        };
    }
    catch (e) {
        return { error: `is not a valid expression — ${e.message}` };
    }
}
let syntaxValidator = null;
export function setBodySyntaxValidator(v) { syntaxValidator = v; }
/** Check `src` as an expression body — the injected TS validator when the
 *  compiler is present, else the JS gate. Returns the error fragment or null. */
export function validateExpr(src) {
    if (syntaxValidator !== null) {
        const r = rewriteDatapaths(src);
        if ("error" in r)
            return r.error;
        return syntaxValidator(r.src, true);
    }
    const c = compileExpr(src);
    return "error" in c ? c.error : null;
}
/** Check `src` as a statement body — same seam, statement-shaped. */
export function validateBody(params, src) {
    if (syntaxValidator !== null) {
        const r = rewriteDatapaths(src);
        if ("error" in r)
            return r.error;
        return syntaxValidator(r.src, false);
    }
    const c = compileBody(params, src);
    return "error" in c ? c.error : null;
}
/** Compile a method member's *statement* body (R5) — the same seam as
 *  compileExpr, statement-shaped: no `return (…)` wrapping, so bodies hold
 *  ordinary TS statements and may `return` a value themselves. Parameter
 *  names precede the body in the Function signature, so they are in scope
 *  exactly as language §4 promises ("their names are in scope in the body").
 *  Scope rules and the replacement plan are compileExpr's, unchanged. The
 *  error fragment matches the compileExpr pattern for callers to prefix. */
export function compileBody(params, src) {
    const r = rewriteDatapaths(src);
    if ("error" in r)
        return r;
    try {
        // The body runs inside its own block so a statement may shadow a
        // constructor name (`const stop = …`) without a redeclaration error;
        // `var` still hoists to the function and `return` works unchanged.
        const raw = new Function("$d", "parent", "classroot", ...params, `"use strict"; ${PRELUDE} { ${r.src} }`);
        return {
            fn: function (parent, classroot, ...args) {
                return raw.call(this, SCOPE, parent, classroot, ...args);
            },
        };
    }
    catch (e) {
        return { error: `is not a valid method body — ${e.message}` };
    }
}
//# sourceMappingURL=expr.js.map