import { RichText } from "./rich-text.js";
import { type Block, type ReadOptions } from "./md.js";
/** Rich content authored in Markdown (`text`). */
export declare class Markdown extends RichText {
    text: string;
    protected sourceKey(): string;
    protected parseSource(opts: ReadOptions): Block[];
}
