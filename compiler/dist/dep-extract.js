// dep-extract — static dependency extraction for `{ }` constraints
// (design/constraints.md, Model Y). Given a RESOLVED program (post scope
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
import { scanDatapaths } from "../../runtime/dist/datapath.js";
import { LANGUAGE_METHOD_EFFECTS } from "./effects.js";
const SCOPE_ROOTS = new Set(["parent", "classroot"]); // `this` via ThisKeyword; `app` is `this.root`
const GLOBALS = new Set(["Math", "Object", "JSON", "Array", "Number", "String", "Boolean", "Date", "console", "parseInt", "parseFloat", "isNaN", "isFinite", "Infinity", "NaN", "undefined", "null", "RegExp", "Symbol", "Map", "Set", "Promise", "Intl", "Error"]);
const CONSTRUCTORS = new Set(["gradient", "stroke", "shadow", "stop"]);
const ITER = new Set(["map", "filter", "find", "findIndex", "some", "every", "reduce", "reduceRight", "forEach", "sort", "flatMap", "slice", "concat", "indexOf", "includes", "join", "keys", "values", "entries", "flat", "at", "reverse", "fill", "findLast"]);
const PURE_METHODS = new Set(["toFixed", "toString", "toPrecision", "valueOf", "toExponential", "toUpperCase", "toLowerCase", "trim", "trimStart", "trimEnd", "padStart", "padEnd", "charAt", "charCodeAt", "codePointAt", "substring", "substr", "repeat", "startsWith", "endsWith", "split", "replace", "replaceAll", "match", "matchAll", "search", "normalize", "localeCompare", "slice", "at", "indexOf", "lastIndexOf", "includes", "getFullYear", "getMonth", "getDate", "getDay", "getHours", "getMinutes", "getSeconds", "getTime", "getMilliseconds", "getTimezoneOffset", "toISOString", "toLocaleDateString", "toLocaleTimeString", "toLocaleString", "toDateString", "getUTCFullYear", "getUTCMonth", "getUTCDate"]);
const NODE_COLLECTIONS = new Set(["children", "subviews", "views", "members", "instances"]);
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
/** Extract read-paths + callees + residue errors from one body. */
function extractBody(sf, locals) {
    const reads = new Set();
    const calls = [];
    const errors = [];
    const isReactiveRootId = (n) => (ts.isIdentifier(n) && SCOPE_ROOTS.has(n.text) && !locals.has(n.text)) || n.kind === ts.SyntaxKind.ThisKeyword;
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
    const classifyChain = (top) => {
        const base = baseOf(top);
        const reactive = isReactiveRootId(base);
        let n = top;
        const segs = [];
        while (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n) || ts.isCallExpression(n) || ts.isNonNullExpression(n) || ts.isParenthesizedExpression(n)) {
            segs.push(n);
            if (ts.isCallExpression(n))
                for (const a of n.arguments)
                    walk(a);
            if (ts.isElementAccessExpression(n) && n.argumentExpression)
                walk(n.argumentExpression);
            n = n.expression;
        }
        if (!reactive)
            return;
        const ordered = [...segs].reverse();
        let pathEnd = base;
        for (const s of ordered) {
            if (ts.isPropertyAccessExpression(s) && s.parent && ts.isCallExpression(s.parent) && s.parent.expression === s)
                continue;
            if (ts.isPropertyAccessExpression(s) && COMPUTED_DEFAULTS.has(s.name.text)) {
                // A read of a computed `{ }` default is a formula, not a subscribable slot:
                // inline it like a method call so its (branch-union) deps become ours, rather
                // than recording the slot itself (which has no cell to fire).
                calls.push({ name: s.name.text, receiver: pathTextOf(s.expression) });
                pathEnd = base;
                break;
            }
            if (ts.isPropertyAccessExpression(s)) {
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
                        if (staticArr)
                            reads.add(`${pathTextOf(recv)}.read(${a0.getText()})`);
                        else
                            errors.push(new DepError(`dynamic datapath — read([<expr>]) resolves the region at runtime; use a literal path`, s.getStart()));
                    }
                    else if (ITER.has(m)) {
                        if (recvName && NODE_COLLECTIONS.has(recvName))
                            errors.push(new DepError(`aggregation over a reactive node collection (.${recvName}.${m}) — a data-dependent number of slots; derive from data`, s.getStart()));
                    }
                    else if (PURE_METHODS.has(m)) { /* pure projection */ }
                    else if (USER_METHODS.has(m))
                        calls.push({ name: m, receiver: pathTextOf(recv) });
                    else if (LANGUAGE_METHOD_EFFECTS.has(m)) {
                        // A language-supplied method with a DECLARED reactive effect
                        // (effects.ts): union its read-paths, rebased to this receiver — as
                        // analyzable as following a user method's body, not a residue.
                        for (const rp of LANGUAGE_METHOD_EFFECTS.get(m))
                            reads.add(rebase(rp, pathTextOf(recv)));
                    }
                    else
                        errors.push(new DepError(`unresolved call target .${m}() — its reads can't be analyzed; call an in-program method or a pure builtin`, s.getStart()));
                }
                else if (ts.isIdentifier(callee)) {
                    const nm = callee.text;
                    if (CONSTRUCTORS.has(nm) || GLOBALS.has(nm) || locals.has(nm)) { /* pure */ }
                    else if (USER_METHODS.has(nm))
                        calls.push({ name: nm, receiver: "this" });
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
        if ((ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n) || ts.isCallExpression(n)) && !isChainInterior(n)) {
            classifyChain(n);
            return;
        }
        ts.forEachChild(n, walk);
    }
    walk(sf);
    return { reads, calls, errors };
}
let USER_METHODS = new Map();
// Computed `{ }` DECL DEFAULTS (`name: type = { … }`) by name. Unlike a `name =
// { … }` ATTRIBUTE (a standing constraint that owns a cell), a computed default has
// NO cell — it is evaluated inline on each read, its reads flowing to the reader.
// So reading one is not a subscribable edge; it must be INLINED like a zero-arg
// method call, unioning its (branch-union) deps. Keyed by name (as methods are);
// same-named defaults on different elements union — a sound over-approximation.
let COMPUTED_DEFAULTS = new Map();
function buildMethodSummaries() {
    const own = new Map();
    for (const [name, { params, body }] of USER_METHODS) {
        const sf = parseBody(body, false);
        if (!sf) {
            own.set(name, { reads: new Set(), calls: [], errors: [] });
            continue;
        }
        own.set(name, extractBody(sf, collectLocals(sf, params)));
    }
    // Computed `{ }` defaults join the same callable graph — a default's body is an
    // EXPRESSION (parseBody expr-mode), and same-named defaults union into one summary.
    for (const [name, bodies] of COMPUTED_DEFAULTS) {
        for (const body of bodies) {
            const sf = parseBody(body, true);
            const d = sf ? extractBody(sf, collectLocals(sf, [])) : { reads: new Set(), calls: [], errors: [] };
            const ex = own.get(name);
            if (ex) {
                for (const r of d.reads)
                    ex.reads.add(r);
                ex.calls.push(...d.calls);
                ex.errors.push(...d.errors);
            }
            else
                own.set(name, d);
        }
    }
    const memo = new Map();
    const trans = (name, receiver, stack = new Set()) => {
        const key = name + "@" + receiver;
        if (stack.has(name))
            return { reads: new Set(), errors: [] };
        const cached = memo.get(key);
        if (cached)
            return cached;
        const o = own.get(name);
        if (!o)
            return { reads: new Set(), errors: [] };
        stack.add(name);
        const reads = new Set([...o.reads].map((r) => rebase(r, receiver)));
        const errors = [...o.errors];
        for (const c of o.calls) {
            const sub = trans(c.name, rebase(c.receiver, receiver), stack);
            for (const r of sub.reads)
                reads.add(r);
            for (const e of sub.errors)
                errors.push(e);
        }
        stack.delete(name);
        const res = { reads, errors };
        memo.set(key, res);
        return res;
    };
    return { own, trans };
}
/** Extract deps for every constraint in a RESOLVED program. */
export function extractProgram(program) {
    USER_METHODS = new Map();
    COMPUTED_DEFAULTS = new Map();
    const constraints = [];
    const collect = (el) => {
        for (const m of el.methods)
            USER_METHODS.set(m.name, { params: m.params, body: m.body ?? "" });
        for (const a of el.attrs) {
            const v = asCode(a.value);
            if (v)
                constraints.push({ tag: el.tag, name: el.name ?? null, attr: a.name, src: v.src, offset: v.pos?.offset ?? 0, node: v });
        }
        for (const d of el.decls) {
            const v = asCode(d.def);
            if (v) {
                constraints.push({ tag: el.tag, name: el.name ?? null, attr: d.name, src: v.src, offset: v.pos?.offset ?? 0, node: v });
                // a `{ }` DECL default is an inline formula, not a cell — register it so reads
                // of it are inlined (a `name = { }` attribute is a standing constraint, so it
                // stays a normal subscribable read-path and is NOT registered here).
                const prev = COMPUTED_DEFAULTS.get(d.name);
                if (prev)
                    prev.push(v.src);
                else
                    COMPUTED_DEFAULTS.set(d.name, [v.src]);
            }
        }
        for (const c of el.children)
            collect(c);
    };
    collect(program.root);
    for (const c of program.classes)
        collect(c.body);
    const { trans } = buildMethodSummaries();
    const out = [];
    for (const c of constraints) {
        const sf = parseBody(c.src, true);
        if (!sf) {
            out.push({ tag: c.tag, name: c.name, attr: c.attr, offset: c.offset, node: c.node, reads: [], errors: [{ message: "unparseable body", offset: c.offset }] });
            continue;
        }
        const r = extractBody(sf, collectLocals(sf, []));
        const reads = new Set(r.reads);
        const errors = [...r.errors];
        for (const call of r.calls) {
            const sub = trans(call.name, call.receiver);
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
        // SELF-DEPENDENCE — a constraint that reads the slot it defines is a cycle
        // by construction: it invalidates itself on every run (the bare-`...theme`
        // trap in a theme provision → `this.theme`; on the App root the `app.`
        // spelling lands as `this.root.<attr>`). The dep set makes the cycle
        // statically visible, so it is refused here with the rewrite named
        // (design/components-baseline.md Contract 2). Dotted attrs (state overrides
        // targeting descendants) are skipped — their `this.` frame is the override's
        // owner, not the target slot. (The rare explicit `classroot.<attr>` spelling
        // on a class root's own slot is not caught in v1.)
        if (!c.attr.includes(".")) {
            const selfPaths = [`this.${c.attr}`, ...(c.tag === "App" ? [`this.root.${c.attr}`] : [])];
            if ([...canon].some((rd) => selfPaths.some((s) => rd === s || rd.startsWith(s + ".")))) {
                errors.push({ message: `'${c.attr}' reads itself — a { } cannot depend on the slot it defines; name the base it derives from instead (e.g. a parent's or the app's '${c.attr}', or a helper such as houseTheme(…))`, offset: 0 });
            }
        }
        out.push({ tag: c.tag, name: c.name, attr: c.attr, offset: c.offset, node: c.node, reads: [...canon], errors: errors.map((e) => ({ message: e.message, offset: e.offset })) });
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
 *  each run — the sound fallback (design/constraints.md's "genuinely dynamic
 *  reads"). The returned `errors` name each such constraint for a caller that
 *  wants to surface or (in the design's end state) reject them. */
export function annotateProgram(program) {
    const out = extractProgram(program);
    const errors = [];
    for (const c of out) {
        if (c.node)
            c.node.deps = c.errors.length ? [] : c.reads;
        // Position the residue at the CONSTRAINT (`c.offset` is program-global — the
        // `{`), not the body-local sub-expression offset `e.offset` carries.
        for (const e of c.errors)
            errors.push({ message: e.message, offset: c.offset, where: `${c.name ?? c.tag}.${c.attr}` });
    }
    return { errors };
}
//# sourceMappingURL=dep-extract.js.map