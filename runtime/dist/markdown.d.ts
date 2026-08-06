import { View } from "./view.js";
import type { RenderBackend, Surface } from "./backend.js";
import { type Block } from "./md.js";
import { type Unsupported } from "./html.js";
import type { Fill } from "./value.js";
export declare abstract class RichText extends View {
    lineHeight: number;
    bodyColor: number | null;
    scale: number;
    /** Color-scheme override (null = follow the App's OS `dark`). */
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
    /** The color scheme for the house rich-element palette: the explicit `dark`
     *  override if set (an app whose own theme selector differs from the OS), else
     *  the root App's OS `dark`, read by walking to the tree root. */
    private isDark;
    /** A link run was activated. Mechanism only: fire `onLink(href)` for the app to
     *  dispatch (custom routing — the docs app's openDocLink); unhandled, the href
     *  goes into the App's FOLLOW (location.md §0.5) — "#story" navigates in-app,
     *  anything else leaves through navigate — so authored prose links work with
     *  no wiring at all. (The old fallback was `navigate(href)` raw, which sent a
     *  fragment ref to the HOST as an outbound URL — the browser then opened
     *  DISTRO_ROOT + "#…", a different page entirely: §12.2's second half.) */
    private dispatchLink;
    /** The last layout's blocks, with the geometry each derived from. */
    private laid;
    /** A WIDTH-ONLY change: re-width what is already built instead of rebuilding.
     *
     *  Nothing structural depends on width — `parseSource()` never sees it, and a
     *  RichBlock carries no wrapping (the backend is handed the width and does
     *  the wrapping itself). All width does is set each block's content width and
     *  x. Rebuilding for it re-parsed the source, discarded every view and
     *  re-attached fresh ones, which on the native host meant a synchronous text
     *  layout per flow — ~40 per drag step, 699ms of a 712ms frame, most of it for
     *  flows whose width had not actually changed.
     *
     *  Falls back to a full rebuild if any block has no re-width registered, so an
     *  unconverted block type stays correct. */
    private relayout;
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
