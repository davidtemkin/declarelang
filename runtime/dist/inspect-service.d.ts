import { App } from "./view.js";
import { type ValueSlice } from "./inspect.js";
/** The subject's root-space origin in the Inspector's coordinate space (the
 *  viewport — its overlay is position:fixed). Zero for a top-level app. For an
 *  app embedded in an island the two differ by the island's position, and every
 *  coordinate crossing that boundary — the picker's hit-test in, the highlight
 *  rects out — must be offset by it, or the outline lands somewhere plausible
 *  and wrong.
 *
 *  A FUNCTION, not a captured value: the island moves whenever anything scrolls,
 *  and a stale origin is exactly the failure that survives a casual check. */
type Origin = () => {
    x: number;
    y: number;
};
export declare function setInspectionTarget(app: App | null, origin?: Origin): void;
export declare function inspectionOrigin(): {
    x: number;
    y: number;
};
export declare function inspectionTarget(): App | null;
export interface TreeRow {
    path: string;
    name: string;
    kind: string;
    depth: number;
    hasKids: boolean;
    visible: boolean;
    constrained: boolean;
    motion: boolean;
}
export interface EvalResult {
    ok: boolean;
    /** What the developer typed, echoed into the transcript. */
    input: string;
    /** Rendered result, or the error text. */
    text: string;
    /** "read" | "eval" | "set" | "bind" | "view" | "error" — the transcript styles on it. */
    verb: string;
    /** Set for `bind`: the slot is now live-bound and will NOT survive reload. */
    temporary?: boolean;
}
/** Evaluate `src` in the scope of the node at `path`. See EvalResult.verb for
 *  the five shapes. Compiler diagnostics are surfaced verbatim — a typo here
 *  reads exactly as it would in source. */
export declare function evaluateIn(app: App, path: string, src: string): EvalResult;
/** The `Inspect` service — installed into `{ }` body scope by index.ts. */
export declare const Inspect: {
    ready: () => boolean;
    /** Flattened tree rows honouring the caller's open-set.
     *
     *  MEMOISED on the rendered content, and it matters more than it looks: the
     *  caller feeds this straight into a Dataset that replicates one view per row.
     *  Handing back a fresh array on every refresh tick makes replication rebuild
     *  hundreds of views several times a second — which is nearly all the CPU an
     *  open Inspector used to burn. Identical content returns the IDENTICAL array,
     *  so the equality gate upstream stops the churn dead. */
    rows: (open: Record<string, boolean>) => TreeRow[];
    node: (path: string) => import("./inspect.js").InspectNode;
    kindOf: (path: string) => string;
    slots: (path: string) => {
        attr: string;
        text: string;
        kind: ValueSlice["kind"];
        open: boolean;
        origin: "constraint" | "set" | "default";
        motion: boolean;
        viewKind?: string;
        color?: string;
    }[];
    explain: (path: string, attr: string) => import("./inspect.js").Provenance | null;
    /** The current value of one of a constraint's wired read-paths, resolved
     *  against the owning node — what makes the dependency list live. */
    depValue: (path: string, readPath: string) => string;
    /** Does a read-path name a view? Then the Why pane can offer to outline it. */
    depTargetPath: (path: string, readPath: string) => string;
    expand: (path: string, attr: string, trail: readonly string[]) => ValueSlice;
    dependents: (attr: string) => {
        path: string;
        attr: string;
        label: string;
    }[];
    rect: (path: string) => {
        x: number;
        y: number;
        width: number;
        height: number;
    } | null;
    at: (x: number, y: number) => string;
    /** WHY the point resolved that way — the hit walk's own decisions in order.
     *  `at` answers what, which is enough when the answer is right and useless
     *  when it is wrong; every interaction bug of the 2026-07 run was a
     *  disagreement between where a view paints and where the walk thinks it is,
     *  and each was diagnosed from outside because nothing could be asked. The
     *  narration instruments THE walk, so it cannot drift from the router, and
     *  it is backend-neutral: the same answer over the DOM bridge, the canvas
     *  host, and the native control channel's `eval`. `pierce` defaults to the
     *  ROUTER's rule (false), so a pointer-transparent view reports as skipped
     *  rather than quietly being the answer — which is the shape of the
     *  homepage's cursor-dot bug, where the dot settled under every resting
     *  pointer and swallowed the page's hover and press. */
    explainHit: (x: number, y: number, pierce?: boolean) => {
        hit: string | null;
        steps: {
            path: string;
            kind: string;
            why: string;
            x: number;
            y: number;
        }[];
    };
    stats: () => {
        nodes: number;
        ownedSlots: number;
        motionBusy: boolean;
    };
    /** Is this view under a datapath? The Object pane badges it, and the
     *  evaluate strip's `:` support depends on it. */
    hasData: (path: string) => boolean;
    dataKeys: (path: string) => string[];
    /** The cursor record as Object-pane rows — the data a `:field` would read,
     *  shown beside the view's own slots rather than hidden behind them. */
    dataRows: (path: string) => {
        key: string;
        text: string;
        kind: string;
        open: boolean;
    }[];
    dataPreview: (path: string) => string;
    evaluate: (path: string, src: string) => EvalResult;
    clock: {
        readonly mode: "auto" | "manual";
        manual(): void;
        auto(): void;
        step(ms?: number): void;
        settleMotion(maxMs?: number): boolean;
    };
};
export {};
