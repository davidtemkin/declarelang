import type { Node } from "./node.js";
/** A value as the trace carries it: primitives verbatim (a string up to 120
 *  characters), anything else absent — the trace names the slot; `explain()`
 *  reads it. */
export type TraceValue = number | boolean | string | null;
/** One slot that changed: where, what, and — for a change the settle made —
 *  the rule that made it. */
export interface TraceChange {
    path: string;
    attr: string;
    from?: TraceValue;
    to?: TraceValue;
    /** The constraint that wrote the value (null: a plain write, or unknown). */
    by: {
        rule: string;
        source: string | null;
        line?: number;
        file?: string;
    } | null;
}
/** One settle. `triggers` are the writes that opened it (made by user code
 *  since the previous settle closed); `changes` are what it changed in
 *  response. `unnamed` counts cells that moved but belong to no addressable
 *  slot (a rule's internal cell, a retired instance's). */
export interface TraceSettle {
    n: number;
    /** ms since the trace started, at the settle's open */
    at: number;
    /** the settle's own duration, ms */
    ms: number;
    /** the user code that ran before this settle: "onClick on Button 'go'" */
    origin: string[];
    /** rule runs the kernel reported */
    runs: number;
    triggers: TraceChange[];
    changes: TraceChange[];
    unnamed: number;
}
/** Begin recording, keeping the last `cap` settles. Idempotent: a second
 *  start keeps what was recorded and adopts the new cap. */
export declare function startTrace(cap?: number): void;
/** Stop recording. What was recorded stays readable until `clearTrace()`. */
export declare function stopTrace(): void;
export declare function clearTrace(): void;
export declare function tracing(): boolean;
/** The recorded settles, resolved against the live tree: cells become
 *  `path.attr`, rules become their label and source. `pathOf` is the
 *  bridge's own addressing (inspect.ts), so the paths match `find()`. */
export declare function readTrace(root: Node, pathOf: (n: Node) => string, opts?: {
    onlyTree?: boolean;
}): TraceSettle[];
/** The trace as lines a person reads — one settle per line, its triggers
 *  then its changes, each change with the rule that made it. */
export declare function traceText(settles: TraceSettle[]): string;
