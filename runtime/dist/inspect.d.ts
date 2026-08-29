import { Node } from "./node.js";
import { View } from "./view.js";
import { type MaterializationDiag } from "./replicate.js";
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
    /** Where the view IS, relative to the app's root — as seen, with every
     *  enclosing scroll taken out. This is the one position worth reporting: it is
     *  what `at(x, y)` resolves, what a synthetic pointer must aim at, and what the
     *  Inspector's highlight draws. A naive sum of ancestor x/y is scroll-blind and
     *  reports where a view WOULD have been unscrolled — the same answer until
     *  something scrolls, and then silently wrong. */
    rootX: number;
    rootY: number;
    /** The composed root-frame EXTENTS — the AABB of the frame through every
     *  ancestor transform (scale/rotation), the box the view PAINTS. Equal to
     *  width/height (which stay local, the view's own coordinate space) when no
     *  transform is in play. Under rotation rootX/rootY remain the frame
     *  ORIGIN's image, which is a quad corner, not necessarily the AABB's. */
    rootWidth: number;
    rootHeight: number;
    /** This node's OWN `visible` slot — what the program says about it. */
    visible: boolean;
    /** Whether it is actually SHOWN: its own `visible` and every ancestor's.
     *  These differ exactly when a node is hidden by something above it, which
     *  is the case a reader is usually chasing — `visible: true` on a node
     *  inside a hidden panel is true and useless on its own. */
    shown: boolean;
    text?: string;
    /** The node's OWN attribute values (instance writes and bound results —
     *  the overlay over class defaults). A snapshot. */
    attrs: Record<string, unknown>;
    /** The materialization diagnostic (materialization.md §3.6, the trust
     *  requirement): present on a view carrying a replication block — whether
     *  it is windowed, the logical vs materialized counts, the retained
     *  (touched) set, and whether extent is measured or predicted. */
    materialization?: MaterializationDiag;
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
    /** Loud on a slot that does not exist — never a placid null answer for a
     *  typo'd name (silence turned a missing read into a wrong measurement). */
    error?: string;
    /** True when the provenance below came from an author DECLARATION's `{ }`
     *  default (a live defBinding, not a standing constraint). */
    declaration?: true;
    /** The owning constraint, when one owns the slot: its label, whether it
     *  runs on the compiler-wired static path, and — the static-extraction
     *  payoff — the exact read-paths it was wired to. */
    constraint: {
        label: string;
        static: boolean;
        /** Typed into the Inspector at runtime — not compiled from source. */
        live: boolean;
        deps: readonly string[] | null;
        /** The MACHINERY writer, when the owner is not an authored constraint —
         *  "SimpleLayout" for layout-owned geometry (P2-2, field report
         *  2026-08-05: an anonymous owner with null source/deps was explain()'s
         *  one silent answer, at exactly the moment "a layout wrote it" was the
         *  answer being asked for). Null for authored constraints. */
        writer: string | null;
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
     *  graph — every constraint downstream of the motion lands before return.
     *  Settles BEFORE firing too: a write earlier in this same turn (a bridge
     *  `evaluate`, a handler) may not have propagated to the motion tier yet —
     *  a spring must retarget from it before the frame it is stepped through,
     *  or the step ticks against stale targets and reads as lost motion. */
    step(ms?: number): void;
    /** Register an observer of DRIVEN time — called with each step's ms.
     *  The determinism seam for WALL-CLOCK work: `settleMotion` makes declared
     *  motion frame-exact and costs no real time, so anything on a raw
     *  `setTimeout` (a tooltip's show delay, a press flash) is invisible to it
     *  and fires on whatever the machine's load decides. A harness that
     *  virtualizes timers registers here, and those delays advance WITH the
     *  clock instead of racing it — which is what makes a captured frame the
     *  same picture on a fast machine and a loaded one. Returns an unsubscribe. */
    onStepped(fn: (ms: number) => void): () => void;
    /** Run all in-flight FINITE motion to rest (springs settle, non-looping
     *  animators finish), frame by frame. Perpetual motion — a Time, an
     *  `repeat = Infinity` animator — is life, not transition (RULED
     *  2026-08-06; Ticker.perpetual): it keeps ticking under the steps but
     *  never holds settle open, so a pulsing indicator no longer makes the one
     *  determinism primitive time out. Returns false if `maxMs` of stepped
     *  time wasn't enough — the "this never settles" signal, now reserved for
     *  genuine non-convergence (e.g. a spring perpetually re-armed from its
     *  own rest). */
    settleMotion(maxMs?: number): boolean;
};
/** The `window.__declare` surface boot.ts installs for a top-level app: the
 *  whole inspect API bound to that app's root. What verify's rung 5 drives,
 *  and what a human pokes in the console. */
export declare function bridgeFor(root: Node): Record<string, unknown>;
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
export declare function pickAt(root: Node, x: number, y: number, pierce?: boolean): View | null;
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
export declare function explainHit(root: Node, x: number, y: number, pierce?: boolean): {
    hit: string | null;
    steps: {
        path: string;
        kind: string;
        why: string;
        x: number;
        y: number;
    }[];
};
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
