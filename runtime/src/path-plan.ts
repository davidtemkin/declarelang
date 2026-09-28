// path-plan — the datapath PLAN currency every build carries: the segment
// type, and the three questions the runtime asks of a plan. The scanner that
// finds `:path` islands in body source (datapath.ts) is compile-time work a
// built program never repeats; this is what the running program itself needs.

/** One segment of a compiled path PLAN (data-paths.md §5 emitted plans;
 *  jsonpath-spelling.md — RULED 2026-07-30). A plain string is a NAME
 *  (quoted-name selectors collapse to strings — `['my-key']` is the name
 *  "my-key"); the tagged forms are the RFC 9535 v1 selectors. */
export type PathSeg =
  | string                                              // name
  | { i: number }                                       // index (negative from the end)
  | { s: [number | null, number | null, number | null] } // slice start:end:step (null = RFC default)
  | { w: 1 }                                            // wildcard
  | { c: number };                                      // a computed key `[( expr )]` — the island's computed[c]

/** Does this plan select MANY (slice/wildcard present)? Names and indices are
 *  singular; a selective path is legal in reads and `:path[]` replication,
 *  refused on `<->` and bare `datapath =` (the D4 §4 table). */
export const isSelective = (plan: readonly PathSeg[]): boolean =>
  plan.some((s) => typeof s !== "string" && !("i" in s) && !("c" in s));

/** A singular plan's STATIC segments — names pass, a non-negative index is
 *  its string key. Null when the place needs the data to resolve (a negative
 *  index reads the array's length) or the plan selects many — the cases a
 *  cursor or write target refuses with a pointed error. */
export function staticSegs(plan: readonly PathSeg[]): string[] | null {
  const out: string[] = [];
  for (const s of plan) {
    if (typeof s === "string") out.push(s);
    else if ("i" in s && s.i >= 0) out.push(String(s.i));
    else return null;
  }
  return out;
}

/** Split a dot-path into segments ("" → the cursor itself: no segments).
 *  Array indices are ordinary string segments — JS containers index
 *  identically with "2" and 2, so the path currency stays one type. */
export const splitPath = (path: string): string[] => (path === "" ? [] : path.split("."));
