import type { RichBlock, SlotBox } from "./backend.js";
/** The surface state a rich flow owns: the one flowing content element, the
 *  observer watching its height, and the two callbacks the flow reports
 *  through. Implemented by DomSurface (dom-backend.ts). */
export interface RichHost {
    readonly element: HTMLElement;
    richEl: HTMLDivElement | null;
    richObserver: ResizeObserver | null;
    onRichResize: ((height: number) => void) | undefined;
    onRichSlots: ((boxes: Record<string, SlotBox>) => void) | undefined;
    /** dom-backend's coalesced iOS selectable-region refresh (module state there). */
    refreshSelectable(el: HTMLElement): void;
}
/** This backend places inline views: `setRichContent` emits one inline-block
 *  placeholder per slot and reads back where the browser put it. */
export declare const richInlineSlots = true;
/** Read back every slot placeholder's box, in flow-local coordinates, and
 *  publish the geometry fact. `offsetLeft`/`offsetTop` rather than a client
 *  rect ON PURPOSE: they are LAYOUT coordinates, so an ancestor `scale` (a CSS
 *  transform) cannot scale the numbers the model then places views with. The
 *  rich host is `position: absolute`, so it is the placeholders' offsetParent.
 *  Called where a layout has already been forced (right after the height read,
 *  and from the ResizeObserver) — never forcing one of its own. */
export declare function measureRichSlots(h: RichHost): void;
/** Width-only follow-up to setRichContent: the host tracks the flow's width
 *  (it bounds a pre block's native horizontal scroller) without re-flowing —
 *  the cheap half the all-`pre` reflow early-out still needs. */
export declare function setRichWidth(h: RichHost, width: number): void;
/** Clamp the flow to `maxLines` (0 lifts the clamp), and answer its new height.
 *
 *  `-webkit-line-clamp` on the flow HOST rather than on a block: the host is
 *  one `-webkit-box` and a clamp there counts lines ACROSS its block children,
 *  which is the cross-block semantics the model wants and not the usual use of
 *  the property. Measured on the probe flow: 209px unclamped, 126px at five
 *  lines, 81px at three, later blocks gone. The browser ends the last kept line
 *  with its own ellipsis, because it is the one that wrapped it. */
export declare function setRichClamp(h: RichHost, maxLines: number): number;
/** Native rich-text flow (RichText). Build ONE flowing content element — a block
 *  per RichBlock (real `<p>`/`<h*>` for a11y), inline runs in NORMAL flow (a
 *  `<span>`/`<code>`) — so the browser wraps, aligns baselines, and lets the user
 *  select/copy/find contiguously. Returns the measured (flowed) height. */
export declare function setRichContent(h: RichHost, blocks: RichBlock[], selectable: boolean, width: number, onResize: (height: number) => void, onLink: (href: string) => void, onSlots?: (boxes: Record<string, SlotBox>) => void): number;
