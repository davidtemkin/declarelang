import type { Program } from "./parser.js";
/** A `{ }` code value, with the compiler's extracted deps optionally attached. */
type WithDeps = {
    kind: "code";
    src: string;
    deps?: readonly string[];
};
/** Every `{ }` code value in a program, in a FIXED order: the root subtree then
 *  each class body; within an element, attributes, then computed decl defaults,
 *  then children (pre-order). The one iteration order serialize/apply share. */
export declare function forEachCodeValue(program: Program, fn: (v: WithDeps) => void): void;
/** Collect each code value's attached deps in walk order (compiler side, after
 *  annotation). Empty arrays hold the position for un-annotated / residue slots. */
export declare function serializeDeps(program: Program): string[][];
/** Zip a walk-order dep list back onto a freshly-parsed program (runtime side).
 *  Additive: a missing/empty entry leaves the slot on the tracking fallback. */
export declare function applyDeps(program: Program, list: readonly (readonly string[])[]): void;
export {};
