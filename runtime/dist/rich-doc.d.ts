import type { RichNode } from "./backend.js";
import type { Block } from "./md.js";
import { type Ctx } from "./rich-text.js";
/** The block tree as ONE document flow, for a backend that lays documents out
 *  (`richBlocks`). The twin of layoutBlocks: the same grouping, so the same
 *  gaps — prose in a group spaced by its heading rules, everything else
 *  `blockGap` apart — and the same geometry, as each node's `box`. The
 *  structural nodes carry the numbers their view builders place by. */
export declare function docNodes(blocks: Block[], bodyColor: number, ctx: Ctx): RichNode[];
