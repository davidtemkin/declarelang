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
    inline: Inline[];
} | {
    t: "br";
} | {
    t: "fill";
    name: string;
    inline: Inline[];
};
/** Parse a Markdown document into its block tree. */
export declare function parse(src: string): Block[];
export declare function parseInline(src: string): Inline[];
export declare function decodeEntities(s: string): string;
