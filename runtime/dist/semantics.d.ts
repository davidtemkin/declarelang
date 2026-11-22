import { View } from "./view.js";
/** One node of the semantic tree. Absent fields are absent facts. */
export interface SemNode {
    /** The view's id, or -1 for a node the runtime made from a rich document. */
    id: number;
    role: string;
    name: string;
    hint?: string;
    /** What is wrong with the value, said with it (an invalid field). */
    error?: string;
    value?: {
        text?: string;
        now?: number | null;
        min?: number;
        max?: number;
        step?: number;
    };
    states: string[];
    actions: string[];
    frame?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    live?: "polite" | "assertive";
    /** a list or grid: how many rows it holds, built or not */
    rowCount?: number;
    /** a row of one: its place, 1-based */
    rowIndex?: number;
    level?: number;
    children: SemNode[];
}
export declare function semanticId(v: View): number;
/** The semantic tree of everything under `root`: a synthetic `application`
 *  node whose children are the program's top-level semantic nodes. Content
 *  behind an open modal is inert, as it is to focus: only the topmost modal's
 *  subtree is reported then, with what paints above it (a toast over a sheet).
 *  Read untracked — building it wakes nothing. */
export declare function semanticTree(root: View): SemNode;
/** The view's role as the tree reads it: what it declares, or what a runtime
 *  leaf is (a field, a picture). A scroller with a name and no role is a
 *  `group` of that name: a scroller is a stop of its own (focus.ts), and a
 *  name needs a role to be read by (ARIA names no generic element). */
export declare function roleOf(v: View): string;
/** The roles a person reaches on their own — a container's name from content leaves them out. */
export declare const REACHED_APART: Set<string>;
export declare const NAMED_BY_CONTENT: Set<string>;
export declare const PRESSED: Set<string>;
export declare const STEPPED: Set<string>;
/** The caption of the `Field` a control is in, when it has no name of its own and is
 *  a kind a field names — `""` otherwise. */
export declare function fieldCaption(v: View, role: string): string;
/** The order a view's children are read in: the order its own `tabOrder()`
 *  gives them, where it writes one, so Tab and a screen reader go the same way
 *  — then every child it leaves out, as declared, since leaving a view out of
 *  Tab does not hide it from reading (`visible` and `exists` do that). Only
 *  the view's own children are placed: a `tabOrder()` naming a view elsewhere
 *  moves Tab there, not what is read. */
export declare function readingOrder(v: View): View[];
/** How many records the replications under a list hold — its own, or those of
 *  the views with no role between it and its rows (a scroller, a body). Only
 *  the outermost replication counts: what a row replicates in turn (its cells)
 *  is not more rows. Null when nothing under it replicates. */
export declare function rowsUnder(v: View): number | null;
/** The text a view holds, in reading order — what a name is taken from. */
export declare function textOf(v: View): string;
/** The name a view whose role is named by its content takes: its words, else
 *  the tip it shows on hover, else the mark it shows. */
export declare function nameOfContent(v: View): string;
/** What a view holds, as a name: its WORDS — the text it shows, and what a
 *  labelled descendant is called — and its MARKS, the names of the role-less
 *  marks it shows (a close icon is "Close"). A mark names only a view with no
 *  words, so a button that says "Add" beside its plus is "Add", not "Add Add". */
export declare function contentOf(v: View): {
    words: string;
    marks: string;
};
/** The tree as indented lines — what `declare-look --semantics` prints, and
 *  what a test compares: `slider "Volume" 40 (0–100) [focused] {increment, decrement}`. */
export declare function formatSemantics(n: SemNode, depth?: number): string;
