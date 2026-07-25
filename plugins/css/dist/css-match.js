// The CSS matcher: given a structural view (MatchView) and a parsed RuleSet,
// decide which rules apply and cascade their declarations. A port of OL5's
// LzCSSStyle matching WITHOUT getPropertyCache's parent-cache — matching is
// per-view; inheritance of properties like `color` is left to declarelang's
// prevailing-follow. View-free: it reads only the MatchView interface, so it is
// fully unit-testable with plain objects. v1 does a linear scan (compound
// selectors span buckets; corpora are tiny) — bucketing is a later optimization.
import { parseCss } from "./css-parse.js";
/** Build a RuleSet from CSS text (mirrors buildStylesheet). */
export function buildRuleSet(cssText) {
    return { rules: parseCss(cssText) };
}
function tokens(s) {
    return s.trim() === "" ? [] : s.trim().split(/\s+/);
}
/** Do all of one simple selector's conditions hold on `view`? With
 *  `forcePointer`, `:hover`/`:active` are treated as satisfied (the tracking
 *  pass — "would this match if the pointer-pseudo were active"); `:focus` always
 *  reads its real state. */
function simpleMatches(view, conditions, forcePointer = false) {
    for (const c of conditions) {
        if (c.kind === "tag") {
            if (!view.tagChain.includes(c.name))
                return false;
        }
        else if (c.kind === "id") {
            if (view.id !== c.name)
                return false;
        }
        else if (c.kind === "class") {
            if (!tokens(view.styleclass).includes(c.name))
                return false;
        }
        else if (c.kind === "pseudo") {
            if (forcePointer && (c.name === "hover" || c.name === "active"))
                continue;
            if (!view.pseudo(c.name))
                return false;
        }
        else {
            // attribute condition
            const v = view.attr(c.name);
            if (c.op === undefined) {
                if (v === undefined || v === null || v === false)
                    return false;
            }
            else {
                const s = v === undefined || v === null ? "" : String(v);
                if (c.op === "=") {
                    if (s !== c.value)
                        return false;
                }
                else if (c.op === "~=") {
                    if (!tokens(s).includes(c.value ?? ""))
                        return false;
                }
                else if (c.op === "|=") {
                    if (!(s === c.value || s.startsWith((c.value ?? "") + "-")))
                        return false;
                }
            }
        }
    }
    return true;
}
/** Does the full selector (descendant chain, ancestor-first) match `view`? The
 *  rightmost simple selector must match `view`; earlier ones must each match
 *  some strictly-higher ancestor, in order (standard descendant semantics). */
export function matches(view, sel, forcePointer = false) {
    if (sel.length === 0)
        return true;
    const last = sel[sel.length - 1];
    if (!simpleMatches(view, last.conditions, forcePointer))
        return false;
    let ancestorIdx = sel.length - 2;
    let node = view.parent;
    while (ancestorIdx >= 0) {
        if (node === null)
            return false;
        if (simpleMatches(node, sel[ancestorIdx].conditions, forcePointer))
            ancestorIdx--;
        node = node.parent;
    }
    return true;
}
/** Does any simple selector carry a `:hover`/`:active` pseudo? Static AST scan
 *  (no view) — the applier uses it to decide whether a view needs an
 *  interaction sink (pointer hit-testing). `:focus` is deliberately excluded. */
export function containsPointerPseudo(sel) {
    return sel.some((s) => s.conditions.some((c) => c.kind === "pseudo" && (c.name === "hover" || c.name === "active")));
}
/** The per-view cascade: declarations of all rules matching `view`, folded in
 *  ascending (specificity, sourceIndex) so a later/more-specific rule overrides
 *  only the properties it declares. No parent-cache inheritance. */
export function matched(view, ruleSet) {
    const hits = ruleSet.rules.filter((r) => matches(view, r.selector));
    hits.sort((a, b) => a.specificity - b.specificity || a.sourceIndex - b.sourceIndex);
    const out = new Map();
    for (const r of hits)
        for (const [k, v] of r.decls)
            out.set(k, v);
    return out;
}
//# sourceMappingURL=css-match.js.map