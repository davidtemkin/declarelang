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
import { View } from "./view.js";
import { isSet, ownerOf, ownValues, ownedSlots } from "./attributes.js";
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
    let rootX = 0, rootY = 0;
    for (let n = node; n !== null && n.parent !== null; n = n.parent) {
        if (isView(n)) {
            rootX += n.x;
            rootY += n.y;
        }
    }
    const record = {
        kind: kindName(node),
        name: nameOf(node),
        path,
        x: v?.x ?? 0, y: v?.y ?? 0, width: v?.width ?? 0, height: v?.height ?? 0,
        rootX, rootY,
        visible: v?.visible ?? true,
        attrs: safeAttr(ownValues(node)),
        children: node.children.map((c, i) => {
            const childName = nameOf(c);
            return inspect(c, `${path}.${childName ?? i}`);
        }),
    };
    const text = node.text;
    if (typeof text === "string" && text !== "")
        record.text = text;
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
    const owner = ownerOf(node, attr);
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
                source: owner.source,
                pos: owner.sourcePos,
            }
            : null,
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
     *  graph — every constraint downstream of the motion lands before return. */
    step(ms = 16.7) {
        if (clockMode !== "manual")
            this.manual();
        manual.fire(ms);
        settle();
    },
    /** Run all in-flight motion to rest (springs settle, animators finish),
     *  frame by frame. Returns false if `maxMs` of stepped time wasn't enough —
     *  the assertion harness's "this never settles" signal. */
    settleMotion(maxMs = 5000) {
        if (clockMode !== "manual")
            this.manual();
        let t = 0;
        while (sharedClock.busy && t < maxMs) {
            this.step(16.7);
            t += 16.7;
        }
        return !sharedClock.busy;
    },
};
// ── the page bridge ─────────────────────────────────────────────────────────
/** The `window.__declare` surface boot.ts installs for a top-level app: the
 *  whole inspect API bound to that app's root. What verify's rung 5 drives,
 *  and what a human pokes in the console. */
export function bridgeFor(root) {
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
        at: (x, y) => {
            const v = viewAt(root, x, y);
            return v === null ? null : { path: pathOf(root, v), kind: kindName(v) };
        },
        dependents: (attr) => dependentsOf(root, attr),
        /** Evaluate Declare in the scope of a node — read, set, bind, or add a view.
         *  The Inspector's strip and an agent hit the same entry point. */
        evaluate: async (path, src) => {
            const m = await import("./inspect-service.js");
            return m.evaluateIn(root, path, src);
        },
        clock,
    };
}
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
/** The VIEW under a root-space point — topmost visible wins, depth-first from
 *  the end of each child list (later siblings paint over earlier ones, the
 *  language's stacking rule). Deliberately geometric rather than routed
 *  through the input router's sink resolution: the picker must find a view
 *  whether or not it declares handlers, and must see the view that is actually
 *  on top even when a transparent sibling would swallow the press. */
export function viewAt(root, x, y) {
    let best = null;
    const walk = (n, ox, oy) => {
        if (!isView(n))
            return;
        if (n.visible === false)
            return;
        const left = ox + (n.x || 0);
        const top = oy + (n.y || 0);
        const w = n.width || 0;
        const h = n.height || 0;
        const inside = x >= left && x <= left + w && y >= top && y <= top + h;
        if (inside)
            best = n;
        // Descend regardless of `inside`: a child may overflow an unclipped parent.
        for (const c of n.children)
            walk(c, left, top);
    };
    walk(root, 0, 0);
    return best;
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
    const names = new Set([...Object.keys(own), ...ownedSlots(node)]);
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