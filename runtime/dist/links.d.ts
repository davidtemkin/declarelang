import type { Program, Element, LinkTarget } from "./parser.js";
/** One serialized link: the element's walk-order index plus its target. Sparse
 *  — only navigable elements appear — so the side-list stays small (most
 *  elements are not links). */
export type SerializedLink = {
    i: number;
} & LinkTarget;
/** Every element in a program, in a FIXED pre-order: the root subtree, then each
 *  class body (pre-order within each). The one iteration order serialize/apply
 *  share — and the same order the constraint walk (deps.ts) visits elements in,
 *  so the two side-lists stay mutually consistent. */
export declare function forEachElement(program: Program, fn: (el: Element) => void): void;
/** Collect each navigable element's target with its walk index (compiler side,
 *  after extraction). Empty when a program has no `navigate(to)` links. */
export declare function serializeLinks(program: Program): SerializedLink[];
/** Zip a walk-order link side-list back onto a freshly-parsed program (runtime
 *  side). Additive: an element with no entry keeps `link` undefined. */
export declare function applyLinks(program: Program, list: readonly SerializedLink[]): void;
