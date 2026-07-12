import { View } from "./view.js";
import type { RenderBackend, Surface } from "./backend.js";
import { type Block } from "./md.js";
import { type Unsupported } from "./html.js";
import type { Fill } from "./value.js";
export declare abstract class RichText extends View {
    lineHeight: number;
    bodyColor: number | null;
    scale: number;
    private built;
    /** Parse the current source into the block tree. */
    protected abstract parseSource(): Block[];
    /** The source string(s) folded into the reactive render key, so an edit
     *  (or a policy change) re-parses and re-flows. */
    protected abstract sourceKey(): string;
    /** Named text fills a source can reference (HTMLText's `accents`); none by
     *  default — Markdown has no syntax to name one. */
    protected accentsOf(): Record<string, Fill>;
    attach(backend: RenderBackend, parentSurface: Surface | null, before?: Surface | null): void;
    /** The root App's colour scheme (`app.dark`), read by walking to the tree root. */
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
