export type VisibilityCb = (v: {
    on: boolean;
    rect: {
        x: number;
        y: number;
        width: number;
        height: number;
    } | null;
    scale: number;
}) => void;
export declare function observeVisibility(el: Element, cb: VisibilityCb): () => void;
/** Force a fresh entry for an observed element — observe() always reports an
 *  initial intersection, so unobserve+observe is "measure NOW, through the
 *  instrument itself": same clipping math, same page context. (A hand-rolled
 *  getBoundingClientRect walk would have to re-derive ancestor overflow
 *  clipping, and get it subtly wrong.) The runtime calls this when its model
 *  walk knows the answer moved but the observer saw no edge — an
 *  IntersectionObserver reports CROSSINGS, not levels, so a fully visible box
 *  under a scaling ancestor never crosses anything and never reports
 *  (visibility.ts, the wake — the sprung-camera fix). */
export declare function refreshObserved(el: Element): void;
