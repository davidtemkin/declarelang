import type { Dataset } from "./data.js";
import type { PathSeg } from "./datapath.js";
/** An RFC 9535 node: a value plus its location — locations are what let
 *  replication cursor each selected record at its REAL place (`:rows[2:8][]`
 *  instances point at rows 2..7, not 0..5). */
export interface PathNode {
    path: readonly string[];
    value: unknown;
}
/** The strict evaluator over a plain value — every segment RFC-semantics,
 *  leading names included. This is the conformance surface the compliance
 *  tier tests; the reactive entries below ride it after the tracked prefix. */
export declare function evaluatePlan(value: unknown, plan: readonly PathSeg[]): PathNode[];
/** Selected nodes (value + real location) at `base`+`plan` in `data`, under
 *  tracking — replication's entry. The leading names walk through
 *  `Dataset.read` (the tracked, coercing currency); selectors evaluate
 *  strictly from there. */
export declare function selectNodes(data: Dataset, base: readonly string[], plan: readonly PathSeg[]): PathNode[];
/** A plan's VALUE, the `$data` entry: a singular plan (names + indices only)
 *  yields the one value or null (language §9's unresolved contract); a
 *  selective plan yields the nodelist's values — `[]` when nothing matches,
 *  never null (an empty selection is an answer, not an absence). */
export declare function selectValue(data: Dataset, base: readonly string[], plan: readonly PathSeg[]): unknown;
