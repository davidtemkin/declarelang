// Markdown — rich content authored in Markdown: `Markdown [ text = … ]`. The
// string is read by md.ts into the block tree and rendered by the RichText
// engine (rich-text.ts). Its own module so a program that names only HTMLText
// carries no Markdown reader (the registry imports what a program uses).

import { defineAttributes } from "./attributes.js";
import { RichText } from "./rich-text.js";
import { parse, type Block, type ReadOptions } from "./md.js";

/** Rich content authored in Markdown (`text`). */
export class Markdown extends RichText {
  declare text: string;
  // `?? ""` on both: an unresolved `:path` is defined to fall back to the
  // default, but one browser-side crash report (`.replace` on null) suggests a
  // path where a null still reaches here — unreproduced headless, guarded
  // anyway, since the correct rendering of a null source IS the empty flow.
  protected $sourceKey(): string { return this.text ?? ""; }
  protected $parseSource(opts: ReadOptions): Block[] { return parse(this.text ?? "", opts); }
}

defineAttributes(Markdown, {
  text: { def: "" },
});
