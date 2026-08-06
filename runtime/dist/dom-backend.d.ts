import { type RenderBackend, type Surface } from "./backend.js";
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
