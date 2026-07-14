import type { Program } from "../../runtime/dist/parser.js";
/** Attach `element.link` for every element whose activation handler calls
 *  `navigate(to)` with a resolvable target. Mutates the program in place;
 *  serializeLinks (runtime links.ts) then reads it in walk order. */
export declare function extractLinks(program: Program): void;
