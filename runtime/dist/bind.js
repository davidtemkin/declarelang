// Bind parsed attribute values that are *relationships*, not literals, onto a
// live view: `{ }` constraint bodies and percent Lengths. instantiate.ts
// calls these after the whole tree is linked (a binding's first evaluation
// may read the parent — a percent does by construction).
//
// Both forms become the same Constraint: evaluate under tracking, land the
// result through setBound (store → the one affected Surface call → wake
// dependents). A percent is not a special mechanism — it is the constraint
// `parent.<axis> × p/100` the runtime writes for you, which is why "parent
// resizes → dependent re-resolves" needs no extra machinery.
import { deferral } from "./boot-deferrals.js";
import { DeclareError } from "./errors.js";
import { Constraint, kernel, touchCell, readsCellDuring } from "./reactive.js";
import { defaultOf, hasSlot, markPercent, setPercentMark, own, release, setBound, provideWrite, computingProvision, slotCellOf, writeOwned, isSetOrOwned, ownerOf, kernelLanding } from "./attributes.js";
import { KERNEL_FLAG } from "./kernel-loader.js";
import { watchingContentRead } from "./size-probe.js";
import { compileExpr, bodyLabel } from "./expr.js";
import { View, inheritedCursor, withCursorDefining } from "./view.js";
import { authoredName, onDiscard } from "./node.js";
import { coerceData, toCursor } from "./data.js";
import { splitPath } from "./path-plan.js";
import { declareName } from "./declare-name.js";
/** The profiler's itemized mode (profile.ts): `globalThis.__declareProfileItemize`
 *  set before the program boots keeps every rule off the kernel's native path. */
const ITEMIZE = globalThis.__declareProfileItemize === true;
/** Bind `name = { src }`: compile, install as the slot's owner, evaluate
 *  once now. check() already validated the syntax on the build path; a
 *  direct instantiate of an unchecked tree still fails soundly here with
 *  the same wording (compileExpr is the one message source). `classroot` is
 *  the instance of the class whose body the binding was WRITTEN in (R6) —
 *  a member-origin fact instantiate supplies, not always view.classroot
 *  (a class-body member on the class root itself binds to that root).
 *  `view` is any Node since R8 — a DataSource's `url = { … }` binds the
 *  same way a View attribute does. */
/** Bind a `{ }` PROVISION — `App [ theme = { … } ]` where `theme` is not a slot
 *  of the node's class. Same standing computation as bindConstraint, but the
 *  result lands in the node's provision store (provideWrite) rather than a slot,
 *  so a descendant's `provided("theme")` re-derives when the { } does. No slot
 *  owner (there is no slot); teardown rides onDiscard. */
export function provideBind(view, name, src, pos, classroot, deps) {
    const c = compileExpr(src, bodyLabel(declareName(view), name, pos));
    if ("error" in c)
        throw new DeclareError(`${declareName(view)} provides ${name} = { … } ${c.error}`, pos);
    const fn = c.fn;
    const k = new Constraint(`${declareName(view)} provides ${name}`, 
    // a read of `name` inside it is the value above this node, which it extends
    () => computingProvision(view, name, () => fn.call(view, view.parent, classroot)), (v) => provideWrite(view, name, v));
    k.source = src;
    k.sourcePos = sourceAt(pos);
    onDiscard(view, () => k.dispose());
    const regionReactive = deps !== undefined && deps.some((rp) => rp.startsWith(":") || rp.includes(".read(") || rp.includes(".value."));
    if (deps !== undefined && deps.length > 0 && !regionReactive) {
        const probes = probeFns(deps);
        k.wire(() => computingProvision(view, name, () => {
            for (const p of probes) {
                try {
                    p.call(view, view.parent, classroot);
                }
                catch { /* a null-value projection — its tracked prefix is already wired */ }
            }
        }), deps);
    }
    else {
        k.run();
    }
}
/** The functions that TOUCH a body's static read paths, so the wiring sees the
 *  reads. A plain dotted chain — `this.$root.width`, `parent.x`, `classroot.a.b`
 *  — is walked by a shared getter with no compile at all (boot-deferrals.ts:
 *  on the desktop 372 of 404 distinct paths are plain, each was a `new
 *  Function`); anything else (`:field`, `.read([…])`, `$provided(…)`) keeps the
 *  compiled form. */
const PLAIN_PATH = /^(this|parent|classroot|app)(\.[A-Za-z_$][\w$]*)+$/;
function probeFns(deps) {
    const out = [];
    for (const rp of deps) {
        if (deferral("probe") && PLAIN_PATH.test(rp)) {
            const segs = rp.split(".");
            const root = segs[0];
            out.push(function (parent, classroot) {
                let cur = root === "this" ? this : root === "parent" ? parent : root === "classroot" ? classroot : this.$root;
                for (let i = 1; i < segs.length; i++)
                    cur = cur[segs[i]];
                return cur;
            });
        }
        else {
            const r = compileExpr(rp);
            if ("fn" in r)
                out.push(r.fn);
        }
    }
    return out;
}
/** A body's kernel bytecode in its wire form (expr-emit.ts): tokens — `L<n>`
 *  the n-th read path of the body's deps, `L%path` a literal path,
 *  `K<number>` a constant, one letter per operator. */
const LETTER_OP = {
    "+": 3, "-": 4, "*": 5, "/": 6, "%": 7, "~": 8, m: 9, M: 10, a: 11, f: 12, c: 13, r: 14, q: 15,
    "<": 16, l: 17, ">": 18, g: 19, "=": 20, "!": 21, "&": 22, "|": 23, n: 24, "?": 25, "^": 26, N: 27, Q: 28,
};
function exprOf(e, deps) {
    if (e === undefined)
        return null;
    const code = [], paths = [], consts = [];
    const pathIndex = (p) => { let i = paths.indexOf(p); if (i < 0) {
        i = paths.length;
        paths.push(p);
    } return i; };
    for (const tok of e.split(" ")) {
        if (tok === "")
            continue;
        if (tok[0] === "L") {
            const p = tok[1] === "%" ? tok.slice(2) : deps[Number(tok.slice(1))];
            if (p === undefined)
                return null;
            code.push(1, pathIndex(p));
            continue;
        }
        if (tok[0] === "K") {
            const v = Number(tok.slice(1));
            if (Number.isNaN(v) && tok !== "KNaN")
                return null;
            consts.push(v);
            code.push(2, consts.length - 1);
            continue;
        }
        const op = LETTER_OP[tok];
        if (op === undefined)
            return null;
        code.push(op);
    }
    code.push(0);
    return { code, paths, consts };
}
/** How many bodies bound as kernel EXPR rules, and how many fell back — tooling. */
export const exprStats = { kernel: 0, fallback: 0, /** tests: force every body onto the JS path */ disabled: false };
const DATA_CELLS = new WeakMap();
const FREE_DATA_CELLS = [];
export const dataCellStats = { cells: 0, escaped: 0 };
/** A record field as the kernel would hold it: a number as is, a boolean as
 *  1/0 (what JS arithmetic and comparison make of it — `:flag ? a : b`,
 *  `:flag + 1`, `:flag == 1` all agree); anything else has no cell. */
function numericData(v) {
    return typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : null;
}
function dataCellFor(view, field) {
    let m = DATA_CELLS.get(view);
    if (m === undefined) {
        DATA_CELLS.set(view, (m = new Map()));
        onDiscard(view, () => disposeDataCells(view));
    }
    const had = m.get(field);
    if (had !== undefined)
        return had.escaped ? null : had;
    const v0 = numericData(view.$data([field]));
    if (v0 === null)
        return null;
    const K = kernel();
    const cell = FREE_DATA_CELLS.length > 0 ? FREE_DATA_CELLS.pop() : K.addCells(1);
    if (cell < 0)
        return null;
    K.table[cell] = v0;
    const dc = { cell, rule: null, readers: [], escaped: false };
    m.set(field, dc);
    dataCellStats.cells++;
    dc.rule = new Constraint(`${declareName(view)} :${field}`, () => view.$data([field]), (raw) => {
        const v = numericData(raw);
        if (v !== null) {
            const t = kernel().table;
            if (t[cell] !== v || v !== v) {
                t[cell] = v;
                touchCell(cell);
            }
            return;
        }
        escapeDataCell(dc);
    });
    dc.rule.run();
    return dc;
}
/** The field stopped being a number: the cell retires and every kernel body
 *  that read it is rebound as the JS body it came from. */
function escapeDataCell(dc) {
    if (dc.escaped)
        return;
    dc.escaped = true;
    dataCellStats.escaped++;
    dc.rule?.dispose();
    dc.rule = null;
    const readers = dc.readers.splice(0);
    for (const r of readers) {
        const o = ownerOf(r.view, r.name);
        if (o === null || !o.isNative)
            continue; // already rebound (through another field of its)
        o.dispose();
        release(r.view, r.name, o);
        bindConstraint(r.view, r.name, r.src, r.pos, r.classroot, r.deps, o.yielding);
    }
}
function disposeDataCells(view) {
    const m = DATA_CELLS.get(view);
    if (m === undefined)
        return;
    DATA_CELLS.delete(view);
    for (const dc of m.values()) {
        dc.rule?.dispose();
        dc.rule = null;
        dc.readers.length = 0;
        kernel().clearCells(dc.cell, 1);
        FREE_DATA_CELLS.push(dc.cell);
        dataCellStats.cells--;
    }
}
/** DIAGNOSTIC: `globalThis.__declareExprTrace = []` collects why each EXPR
 *  candidate fell back to its JS body. */
function exprWhy(label, why) {
    if (!(typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__))
        return false;
    const t = globalThis.__declareExprTrace;
    if (Array.isArray(t))
        t.push({ label, why });
    return false;
}
function bindKernelExpr(view, name, expr, classroot, label, src, pos, yielding = false, deps = [], percent = false) {
    const target = slotCellOf(view, name);
    if (target < 0)
        return exprWhy(label, "target not numeric: " + name);
    const cells = [];
    const dataCells = [];
    for (const p of expr.paths) {
        if (p.startsWith(":")) {
            const field = p.slice(1);
            if (field.includes(".") || field === "")
                return exprWhy(label, "data path: " + p);
            const dc = dataCellFor(view, field);
            if (dc === null)
                return exprWhy(label, "data not numeric: " + p);
            cells.push(dc.cell);
            dataCells.push(dc);
            continue;
        }
        const dot = p.lastIndexOf(".");
        if (dot < 0)
            return exprWhy(label, "no receiver: " + p);
        const receiver = p.slice(0, dot), slot = p.slice(dot + 1);
        const r = compileExpr(receiver);
        if ("error" in r)
            return exprWhy(label, "receiver error: " + receiver);
        let node;
        try {
            node = r.fn.call(view, view.parent, classroot);
        }
        catch {
            return exprWhy(label, "receiver threw: " + receiver);
        }
        if (node === null || typeof node !== "object")
            return exprWhy(label, "receiver not a node: " + receiver);
        const c = slotCellOf(node, slot);
        if (c < 0 || c === target)
            return exprWhy(label, (c === target ? "self-read: " : "slot not numeric: ") + p);
        cells.push(c);
    }
    const K = kernel();
    // relocate: LOAD i → cell, CONST i → kernel constant index
    const code = expr.code.slice();
    const constAt = expr.consts.map((v) => K.addConst(v));
    if (constAt.some((i) => i < 0))
        return false;
    for (let i = 0; i < code.length; i++) {
        const op = code[i];
        if (op === 1) {
            code[i + 1] = cells[code[i + 1]];
            i++;
        } // LOAD
        else if (op === 2) {
            code[i + 1] = constAt[code[i + 1]];
            i++;
        } // CONST
    }
    const off = K.addCode(code);
    if (off < 0)
        return false;
    const edges = [...new Set(cells)];
    const id = K.addExprRule(target, (yielding ? KERNEL_FLAG.YIELDING : 0) | (percent ? KERNEL_FLAG.PERCENT : 0), edges, off, code.length);
    if (id < 0)
        return false;
    const k = new Constraint(label, () => undefined, () => { }, 0, yielding);
    k.adoptRule(id);
    if (percent)
        markPercent(k);
    k.source = src;
    k.sourcePos = sourceAt(pos);
    k.wiredPaths = expr.paths;
    own(view, name, k);
    for (const dc of dataCells)
        dc.readers.push({ view, name, src, pos, classroot, deps });
    k.run();
    return true;
}
/** SIZE AND THE CONTENT SIZE (docs/system-design/layout-ownership.md §4): on
 *  each axis a view is given its size or takes it from its content, and a child
 *  whose size is derived from its parent's size on that axis does not count
 *  toward the parent's content size — however the derivation is written. A
 *  percent is marked where it is bound (bindPercent); a `{ }` that reads the
 *  parent's size on the same axis is marked here, and the mark is the one the
 *  content size already honors (markPercent — auto-extent, in JavaScript and in
 *  the kernel, skips a marked child). Decided from the compiler's read-paths,
 *  which every build carries; a dev re-parse that carries none asks the source
 *  text the same question, so the two can never answer differently. A read
 *  reached through another attribute is not seen here: it is not a derivation
 *  the source states, and if it collapses the size, the negative-size report
 *  (view.ts) is what says so. */
/** Does the body choose between branches? A size that reads the parent's size
 *  in a body with branches may read it on one run and not the next — so it is
 *  marked by the branch each run took (bindConstraint), not by its source. */
function branches(src) {
    return /\?|&&|\|\||\bif\b|\bswitch\b/.test(src.replace(/\?\?|\?\./g, ""));
}
function sizeFromParent(name, deps, src) {
    const same = name === "width" ? "width|contentWidth" : name === "height" ? "height|contentHeight" : null;
    if (same === null)
        return false;
    if (deps !== undefined) {
        const path = new RegExp("^(?:this\\.)?parent\\.(?:" + same + ")$");
        return deps.some((d) => path.test(d));
    }
    return new RegExp("(?:^|[^\\w$.])(?:this\\s*\\.\\s*)?parent\\s*\\.\\s*(?:" + same + ")\\b").test(src);
}
/** Whether a by-branch size's last run read the parent's size on its axis —
 *  its size slot, or its content size. */
const READ_PARENT = new WeakMap();
// (the mark is settled in the run itself: a numeric size's value is landed by
// the kernel, which never calls the rule's apply)
function branchWatched(view, name, fn, rule) {
    return function (...args) {
        const run = () => fn.apply(this, args);
        const p = view.parent;
        if (!(p instanceof View))
            return run();
        const cell = slotCellOf(p, name);
        const content = watchingContentRead(p, name, () => cell >= 0 ? readsCellDuring(cell, run) : { value: run(), hit: false });
        READ_PARENT.set(view, content.hit || content.value.hit);
        if (rule.k !== null)
            markByBranch(rule.k, view);
        return content.value.value;
    };
}
/** Mark a by-branch size by what its last run read. A mark taken on means the
 *  parent's content size stops counting this child; let go, it counts it again.
 *  Either way whatever read the parent's content re-derives — woken through the
 *  parent's child list, which every content walk watches (a walk that skipped
 *  this child read nothing of it). */
function markByBranch(k, view) {
    if (setPercentMark(k, READ_PARENT.get(view) === true)) {
        const p = view.parent;
        if (p instanceof View)
            touchCell(p.$structureCellId());
    }
}
const PLANS = new WeakMap();
function planFor(name, deps, src, kernelOk, expr) {
    let byName = PLANS.get(deps);
    if (byName === undefined)
        PLANS.set(deps, (byName = new Map()));
    const key = name + (kernelOk ? "" : "|nok") + (deferral("probe") ? "" : "|np");
    let plan = byName.get(key);
    if (plan === undefined) {
        const paths = deps;
        const regionReactive = paths.some((rp) => rp.startsWith(":") || rp.includes(".read(") || rp.includes(".value."));
        plan = {
            expr: kernelOk ? exprOf(expr, deps) : null,
            paths,
            derived: sizeFromParent(name, deps, src),
            regionReactive,
            probes: paths.length > 0 && !regionReactive ? probeFns(paths) : null,
        };
        byName.set(key, plan);
    }
    return plan;
}
export function bindConstraint(view, name, src, pos, classroot, 
/** The compiler's extracted dependency read-paths (docs/system-design/constraints.md §5).
 *  When present, the constraint is wired on the static path — edges fixed once,
 *  no per-run re-tracking. Absent (dev re-parse, or an un-annotated program) →
 *  the runtime-tracking fallback, unchanged. */
deps, 
/** A DECLARED default (bindDeclDefault): yields to an author write or a
 *  newer owner, as the live fallback it replaces did. */
yielding = false, 
/** …and is marked as one BEFORE its first run, so a read while that run is
 *  in flight evaluates the default live instead of taking the empty slot. */
declDefault = false, 
/** The body as kernel bytecode (the code value's `expr`), when the compiler
 *  emitted it — the constraint then runs in the kernel if its reads land on
 *  numeric cells. */
bytecode) {
    const plan = deps !== undefined ? planFor(name, deps, src, !exprStats.disabled, bytecode) : null;
    const derived = plan !== null ? plan.derived : sizeFromParent(name, deps, src);
    // A size that reads the parent's in only some branches runs on the tracking
    // path, in JavaScript: its reads are then the branch it took, and its mark
    // follows them (below). Marked by its source instead, a branch never taken
    // would take it out of its parent's content size, and a parent sized by its
    // content would collapse round it.
    const byBranch = derived && branches(src);
    // A read reached THROUGH an attribute (`this.control.error`, where `control`
    // is a slot the program rebinds) cannot be prewired: the edge would be bound
    // on whatever the slot held at link time, and stay there when it changed.
    // Such a constraint runs on the tracking path, which subscribes afresh each run.
    const rebindable = deps !== undefined && deps.some((p) => readsThroughSlot(view, classroot, p));
    // ITEMIZED PROFILING (profile.ts): every rule runs in JavaScript, so each run is
    // counted and named — slower, and for profiling only; read once, before boot
    const expr = plan !== null && !byBranch && !rebindable && !ITEMIZE ? plan.expr : null;
    if (expr !== null) {
        if (bindKernelExpr(view, name, expr, classroot, `${declareName(view)}.${name}`, src, pos, yielding, deps, derived)) {
            exprStats.kernel++;
            return;
        }
        exprStats.fallback++;
    }
    if (plan !== null)
        deps = plan.paths;
    const c = compileExpr(src, bodyLabel(declareName(view), name, pos));
    if ("error" in c) {
        throw new DeclareError(`${declareName(view)}.${name} = { … } ${c.error}`, pos);
    }
    const rule = { k: null };
    const fn = byBranch ? branchWatched(view, name, c.fn, rule) : c.fn;
    // A DECLARED default that cannot be evaluated yet (`{ app.shown.value.total
    // ?? 0 }` before the dataset delivers) is simply not applied yet — the live
    // fallback it replaces was never read before its inputs existed, so a
    // program that ran clean keeps running clean. The rule stays armed on what
    // it read up to the throw and lands the value when those inputs change.
    const k = new Constraint(`${declareName(view)}.${name}`, yielding ? () => { try {
        return fn.call(view, view.parent, classroot);
    }
    catch {
        return DEFERRED;
    } } : () => fn.call(view, view.parent, classroot), yielding ? (v) => { if (v !== DEFERRED) {
        k.applied = true;
        writeOwned(view, name, v);
    } } : (v) => setBound(view, name, v), 0, yielding);
    rule.k = k;
    // Retain the authored text + position for the Inspector (inspect.ts explain()).
    k.source = src;
    k.sourcePos = sourceAt(pos);
    if (derived && !byBranch)
        markPercent(k);
    k.declDefault = declDefault;
    own(view, name, k);
    // A YIELDING rule arriving where a layout already places the slot is retired
    // by own() on the spot (a class's own `y` under a column): it must not then be
    // landed or run, or a rule that lost the slot keeps writing it (two TextLabels
    // in a column stacked on one line).
    if (yielding && ownerOf(view, name) !== k)
        return;
    // a numeric slot: the kernel lands the value (gate, store, wake; the surface
    // push follows at the settle's close, as for an EXPR rule)
    const land = kernelLanding(view, name);
    if (land !== null)
        k.landInKernel(land);
    // The static path prewires STABLE-slot edges (attribute cells, a Dataset's
    // `.value` slot — they outlive every recompute). A read of a DATA REGION
    // (`:path` or `.read([…])`) resolves to a cell on the data VALUE tree, which is
    // recreated when the value arrives or is replaced — that dynamic, per-element
    // subscription is the data-binding primitive's to own (docs/system-design/constraints.md §3),
    // so such a constraint stays on the tracking path. (The extractor still lists
    // the region read-path, for legibility/tooling.)
    // `.value.<field>` — a plain chain INTO a data tree — joins them (#15): the
    // dataset's tracked view (data.ts trackedView) makes such reads subscribe to
    // region cells, which live on the value tree and are recreated with it, so
    // the tracking path (re-tracked each run) is the only honest wiring here too.
    if (plan !== null && plan.probes !== null && !byBranch && !rebindable) {
        // Each read-path is an analyzable expression (`this.$root.n`, `this.theme`);
        // compiled once per template and read under tracking to wire the (stable) edge.
        const probes = plan.probes;
        k.wire(() => {
            for (const p of probes) {
                try {
                    p.call(view, view.parent, classroot);
                }
                catch { /* a null-value projection — its tracked prefix is already wired */ }
            }
        }, deps);
    }
    else {
        k.run();
    }
}
/** Does a read-path step through an attribute on its way to the slot it reads
 *  — `this.control.error`, `classroot.form.pending` — rather than through
 *  children, `parent`, `classroot` or the runtime's `$` internals, which a
 *  program does not rebind? An index or a call in the chain counts as through. */
function readsThroughSlot(view, classroot, path) {
    if (path.startsWith(":"))
        return false;
    const segs = path.split(".");
    if (segs.length < 3)
        return false;
    let node = segs[0] === "this" ? view : segs[0] === "parent" ? view.parent : segs[0] === "classroot" ? classroot : undefined;
    for (let i = 1; i < segs.length - 1; i++) {
        const seg = segs[i];
        if (!/^[A-Za-z_$][\w$]*$/.test(seg))
            return true;
        if (typeof node !== "object" || node === null)
            return false;
        if (!seg.startsWith("$") && hasSlot(node, seg))
            return true;
        node = node[seg];
    }
    return false;
}
/** Bind `name = :path` (a value slot reading data, language §9): a standing
 *  computation over exactly that region of the inherited cursor's dataset.
 *  The raw value coerces to the slot's declared type at the boundary; an
 *  unresolved path lands the slot's class default (the chain's end). */
export function bindData(view, name, path, type, plan) {
    const UNRESOLVED = {}; // sentinel: coerceData returns the def verbatim
    const read = plan ?? path; // a selector-bearing path arrives pre-parsed (B3)
    const k = new Constraint(`${declareName(view)}.${name} = :${path}`, () => {
        const v = coerceData(type, view.$data(read), UNRESOLVED);
        return v === UNRESOLVED ? defaultOf(view, name) : v;
    }, (v) => setBound(view, name, v));
    own(view, name, k);
    k.run();
}
/** Bind `datapath = :rel.path`: this view's cursor is the INHERITED cursor
 *  (from the parent chain — never this view's own slot, which it defines)
 *  extended by `rel.path`. Interned, so a re-derivation of the same place
 *  stops at the equality gate. */
export function bindDatapath(view, path) {
    const segs = typeof path === "string" ? splitPath(path) : path;
    const k = new Constraint(`${declareName(view)}.datapath = :${typeof path === "string" ? path : path.join(".")}`, () => {
        const base = inheritedCursor(view.parent);
        return base === null ? null : base.data.$cursorAt([...base.path, ...segs]);
    }, (v) => setBound(view, "datapath", v));
    own(view, "datapath", k);
    k.run();
}
/** Bind `datapath = { expr }`: the expression yields a value from a
 *  dataset (`weatherData.value.rss.channel` — plain TS dereferences), and
 *  toCursor turns it back into a *place*, inside the tracked compute so the
 *  cursor stands on its whole chain (a structural change along it re-runs).
 *  The compute runs under withCursorDefining: a `:path` island in the body
 *  (`datapath = { :detail }`) resolves against the INHERITED cursor, never
 *  the slot this constraint defines — the same rule bindDatapath states. */
export function bindCursor(view, src, pos, classroot) {
    const c = compileExpr(src);
    if ("error" in c) {
        throw new DeclareError(`${declareName(view)}.datapath = { … } ${c.error}`, pos);
    }
    const fn = c.fn;
    // The label names the NODE, not just its class: "View.datapath" sent an
    // author bisecting a 400-line file with perl to find which of thirty Views
    // meant (field report 2026-08-21). The name is how the author wrote it —
    // the member key on the parent or classroot — when there is one.
    const name = authoredName(view);
    const label = `${declareName(view)}${name === null ? "" : ` '${name}'`}.datapath`;
    const k = new Constraint(label, () => withCursorDefining(view, () => toCursor(fn.call(view, view.parent, classroot), label)), (v) => setBound(view, "datapath", v));
    own(view, "datapath", k);
    k.run();
}
// A percent resolves against the parent's extent on the attribute's own
// axis — horizontal slots against parent.width, vertical against
// parent.height (the doc's `width = 100%`, generalized the way CSS
// percentages resolve). Only geometry is Length-typed today; a future
// Length attribute extends this table alongside its schema entry.
const PERCENT_AXIS = {
    x: "width",
    y: "height",
    width: "width",
    height: "height",
};
/** Bind `name = p%` as the runtime constraint described above. The root has
 *  no parent to resolve against — that is an instantiation-context fact, not
 *  a source fact (the same fragment could be checked for embedding
 *  elsewhere), which is why it surfaces here and not in check(). */
/** The authored position a Constraint carries — line, column, and the file
 *  when the value came from an include. Every AUTHOR binding gets one (a `{ }`,
 *  a percent, a position literal): these are the constraints that can meet a
 *  layout's claim on the same slot, and the diagnostic that follows has to
 *  point at the line that wrote the losing value. Null on a compiled artifact
 *  (declarec strips positions) — the messages read exactly as before there. */
function sourceAt(pos) {
    if (pos == null || typeof pos.line !== "number")
        return null;
    const p = pos;
    const at = { line: p.line, col: p.col ?? 0 };
    return p.file !== undefined ? { ...at, file: p.file } : at;
}
/** The axis `name` resolves a percent against, or null when it has none — the
 *  one reading of the table above, so a caller that must REFUSE a percent
 *  before binding it (rich text's inline views: a tag attribute is refused
 *  through the class's `unsupported` policy, never thrown mid-render) asks
 *  the same question bindPercent answers. */
// The kernel's EXPR opcodes this module writes by hand (declare_kernel.h's enum,
// as compiler/src/expr-emit.ts's OP — kept in step by kernel/test).
const OP_END = 0, OP_LOAD = 1, OP_CONST = 2, OP_SUB = 4, OP_MUL = 5, OP_DIV = 6, OP_MAX = 10, OP_EQ = 20, OP_SELECT = 25;
/** Do the runtime's OWN derives (a percent, a position literal) run as kernel
 *  expressions? Yes — they are arithmetic the runtime generates, a sixth of all
 *  the JavaScript rule runs at boot across the apps (bodycensus.mjs,
 *  2026-09-18). `__declareNoKernelDerives` turns it off for an A/B in a
 *  profiling build; a shipped build folds the switch out. */
function kernelDerives() {
    if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && globalThis.__declareNoKernelDerives === true)
        return false;
    return true;
}
/** THE PARENT'S CONTENT BOX as kernel code, reading two slots: the extent and
 *  the axis's inset TOTAL (view.ts keeps it). Exactly View.contentBox, its
 *  zero-inset case included — `pair === 0 ? raw : max(0, raw − pair)` — so an
 *  unpadded parent's degenerate negative extent stays negative, as ruled.
 *  `raw` is path slot 0 and `pair` path slot 1. */
const CONTENT_BOX = [
    OP_LOAD, 1, OP_CONST, 0, OP_EQ, // c: is the inset total zero?
    OP_LOAD, 0, // a: the extent as written
    OP_CONST, 0, OP_LOAD, 0, OP_LOAD, 1, OP_SUB, OP_MAX, // b: max(0, extent − inset)
    OP_SELECT,
];
export function percentAxis(name) {
    return Object.hasOwn(PERCENT_AXIS, name) ? PERCENT_AXIS[name] : null;
}
export function bindPercent(view, name, percent, pos, yielding = false) {
    const cls = declareName(view);
    const axis = Object.hasOwn(PERCENT_AXIS, name) ? PERCENT_AXIS[name] : null;
    if (axis === null) {
        throw new DeclareError(`${cls}.${name} = ${percent}%: no axis to resolve a percent against`, pos);
    }
    if (!(view.parent instanceof View)) {
        throw new DeclareError(`${cls}.${name} = ${percent}%: the root has no parent for a percent to resolve against`, pos);
    }
    // The parent's CONTENT BOX, not its literal one (RULED 2026-09-19): a percent
    // means "this share of the space I am given", and a padded parent gives the
    // room inside its insets. IN THE KERNEL where the cells allow: the content
    // box is two slots (extent, inset total) and CONTENT_BOX is the same
    // arithmetic, so the derive survives the rule. The JavaScript form below is
    // the fallback (a non-numeric slot) and the A/B.
    const inset = axis === "width" ? "$insetX" : "$insetY";
    if (kernelDerives() && bindKernelExpr(view, name, { code: [...CONTENT_BOX, OP_CONST, 1, OP_MUL, OP_END], paths: [`parent.${axis}`, `parent.${inset}`], consts: [0, percent / 100] }, null, `${cls}.${name} = ${percent}%`, `parent.contentBox(${axis}) * ${percent / 100}`, pos, yielding, [], true))
        return;
    const k = percentRule(view, name, percent, pos, yielding);
    own(view, name, k);
    k.run();
}
/** The JavaScript form of `name = p%`, unowned: what bindPercent installs off
 *  the kernel, and what a State's percent override drives while it is the top
 *  of its slot (state.ts) — the same rule either way, so a state's `100%`
 *  resolves against the parent exactly as a declared one does. */
/** `yielding`: a class's own size, a default that gives way to a layout (instantiate.ts CLASS_DEFAULT_GEOMETRY). */
export function percentRule(view, name, percent, pos, yielding = false) {
    const cls = declareName(view);
    const axis = percentAxis(name);
    if (axis === null)
        throw new DeclareError(`${cls}.${name} = ${percent}%: no axis to resolve a percent against`, pos);
    const k = new Constraint(`${cls}.${name} = ${percent}%`, () => (view.parent instanceof View ? view.parent.contentBox(axis) : 0) * (percent / 100), (v) => setBound(view, name, v), 0, yielding);
    markPercent(k); // auto-extent excludes percent-bound child slots (view.ts)
    k.sourcePos = sourceAt(pos); // a percent can lose its slot to a layout — name the line
    return k;
}
/** The slots a view's 2D transform is made of (View.$localTransform). */
const TRANSFORM_SLOTS = ["scale", "scaleX", "scaleY", "rotation", "skewX", "skewY"];
export function isTransformSlot(name) { return TRANSFORM_SLOTS.includes(name); }
/** Can this view be transformed — is it now, is a transform slot set or bound,
 *  does a child animate one? Asked once, when a position literal binds. */
function mayTransform(view) {
    if (view.$is3D())
        return true;
    const f = view.footprint();
    if (f.x !== 0 || f.y !== 0 || f.width !== view.width || f.height !== view.height)
        return true;
    for (const s of TRANSFORM_SLOTS)
        if (isSetOrOwned(view, s))
            return true;
    for (const c of view.children) {
        const a = c.attribute;
        if (typeof a === "string" && TRANSFORM_SLOTS.includes(a))
            return true;
    }
    return false;
}
/** Bind `x = center` / `y = end` — the position literals (value.ts Align).
 *  Symbolic like a percent, resolved as a standing constraint over the
 *  parent's extent AND the view's own. `center` centers the view's box (its
 *  alignBand) — for a Text that is the geometric box, the ordinary meaning
 *  (a label wanting its cap band optically centered uses the library's
 *  TextLabel). `end` aligns end edges — the geometric box, always. The written-out
 *  formula `{ (parent.height - this.height) / 2 }` remains the no-smarts
 *  spelling: only the named literal invokes the optics.
 *
 *  A TRANSFORMED view is placed by the box it visibly covers (its footprint),
 *  as a layout places it — one geometry: two bars rotated ±45° about their
 *  corner and both centered cross at the middle. `transformLater` says a
 *  transform slot binds after this, in the same batch. */
export function bindAlign(view, name, align, pos, transformLater = false, yielding = false) {
    const cls = declareName(view);
    const size = name === "x" ? "width" : "height";
    if (!(view.parent instanceof View)) {
        throw new DeclareError(`${cls}.${name} = ${align}: the root has no parent to align against`, pos);
    }
    // Against the parent's CONTENT box, for the same reason a percent resolves
    // there: a position is measured from the content origin, and centring in the
    // literal box would push a padded parent's child off centre by the leading
    // inset. IN THE KERNEL for the plain box (View.alignBand's base answer: lead
    // 0, the whole size); a view whose alignBand is overridden keeps the
    // JavaScript form, which asks it.
    const insetA = size === "width" ? "$insetX" : "$insetY";
    const transformed = transformLater || mayTransform(view);
    // a child of the App placed at its end is measured against the WINDOW when
    // it is pinned to it (alignRule) — the page frame, not the page's content
    const frameChild = !(view.parent.parent instanceof View);
    if (frameChild && align === "end")
        view.$endAnchor.add(name);
    if (kernelDerives() && !transformed && !frameChild && view.$alignBand === View.prototype.$alignBand && bindKernelExpr(view, name, align === "end"
        ? { code: [...CONTENT_BOX, OP_LOAD, 2, OP_SUB, OP_END], paths: [`parent.${size}`, `parent.${insetA}`, `this.${size}`], consts: [0] }
        : { code: [...CONTENT_BOX, OP_LOAD, 2, OP_SUB, OP_CONST, 1, OP_DIV, OP_END], paths: [`parent.${size}`, `parent.${insetA}`, `this.${size}`], consts: [0, 2] }, null, `${cls}.${name} = ${align}`, align === "end" ? `parent.contentBox(${size}) - this.${size}` : `(parent.contentBox(${size}) - this.${size}) / 2`, pos, yielding, [], true))
        return;
    const k = alignRule(view, name, align, pos, transformed, yielding);
    own(view, name, k);
    k.run();
}
/** The JavaScript form of `name = center | end`, unowned — bindAlign's, and a
 *  State's position override's (as percentRule). */
export function alignRule(view, name, align, pos, transformed = mayTransform(view), yielding = false) {
    const cls = declareName(view);
    const size = name === "x" ? "width" : "height";
    const k = new Constraint(`${cls}.${name} = ${align}`, () => {
        // pinned to the page's frame: the window's extent, which is what it stands against
        const pf = view.parent instanceof View && !(view.parent.parent instanceof View) && view.ignoreScroll;
        const host = pf ? view.parent[size === "width" ? "hostWidth" : "hostHeight"] : undefined;
        // (and its content sits above the home indicator's band, which the DOM
        // runs its box through — anchorEnds; the same inset on every backend)
        const homeBand = pf && size === "height" ? view.parent.safeBottom ?? 0 : 0;
        const P = typeof host === "number" && host > 0 ? host - homeBand : view.parent instanceof View ? view.parent.contentBox(size) : 0;
        if (transformed) {
            // the transformed box: its lead offset from the origin, and its extent
            const f = view.footprint();
            return align === "end" ? P - (f[name] + f[size]) : (P - f[size]) / 2 - f[name];
        }
        if (align === "end")
            return P - view[size];
        const band = view.$alignBand(name);
        return (P - band.size) / 2 - band.lead;
    }, (v) => setBound(view, name, v), 0, yielding);
    markPercent(k); // like a percent: excluded from the parent's auto-extent (no cycle)
    k.sourcePos = sourceAt(pos); // `x = center` meeting a layout's claim names this line
    return k;
}
const DEFERRED = Symbol("deferred");
/** A DECLARED slot's `{ }` default as a standing rule (attributes.ts
 *  AttrSpec.defRule): installed at construction on a slot no attribute channel
 *  set, YIELDING — an author write, a newer owner, or a runtime write retires
 *  it, so the rank-1 fallback the language rules (R6) keeps its rank. A slot
 *  already set or owned (a use-site literal landed, a two-way binding) gets no
 *  rule: the default never applied to it. The meaning is the language's "a
 *  formula until assigned", the same as the lazy fallback this replaced —
 *  motion, states, early reads, assignment: docs/system-design/kernel.md §10a. */
export function bindDeclDefault(view, name, src, pos, classroot, deps, bytecode) {
    if (isSetOrOwned(view, name))
        return;
    bindConstraint(view, name, src, pos, classroot, deps, true, true, bytecode);
    const o = ownerOf(view, name);
    if (o !== null)
        o.declDefault = true;
}
//# sourceMappingURL=bind.js.map