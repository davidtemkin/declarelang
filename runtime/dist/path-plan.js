// path-plan — the datapath PLAN currency every build carries: the segment
// type, and the three questions the runtime asks of a plan. The scanner that
// finds `:path` islands in body source (datapath.ts) is compile-time work a
// built program never repeats; this is what the running program itself needs.
/** Does this plan select MANY (slice/wildcard present)? Names and indices are
 *  singular; a selective path is legal in reads and `:path[]` replication,
 *  refused on `<->` and bare `datapath =` (the D4 §4 table). */
export const isSelective = (plan) => plan.some((s) => typeof s !== "string" && !("i" in s) && !("c" in s));
/** A singular plan's STATIC segments — names pass, a non-negative index is
 *  its string key. Null when the place needs the data to resolve (a negative
 *  index reads the array's length) or the plan selects many — the cases a
 *  cursor or write target refuses with a pointed error. */
export function staticSegs(plan) {
    const out = [];
    for (const s of plan) {
        if (typeof s === "string")
            out.push(s);
        else if ("i" in s && s.i >= 0)
            out.push(String(s.i));
        else
            return null;
    }
    return out;
}
/** Split a dot-path into segments ("" → the cursor itself: no segments).
 *  Array indices are ordinary string segments — JS containers index
 *  identically with "2" and 2, so the path currency stays one type. */
export const splitPath = (path) => (path === "" ? [] : path.split("."));
//# sourceMappingURL=path-plan.js.map