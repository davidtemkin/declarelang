import { Node } from "./node.js";
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
        deps: readonly string[] | null;
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
