export type Align = "left" | "center" | "right" | null;
export type Block = {
    t: "heading";
    level: number;
    inline: Inline[];
} | {
    t: "paragraph";
    inline: Inline[];
} | {
    t: "code";
    lang: string;
    text: string;
} | {
    t: "pre";
    inline: Inline[];
} | {
    t: "blockquote";
    blocks: Block[];
} | {
    t: "list";
    ordered: boolean;
    start: number;
    loose: boolean;
    items: ListItem[];
} | {
    t: "table";
    align: Align[];
    header: Inline[][];
    rows: Inline[][][];
} | {
    t: "rule";
};
/** `task` is null for a plain item, true/false for a `- [x]`/`- [ ]` task. */
export interface ListItem {
    task: boolean | null;
    blocks: Block[];
}
export type Inline = {
    t: "text";
    value: string;
} | {
    t: "strong";
    inline: Inline[];
} | {
    t: "em";
    inline: Inline[];
} | {
    t: "strike";
    inline: Inline[];
} | {
    t: "code";
    value: string;
} | {
    t: "link";
    href: string;
    title?: string;
    inline: Inline[];
} | {
    t: "image";
    src: string;
    alt: string;
    title?: string;
} | {
    t: "br";
} | {
    t: "view";
    name: string;
    attrs: Readonly<Record<string, string | true>>;
    key?: string;
} | {
    t: "styled";
    name: string;
    inline: Inline[];
};
/** What a reader needs to know beyond the source — shared by both readers
 *  (html.ts takes the same bag), and every field optional so the default
 *  behaviour is exactly today's. */
export interface ReadOptions {
    /** True when `name` is a class the running program declares — the ONE gate
     *  that turns a tag into an inline view. Absent ⇒ no tag is ever a view. */
    isClass?: (name: string) => boolean;
    /** A refused inline view (a class tag that is not self-closing — this
     *  version places only self-closing tags): the reader keeps going and hands
     *  the sentence here, for the component's `unsupported` policy to report. */
    refuse?: (message: string) => void;
}
/** Scan a self-closing INLINE VIEW tag at `at` (where `src[at]` is `<`): a tag
 *  whose name is a class the program declares. Returns the class name, its
 *  attributes (case PRESERVED — an attribute names a slot, and slots are
 *  camelCase), the reserved `key`, whether the tag closed itself, and the index
 *  past `>`. Null when this `<` does not open a class tag at all, which leaves
 *  every other `<` to the meaning it already has. Shared by both readers. */
export declare function scanViewTag(src: string, at: number, isClass: (name: string) => boolean): {
    name: string;
    attrs: Record<string, string | true>;
    key?: string;
    selfClosing: boolean;
    end: number;
} | null;
/** Parse a Markdown document into its block tree. */
export declare function parse(src: string, opts?: ReadOptions): Block[];
export declare function parseInline(src: string, opts?: ReadOptions): Inline[];
export declare function decodeEntities(s: string): string;
