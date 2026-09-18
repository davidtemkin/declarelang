import { View } from "./view.js";
import type { RenderBackend, Surface } from "./backend.js";
import { type FontWeight, type TextTransform } from "./measure.js";
import { type Numerals, type NumeralWidth } from "./font-features.js";
import { type FamilyValue } from "./font-value.js";
import { type Block, type ReadOptions } from "./md.js";
import { type Unsupported } from "./html.js";
import type { Fill, Shadow, Outline, Color } from "./value.js";
export interface RunStyle {
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: FontWeight;
    italic?: boolean;
    textColor?: number;
    textFill?: Fill;
    letterSpacing?: number;
    textShadow?: Shadow | null;
    outline?: Outline | null;
    textTransform?: TextTransform;
    smallCaps?: boolean;
    numerals?: Numerals;
    numeralWidth?: NumeralWidth;
    slashedZero?: boolean;
    underline?: boolean;
    strike?: boolean;
}
export declare abstract class RichText extends View {
    textColor: Color;
    fontSize: number;
    /** A family string, a Font, or a list of them. */
    fontFamily: FamilyValue;
    fontWeight: FontWeight;
    letterSpacing: number;
    headingColor: Color;
    headingWeight: FontWeight;
    linkColor: Color;
    codeColor: Color;
    codeSize: number;
    codeFamily: FamilyValue;
    codeBackground: Color;
    codeRule: Color;
    richTextLayout: Readonly<Record<string, {
        maxWidth?: number;
        margin?: readonly [number, number];
        align?: "left" | "center" | "right";
    }>> | null;
    lineHeight: number;
    /** Line clamp over the whole flow (schema.ts). 0 = unclamped. */
    maxLines: number;
    /** True when the clamp dropped something — what a "Show more" binds to. */
    truncated: boolean;
    bodyColor: number | null;
    linkUnderline: boolean;
    scale: number;
    /** Color-scheme override (null = follow the App's OS `dark`). */
    dark: boolean | null;
    /** The y of the first line's baseline in this box — what `align = baseline`
     *  sits a Markdown/HTMLText on. A flow CLAIMS it (never discovered by the
     *  layout): the first block's first line when the document opens with prose;
     *  null when it opens with a table, list, code or rule, which is "declares
     *  none" to a baseline row. Read-only, reactive — re-claimed on every rebuild
     *  and re-width. */
    baseline: number | null;
    private built;
    /** Parse the current source into the block tree. `opts` carries the inline-view
     *  gate (which tag names are program classes) and the refusal channel. */
    protected abstract parseSource(opts: ReadOptions): Block[];
    /** What a refused piece of content does: `strip` (drop it, keep going, say so
     *  once) or `error` (throw). HTMLText declares it; Markdown has no such
     *  attribute and takes the default, which is also what raw markup has always
     *  done there — it stays the text it was written as. */
    protected policy(): Unsupported;
    /** The source string(s) folded into the reactive render key, so an edit
     *  (or a policy change) re-parses and re-flows. */
    protected abstract sourceKey(): string;
    /** Named styles a source can reference (HTMLText's `styles`); none by
     *  default — Markdown has no syntax to name one. */
    /** The named-style palette for this render: the `textStyles` map, which
     *  defaults to the nearest provided one (defineAttributes below). */
    textStyles: Record<string, RunStyle>;
    protected stylesOf(): Record<string, RunStyle>;
    /** RichText's `scale` is a FONT-SIZE multiplier consumed by rebuild(), not the
     *  paint transform it means on a plain View — so mask the base flush()'s scale
     *  push. Without this, a `scale` constraint that evaluates before the surface
     *  attaches bakes a CSS transform ON TOP of the scaled fonts (double-scaling),
     *  and the view's measured height no longer matches its painted height. */
    protected flush(s: Surface): void;
    /** …and mask the GEOMETRY meaning too. The glyphs are already scaled into
     *  the runs, so this view's measured width/height ARE its on-screen box —
     *  but footprint() (auto-extent, layout, bounds) multiplies by `scale`,
     *  shrinking the box a second time. Measured: at the reader's default 0.9
     *  every code block stood 1/0.9 taller on screen than in the model — the
     *  desktop's 7,000px Window block bled ~760px of pixels past its measured
     *  extent, and the next segments were laid over its tail ("the prose
     *  overlaps the code blocks", 2026-08-20). Identity here completes the
     *  rule flush() started: to the geometry system a RichText is untransformed.
     *  (Rotation is honored via the base walk with scale forced to 1 — a
     *  rotated RichText keeps its swept box.) */
    footprint(): {
        x: number;
        y: number;
        width: number;
        height: number;
    };
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
    /** Land the `baseline` fact: the first stacked block sits at y = 0, so when
     *  it is a prose flow its first line's baseline IS this box's. */
    private claimBaseline;
    /** The inline views this rich text holds (identity across content changes) —
     *  created on first need, so a document with no `<Class/>` tag allocates
     *  nothing at all. */
    private slotHost;
    private rebuild;
}
/** Rich content authored in Markdown (`text`). */
export declare class Markdown extends RichText {
    text: string;
    protected sourceKey(): string;
    protected parseSource(opts: ReadOptions): Block[];
}
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
