import { View } from "./view.js";
type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};
/** The first tracked read of a fact (the attribute table's onTrack), or a drawing. */
export declare function armVisibility(v: View): void;
/** Attach: an armed feed follows the view onto its (re)attached surface. */
export declare function reattachVisibility(v: View): void;
/** Teardown: the feed dies with the view — the backend watch, the generic
 *  computer, any at-rest flush still pending, and the kernel's rule and view. */
export declare function retireVisibility(v: View): void;
/** The kernel visibility rule feeding `v` (−1 = the JS walk, or no feed) —
 *  for the tests that pin which path runs (kernel-vis.test). */
export declare function visibilityRule(v: View): number;
/** The model's own answer — the ancestor walk, with TRACKED reads: the visible
 *  chain, rootTransform, rootFrameBox. The generic feed delivers this value;
 *  the DOM feed runs the same reads purely as a WAKE (below), because the
 *  reads subscribing to exactly the ancestor slots the answer depends on is
 *  what makes the camera case (a world writing only its own scale) invalidate
 *  a descendant's facts with no attribute of its own changing. */
export declare function readVisibility(v: View): {
    on: boolean;
    rect: Rect | null;
    scale: number;
};
export {};
