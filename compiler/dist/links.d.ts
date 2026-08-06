import type { Program } from "../../runtime/dist/parser.js";
/** AUTHORED `link` attributes → the navigation relation, directly (location.md
 *  §0.3): a literal slot IS its target — no inference, no drift. Runs before
 *  extractLinks, which then fills only elements with no authored link (the
 *  un-migrated corpus). A constraint-valued link has no static target here;
 *  the extractor reads the LIVE `link` value off the settled tree instead
 *  (the crawl-checked tier). */
export declare function attachAuthoredLinks(program: Program): void;
/** Attach `element.link` for every element whose activation handler calls
 *  `navigate(to)` with a resolvable target. Mutates the program in place;
 *  serializeLinks (runtime links.ts) then reads it in walk order. An authored
 *  link (attachAuthoredLinks) always wins — inference never overwrites it. */
export declare function extractLinks(program: Program): void;
