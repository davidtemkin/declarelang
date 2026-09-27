// HTMLText — rich content authored in a whitelisted HTML subset:
// `HTMLText [ html = … ]`. The string is read by html.ts into the block tree
// and rendered by the RichText engine (rich-text.ts). Its own module so a
// program that names only Markdown carries no HTML reader.
import { defineAttributes } from "./attributes.js";
import { RichText } from "./rich-text.js";
import { parseHtml } from "./html.js";
/** Rich content authored in a WHITELISTED HTML subset (`html`), validated at
 *  render time. `unsupported` decides what a tag outside the set does — `strip`
 *  (unwrap, keep text) or `error` (throw) — so LOADED content has defined
 *  behaviour, never silent corruption. Same flow engine as Markdown. */
export class HTMLText extends RichText {
    // folded into the key (as a signature) so a re-themed style re-renders.
    sourceKey() { return this.html + " " + this.unsupported + " " + JSON.stringify(this.textStyles ?? {}); }
    parseSource(opts) { return parseHtml(this.html, this.unsupported, opts); }
    policy() { return this.unsupported; }
}
defineAttributes(HTMLText, {
    html: { def: "" },
    unsupported: { def: "strip" },
    // `textStyles` is the rich BASE's, and inherited (defineAttributes(RichText)):
    // re-declaring it here shadowed that defBinding with a plain default, so a
    // palette provided by an ancestor reached a Markdown and not an HTMLText.
});
//# sourceMappingURL=html-text.js.map