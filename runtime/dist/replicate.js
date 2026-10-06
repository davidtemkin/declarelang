// Replication (language §9): "a node whose path matches many records
// produces one instance per record — replication is the ARTIFACT of the
// match resolving to many, not an imperative loop." A child element with
// `datapath = :items[]` is a template; the parent carries a Replicator — a
// standing computation on the R4 core whose inputs are the inherited cursor
// chain and the matched array region, and whose output is the reconciled set
// of child instances, in DATA ORDER (child order is semantic — the ruled
// exception — and replicated children take their data's order).
//
// Reconciliation is by item IDENTITY (===), first-fit for duplicates: the
// instance bound to a record follows that record. An insert makes exactly
// one new instance; a removal discards exactly one (its whole standing
// machinery retired via View.discard); a pure reorder MOVES live subtrees —
// no instance is rebuilt, no lifecycle re-fires, no item REGION cell wakes
// (cells are identity-anchored, data.ts). What a move does cost: each moved
// instance's cursor re-points (a different interned place), waking its
// `:path` reads once — they read the same record and the equality gate
// stops everything downstream (no push, no paint work). Unmoved instances'
// cursors intern to the same object and don't even do that.
// LZX's LzReplicationManager pooled clones by POSITION and re-bound their
// data — read for intent (the pool idea survives as instance reuse); the
// positional re-binding is what identity matching sheds: instance state
// stays with its record.
//
// Instances are full citizens: the whole construct pipeline runs per
// instance (methods, literals, bindings, classroot = the template's use-site
// scope, onInit — fired once, after the instance is linked and attached), so
// a replicated WeatherSummary behaves exactly like a written one.
//
// The block occupies the template's slot among its siblings: instances
// splice in at the position where the element was written. `prev` anchors it
// — the sibling Node constructed just before the template, or the previous
// Replicator when two blocks are adjacent (its last instance is the anchor,
// recursively, so empty blocks cost nothing).
//
// One reconcile per settle wave, one frame per mutation burst: the
// Replicator is an ordinary Constraint, so N data edits in a turn coalesce
// into one reconcile, whose Surface work lands in the backends' single rAF.
import { diag } from "./errors.js";
import { Node } from "./node.js";
import { View, inheritedCursor, onDiscard, setRowIndex, fireRetireTree, nodeLabel } from "./view.js";
import { Constraint } from "./reactive.js";
import { setBound, armDivergence, nodeDiverged } from "./attributes.js";
import { splitPath, isSelective } from "./path-plan.js";
import { Focus } from "./focus.js";
import { arriveSubtree } from "./spring.js";
import { selectNodes } from "./select.js";
// parent view → its replication blocks: the KERNEL WINDOW API's registry
// (D5: the live window — realized instances + logical positions — is
// first-class runtime/library API; the app-language childViews read refuses
// instead, view.ts).
const BLOCKS = new WeakMap();
/** The replication blocks under `view` — the kernel door for layout
 *  strategies, AT traversal, the inspector, and navigate-to-record. */
export function blocksOf(view) {
    return BLOCKS.get(view) ?? [];
}
/** The inspector's diagnostic payload (materialization.md §3.6 — the trust
 *  requirement): is it windowed, the logical and materialized counts, the
 *  retained set, and whether extent is measured or predicted. */
export function materializationInfo(view) {
    const b = BLOCKS.get(view)?.[0];
    return b === undefined ? null : b.info();
}
export class Replicator {
    parent;
    path;
    classroot;
    make;
    prev;
    plan;
    policy;
    windowing;
    views = [];
    items = [];
    /** Member identities whose init has fired — the membership-anchored
     *  lifecycle (D5): an identity in this set never refires onInit while its
     *  membership lasts; intersected with the live membership on data change,
     *  so leave-and-return is a NEW membership and fires again. */
    inited = new Set();
    fallback = null; // why windowing disengaged (diagnostic)
    logical = 0;
    /** The windowed half (virtualize.ts), made the first time the policy asks
     *  for it; null for a block that replicates fully. */
    win = null;
    lastArr = null; // membership-change detection
    lastLen = -1;
    template;
    constraint;
    /** The record field that identifies an instance across re-derivations
     *  (`key = :field`), split into segments — or null to reconcile by object
     *  identity (===), the default. A derived collection produces FRESH record
     *  objects every recompute, so identity would rebuild all of them; a key
     *  pools by a stable field, so only genuinely changed records rebuild. */
    keyPath;
    constructor(parent, element, path, classroot, make, 
    /** The block's position anchor: the sibling just before it — a Node, a
     *  preceding Replicator (possibly empty), or null at the front. */
    prev, key = null, 
    /** The pre-parsed plan when the path used selectors (B3) — null means
     *  `splitPath(path)` is the plan (pure names, today's fast path). */
    plan = null, 
    /** The virtualization policy (`virtualize = …`; D5). */
    policy = false, 
    /** Windowing (virtualize.ts) — present only when the program can ask for it. */
    windowing = null) {
        this.parent = parent;
        this.path = path;
        this.classroot = classroot;
        this.make = make;
        this.prev = prev;
        this.plan = plan;
        this.policy = policy;
        this.windowing = windowing;
        this.keyPath = key === null ? null : splitPath(key);
        // The instances' element is the template MINUS its many-path attribute
        // (each instance gets its record's cursor instead, written by reconcile)
        // and its replication-metadata attributes (`key`, `windowed`), consumed
        // here.
        this.template = {
            ...element,
            attrs: element.attrs.filter((a) => !(a.name === "datapath" && a.value.kind === "path" && a.value.many) &&
                !(a.name === "key" && a.value.kind === "path") &&
                a.name !== "virtualize" && a.name !== "classFor"),
        };
        this.constraint = new Constraint(`${parent.constructor.name}'s replication (:${path}[])`, () => this.classify(this.match()), (m) => this.reconcile(m));
    }
    /** The live policy answer. A literal is itself; a `{ }` constraint is called
     *  — and callers must only do that from inside match(), so the read lands in
     *  the Constraint's dependency set. A throwing expression is NOT caught: every
     *  other `{ }` in the language propagates, and swallowing this one would make
     *  a broken policy look like a deliberate `false`. */
    wantsVirtual() {
        return typeof this.policy === "function" ? !!this.policy() : this.policy;
    }
    /** First run (instantiate pass two — the tree is linked) + retire with the
     *  parent, so a discarded subtree's replicators can never wake again. */
    arm() {
        const list = BLOCKS.get(this.parent);
        if (list !== undefined)
            list.push(this);
        else
            BLOCKS.set(this.parent, [this]);
        onDiscard(this.parent, () => this.constraint.dispose());
        this.constraint.run();
    }
    // ── The kernel window API (D5: the live window is runtime/library
    //    surface — layout, AT, the inspector, navigate-to-record) ───────────
    /** The block's logical member count. */
    logicalCount() {
        return this.logical;
    }
    /** The realized instances, each with its LOGICAL index — the live
     *  window under the mechanism's name-of-art, spoken as `realized` so the
     *  API never collides with Window-the-class. */
    realized() {
        if (this.win?.active === true)
            return this.win.realized();
        return this.views.map((view, index) => ({ view, index }));
    }
    /** Navigate-to-logical-record (materialization.md §3.5 — required by the
     *  observer boundary): scroll so the record at `index` materializes —
     *  app-level search's landing and the AT-traversal path. Imperative (a
     *  handler's verb), so reads here are untracked by design. Writing the
     *  scroll offset is the whole move: the windowed match tracks it. */
    navigateTo(index) {
        if (this.win?.active === true)
            this.win.navigateTo(index);
        else
            this.views[index]?.scrollIntoView("nearest");
    }
    /** The inspector diagnostic (§3.6). */
    info() {
        const windowed = this.win?.active === true;
        return {
            windowed,
            logical: this.logical,
            ...(windowed ? this.win.info(this.logical) : { materialized: this.views.length, retained: 0, unit: 0, extent: null }),
            fallback: this.fallback,
            identity: this.identityMode(),
        };
    }
    /** The nearest scrolling ancestor (scrolls = y | both), or null. Tracked
     *  when called from match(). */
    findScroller() {
        for (let v = this.parent; v instanceof View; v = v.parent) {
            const ax = v.scrolls;
            if (ax === "y" || ax === "both")
                return v;
        }
        return null;
    }
    /** The tracked half: the inherited cursor chain + the matched region — and
     *  in windowed mode also the scroll box (scrollY, viewport extent, the
     *  offset chain, the first row's measured height): the windowed match is
     *  the SAME standing computation with more tracked dependencies
     *  (materialization.md §3.1). A non-array (unresolved, or scalar) matches
     *  nothing — zero instances, re-matched the moment the region becomes an
     *  array. A SELECTIVE plan (`:rows[2:8][]`) replicates the selection
     *  itself — windowing over selections is a later increment. */
    // ── The class of a record. A block builds every record as the template's
    //    own class; `classFor` (class-for.ts, KindedReplicator) overrides these
    //    four so each record is built as the class its body names, and an
    //    instance serves only records of its own class. ─────────────────────
    /** Tag the matched nodes with their classes (runs inside the match). */
    classify(m) { return m; }
    /** The class matched node `i` is built as. */
    kindAt(_m, _i) { return ""; }
    /** The class a live instance was built as. */
    kindOf(_v) { return ""; }
    /** Build an instance of class `kind`. */
    build(_kind) { return this.make(this.template, this.classroot); }
    match() {
        const none = { data: null, nodes: [], items: [], arrayPath: null, logical: 0, start: 0, unit: 0, windowed: false, dataChanged: true, leading: 0 };
        const base = inheritedCursor(this.parent);
        if (base === null)
            return none;
        if (this.plan !== null && isSelective(this.plan)) {
            if (this.wantsVirtual())
                this.fallback = diag `a selective path replicates its selection fully (windowing over selections is a later increment)`;
            const nodes = selectNodes(base.data, base.path, this.plan);
            return { data: base.data, nodes, items: nodes.map((n) => n.value), arrayPath: null, logical: nodes.length, start: 0, unit: 0, windowed: false, dataChanged: true, leading: 0 };
        }
        const at = this.plan === null ? splitPath(this.path) : selectNodes(base.data, base.path, this.plan)[0]?.path;
        if (at === undefined)
            return { ...none, data: base.data };
        const arrayPath = this.plan === null ? [...base.path, ...at] : at;
        const arr = base.data.read(arrayPath);
        if (!Array.isArray(arr))
            return { ...none, data: base.data };
        const logical = arr.length;
        const dataChanged = arr !== this.lastArr || logical !== this.lastLen;
        this.lastArr = arr;
        this.lastLen = logical;
        // Reading the policy HERE is what makes `virtualize = { … }` reactive:
        // match() is the Constraint's compute, so the thunk's reads are tracked
        // and a changed answer re-runs this — engaging, or disengaging through
        // the branch that returns rows to their declared placement.
        const wants = this.wantsVirtual();
        const full = () => ({
            data: base.data,
            nodes: arr.map((value, i) => ({ path: [...arrayPath, String(i)], value })),
            items: arr,
            arrayPath,
            logical,
            start: 0,
            unit: 0,
            windowed: false,
            dataChanged,
            leading: 0,
        });
        if (!wants) {
            this.fallback = null;
            return full();
        }
        // Engage checks (§3.2: when the arrangement is not one the runtime can
        // predict, FALL BACK TO FULL MATERIALIZATION rather than degrade
        // semantics). Both reads are tracked — a layout arriving or a scroller
        // appearing re-decides.
        const scroller = this.findScroller();
        if (scroller === null) {
            this.fallback = diag `no scrolling ancestor (scrolls = y) to window against`;
            return full();
        }
        // A VERTICAL stacking layout COMPOSES (the layout-aware window's first
        // case): the pass suspends while windowing owns placement (layout.ts),
        // its spacing folds into the row unit, and any other arrangement falls
        // back to full materialization (never degrade semantics).
        const lay = this.parent.layout;
        let gap = 0;
        if (lay !== null) {
            if (lay.axis === "y") {
                gap = typeof lay.spacing === "number" ? lay.spacing : 0;
            }
            else {
                this.fallback = diag `the block's parent runs a layout windowing cannot predict (a vertical SimpleLayout composes; others fall back) — set virtualize = false or drop the layout`;
                return full();
            }
        }
        if (this.windowing === null) {
            this.fallback = diag `windowing is not aboard this build`;
            return full();
        }
        this.fallback = null;
        // The window: the windowed half's tracked reads (the scroll offset, the
        // viewport, the offset chain, the mounted rows' heights) join this match.
        this.win ??= this.windowing(this.windowHost());
        return this.win.match(base.data, arr, arrayPath, dataChanged, scroller, gap);
    }
    /** What the windowed half needs from this block. */
    windowHost() {
        return {
            parent: this.parent,
            inited: this.inited,
            idOf: (item) => this.idOf(item),
            kindAt: (m, i) => this.kindAt(m, i),
            kindOf: (v) => this.kindOf(v),
            build: (kind) => this.build(kind),
            start: () => this.start(),
            leadingAnchor: () => this.leadingAnchor(),
        };
    }
    /** A record's pooling identity, per the REVISED ladder (ruled 2026-07-30,
     *  the invisible version): the explicit `key = :field` override first,
     *  then the INFERRED convention — a record's own scalar `id` field IS its
     *  identity, no declaration anywhere — then the record object itself
     *  (===; the structural-equality fallback catches misses beneath that). */
    idOf(item) {
        if (this.keyPath !== null) {
            let cur = item;
            for (const seg of this.keyPath) {
                if (cur === null || typeof cur !== "object")
                    return undefined;
                cur = cur[seg];
            }
            return cur;
        }
        if (item !== null && typeof item === "object" && !Array.isArray(item) && Object.hasOwn(item, "id")) {
            const v = item.id;
            if (v !== null && v !== undefined && typeof v !== "object")
                return v;
        }
        return item;
    }
    /** The identity mode in force — the inspector's honesty about an invisible
     *  rule (key | id | object; structural fallback applies on misses either
     *  way when keyless). */
    identityMode() {
        if (this.keyPath !== null)
            return "key";
        const first = this.items[0];
        if (first !== null && typeof first === "object" && !Array.isArray(first) && Object.hasOwn(first, "id"))
            return "id";
        return "object";
    }
    reconcile(m) {
        this.logical = m.logical;
        if (m.windowed) {
            // Engaging: the full block's instances become the window's rows.
            if (this.win.active === false && this.views.length > 0) {
                this.win.adopt(this.views, this.items);
                this.views = [];
                this.items = [];
            }
            this.win.reconcile(m);
            return;
        }
        // Windowing disengaged: its mounted rows are this block's instances again.
        if (this.win?.active === true) {
            const back = this.win.release();
            this.views = back.views;
            this.items = back.items;
        }
        const { data, nodes, dataChanged } = m;
        const items = nodes.map((n) => n.value);
        // Membership bookkeeping runs only on DATA-shaped changes: an identity
        // that LEFT the match starts a fresh membership if it returns.
        if (dataChanged && this.inited.size > 0) {
            const members = new Set(m.items.map((item) => this.idOf(item)));
            for (const id of this.inited)
                if (!members.has(id))
                    this.inited.delete(id);
        }
        const pool = new Map();
        const entries = [];
        this.items.forEach((item, i) => {
            const e = { item, view: this.views[i], used: false };
            entries.push(e);
            const id = this.idOf(item);
            const q = pool.get(id);
            if (q !== undefined)
                q.push(e);
            else
                pool.set(id, [e]);
        });
        // An instance serves only a record of its own class: a record whose
        // class changed gets a new instance of its new class.
        const take = (q, kind) => {
            const e = q?.find((p) => !p.used && this.kindOf(p.view) === kind);
            if (e === undefined)
                return undefined;
            e.used = true;
            return e.view;
        };
        // The STRUCTURAL-EQUALITY fallback (materialization.md §4 move 2 — the
        // key-retirement robustness piece): on a KEYLESS block, an identity miss
        // (a transform-derived collection manufacturing fresh record objects)
        // falls back to matching by CONTENT, so unchanged rows survive a
        // recompute without rebuild. Built lazily — the map exists only when a
        // miss happens, and costs only the miss set. A declared `key` IS the
        // identity, so keyed blocks never consult it.
        let byContent = null;
        const contentMatch = (value, kind) => {
            if (this.keyPath !== null || typeof value !== "object" || value === null)
                return undefined;
            if (byContent === null) {
                byContent = new Map();
                for (const e of entries) {
                    if (e.used || typeof e.item !== "object" || e.item === null)
                        continue;
                    const k = safeStringify(e.item);
                    if (k === null)
                        continue;
                    const q = byContent.get(k);
                    if (q !== undefined)
                        q.push(e);
                    else
                        byContent.set(k, [e]);
                }
            }
            const k = safeStringify(value);
            return k === null ? undefined : take(byContent.get(k), kind);
        };
        const next = [];
        const fresh = new Map();
        const misses = [];
        nodes.forEach((node, i) => {
            const id = this.idOf(node.value), kind = this.kindAt(m, i);
            const v = take(pool.get(id), kind) ?? contentMatch(node.value, kind);
            if (v !== undefined)
                next.push(v);
            else {
                next.push(null);
                misses.push({ slot: next.length - 1, id, kind });
            }
        });
        for (const miss of misses) {
            const made = this.build(miss.kind);
            // The membership-anchored lifecycle (D5): a member whose init
            // already fired gets a silent reconstruction — onInit is once per
            // record-membership, never per physical construct.
            if (this.inited.has(miss.id))
                made.suppressInit();
            fresh.set(made.view, made);
            next[miss.slot] = made.view;
        }
        // Cursors, uniformly — and BEFORE anything attaches (field report
        // 2026-09-01 finding 1: attach first-runs a draw() via flush → bindDraw,
        // and a recording built ahead of the cursor read every :path as null; a
        // throw there then aborted the rest of this reconcile — including the
        // re-points an insert-at-front owes every shifted sibling, finding 2).
        // The interned handle equality-gates every instance whose place is
        // unchanged; a moved instance's bindings re-read equal values and the
        // wave dies at the attribute layer's gate.
        next.forEach((v, i) => {
            setBound(v, "datapath", data === null ? null : data.$cursorAt(nodes[i].path));
            setRowIndex(v, rowIndexOf(nodes[i].path));
        });
        // Provisions land BEFORE attach (instantiate's partitionPending): attach
        // first-runs a Text's face push, and a face read that missed a provision
        // the instance was about to install kept the default ink. Cursored first,
        // so a provision reading `:path` boots against its record. Contained per
        // instance, like attach and finish.
        for (const [v, made] of fresh) {
            try {
                made.provide();
            }
            catch (e) {
                reportInstanceThrow(v, "providing", e);
            }
        }
        // Leftovers: instances whose record left. Their onRetire fires NOW —
        // still parented, cursored, and live (the hook's contract); discard's own
        // fire is a no-op after this (once per lifetime).
        const removed = entries.filter((e) => !e.used).map((e) => e.view);
        for (const v of removed)
            fireRetireTree(v);
        const changed = fresh.size > 0 || removed.length > 0 ||
            next.length !== this.views.length ||
            next.some((v, i) => this.views[i] !== v);
        if (changed) {
            // Re-link the block in data order at its slot among the siblings.
            let at = this.start();
            for (const v of this.views)
                this.parent.removeChild(v);
            for (const v of next)
                this.parent.insertChild(v, at++);
            for (const v of removed)
                v.discard();
            // Mirror the order across the seam: walk backwards so each surface
            // lands before its successor's (fresh attach and kept move alike).
            const ps = this.parent.$surface;
            if (ps !== null && this.parent.$backend !== null) {
                let before = this.surfaceAfter(at);
                for (let i = next.length - 1; i >= 0; i--) {
                    const v = next[i];
                    // CONTAINED per instance: attach first-runs member machinery (a
                    // draw() recording), and a program bug throwing there must cost
                    // exactly its own instance — loudly, with the node's path — never
                    // the siblings' cursors, finishes, and bookkeeping below (field
                    // report 2026-09-01: one bad row wedged the whole block, and a
                    // frame-fed draw re-threw forever).
                    try {
                        if (v.$surface === null)
                            v.$attach(this.parent.$backend, ps, before);
                        else
                            ps.insertChild(v.$surface, before);
                    }
                    catch (e) {
                        reportInstanceThrow(v, "attaching", e);
                    }
                    before = v.$surface ?? before;
                }
            }
        }
        // Freshly built instances are presenting a record they were not
        // presenting before: their springs take the arriving target outright
        // (Spring.arrive). Armed, not snapped — the cursor write above
        // invalidates lazily, so the new target is not readable yet.
        for (const v of fresh.keys())
            arriveSubtree(v);
        this.views = next;
        this.items = items;
        for (const [v, made] of fresh) {
            try {
                made.finish();
            }
            catch (e) {
                reportInstanceThrow(v, "finishing", e);
            }
        }
        for (const node of nodes)
            this.inited.add(this.idOf(node.value));
        for (const view of fresh.keys())
            armTree(view);
        if (changed)
            this.parent.$childrenMutated(); // one re-arm per burst
    }
    /** Where the block starts right now: after its anchor. */
    start() {
        const anchor = lastNodeOf(this.prev);
        return anchor === null ? 0 : this.parent.children.indexOf(anchor) + 1;
    }
    /** The last VISIBLE View before the block — the GEOMETRY anchor the
     *  window's leading offset builds on. Distinct from the structural anchor
     *  (`lastNodeOf(this.prev)`): an invisible sibling (a DataGrid Column, a
     *  hidden control) occupies no space — the SimpleLayout rule — so the
     *  walk skips it rather than offsetting below a phantom. */
    leadingAnchor() {
        for (let i = this.start() - 1; i >= 0; i--) {
            const sib = this.parent.children[i];
            if (sib instanceof View && sib.visible && sib.ignoreLayout !== true)
                return sib;
        }
        return null;
    }
    /** The first live surface after the block — the `before` reference the
     *  re-inserted surfaces stack up against (null = the parent's end). */
    surfaceAfter(index) {
        for (let i = index; i < this.parent.children.length; i++) {
            const sib = this.parent.children[i];
            if (sib instanceof View && sib.$surface !== null)
                return sib.$surface;
        }
        return null;
    }
    /** @internal The block's last instance — the next block's anchor. */
    last() {
        if (this.win?.active === true)
            return this.win.last() ?? lastNodeOf(this.prev);
        return this.views.length > 0 ? this.views[this.views.length - 1] : lastNodeOf(this.prev);
    }
}
/** A record's index in its array: the last step of its path. */
function rowIndexOf(path) {
    const n = Number(path[path.length - 1]);
    return Number.isInteger(n) ? n : -1;
}
function lastNodeOf(prev) {
    if (prev === null)
        return null;
    return prev instanceof Replicator ? prev.last() : prev;
}
/** A replicated instance's construction threw — surface it once, loudly,
 *  with the node's path (the field-report contract), and let reconcile keep
 *  going: the defect belongs to the instance whose member threw, and the
 *  siblings' cursors and finishes must land regardless. */
export function reportInstanceThrow(v, phase, e) {
    console.error(`[Declare] ${phase} a replicated ${v.constructor.name} instance (${nodeLabel(v)}) threw: ${e?.message ?? e}`, e);
}
/** Does the keyboard focus live inside this instance's subtree? A focused
 *  row is TOUCHED by definition (focus-as-touched — the D5 deferral, forced
 *  the day a recycled select cell dragged the focus ring to an arbitrary
 *  record): it must never be re-pointed, parked, or discarded under the
 *  user's cursor. */
export function focusedWithin(root) {
    const f = Focus.getFocus();
    if (f === null)
        return false;
    for (let n = f; n !== null; n = n.parent) {
        if (n === root)
            return true;
    }
    return false;
}
/** Has any node in this instance's subtree received a direct write since it
 *  was armed — the §2 divergence probe (attributes.ts). Walked only at
 *  discard decisions; proportional to one instance's subtree. */
export function subtreeDiverged(root) {
    if (nodeDiverged(root))
        return true;
    for (const c of root.children ?? []) {
        if (subtreeDiverged(c))
            return true;
    }
    return false;
}
/** Arm divergence tracking over a finished instance's subtree —
 *  construct-phase writes (literals, bindings, init) never count as touch. */
export function armTree(root) {
    armDivergence(root);
    for (const c of root.children ?? [])
        armTree(c);
}
/** A record's content key for the structural fallback — JSON text, null on
 *  anything JSON can't say (cycles). Key-order-sensitive by design: the safe
 *  side of a miss is a rebuild, which §2 already prices as unobservable. */
function safeStringify(v) {
    try {
        return JSON.stringify(v);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=replicate.js.map