import { View } from "./view.js";
export declare function noteNegativeSize(v: View, size: "width" | "height"): void;
/** Judge every pending size whose program is attached (see noteNegativeSize). */
export declare function judgeNegativeSizes(): void;
/** A VIEW WHOSE SIZE NOTHING DECIDES: it takes its size from its children, and
 *  every one of them takes its size from it (`height = 100%` in a row as tall as
 *  its children). Nothing changes, so nothing is noted as it is written: each
 *  size stays at its first 0, and the view draws nothing. One of the layout
 *  questions (boot-check.ts), asked wherever a check comes to rest — a view shown
 *  only later is judged there too. `fresh` keeps one said once across the asks:
 *  once per class and axis (one authored line builds every replicated row). A
 *  layout that STRETCHES them is the way to say "as tall as the tallest", which
 *  is what the message offers. */
export declare function judgeEmptyContainers(root: View, fresh?: (key: string) => boolean): string[];
