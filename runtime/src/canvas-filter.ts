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

/** The subset of CSS filter functions expressible here. `blur` is the pyramid;
 *  the rest are a per-pixel matrix folded into one pass over the small buffer. */
export interface FilterSpec {
  blur: number;
  saturate: number;
  brightness: number;
  contrast: number;
  grayscale: number;
  invert: number;
  /** Functions present in the string that this cannot express — reported, not applied. */
  unsupported: string[];
}

const IDENTITY: FilterSpec = { blur: 0, saturate: 1, brightness: 1, contrast: 1, grayscale: 0, invert: 0, unsupported: [] };

/** Parse the CSS filter subset. A percentage or a plain number both work, as in
 *  CSS (`saturate(180%)` === `saturate(1.8)`). */
export function parseFilter(css: string): FilterSpec {
  const out: FilterSpec = { ...IDENTITY, unsupported: [] };
  if (css === "" || css === "none") return out;
  const num = (raw: string, dflt: number): number => {
    const t = raw.trim();
    if (t === "") return dflt;
    if (t.endsWith("%")) return parseFloat(t) / 100;
    return parseFloat(t);
  };
  for (const m of css.matchAll(/([a-zA-Z-]+)\(([^)]*)\)/g)) {
    const fn = m[1].toLowerCase();
    const arg = m[2];
    switch (fn) {
      case "blur": out.blur = Math.max(0, parseFloat(arg) || 0); break;
      case "saturate": out.saturate = num(arg, 1); break;
      case "brightness": out.brightness = num(arg, 1); break;
      case "contrast": out.contrast = num(arg, 1); break;
      case "grayscale": out.grayscale = Math.min(1, Math.max(0, num(arg, 0))); break;
      case "invert": out.invert = Math.min(1, Math.max(0, num(arg, 0))); break;
      default: out.unsupported.push(fn); break;
    }
  }
  return out;
}

export function isIdentity(f: FilterSpec): boolean {
  return f.blur === 0 && f.saturate === 1 && f.brightness === 1 && f.contrast === 1 && f.grayscale === 0 && f.invert === 0;
}

/** Does THIS engine actually honour ctx.filter? Cached, and answered by DRAWING
 *  rather than by asking: `"filter" in ctx` happens to be false on WebKit today,
 *  but a property test is exactly the kind of thing that starts passing while
 *  the paint stays unfiltered. So: blur a hard edge and look for the bleed. */
let supported: boolean | null = null;
export function ctxFilterSupported(): boolean {
  // the A/B lever: force the fallback on an engine that HAS filter, so the two
  // paths can be diffed against each other on one machine
  if ((globalThis as { __declareForceFilterFallback?: boolean }).__declareForceFilterFallback === true) return false;
  if (supported !== null) return supported;
  // no DOM (a headless boot, a Node rung) — there is no canvas to test and
  // nothing will paint, so claim support and take the direct path
  if (typeof document === "undefined") return (supported = true);
  try {
    const c = document.createElement("canvas");
    c.width = 60; c.height = 20;
    const g = c.getContext("2d");
    if (g === null) return (supported = false);
    g.fillStyle = "#000";
    g.fillRect(0, 0, 30, 20);
    g.fillStyle = "#fff";
    g.fillRect(30, 0, 30, 20);
    const snap = document.createElement("canvas");
    snap.width = 60; snap.height = 20;
    snap.getContext("2d")!.drawImage(c, 0, 0);
    g.filter = "blur(6px)";
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(snap, 0, 0);
    g.filter = "none";
    let mid = 0;
    for (let x = 24; x < 36; x++) {
      const v = g.getImageData(x, 10, 1, 1).data[0];
      if (v > 20 && v < 235) mid++;
    }
    return (supported = mid >= 3);
  } catch {
    return (supported = false);
  }
}

/** @internal test seam — force the fallback path on an engine that has filter,
 *  so the two can be diffed against each other. */
export function forceFilterFallback(on: boolean): void {
  supported = on ? false : null;
}

let warned = false;
function reportUnsupported(fns: string[]): void {
  if (warned || fns.length === 0) return;
  warned = true;
  console.warn(`[declare] canvas filter ${fns.join(", ")} is not expressible on this engine and was not applied.`);
}

const scratch: HTMLCanvasElement[] = [];
function take(w: number, h: number): HTMLCanvasElement {
  const c = scratch.pop() ?? document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}
function give(c: HTMLCanvasElement): void {
  if (scratch.length < 4) scratch.push(c);
}

/** The per-pixel half — saturate/brightness/contrast/grayscale/invert as one
 *  pass, in the same order CSS applies them. Runs on whatever buffer it is
 *  handed, which is the smallest one in the pyramid whenever a blur is present. */
function adjustInPlace(c: HTMLCanvasElement, f: FilterSpec): void {
  const g = c.getContext("2d", { willReadFrequently: true });
  if (g === null) return;
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
      const m = gs !== 0 ? (1 - gs) * s : s;   // grayscale rides the same lerp
      r = lum + (r - lum) * m;
      gr = lum + (gr - lum) * m;
      bl = lum + (bl - lum) * m;
    }
    if (b !== 1) { r *= b; gr *= b; bl *= b; }
    if (k !== 1) { r = r * k + cOff; gr = gr * k + cOff; bl = bl * k + cOff; }
    if (iv !== 0) { r = r + (255 - 2 * r) * iv; gr = gr + (255 - 2 * gr) * iv; bl = bl + (255 - 2 * bl) * iv; }
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
/** Three box passes ≈ a gaussian, and the relationship is EXACT rather than
 *  fitted: for a box of width w, sigma² = 3(w²−1)/12, so w = sqrt(4·sigma²/3 + 1).
 *  That is why this replaced a resample pyramid — a pyramid's sigma is not a
 *  clean function of its total downsample factor (measured: the same factor and
 *  the same step count produced sigma 16.7 at one buffer size and 11.9 at
 *  another), so it could not be calibrated, only fitted, and the fit did not
 *  hold across dpr.
 *
 *  Runs on PREMULTIPLIED values. Blurring straight RGBA drags the colour of
 *  fully transparent pixels into the edge — a mark on a transparent ground
 *  develops a dark halo — and every mark this path filters is on one. */
function boxBlur(d: Uint8ClampedArray, w: number, h: number, sigma: number): void {
  if (sigma < 0.3) return;
  // n box passes of width w give sigma² = n(w²−1)/12; at n = 3 that is
  // sigma² = (w²−1)/4, so w = sqrt(4·sigma²+1) and the RADIUS is (w−1)/2.
  // (Solving for w and then halving it is not the same thing — doing that
  // under-blurred by a factor of two, measured 9.9 against a native 19.7.)
  const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  const n = w * h;
  const src = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = d[i * 4 + 3] / 255;
    src[i * 4] = d[i * 4] * a;
    src[i * 4 + 1] = d[i * 4 + 1] * a;
    src[i * 4 + 2] = d[i * 4 + 2] * a;
    src[i * 4 + 3] = d[i * 4 + 3];
  }
  let a = src, b = new Float32Array(n * 4);
  const pass = (horiz: boolean): void => {
    const outer = horiz ? h : w, inner = horiz ? w : h;
    const step = horiz ? 4 : w * 4;
    for (let o = 0; o < outer; o++) {
      const base = horiz ? o * w * 4 : o * 4;
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        // seed the window with edge clamping, then slide it — O(pixels), not
        // O(pixels · radius), which is what makes a wide blur affordable at all
        for (let k = -r; k <= r; k++) sum += a[base + Math.min(inner - 1, Math.max(0, k)) * step + c];
        for (let i = 0; i < inner; i++) {
          b[base + i * step + c] = sum / (2 * r + 1);
          const add = Math.min(inner - 1, i + r + 1), sub = Math.max(0, i - r);
          sum += a[base + add * step + c] - a[base + sub * step + c];
        }
      }
    }
    const t = a; a = b; b = t;
  };
  for (let i = 0; i < 3; i++) { pass(true); pass(false); }
  for (let i = 0; i < n; i++) {
    const al = a[i * 4 + 3];
    const inv = al > 0.5 ? 255 / al : 0;
    d[i * 4] = a[i * 4] * inv;
    d[i * 4 + 1] = a[i * 4 + 1] * inv;
    d[i * 4 + 2] = a[i * 4 + 2] * inv;
    d[i * 4 + 3] = al;
  }
}

/** Apply `spec` to `src` and return a canvas holding the result. The caller owns
 *  neither buffer beyond the next call — this recycles scratch canvases, because
 *  frost runs every frame the scene invalidates and allocating two canvases per
 *  frosted view per frame is its own performance bug.
 *
 *  A wide blur is done on a DOWNSAMPLED buffer and scaled back: the cost then
 *  falls with the square of the factor, and the resampling either side is itself
 *  part of the blur, so its contribution is subtracted from the box passes
 *  rather than ignored. The colour matrix rides the same small buffer. */
export function applyFilterFallback(src: HTMLCanvasElement, spec: FilterSpec): HTMLCanvasElement {
  reportUnsupported(spec.unsupported);
  const w = src.width, h = src.height;
  const colour = !isIdentity({ ...spec, blur: 0 });
  if (spec.blur <= 0.5) {
    const flat = take(w, h);
    flat.getContext("2d")!.drawImage(src, 0, 0);
    if (colour) adjustInPlace(flat, spec);
    return flat;
  }
  // Keep roughly 6 sigma of detail in the small buffer. The box radius is an
  // INTEGER, so a small sigma quantizes coarsely — at sigma 2.8 the nearest
  // radius is 12% off, at sigma 6.6 it is 2%. Trading a little more CPU for a
  // buffer that can express the radius is the better side of that deal.
  let f = Math.max(1, Math.min(8, Math.round(spec.blur / 6)));
  while (f > 1 && (Math.floor(w / f) < 8 || Math.floor(h / f) < 8)) f--;
  const sw = Math.max(1, Math.floor(w / f)), sh = Math.max(1, Math.floor(h / f));

  const small = take(sw, sh);
  const sg = small.getContext("2d", { willReadFrequently: true })!;
  sg.imageSmoothingEnabled = true;
  sg.imageSmoothingQuality = "high";
  sg.drawImage(src, 0, 0, w, h, 0, 0, sw, sh);

  // a box average over `f` pixels has sigma f/sqrt(12); it happens twice, going
  // down and coming back up, and variances add
  const resample = f > 1 ? 2 * (f * f / 12) : 0;
  const sigmaFull = Math.sqrt(Math.max(0, spec.blur * spec.blur - resample));
  const img = sg.getImageData(0, 0, sw, sh);
  boxBlur(img.data, sw, sh, sigmaFull / f);
  sg.putImageData(img, 0, 0);
  if (colour) adjustInPlace(small, spec);

  const out = take(w, h);
  const og = out.getContext("2d")!;
  og.imageSmoothingEnabled = true;
  og.imageSmoothingQuality = "high";
  og.drawImage(small, 0, 0, sw, sh, 0, 0, w, h);
  give(small);
  return out;
}
