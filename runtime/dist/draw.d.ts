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
    /** Everything painted so far; null until the first paint op. */
    private ink;
    /** Extent of the current path; reset by beginPath, kept by fill/stroke
     *  (mirroring Canvas2D, where filling does not clear the path). */
    private path;
    /** Mirror of the recorded lineWidth, for stroke expansion. */
    private strokeHalf;
    /** Cleared once an op paints an extent the recorder can't bound locally. */
    private exactBounds;
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
export declare function record(fn: (d: Draw) => void): DisplayList;
/** Replay a recording into a real 2D context — the one interpreter both
 *  backends share, so a recording renders identically wherever it lands.
 *  Style state is saved/restored; the path is cleared on both sides (save/
 *  restore does not cover the current path in Canvas2D). */
export declare function replay(ctx: CanvasRenderingContext2D, list: DisplayList): void;
export {};
