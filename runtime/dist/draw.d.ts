import { type Color } from "./value.js";
/** An axis-aligned rectangle in the recording's local coordinates. */
export interface Bounds {
    x: number;
    y: number;
    w: number;
    h: number;
}
/** One recorded draw command — plain data mirroring the Canvas2D call. */
export type DrawOp = {
    readonly op: "fillStyle";
    readonly v: string;
} | {
    readonly op: "strokeStyle";
    readonly v: string;
} | {
    readonly op: "lineWidth";
    readonly v: number;
} | {
    readonly op: "fillRect";
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
    readonly op: "rect";
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
} | {
    readonly op: "closePath";
} | {
    readonly op: "fill";
} | {
    readonly op: "stroke";
};
/** A finished recording: the ops, plus their conservative bounds (null when
 *  the recording paints nothing). */
export interface DisplayList {
    readonly ops: readonly DrawOp[];
    readonly bounds: Bounds | null;
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
    set fillStyle(v: string | Color);
    get fillStyle(): string;
    set strokeStyle(v: string | Color);
    get strokeStyle(): string;
    set lineWidth(v: number);
    get lineWidth(): number;
    fillRect(x: number, y: number, w: number, h: number): void;
    beginPath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    /** Bounds take the full circle's box — conservative for partial arcs,
     *  exact for full ones, and no trigonometry in the recorder. */
    arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void;
    rect(x: number, y: number, w: number, h: number): void;
    closePath(): void;
    fill(): void;
    /** Stroke ink extends half the line width beyond the path box. (A sharp
     *  miter join can poke further; the recorder doesn't expose lineJoin yet,
     *  and bounds stay advisory until dirty-region culling consumes them — the
     *  rung that lands culling owns tightening this.) */
    stroke(): void;
    /** The finished recording. Called by record(); a Draw is single-use. */
    list(): DisplayList;
    private readOnly;
    private extend;
    private mark;
}
/** Run a draw method against a fresh recorder and return its display list. */
export declare function record(fn: (d: Draw) => void): DisplayList;
/** Replay a recording into a real 2D context — the one interpreter both
 *  backends share, so a recording renders identically wherever it lands.
 *  Style state is saved/restored; the path is cleared on both sides (save/
 *  restore does not cover the current path in Canvas2D). */
export declare function replay(ctx: CanvasRenderingContext2D, list: DisplayList): void;
