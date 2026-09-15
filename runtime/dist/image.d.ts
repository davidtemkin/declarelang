import { View } from "./view.js";
import type { RenderBackend, Stretch, Surface } from "./backend.js";
import type { Color } from "./value.js";
export declare class Image extends View {
    source: string;
    stretches: Stretch;
    /** A color multiplied over the bitmap's ALPHA (the one-mask-asset idiom —
     *  compositing.md §3.4): shape from the bitmap, color from here, exactly
     *  template-image rendering. null = the untouched bitmap. */
    tint: Color;
    /** Where a `contain`/`cover` fit sits in the box — `start`, `center`
     *  (default), `end` per axis (graphics-pass.md §4). */
    alignX: "start" | "center" | "end";
    alignY: "start" | "center" | "end";
    /** True once a bitmap has arrived (and any natural-sizing applied) —
     *  reactive, read-only surface (schema'd 2026-07-30), so constraints can
     *  derive from it: `visible = { !pic.loaded }` is the placeholder idiom.
     *  Latches: re-pointing `source` keeps the previous bitmap (and this flag)
     *  until the replacement lands. Load/error *events* wait for the rung that
     *  consumes them (the doc defines no Image load event yet). */
    loaded: boolean;
    naturalWidth: number;
    naturalHeight: number;
    /** True when the CURRENT source's load failed — the broken-avatar fact
     *  (`fallback: View [ visible = { pic.failed } ]`). Read-only, reset when
     *  a new load starts, so it always speaks about the present `source`;
     *  a failure keeps whatever bitmap was already showing. */
    failed: boolean;
    /** The loaded element — what `d.drawImage(pic, …)` paints from (draw.ts's
     *  DrawImageSource). null until a bitmap lands; kept across a re-pointed
     *  `source` until the replacement lands, like `loaded`. */
    bitmap: HTMLImageElement | null;
    /** Discards a superseded load: only the latest request may land. */
    private loadSeq;
    /** The arrived bitmap's natural size — what contentExtent folds into a
     *  parent-style auto-extent when this Image has children of its own (LZX's
     *  max(resource, subviews)). Zero until loaded. */
    private natural;
    /** Auto-extent's content hook: the bitmap's natural extent. Reads `loaded`
     *  (tracked), so an owning extent derive re-runs when the bitmap arrives. */
    protected contentExtent(size: "width" | "height"): number;
    attach(backend: RenderBackend, parentSurface: Surface | null): void;
    protected flush(s: Surface): void;
    /** (Re)load `source` — called at attach and by the `source` pusher. */
    load(): void;
}
