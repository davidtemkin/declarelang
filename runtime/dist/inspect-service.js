// inspect-service — the `Inspect` body service: the surface the Declare
// Inspector app calls from its `{ }` bodies to interrogate ANOTHER app.
//
// Why a service rather than the `window.__declare` bridge: a `{ }` body cannot
// reach `window` (the sealed-abstraction rule), and shouldn't — the Inspector is
// an ordinary Declare program that happens to be about another program. So the
// host names its subject once (setInspectionTarget) and the language surfaces
// the queries the same way it surfaces Themes, Keys and Focus.
//
// Everything here is a QUERY over the subject plus one mutating verb
// (`evaluate`). The Inspector never reaches into the subject's objects directly,
// so this same surface can later address a subject in another frame or process
// with only the transport changing.
import { Node } from "./node.js";
import { View, App, inheritedCursor } from "./view.js";
import { inspect, find, explain, stats, viewAt, dependentsOf, expandValue, slotsOf, clock, kindName, nameOf } from "./inspect.js";
import { compileExpr, validateExpr } from "./expr.js";
import { scanDatapaths } from "./datapath.js";
import { parseProgram } from "./parser.js";
import { bindConstraint } from "./bind.js";
import { ownerOf, disown, ownedSlots } from "./attributes.js";
import { createElementIn } from "./instantiate.js";
import { DeclareError, DeclareErrors } from "./errors.js";
import { settle } from "./reactive.js";
let TARGET = null;
const ZERO = () => ({ x: 0, y: 0 });
let ORIGIN = ZERO;
/** The richer syntax check: expr.ts routes this to the COMPILER's TypeScript
 *  validator whenever the compiler is loaded (it installs one at load), and
 *  falls back to the runtime's `new Function` gate otherwise. So a typo typed
 *  into the strip reads exactly as it would in source. */
const VALIDATE = validateExpr;
export function setInspectionTarget(app, origin = ZERO) {
    TARGET = app;
    ORIGIN = origin;
}
export function inspectionOrigin() { return ORIGIN(); }
export function inspectionTarget() { return TARGET; }
let lastRows = [];
let lastRowsSig = "";
const needTarget = () => {
    if (TARGET === null)
        throw new DeclareError("Inspect: no subject app is attached");
    return TARGET;
};
/** Root-space rect of a node, for the highlight overlay. */
function rectOf(n) {
    if (!(n instanceof View))
        return null;
    let x = 0, y = 0;
    let cur = n;
    while (cur !== null) {
        x += cur.x || 0;
        y += cur.y || 0;
        cur = cur.parent;
    }
    return { x, y, width: n.width || 0, height: n.height || 0 };
}
/** The member name a child is reachable by, when it has one. */
const memberOf = (c) => nameOf(c);
/** Flatten the subject's view tree to rows, descending only into `open` paths —
 *  the Tree pane's source. Depth-first, declaration order (which is also paint
 *  order), so the list reads like the source. */
function rows(n, open, depth, path, out) {
    // The two row badges are computed the CHEAP way on purpose. slotsOf() builds a
    // full record per slot — value rendering, provenance, motion scan — and calling
    // it twice per node on a refresh tick costs O(nodes × slots) many times a
    // second, which is most of the CPU an open Inspector was burning. Both badges
    // are yes/no questions the runtime can answer directly.
    let anyConstrained = false;
    let anyMotion = false;
    let kidCount = 0;
    try {
        anyConstrained = ownedSlots(n).length > 0;
    }
    catch { /* not a bound node */ }
    for (const c of n.children) {
        if (c instanceof View)
            kidCount++;
        const cn = c.constructor.name;
        if (!anyMotion && (cn === "Spring" || cn === "Animator" || cn === "AnimatorGroup"))
            anyMotion = true;
    }
    const kids = { length: kidCount };
    out.push({
        path,
        name: memberOf(n) ?? "",
        kind: kindName(n),
        depth,
        hasKids: kids.length > 0,
        visible: n instanceof View ? n.visible !== false : true,
        constrained: anyConstrained,
        motion: anyMotion,
    });
    if (open[path] !== true)
        return;
    n.children.forEach((c, i) => {
        if (!(c instanceof View))
            return;
        rows(c, open, depth + 1, `${path}.${memberOf(c) ?? i}`, out);
    });
}
/** Split `name = rest` at the FIRST top-level `=` that is not `==`/`>=`/… */
function splitAssign(src) {
    let depth = 0;
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (c === "(" || c === "[" || c === "{")
            depth++;
        else if (c === ")" || c === "]" || c === "}")
            depth--;
        else if (c === "=" && depth === 0) {
            const prev = src[i - 1], next = src[i + 1];
            if (next === "=" || prev === "=" || prev === "!" || prev === "<" || prev === ">")
                continue;
            const attr = src.slice(0, i).trim();
            if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(attr))
                return null;
            return { attr, rest: src.slice(i + 1).trim() };
        }
    }
    return null;
}
const isViewLiteral = (s) => /^[A-Z][A-Za-z0-9_]*\s*\[/.test(s.trim());
const unwrapBody = (s) => {
    const t = s.trim();
    return t.startsWith("{") && t.endsWith("}") ? t.slice(1, -1).trim() : null;
};
/** Render an evaluated value for the transcript. */
function show(v) {
    if (v === null || v === undefined)
        return "null";
    const t = typeof v;
    if (t === "string")
        return JSON.stringify(v);
    if (t === "number")
        return Number.isInteger(v) ? String(v) : v.toFixed(3);
    if (t === "boolean" || t === "bigint")
        return String(v);
    if (t === "function")
        return "«fn»";
    if (v instanceof View)
        return `${v.constructor.name} ›`;
    if (Array.isArray(v))
        return `array[${v.length}]`;
    try {
        return JSON.stringify(v).slice(0, 400);
    }
    catch {
        return String(v);
    }
}
/** The RECORD a view's inherited cursor points at, and its keys. `:field` reads
 *  land here, so the Inspector shows it as a first-class part of the object and
 *  can tell "this field is absent" from "this field is null" — a distinction the
 *  language deliberately collapses (an unresolved `:path` yields null) but a
 *  REPL must not, or it reports wrong information with a straight face. */
function cursorRecord(node) {
    const c = inheritedCursor(node);
    if (c === null)
        return undefined;
    try {
        return c.data.read([...c.path]);
    }
    catch {
        return undefined;
    }
}
function cursorKeys(node) {
    const r = cursorRecord(node);
    if (r === null || r === undefined || typeof r !== "object")
        return [];
    return Array.isArray(r) ? r.map((_, i) => String(i)) : Object.keys(r);
}
/** THE DATAPATH GUARDRAIL. `:field` rewrites to `this.$data("field")`, which
 *  returns null for a view with no inherited cursor — silently. In a constraint
 *  that is the documented behaviour; in a REPL it is a lie, because the
 *  developer cannot tell "the field is null" from "there is no data here". So
 *  an expression that reads `:` against a cursor-less view REFUSES rather than
 *  answering, and says which it is. */
function datapathGuard(node, src) {
    const islands = scanDatapaths(src);
    if (islands.length === 0)
        return null;
    const many = islands.find((p) => p.many);
    if (many !== undefined) {
        return `':${many.path}[]' is a many-path — it replicates, and belongs on a datapath attribute, not in an expression`;
    }
    if (inheritedCursor(node) === null) {
        return `this view has no data cursor, so ':${islands[0].path}' reads nothing.\nSelect a view under a 'datapath' (a replicated row) to read ':' paths.`;
    }
    return null;
}
/** Resolve bare names the way the COMPILER does for a `{ }` body.
 *
 *  compileExpr is the runtime half only: it hands the text to `new Function`
 *  with `this`/`parent`/`classroot` bound. In source, the compiler has already
 *  rewritten free identifiers — `width` → `this.width`, `app` → the root — so a
 *  REPL that skipped that step would reject the very spelling the language
 *  teaches. This is that rewrite, done against the LIVE object: a bare name is
 *  qualified only when the object actually has that member, so anything else
 *  still fails honestly as "not defined" rather than being silently rerouted.
 *
 *  String and template literals are skipped, and a name preceded by `.` or
 *  followed by `:` (an object-literal key) is left alone. */
const KEYWORDS = new Set([
    "true", "false", "null", "undefined", "new", "typeof", "instanceof", "in", "of",
    "return", "const", "let", "var", "if", "else", "for", "while", "do", "function",
    "this", "parent", "classroot", "void", "delete", "class", "extends", "yield", "await",
]);
function qualify(node, src) {
    let out = "";
    let i = 0;
    while (i < src.length) {
        const ch = src[i];
        // skip string / template literals whole
        if (ch === '"' || ch === "'" || ch === "`") {
            const quote = ch;
            let j = i + 1;
            while (j < src.length && src[j] !== quote) {
                if (src[j] === "\\")
                    j++;
                j++;
            }
            out += src.slice(i, Math.min(j + 1, src.length));
            i = j + 1;
            continue;
        }
        if (/[A-Za-z_$]/.test(ch)) {
            let j = i;
            while (j < src.length && /[A-Za-z0-9_$]/.test(src[j]))
                j++;
            const word = src.slice(i, j);
            const prev = out.replace(/\s+$/, "").slice(-1);
            const after = src.slice(j).replace(/^\s+/, "").slice(0, 1);
            const member = prev === "." || prev === "?";
            const key = after === ":";
            if (!member && !key && !KEYWORDS.has(word)) {
                if (word === "app")
                    out += "this.root";
                else if (word in node)
                    out += `this.${word}`;
                else
                    out += word;
            }
            else
                out += word;
            i = j;
            continue;
        }
        out += ch;
        i++;
    }
    return out;
}
/** Evaluate `src` in the scope of the node at `path`. See EvalResult.verb for
 *  the five shapes. Compiler diagnostics are surfaced verbatim — a typo here
 *  reads exactly as it would in source. */
export function evaluateIn(app, path, src) {
    const trimmed = src.trim();
    const fail = (text, input = trimmed) => ({ ok: false, input, text, verb: "error" });
    if (trimmed === "")
        return fail("");
    const node = find(app, path);
    if (node === null)
        return fail(`no object at '${path}'`);
    const self = node;
    const classroot = node.classroot ?? null;
    const run = (body) => {
        const guard = datapathGuard(node, body);
        if (guard !== null)
            return { error: guard };
        const bad = VALIDATE(qualify(node, body));
        if (bad !== null)
            return { error: bad };
        const c = compileExpr(qualify(node, body));
        if ("error" in c)
            return { error: c.error };
        try {
            const value = c.fn.call(node, node.parent, classroot);
            // A `:path` that yielded null may mean "absent", which the language does
            // not distinguish. Say which, and list what IS there — never let the
            // developer read an absent field as a null one.
            const islands = scanDatapaths(body);
            if (value === null && islands.length > 0) {
                const keys = cursorKeys(node);
                const missing = islands.filter((p) => {
                    const head = p.path.split(".")[0];
                    return keys.length > 0 && !keys.includes(head);
                });
                if (missing.length > 0) {
                    return { error: `':${missing[0].path}' is not in this record.\nit has: ${keys.join(", ")}` };
                }
            }
            return { value };
        }
        catch (e) {
            return { error: `threw — ${e.message}` };
        }
    };
    // 1. a view literal → instantiate into the selected view
    if (isViewLiteral(trimmed)) {
        if (!(node instanceof View))
            return fail("only a View can take a child");
        try {
            const prog = parseProgram(`App [\n${trimmed}\n]`);
            const el = prog.root.children[0];
            if (el === undefined)
                return fail("that parsed to no view");
            const made = createElementIn(app, el, node);
            settle();
            return { ok: true, input: trimmed, verb: "view", temporary: true,
                text: `added ${kindName(made)} to ${path}` };
        }
        catch (e) {
            if (e instanceof DeclareErrors)
                return fail(e.errors.map((x) => x.message).join("\n"));
            return fail(e.message);
        }
    }
    // 2. an assignment: `attr = value` or `attr = { … }`
    const asg = splitAssign(trimmed);
    if (asg !== null) {
        const { attr, rest } = asg;
        const body = unwrapBody(rest);
        if (body !== null) {
            // install a LIVE constraint on the slot
            const guard = datapathGuard(node, body);
            if (guard !== null)
                return fail(guard);
            const q = qualify(node, body);
            const bad = VALIDATE(q);
            if (bad !== null)
                return fail(bad);
            try {
                // A slot already owned by a compiled constraint is REPLACED — that is
                // the point of typing one here. The old owner is disowned first, since
                // bindConstraint refuses to double-bind.
                if (ownerOf(node, attr) !== null)
                    disown(node, attr);
                bindConstraint(node, attr, q, { line: 0, col: 0 }, classroot);
                const owner = ownerOf(node, attr);
                if (owner !== null)
                    owner.live = true;
                settle();
                return { ok: true, input: trimmed, verb: "bind", temporary: true,
                    text: `${attr} is now bound — temporary, it will not survive a reload` };
            }
            catch (e) {
                return fail(e.message);
            }
        }
        const r = run(rest);
        if ("error" in r)
            return fail(r.error);
        if (ownerOf(node, attr) !== null) {
            return fail(`${attr} is held by a constraint, so a plain write would be overwritten on the next settle.\nReplace the constraint instead:  ${attr} = { … }`);
        }
        try {
            self[attr] = r.value;
            settle();
            return { ok: true, input: trimmed, verb: "set", text: `${attr} = ${show(r.value)}` };
        }
        catch (e) {
            return fail(e.message);
        }
    }
    // 3. a bare `{ … }` body, or 4. a plain expression / 5. a bare slot read
    const body = unwrapBody(trimmed);
    const r = run(body ?? trimmed);
    if ("error" in r)
        return fail(r.error);
    const verb = body === null && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(trimmed) ? "read" : "eval";
    return { ok: true, input: trimmed, verb, text: show(r.value) };
}
/** The `Inspect` service — installed into `{ }` body scope by index.ts. */
export const Inspect = {
    ready: () => TARGET !== null,
    /** Flattened tree rows honouring the caller's open-set.
     *
     *  MEMOISED on the rendered content, and it matters more than it looks: the
     *  caller feeds this straight into a Dataset that replicates one view per row.
     *  Handing back a fresh array on every refresh tick makes replication rebuild
     *  hundreds of views several times a second — which is nearly all the CPU an
     *  open Inspector used to burn. Identical content returns the IDENTICAL array,
     *  so the equality gate upstream stops the churn dead. */
    rows: (open) => {
        const out = [];
        rows(needTarget(), open ?? {}, 0, "app", out);
        const sig = JSON.stringify(out);
        if (sig === lastRowsSig)
            return lastRows;
        lastRowsSig = sig;
        lastRows = out;
        return out;
    },
    node: (path) => inspect(needTarget(), path),
    kindOf: (path) => { const n = find(needTarget(), path); return n === null ? "" : kindName(n); },
    slots: (path) => {
        const n = find(needTarget(), path);
        return n === null ? [] : slotsOf(n);
    },
    explain: (path, attr) => {
        const n = find(needTarget(), path);
        return n === null ? null : explain(n, attr);
    },
    /** The current value of one of a constraint's wired read-paths, resolved
     *  against the owning node — what makes the dependency list live. */
    depValue: (path, readPath) => {
        const n = find(needTarget(), path);
        if (n === null)
            return "";
        const c = compileExpr(readPath);
        if ("error" in c)
            return "";
        try {
            return show(c.fn.call(n, n.parent, n.classroot ?? null));
        }
        catch {
            return "—";
        }
    },
    /** Does a read-path name a view? Then the Why pane can offer to outline it. */
    depTargetPath: (path, readPath) => {
        const n = find(needTarget(), path);
        if (n === null)
            return "";
        const c = compileExpr(readPath.replace(/\.[A-Za-z0-9_$]+$/, ""));
        if ("error" in c)
            return "";
        try {
            const v = c.fn.call(n, n.parent, n.classroot ?? null);
            if (!(v instanceof View))
                return "";
            return pathOfNode(v);
        }
        catch {
            return "";
        }
    },
    expand: (path, attr, trail) => {
        const n = find(needTarget(), path);
        return n === null ? { kind: "primitive", text: "" } : expandValue(n, attr, trail);
    },
    dependents: (attr) => dependentsOf(needTarget(), attr),
    rect: (path) => {
        const n = find(needTarget(), path);
        if (n === null)
            return null;
        const r = rectOf(n);
        if (r === null)
            return null;
        const o = ORIGIN();
        return { x: r.x + o.x, y: r.y + o.y, width: r.width, height: r.height };
    },
    at: (x, y) => {
        const o = ORIGIN();
        const v = viewAt(needTarget(), x - o.x, y - o.y);
        return v === null ? "" : pathOfNode(v);
    },
    stats: () => stats(needTarget()),
    /** Is this view under a datapath? The Object pane badges it, and the
     *  evaluate strip's `:` support depends on it. */
    hasData: (path) => {
        const n = find(needTarget(), path);
        return n !== null && inheritedCursor(n) !== null;
    },
    dataKeys: (path) => {
        const n = find(needTarget(), path);
        return n === null ? [] : cursorKeys(n);
    },
    /** The cursor record as Object-pane rows — the data a `:field` would read,
     *  shown beside the view's own slots rather than hidden behind them. */
    dataRows: (path) => {
        const n = find(needTarget(), path);
        if (n === null)
            return [];
        const rec = cursorRecord(n);
        if (rec === null || rec === undefined || typeof rec !== "object")
            return [];
        const out = [];
        for (const [k, v] of Object.entries(rec).slice(0, 200)) {
            const kind = v === null || typeof v !== "object" ? "primitive" : Array.isArray(v) ? "array" : "record";
            out.push({
                key: k, kind,
                text: kind === "array" ? `array[${v.length}]` : kind === "record" ? "{ }"
                    : typeof v === "string" ? JSON.stringify(v) : String(v),
                open: kind !== "primitive",
            });
        }
        return out;
    },
    dataPreview: (path) => {
        const n = find(needTarget(), path);
        if (n === null)
            return "";
        const c = inheritedCursor(n);
        if (c === null)
            return "";
        try {
            const v = c.data.read([...c.path]);
            return JSON.stringify(v) ?? "";
        }
        catch {
            return "";
        }
    },
    evaluate: (path, src) => evaluateIn(needTarget(), path, src),
    clock,
};
/** The dotted address of a live node, by walking to the root — the inverse of
 *  find(). Member names where they exist, child index where they don't. */
function pathOfNode(n) {
    const parts = [];
    let cur = n;
    while (cur !== null && cur.parent !== null) {
        const m = memberOf(cur);
        parts.unshift(m ?? String(cur.parent.children.indexOf(cur)));
        cur = cur.parent;
    }
    return ["app", ...parts].join(".");
}
//# sourceMappingURL=inspect-service.js.map