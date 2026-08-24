// Canvas 2D `filter`, for engines that do not have it.
//
// WebKit accepts `ctx.filter = "blur(12px)"` — it reads back verbatim — and
// then paints unfiltered. Measured 2026-08-24 on Safari 26.6 / macOS 26.6.1 and
// in WKWebView: `"filter" in ctx` is false, the assignment lands as a plain
// expando, and a blurred rect does not bleed one pixel past its own edge. So it
// is not a feature that throws or reports absence; it is one that lies, which
// is why nothing caught it for so long.
//
// That matters beyond an author's `d.filter`: the canvas backend's FROST is
// `ctx.filter = blur() saturate()` over a sample of what is underneath
// (canvas-backend paintFrost), so on that engine a glass surface composited an
// unmodified copy of its backdrop and laid the fill over it. Weather's whole
// glass treatment, flat.
//
// ── how the fallback works ────────────────────────────────────────────────
//
// A gaussian is O(radius²) per pixel and hand-rolling one over a full region
// per frame is not affordable. But a repeated HALVING downscale followed by an
// upscale is a very good gaussian approximation and costs O(pixels) — the
// bilinear sampler in the GPU's own scaler does the averaging, and each halving
// doubles the effective radius. That is the standard pyramid blur, and it is
// exactly the shape frost wants: a diffuse, wide, cheap blur.
//
// The colour adjustment then rides for almost nothing, because it happens on
// the SMALLEST buffer in the pyramid — a quarter-scale buffer is a sixteenth of
// the pixels, so a per-pixel matrix there costs a sixteenth of what it would at
// full size, and the upscale that follows carries it back out. Colour is
// smooth under bilinear magnification, so doing it small loses nothing visible.
//
// Anything this cannot express is left UNAPPLIED and reported once, rather than
// silently dropped — the failure mode that produced this file in the first
// place.
const IDENTITY = { blur: 0, saturate: 1, brightness: 1, contrast: 1, grayscale: 0, invert: 0, unsupported: [] };
/** Parse the CSS filter subset. A percentage or a plain number both work, as in
 *  CSS (`saturate(180%)` === `saturate(1.8)`). */
export function parseFilter(css) {
    const out = { ...IDENTITY, unsupported: [] };
    if (css === "" || css === "none")
        return out;
    const num = (raw, dflt) => {
        const t = raw.trim();
        if (t === "")
            return dflt;
        if (t.endsWith("%"))
            return parseFloat(t) / 100;
        return parseFloat(t);
    };
    for (const m of css.matchAll(/([a-zA-Z-]+)\(([^)]*)\)/g)) {
        const fn = m[1].toLowerCase();
        const arg = m[2];
        switch (fn) {
            case "blur":
                out.blur = Math.max(0, parseFloat(arg) || 0);
                break;
            case "saturate":
                out.saturate = num(arg, 1);
                break;
            case "brightness":
                out.brightness = num(arg, 1);
                break;
            case "contrast":
                out.contrast = num(arg, 1);
                break;
            case "grayscale":
                out.grayscale = Math.min(1, Math.max(0, num(arg, 0)));
                break;
            case "invert":
                out.invert = Math.min(1, Math.max(0, num(arg, 0)));
                break;
            default:
                out.unsupported.push(fn);
                break;
        }
    }
    return out;
}
export function isIdentity(f) {
    return f.blur === 0 && f.saturate === 1 && f.brightness === 1 && f.contrast === 1 && f.grayscale === 0 && f.invert === 0;
}
/** Does THIS engine actually honour ctx.filter? Cached, and answered by DRAWING
 *  rather than by asking: `"filter" in ctx` happens to be false on WebKit today,
 *  but a property test is exactly the kind of thing that starts passing while
 *  the paint stays unfiltered. So: blur a hard edge and look for the bleed. */
let supported = null;
export function ctxFilterSupported() {
    // the A/B lever: force the fallback on an engine that HAS filter, so the two
    // paths can be diffed against each other on one machine
    if (globalThis.__declareForceFilterFallback === true)
        return false;
    if (supported !== null)
        return supported;
    try {
        const c = document.createElement("canvas");
        c.width = 60;
        c.height = 20;
        const g = c.getContext("2d");
        if (g === null)
            return (supported = false);
        g.fillStyle = "#000";
        g.fillRect(0, 0, 30, 20);
        g.fillStyle = "#fff";
        g.fillRect(30, 0, 30, 20);
        const snap = document.createElement("canvas");
        snap.width = 60;
        snap.height = 20;
        snap.getContext("2d").drawImage(c, 0, 0);
        g.filter = "blur(6px)";
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(snap, 0, 0);
        g.filter = "none";
        let mid = 0;
        for (let x = 24; x < 36; x++) {
            const v = g.getImageData(x, 10, 1, 1).data[0];
            if (v > 20 && v < 235)
                mid++;
        }
        return (supported = mid >= 3);
    }
    catch {
        return (supported = false);
    }
}
/** @internal test seam — force the fallback path on an engine that has filter,
 *  so the two can be diffed against each other. */
export function forceFilterFallback(on) {
    supported = on ? false : null;
}
let warned = false;
function reportUnsupported(fns) {
    if (warned || fns.length === 0)
        return;
    warned = true;
    console.warn(`[declare] canvas filter ${fns.join(", ")} is not expressible on this engine and was not applied.`);
}
const scratch = [];
function take(w, h) {
    const c = scratch.pop() ?? document.createElement("canvas");
    c.width = Math.max(1, w);
    c.height = Math.max(1, h);
    return c;
}
function give(c) {
    if (scratch.length < 4)
        scratch.push(c);
}
/** The per-pixel half — saturate/brightness/contrast/grayscale/invert as one
 *  pass, in the same order CSS applies them. Runs on whatever buffer it is
 *  handed, which is the smallest one in the pyramid whenever a blur is present. */
function adjustInPlace(c, f) {
    const g = c.getContext("2d", { willReadFrequently: true });
    if (g === null)
        return;
    const img = g.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    const { saturate: s, brightness: b, contrast: k, grayscale: gs, invert: iv } = f;
    // luma coefficients CSS's saturate matrix is built from
    const LR = 0.2126, LG = 0.7152, LB = 0.0722;
    const cOff = (1 - k) * 127.5;
    for (let i = 0; i < d.length; i += 4) {
        let r = d[i], gr = d[i + 1], bl = d[i + 2];
        if (s !== 1 || gs !== 0) {
            const lum = LR * r + LG * gr + LB * bl;
            const m = gs !== 0 ? (1 - gs) * s : s; // grayscale rides the same lerp
            r = lum + (r - lum) * m;
            gr = lum + (gr - lum) * m;
            bl = lum + (bl - lum) * m;
        }
        if (b !== 1) {
            r *= b;
            gr *= b;
            bl *= b;
        }
        if (k !== 1) {
            r = r * k + cOff;
            gr = gr * k + cOff;
            bl = bl * k + cOff;
        }
        if (iv !== 0) {
            r = r + (255 - 2 * r) * iv;
            gr = gr + (255 - 2 * gr) * iv;
            bl = bl + (255 - 2 * bl) * iv;
        }
        d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
        d[i + 1] = gr < 0 ? 0 : gr > 255 ? 255 : gr;
        d[i + 2] = bl < 0 ? 0 : bl > 255 ? 255 : bl;
    }
    g.putImageData(img, 0, 0);
}
/** Apply `spec` to `src` and return a canvas holding the result. The caller owns
 *  neither buffer beyond the next call — this recycles scratch canvases, because
 *  frost runs every frame the scene invalidates and allocating two canvases per
 *  frosted view per frame is its own performance bug. */
export function applyFilterFallback(src, spec) {
    reportUnsupported(spec.unsupported);
    const w = src.width, h = src.height;
    if (spec.blur <= 0.5) {
        const flat = take(w, h);
        flat.getContext("2d").drawImage(src, 0, 0);
        if (!isIdentity({ ...spec, blur: 0 }))
            adjustInPlace(flat, spec);
        return flat;
    }
    // How far down the pyramid: each halving roughly doubles the effective
    // radius, so the number of steps is log2 of the radius, floored so a small
    // blur still takes at least one step and a huge one cannot reduce the buffer
    // below a couple of pixels (where the upscale would show banding).
    const steps = Math.max(1, Math.min(6, Math.round(Math.log2(Math.max(2, spec.blur)))));
    let cur = take(w, h);
    cur.getContext("2d").drawImage(src, 0, 0);
    const chain = [];
    for (let i = 0; i < steps; i++) {
        const nw = Math.max(2, Math.floor(cur.width / 2));
        const nh = Math.max(2, Math.floor(cur.height / 2));
        if (nw === cur.width && nh === cur.height)
            break;
        const next = take(nw, nh);
        const ng = next.getContext("2d");
        ng.imageSmoothingEnabled = true;
        ng.imageSmoothingQuality = "high";
        ng.drawImage(cur, 0, 0, cur.width, cur.height, 0, 0, nw, nh);
        chain.push(cur);
        cur = next;
    }
    // the colour matrix, on the smallest buffer — a sixteenth of the pixels at
    // two halvings, and colour survives bilinear magnification intact
    if (!isIdentity({ ...spec, blur: 0 }))
        adjustInPlace(cur, spec);
    // …and back up, one halving at a time. Going straight to full size in one
    // draw would show the smallest buffer's texels as soft squares; stepping up
    // re-filters at every level, which is what makes it read as a gaussian.
    for (let i = chain.length - 1; i >= 0; i--) {
        const up = chain[i];
        const ug = up.getContext("2d");
        ug.imageSmoothingEnabled = true;
        ug.imageSmoothingQuality = "high";
        ug.clearRect(0, 0, up.width, up.height);
        ug.drawImage(cur, 0, 0, cur.width, cur.height, 0, 0, up.width, up.height);
        give(cur);
        cur = up;
    }
    return cur;
}
//# sourceMappingURL=canvas-filter.js.map