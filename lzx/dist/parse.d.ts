import type { Pos } from "./pos.js";
export interface LzxAttr {
    name: string;
    value: string;
    pos: Pos;
}
export interface LzxNode {
    tag: string;
    attrs: LzxAttr[];
    children: LzxNode[];
    text: string;
    pos: Pos;
}
export interface LzxError {
    message: string;
    pos: Pos;
}
export interface LzxDoc {
    root: LzxNode | null;
    errors: LzxError[];
}
export declare function parseLzx(src: string): LzxDoc;
