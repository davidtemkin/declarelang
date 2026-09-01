// dep-extract — static dependency extraction for `{ }` constraints
// (docs/system-design/constraints.md, Model Y). Given a RESOLVED program (post scope
// resolution, so every reactive read is an explicit `this.…` / `parent.…` /
// `classroot.…` chain or a `:path`), it produces, for each constraint, the set
// of reactive READ-PATHS it depends on — following method calls into their
// bodies and everything they call (interprocedural, fixpoint over the call
// graph) — or a positioned error for a §3 residue form.
//
// A read-path is a source sub-expression that, evaluated under read-tracking,
// yields exactly the cells it touches (`this.theme`, `this.root.data.value`,
// `parent.width`, or a `:datapath`). The prewiring runtime evaluates each once
// at link time to bind its cell — versus re-discovering all deps every run.
//
// Soundness: over-approximate (branch-union; extra read-paths are harmless
// no-op edges) but never miss a real dep. An unresolved call target
// (host/JS interop) is NOT assumed pure — it falls to the residue.
//
// This lives in the compile layer (it imports `typescript`); nothing in the
// zero-dependency runtime graph imports it. `annotateProgram` attaches the
// read-paths onto the program AST for the runtime's static-constraint path.
import ts from "typescript";
import { scanDatapaths, splitPath } from "../../runtime/dist/datapath.js";
import { LANGUAGE_METHOD_EFFECTS } from "./effects.js";
import { SCHEMAS } from "../../runtime/dist/schema.js";
const SCOPE_ROOTS = new Set(["parent", "classroot"]); // `this` via ThisKeyword; `app` is `this.root`
/** The DYNAMIC sentinel (the alias/closure door, 2026-08-25). A body whose
 *  cell reads the extractor can SEE but cannot NAME as static paths — an
 *  attribute read rooted at a local alias (`const a = this.roster.find(…);
 *  a.running`) or at an iterator closure's parameter (`team.filter((p) =>
 *  p.online)`) — used to drop those reads SILENTLY, and a prewired constraint
 *  then missed the edge and went permanently stale (the soundness contract
 *  says over-approximate, never miss). Such a body now contributes this
 *  sentinel instead: it flows up the summary graph like any read (rebase
 *  leaves unknown roots alone), and extractProgram turns it into "leave this
 *  constraint on the runtime-tracking path", where every one of those reads
 *  is live per run — the seam the header reserves for genuinely dynamic
 *  reads. The cost is one constraint's prewiring, never its correctness. */
const DYNAMIC = "~dynamic";
/** The root of a chain — `this.a.b` → `this`. */
function baseOfChain(n) {
    let c = n;
    while (ts.isPropertyAccessExpression(c) || ts.isElementAccessExpression(c) || ts.isNonNullExpression(c) || ts.isParenthesizedExpression(c))
        c = c.expression;
    return c;
}
const GLOBALS = new Set(["Inspect", "Math", "Object", "JSON", "Array", "Number", "String", "Boolean", "Date", "console", "parseInt", "parseFloat", "isNaN", "isFinite", "Infinity", "NaN", "undefined", "null", "RegExp", "Symbol", "Map", "Set", "Promise", "Intl", "Error"]);
// …plus colorWithAlpha, the lowered-alpha helper compile.ts now resolves in
// callee position (its arguments carry any deps; the call itself is pure).
const CONSTRUCTORS = new Set(["gradient", "stroke", "shadow", "stop", "colorWithAlpha"]);
const ITER = new Set(["map", "filter", "find", "findIndex", "some", "every", "reduce", "reduceRight", "forEach", "sort", "flatMap", "slice", "concat", "indexOf", "includes", "join", "keys", "values", "entries", "flat", "at", "reverse", "fill", "findLast"]);
const PURE_METHODS = new Set(["toFixed", "toString", "toPrecision", "valueOf", "toExponential", "toUpperCase", "toLowerCase", "trim", "trimStart", "trimEnd", "padStart", "padEnd", "charAt", "charCodeAt", "codePointAt", "substring", "substr", "repeat", "startsWith", "endsWith", "split", "replace", "replaceAll", "match", "matchAll", "search", "normalize", "localeCompare", "slice", "at", "indexOf", "lastIndexOf", "includes", "getFullYear", "getMonth", "getDate", "getDay", "getHours", "getMinutes", "getSeconds", "getTime", "getMilliseconds", "getTimezoneOffset", "toISOString", "toLocaleDateString", "toLocaleTimeString", "toLocaleString", "toDateString", "getUTCFullYear", "getUTCMonth", "getUTCDate"]);
const NODE_COLLECTIONS = new Set(["children", "childViews", "subviews", "views", "members", "instances"]);
const asCode = (v) => v !== null && typeof v === "object" && v.kind === "code" ? v : null;
class DepError {
    message;
    offset;
    constructor(message, offset = 0) {
        this.message = message;
        this.offset = offset;
    }
}
/** A bare node reference — `this`, `parent`, `classroot`, or pure structural nav
 *  (`.root` / `.parent`). Indexing one dynamically selects an attribute slot at
 *  runtime (the residue); indexing anything deeper is array/value access. */
function isPureNodeNav(n) {
    if (n.kind === ts.SyntaxKind.ThisKeyword)
        return true;
    if (ts.isIdentifier(n))
        return SCOPE_ROOTS.has(n.text);
    if (ts.isParenthesizedExpression(n) || ts.isNonNullExpression(n))
        return isPureNodeNav(n.expression);
    if (ts.isPropertyAccessExpression(n))
        return (n.name.text === "root" || n.name.text === "parent") && isPureNodeNav(n.expression);
    return false;
}
/** Rebase a summary read-path onto the call receiver. A method's (or inlined
 *  computed-default's) scope nouns are all relative to the instance that
 *  CARRIES the member — the receiver: `this.year` → `<receiver>.year`,
 *  `classroot.x` → `<receiver>.x` (a member's classroot IS the instance it
 *  is declared on), and `parent.x` → `<receiver>.parent.x` (2026-07-13: the
 *  left-as-is "rare" case became common and WRONG with the component library —
 *  Radio's computed default reads `parent.value`, inlined into a grandchild's
 *  constraint where a literal `parent` means the wrong node; the un-rebased
 *  path silently tracked a nonexistent slot and the constraint never re-fired). */
function rebase(readPath, receiver) {
    if (receiver === "this" || receiver == null)
        return readPath;
    if (readPath === "this" || readPath === "classroot")
        return receiver;
    if (readPath.startsWith("this."))
        return receiver + readPath.slice(4);
    if (readPath.startsWith("this["))
        return receiver + readPath.slice(4);
    if (readPath.startsWith("classroot."))
        return receiver + readPath.slice(9);
    if (readPath === "parent")
        return receiver + ".parent";
    if (readPath.startsWith("parent."))
        return receiver + ".parent" + readPath.slice(6);
    return readPath; // :path inside a method — cursor-relative, not noun-relative
}
/** A chain's canonical path text — the source text with the TS-invisible
 *  wrappers (parens a stripped cast leaves behind, non-null `!`) removed, so
 *  `(parent).value` records as `parent.value`: the runtime wires dep paths by
 *  probing them as expressions and the rebase above matches on noun prefixes —
 *  both need the bare spelling. */
function pathTextOf(n) {
    if (ts.isParenthesizedExpression(n) || ts.isNonNullExpression(n))
        return pathTextOf(n.expression);
    if (ts.isPropertyAccessExpression(n))
        return `${pathTextOf(n.expression)}.${n.name.text}`;
    if (ts.isElementAccessExpression(n))
        return `${pathTextOf(n.expression)}[${n.argumentExpression.getText()}]`;
    return n.getText();
}
/** The `:path` dep-currency text of a LITERAL plan array (`["rows",{"s":[2,8,null]}]`
 *  → `rows[2:8]`), or null when any element is not a literal segment. The
 *  spelling only needs to be stable within one extraction — bind.ts keys on
 *  the leading `:` alone. */
function planLiteralText(arr) {
    const parts = [];
    for (const e of arr.elements) {
        if (ts.isStringLiteral(e)) {
            parts.push((parts.length > 0 ? "." : "") + e.text);
            continue;
        }
        if (!ts.isObjectLiteralExpression(e))
            return null;
        const props = new Map();
        for (const p of e.properties) {
            if (!ts.isPropertyAssignment(p))
                return null;
            const nm = ts.isIdentifier(p.name) ? p.name.text : ts.isStringLiteral(p.name) ? p.name.text : null;
            if (nm === null)
                return null;
            props.set(nm, p.initializer);
        }
        const num = (x) => {
            if (x === undefined)
                return undefined;
            if (x.kind === ts.SyntaxKind.NullKeyword)
                return null;
            if (ts.isNumericLiteral(x))
                return Number(x.text);
            if (ts.isPrefixUnaryExpression(x) && x.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(x.operand))
                return -Number(x.operand.text);
            return undefined;
        };
        if (props.has("i")) {
            const v = num(props.get("i"));
            if (typeof v !== "number")
                return null;
            parts.push(`[${v}]`);
            continue;
        }
        if (props.has("w")) {
            parts.push("[*]");
            continue;
        }
        if (props.has("s")) {
            const sv = props.get("s");
            if (!ts.isArrayLiteralExpression(sv))
                return null;
            const ns = sv.elements.map((el) => num(el));
            if (ns.some((v) => v === undefined))
                return null;
            parts.push(`[${ns.map((v) => (v == null ? "" : String(v))).join(":").replace(/:+$/, ":").replace(/^(-?\d*:-?\d*):$/, "$1")}]`);
            continue;
        }
        return null;
    }
    return parts.join("");
}
function parseBody(src, expression) {
    const text = expression ? `(${rewriteDP(src)}\n)` : rewriteDP(src);
    const sf = ts.createSourceFile("b.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const diags = sf.parseDiagnostics;
    if (diags && diags.length > 0)
        return null;
    return sf;
}
/** `:path` islands → `$DP0("path")` marker calls (`:arr[]` → `$DPM`). */
function rewriteDP(src) {
    let islands;
    try {
        islands = scanDatapaths(src);
    }
    catch {
        return src;
    }
    if (!islands.length)
        return src;
    let out = "", at = 0;
    for (const p of islands) {
        out += src.slice(at, p.start) + `${p.many ? "$DPM" : "$DP0"}(${JSON.stringify(p.path)})`;
        at = p.end;
    }
    return out + src.slice(at);
}
/** A pure PATH — a chain of names off a single root, with only literal indices.
 *  Returns its canonical text, or null when the expression is anything else (a
 *  call, an operator, a literal). This is what a script call's argument must be
 *  for a read *through* the corresponding parameter to be nameable at the call
 *  site: `f(app.card)` can rebase `node.title` to `this.root.card.title`;
 *  `f(pick())` has no name to rebase onto. */
function nameablePath(n) {
    if (ts.isParenthesizedExpression(n) || ts.isNonNullExpression(n) || ts.isAsExpression(n))
        return nameablePath(n.expression);
    if (n.kind === ts.SyntaxKind.ThisKeyword)
        return "this";
    if (ts.isIdentifier(n))
        return n.text;
    if (ts.isPropertyAccessExpression(n)) {
        const b = nameablePath(n.expression);
        return b === null ? null : `${b}.${n.name.text}`;
    }
    if (ts.isElementAccessExpression(n)) {
        const idx = n.argumentExpression;
        if (idx === undefined || !(ts.isNumericLiteral(idx) || ts.isStringLiteral(idx)))
            return null;
        const b = nameablePath(n.expression);
        return b === null ? null : `${b}[${idx.getText()}]`;
    }
    return null;
}
/** Harvest each script block's top-level declarations. Function declarations and
 *  `const f = (…) => …` become followable callees; `let`/`var` bindings become
 *  MUTABLE MODULE STATE, which no constraint can depend on — a plain module
 *  variable has no cell, so neither prewiring nor runtime tracking can ever see it
 *  move. Reading one from a constraint is refused (below) rather than silently
 *  wired to nothing. A top-level `const` is a frozen constant and is fine. */
function scriptFunctions(sources) {
    const fns = new Map();
    const mutable = new Set();
    const classes = new Set();
    const paramsOf = (ps) => {
        const out = [];
        for (const p of ps) {
            if (!ts.isIdentifier(p.name) || p.dotDotDotToken !== undefined)
                return null;
            out.push(p.name.text);
        }
        return out;
    };
    for (const src of sources) {
        // Parsed with parents, and WITHOUT rejecting diagnostics: by this point the
        // block carries the emitter's `return { … }` bindings tail, a top-level
        // `return` that TS flags but still parses into statements we can read.
        const sf = ts.createSourceFile("script.js", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        for (const st of sf.statements) {
            if (ts.isFunctionDeclaration(st) && st.name !== undefined && st.body !== undefined) {
                fns.set(st.name.text, { params: paramsOf(st.parameters), body: st.body });
            }
            else if (ts.isImportDeclaration(st)) {
                // Imported bindings are script-tier names: opaque callables/values.
                // Folding them into `fns` is what routes a call through the opaque
                // script path (node-arg check included) instead of "unresolved target".
                const c = st.importClause;
                if (c !== undefined && !c.isTypeOnly) {
                    if (c.name !== undefined)
                        fns.set(c.name.text, { params: null, body: st });
                    const b = c.namedBindings;
                    if (b !== undefined) {
                        if (ts.isNamespaceImport(b))
                            fns.set(b.name.text, { params: null, body: st });
                        else
                            for (const s of b.elements)
                                if (!s.isTypeOnly)
                                    fns.set(s.name.text, { params: null, body: st });
                    }
                }
            }
            else if (ts.isClassDeclaration(st) && st.name !== undefined) {
                classes.add(st.name.text);
            }
            else if (ts.isVariableStatement(st)) {
                const isConst = (st.declarationList.flags & ts.NodeFlags.Const) !== 0;
                for (const d of st.declarationList.declarations) {
                    if (!ts.isIdentifier(d.name)) {
                        if (!isConst)
                            collectBindingNames(d.name, mutable);
                        continue;
                    }
                    const init = d.initializer;
                    if (isConst && init !== undefined && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && init.body !== undefined) {
                        fns.set(d.name.text, { params: paramsOf(init.parameters), body: init.body });
                    }
                    else if (isConst && init !== undefined && ts.isClassExpression(init)) {
                        classes.add(d.name.text);
                    }
                    else if (!isConst) {
                        mutable.add(d.name.text);
                    }
                }
            }
        }
    }
    return { fns, mutable, classes };
}
/** Is this identifier a NAME rather than a value reference — an object-literal key,
 *  a destructuring property name, a declared binding, a label? Those spell a name
 *  that happens to match; they read nothing. */
function isNamePosition(n) {
    const p = n.parent;
    if (p === undefined)
        return false;
    // `e.y` — the `y` is a member name, not the enclosing `y`. Missing this made
    // every `e.y == y` comparison look like the parameter being stored.
    if (ts.isPropertyAccessExpression(p))
        return p.name === n;
    if (ts.isQualifiedName(p))
        return p.right === n;
    if (ts.isPropertyAssignment(p) || ts.isEnumMember(p))
        return p.name === n;
    if (ts.isBindingElement(p))
        return p.name === n || p.propertyName === n;
    if (ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p) || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p))
        return p.name === n;
    if (ts.isLabeledStatement(p) || ts.isBreakStatement(p) || ts.isContinueStatement(p))
        return true;
    return false;
}
function collectBindingNames(n, into) {
    if (ts.isIdentifier(n)) {
        into.add(n.text);
        return;
    }
    for (const el of n.elements)
        if (ts.isBindingElement(el))
            collectBindingNames(el.name, into);
}
function collectLocals(sf, params) {
    const locals = new Set(params);
    const add = (n) => {
        if (ts.isIdentifier(n))
            locals.add(n.text);
        else
            for (const el of n.elements)
                if (ts.isBindingElement(el))
                    add(el.name);
    };
    const visit = (n) => {
        if (ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n))
            add(n.name);
        if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)) && n.name)
            locals.add(n.name.text);
        if (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n))
            for (const p of n.parameters)
                add(p.name);
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return locals;
}
/** Does the call site read through this expression's result? */
function isProjected(n) {
    return projectionTail(n) !== null;
}
/** WHAT the call site reads off the result — `pickBox().width` → "width",
 *  `pickBox().a.b` → "a.b" — or null when the result is not read through.
 *
 *  The boolean was enough while the only question was whether to REFUSE (a
 *  callee handing back one of its parameters). To WIRE a returned node's
 *  attribute the tail is the other half of the path: the callee supplies
 *  `<receiver>.box`, this supplies `.width`. Property and literal-index steps
 *  only — a computed index is a runtime choice and stops the chain, which is
 *  the same line nameablePath() draws. */
function projectionTail(n) {
    const p = n.parent;
    if (p === undefined)
        return null;
    if (ts.isNonNullExpression(p) || ts.isParenthesizedExpression(p) || ts.isAsExpression(p))
        return projectionTail(p);
    if (ts.isPropertyAccessExpression(p) && p.expression === n) {
        const rest = projectionTail(p);
        return rest === null ? p.name.text : `${p.name.text}.${rest}`;
    }
    if (ts.isElementAccessExpression(p) && p.expression === n) {
        const idx = p.argumentExpression;
        if (idx === undefined || !(ts.isNumericLiteral(idx) || ts.isStringLiteral(idx)))
            return null;
        const rest = projectionTail(p);
        const head = `[${idx.getText()}]`;
        return rest === null ? head : `${head}.${rest}`;
    }
    return null;
}
/** Extract read-paths + callees + residue errors from one body.
 *
 *  `inlinable` decides whether `<receiver>.<name>` is a computed `{ }` default to
 *  be INLINED (no cell to subscribe to) or an ordinary subscribable slot. It is
 *  passed in rather than read from the global name map so the decision can take
 *  the receiver into account; omitted (method summaries, whose frame is unknown
 *  until rebased) it falls back to the name-only test.
 *
 *  `extraRoots` names identifiers that are reactive ROOTS for this body beyond the
 *  three scope nouns — a `script { }` function's parameters, whose reads rebase
 *  onto the call site's arguments rather than onto a receiver. */
function extractBody(sf, locals, inlinable, extraRoots, bodyPos) {
    const reads = new Set();
    const calls = [];
    const errors = [];
    const roots = extraRoots ?? EMPTY_ROOTS;
    const isReactiveRootId = (n) => (ts.isIdentifier(n) && (SCOPE_ROOTS.has(n.text) || roots.has(n.text)) && !locals.has(n.text)) || n.kind === ts.SyntaxKind.ThisKeyword;
    // ── the alias/closure door (see DYNAMIC above): which LOCALS may carry
    // cells. Two ways a cell-bearing value lands in a local the chain classifier
    // cannot see through: a `const`/`let` whose initializer touches reactive
    // state and is not provably a plain value, and an iterator closure's
    // parameter (the elements of whatever reactive chain the iterator ran
    // over). A property read rooted at either marks the body DYNAMIC — unless
    // the read is itself a pure projection (`.length`, `.toFixed(…)`, a further
    // iterator), which reaches no cell of its own.
    const dynamicRoots = new Set();
    {
        /** Provably a VALUE: literals, template strings, arithmetic/comparison
         *  (operators destroy node-ness), pure-method calls. `||`/`??`/`?:` pass
         *  their operands through, so they are value-like only when both sides are. */
        const valueLike = (e) => {
            if (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e))
                return valueLike(e.expression);
            if (ts.isStringLiteralLike(e) || ts.isNumericLiteral(e) || ts.isTemplateExpression(e))
                return true;
            if (e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword || e.kind === ts.SyntaxKind.NullKeyword)
                return true;
            if (ts.isPrefixUnaryExpression(e) || ts.isPostfixUnaryExpression(e) || ts.isTypeOfExpression(e))
                return true;
            if (ts.isBinaryExpression(e)) {
                const op = e.operatorToken.kind;
                if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.QuestionQuestionToken)
                    return valueLike(e.left) && valueLike(e.right);
                return true;
            }
            if (ts.isConditionalExpression(e))
                return valueLike(e.whenTrue) && valueLike(e.whenFalse);
            if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && PURE_METHODS.has(e.expression.name.text))
                return true;
            return false;
        };
        /** Does this subtree read reactive state at all? A local built from
         *  inert material (`new Map()`, a literal) can carry no cell. */
        const touchesReactive = (e) => {
            let hit = false;
            const v = (n) => {
                if (hit)
                    return;
                if (n.kind === ts.SyntaxKind.ThisKeyword) {
                    hit = true;
                    return;
                }
                if (ts.isIdentifier(n) && (SCOPE_ROOTS.has(n.text) || roots.has(n.text)) && !isNamePosition(n)) {
                    hit = true;
                    return;
                }
                ts.forEachChild(n, v);
            };
            v(e);
            return hit;
        };
        // pass 1: cell-capable const/let aliases
        const scan1 = (n) => {
            if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer !== undefined
                && touchesReactive(n.initializer) && !valueLike(n.initializer)) {
                dynamicRoots.add(n.name.text);
            }
            ts.forEachChild(n, scan1);
        };
        scan1(sf);
        // pass 2: iterator-closure parameters over a reactive (or aliased) chain
        const scan2 = (n) => {
            if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ITER.has(n.expression.name.text)) {
                const b = baseOfChain(n.expression.expression);
                const overReactive = b.kind === ts.SyntaxKind.ThisKeyword
                    || (ts.isIdentifier(b) && (SCOPE_ROOTS.has(b.text) || roots.has(b.text) || dynamicRoots.has(b.text)));
                if (overReactive) {
                    for (const a of n.arguments) {
                        if ((ts.isArrowFunction(a) || ts.isFunctionExpression(a))) {
                            for (const p of a.parameters)
                                if (ts.isIdentifier(p.name))
                                    dynamicRoots.add(p.name.text);
                        }
                    }
                }
            }
            ts.forEachChild(n, scan2);
        };
        scan2(sf);
    }
    const baseOf = (n) => {
        let c = n;
        while (ts.isPropertyAccessExpression(c) || ts.isElementAccessExpression(c) || ts.isCallExpression(c) || ts.isNonNullExpression(c) || ts.isParenthesizedExpression(c))
            c = c.expression;
        return c;
    };
    const isChainInterior = (n) => {
        const p = n.parent;
        return !!p && ((ts.isPropertyAccessExpression(p) && p.expression === n) || (ts.isElementAccessExpression(p) && p.expression === n) || (ts.isCallExpression(p) && p.expression === n) || ts.isNonNullExpression(p));
    };
    const recordRead = (node, base) => {
        if (node === base)
            return;
        reads.add(pathTextOf(node));
    };
    /** A bare-identifier call whose callee is a `script { }` function. Post-resolution
     *  a bare name in a body can only be module scope — a member would have been
     *  spelled `this.…` — so this is unambiguous. Recorded with the argument PATHS,
     *  which are the frame its body's reads rebase onto. */
    const noteScriptCall = (call) => {
        const callee = call.expression;
        if (!ts.isIdentifier(callee) || locals.has(callee.text) || !SCRIPT_FUNCTIONS.has(callee.text))
            return;
        calls.push({ kind: "script", name: callee.text, args: call.arguments.map((a) => nameablePath(a)), projected: isProjected(call), tail: projectionTail(call) });
    };
    const classifyChain = (top) => {
        const base = baseOf(top);
        const reactive = isReactiveRootId(base);
        let n = top;
        const segs = [];
        while (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n) || ts.isCallExpression(n) || ts.isNonNullExpression(n) || ts.isParenthesizedExpression(n)) {
            segs.push(n);
            if (ts.isCallExpression(n)) {
                noteScriptCall(n);
                for (const a of n.arguments)
                    walk(a);
            }
            if (ts.isElementAccessExpression(n) && n.argumentExpression)
                walk(n.argumentExpression);
            n = n.expression;
        }
        // A chain can BOTTOM OUT in an EXPRESSION rather than a scope root —
        // `new Box(app).v`, and just as commonly the defensive-default idiom
        // `(chain || fallback).reduce(…)`: the parenthesized descent stops at the
        // BinaryExpression, so the base is no reactive root and the classify
        // returns — while walk() skips chain interiors, trusting classifyChain to
        // have consumed them. Unless the base is handed back to walk() here, every
        // dep inside it SILENTLY vanishes: measured, `(app.d.value.list ||
        // []).length` extracted no dataset dep at all, which is how the Files
        // strip's row width froze at its first-column value while the columns
        // grew. Identifiers and `this` are the ordinary roots the classifier
        // already judged; everything else gets walked.
        if (!ts.isIdentifier(n) && n.kind !== ts.SyntaxKind.ThisKeyword)
            walk(n);
        if (!reactive) {
            // the alias/closure door: a chain rooted at a local that may CARRY
            // cells — a read through it is real but unnameable, so the body goes
            // DYNAMIC (tracking path) instead of silently dropping the edge. A pure
            // projection off the alias (`.length`, `.toFixed(…)`, a further
            // iterator whose own closure params are handled by pass 2) reaches no
            // cell of its own and keeps the static path.
            if (ts.isIdentifier(base) && dynamicRoots.has(base.text)) {
                const s0 = segs.length > 0 ? segs[segs.length - 1] : null;
                const nm = s0 !== null && ts.isPropertyAccessExpression(s0) ? s0.name.text : null;
                const pureTail = nm !== null && (nm === "length" || PURE_METHODS.has(nm) || ITER.has(nm));
                if (!pureTail)
                    reads.add(DYNAMIC);
            }
            return;
        }
        const ordered = [...segs].reverse();
        let pathEnd = base;
        for (const s of ordered) {
            if (ts.isPropertyAccessExpression(s) && s.parent && ts.isCallExpression(s.parent) && s.parent.expression === s)
                continue;
            if (ts.isPropertyAccessExpression(s) && NODE_SLOTS.has(s.name.text) && s !== ordered[ordered.length - 1]) {
                // L-20: a chain THROUGH a node-typed slot. The slot read is the wired
                // edge (repointing wakes every reader); everything beyond rides the
                // tracking path — a prewired edge would pin the previous node's cells.
                // Placed BEFORE the computed-default arm: a pointer slot with a { }
                // default is both, and inlining would silently drop the tail (L-29).
                reads.add(pathTextOf(s));
                reads.add(DYNAMIC);
                pathEnd = base;
                break;
            }
            if (ts.isPropertyAccessExpression(s) && COMPUTED_DEFAULTS.has(s.name.text)
                && (inlinable === undefined || inlinable(pathTextOf(s.expression), s.name.text))) {
                // A read of a computed `{ }` default is a formula: inline it like a method
                // call so its (branch-union) deps become ours. AND record the slot itself
                // (GitHub #20): the formula only answers while the slot is UNPROVIDED — a
                // decl default yields to a direct write (`app.retagFilenames = …`, the
                // default-until-edited pattern), and that write fires the slot's cell,
                // which the runtime getter tracks on every read. Inlining alone dropped
                // that edge, so a constraint over a written-to defaulted slot went
                // silently stale. An extra edge while the default still answers is the
                // file's standard over-approximation — a no-op wake, never a miss.
                // A computed default takes no arguments and is inlined at the read, so it
                // is never "projected through a returned parameter" — there are none.
                calls.push({ kind: "method", name: s.name.text, receiver: pathTextOf(s.expression), args: [], projected: false, tail: null, body: bodyPos });
                reads.add(pathTextOf(s));
                pathEnd = base;
                break;
            }
            if (ts.isPropertyAccessExpression(s)) {
                // NOTE — reading the child ARRAY itself (`this.wins.children`) wires
                // nothing: `children` is a plain array with no cell behind it, so the
                // read is frozen at link time. `.map` over it IS refused above as
                // unbounded aggregation, but a plain walk is NOT refused here, and
                // deliberately so: the desktop's `windowItems(seq, front)` walks
                // `wins.children` imperatively while taking its re-derive hooks as
                // ARGUMENTS (desktop.declare §"the menus constraint … visibly reads
                // them"), which is the author bounding the reactivity by hand rather
                // than asking the compiler to guess. Refusing every `children` read
                // would reject that idiom. `childViews` is the reactive alternative
                // when the author wants the wake-up instead of supplying it.
                pathEnd = s;
            }
            else if (ts.isElementAccessExpression(s)) {
                const idx = s.argumentExpression;
                if (idx && (ts.isNumericLiteral(idx) || ts.isStringLiteral(idx))) {
                    pathEnd = s;
                }
                else {
                    if (isPureNodeNav(s.expression))
                        errors.push(new DepError(`computed attribute — this[<expr>] selects a slot at runtime; name it, or bound the key's type`, s.getStart()));
                    break;
                }
            }
            else if (ts.isCallExpression(s)) {
                const callee = s.expression;
                recordRead(pathEnd, base);
                if (ts.isPropertyAccessExpression(callee)) {
                    const m = callee.name.text;
                    const recv = callee.expression;
                    const recvName = ts.isPropertyAccessExpression(recv) ? recv.name.text : (ts.isIdentifier(recv) ? recv.text : null);
                    if (m === "read") {
                        const a0 = s.arguments[0];
                        const staticArr = a0 && ts.isArrayLiteralExpression(a0) && a0.elements.every((e) => ts.isStringLiteral(e) || ts.isNumericLiteral(e));
                        // A literal RFC 6901 pointer string (B2's interop spelling) is as
                        // static as the array form — the probe evaluates it identically.
                        const staticPtr = a0 && ts.isStringLiteral(a0) && a0.text.startsWith("/");
                        if (staticArr || staticPtr)
                            reads.add(`${pathTextOf(recv)}.read(${a0.getText()})`);
                        else
                            errors.push(new DepError(`dynamic datapath — read([<expr>]) resolves the region at runtime; use a literal path`, s.getStart()));
                    }
                    else if (m === "$data" && recv.kind === ts.SyntaxKind.ThisKeyword) {
                        // The compiled form of a datapath island (compile.ts resolveBody):
                        // `this.$data(["a","b"])` ≡ `:a.b`, and a selector plan
                        // (`this.$data(["rows",{"s":[2,8,null]}])` ≡ `:rows[2:8]`) —
                        // recorded in the same `:path` read currency (bind.ts keeps
                        // region reads on the tracking path, and rebase() already leaves
                        // `:` paths alone: cursor-relative, not noun-relative). A
                        // non-literal plan is refused exactly like read([<expr>]) — the
                        // same dynamic-datapath rule.
                        const a0 = s.arguments[0];
                        const text = a0 && ts.isArrayLiteralExpression(a0) ? planLiteralText(a0)
                            : a0 && ts.isStringLiteral(a0) ? splitPath(a0.text).join(".") : null;
                        if (text !== null)
                            reads.add(":" + text);
                        else
                            errors.push(new DepError(`dynamic datapath — $data(<expr>) resolves the region at runtime; use a literal path`, s.getStart()));
                    }
                    else if (ITER.has(m)) {
                        if (recvName && NODE_COLLECTIONS.has(recvName))
                            errors.push(new DepError(`aggregation over a reactive node collection (.${recvName}.${m}) — a data-dependent number of slots; derive from data`, s.getStart()));
                    }
                    else if (PURE_METHODS.has(m)) { /* pure projection */ }
                    else if (USER_METHODS.has(m))
                        calls.push({ kind: "method", name: m, receiver: pathTextOf(recv), args: s.arguments.map((a) => nameablePath(a)), projected: isProjected(s), tail: projectionTail(s), body: bodyPos });
                    else if (LANGUAGE_METHOD_EFFECTS.has(m)) {
                        // A language-supplied method with a DECLARED reactive effect
                        // (effects.ts): union its read-paths, rebased to this receiver — as
                        // analyzable as following a user method's body, not a residue.
                        for (const rp of LANGUAGE_METHOD_EFFECTS.get(m))
                            reads.add(rebase(rp, pathTextOf(recv)));
                    }
                    else if (roots !== undefined && recv !== undefined && roots.has(pathTextOf(recv).split(/[.[]/, 1)[0])) {
                        // A member call on a PARAMETER (the phase-4 half-close): its reads
                        // stay untracked, exactly as before params became roots — the
                        // lenient tier, matching close()'s frame.lenient.
                    }
                    else
                        errors.push(new DepError(`unresolved call target .${m}() — its reads can't be analyzed; call an in-program method or a pure builtin`, s.getStart()));
                }
                else if (ts.isIdentifier(callee)) {
                    const nm = callee.text;
                    if (CONSTRUCTORS.has(nm) || GLOBALS.has(nm) || locals.has(nm) || SCRIPT_FUNCTIONS.has(nm)) { /* pure, or already recorded by noteScriptCall */ }
                    else if (USER_METHODS.has(nm))
                        calls.push({ kind: "method", name: nm, receiver: "this", args: s.arguments.map((a) => nameablePath(a)), projected: isProjected(s), tail: projectionTail(s), body: bodyPos });
                    else if (LANGUAGE_METHOD_EFFECTS.has(nm)) {
                        for (const rp of LANGUAGE_METHOD_EFFECTS.get(nm))
                            reads.add(rebase(rp, "this"));
                    }
                    else
                        errors.push(new DepError(`unresolved call target ${nm}() — its reads can't be analyzed`, s.getStart()));
                }
                pathEnd = base;
                break;
            }
        }
        recordRead(pathEnd, base);
    };
    function walk(n) {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && (n.expression.text === "$DP0" || n.expression.text === "$DPM")) {
            if (n.expression.text === "$DPM")
                errors.push(new DepError(`a many-path (:arr[]) replicates — it cannot be read in a { } body`, n.getStart()));
            else
                reads.add(":" + n.arguments[0].text); // .text is the unquoted path
            return;
        }
        if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && !locals.has(n.expression.text) && SCRIPT_CLASSES.has(n.expression.text)) {
            // `new` of a script class: OPAQUE, like a script call — the instance is a
            // value, and the arguments' reads are the dependency (walked here).
            if (n.arguments)
                for (const a of n.arguments)
                    walk(a);
            return;
        }
        if ((ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n) || ts.isCallExpression(n)) && !isChainInterior(n)) {
            classifyChain(n);
            return;
        }
        if (ts.isIdentifier(n) && !locals.has(n.text) && !isNamePosition(n)) {
            // A bare identifier that reaches here is a VALUE reference: not a callee
            // (classifyChain consumes a chain's callee without walking it), not a
            // property or declaration name (isNamePosition), not a local.
            if (SCRIPT_MUTABLE.has(n.text)) {
                errors.push(new DepError(`'${n.text}' is mutable state in a script { } block — a module variable has no cell, so nothing can notice it change; hold the value in a reactive attribute (declare it on the app) and read that instead`, n.getStart()));
            }
            else if (SCRIPT_FUNCTIONS.has(n.text)) {
                calls.push({ kind: "scriptValue", name: n.text });
            }
            return;
        }
        ts.forEachChild(n, walk);
    }
    walk(sf);
    return { reads, calls, errors };
}
let USER_METHODS = new Map();
let METHODS_OF = new Map(); // element → its declared methods
let METHOD_EL_ID = new Map(); // element → stable summary-key id
let CLASS_EL = new Map(); // class name → its body element
let CLASS_BASE = new Map(); // class name → base class name
// The program's `script { }` module scope, split by what the extractor can do
// with each name: FUNCTIONS are followed (phase 4 — the fourth analyzable callee
// kind), CLASSES and MUTABLE bindings are refused where a constraint reaches them.
let SCRIPT_FUNCTIONS = new Map();
let SCRIPT_MUTABLE = new Set();
let SCRIPT_CLASSES = new Set();
const EMPTY_ROOTS = new Set();
/** The L-21 oracle (typecheck.ts): the checker's receiver types, per compile. */
let ORACLE = null;
/** Component-typed DECL names (L-20 pointer slots): a chain THROUGH one keeps
 *  the slot as its wired edge and sends the rest to the tracking path — a
 *  prewired edge would pin the PREVIOUS node's cells across a repoint.
 *  Name-keyed (a sound over-approximation, like every name-keyed gate here). */
let NODE_SLOTS = new Set();
const COMPONENT_TAGS = new Set(Object.keys(SCHEMAS));
// Computed `{ }` DECL DEFAULTS (`name: type = { … }`) by name. Unlike a `name =
// { … }` ATTRIBUTE (a standing constraint that owns a cell), a computed default has
// NO cell — it is evaluated inline on each read, its reads flowing to the reader.
// So reading one is not a subscribable edge; it must be INLINED like a zero-arg
// method call, unioning its (branch-union) deps. Keyed by name (as methods are);
// same-named defaults on different elements union — a sound over-approximation.
let COMPUTED_DEFAULTS = new Map();
// WHICH element owns each computed `{ }` default, so the inline decision can be
// made against the RECEIVER rather than the bare name. Without this, a name
// declared on an inner view shadows the same name on the app: a read of
// `app.colA` matches the inner `colA` and inlines that formula — into itself, in
// the constraint that defines it — and the real edge to the app's slot is lost.
// Silent and wrong: extraction "succeeds", the slot never re-fires
// (open-items.md L-17).
let DEFAULT_OWNERS = new Map(); // attr name → elements declaring it as a computed default
let PARENT_OF = new Map(); // element → its parent element (instance tree only)
let PROGRAM_ROOT = null;
/** The element a receiver path names, when that is statically knowable.
 *  `undefined` = not knowable (a `parent` inside a class body is the USE site,
 *  which varies per instantiation), and the caller must stay conservative. */
/** One member step in a receiver path: a NAMED child instance, or a declared
 *  slot whose TYPE names a program class (`frontWin: Window` — the instance
 *  lives elsewhere, but the type says whose methods apply). */
function memberElementOf(el, seg) {
    if (el === null || typeof el !== "object")
        return undefined;
    const e = el;
    for (const c of e.children ?? [])
        if (c.name === seg)
            return c;
    for (const d of e.decls ?? [])
        if (d.name === seg && CLASS_EL.has(d.type))
            return CLASS_EL.get(d.type);
    return undefined;
}
/** Resolve a full receiver PATH (`this.root.launcher`, `classroot.spring`) to
 *  the element it addresses, walking named members and class-typed decls.
 *  `undefined` = not statically knowable (an indexed step, a parameter, a
 *  `parent` inside a class body) — the caller stays conservative. */
function receiverElementDeep(receiver, owner, classRoot) {
    const p = receiver.replace(/(\.root)+/g, ".root");
    if (/[[()]/.test(p))
        return undefined; // indexed / call steps: not a static path
    const segs = p.split(".");
    let base;
    let i;
    if (segs[0] === "this" && segs[1] === "root") {
        base = PROGRAM_ROOT;
        i = 2;
    }
    else if (segs[0] === "this") {
        base = owner;
        i = 1;
    }
    else if (segs[0] === "classroot") {
        base = classRoot ?? undefined;
        i = 1;
    }
    else if (segs[0] === "parent" && classRoot == null) {
        base = PARENT_OF.get(owner);
        i = 1;
    }
    else
        return undefined;
    for (; base !== undefined && i < segs.length; i++)
        base = memberElementOf(base, segs[i]);
    return base;
}
/** WHOSE method a resolved receiver's `.name()` reaches: the element's own
 *  declaration first (instance methods), then up its class chain (`tag` →
 *  class body → base …). `undefined` = the element is knowable but carries no
 *  such method anywhere — a name that collides with a different family
 *  (an Animator's `start`, a library class's verb) and is NOT this call. */
function methodHome(el, name) {
    if (METHODS_OF.get(el)?.has(name))
        return el;
    let tag = el?.tag;
    const seen = new Set();
    while (tag !== undefined && !seen.has(tag)) {
        seen.add(tag);
        const ce = CLASS_EL.get(tag);
        if (ce !== undefined && METHODS_OF.get(ce)?.has(name))
            return ce;
        tag = CLASS_BASE.get(tag);
    }
    return undefined;
}
function receiverElement(receiver, owner, classRoot) {
    const p = receiver.replace(/(\.root)+/g, ".root");
    if (p === "this")
        return owner;
    if (p === "this.root")
        return PROGRAM_ROOT; // `app.x` resolves here
    if (p === "classroot")
        return classRoot ?? undefined;
    if (p === "parent") {
        if (classRoot != null)
            return undefined; // inside a class: the use site is unknown
        return PARENT_OF.has(owner) ? PARENT_OF.get(owner) : undefined;
    }
    return undefined;
}
/** Move one path out of a summary's frame into the caller's. */
function rebaseIn(path, frame) {
    if (path === DYNAMIC)
        return { ok: true, path }; // the sentinel crosses every frame unchanged
    const root = path.split(/[.[]/, 1)[0];
    if (frame.map.has(root)) {
        const arg = frame.map.get(root);
        if (arg === null) {
            return { ok: false, error: new DepError(frame.asValue
                    ? `${frame.who} is passed as a value, but its body reads through its '${root}' parameter — those reads can't be wired without a call site to name them; call ${frame.who}(…) here instead`
                    : `${frame.who}(…) reads through its '${root}' parameter, but the argument passed for it is not a nameable path — pass the node or slot by name (app.card, this.item) so the read can be wired`) };
        }
        return { ok: true, path: arg + path.slice(root.length) };
    }
    if (frame.receiver !== null)
        return { ok: true, path: rebase(path, frame.receiver) };
    return { ok: false, error: new DepError(`'${root}' inside script function ${frame.who}() — a script block is module scope, not a node: it has no this/parent/classroot; take the node as a parameter`) };
}
/** The STATIC paths a body hands back — `return this.box` → ["this.box"], and
 *  both arms of `return c ? this.a : this.b`.
 *
 *  This is what makes `pickBox().width` wirable. Following into the body records
 *  `this.box` — the node — and a node reference never changes; `.width` is a
 *  different cell entirely, so the constraint was subscribed to the folder while
 *  caring about a file inside it, and went silently stale. With the path in hand
 *  the call site can append its own tail and wire `<receiver>.box.width`.
 *
 *  Only nameable paths qualify. `return this.children.filter(…)[0]` picks a node
 *  at runtime and yields null here — which is correct, and leaves that shape to
 *  the refusal below rather than wiring something untrue. Collecting BOTH arms of
 *  a conditional over-approximates on purpose: an extra dependency costs a
 *  recomputation, a missing one costs correctness. */
function returnedPaths(sf, locals, params = []) {
    const out = [];
    const viaParam = [];
    let opaque = false;
    const take = (e) => {
        if (e === undefined)
            return;
        if (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e))
            return take(e.expression);
        if (ts.isConditionalExpression(e)) {
            take(e.whenTrue);
            take(e.whenFalse);
            return;
        }
        const path = nameablePath(e);
        if (path === null) {
            opaque = true;
            return;
        }
        const head = path.split(/[.[]/)[0];
        // A PARAMETER is resolvable after all — not here, but at the call site, which
        // knows what it passed. Recorded by name so the join can map it onto the
        // argument. This is the case the old gate refused as "not knowable"; it is
        // knowable, as a finite candidate set, exactly like a conditional's arms.
        if (params.includes(head)) {
            viaParam.push(path);
            return;
        }
        // any other local is a name the call site never wrote — unrebasable
        if (locals.has(head)) {
            opaque = true;
            return;
        }
        out.push(path);
    };
    const walk = (n) => {
        if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n))
            return; // a nested function's return is its own
        if (ts.isReturnStatement(n))
            take(n.expression);
        if (ts.isArrowFunction(n) && !ts.isBlock(n.body))
            return; // concise body belongs to that arrow
        ts.forEachChild(n, walk);
    };
    walk(sf);
    return { paths: [...new Set(out)], viaParam: [...new Set(viaParam)], opaque };
}
/** Could a projection off this return type reach a CELL?
 *
 *  The rule is determinability — every cell a constraint can reach must be
 *  nameable at compile time — and this is the EVIDENCE for whether any cell is
 *  reachable at all. It is not a special case for nodes; it is the only static
 *  signal there is.
 *
 *  Measured before it was written this way. The stricter reading — refuse unless
 *  the return is provably a snapshot — refuses correct code at scale: the tracker
 *  and calendar do `issuesOf(rev).length`, `eventsOn(d).map`, `collapsedSet().includes`,
 *  and `.length`/`.map`/`.find` on an array reach no cell whatever the array holds.
 *  `array` and `object` are simply too coarse to separate data from a carrier, so
 *  treating them as suspicious costs four refusals of working code and buys
 *  nothing.
 *
 *  So: a capitalized type names a component, whose attributes are cells; the
 *  lowercase value types and `Color` are data. That is the language's own naming
 *  rule, not a list to maintain.
 *
 *  KNOWN LIMIT, and the honest cost of this being the only evidence available:
 *  `wrap(): object { return { box: this.box } }` with `wrap().box.width` reaches
 *  a cell through a value type and is NOT refused. Narrower than the hole this
 *  replaced, and it wants a real answer — the reachability of a cell through a
 *  composite — rather than a wider guess here. */
function mayCarryCells(returns) {
    if (returns === undefined)
        return false; // unannotated: no evidence, no refusal
    const t = returns.replace(/\?$/, "").trim();
    if (t === "Color")
        return false; // capitalized, but data
    return /^[A-Z]/.test(t);
}
const NO_RET = { paths: [], viaParam: [], opaque: false };
const NO_PARAMS = { params: [], returned: new Set() };
function buildMethodSummaries() {
    const own = new Map();
    // A METHOD's parameters stay opaque locals, so its frame is the receiver alone.
    //
    // KNOWN HOLE, deliberately left — and it is the PARAMETER door only. The
    // RETURN door (a method hands back a node and the caller reads an attribute
    // off it) was silently open beside it until 2026-08-03; it is closed now, by
    // returnedPaths() above and the projection join in follow1. Naming both here
    // because this comment read as though the whole subject had been considered,
    // and a cold reader found the other half in under an hour.
    //
    // The remaining hole: pass a node to a method and the body's
    // `node.title` is a real edge the extractor drops — the same missed edge phase 4
    // closes for `script { }`, in the older door
    // (`{ app.vOf(app) + app.w }` with `vOf(n) { return n.v }` wires only `w`, and
    // goes stale). The machinery below already generalizes — a method summary need
    // only take its parameters as roots, exactly as the script summaries do — but
    // turning it on refuses live code in three shipped apps (desktop, inspector,
    // component-sampler), where helpers read attributes off nodes picked at runtime
    // out of `.children.filter(…)`. Those reads genuinely cannot be wired; closing
    // this door is a migration of its own, not a side effect of phase 4.
    for (const [name, { params, body, pos }] of USER_METHODS) {
        const sf = parseBody(body, false);
        if (!sf) {
            own.set(name, { reads: new Set(), calls: [], errors: [], ...NO_PARAMS, ret: NO_RET });
            continue;
        }
        const locals = collectLocals(sf, params);
        // PHASE-4 HOLE, HALF-CLOSED (2026-08-06; found 2026-07-27): parameters
        // are reactive ROOTS, as script summaries below — `vOf(n){ return n.v }`
        // now wires `n.v` through the frame instead of silently dropping it (the
        // constraint went permanently stale before). The script tier's ESCAPE
        // refusal is deliberately NOT applied to methods: six shipped files
        // (desktop, inspector, sampler, tracker, datagrid, table) pass params
        // through closures/builders in ways the tracer can't follow, and refusing
        // them is a migration of its own (measured 2026-08-06 — the full refusal
        // list is in that day's session notes). An escaped param's reads stay
        // exactly as untracked as before this change; the COMMON shape — plain
        // property reads off a parameter — is what now wires.
        const roots = new Set(params);
        for (const par of roots)
            locals.delete(par);
        const d = extractBody(sf, locals, undefined, roots, pos);
        own.set(name, { ...d, params, returned: new Set(),
            ret: returnedPaths(sf, locals, params), returns: USER_METHODS.get(name)?.returns });
    }
    // The TYPED residences (the `open` collision): the same summaries, keyed by
    // (declaring element, name) instead of name alone, so follow1 can hand a
    // call the body its receiver actually reaches. The name-keyed map above
    // stays for what it is still right about — the classification gate, the
    // computed-defaults merge, and the last-resort fallback.
    const ownEl = new Map();
    for (const [el, mm] of METHODS_OF) {
        for (const [name, { params, body, returns, pos }] of mm) {
            const key = METHOD_EL_ID.get(el) + ":" + name;
            const sf = parseBody(body, false);
            if (!sf) {
                ownEl.set(key, { reads: new Set(), calls: [], errors: [], ...NO_PARAMS, ret: NO_RET });
            }
            else {
                const locals = collectLocals(sf, params);
                const roots = new Set(params);
                for (const par of roots)
                    locals.delete(par);
                const d = extractBody(sf, locals, undefined, roots, pos);
                ownEl.set(key, { ...d, params, returned: new Set(), ret: returnedPaths(sf, locals, params), returns });
            }
        }
    }
    // The L-21 bridges (RULED 2026-09-01, TS semantics): instance-method
    // summaries indexed by their body's `{` position (how the oracle names an
    // instance method), and the class tree inverted for the OVERRIDE CLOSURE —
    // a receiver statically typed C may hold any descendant of C at runtime, so
    // C's family is the sound, bounded candidate set. Never a stranger's body.
    const byBrace = new Map();
    for (const [el, mm] of METHODS_OF) {
        for (const [name, entry] of mm) {
            if (entry.pos !== undefined)
                byBrace.set(entry.pos.line + ":" + entry.pos.col + ":" + name, METHOD_EL_ID.get(el) + ":" + name);
        }
    }
    const subclasses = new Map();
    for (const [cls, base] of CLASS_BASE) {
        const l = subclasses.get(base);
        if (l)
            l.push(cls);
        else
            subclasses.set(base, [cls]);
    }
    const overridesOf = (cls, name, into) => {
        for (const d of subclasses.get(cls) ?? []) {
            const del = CLASS_EL.get(d);
            if (del !== undefined && METHODS_OF.get(del)?.has(name))
                into.add(METHOD_EL_ID.get(del) + ":" + name);
            overridesOf(d, name, into);
        }
    };
    // Computed `{ }` defaults join the same callable graph — a default's body is an
    // EXPRESSION (parseBody expr-mode), and same-named defaults union into one summary.
    for (const [name, bodies] of COMPUTED_DEFAULTS) {
        for (const body of bodies) {
            const sf = parseBody(body.src, true);
            // Resolved against the element that DECLARES this default — otherwise a
            // default reading the app's same-named slot inlines itself, the recursion
            // guard returns nothing, and the edge vanishes (L-17).
            const inlinable = (receiver, nm) => {
                const el = receiverElement(receiver, body.owner, body.classRoot);
                if (el === undefined)
                    return true;
                return DEFAULT_OWNERS.get(nm)?.has(el) === true;
            };
            const d = sf ? extractBody(sf, collectLocals(sf, []), inlinable, undefined, body.pos) : { reads: new Set(), calls: [], errors: [] };
            const ex = own.get(name);
            if (ex) {
                for (const r of d.reads)
                    ex.reads.add(r);
                ex.calls.push(...d.calls);
                ex.errors.push(...d.errors);
            }
            else
                own.set(name, { ...d, ...NO_PARAMS, ret: sf ? returnedPaths(sf, collectLocals(sf, [])) : NO_RET });
        }
    }
    // `script { }` functions are OPAQUE (the 2026-08-24 ruling: reactivity lives
    // only in Declare syntax; script is wholly outside the reactive system). A
    // script call from a constraint depends on the Declare VALUES the call site
    // passes — the argument expressions' own reads, which extractBody already
    // records — and the compiler never reads the function's body. That is what
    // lets a script block hold arbitrary TypeScript (state, imports, libraries):
    // nothing here needs to understand it. The one refusal this contract needs
    // lives in follow1 below: an argument that IS a node, whose reference never
    // changes.
    const memo = new Map();
    /** Close over one summary in a caller's frame: rebase its reads, then follow
     *  its own callees with their receivers and arguments rebased too. */
    const close = (o, frame, stack, ctx) => {
        const reads = new Set();
        const errors = [...o.errors];
        for (const r of o.reads) {
            const m = rebaseIn(r, frame);
            if (m.ok)
                reads.add(m.path);
            else if (frame.lenient !== true)
                errors.push(m.error);
        }
        // An argument path moved one frame out. Unnameable there is not yet an error —
        // it only becomes one if the callee actually reads through that parameter.
        const out = (a) => {
            if (a === null)
                return null;
            const m = rebaseIn(a, frame);
            return m.ok ? m.path : null;
        };
        for (const c of o.calls) {
            let sub;
            if (c.kind === "scriptValue")
                sub = follow1(c, stack, ctx);
            else if (c.kind === "method") {
                const m = rebaseIn(c.receiver, frame);
                if (!m.ok) {
                    errors.push(m.error);
                    continue;
                }
                sub = follow1({ ...c, receiver: m.path, args: c.args.map(out) }, stack, ctx);
            }
            else {
                sub = follow1({ ...c, args: c.args.map(out) }, stack, ctx);
            }
            for (const r of sub.reads)
                reads.add(r);
            for (const e of sub.errors)
                errors.push(e);
        }
        return { reads, errors };
    };
    /** A callee that hands one of its own parameters back as the result is only safe
     *  while the caller doesn't read *through* that result: `pick(a, b)` is fine,
     *  `pick(a, b).title` reads an attribute of whichever node came back, and the
     *  extractor cannot know which. */
    /** RETIRED 2026-08-03, kept as a note. This refused every projected call whose
     *  callee handed back a parameter — "which node's attribute that is isn't
     *  knowable here". It is knowable: the call site passed the arguments, so the
     *  candidates are finite, and wiring all of them is the same over-approximation
     *  a conditional's arms already get. The join below wires what resolves and
     *  refuses only an argument that is not a nameable path, which is the case this
     *  gate was actually protecting against. */
    const projectionGate = (_o, _c) => [];
    const follow1 = (c, stack, ctx) => {
        // SCRIPT calls: opaque. The arguments' reads were recorded at the call
        // site; the body contributes nothing. The one unsound shape is refused: an
        // argument that resolves to a NODE — its reference never changes, so any
        // field the function reads off it would go permanently stale, silently.
        if (c.kind === "script") {
            const errors = [];
            if (ctx !== null) {
                for (const a of c.args) {
                    if (a === null)
                        continue;
                    if (receiverElementDeep(a, ctx.owner, ctx.classRoot) !== undefined) {
                        errors.push(new DepError(`${c.name}(…) is passed the node '${a}' — a script call is opaque: this constraint depends on the VALUES it passes, and a node reference never changes, so the fields ${c.name}() reads would go permanently stale. Pass the attributes themselves (${c.name}(${a}.<attr>, …)), or make it a method — a method's parameter reads are analyzed at its call sites`));
                    }
                }
            }
            return { reads: new Set(), errors };
        }
        // A script function handed around as a VALUE (`rows.map(fmt)`): opaque too —
        // the receiver chain's own reads are what the constraint is wired to.
        if (c.kind === "scriptValue")
            return { reads: new Set(), errors: [] };
        let o;
        let tag;
        if (COMPUTED_DEFAULTS.has(c.name)) {
            // a computed-default read (or a name that doubles as one): the name-level
            // merged summary, exactly as before typed residences existed
            o = own.get(c.name);
            tag = "m:" + c.name;
        }
        else {
            // TYPED RESIDENCE (the `open` collision): resolve the receiver to an
            // element and ask WHOSE method this call reaches. Three outcomes:
            //   hit  — that summary alone (a combobox's `this.open()` never again
            //          follows an unrelated node verb of the same name);
            //   miss — the receiver is knowable and carries NO such method up its
            //          chain: a same-named call in a different family (a builtin's
            //          verb, a cast receiver) — not ours, contribute nothing;
            //   unknown — TS SEMANTICS (L-21, RULED 2026-09-01): the CHECKER answers.
            //          The oracle types the receiver from the typecheck's own
            //          ts.Program; only that family's bodies (declared class +
            //          override closure, or the exact instance method) are followed.
            //          A receiver TS calls `any` sends the constraint to the runtime
            //          tracking path — the ~dynamic sentinel — where every real read
            //          is observed live. The old all-candidates union (sound for
            //          reads, but it exported OTHER classes' resolution errors into
            //          any program that merely reused a name) is gone.
            let homeKey;
            if (ctx !== null) {
                const el = receiverElementDeep(c.receiver, ctx.owner, ctx.classRoot);
                if (el !== undefined) {
                    const home = methodHome(el, c.name);
                    if (home === undefined)
                        return { reads: new Set(), errors: [] };
                    homeKey = METHOD_EL_ID.get(home) + ":" + c.name;
                }
            }
            if (homeKey !== undefined) {
                o = ownEl.get(homeKey);
                tag = homeKey;
            }
            else {
                const bp = c.kind === "method" ? c.body : undefined;
                const t = ORACLE !== null && bp !== undefined ? ORACLE.methodTargets(bp.line, bp.col, c.name) : null;
                if (t === null || t === "any")
                    return { reads: new Set([DYNAMIC]), errors: [] };
                const keys = new Set();
                for (const b of t.braces) {
                    const k = byBrace.get(b.line + ":" + b.col + ":" + c.name);
                    if (k !== undefined)
                        keys.add(k);
                }
                for (const cls of t.classes) {
                    const el = CLASS_EL.get(cls);
                    const home = el === undefined ? undefined : methodHome(el, c.name);
                    if (home !== undefined)
                        keys.add(METHOD_EL_ID.get(home) + ":" + c.name);
                    overridesOf(cls, c.name, keys);
                }
                // typed, and no user body anywhere in the family: a builtin's verb —
                // nothing to follow, nothing to wire (the hit arm's own miss answer)
                if (keys.size === 0)
                    return { reads: new Set(), errors: [] };
                const reads = new Set();
                const errors = [];
                for (const k of keys) {
                    const s2 = ownEl.get(k);
                    if (s2 === undefined)
                        continue;
                    const sub = followSummary(s2, k, c, stack, ctx);
                    for (const r of sub.reads)
                        reads.add(r);
                    errors.push(...sub.errors);
                }
                return { reads, errors };
            }
        }
        if (o === undefined)
            return { reads: new Set(), errors: [] };
        return followSummary(o, tag, c, stack, ctx);
    };
    const followSummary = (o, tag, c, stack, ctx) => {
        if (stack.has(tag))
            return { reads: new Set(), errors: [] };
        if (o.params === null) {
            return { reads: new Set(), errors: [new DepError(`script function ${c.name}() destructures a parameter — a read through it roots at a name the call site never wrote, so it can't be wired; take the value as a plain parameter and read through it (${c.name}(item) … item.title)`)] };
        }
        const asValue = c.kind === "scriptValue";
        const args = asValue ? null : c.args;
        const receiver = c.kind === "method" ? c.receiver : null;
        const key = `${tag}@${receiver ?? ""}(${args === null ? "*" : args.join(",")})`;
        // THE PROJECTION JOIN. The callee says what it hands back (`this.box`); the
        // call site says what it reads off it (`width`). Neither half is a dependency
        // on its own — following the body records the NODE, whose reference never
        // changes — so the two are joined here into the cell that actually moves:
        // `<receiver>.box.width`. Rebased through the receiver like every other read,
        // so a helper on a class works from any instance.
        // THE PROJECTION JOIN. The callee says what it hands back; the call site says
        // what it reads off it. Neither is a dependency alone — following the body
        // records the object, whose reference never changes, while the projection
        // reaches a cell — so the two are joined into the path that actually moves.
        //
        // The test is DETERMINABILITY, not what kind of thing came back: a constraint
        // is legal when every cell it can reach is nameable at compile time. Three
        // ways that holds, and one way it doesn't:
        //
        //   • a static path   `return this.box`         → <receiver>.box.<tail>
        //   • a conditional   `return c ? this.a : b`   → BOTH arms; over-approximating
        //                                                 costs a recomputation, under-
        //                                                 approximating costs correctness
        //   • a parameter     `return x`                → the ARGUMENT this call passed,
        //                                                 which the call site knows
        //   • anything else   `return kids[app.i]`      → the cell's identity depends on
        //                                                 runtime state; no finite set of
        //                                                 paths exists, so it is refused
        const projected = new Set();
        // TWO causes, and they answer differently. An unresolved PARAMETER is always
        // refused: the callee hands back one of its arguments, and if that argument
        // was not a nameable path there is no candidate set at all — the judgment the
        // old projectionGate made, kept. An OPAQUE return is refused only where a cell
        // could be reached, because `issuesOf(rev).length` is opaque and correct.
        let unresolvedParam = false;
        let opaqueReturn = false;
        if (c.kind !== "scriptValue" && c.tail !== null) {
            for (const rp of o.ret.paths)
                projected.add(`${rebase(rp, receiver)}.${c.tail}`);
            for (const rp of o.ret.viaParam) {
                // `x` or `x.inner` → the argument that was passed, plus the rest of the path
                const head = rp.split(/[.[]/)[0];
                const i = (o.params ?? []).indexOf(head);
                const arg = i >= 0 && args !== null ? args[i] ?? null : null;
                if (arg === null) {
                    unresolvedParam = true;
                    continue;
                }
                projected.add(`${rebase(arg + rp.slice(head.length), receiver)}.${c.tail}`);
            }
            if (o.ret.opaque)
                opaqueReturn = true;
        }
        // A body that returns a plain VALUE reaches no cell through the projection —
        // `listOf(k).length` is arithmetic on data the body already computed from its
        // reads, so those reads are the whole dependency and there is nothing to name.
        // Only a return that can carry reactive state can strand a cell.
        const carriesCells = c.kind !== "scriptValue" && mayCarryCells(o.returns);
        const tail = c.kind === "scriptValue" ? null : c.tail;
        // L-24 (RULED must-fix 2026-09-01): a projection whose subject cannot be
        // named at compile time — an opaque return, an unresolvable argument — is
        // no longer REFUSED. The constraint takes the ~dynamic sentinel to the
        // runtime tracking path, where the real read is observed each run:
        // `ap().hue1` (the accessor-farm shape) is legal and LIVE. Statically
        // nameable projections keep the wired path exactly as before.
        const dynamicProjection = tail !== null && (unresolvedParam || (opaqueReturn && carriesCells));
        const withProjection = (r) => {
            if (projected.size === 0 && !dynamicProjection)
                return r;
            const reads = new Set([...r.reads, ...projected]);
            if (dynamicProjection)
                reads.add(DYNAMIC);
            return { reads, errors: r.errors };
        };
        const cached = memo.get(key);
        if (cached !== undefined) {
            const r = withProjection(cached);
            return { reads: r.reads, errors: [...cached.errors, ...projectionGate(o, c)] };
        }
        const map = new Map();
        o.params.forEach((p, i) => map.set(p, args === null ? null : (args[i] ?? null)));
        stack.add(tag);
        const res = close(o, { who: c.name, receiver, map, asValue, lenient: c.kind === "method" }, stack, ctx);
        stack.delete(tag);
        memo.set(key, res); // memo holds the UNPROJECTED reads: the tail varies per call site
        const out = withProjection(res);
        return { reads: out.reads, errors: [...res.errors, ...projectionGate(o, c)] };
    };
    const trans = (name, receiver, ctx = null) => follow1({ kind: "method", name, receiver, args: [], projected: false, tail: null }, new Set(), ctx);
    const follow = (c, ctx = null) => follow1(c, new Set(), ctx);
    return { own, trans, follow };
}
/** Extract deps for every constraint in a RESOLVED program. */
export function extractProgram(program, oracle = null) {
    ORACLE = oracle;
    USER_METHODS = new Map();
    METHODS_OF = new Map();
    METHOD_EL_ID = new Map();
    CLASS_EL = new Map();
    CLASS_BASE = new Map();
    COMPUTED_DEFAULTS = new Map();
    DEFAULT_OWNERS = new Map();
    PARENT_OF = new Map();
    PROGRAM_ROOT = program.root;
    NODE_SLOTS = new Set();
    const DECLARED_CLASSES = new Set(program.classes.map((c) => c.name));
    ({ fns: SCRIPT_FUNCTIONS, mutable: SCRIPT_MUTABLE, classes: SCRIPT_CLASSES } = scriptFunctions(program.scripts.map((s) => s.src)));
    const constraints = [];
    const collect = (el, classRoot) => {
        for (const d of el.decls) {
            const t = (d.type ?? "").replace(/\?$/, "");
            if (t !== "" && (COMPONENT_TAGS.has(t) || DECLARED_CLASSES.has(t)))
                NODE_SLOTS.add(d.name);
        }
        for (const m of el.methods)
            USER_METHODS.set(m.name, { params: m.params.map((p) => p.name), body: m.body ?? "", returns: m.returns, pos: m.bodyPos });
        if (el.methods.length > 0) {
            const mm = new Map();
            for (const m of el.methods)
                mm.set(m.name, { params: m.params.map((p) => p.name), body: m.body ?? "", returns: m.returns, pos: m.bodyPos });
            METHODS_OF.set(el, mm);
            METHOD_EL_ID.set(el, METHOD_EL_ID.size);
        }
        for (const a of el.attrs) {
            const v = asCode(a.value);
            if (v)
                constraints.push({ tag: el.tag, name: el.name ?? null, attr: a.name, src: v.src, offset: v.pos?.offset ?? 0, node: v, owner: el, classRoot });
        }
        for (const d of el.decls) {
            const v = asCode(d.def);
            if (v) {
                constraints.push({ tag: el.tag, name: el.name ?? null, attr: d.name, src: v.src, offset: v.pos?.offset ?? 0, node: v, owner: el, classRoot, decl: true });
                // a `{ }` DECL default is an inline formula, not a cell — register it so reads
                // of it are inlined (a `name = { }` attribute is a standing constraint, so it
                // stays a normal subscribable read-path and is NOT registered here).
                const entry = { src: v.src, owner: el, classRoot, pos: v.pos };
                const prev = COMPUTED_DEFAULTS.get(d.name);
                if (prev)
                    prev.push(entry);
                else
                    COMPUTED_DEFAULTS.set(d.name, [entry]);
                const owners = DEFAULT_OWNERS.get(d.name);
                if (owners)
                    owners.add(el);
                else
                    DEFAULT_OWNERS.set(d.name, new Set([el]));
            }
        }
        for (const c of el.children) {
            PARENT_OF.set(c, el);
            collect(c, classRoot);
        }
    };
    collect(program.root, null);
    for (const c of program.classes)
        collect(c.body, c.body);
    for (const c of program.classes) {
        CLASS_EL.set(c.name, c.body);
        CLASS_BASE.set(c.name, c.base);
    }
    const { follow } = buildMethodSummaries();
    const out = [];
    for (const c of constraints) {
        const sf = parseBody(c.src, true);
        if (!sf) {
            out.push({ tag: c.tag, name: c.name, attr: c.attr, offset: c.offset, node: c.node, reads: [], errors: [{ message: "unparseable body", offset: c.offset }] });
            continue;
        }
        // Inline a computed default only when the receiver actually OWNS one of that
        // name. When the receiver cannot be resolved statically, stay conservative and
        // fall back to the name-only test — the pre-L-17 behaviour.
        const inlinable = (receiver, name) => {
            const el = receiverElement(receiver, c.owner, c.classRoot);
            if (el === undefined)
                return true;
            return DEFAULT_OWNERS.get(name)?.has(el) === true;
        };
        const r = extractBody(sf, collectLocals(sf, []), inlinable, undefined, c.node.pos);
        const reads = new Set(r.reads);
        const errors = [...r.errors];
        for (const call of r.calls) {
            const sub = follow(call, { owner: c.owner, classRoot: c.classRoot });
            for (const rd of sub.reads)
                reads.add(rd);
            for (const e of sub.errors)
                errors.push(e);
        }
        const canon = new Set();
        for (let rd of reads) {
            rd = rd.replace(/(\.root)+/g, ".root");
            if (!/^(this|parent|classroot)(\.root)?$/.test(rd))
                canon.add(rd);
        }
        const dynamic = canon.delete(DYNAMIC);
        // SELF-DEPENDENCE — a constraint that reads the slot it defines is a cycle
        // by construction: it invalidates itself on every run (the bare-`...theme`
        // trap in a theme provision → `this.theme`; on the App root the `app.`
        // spelling lands as `this.root.<attr>`). The dep set makes the cycle
        // statically visible, so it is refused here with the rewrite named
        // (docs/system-design/components-baseline.md Contract 2). Dotted attrs (state overrides
        // targeting descendants) are skipped — their `this.` frame is the override's
        // owner, not the target slot. (The rare explicit `classroot.<attr>` spelling
        // on a class root's own slot is not caught in v1.)
        if (!c.attr.includes(".")) {
            const selfPaths = [`this.${c.attr}`, ...(c.tag === "App" ? [`this.root.${c.attr}`] : [])];
            // A computed DECL DEFAULT that (transitively) reads its own slot is the
            // runtime's defect to name (attributes.ts EVALING — the guard this shape
            // has always hit), not a compile refusal: the slot read recorded for the
            // GitHub-#20 cell edge would otherwise turn the pinned runtime error
            // into a new compile error. Drop the self path from a decl default's
            // deps instead — exactly the pre-#20 dep set for this one shape.
            if (c.decl === true) {
                for (const rd of [...canon]) {
                    if (selfPaths.some((s) => rd === s || rd.startsWith(s + ".")))
                        canon.delete(rd);
                }
            }
            else if ([...canon].some((rd) => selfPaths.some((s) => rd === s || rd.startsWith(s + ".")))) {
                errors.push({ message: `'${c.attr}' reads itself — a { } cannot depend on the slot it defines; name the base it derives from instead (e.g. a parent's or the app's '${c.attr}', or a helper such as houseTheme(…))`, offset: 0 });
            }
        }
        out.push({ tag: c.tag, name: c.name, attr: c.attr, offset: c.offset, node: c.node, reads: [...canon], dynamic: dynamic || undefined, errors: errors.map((e) => ({ message: e.message, offset: e.offset })) });
    }
    return out;
}
/** Extract deps and ATTACH them to the program AST (`attr.value.deps`), so the
 *  runtime can wire the static-constraint path. Returns residue errors (empty on
 *  the whole corpus). Mutates the program in place.
 *
 *  A RESIDUE constraint (one the extractor cannot fully analyze) is annotated
 *  with EMPTY deps, never the partial `reads` it managed to find: partial deps
 *  would be wired as if complete and silently MISS the unanalyzed read. Empty
 *  deps leave the constraint unwired, so the runtime re-discovers every read
 *  each run — the sound fallback (docs/system-design/constraints.md's "genuinely dynamic
 *  reads"). The returned `errors` name each such constraint for a caller that
 *  wants to surface or (in the design's end state) reject them. */
export function annotateProgram(program, oracle = null) {
    const out = extractProgram(program, oracle);
    const errors = [];
    for (const c of out) {
        // A DYNAMIC constraint (alias/closure-carried reads) attaches EMPTY deps —
        // the same sound fallback a residue gets: unwired, so the runtime
        // re-discovers every read each run and none goes stale.
        if (c.node)
            c.node.deps = c.errors.length || c.dynamic ? [] : c.reads;
        // Position the residue at the CONSTRAINT (`c.offset` is program-global — the
        // `{`), not the body-local sub-expression offset `e.offset` carries.
        for (const e of c.errors)
            errors.push({ message: e.message, offset: c.offset, where: `${c.name ?? c.tag}.${c.attr}` });
    }
    return { errors };
}
//# sourceMappingURL=dep-extract.js.map