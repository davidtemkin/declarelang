import { Node } from "./node.js";
import { View } from "./view.js";
export interface InspectNode {
    /** The component kind — the class's name (`Checkbox`, `View`, `Spring`…). */
    kind: string;
    /** The member name this node is reachable by, when named; else null. */
    name: string | null;
    /** Dotted address from the root — names where they exist, child indices
     *  where they don't: `app.col.opts`, `app.col.3`. `find()` resolves these. */
    path: string;
    x: number;
    y: number;
    width: number;
    height: number;
    /** Root-space position — the parent chain's offsets summed. */
    rootX: number;
    rootY: number;
    visible: boolean;
    text?: string;
    /** The node's OWN attribute values (instance writes and bound results —
     *  the overlay over class defaults). A snapshot. */
    attrs: Record<string, unknown>;
    children: InspectNode[];
}
export declare function kindName(n: Node): string;
/** The member name a child is reachable by — reverse-looked-up on its parent
 *  and its classroot (named children are installed as properties on both
 *  scopes' owners, depending on where they were declared). */
export declare function nameOf(node: Node): string | null;
/** The whole subtree as data. `path` seeds the root's address ("app"). */
export declare function inspect(node: Node, path?: string): InspectNode;
/** Resolve a dotted inspect path (`app.col.opts`, `app.col.3`) to the node.
 *  Returns null (never throws) on a miss — the caller owns the message. */
export declare function find(root: Node, path: string): Node | null;
export interface Provenance {
    attr: string;
    value: unknown;
    /** Was the slot ever set (write or binding), vs riding its class default. */
    set: boolean;
    /** The owning constraint, when one owns the slot: its label, whether it
     *  runs on the compiler-wired static path, and — the static-extraction
     *  payoff — the exact read-paths it was wired to. */
    constraint: {
        label: string;
        static: boolean;
        /** Typed into the Inspector at runtime — not compiled from source. */
        live: boolean;
        deps: readonly string[] | null;
        /** The authored `{ … }` text, when this constraint came from a program. */
        source: string | null;
        pos: {
            line: number;
            col: number;
        } | null;
    } | null;
    /** A Spring child currently driving this slot, with its live target. */
    spring: {
        target: unknown;
        stiffness: unknown;
        damping: unknown;
    } | null;
}
export declare function explain(node: Node, attr: string): Provenance;
/** Counters for leak/perf canaries: node count, constraint-owned slots,
 *  whether motion is in flight. */
export declare function stats(root: Node): {
    nodes: number;
    ownedSlots: number;
    motionBusy: boolean;
};
export declare const clock: {
    readonly mode: "auto" | "manual";
    /** Take the shared clock off rAF; time advances only through step(). */
    manual(): void;
    /** Hand the clock back to the real frame source. */
    auto(): void;
    /** Advance time by `ms` (one synthetic frame), then settle the reactive
     *  graph — every constraint downstream of the motion lands before return. */
    step(ms?: number): void;
    /** Run all in-flight motion to rest (springs settle, animators finish),
     *  frame by frame. Returns false if `maxMs` of stepped time wasn't enough —
     *  the assertion harness's "this never settles" signal. */
    settleMotion(maxMs?: number): boolean;
};
/** The `window.__declare` surface boot.ts installs for a top-level app: the
 *  whole inspect API bound to that app's root. What verify's rung 5 drives,
 *  and what a human pokes in the console. */
export declare function bridgeFor(root: Node): Record<string, unknown>;
/** The VIEW under a root-space point — topmost visible wins, depth-first from
 *  the end of each child list (later siblings paint over earlier ones, the
 *  language's stacking rule). Deliberately geometric rather than routed
 *  through the input router's sink resolution: the picker must find a view
 *  whether or not it declares handlers, and must see the view that is actually
 *  on top even when a transparent sibling would swallow the press. */
export declare function viewAt(root: Node, x: number, y: number): View | null;
/** Every (path, attr) whose constraint READS `target` — the reverse of
 *  `explain().deps`, answering "what moves if this changes?". Computed by
 *  scanning owned slots and matching wired read-paths; O(slots), which at the
 *  desktop's ~1,950 is a few ms and only on demand. Read-paths are matched on
 *  their TAIL (`…hot` matches a dep written `this.parent.parent.hot`), so this
 *  is a useful over-approximation, not a proof — labelled as such in the UI. */
export declare function dependentsOf(root: Node, attr: string): {
    path: string;
    attr: string;
    label: string;
}[];
/** ONE level of a slot's value, for the Inspector's disclosure triangles.
 *  `inspect()` reduces whole subtrees through safeAttr with a depth cap — right
 *  for transport, wrong for a browser, where the developer opens what they want
 *  and nothing else is paid for. Views are never expanded inline (their graph is
 *  cyclic): they are reported as links for the tree to navigate to. */
export interface ValueSlice {
    kind: "primitive" | "record" | "array" | "view" | "dataset" | "opaque";
    /** Rendered leaf value, when primitive. */
    text?: string;
    /** Child entries, when record/array/dataset. */
    entries?: {
        key: string;
        kind: ValueSlice["kind"];
        text: string;
        open: boolean;
    }[];
    /** For a view link: its kind, so the caller can render `FinderWindow ›`. */
    viewKind?: string;
    count?: number;
}
export declare function expandValue(node: Node, attr: string, trail?: readonly string[]): ValueSlice;
export declare function slotsOf(node: Node): {
    attr: string;
    text: string;
    kind: ValueSlice["kind"];
    open: boolean;
    origin: "constraint" | "set" | "default";
    motion: boolean;
    viewKind?: string;
    color?: string;
}[];
