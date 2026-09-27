import { View } from "./view.js";
import type { Image } from "./image.js";
import type { RichBlock, SlotBox } from "./backend.js";
import type { Block } from "./md.js";
import { type Ctx, type Laid } from "./rich-text.js";
/** Open a build's budget: `maxLines` lines (0 = no clamp), nothing dropped yet. */
export declare function startBudget(maxLines: number): void;
/** Whether the build that just ran dropped anything (`RichText.truncated`). */
export declare function budgetTruncated(): boolean;
/** What the canvas flow needs to size and place one inline image: the persistent
 *  (cached, reactive) Image view plus its natural size and load/fail state. */
export type ImageInfo = {
    view: Image;
    nw: number;
    nh: number;
    loaded: boolean;
    failed: boolean;
};
export type ImageFor = (src: string) => ImageInfo;
/** Canvas fallback: flow the resolved runs as child views (the same greedy
 *  word-wrap as `layoutInline`, but over already-resolved runs). Returns the
 *  views to parent and the total height. Inline images are placed as atomic
 *  replaced boxes via `imageFor` (a persistent Image view per src); an image
 *  whose load has FAILED degrades to its `alt` text. */
export declare function flowRichCanvas(blocks: RichBlock[], width: number, onLink?: (href: string) => void, imageFor?: ImageFor, opts?: {
    measure?: boolean;
    keep?: number;
}): {
    views: View[];
    height: number;
    anchors: Map<string, number>;
    firstBaseline: number | null;
    lines: number;
    slots: Record<string, SlotBox>;
    widest: number;
};
/** Render a block sequence to a list of stacked child views: consecutive
 *  paragraphs/headings coalesce into ONE native TextFlow (contiguous selection and
 *  baselines), and each list/table/quote/code/rule becomes its own reactive
 *  sub-view. The caller stacks the result with a `yStack`. */
export declare function layoutBlocks(blocks: Block[], width: number, bodyColor: number, ctx: Ctx): Laid[];
