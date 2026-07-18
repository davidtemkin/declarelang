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
}
export declare class CssUnsupported extends Error {
    constructor(message: string);
}
/** Specificity = sum over every condition: id 100, class/attr 10, tag 1, * 0. */
export declare function specificityOf(sel: SelectorAST): number;
/** Parse a full selector: whitespace-separated simple selectors → a descendant
 *  chain (ancestor-first). Combinators `>`/`+`/`~` and pseudo `:` are rejected. */
export declare function parseSelectorText(text: string): SelectorAST;
/** Parse a full stylesheet text into Rule[]: strip comments, split
 *  `selector { body }`, expand comma-grouped selectors to one Rule each (shared
 *  decls, own sourceIndex), stamp specificity + a monotonic source index. */
export declare function parseCss(text: string): Rule[];
