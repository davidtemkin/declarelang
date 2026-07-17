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
