// The DOM renderer's realization of the effects a program has to NAME: the
// `colorize` filter (an SVG colour matrix CSS can reference) and the `mask`
// slot (CSS mask-image). Its own file so a production build carries it only for
// a program that writes `colorize` or sets a `mask` (declarec's slim-dom-effects);
// the filter and backdrop lists themselves are plain CSS in dom-backend.ts.
import { colorToCss, gradientCss } from "./value.js";
import { rasterPad, replay } from "./draw.js";
let maskWarned = false;
function warnMaskStencil() {
    if (maskWarned)
        return;
    maskWarned = true;
    console.warn("[Declare] a mask stencil on the DOM renderer must be an Image or a view with draw() — its alpha is what CSS mask-image can take; other stencils mask on the canvas and Mac renderers only.");
}
/** `colorize(color)` in a filter list has no CSS function: it is an SVG
 *  `feColorMatrix` that maps every pixel to the colour and keeps alpha —
 *  registered once per colour in a zero-size <svg> the document keeps, and
 *  referenced as `url(#id)` inside the element's `filter:` list. */
const tintRefs = new WeakMap();
export function tintFilterRef(doc, color) {
    const c = color ?? 0;
    let refs = tintRefs.get(doc);
    if (refs === undefined) {
        refs = new Map();
        tintRefs.set(doc, refs);
    }
    const hit = refs.get(c);
    if (hit !== undefined)
        return hit;
    const css = colorToCss(c); // #rrggbb or #rrggbbaa
    const r = parseInt(css.slice(1, 3), 16) / 255, g = parseInt(css.slice(3, 5), 16) / 255, b = parseInt(css.slice(5, 7), 16) / 255;
    const a = css.length === 9 ? parseInt(css.slice(7, 9), 16) / 255 : 1;
    const id = "declare-tint-" + css.slice(1);
    let host = doc.getElementById("declare-svg-filters");
    if (host === null) {
        const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = "declare-svg-filters";
        svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
        doc.body.appendChild(svg);
        host = svg;
    }
    const f = doc.createElementNS("http://www.w3.org/2000/svg", "filter");
    f.id = id;
    f.setAttribute("color-interpolation-filters", "sRGB");
    const m = doc.createElementNS("http://www.w3.org/2000/svg", "feColorMatrix");
    m.setAttribute("type", "matrix");
    m.setAttribute("values", `0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 ${a} 0`);
    f.appendChild(m);
    host.appendChild(f);
    const ref = `url(#${id})`;
    refs.set(c, ref);
    return ref;
}
/** The soft mask (graphics-pass.md §2) onto `s`'s element: CSS `mask-image`. A
 *  gradient masks by its alpha over the box. A STENCIL view masks by its painted
 *  alpha at its own box — and the DOM can only hand CSS a bitmap it already
 *  holds: an Image stencil's source, or a draw() stencil's raster (re-exported
 *  when it re-rasterizes — `maskUsers`). Any other stencil is refused with one
 *  warning; the canvas and Mac backends take any view. */
export function applyDomMask(s) {
    const st = s.element.style;
    const set = (image, size, position) => {
        st.maskImage = image;
        st.webkitMaskImage = image;
        st.maskSize = size;
        st.webkitMaskSize = size;
        st.maskPosition = position;
        st.webkitMaskPosition = position;
        st.maskRepeat = "no-repeat";
        st.webkitMaskRepeat = "no-repeat";
    };
    const spec = s.maskSpec;
    if (spec === null) {
        set("", "", "");
        return;
    }
    if (spec.kind === "gradient") {
        set(gradientCss(spec.gradient), "100% 100%", "0 0");
        return;
    }
    const stencil = spec.stencil;
    const src = stencil.surface;
    if (src === null) {
        set("", "", "");
        return;
    } // not attached yet — the stencil's flush re-pushes
    (src.maskUsers ??= new Set()).add(s);
    const m = maskBitmap(src);
    if (m === null) {
        // an Image still loading (its arrival re-applies), or a stencil this
        // renderer cannot export — a filled box, a text run: said once, since
        // the canvas and Mac renderers take any view and the difference is
        // this renderer's (mask-image wants a bitmap it already holds)
        if (src.imgEl === null && src.drawing === null && src.stencilSettled)
            warnMaskStencil();
        src.stencilSettled = true;
        set("", "", "");
        return;
    }
    set(m.url, `${m.w}px ${m.h}px`, `${stencil.x + stencil.positionLead("x") + m.x}px ${stencil.y + stencil.positionLead("y") + m.y}px`);
}
/** A surface's paint as a mask bitmap, in its own coordinates: an Image's
 *  source over its box, or a draw() recording rendered to a data URL at its
 *  bounds — rendered here even when the view is hidden (the stencil idiom),
 *  since a hidden view holds no raster of its own. */
function maskBitmap(s) {
    if (s.imgEl instanceof HTMLImageElement) {
        if (!s.imgEl.complete || s.imgEl.naturalWidth === 0)
            return null;
        return { url: `url("${s.imgEl.src}")`, x: 0, y: 0, w: s.frameW, h: s.frameH };
    }
    const d = s.drawing;
    if (d === null || d.bounds === null)
        return null;
    const pad = rasterPad(d);
    const b = { x: d.bounds.x - pad, y: d.bounds.y - pad, w: d.bounds.w + 2 * pad, h: d.bounds.h + 2 * pad };
    const k = window.devicePixelRatio || 1;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(b.w * k));
    c.height = Math.max(1, Math.ceil(b.h * k));
    const g = c.getContext("2d");
    g.setTransform(k, 0, 0, k, -b.x * k, -b.y * k);
    replay(g, d);
    return { url: `url("${c.toDataURL()}")`, x: b.x, y: b.y, w: b.w, h: b.h };
}
//# sourceMappingURL=dom-effects.js.map