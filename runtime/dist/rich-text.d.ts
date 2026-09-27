import { View } from "./view.js";
import { type RenderBackend, type RichBlock, type RichNode, type RichRun, type SlotBox, type Surface } from "./backend.js";
import { Layout, type Box } from "./layout.js";
import { type FontWeight, type TextTransform } from "./measure.js";
import { type Numerals, type NumeralWidth } from "./font-features.js";
import { type FamilyValue } from "./font-value.js";
import type { Block, Inline, ReadOptions } from "./md.js";
import type { Unsupported } from "./html.js";
import type { Fill, Shadow, Outline, Color } from "./value.js";
export declare const PROSE: {
    heading: number[];
    headingGap: number[];
    headingBelow: number;
    body: number;
    codeSize: number;
    codeRadius: number;
    codePad: number;
    codeRuleWidth: number;
    codeRuleGap: number;
    mono: string;
    blockGap: number;
    itemGap: number;
    indent: number;
    markerGap: number;
    quoteIndent: number;
    cellGap: number;
};
interface Palette {
    headingColor: number;
    bodyColor: number;
    code: number;
    codeFg: number;
    codeBg: number;
    rule: number;
    link: number;
    quoteRule: number;
    quoteColor: number;
}
export declare let C: Palette;
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
export declare let BODY: {
    size: number;
    weight: FontWeight;
    tracking: number;
};
export declare let HEADINGW: FontWeight;
export declare let HEADINGC: number, LINKC: number, CODEC: number;
export declare let CODESIZE: number, CODEFAM: string;
export declare let CODEBG: number | null, CODERULE: number | null;
/** Resolve a block type's geometry from the map: its own entry, then `default`,
 *  field by field (a `pre` with no own entry shares `code`). Zero maxWidth = the
 *  full track; the house result for an empty map is full-width, left, no margin. */
export declare function geoFor(t: string): {
    maxWidth: number;
    ml: number;
    mr: number;
    align: "left" | "center" | "right";
};
/** Place a built block-view in its track: given the column `width` and the block
 *  type's geometry, size it to the (possibly measure-capped) content width and set
 *  its x by the alignment. `apply(width, geo)` returns the content width the block
 *  should be BUILT at; then `pos` offsets the finished view. One helper so the flow
 *  group and every structural block share identical geometry. */
export declare function contentWidth(width: number, g: ReturnType<typeof geoFor>): number;
export declare function placeX(width: number, cw: number, g: ReturnType<typeof geoFor>): number;
export declare const geoEqual: (a: ReturnType<typeof geoFor>, b: ReturnType<typeof geoFor>) => boolean;
export declare const sz: (n: number) => number;
export declare const FALLBACK_FAMILY = "system-ui, sans-serif";
export interface Style {
    size: number;
    weight: FontWeight;
    italic: boolean;
    mono: boolean;
    strike: boolean;
    color: number;
    tracking: number;
    link?: string;
    fill?: Fill;
    family?: string;
    shadow?: Shadow | null;
    outline?: Outline | null;
    transform?: TextTransform;
    smallCaps?: boolean;
    numerals?: Numerals;
    numeralWidth?: NumeralWidth;
    slashedZero?: boolean;
    underline?: boolean;
}
export declare function base(size: number, weight: FontWeight, color: number, tracking?: number): Style;
/** Flatten an inline tree to fully-resolved runs for the seam — the effective
 *  font, color, and (for `code`) chip are baked in so a backend just realizes
 *  what it is told. Mirrors `flatten`, then bakes the per-run family. */
export declare function richRunsOf(inline: Inline[], style: Style, family: string): RichRun[];
/** TextFlow — the internal native-flow renderer (NOT a user component; see the
 *  RichText family below). A flowing block of styled text: `content` (resolved
 *  runs) and `flowWidth` are set by its owner before attach; it renders natively
 *  (DOM) or manually (canvas) and auto-sizes its height to the flowed content. */
export declare class TextFlow extends View {
    content: RichNode[];
    /** True when `content` is a whole document (structural nodes among its
     *  blocks) — handed only to a backend that lays documents out (`richBlocks`). */
    structured: boolean;
    flowWidth: number;
    /** The INLINE VIEWS this flow lays out, by slot key. The views are children
     *  of the RICH TEXT (they outlive this flow, which a content change rebuilds);
     *  this flow reads their sizes and publishes where it put them. */
    readonly slotViews: Map<string, View>;
    /** THE GEOMETRY FACT: each slot's box inside this flow, as the renderer
     *  measured it — the DOM read it back off the placeholders it emitted, the
     *  manual flow computed it while wrapping the line. The rich text's Layout
     *  places the views from exactly this, which is how a `Layout` arranges
     *  DOM-flowed text without ever asking the DOM anything. */
    private slotBoxes;
    private readonly slotCell;
    slots(): Readonly<Record<string, SlotBox>>;
    private publishSlots;
    /** The lines this flow may show under its document's `maxLines`, allotted
     *  when the document was BUILT and reused by every render after; 0 = all. */
    clampLines: number;
    /** Re-flow at a new width, keeping the view and its content.
     *
     *  ⚠ THE EARLY-OUT IS THE WHOLE POINT. Prose is capped at a reading measure,
     *  so most flows in a document do NOT change width when the window does —
     *  and re-laying them out is the expensive part (on the native host
     *  `setRichContent` runs a synchronous AppKit text layout). Rebuilding used
     *  to re-lay every flow unconditionally: ~40 of them per drag step, 699ms of
     *  a 712ms resize frame, nearly all of it for flows whose width was
     *  identical before and after. */
    reflow(w: number): void;
    /** The right edge of this flow's widest line at its current width — read
     *  off the renderer's own layout where it offers one (richMetrics), else the
     *  manual flow's arithmetic. */
    widestLine(): number;
    onLink: ((href: string) => void) | null;
    /** The default link behavior (location.md §0.5). §12.2's mechanism, closed:
     *  a Markdown/HTMLText instance is a RichText PARENT holding TextFlow
     *  children — an author's declared `onLink` installs on the parent, while
     *  each flow reads its own `this.onLink`, so no handler ever arrived and
     *  every authored href was dead. The default therefore walks UP: the
     *  nearest ancestor with a declared onLink wins whole (the docs app's
     *  openDocLink keeps its custom routing untouched); with none, the href
     *  goes into the app's follow — "#story" navigates in-app, a URL leaves
     *  through navigate. Bound, so either backend can take it as a bare fn. */
    private followLink;
    private manual;
    /** The first line's baseline inside this flow (the RichText's `baseline`
     *  fact). On the native path the renderer flowed the text: it reports the
     *  baseline off its own layout where it can (richMetrics), else the manual
     *  flow measures the FIRST block alone by the arithmetic the canvas path
     *  paints by. Null until rendered, and when the flow opens with no line of
     *  text. */
    firstBaseline: number | null;
    /** Inline images are PERSISTENT children keyed by (resolved) src — created once
     *  and kept across reflows so a bitmap's async load survives, and pruned when
     *  the content no longer references them. Each installs a constraint that
     *  reflows this flow when its natural size (or failure) lands, so an image pops
     *  into place the frame it loads — the Canvas/mac twin of the DOM `<img>`'s
     *  native reflow. (Text/rect views live in `manual` and are rebuilt each pass;
     *  images must not be, or every reflow would restart their load.) */
    private imageViews;
    private imageUsed;
    private imageSeq;
    private imageFor;
    /** Canvas only: each heading anchor's y offset inside this flow, captured on
     *  the manual layout (the DOM path finds the tagged element instead). */
    private anchorYs;
    /** The heading anchor slugs this flow renders — read from `content`, so it is
     *  the same on both backends and available as soon as the content is set (before
     *  a native measure). The reveal walk (view.ts) collects these. */
    anchorSlugs(): string[];
    /** Bring heading `slug` into view (location.md §6). Backend-split at the seam:
     *  DOM finds the `data-anchor` element and scrolls it natively; Canvas passes the
     *  recorded y offset so the surface clamps the scroll ancestor. Returns whether
     *  it revealed — false before the flow has realized that heading. */
    revealAnchor(slug: string, inset?: number): boolean;
    /** True while this flow's height is a PROVISIONAL number — rendered (or just
     *  un-hidden), with the backend's asynchronous measurement still outstanding
     *  (§12.1: the DOM's ResizeObserver reports a frame after layout; a flow
     *  inside a display:none subtree measures 0 until re-shown). The reveal
     *  machinery HOLDS an anchored arrival while any flow reports true
     *  (location.md §0.5.3 — the component-sourced veto). Set at render and at
     *  visibility-flip (view.ts markRichPending); cleared by the measurement
     *  callback. Synchronous backends (headless, canvas) never set it. */
    measurePending: boolean;
    /** The flow's EFFECTIVE `selectable` — the species default (ruled
     *  2026-07-30): a flowing document is selectable BY ITS NATURE, so when
     *  nobody on the ancestor chain says otherwise, the answer is true — the
     *  Jots shape (a Markdown note, no declaration anywhere) reads as the
     *  document it is. Any provision still wins over this default, in either
     *  direction: `selectable = false` on the instance, a container, or a
     *  Control ancestor vetoes it (the unusual non-selectable document, one
     *  explicit line); the ambient default stays false for everything that is
     *  not a flow (a `Text` is a label). The provided read is tracked, so a
     *  provision appearing later re-flows. */
    private effSelectable;
    attach(backend: RenderBackend, parentSurface: Surface | null, before?: Surface | null): void;
    private clearManual;
    /** The backend re-measured the native flow (font load, or becoming visible
     *  after attaching under a zero-sized ancestor). Track it so the stack re-flows. */
    private onMeasured;
    /** Told when `firstBaseline` changes after the render that set it — the
     *  owning rich text re-claims its `baseline` fact. */
    onBaseline: (() => void) | null;
    /** A baseline READ off the renderer's layout is only as good as that layout:
     *  a flow rendered before it was laid out (inside a hidden or zero-sized
     *  ancestor, before its face arrived) reads it again when the renderer
     *  reports the settled layout, as its height does. */
    private rereadBaseline;
    private render;
}
export interface Ctx {
    family: string;
    lead: number;
    onLink: (href: string) => void;
}
/** The vertical stacking spine every prose container uses. Owns only its children's
 *  y (SimpleLayout leaves the cross axis and sizes alone), so a child growing after
 *  an async measure re-flows the stack through the ordinary reactive wake. */
/** The prose block stack — a PRIVATE strategy over the Layout kernel (the
 *  language-facing SimpleLayout is a library class now; the runtime keeps its
 *  own tiny y-stack for rendered blocks — same place() shape, no surface). */
declare class ProseStack extends Layout {
    spacing: number;
    /** THE INLINE VIEWS this stack also places — view → (its slot, the flow that
     *  laid it out). Empty for every prose container but the rich text's own
     *  stack, where the inline views live. A slot child takes no room in the
     *  column: its box comes from its flow's published geometry, offset into these
     *  coordinates. This is the Layout the design calls for — it computes from
     *  values (the published fact, the flow's own position) and asks the DOM
     *  nothing. */
    slotOf: ReadonlyMap<View, {
        key: string;
        flow: TextFlow;
    }>;
    place(): Box[];
}
export declare function yStack(spacing: number): ProseStack;
/** A native flowing block of styled text — one contiguous, selectable region on the
 *  DOM backend. `content` is the resolved RichBlock(s); `width` is the flow width. */
export declare function flowView(content: RichNode[], width: number, ctx: Ctx): TextFlow;
/** Re-widthing a view without rebuilding it. Registered by whatever built the
 *  view, because only the builder knows its internals; `RichText.relayout`
 *  looks one up per top-level block. A view with no entry forces the old full
 *  rebuild, so an unconverted block type is safe, just not fast. */
type Rewidth = (contentWidth: number) => void;
export declare const REWIDTH: WeakMap<View, Rewidth>;
export declare function setRewidth<T extends View>(v: T, f: Rewidth): T;
/** One paragraph or heading resolved to the seam's RichBlock shape. A heading
 *  also carries its `anchor` — the deterministic slug of its text (location.md §6:
 *  a heading IS its anchor) — so a fragment `@name` can bring it into view. */
export declare function proseBlock(b: Extract<Block, {
    t: "paragraph";
}> | Extract<Block, {
    t: "heading";
}>, gapBefore: number, bodyColor: number, ctx: Ctx): RichBlock;
/** A laid-out top-level block: the view, and the geometry its width/x derive
 *  from — kept so a width change can redo that arithmetic without rebuilding. */
export interface Laid {
    view: View;
    geo: ReturnType<typeof geoFor>;
}
/** Apply a new container width to a laid-out set of blocks, in place.
 *  Returns false if any block has no re-width — the caller then rebuilds. */
export declare function relayoutEntries(entries: Laid[], width: number): boolean;
/** The code box's chrome — tint (`codeBackground`, else the themed house
 *  tint), rounding, padding and the optional `codeRule` bar — shared by a
 *  fenced block and a highlighted `<pre>`, and by both flows. */
export declare function codeChrome(): {
    fill: number;
    radius: number;
    pad: number;
    padLeft: number;
    bar: {
        width: number;
        color: number;
    } | null;
};
/** Code as a `pre` block: whitespace kept, the runs' own `\n`s the line breaks,
 *  set at the code face's natural line box (ascent + descent), not the prose
 *  lead. The runs carry the code family and each token's color. */
export declare function codeBlock(runs: RichRun[]): RichBlock;
/** An item's marker: its number in an ordered list, else a bullet, or a task box. */
export declare function listMarker(b: Extract<Block, {
    t: "list";
}>, it: Extract<Block, {
    t: "list";
}>["items"][number], i: number): string;
/** One table row's cells as blocks, each in its column's GFM alignment. */
export declare function tableCells(b: Extract<Block, {
    t: "table";
}>, cells: Inline[][], weight: FontWeight, color: number, ctx: Ctx): RichBlock[];
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
    fontScale: number;
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
    /** A rich text's type size is `fontScale`, its own attribute, and it never
     *  touches the geometry `scale` every other view means by that name. The
     *  glyphs are scaled into the runs, so the measured box IS the painted box
     *  and `scale` stays 1 — which is what lets paint, the hit walk's inverse,
     *  `rootTransform` and both auto-extent paths (the JavaScript derive and the
     *  kernel's native rule) read one geometry and agree, with nothing to mask.
     *  A rich text that IS transformed says so with `scale`, like any view, and
     *  every reader honours it. */
    attach(backend: RenderBackend, parentSurface: Surface | null, before?: Surface | null): void;
    /** The house palette for this render: the text's ink for body and headings
     *  (`textColor`, else the theme's `text`), the provided theme's tokens for the rest (`code` and `codeBg` when a theme
     *  names them, else the ink and the neutral `control` tint). Read tracked, so
     *  a theme swap or an ink change re-renders. */
    private palette;
    /** The palette's values, for the render key. */
    private paletteKey;
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
    /** True when no author and no layout gives this box its width: it is then the
     *  width of the text itself (fitNatural). The auto-extent that reports that
     *  width back is not a giver. */
    private ownWidth;
    /** A rich text with no width of its own is AS WIDE AS ITS TEXT: laid out at
     *  the reading measure, then re-flowed at its widest line (plus a 2px guard,
     *  so a renderer measuring a hair wider cannot wrap a line early). The content
     *  box — and so `x = center`, a row's spacing, a ring around it — is then the
     *  text's. Only a document of running text fits; one holding a list, table,
     *  quote or code keeps the measure. */
    private fitNatural;
    /** Land the `baseline` fact: the first stacked block sits at y = 0, so when
     *  it is a prose flow its first line's baseline IS this box's. */
    private claimBaseline;
    /** The inline views this rich text holds (identity across content changes) —
     *  created on first need, so a document with no `<Class/>` tag allocates
     *  nothing at all. */
    private slotHost;
    private rebuild;
}
export {};
