// Compile a `{ }` body — the in-runtime evaluation path. The compiler
// front-end DOES hand bodies to tsc (typecheck.ts), consume their type syntax
// (strip-types.ts removes `as`/`satisfies`/`!`/`<T>` before the source gets
// here), and emit prewired dependencies (dep-extract.ts) — so what this module
// receives is plain-JS text, compiled with `new Function`: zero dependencies,
// and a real syntax check the checker can report at check time with a source
// position. On an unannotated tree (direct instantiate) it remains the whole
// evaluation story, tracking included.
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
import { colorWithAlpha, frost, gradient, shadow, stop, stroke } from "./value.js";
// The ruled value constructors, in scope inside every `{ }` body — the "one
// vocabulary, two lexical homes" ruling: the same names the literal grammar
// admits (`stroke = stroke(1, #B0B0B0)`) are ordinary functions in TS
// position (`shadow(0, 1, hover ? 6 : 2, 0x222222)`). They enter through a
// leading hidden argument (never globals); the compile layer leaves
// CALLEE-position uses of these names unresolved so `stroke(…)` is the
// constructor while bare `stroke` stays the slot.
const DECOR = { gradient, stroke, shadow, stop, frost };
// The lowering target for `0xRRGGBBAA` literals (compile.ts rewrites each 8-hex
// color literal to a colorWithAlpha(…) call): in scope so the resolved body can
// call it, but NOT a user-written value constructor — kept out of DECOR so
// CONSTRUCTOR_NAMES stays the five the grammar names.
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
// A program's `script { … }` helpers, in body scope as `$s`. Unlike SCOPE —
// which is process-wide, because services are — script bindings belong to ONE
// program: an AppIsland tenant has its own, and must not see its host's. Body
// compilation is eager (bindConstraint compiles at link time, during
// instantiate), so a stack set around the build is enough to bind each body to
// the right program; the stack — rather than a single slot — is what makes the
// nested case correct. The live-edit path recompiles later, so a program also
// keeps its scope and re-enters it there.
let SCRIPT_SCOPE = {};
const SCRIPT_STACK = [];
/** Run `build` with `scope` as the prevailing script scope. */
export function withScriptScope(scope, build) {
    SCRIPT_STACK.push(SCRIPT_SCOPE);
    SCRIPT_SCOPE = scope;
    try {
        return build();
    }
    finally {
        SCRIPT_SCOPE = SCRIPT_STACK.pop() ?? {};
    }
}
/** Evaluate one compiled `script { … }` body, returning the bindings it
 *  declares. The compiler appended the `return { … }` that makes this possible
 *  (there is no way to enumerate a function's scope from outside it). */
export function evalScript(js) {
    const fn = new Function(`"use strict"; ${js}`);
    const out = fn();
    return out !== null && typeof out === "object" ? out : {};
}
/** The destructuring line that puts the current program's helpers in scope.
 *  Built per body at COMPILE time from the keys present then — which is why
 *  the scope must be set before the tree is built, not after. */
function scriptPrelude(scope) {
    const names = Object.keys(scope).filter((n) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n));
    return names.length > 0 ? `const { ${names.join(", ")} } = $s;` : "";
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
// ── the compiled-body memo ─────────────────────────────────────────────────
// Replicated instances re-bind the SAME body text once per row: without a
// memo every fresh row re-runs the datapath rewrite and a `new Function` per
// body — priced in SECONDS when a 10k list's filter mints a hundred rows
// (measured 2026-08-01: 1.1–1.4s per filter pick on the Tracker). Keyed by
// the script scope's IDENTITY (a program's scope object is stable for its
// lifetime; two programs never share one), then the exact source text —
// sound because the compiled function's only compile-time inputs are the
// source and the scope's KEY SET, while the values ride in at call time.
const EXPR_MEMO = new WeakMap();
const BODY_MEMO = new WeakMap();
export function compileExpr(src) {
    // The script scope is captured HERE, at compile time — the body is bound to
    // the program being built, not to whatever is current when it later runs.
    const scripts = SCRIPT_SCOPE;
    let memo = EXPR_MEMO.get(scripts);
    if (memo === undefined)
        EXPR_MEMO.set(scripts, (memo = new Map()));
    const hit = memo.get(src);
    if (hit !== undefined)
        return hit;
    const out = (() => {
        const r = rewriteDatapaths(src);
        if ("error" in r)
            return r;
        try {
            const raw = new Function("$d", "$s", "parent", "classroot", `"use strict"; ${PRELUDE} ${scriptPrelude(scripts)} return (${r.src});`);
            return {
                fn: function (parent, classroot) {
                    return raw.call(this, SCOPE, scripts, parent, classroot);
                },
            };
        }
        catch (e) {
            return { error: `is not a valid expression — ${e.message}` };
        }
    })();
    memo.set(src, out);
    return out;
}
let syntaxValidator = null;
export function setBodySyntaxValidator(v) { syntaxValidator = v; }
/** `#RGB`/`#RRGGBB`/`#RRGGBBAA` → the `0x…` form the { } world uses. Shorthand
 *  (3/4 nibbles) is expanded, so the suggestion is exact. */
function hashToOx(hex) {
    const full = hex.length === 3 || hex.length === 4 ? hex.split("").map((c) => c + c).join("") : hex;
    return "0x" + full.toLowerCase();
}
/** Does a failing attribute body look like statements rather than one expression?
 *  Signals: TS flagged a reserved word (`const`/`let`/…), a statement keyword leads
 *  a segment, or a `;` separates two non-empty parts. Consulted ONLY on an
 *  already-failing body, so a miss just falls through to the raw parser message. */
function looksLikeStatements(src, raw) {
    if (/reserved word/i.test(raw))
        return true;
    if (/(^|[;{])\s*(let|const|var|if|for|while|switch|return|throw)\b/.test(src))
        return true;
    const semi = src.indexOf(";");
    return semi >= 0 && src.slice(semi + 1).trim().length > 0;
}
/** Turn the two most common bare-slot mistakes inside { } into a targeted
 *  fragment. Runs ONLY on an already-failing body — it can never relabel a body
 *  that compiles — and keeps the raw fragment's "expression"/"method body" head. */
function refineBodyError(src, raw, expression) {
    const dash = raw.indexOf(" — ");
    const head = dash >= 0 ? raw.slice(0, dash) : raw;
    // `#` + a digit-first hex is TS's "Invalid character"; `#` + a letter-first hex
    // (#f00, #ff0000) lexes as a private identifier — both are the same color mistake.
    const hash = src.match(/#([0-9a-fA-F]{3,8})(?![0-9a-fA-F])/);
    if (hash && /invalid character|private identifier/i.test(raw)) {
        return `${head} — inside { } a color is written ${hashToOx(hash[1])}, not ${hash[0]} (the #… and named-color forms work only in bare slots)`;
    }
    // A CSS percentage. `width = { 100% }` is the mistake the language map itself
    // highlights, and TS answers it with "Expression expected" — true, and useless.
    // A fraction of the parent is arithmetic here, because a constraint can read
    // the parent directly; there is no percentage unit to reach for.
    const pct = src.match(/(?:^|[^\w.])(\d+(?:\.\d+)?)\s*%(?!\s*[\w(])/);
    if (pct && /expression expected|unexpected|invalid/i.test(raw)) {
        // trimmed, or 33.3 arrives as 0.33299999999999996 and the fix reads worse
        // than the error. The example says `width` without claiming the slot IS
        // width — refineBodyError sees the body, never the attribute it belongs to.
        const frac = Number((Number(pct[1]) / 100).toFixed(6));
        return `${head} — there are no percentages: read the parent and scale, so ${pct[1]}% is { parent.width * ${frac} }`;
    }
    if (expression && looksLikeStatements(src, raw)) {
        return `${head} — an attribute value is one expression, not statements; move the logic into a method and call it (e.g. { classroot.compute() })`;
    }
    return raw;
}
/** Check `src` as an expression body — the injected TS validator when the
 *  compiler is present, else the JS gate. Returns the error fragment or null. */
export function validateExpr(src) {
    let e;
    if (syntaxValidator !== null) {
        const r = rewriteDatapaths(src);
        if ("error" in r)
            return r.error;
        e = syntaxValidator(r.src, true);
    }
    else {
        const c = compileExpr(src);
        e = "error" in c ? c.error : null;
    }
    return e === null ? null : refineBodyError(src, e, true);
}
/** Check `src` as a statement body — same seam, statement-shaped. */
export function validateBody(params, src) {
    let e;
    if (syntaxValidator !== null) {
        const r = rewriteDatapaths(src);
        if ("error" in r)
            return r.error;
        e = syntaxValidator(r.src, false);
    }
    else {
        const c = compileBody(params, src);
        e = "error" in c ? c.error : null;
    }
    return e === null ? null : refineBodyError(src, e, false);
}
/** Compile a method member's *statement* body (R5) — the same seam as
 *  compileExpr, statement-shaped: no `return (…)` wrapping, so bodies hold
 *  ordinary TS statements and may `return` a value themselves. Parameter
 *  names precede the body in the Function signature, so they are in scope
 *  exactly as language §4 promises ("their names are in scope in the body").
 *  Scope rules and the replacement plan are compileExpr's, unchanged. The
 *  error fragment matches the compileExpr pattern for callers to prefix. */
export function compileBody(params, src) {
    const scripts = SCRIPT_SCOPE;
    let memo = BODY_MEMO.get(scripts);
    if (memo === undefined)
        BODY_MEMO.set(scripts, (memo = new Map()));
    const key = params.join("\u001f") + "\u0000" + src; // params shape the signature — part of the identity
    const hit = memo.get(key);
    if (hit !== undefined)
        return hit;
    const out = (() => {
        const r = rewriteDatapaths(src);
        if ("error" in r)
            return r;
        try {
            // The body runs inside its own block so a statement may shadow a
            // constructor name (`const stop = …`) without a redeclaration error;
            // `var` still hoists to the function and `return` works unchanged.
            const raw = new Function("$d", "$s", "parent", "classroot", ...params, `"use strict"; ${PRELUDE} ${scriptPrelude(scripts)} { ${r.src} }`);
            return {
                fn: function (parent, classroot, ...args) {
                    return raw.call(this, SCOPE, scripts, parent, classroot, ...args);
                },
            };
        }
        catch (e) {
            return { error: `is not a valid method body — ${e.message}` };
        }
    })();
    memo.set(key, out);
    return out;
}
//# sourceMappingURL=expr.js.map