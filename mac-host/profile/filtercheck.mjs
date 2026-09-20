// filtercheck — kernel/filter's WebAssembly must be BIT-IDENTICAL to the
// canvas-filter JavaScript it stands in for: the box blur (the plain form, as in
// blurcheck.mjs) and the colour matrix. Also times both.
//   node mac-host/profile/filtercheck.mjs
import { readFileSync } from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { instance } = await WebAssembly.instantiate(readFileSync(path.join(ROOT, "kernel/build/filter.wasm")), {});
const X = instance.exports; const mem = X.memory;
const heap = (X.__heap_base.value + 15) & ~15;
const ensure = (bytes) => { const need = heap + bytes - mem.buffer.byteLength; if (need > 0) mem.grow(Math.ceil(need / 65536)); };
const al16 = (x) => (x + 15) & ~15;
function wasmBlur(d, w, h, sigma) {
  if (sigma < 0.3) return;
  const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  const N = w * h * 4, pD = heap, pA = al16(pD + N), pB = al16(pA + N * 4), pS = al16(pB + N * 4);
  ensure(pS + w * 4 * 8 - heap);
  new Uint8Array(mem.buffer, pD, N).set(d);
  X.filter_blur(pD, w, h, r, pA, pB, pS);
  d.set(new Uint8Array(mem.buffer, pD, N));
}
function jsBlur(d, w, h, sigma) {   // the plain form (runtime before 2026-09-18)
  if (sigma < 0.3) return;
  const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  const n = w * h; const src = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { const a = d[i * 4 + 3] / 255; src[i * 4] = d[i * 4] * a; src[i * 4 + 1] = d[i * 4 + 1] * a; src[i * 4 + 2] = d[i * 4 + 2] * a; src[i * 4 + 3] = d[i * 4 + 3]; }
  let a = src, b = new Float32Array(n * 4);
  const pass = (horiz) => { const outer = horiz ? h : w, inner = horiz ? w : h; const step = horiz ? 4 : w * 4;
    for (let o = 0; o < outer; o++) { const base = horiz ? o * w * 4 : o * 4;
      for (let c = 0; c < 4; c++) { let sum = 0;
        for (let k = -r; k <= r; k++) sum += a[base + Math.min(inner - 1, Math.max(0, k)) * step + c];
        for (let i = 0; i < inner; i++) { b[base + i * step + c] = sum / (2 * r + 1); const add = Math.min(inner - 1, i + r + 1), sub = Math.max(0, i - r); sum += a[base + add * step + c] - a[base + sub * step + c]; } } }
    const t = a; a = b; b = t; };
  for (let i = 0; i < 3; i++) { pass(true); pass(false); }
  for (let i = 0; i < n; i++) { const al = a[i * 4 + 3]; const inv = al > 0.5 ? 255 / al : 0; d[i * 4] = a[i * 4] * inv; d[i * 4 + 1] = a[i * 4 + 1] * inv; d[i * 4 + 2] = a[i * 4 + 2] * inv; d[i * 4 + 3] = al; }
}
function matrixParams(f) {
  const cOff = (1 - f.contrast) * 127.5, hr = (f.hue * Math.PI) / 180, hc = Math.cos(hr), hs = Math.sin(hr);
  const H = [0.213 + hc * 0.787 - hs * 0.213, 0.715 - hc * 0.715 - hs * 0.715, 0.072 - hc * 0.072 + hs * 0.928,
    0.213 - hc * 0.213 + hs * 0.143, 0.715 + hc * 0.285 + hs * 0.140, 0.072 - hc * 0.072 - hs * 0.283,
    0.213 - hc * 0.213 - hs * 0.787, 0.715 - hc * 0.715 + hs * 0.715, 0.072 + hc * 0.928 + hs * 0.072];
  return [f.saturate, f.brightness, f.contrast, f.grayscale, f.invert, f.sepia, cOff, f.hue, ...H];
}
function wasmMatrix(d, f) {
  const pD = heap, pP = al16(pD + d.length); ensure(pP + 17 * 8 - heap);
  new Uint8Array(mem.buffer, pD, d.length).set(d); new Float64Array(mem.buffer, pP, 17).set(matrixParams(f));
  X.filter_matrix(pD, d.length, pP); d.set(new Uint8Array(mem.buffer, pD, d.length));
}
function jsMatrix(d, f) {   // canvas-filter.ts adjustInPlace's loop, verbatim
  const { saturate: s, brightness: b, contrast: k, grayscale: gs, invert: iv, sepia: sp, hue } = f;
  const LR = 0.2126, LG = 0.7152, LB = 0.0722; const cOff = (1 - k) * 127.5;
  const hr = (hue * Math.PI) / 180, hc = Math.cos(hr), hs = Math.sin(hr);
  const H = hue === 0 ? null : [0.213 + hc * 0.787 - hs * 0.213, 0.715 - hc * 0.715 - hs * 0.715, 0.072 - hc * 0.072 + hs * 0.928, 0.213 - hc * 0.213 + hs * 0.143, 0.715 + hc * 0.285 + hs * 0.140, 0.072 - hc * 0.072 - hs * 0.283, 0.213 - hc * 0.213 - hs * 0.787, 0.715 - hc * 0.715 + hs * 0.715, 0.072 + hc * 0.928 + hs * 0.072];
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], gr = d[i + 1], bl = d[i + 2];
    if (s !== 1 || gs !== 0) { const lum = LR * r + LG * gr + LB * bl; const m = gs !== 0 ? (1 - gs) * s : s; r = lum + (r - lum) * m; gr = lum + (gr - lum) * m; bl = lum + (bl - lum) * m; }
    if (sp !== 0) { const sr = 0.393 * r + 0.769 * gr + 0.189 * bl, sg = 0.349 * r + 0.686 * gr + 0.168 * bl, sb = 0.272 * r + 0.534 * gr + 0.131 * bl; r += (sr - r) * sp; gr += (sg - gr) * sp; bl += (sb - bl) * sp; }
    if (H !== null) { const nr = H[0] * r + H[1] * gr + H[2] * bl, ng = H[3] * r + H[4] * gr + H[5] * bl, nb = H[6] * r + H[7] * gr + H[8] * bl; r = nr; gr = ng; bl = nb; }
    if (b !== 1) { r *= b; gr *= b; bl *= b; }
    if (k !== 1) { r = r * k + cOff; gr = gr * k + cOff; bl = bl * k + cOff; }
    if (iv !== 0) { r = r + (255 - 2 * r) * iv; gr = gr + (255 - 2 * gr) * iv; bl = bl + (255 - 2 * bl) * iv; }
    d[i] = r < 0 ? 0 : r > 255 ? 255 : r; d[i + 1] = gr < 0 ? 0 : gr > 255 ? 255 : gr; d[i + 2] = bl < 0 ? 0 : bl > 255 ? 255 : bl;
  }
}
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const fill = (n, kind) => { const b = new Uint8ClampedArray(n); for (let i = 0; i < n; i++) b[i] = kind === "alpha0" && i % 4 === 3 ? 0 : kind === "opaque" && i % 4 === 3 ? 255 : kind === "sparse" ? (rnd() < 0.05 ? 255 : 0) : Math.floor(rnd() * 256); return b; };
let cases = 0;
for (const [w, h] of [[1, 1], [3, 2], [17, 9], [64, 48], [150, 100], [480, 300], [37, 211]]) for (const sigma of [0.2, 0.7, 2.3, 6, 12.5, 40]) for (const kind of ["rand", "alpha0", "opaque", "sparse"]) {
  const base = fill(w * h * 4, kind); const x = new Uint8ClampedArray(base), y = new Uint8ClampedArray(base);
  jsBlur(x, w, h, sigma); wasmBlur(y, w, h, sigma);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) { console.log("BLUR MISMATCH", w, h, sigma, kind, "byte", i, x[i], y[i]); process.exit(1); }
  cases++;
}
console.log(`blur: bit-identical on ${cases} cases`);
const specs = [];
const one = { saturate: 1, brightness: 1, contrast: 1, grayscale: 0, invert: 0, sepia: 0, hue: 0 };
for (const [k, vals] of Object.entries({ saturate: [0, 0.5, 1.8, 3], brightness: [0.3, 1.4], contrast: [0.5, 1.7], grayscale: [0.4, 1], invert: [0.3, 1], sepia: [0.6, 1], hue: [37, 180, -90] })) for (const v of vals) specs.push({ ...one, [k]: v });
specs.push({ saturate: 1.8, brightness: 1.1, contrast: 1.2, grayscale: 0, invert: 0, sepia: 0.2, hue: 15 }, { saturate: 0.7, brightness: 0.9, contrast: 0.8, grayscale: 0.3, invert: 0.1, sepia: 0, hue: -40 });
for (const f of specs) {
  const base = fill(64 * 64 * 4, "rand"); const x = new Uint8ClampedArray(base), y = new Uint8ClampedArray(base);
  jsMatrix(x, f); wasmMatrix(y, f);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) { console.log("MATRIX MISMATCH", JSON.stringify(f), "byte", i, x[i], y[i]); process.exit(1); }
}
console.log(`matrix: bit-identical on ${specs.length} filter combinations`);
for (const [w, h, sigma] of [[480, 300, 12], [960, 600, 12], [150, 100, 12]]) {
  const img = fill(w * h * 4, "rand");
  const t = (fn) => { for (let k = 0; k < 3; k++) fn(new Uint8ClampedArray(img), w, h, sigma); const t0 = performance.now(); for (let k = 0; k < 10; k++) fn(new Uint8ClampedArray(img), w, h, sigma); return (performance.now() - t0) / 10; };
  const tj = t(jsBlur), tw = t(wasmBlur);
  console.log(`blur ${w}x${h} σ${sigma}: plain JS ${tj.toFixed(2)} ms · wasm ${tw.toFixed(2)} ms · ${(tj / tw).toFixed(1)}×`);
}
{ const img = fill(480 * 300 * 4, "rand"); const f = { ...one, saturate: 1.8, brightness: 1.1 };
  const t = (fn) => { for (let k = 0; k < 3; k++) fn(new Uint8ClampedArray(img), f); const t0 = performance.now(); for (let k = 0; k < 10; k++) fn(new Uint8ClampedArray(img), f); return (performance.now() - t0) / 10; };
  const tj = t(jsMatrix), tw = t(wasmMatrix); console.log(`matrix 480x300: JS ${tj.toFixed(2)} ms · wasm ${tw.toFixed(2)} ms · ${(tj / tw).toFixed(1)}×`); }
