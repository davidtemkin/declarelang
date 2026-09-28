// dom-visibility — the DOM renderer's visibility feed (DomSurface.watchVisibility),
// in its own module: a program that names none of the facts and draws nothing
// never arms a feed, and leaves this out with the rest of the `visibility`
// capability (compiler/src/capabilities.ts; the model side is visibility.ts).
//
// One shared IntersectionObserver for the whole document — the browser's own
// off-the-layout-path answer to "what of this element shows", built for
// exactly this. Viewport-rooted (root null), so an embedded app's box scrolled
// out of a FOREIGN page reports what the page actually shows; and a
// display:none subtree (visible = false) reports off, which is the same answer
// the facts mean. One observer delivers all three facts:
//   on    — isIntersecting
//   rect  — intersectionRect mapped back into the VIEW's own coordinates via
//           the bounding/offset ratio (exact under uniform scale; under
//           rotation the AABB approximates — the honest limit of rect data)
//   scale — device pixels per local unit: the LARGEST axis ratio of
//           boundingClientRect to layout size, × devicePixelRatio (the
//           rasterization convention — CA's contentsScale rule)
// Registered lazily — a page where nothing binds the facts never constructs
// the observer.
const VISWATCH = new Map();
let visIO = null;
export function observeVisibility(el, cb) {
    if (typeof IntersectionObserver === "undefined")
        return () => { };
    visIO ??= new IntersectionObserver((entries) => {
        for (const e of entries) {
            const deliver = VISWATCH.get(e.target);
            if (deliver === undefined)
                continue;
            const t = e.target;
            const bw = e.boundingClientRect.width, bh = e.boundingClientRect.height;
            const lw = t.offsetWidth || 1, lh = t.offsetHeight || 1;
            const rw = bw / lw, rh = bh / lh; // per-axis css ratios
            const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
            const scale = Math.max(rw, rh) * dpr;
            const ir = e.intersectionRect;
            const rect = e.isIntersecting && rw > 0 && rh > 0
                ? {
                    x: (ir.x - e.boundingClientRect.x) / rw,
                    y: (ir.y - e.boundingClientRect.y) / rh,
                    width: ir.width / rw,
                    height: ir.height / rh,
                }
                : null;
            deliver({ on: e.isIntersecting, rect, scale });
        }
    });
    VISWATCH.set(el, cb);
    visIO.observe(el);
    return () => { VISWATCH.delete(el); visIO?.unobserve(el); };
}
/** Force a fresh entry for an observed element — observe() always reports an
 *  initial intersection, so unobserve+observe is "measure NOW, through the
 *  instrument itself": same clipping math, same page context. (A hand-rolled
 *  getBoundingClientRect walk would have to re-derive ancestor overflow
 *  clipping, and get it subtly wrong.) The runtime calls this when its model
 *  walk knows the answer moved but the observer saw no edge — an
 *  IntersectionObserver reports CROSSINGS, not levels, so a fully visible box
 *  under a scaling ancestor never crosses anything and never reports
 *  (visibility.ts, the wake — the sprung-camera fix). */
export function refreshObserved(el) {
    if (visIO === null || !VISWATCH.has(el))
        return;
    visIO.unobserve(el);
    visIO.observe(el);
}
//# sourceMappingURL=dom-visibility.js.map