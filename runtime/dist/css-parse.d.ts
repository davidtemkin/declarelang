export type RawValue = string;
export type Condition = {
    kind: "tag";
    name: string;
} | {
    kind: "id";
    name: string;
} | {
    kind: "class";
    name: string;
} | {
    kind: "attr";
    name: string;
    op?: "=" | "~=" | "|=";
    value?: string;
} | {
    kind: "pseudo";
    name: "hover" | "active" | "focus";
};
/** One simple selector — a set of conditions that must ALL hold (compound AND). */
export interface SimpleSelector {
    conditions: Condition[];
}
/** A full selector: ancestor-ordered simple selectors (descendant combinator). */
export type SelectorAST = SimpleSelector[];
export interface Rule {
    selector: SelectorAST;
    specificity: number;
    sourceIndex: number;
    decls: Map<string, RawValue>;
    /** Positions (offsets into the CSS text) for compile-time error reporting —
     *  ignored by the matcher. `selPos` = the rule's selector; `declPos` = per
     *  property, its name and value offsets. */
    selPos: number;
    declPos: Map<string, {
        namePos: number;
        valuePos: number;
    }>;
}
export declare class CssUnsupported extends Error {
    /** Offset into the CSS text where the unsupported construct starts. */
    offset?: number;
    constructor(message: string);
}
/** Specificity = sum over every condition: id 100, class/attr 10, tag 1, * 0. */
export declare function specificityOf(sel: SelectorAST): number;
/** Parse a full selector: whitespace-separated simple selectors → a descendant
 *  chain (ancestor-first). Combinators `>`/`+`/`~` and pseudo `:` are rejected. */
export declare function parseSelectorText(text: string): SelectorAST;
/** Parse a full stylesheet text into Rule[]: mask comments (same-length, so
 *  offsets stay valid), split `selector { body }`, expand comma-grouped
 *  selectors to one Rule each (shared decls, own sourceIndex + selPos), stamp
 *  specificity + a monotonic source index. */
export declare function parseCss(text: string): Rule[];
