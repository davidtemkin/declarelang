// HTMLText — rich content authored in a whitelisted HTML subset:
// `HTMLText [ html = … ]`. The string is read by html.ts into the block tree
// and rendered by the RichText engine (rich-text.ts). Its own module so a
// program that names only Markdown carries no HTML reader.

import { defineAttributes } from "./attributes.js";
import { RichText } from "./rich-text.js";
import type { Block, ReadOptions } from "./md.js";
import { parseHtml, type Unsupported } from "./html.js";

/** Rich content authored in a WHITELISTED HTML subset (`html`), validated at
 *  render time. `unsupported` decides what a tag outside the set does — `strip`
 *  (unwrap, keep text) or `error` (throw) — so LOADED content has defined
 *  behaviour, never silent corruption. Same flow engine as Markdown. */
export class HTMLText extends RichText {
  declare html: string;
  declare unsupported: Unsupported;
  // folded into the key (as a signature) so a re-themed style re-renders.
  protected sourceKey(): string { return this.html + " " + this.unsupported + " " + JSON.stringify(this.textStyles ?? {}); }
  protected parseSource(opts: ReadOptions): Block[] { return parseHtml(this.html, this.unsupported, opts); }
  protected override policy(): Unsupported { return this.unsupported; }
}

defineAttributes(HTMLText, {
  html: { def: "" },
  unsupported: { def: "strip" },
  // `textStyles` is the rich BASE's, and inherited (defineAttributes(RichText)):
  // re-declaring it here shadowed that defBinding with a plain default, so a
  // palette provided by an ancestor reached a Markdown and not an HTMLText.
});
