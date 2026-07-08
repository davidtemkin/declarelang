import type { Element, Program } from "./parser.js";
import { View } from "./view.js";
/** Build a Node/View tree from a parsed Program or Element fragment (no
 *  rendering). */
export declare function instantiate(input: Element | Program): View;
