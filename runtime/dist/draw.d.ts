import { type Color } from "./value.js";
/** An axis-aligned rectangle in the recording's local coordinates. */
export interface Bounds {
    x: number;
    y: number;
    w: number;
    h: number;
}
/** A recorded gradient — the plain-data form of a CanvasGradient. `coords` is
 *  the constructor's arguments (linear: x0,y0,x1,y1 · radial: x0,y0,r0,x1,y1,r1
 *  · conic: startAngle,x,y); `stops` is the addColorStop list. Reconstructed
 *  into a real gradient at replay. */
export interface GradientRec {
    readonly kind: "linear" | "radial" | "conic";
    readonly coords: readonly number[];
    readonly stops: ReadonlyArray<readonly [number, string]>;
}
/** The handle `createLinearGradient`/… returns — Canvas2D's exact shape
 *  (build, `addColorStop`, then assign to fillStyle/strokeStyle), but a plain
 *  accumulator so nothing live crosses the recording boundary. */
export declare class DrawGradient {
    /** @internal the recorded form the style setter reads. */
    readonly rec: {
        kind: GradientRec["kind"];
        coords: number[];
        stops: [number, string][];
    };
    constructor(kind: GradientRec["kind"], coords: number[]);
    addColorStop(offset: number, color: string | Color): void;
}
/** Scalar context state set by simple assignment — recorded uniformly. */
type SetKey = "lineWidth" | "lineCap" | "lineJoin" | "miterLimit" | "lineDashOffset" | "globalAlpha" | "globalCompositeOperation" | "shadowBlur" | "shadowColor" | "shadowOffsetX" | "shadowOffsetY" | "filter" | "font" | "textAlign" | "textBaseline" | "direction" | "letterSpacing" | "wordSpacing" | "fontKerning" | "imageSmoothingEnabled" | "imageSmoothingQuality";
/** One recorded draw command — plain data mirroring the Canvas2D call. */
export type DrawOp = {
    readonly op: "fillStyle";
    readonly v?: string;
    readonly grad?: GradientRec;
} | {
    readonly op: "strokeStyle";
    readonly v?: string;
    readonly grad?: GradientRec;
} | {
    readonly op: "set";
    readonly k: SetKey;
    readonly v: string | number | boolean;
} | {
    readonly op: "setLineDash";
    readonly segments: readonly number[];
} | {
    readonly op: "fillRect";
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
} | {
    readonly op: "strokeRect";
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
} | {
    readonly op: "clearRect";
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
} | {
    readonly op: "beginPath";
} | {
    readonly op: "moveTo";
    readonly x: number;
    readonly y: number;
} | {
    readonly op: "lineTo";
    readonly x: number;
    readonly y: number;
} | {
    readonly op: "arc";
    readonly x: number;
    readonly y: number;
    readonly r: number;
    readonly a0: number;
    readonly a1: number;
    readonly ccw: boolean;
} | {
    readonly op: "arcTo";
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
    readonly r: number;
} | {
    readonly op: "ellipse";
    readonly x: number;
    readonly y: number;
    readonly rx: number;
    readonly ry: number;
    readonly rot: number;
    readonly a0: number;
    readonly a1: number;
    readonly ccw: boolean;
} | {
    readonly op: "rect";
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
} | {
    readonly op: "roundRect";
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
    readonly radii: number | readonly number[];
} | {
    readonly op: "quadraticCurveTo";
    readonly cpx: number;
    readonly cpy: number;
    readonly x: number;
    readonly y: number;
} | {
    readonly op: "bezierCurveTo";
    readonly cp1x: number;
    readonly cp1y: number;
    readonly cp2x: number;
    readonly cp2y: number;
    readonly x: number;
    readonly y: number;
} | {
    readonly op: "closePath";
} | {
    readonly op: "fill";
    readonly rule?: CanvasFillRule;
} | {
    readonly op: "stroke";
} | {
    readonly op: "clip";
    readonly rule?: CanvasFillRule;
} | {
    readonly op: "fillText";
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly maxWidth?: number;
} | {
    readonly op: "strokeText";
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly maxWidth?: number;
} | {
    readonly op: "save";
} | {
    readonly op: "restore";
} | {
    readonly op: "translate";
    readonly x: number;
    readonly y: number;
} | {
    readonly op: "rotate";
    readonly angle: number;
} | {
    readonly op: "scale";
    readonly x: number;
    readonly y: number;
} | {
    readonly op: "transform";
    readonly m: readonly [number, number, number, number, number, number];
} | {
    readonly op: "setTransform";
    readonly m: readonly [number, number, number, number, number, number];
} | {
    readonly op: "resetTransform";
};
/** A finished recording: the ops, their conservative bounds (null when the
 *  recording paints nothing), and whether those bounds are EXACT. Text,
 *  transforms, and blur/filter make the painted extent uncomputable in the
 *  recorder (no measurement, no device space), so `exact` goes false and a
 *  future dirty-region culler must treat the recording as whole-view. */
export interface DisplayList {
    readonly ops: readonly DrawOp[];
    readonly bounds: Bounds | null;
    readonly exact: boolean;
    /** PER-OP painted extent, parallel to `ops` — the box each PAINT op inked,
     *  in the recording's local space (the same space as `bounds`), or null for
     *  an op that paints nothing (state, path building, transforms). This is
     *  what a replay CULLS against and what a cost model SUMS: the recorder
     *  already maps every painted extent through the live CTM before unioning
     *  it into `bounds`, so keeping each one costs an array slot and nothing
     *  else. Blur/shadow bleed is NOT in these (see `rasterPad`), exactly as it
     *  is not in `bounds`. */
    readonly extents: ReadonlyArray<Bounds | null>;
}
/** The write-only, Canvas2D-shaped context a draw method records into.
 *
 *  Write-only is a semantic, not a convenience (rendering model rule 4):
 *  reads would break replayability, worker transfer, and substrate
 *  independence, so the style properties throw on read. Inputs reach a draw
 *  method through the view's attributes; at R4, reading a constrained
 *  attribute inside draw is what re-triggers recording. */
export declare class Draw {
    private readonly ops;
    /** parallel to `ops` — see DisplayList.extents */
    private readonly extents;
    private push;
    /** THE VIEW'S OWN SIZE, for a drawing that sizes itself — `d.w` / `d.h`.
     *
     *  The scaffold has typed these since draw() was typed at all, so arithmetic
     *  on them compiled; the runtime never supplied them, so they read `undefined`,
     *  the arithmetic went NaN, the recording bounded to nothing and the drawing
     *  silently vanished. Typechecked, documented, and absent — found by a cold
     *  agent run, 2026-08-05.
     *
     *  GETTERS, not fields, and that is the whole design. `record()` runs inside a
     *  tracked computation, so reading the view's width here registers a dependency
     *  — meaning a plain field would make EVERY drawing re-record on resize, which
     *  is exactly the size-dependent recording the icon guidance warns costs a
     *  reallocation per frame. A getter is read only if the body reads it, so the
     *  dependency is pay-per-use: `d.w` opts a drawing into re-recording on resize,
     *  and a drawing that never mentions it never pays. */
    private readonly boxW;
    private readonly boxH;
    get w(): number;
    get h(): number;
    constructor(boxW?: () => number, boxH?: () => number);
    /** Everything painted so far; null until the first paint op. */
    private ink;
    /** Extent of the current path; reset by beginPath, kept by fill/stroke
     *  (mirroring Canvas2D, where filling does not clear the path). */
    private path;
    /** Mirror of the recorded lineWidth, for stroke expansion. */
    private strokeHalf;
    /** Cleared once an op paints an extent the recorder can't bound locally. */
    private exactBounds;
    /** Mirror of the recorded text state, for bounding a run — the same
     *  pattern as `strokeHalf` for stroke expansion. Canvas2D's defaults. */
    private tFont;
    private tAlign;
    private tBaseline;
    private tLetter;
    /** The live transform matrix [a,b,c,d,e,f] and its save/restore stack. Every
     *  painted extent is mapped through it before it grows the ink box, so the
     *  recording's bounds land in the VIEW's local space even under scale/rotate/
     *  translate — the per-view raster canvas is then sized to what actually
     *  paints, not to the pre-transform authoring coordinates (without this a
     *  scaled illustration is sized to its unscaled box and detaches from the
     *  view as it grows). */
    private ctm;
    private ctmStack;
    set fillStyle(v: string | Color | DrawGradient);
    get fillStyle(): string;
    set strokeStyle(v: string | Color | DrawGradient);
    get strokeStyle(): string;
    set lineWidth(v: number);
    get lineWidth(): number;
    set lineCap(v: string);
    get lineCap(): string;
    set lineJoin(v: string);
    get lineJoin(): string;
    set miterLimit(v: number);
    get miterLimit(): number;
    set lineDashOffset(v: number);
    get lineDashOffset(): number;
    setLineDash(segments: number[]): void;
    set globalAlpha(v: number);
    get globalAlpha(): number;
    set globalCompositeOperation(v: string);
    get globalCompositeOperation(): string;
    set shadowBlur(v: number);
    get shadowBlur(): number;
    set shadowColor(v: string | Color);
    get shadowColor(): string;
    set shadowOffsetX(v: number);
    get shadowOffsetX(): number;
    set shadowOffsetY(v: number);
    get shadowOffsetY(): number;
    set filter(v: string);
    get filter(): string;
    set imageSmoothingEnabled(v: boolean);
    get imageSmoothingEnabled(): boolean;
    set imageSmoothingQuality(v: string);
    get imageSmoothingQuality(): string;
    set font(v: string);
    get font(): string;
    set textAlign(v: string);
    get textAlign(): string;
    set textBaseline(v: string);
    get textBaseline(): string;
    set direction(v: string);
    get direction(): string;
    set letterSpacing(v: string);
    get letterSpacing(): string;
    set wordSpacing(v: string);
    get wordSpacing(): string;
    set fontKerning(v: string);
    get fontKerning(): string;
    createLinearGradient(x0: number, y0: number, x1: number, y1: number): DrawGradient;
    createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): DrawGradient;
    createConicGradient(startAngle: number, x: number, y: number): DrawGradient;
    fillRect(x: number, y: number, w: number, h: number): void;
    strokeRect(x: number, y: number, w: number, h: number): void;
    clearRect(x: number, y: number, w: number, h: number): void;
    beginPath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    /** Bounds take the full circle's box — conservative for partial arcs,
     *  exact for full ones, and no trigonometry in the recorder. */
    arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void;
    /** The tangent arc's box is bounded by its two guide points (conservative:
     *  the curve stays within their span plus the corner it rounds). */
    arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
    ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw?: boolean): void;
    rect(x: number, y: number, w: number, h: number): void;
    roundRect(x: number, y: number, w: number, h: number, radii?: number | number[]): void;
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
    closePath(): void;
    fill(rule?: CanvasFillRule): void;
    /** Stroke ink extends half the line width beyond the path box. (A sharp
     *  miter join can poke further; bounds stay advisory until dirty-region
     *  culling consumes them — the rung that lands culling owns tightening.) */
    stroke(): void;
    /** Clip narrows subsequent painting to the current path — no ink of its own,
     *  scoped by save/restore. */
    clip(rule?: CanvasFillRule): void;
    fillText(text: string, x: number, y: number, maxWidth?: number): void;
    strokeText(text: string, x: number, y: number, maxWidth?: number): void;
    /** The run's box from the mirrored text state. With no measurer at all (a
     *  bare Node test constructing a Draw — headless verify provides one) this
     *  falls back to the anchor point, which is what every call did before. */
    private textExtent;
    save(): void;
    restore(): void;
    translate(x: number, y: number): void;
    rotate(angle: number): void;
    scale(x: number, y: number): void;
    transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
    resetTransform(): void;
    /** The finished recording. Called by record(); a Draw is single-use. */
    list(): DisplayList;
    private readOnly;
    private extend;
    /** Grow the ink box by a painted extent, mapping its four corners through
     *  the live transform first (a rotate makes the axis-aligned span of the
     *  mapped corners the tight local box). Callers pass authoring coordinates;
     *  `extend` keeps the current PATH in those same coordinates, and the
     *  transform is applied here, once, when the path/rect is committed to ink. */
    private mark;
}
/** Run a draw method against a fresh recorder and return its display list. */
export declare function record(fn: (d: Draw) => void, boxW?: () => number, boxH?: () => number): DisplayList;
/** Replay a recording into a real 2D context — the one interpreter both
 *  backends share, so a recording renders identically wherever it lands.
 *  Style state is saved/restored; the path is cleared on both sides (save/
 *  restore does not cover the current path in Canvas2D). */
/** Classify a recording's REPLAY expense — the shared half of the adaptive
 *  draw cache (rendering model): a backend may memoize the raster of an
 *  "expensive" list and blit it while (list, scale, dpr) are unchanged. Pure
 *  over the recording, so every backend gates identically. `filter` (blur is
 *  the canonical case — measured ~24ms/flush for one full-screen mesh on
 *  WebKit's deferred CPU raster) is expensive outright; otherwise expense is
 *  op volume, with gradient paints weighted (each builds a ramp at replay). */
/** The raster-policy caps — OUR frugality rules, not platform truth (the web
 *  exposes no raster budget, and its limits are uncharacterized; these keep a
 *  compliant distance from the one documented hard edge, Safari's per-canvas
 *  caps, and scale the total in VIEWPORTS because backdrop-class rasters
 *  scale with the screen). Shared so every backend prices identically. */
/** The BLEED PAD for a recording whose bounds are not exact: blur and shadow
 *  paint past the recorded shapes by amounts the recorder cannot fold into
 *  bounds — but the ops carry the radii, so a sound overscan is computable
 *  after the fact. CSS/canvas `blur(r)` is Gaussian with σ = r/2; visible
 *  support ends by ~3σ, padded here to 2.5·r for margin. Shadows add their
 *  own blur (same law) plus their offset. Shared, so a backend that rasters
 *  a recording (the memo here; the DOM's per-view canvas in its turn) covers
 *  the same painted extent everywhere. */
export declare function rasterPad(list: DisplayList): number;
/** The STRETCH GRACE (DT's rule, 2026-08-20): a drawn view whose scale just
 *  changed may render as its stretched prior raster for up to this long;
 *  once the scale has been quiet for the beat, the next frame is exact.
 *  Time-based by CHOICE, not heuristic — "animation done" is undetectable in
 *  this language (a spring, a pointer constraint, and a stream are all just
 *  writers), so the tolerance is declared instead: transitional frames may
 *  stretch, resting content is always crisp within a beat. The constant
 *  matches the visibility facts' at-rest flush — one platform notion of
 *  "quiet for a beat". */
export declare const RASTER_GRACE_MS = 120;
export declare const RASTER_MAX_DIM = 8192;
export declare const RASTER_MAX_AREA = 16777216;
export declare function rasterEntryCap(viewportBytes: number): number;
export declare function rasterTotalCap(viewportBytes: number): number;
/** The recording's covered area — see ListInfo.area. Pure over the recording,
 *  so every backend prices the same quantity; each applies its own scale² and
 *  its own threshold. This REPLACES the op-counting classifier: measured under
 *  Chrome tracing (2026-08-24), two lists of identical op count differed 205x
 *  in paint cost by covered area alone, and the op count called both
 *  "expensive". Op count is still a term — a stroke has real per-op setup
 *  cost — but it is the backend's term to weigh, from `list.ops.length`. */
/** Did a raster of `list` paint NOTHING where the recording says it painted?
 *  The platform's silent failure: past its canvas budget Safari draws
 *  transparent, Firefox blanks a DOM canvas at ~130 MB (measured 2026-08-25),
 *  and no timing sees either — a blank frame is a fast one. Sampled at a few
 *  op centres, which is a GPU sync, so a caller runs it once per fresh raster
 *  and only past a size worth the sync. A recording that truly paints
 *  transparent at every sampled centre reads as blank; the caller's recovery
 *  (vectors on canvas, a lower density on DOM) is slower, never wrong.
 *  `sx, sy` are the raster's density and `bx, by` its origin in recording
 *  units — the same numbers the raster was made with. */
export declare function rasterLooksBlank(cv: HTMLCanvasElement, list: DisplayList, sx: number, sy: number, bx: number, by: number): boolean;
export declare function replayArea(list: DisplayList): number;
/** Replay a recording into a real 2D context. `clip`, when given, is the
 *  region (recording-local) the replay can be SEEN in: paint ops entirely
 *  outside it are skipped. BYTE-IDENTICAL where visible — a skipped op painted
 *  nothing inside the clip, and a list using a composite operator that reaches
 *  outside its source is never culled (ListInfo.cullable). This is the cheapest
 *  lever there is against the cost that was measured: what reaches the
 *  compositor is what costs, and an off-screen op reaching it costs the same as
 *  an on-screen one. `__declareNoCull` disables it for an A/B. */
export declare function replay(ctx: CanvasRenderingContext2D, list: DisplayList, clip?: Bounds): void;
export {};
