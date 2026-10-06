import type { InputSink, InputWants } from "./backend.js";
import type { HitTarget } from "./input.js";
/** What a backend's surface exposes to the walks. */
export interface SceneSurface {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly visible: boolean;
    readonly children: readonly SceneSurface[];
    readonly parent: SceneSurface | null;
    readonly sink: InputSink | null;
    readonly wants: InputWants | undefined;
    /** The authored `pointerEvents` ("" = the default). */
    readonly pe: string;
    readonly cursorStyle: string;
    readonly scrolls: boolean;
    readonly scrollsX: boolean;
    readonly scrollOffset: number;
    readonly scrollXOffset: number;
    readonly ignoresClip: boolean;
    readonly ignoresScroll: boolean;
    /** The page's own scroller, whose wheel belongs to the browser. */
    readonly pageRoot?: boolean;
    /** A point in the parent's frame, translated already, into this surface's
     *  own untransformed coordinates. */
    invertTransform(lx: number, ly: number): [number, number];
    /** Whether this surface clips its subtree (a box clip or a shape clip). */
    clips(): boolean;
    /** Whether a local point is inside the clip; asked only when `clips()`. */
    insideClip(lx: number, ly: number): boolean;
    /** A windowed list's logical extent — the vertical scroll range's floor
     *  (0 = none). */
    extentFloor(): number;
    /** The content inset (padding) at the end of an axis: bottom for y, right for x. */
    trailingInset(axis: "x" | "y"): number;
}
/** The press target under a point in `s`'s parent frame. Its cursor is the
 *  deepest cursor in its subtree under the point — a surface with no sink shows
 *  its cursor while its press passes to the sink beneath it — else its own. */
export declare function hitWalk(s: SceneSurface, px: number, py: number): HitTarget | null;
/** Where a wheel goes, from a point in `s`'s parent frame: delivered to a
 *  claimant ("claimed"), left to a scroller that owns it ("scroller"), or
 *  neither (null). `root` is the point in the root's frame, which the claimant
 *  hears beside its own. */
export declare function wheelWalk(s: SceneSurface, px: number, py: number, deltaX: number, deltaY: number, pinch: boolean, root: {
    x: number;
    y: number;
}): "claimed" | "scroller" | null;
/** A scroller's content extent along an axis: the furthest edge among its
 *  visible children — an unclipped child's own overflow included unless it
 *  scrolls on that axis, frame chrome included — plus the trailing inset, so a
 *  padded scroller stops a full inset after its content; floored (on y) by a
 *  windowed list's logical extent, which carries the insets already
 *  (virtualize.ts publishes rows plus the parent's padding). */
export declare function contentExtentOf(s: SceneSurface, axis?: "x" | "y"): number;
/** The press walk again, narrating each surface it visits — a diagnostic. */
export declare function traceWalk(s: SceneSurface, px: number, py: number, say: (line: string) => void): void;
/** Whether a local point is inside a box rounded by `corners` (top-left,
 *  top-right, bottom-right, bottom-left, already fitted to the box). */
export declare function insideRoundedBox(lx: number, ly: number, w: number, h: number, corners: readonly [number, number, number, number]): boolean;
