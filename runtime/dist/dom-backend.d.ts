import { type RenderBackend, type Surface } from "./backend.js";
/** Client point → el's view-local (pre-transform layout) coordinates.
 *  Exported for the embedded-app environment wiring (boot.ts): an island's
 *  box-relative pointer must come through the same inversion, or a child app
 *  inside a transformed host subtree hears skewed coordinates. */
export declare function localPoint(el: HTMLElement, cx: number, cy: number): {
    x: number;
    y: number;
};
export declare class DomBackend implements RenderBackend {
    /** Fragment-href realization base (location.md §0.9). null (the default,
     *  top level) = this document's own page. "" = an EMBEDDED app: fragment
     *  refs realize no native anchor at all (they would target the HOST page's
     *  fragment; routing still follows in-app). A URL = an embedder that knows
     *  the child's true program address, restoring the native affordances. */
    linkBase: string | null;
    createSurface(): Surface;
    attachRoot(host: HTMLElement, root: Surface): void;
}
type IslandSink = (el: HTMLElement) => void;
/** Register an island sink — one per booting host, and a page may boot several
 *  apps, so this is a set: every sink hears every slot and scopes itself (the
 *  shim filters by containment, exactly the scope its old scan had). Fires for
 *  every already-marked slot immediately, then per mark/re-mark. Returns the
 *  unregister (a torn-down host must stop hearing about slots). */
export declare function onIslandSlot(cb: IslandSink): () => void;
export {};
