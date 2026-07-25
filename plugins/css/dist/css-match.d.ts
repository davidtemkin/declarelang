import { type Rule, type SelectorAST, type RawValue } from "./css-parse.js";
export interface MatchView {
    /** This class + ancestors, for subclass-aware tag matching. */
    tagChain: readonly string[];
    id: string;
    /** Whitespace-tokenized for `.class` (`~=`) membership. */
    styleclass: string;
    attr(name: string): unknown;
    /** Interaction state for a pseudo-class: hover/active/focus. */
    pseudo(name: string): boolean;
    parent: MatchView | null;
}
export interface RuleSet {
    rules: readonly Rule[];
}
/** Build a RuleSet from CSS text (mirrors buildStylesheet). */
export declare function buildRuleSet(cssText: string): RuleSet;
/** Does the full selector (descendant chain, ancestor-first) match `view`? The
 *  rightmost simple selector must match `view`; earlier ones must each match
 *  some strictly-higher ancestor, in order (standard descendant semantics). */
export declare function matches(view: MatchView, sel: SelectorAST, forcePointer?: boolean): boolean;
/** Does any simple selector carry a `:hover`/`:active` pseudo? Static AST scan
 *  (no view) — the applier uses it to decide whether a view needs an
 *  interaction sink (pointer hit-testing). `:focus` is deliberately excluded. */
export declare function containsPointerPseudo(sel: SelectorAST): boolean;
/** The per-view cascade: declarations of all rules matching `view`, folded in
 *  ascending (specificity, sourceIndex) so a later/more-specific rule overrides
 *  only the properties it declares. No parent-cache inheritance. */
export declare function matched(view: MatchView, ruleSet: RuleSet): Map<string, RawValue>;
