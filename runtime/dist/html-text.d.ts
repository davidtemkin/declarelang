import { RichText } from "./rich-text.js";
import type { Block, ReadOptions } from "./md.js";
import { type Unsupported } from "./html.js";
/** Rich content authored in a WHITELISTED HTML subset (`html`), validated at
 *  render time. `unsupported` decides what a tag outside the set does — `strip`
 *  (unwrap, keep text) or `error` (throw) — so LOADED content has defined
 *  behaviour, never silent corruption. Same flow engine as Markdown. */
export declare class HTMLText extends RichText {
    html: string;
    unsupported: Unsupported;
    protected sourceKey(): string;
    protected parseSource(opts: ReadOptions): Block[];
    protected policy(): Unsupported;
}
