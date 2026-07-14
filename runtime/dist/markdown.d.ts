import { View } from "./view.js";
import type { RenderBackend, Surface } from "./backend.js";
import { type Block } from "./md.js";
import { type Unsupported } from "./html.js";
import type { Fill } from "./value.js";
export declare abstract class RichText extends View {
    lineHeight: number;
    bodyColor: number | null;
    scale: number;
    /** Colour-scheme override (null = follow the App's OS `dark`). */
    dark: boolean | null;
    private built;
    /** Parse the current source into the block tree. */
    protected abstract parseSource(): Block[];
    /** The source string(s) folded into the reactive render key, so an edit
     *  (or a policy change) re-parses and re-flows. */
    protected abstract sourceKey(): string;
    /** Named text fills a source can reference (HTMLText's `accents`); none by
     *  default — Markdown has no syntax to name one. */
    protected accentsOf(): Record<string, Fill>;
    /** RichText's `scale` is a FONT-SIZE multiplier consumed by rebuild(), not the
     *  paint transform it means on a plain View — so mask the base flush()'s scale
     *  push. Without this, a `scale` constraint that evaluates before the surface
     *  attaches bakes a CSS transform ON TOP of the scaled fonts (double-scaling),
     *  and the view's measured height no longer matches its painted height. */
    protected flush(s: Surface): void;
    attach(backend: RenderBackend, parentSurface: Surface | null, before?: Surface | null): void;
    /** The colour scheme for the house rich-element palette: the explicit `dark`
     *  override if set (an app whose own theme selector differs from the OS), else
     *  the root App's OS `dark`, read by walking to the tree root. */
    private isDark;
    /** A link run was activated. Mechanism only: fire `onLink(href)` for the app to
     *  dispatch (scroll to an anchor, set a route, open externally). Unhandled, it
     *  falls back to the App's `navigate` channel — so external links work with no
     *  wiring, and an app that owns routing overrides by declaring `onLink`. */
    private dispatchLink;
    private rebuild;
}
/** Rich content authored in Markdown (`text`). */
export declare class Markdown extends RichText {
    text: string;
    protected sourceKey(): string;
    protected parseSource(): Block[];
}
/** Rich content authored in a WHITELISTED HTML subset (`html`), validated at
 *  render time. `unsupported` decides what a tag outside the set does — `strip`
 *  (unwrap, keep text) or `error` (throw) — so LOADED content has defined
 *  behaviour, never silent corruption. Same flow engine as Markdown. */
export declare class HTMLText extends RichText {
    html: string;
    unsupported: Unsupported;
    accents: Record<string, Fill>;
    protected sourceKey(): string;
    protected parseSource(): Block[];
    protected accentsOf(): Record<string, Fill>;
}
