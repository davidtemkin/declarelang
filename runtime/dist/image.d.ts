import { View } from "./view.js";
import type { RenderBackend, Stretch, Surface } from "./backend.js";
export declare class Image extends View {
    source: string;
    stretches: Stretch;
    /** True once the bitmap has arrived (and any natural-sizing applied) —
     *  reactive, so constraints can derive from it. Load/error *events* wait
     *  for the rung that consumes them (R5 landed input + init only; the doc
     *  defines no Image load event yet); a failed load simply never sets
     *  this, and the view renders as its (possibly zero-sized) box. */
    loaded: boolean;
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
