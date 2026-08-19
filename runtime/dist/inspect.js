// inspect — the runtime's structured act of looking (docs/system-design/verify-and-evals.md
// §2.2), and the DRIVEN CLOCK (§2.3). The model can't glance at a screen: the
// tree, its geometry (local AND root-space), each node's own attribute values,
// and — the payoff of static dependency extraction — WHY a slot has its value
// are all queryable as plain data. This is also the foundation the reactive
// inspector (constraints.md §4's tooling commitment) and verify's rung-5
// assertions stand on.
//
// Zero-dependency like the rest of the runtime; pay-per-use (nothing here
// allocates until asked). The `__declare` page bridge is installed by boot.ts
// for top-level apps.
import { Node } from "./node.js";
import { hitAt, traceHitAt, rootFrameOrigin, rootFrameBox } from "./interaction.js";
import { View } from "./view.js";
import { declarationsOf, isSet, ownerOf, ownValues, ownedSlots } from "./attributes.js";
import { materializationInfo } from "./replicate.js";
import { sharedClock, browserScheduler } from "./animate.js";
import { TAGS, LAYOUTS, DATA, ANIMATORS, ANIMATOR_GROUPS, STATES } from "./registry.js";
import { settle } from "./reactive.js";
const isView = (n) => n instanceof View;
/** The component name to SHOW for a node. A named user class carries its own
 *  (`FinderWindow`); an instance-declared anonymous subclass carries whatever
 *  the bundler left behind (`je`, `t`), which is noise. So: take the first name
 *  up the prototype chain that reads like a component name, and fall back to
 *  the registry's own name→class table, which is authoritative and survives
 *  minification because its KEYS are strings. */
const REGISTRY_NAME = new WeakMap();
let registryIndexed = false;
function indexRegistry() {
    if (registryIndexed)
        return;
    registryIndexed = true;
    try {
        for (const table of [TAGS, LAYOUTS, DATA, ANIMATORS, ANIMATOR_GROUPS, STATES]) {
            for (const [name, ctor] of Object.entries(table ?? {})) {
                if (typeof ctor === "function")
                    REGISTRY_NAME.set(ctor, name);
            }
        }
    }
    catch { /* a slim build may omit a table */ }
}
/** Was this class name STAMPED by the program (instantiate.ts synthesize()
 *  does `Object.defineProperty(cls, "name", …)`, which is non-configurable), or
 *  merely inferred by JavaScript from a binding — in which case a bundler will
 *  have minified it to noise like `Pe`? The descriptor tells them apart exactly,
 *  where the name's shape cannot: a real two-letter user class (`Ev`) and a
 *  minified one look identical. */
function stampedName(ctor) {
    const d = Object.getOwnPropertyDescriptor(ctor, "name");
    if (d === undefined || d.configurable !== false)
        return null;
    const v = typeof d.value === "string" ? d.value : "";
    return v === "" ? null : v;
}
export function kindName(n) {
    indexRegistry();
    let ctor = n.constructor;
    let registryHit = null;
    let hops = 0;
    while (typeof ctor === "function" && hops++ < 12) {
        // A name the program stamped wins outright — it is the class the developer
        // wrote, and it survives minification.
        const stamped = stampedName(ctor);
        if (stamped !== null)
            return stamped;
        if (registryHit === null) {
            const own = REGISTRY_NAME.get(ctor);
            if (own !== undefined)
                registryHit = own;
        }
        ctor = Object.getPrototypeOf(ctor);
    }
    if (registryHit !== null)
        return registryHit;
    const raw = n.constructor.name;
    return raw === "" ? "View" : raw;
}
/** Make an attribute value JSON-safe for transport (the InspectNode is API,
 *  §2.2 — it crosses the CDP boundary to verify and any agent). A raw own-value
 *  can be a function, a class instance, or a datapath CURSOR whose `.data`
 *  cycles back through the tree — puppeteer's structured clone silently yields
 *  `undefined` for the whole node on a cycle, which broke driving any
 *  data-bound (replicated) view. So we reduce to primitives, plain arrays, and
 *  plain objects (depth- and cycle-guarded); anything else becomes a short tag. */
function safeAttr(v, depth = 0, seen = new Set()) {
    if (v === null || v === undefined)
        return null;
    const t = typeof v;
    if (t === "string" || t === "boolean")
        return v;
    if (t === "number")
        return Number.isFinite(v) ? v : String(v);
    if (t === "function")
        return "«fn»";
    if (t !== "object")
        return String(v);
    if (seen.has(v) || depth >= 4)
        return "«…»";
    seen.add(v);
    try {
        if (Array.isArray(v))
            return v.slice(0, 64).map((e) => safeAttr(e, depth + 1, seen));
        const proto = Object.getPrototypeOf(v);
        // A class instance (Node, Cursor, Stroke, …) — not a plain object literal.
        if (proto !== Object.prototype && proto !== null) {
            const path = v.path;
            const name = v.constructor?.name ?? "object";
            return Array.isArray(path) ? `«${name} ${path.join(".")}»` : `«${name}»`;
        }
        const out = {};
        for (const k of Object.keys(v))
            out[k] = safeAttr(v[k], depth + 1, seen);
        return out;
    }
    finally {
        seen.delete(v);
    }
}
/** The member name a child is reachable by — reverse-looked-up on its parent
 *  and its classroot (named children are installed as properties on both
 *  scopes' owners, depending on where they were declared). */
export function nameOf(node) {
    for (const holder of [node.parent, node.classroot]) {
        if (holder === null || holder === undefined)
            continue;
        for (const k of Object.keys(holder)) {
            if (k.startsWith("$") || k === "parent" || k === "children" || k === "classroot")
                continue;
            if (holder[k] === node)
                return k;
        }
    }
    return null;
}
/** The whole subtree as data. `path` seeds the root's address ("app"). */
export function inspect(node, path = "app") {
    const v = isView(node) ? node : null;
    // THE one walk (interaction.ts), not a second hand-rolled one. This used to
    // accumulate ancestor x/y directly — the same defect the Inspector's highlight
    // had before rootFrameOrigin existed, and for the same reason: a sum of offsets
    // is blind to every scroll between here and the root, so a row below a pane's
    // fold reported the position it would have had unscrolled. Same walk the
    // highlight and the hit test use, so the three cannot disagree.
    let rootX = 0, rootY = 0, rootWidth = 0, rootHeight = 0;
    if (v !== null) {
        const o = rootFrameOrigin(v);
        rootX = o.x;
        rootY = o.y;
        const b = rootFrameBox(v);
        rootWidth = b.width;
        rootHeight = b.height;
    }
    // effective visibility is inherited, so it is walked from THIS node up
    // rather than threaded down — inspect() is entered at arbitrary depth
    // (`inspect(app.pane.b)`), and a subtree-only fold would report a node
    // inside a hidden panel as shown.
    let shown = true;
    for (let n = node; n !== null; n = n.parent) {
        if (isView(n) && !n.visible) {
            shown = false;
            break;
        }
    }
    const record = {
        kind: kindName(node),
        name: nameOf(node),
        path,
        x: v?.x ?? 0, y: v?.y ?? 0, width: v?.width ?? 0, height: v?.height ?? 0,
        rootX, rootY, rootWidth, rootHeight,
        visible: v?.visible ?? true,
        shown,
        attrs: safeAttr(ownValues(node)),
        children: node.children.map((c, i) => {
            const childName = nameOf(c);
            return inspect(c, `${path}.${childName ?? i}`);
        }),
    };
    const text = node.text;
    if (typeof text === "string" && text !== "")
        record.text = text;
    if (v !== null) {
        const w = materializationInfo(v);
        if (w !== null)
            record.materialization = w;
    }
    return record;
}
/** Resolve a dotted inspect path (`app.col.opts`, `app.col.3`) to the node.
 *  Returns null (never throws) on a miss — the caller owns the message. */
export function find(root, path) {
    const segs = path.split(".").filter((s) => s !== "");
    let cur = root;
    for (let i = segs[0] === "app" ? 1 : 0; i < segs.length; i++) {
        const seg = segs[i];
        const asIndex = /^\d+$/.test(seg) ? cur.children[Number(seg)] : undefined;
        const asName = cur[seg];
        const next = asIndex ?? (asName instanceof Node ? asName : undefined);
        if (next === undefined)
            return null;
        cur = next;
    }
    return cur;
}
export function explain(node, attr) {
    // A slot that does not exist answers LOUDLY — an absent key reads
    // `undefined`, and a harness asking `=== true` is told "no" forever with no
    // error anywhere (measured: a working feature read as broken for 1,097
    // frames). Known = a class accessor/own property, or an author declaration.
    const decls = declarationsOf(node);
    if (!(attr in node) && decls[attr] === undefined) {
        const q = attr.toLowerCase();
        const prefix = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i])
            i++; return i; };
        const near = Object.keys(decls).filter((k) => {
            const c = k.toLowerCase();
            return c.includes(q) || q.includes(c) || prefix(c, q) >= 3;
        });
        return {
            attr, value: undefined, set: false, constraint: null, spring: null,
            error: `no slot '${attr}' on ${kindName(node)}${near.length > 0 ? ` — did you mean ${near.slice(0, 3).map((n) => `'${n}'`).join(", ")}?` : ""}`,
        };
    }
    const owner = ownerOf(node, attr);
    // An author DECLARATION's `{ }` default is served by a live defBinding, not
    // a standing Constraint — its provenance comes from the declaration record
    // (attributes.ts DECLARED), so the slots the program is made of explain
    // themselves exactly as the platform's do (they didn't, until 2026-08-19:
    // View.width had deps/source/pos and the author's fitS had null).
    const decl = owner === null && decls[attr] !== undefined && decls[attr].source !== null ? decls[attr] : undefined;
    let spring = null;
    for (const c of node.children) {
        const s = c;
        if (c.constructor.name === "Spring" && s.attribute === attr) {
            spring = { target: s.to, stiffness: s.stiffness, damping: s.damping };
            break;
        }
    }
    return {
        attr,
        value: safeAttr(node[attr]),
        set: isSet(node, attr),
        constraint: owner !== null
            ? {
                // Composed fresh rather than echoing owner.label: that string is baked
                // at bind time from the raw constructor name, which a bundler may have
                // minified to `t`. kindName() recovers the component's real name.
                label: `${kindName(node)}.${attr}`,
                static: owner.isStatic,
                live: owner.live === true,
                deps: owner.wiredPaths,
                // A sourceless owner is machinery — and for a box slot the writer
                // is almost always the parent's layout. Name it (duck-typed on
                // `place`, the Layout contract; kindName resists minification).
                writer: owner.source == null
                    ? (() => {
                        const p = node.parent ?? null;
                        const lay = p?.layout;
                        return lay != null && typeof lay.place === "function"
                            ? kindName(lay)
                            : null;
                    })()
                    : null,
                source: owner.source,
                pos: owner.sourcePos,
            }
            : decl !== undefined
                ? {
                    label: `${kindName(node)}.${attr}`,
                    static: decl.deps !== null,
                    live: false,
                    deps: decl.deps,
                    writer: null,
                    source: decl.source,
                    pos: decl.pos,
                }
                : null,
        ...(decl !== undefined ? { declaration: true } : {}),
        spring,
    };
}
/** Counters for leak/perf canaries: node count, constraint-owned slots,
 *  whether motion is in flight. */
export function stats(root) {
    let nodes = 0, owned = 0;
    const walk = (n) => {
        nodes++;
        owned += ownedSlots(n).length;
        for (const c of n.children)
            walk(c);
    };
    walk(root);
    return { nodes, ownedSlots: owned, motionBusy: sharedClock.busy };
}
// ── the driven clock (verify-and-evals.md §2.3) ─────────────────────────────
// Motion must be assertable and screenshots reproducible: take the shared
// clock off rAF, step it by hand, run springs/animators to rest on demand.
class ManualScheduler {
    t = typeof performance !== "undefined" ? performance.now() : 0;
    pending = null;
    now() { return this.t; }
    request(cb) { this.pending = cb; return 1; }
    cancel() { this.pending = null; }
    fire(ms) {
        this.t += ms;
        const cb = this.pending;
        this.pending = null;
        if (cb !== null)
            cb(this.t);
    }
}
const manual = new ManualScheduler();
let clockMode = "auto";
/** Observers of driven time (clock.onStepped) — a harness's virtualized timers. */
const stepped = [];
export const clock = {
    get mode() { return clockMode; },
    /** Take the shared clock off rAF; time advances only through step(). */
    manual() {
        if (clockMode === "manual")
            return;
        clockMode = "manual";
        sharedClock.setScheduler(manual);
    },
    /** Hand the clock back to the real frame source. */
    auto() {
        if (clockMode === "auto")
            return;
        clockMode = "auto";
        sharedClock.setScheduler(browserScheduler);
    },
    /** Advance time by `ms` (one synthetic frame), then settle the reactive
     *  graph — every constraint downstream of the motion lands before return.
     *  Settles BEFORE firing too: a write earlier in this same turn (a bridge
     *  `evaluate`, a handler) may not have propagated to the motion tier yet —
     *  a spring must retarget from it before the frame it is stepped through,
     *  or the step ticks against stale targets and reads as lost motion. */
    step(ms = 16.7) {
        if (clockMode !== "manual")
            this.manual();
        settle();
        manual.fire(ms);
        for (const fn of stepped)
            fn(ms); // deferred time rides the driven clock (see onStepped)
        settle();
    },
    /** Register an observer of DRIVEN time — called with each step's ms.
     *  The determinism seam for WALL-CLOCK work: `settleMotion` makes declared
     *  motion frame-exact and costs no real time, so anything on a raw
     *  `setTimeout` (a tooltip's show delay, a press flash) is invisible to it
     *  and fires on whatever the machine's load decides. A harness that
     *  virtualizes timers registers here, and those delays advance WITH the
     *  clock instead of racing it — which is what makes a captured frame the
     *  same picture on a fast machine and a loaded one. Returns an unsubscribe. */
    onStepped(fn) {
        stepped.push(fn);
        return () => { const i = stepped.indexOf(fn); if (i >= 0)
            stepped.splice(i, 1); };
    },
    /** Run all in-flight FINITE motion to rest (springs settle, non-looping
     *  animators finish), frame by frame. Perpetual motion — a Heartbeat, an
     *  `repeat = Infinity` animator — is life, not transition (RULED
     *  2026-08-06; Ticker.perpetual): it keeps ticking under the steps but
     *  never holds settle open, so a pulsing indicator no longer makes the one
     *  determinism primitive time out. Returns false if `maxMs` of stepped
     *  time wasn't enough — the "this never settles" signal, now reserved for
     *  genuine non-convergence (e.g. a spring perpetually re-armed from its
     *  own rest). */
    settleMotion(maxMs = 5000) {
        if (clockMode !== "manual")
            this.manual();
        let t = 0;
        while (sharedClock.settling && t < maxMs) {
            this.step(16.7);
            t += 16.7;
        }
        return !sharedClock.settling;
    },
};
// ── the page bridge ─────────────────────────────────────────────────────────
/** The evaluate service, loaded lazily (it is heavy and boot never needs it)
 *  but PRIMED when the first bridge is created — so by the time anyone calls
 *  `evaluate`, the write applies synchronously INSIDE the call, before the
 *  caller's next statement. Without this, `evaluate("app", 'app.x = 1')`
 *  followed in the same turn by `clock.step()` stepped over a write that had
 *  not landed yet — a sequence that reads as "the Spring never re-evaluates"
 *  (GitHub #17's readout) against a spring that is fine. */
let evalService = null;
let evalServicePriming = false;
function primeEvalService() {
    if (evalService !== null || evalServicePriming)
        return;
    evalServicePriming = true;
    void import("./inspect-service.js").then((m) => { evalService = m; });
}
/** The `window.__declare` surface boot.ts installs for a top-level app: the
 *  whole inspect API bound to that app's root. What verify's rung 5 drives,
 *  and what a human pokes in the console. */
export function bridgeFor(root) {
    primeEvalService();
    return {
        inspect: (path) => {
            const n = path !== undefined ? find(root, path) : root;
            return n !== null ? inspect(n, path ?? "app") : null;
        },
        find: (path) => find(root, path),
        explain: (path, attr) => {
            const n = find(root, path);
            return n !== null ? explain(n, attr) : null;
        },
        stats: () => stats(root),
        /** Geometry + causality queries — the same set the Inspector's panes use, so
         *  an agent, an assert script and the UI all ask the identical questions. */
        slots: (path) => { const n = find(root, path); return n === null ? [] : slotsOf(n); },
        expand: (path, attr, trail = []) => {
            const n = find(root, path);
            return n === null ? null : expandValue(n, attr, trail);
        },
        at: (x, y, pierce = false) => {
            // Default = the router's own rule (pointer-transparent views are
            // skipped, subtree included) — `at()` is the assert surface's "what
            // would take this press", and answering with a view no press can reach
            // made the act of looking lie. `pierce = true` remains for the
            // Inspector's pick tool, which legitimately wants decorative views.
            const v = pickAt(root, x, y, pierce);
            return v === null ? null : { path: pathOf(root, v), kind: kindName(v) };
        },
        /** WHY that point resolved so — the hit walk's own decisions in order.
         *  On the bridge because this is the question a HOST asks: the DOM's
         *  `__declare`, the canvas page, and the native control channel's `eval`
         *  all reach it identically, so "what would take this press, and what did
         *  it step over" is one answer with three transports instead of a verb
         *  per host. (The native `trace` narrates the Mac LAYER walk, which is a
         *  different question about a different tree.) */
        explainHit: (x, y, pierce = false) => explainHit(root, x, y, pierce),
        dependents: (attr) => dependentsOf(root, attr),
        /** Evaluate Declare in the scope of a node — read, set, bind, or add a view.
         *  The Inspector's strip and an agent hit the same entry point. Returns the
         *  result OBJECT synchronously once the primed service has loaded (boot
         *  arranges it) — it used to wrap the answer in Promise.resolve
         *  unconditionally, and JSON.stringify(Promise) is "{}", so any harness
         *  that serialized the reply read an empty object for everything,
         *  including `1 + 2` (field report 2026-08-19). Only the never-primed
         *  first call still returns a promise, for the lazy import. */
        evaluate: (path, src) => {
            if (evalService !== null)
                return evalService.evaluateIn(root, path, src);
            return import("./inspect-service.js").then((m) => {
                evalService = m;
                return m.evaluateIn(root, path, src);
            });
        },
        /** The call table — the bridge describes itself (field report 2026-08-19:
         *  an agent used two of eleven calls for a whole build because nothing
         *  here said what existed; anyone who found __declare at all has found
         *  the one place this answer lands). */
        help: () => BRIDGE_HELP,
        clock,
    };
}
/** One line per bridge call — what it answers and the shape it takes. */
const BRIDGE_HELP = {
    inspect: "inspect(path?) — the node as data: kind, attrs summary, children. Start here; paths look like 'app.sidebar.list'",
    find: "find(path) — the live node object itself (attributes readable/writable directly)",
    explain: "explain(path, attr) — the slot's value AND its provenance: owning constraint or declaration default, source text, line, extracted deps. THE 'why is this value what it is' call",
    slots: "slots(path) — every slot on the node: written, constraint-owned, and author-declared (with origin). Enumeration — how you discover what to assert on",
    expand: "expand(path, attr, trail?) — drill into a record/array/dataset value one level at a time",
    dependents: "dependents(attr) — every constraint that READS the named app attr (the other direction from explain)",
    at: "at(x, y, pierce?) — what a press at this point would land on (the router's own answer); pierce=true includes pointer-transparent views",
    explainHit: "explainHit(x, y, pierce?) — the hit walk's decisions in order: what took the point and what it stepped over",
    stats: "stats() — node/constraint counts for the whole tree",
    evaluate: "evaluate(path, src) — run Declare in the node's scope: read ('width'), compute ('1+2'), set ('width = 40'), bind ('width = { parent.width/2 }'). Returns {ok, text, value} synchronously once primed",
    clock: "clock — the driven clock: manual()/auto()/step(ms)/settleMotion() for deterministic motion in tests",
    help: "help() — this table",
};
/** The dotted address of a live node under `root` — the inverse of find(). */
function pathOf(root, n) {
    const parts = [];
    let cur = n;
    while (cur !== null && cur.parent !== null && cur !== root) {
        const m = nameOf(cur);
        parts.unshift(m ?? String(cur.parent.children.indexOf(cur)));
        cur = cur.parent;
    }
    return ["app", ...parts].join(".");
}
// ── the Inspector's additions ───────────────────────────────────────────────
// Hit-testing, reverse dependency edges, and lazy value expansion — the three
// queries an interactive object browser needs that verify's rung 5 never did.
// All are pay-per-use: nothing here runs until asked.
/** PICK the view under a point — what a press at that point would reach.
 *
 *  NOT the same coordinates as `View.viewAt`, and the two used to share a name,
 *  which cost a reader three wrong conclusions before the difference surfaced.
 *  `View.viewAt` takes the root's CONTENT space (drag events carry those, and it
 *  converts at the boundary); this takes the subject's viewport — the space the
 *  picker's own pointer lives in, since the overlay is fixed, so no conversion is
 *  wanted. Both run THE hit walk (interaction.ts leafAt), the one the pointer is
 *  routed by, so a pick highlights exactly what a press would reach, at any
 *  scroll. `pierce` is the picker's one deviation: a
 *  pointer-transparent view is still selectable,
 *  because a developer asking "what is this?" means the thing they can see.
 *  (This used to be a second, cruder implementation — plain rectangle
 *  containment, blind to clip, scale, and pivot — which is precisely the
 *  duplication that produced a mis-hit window corner elsewhere.) */
export function pickAt(root, x, y, pierce = true) {
    return hitAt(root, x, y, pierce);
}
/** WHY the point resolved the way it did — the hit walk's own decisions, in
 *  order: what it descended into, what it skipped and for which reason, and
 *  what finally took the point.
 *
 *  `pickAt` answers *what*, which is enough when the answer is right and
 *  useless when it is wrong. Every interaction bug of the 2026-07 run was a
 *  disagreement between where a view PAINTS and where the walk THINKS it is —
 *  a scroll term missing from the transform, a cursor-following dot silently
 *  occluding the page, chrome stranded in the wrong parent — and each cost
 *  hours of inference from the outside because nothing could be asked directly.
 *
 *  The narration is produced by instrumenting THE walk (interaction.ts
 *  traceHitAt), so it can never drift from the router's real answer, and it is
 *  backend-neutral: the same question, identically answered, over the DOM
 *  bridge, the canvas host, and the native control channel's `eval`. Takes a
 *  point in the root's viewport, like `pickAt`. `pierce` defaults false —
 *  the router's own rule — so a pointer-transparent view reports as skipped
 *  rather than silently being the answer. */
export function explainHit(root, x, y, pierce = false) {
    const { hit, notes } = traceHitAt(root, x, y, pierce);
    const path = (v) => {
        const parts = [];
        for (let n = v; n !== null && n.parent !== null; n = n.parent) {
            parts.unshift(nameOf(n) ?? String(n.parent.children.indexOf(n)));
        }
        return ["app", ...parts].join(".");
    };
    return {
        hit: hit === null ? null : path(hit),
        steps: notes.map((n) => ({ path: path(n.view), kind: kindName(n.view), why: n.why, x: n.x, y: n.y })),
    };
}
/** Every (path, attr) whose constraint READS `target` — the reverse of
 *  `explain().deps`, answering "what moves if this changes?". Computed by
 *  scanning owned slots and matching wired read-paths; O(slots), which at the
 *  desktop's ~1,950 is a few ms and only on demand. Read-paths are matched on
 *  their TAIL (`…hot` matches a dep written `this.parent.parent.hot`), so this
 *  is a useful over-approximation, not a proof — labelled as such in the UI. */
export function dependentsOf(root, attr) {
    const out = [];
    const walk = (n, path) => {
        for (const slot of ownedSlots(n)) {
            const owner = ownerOf(n, slot);
            const paths = owner?.wiredPaths;
            if (owner == null || paths == null)
                continue;
            if (paths.some((rp) => rp === attr || rp.endsWith("." + attr))) {
                out.push({ path, attr: slot, label: owner.label });
            }
        }
        n.children.forEach((c, i) => {
            const nm = c.$member;
            walk(c, `${path}.${nm ?? i}`);
        });
    };
    walk(root, "app");
    return out;
}
const leafText = (v) => {
    if (v === null || v === undefined)
        return "null";
    const t = typeof v;
    if (t === "string")
        return JSON.stringify(v);
    if (t === "number")
        return Number.isInteger(v) ? String(v) : v.toFixed(2);
    if (t === "boolean")
        return String(v);
    if (t === "function")
        return "«fn»";
    // Name a foreign object by its class rather than printing [object Object].
    const cn = v.constructor?.name;
    return cn !== undefined && cn !== "Object" ? kindName(v) : String(v);
};
const sliceKind = (v) => {
    if (v === null || v === undefined)
        return "primitive";
    if (v instanceof View)
        return "view";
    const t = typeof v;
    if (t !== "object")
        return "primitive";
    if (Array.isArray(v))
        return "array";
    const ctor = v.constructor?.name;
    if (ctor === "Dataset" || ctor === "DataSource")
        return "dataset";
    if (ctor === "Object" || ctor === undefined)
        return "record";
    return "opaque";
};
/** Resolve a dotted value path (`menus.0.items`) inside a slot's value. */
function reach(base, trail) {
    let cur = base;
    for (const k of trail) {
        if (cur === null || cur === undefined)
            return undefined;
        cur = cur[k];
    }
    return cur;
}
export function expandValue(node, attr, trail = []) {
    const root = node[attr];
    const v = reach(root, trail);
    const kind = sliceKind(v);
    if (kind === "view") {
        return { kind, viewKind: kindName(v) };
    }
    if (kind === "primitive" || kind === "opaque") {
        return { kind, text: leafText(v) };
    }
    // A Dataset/DataSource exposes its `.value` — the developer means the data.
    const holder = kind === "dataset" ? v.value : v;
    const hk = sliceKind(holder);
    if (hk === "primitive" || hk === "opaque")
        return { kind: hk, text: leafText(holder) };
    const entries = [];
    if (Array.isArray(holder)) {
        holder.slice(0, 200).forEach((e, i) => {
            const k = sliceKind(e);
            entries.push({
                key: String(i),
                kind: k,
                text: k === "view" ? kindName(e) : k === "array" ? `array[${e.length}]` : k === "record" ? "{ }" : leafText(e),
                open: k === "record" || k === "array" || k === "dataset",
            });
        });
        return { kind: "array", entries, count: holder.length };
    }
    for (const [k, e] of Object.entries(holder).slice(0, 200)) {
        const kk = sliceKind(e);
        entries.push({
            key: k,
            kind: kk,
            text: kk === "view" ? kindName(e) : kk === "array" ? `array[${e.length}]` : kk === "record" ? "{ }" : leafText(e),
            open: kk === "record" || kk === "array" || kk === "dataset",
        });
    }
    return { kind: "record", entries, count: entries.length };
}
/** The slots of a node, in declaration-ish order, each with its provenance —
 *  the Object pane's row source. */
const HEX = (n) => "#" + (n >>> 0).toString(16).padStart(6, "0").toUpperCase().slice(-6);
/** Is this slot declared a color on the node's schema chain? Colors are
 *  stored as plain numbers, and a decimal is unreadable — the pane prints
 *  #RRGGBB and paints a swatch, which is the whole point of showing it. */
function isColorSlot(node, attr) {
    let sc = node.$schema ?? null;
    // No schema handle at runtime — fall back to the conventional names.
    if (sc === null)
        return /color$|^fill$|^stroke$|Color$|color/i.test(attr);
    return false;
}
export function slotsOf(node) {
    const out = [];
    const own = ownValues(node);
    // Author-DECLARED slots too — constraints (defBindings), and plain slots
    // still at their defaults. Without them a slot could be asked for by name
    // but never discovered, and enumeration is how an agent or verify finds out
    // what to assert on (field report 2026-08-19).
    const names = new Set([...Object.keys(own), ...ownedSlots(node), ...Object.keys(declarationsOf(node))]);
    for (const attr of [...names].sort()) {
        const v = node[attr];
        const k = sliceKind(v);
        const owner = ownerOf(node, attr);
        const motion = node.children.some((c) => {
            const s = c;
            const cn = c.constructor.name;
            return (cn === "Spring" || cn === "Animator" || cn === "AnimatorGroup") && s.attribute === attr;
        });
        const colorish = typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 0xFFFFFF && isColorSlot(node, attr);
        out.push({
            attr,
            kind: k,
            color: colorish ? HEX(v) : undefined,
            text: colorish ? HEX(v)
                : k === "view" ? kindName(v) : k === "array" ? `array[${v.length}]` : k === "record" ? "{ }" : k === "dataset" ? "Dataset" : leafText(v),
            open: k === "record" || k === "array" || k === "dataset",
            viewKind: k === "view" ? kindName(v) : undefined,
            origin: owner !== null ? "constraint" : isSet(node, attr) ? "set" : "default",
            motion,
        });
    }
    return out;
}
//# sourceMappingURL=inspect.js.map