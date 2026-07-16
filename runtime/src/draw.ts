// First-class drawing, per the ruled rendering model (HANDOFF "The rendering
// model"): a view's draw method runs on *invalidation* — never per frame —
// and records into a **display list** of plain-data ops. Never live pixels,
// never a stored Path2D: every op is structured-cloneable by construction, so
// a recording can cross a worker boundary later. Bounds are a first-class
// product of recording (conservative unions of op geometry, stroke-expanded).
//
// Both backends replay the same list — the Canvas backend straight into the
// shared ctx during the composite walk, the DOM backend rasterized into that
// view's own <canvas> — which is what makes a recording substrate-independent
// and lets the runtime re-host a view without re-entering user code.
//
// The op vocabulary is a Canvas2D-shaped subset sized to its consumers
// (grown with them, not gold-plated ahead of them).

import { DeclareError } from "./errors.js";
import { colorToCss, type Color } from "./value.js";

/** A style value may be a CSS string or a Declare `Color` (a number) — draw() is
 *  first-class with the language's Color type, so `d.fillStyle = #BCC4E2`
 *  reads like the `fill` attribute, not `"#bcc4e2"`. Strings still pass
 *  through, so the Canvas2D shape is intact. */
const cssOf = (v: string | Color): string => (typeof v === "string" ? v : colorToCss(v));

/** An axis-aligned rectangle in the recording's local coordinates. */
export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One recorded draw command — plain data mirroring the Canvas2D call. */
export type DrawOp =
  | { readonly op: "fillStyle"; readonly v: string }
  | { readonly op: "strokeStyle"; readonly v: string }
  | { readonly op: "lineWidth"; readonly v: number }
  | { readonly op: "fillRect"; readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  | { readonly op: "beginPath" }
  | { readonly op: "moveTo"; readonly x: number; readonly y: number }
  | { readonly op: "lineTo"; readonly x: number; readonly y: number }
  | { readonly op: "arc"; readonly x: number; readonly y: number; readonly r: number; readonly a0: number; readonly a1: number; readonly ccw: boolean }
  | { readonly op: "rect"; readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  | { readonly op: "closePath" }
  | { readonly op: "fill" }
  | { readonly op: "stroke" };

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
export class Draw {
  private readonly ops: DrawOp[] = [];

  // ── bounds bookkeeping (recording-internal, never exposed) ──
  /** Everything painted so far; null until the first paint op. */
  private ink: Bounds | null = null;
  /** Extent of the current path; reset by beginPath, kept by fill/stroke
   *  (mirroring Canvas2D, where filling does not clear the path). */
  private path: Bounds | null = null;
  /** Mirror of the recorded lineWidth, for stroke expansion. */
  private strokeHalf = 0.5;

  set fillStyle(v: string | Color) { this.ops.push({ op: "fillStyle", v: cssOf(v) }); }
  get fillStyle(): string { return this.readOnly("fillStyle"); }

  set strokeStyle(v: string | Color) { this.ops.push({ op: "strokeStyle", v: cssOf(v) }); }
  get strokeStyle(): string { return this.readOnly("strokeStyle"); }

  set lineWidth(v: number) {
    this.strokeHalf = v / 2;
    this.ops.push({ op: "lineWidth", v });
  }
  get lineWidth(): number { return this.readOnly("lineWidth"); }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.ops.push({ op: "fillRect", x, y, w, h });
    this.mark(x, y, x + w, y + h);
  }

  beginPath(): void {
    this.ops.push({ op: "beginPath" });
    this.path = null;
  }

  moveTo(x: number, y: number): void {
    this.ops.push({ op: "moveTo", x, y });
    this.extend(x, y, x, y);
  }

  lineTo(x: number, y: number): void {
    this.ops.push({ op: "lineTo", x, y });
    this.extend(x, y, x, y);
  }

  /** Bounds take the full circle's box — conservative for partial arcs,
   *  exact for full ones, and no trigonometry in the recorder. */
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false): void {
    this.ops.push({ op: "arc", x, y, r, a0, a1, ccw });
    this.extend(x - r, y - r, x + r, y + r);
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.ops.push({ op: "rect", x, y, w, h });
    this.extend(x, y, x + w, y + h);
  }

  closePath(): void { this.ops.push({ op: "closePath" }); }

  fill(): void {
    this.ops.push({ op: "fill" });
    if (this.path) this.mark(this.path.x, this.path.y, this.path.x + this.path.w, this.path.y + this.path.h);
  }

  /** Stroke ink extends half the line width beyond the path box. (A sharp
   *  miter join can poke further; the recorder doesn't expose lineJoin yet,
   *  and bounds stay advisory until dirty-region culling consumes them — the
   *  rung that lands culling owns tightening this.) */
  stroke(): void {
    this.ops.push({ op: "stroke" });
    if (this.path) {
      const e = this.strokeHalf;
      this.mark(this.path.x - e, this.path.y - e, this.path.x + this.path.w + e, this.path.y + this.path.h + e);
    }
  }

  /** The finished recording. Called by record(); a Draw is single-use. */
  list(): DisplayList {
    return { ops: this.ops, bounds: this.ink };
  }

  private readOnly(what: string): never {
    throw new DeclareError(
      `the draw context is write-only — ${what} cannot be read back; inputs come in through attributes (rendering model)`
    );
  }

  private extend(x0: number, y0: number, x1: number, y1: number): void {
    this.path = union(this.path, x0, y0, x1, y1);
  }

  private mark(x0: number, y0: number, x1: number, y1: number): void {
    this.ink = union(this.ink, x0, y0, x1, y1);
  }
}

function union(b: Bounds | null, x0: number, y0: number, x1: number, y1: number): Bounds {
  if (b === null) return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const nx = Math.min(b.x, x0);
  const ny = Math.min(b.y, y0);
  return { x: nx, y: ny, w: Math.max(b.x + b.w, x1) - nx, h: Math.max(b.y + b.h, y1) - ny };
}

/** Run a draw method against a fresh recorder and return its display list. */
export function record(fn: (d: Draw) => void): DisplayList {
  const d = new Draw();
  fn(d);
  return d.list();
}

/** Replay a recording into a real 2D context — the one interpreter both
 *  backends share, so a recording renders identically wherever it lands.
 *  Style state is saved/restored; the path is cleared on both sides (save/
 *  restore does not cover the current path in Canvas2D). */
export function replay(ctx: CanvasRenderingContext2D, list: DisplayList): void {
  ctx.save();
  ctx.beginPath();
  for (const o of list.ops) {
    switch (o.op) {
      case "fillStyle": ctx.fillStyle = o.v; break;
      case "strokeStyle": ctx.strokeStyle = o.v; break;
      case "lineWidth": ctx.lineWidth = o.v; break;
      case "fillRect": ctx.fillRect(o.x, o.y, o.w, o.h); break;
      case "beginPath": ctx.beginPath(); break;
      case "moveTo": ctx.moveTo(o.x, o.y); break;
      case "lineTo": ctx.lineTo(o.x, o.y); break;
      case "arc": ctx.arc(o.x, o.y, o.r, o.a0, o.a1, o.ccw); break;
      case "rect": ctx.rect(o.x, o.y, o.w, o.h); break;
      case "closePath": ctx.closePath(); break;
      case "fill": ctx.fill(); break;
      case "stroke": ctx.stroke(); break;
    }
  }
  ctx.beginPath();
  ctx.restore();
}
