export interface ValueChange {
    readonly name: string;
    readonly previousValue: unknown;
    readonly currentValue: unknown;
}
type ChangeDispatch = (node: object, changed: readonly ValueChange[]) => void;
/** view.ts installs the dispatcher (this module cannot import it). */
export declare function setChangeDispatcher(fn: ChangeDispatch): void;
/** Arm (or re-arm) `node` on exactly `names`. Called when the node goes live
 *  (view.ts, on `init`) and again whenever its `trackChanges` list is rebound,
 *  so a name added later starts silent rather than firing on arrival. A name
 *  the node does not have is refused HERE as well as by the checker: a computed
 *  list is not visible at compile time, and the alternative is a value that
 *  quietly never reports. */
export declare function trackNode(node: object, names: readonly string[] | null): void;
/** A retiring node leaves (node.ts runRetire), and its constraints with it. */
export declare function untrackNode(node: object): void;
/** The settle's close: deliver one event per node that moved, in the order the
 *  names were written. Returns whether anything fired, so the loop knows to run
 *  another pass for whatever the handlers wrote. */
export declare function fireChanges(): boolean;
/** The settle chain is over (reactive.ts, in its cleanup): a value may be
 *  delivered again in the next chain. */
export declare function endChangeChain(): void;
export {};
