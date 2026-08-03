import { View } from "./view.js";
import type { RenderBackend, Stretch, Surface } from "./backend.js";
/** Set the base that relative bitmap sources resolve against; returns the
 *  previous one, so a scoped caller can restore it — the provideTransport
 *  contract. */
export declare function provideAssetBase(base: string | null): string | null;
export declare function resolveAsset(source: string): string;
export declare class Image extends View {
    source: string;
    stretches: Stretch;
    /** True once a bitmap has arrived (and any natural-sizing applied) —
     *  reactive, read-only surface (schema'd 2026-07-30), so constraints can
     *  derive from it: `visible = { !pic.loaded }` is the placeholder idiom.
     *  Latches: re-pointing `source` keeps the previous bitmap (and this flag)
     *  until the replacement lands. Load/error *events* wait for the rung that
     *  consumes them (the doc defines no Image load event yet). */
    loaded: boolean;
    /** True when the CURRENT source's load failed — the broken-avatar fact
     *  (`fallback: View [ visible = { pic.failed } ]`). Read-only, reset when
     *  a new load starts, so it always speaks about the present `source`;
     *  a failure keeps whatever bitmap was already showing. */
    failed: boolean;
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
