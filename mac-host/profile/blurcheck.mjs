// blurcheck — the restructured canvas-filter boxBlur must stay BIT-IDENTICAL to the plain form it replaced (kept here as `old`), and faster. `node mac-host/profile/blurcheck.mjs`
// old = the runtime's current boxBlur, verbatim; neu = the restructured one. Bit-identity + timing.
function old(d, w, h, sigma) {
  if (sigma < 0.3) return;
  const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  const n = w * h;
  const src = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { const a = d[i * 4 + 3] / 255; src[i * 4] = d[i * 4] * a; src[i * 4 + 1] = d[i * 4 + 1] * a; src[i * 4 + 2] = d[i * 4 + 2] * a; src[i * 4 + 3] = d[i * 4 + 3]; }
  let a = src, b = new Float32Array(n * 4);
  const pass = (horiz) => {
    const outer = horiz ? h : w, inner = horiz ? w : h; const step = horiz ? 4 : w * 4;
    for (let o = 0; o < outer; o++) { const base = horiz ? o * w * 4 : o * 4;
      for (let c = 0; c < 4; c++) { let sum = 0;
        for (let k = -r; k <= r; k++) sum += a[base + Math.min(inner - 1, Math.max(0, k)) * step + c];
        for (let i = 0; i < inner; i++) { b[base + i * step + c] = sum / (2 * r + 1); const add = Math.min(inner - 1, i + r + 1), sub = Math.max(0, i - r); sum += a[base + add * step + c] - a[base + sub * step + c]; } } }
    const t = a; a = b; b = t;
  };
  for (let i = 0; i < 3; i++) { pass(true); pass(false); }
  for (let i = 0; i < n; i++) { const al = a[i * 4 + 3]; const inv = al > 0.5 ? 255 / al : 0; d[i * 4] = a[i * 4] * inv; d[i * 4 + 1] = a[i * 4 + 1] * inv; d[i * 4 + 2] = a[i * 4 + 2] * inv; d[i * 4 + 3] = al; }
}
let bufA = new Float32Array(0), bufB = new Float32Array(0), sums = new Float64Array(0);
function neu(d, w, h, sigma) {
  if (sigma < 0.3) return;
  const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  const n = w * h, N = n * 4, div = 2 * r + 1, W4 = w * 4;
  if (bufA.length < N) { bufA = new Float32Array(N); bufB = new Float32Array(N); }
  if (sums.length < W4) sums = new Float64Array(W4);
  let a = bufA, b = bufB;
  for (let i = 0; i < n; i++) { const a0 = d[i * 4 + 3] / 255; a[i * 4] = d[i * 4] * a0; a[i * 4 + 1] = d[i * 4 + 1] * a0; a[i * 4 + 2] = d[i * 4 + 2] * a0; a[i * 4 + 3] = d[i * 4 + 3]; }
  const hpass = () => {
    const last = w - 1;
    for (let o = 0; o < h; o++) {
      const base = o * W4;
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
      for (let k = -r; k <= r; k++) { const x = base + (k < 0 ? 0 : k > last ? last : k) * 4; s0 += a[x]; s1 += a[x + 1]; s2 += a[x + 2]; s3 += a[x + 3]; }
      for (let i = 0; i < w; i++) {
        const o4 = base + i * 4;
        b[o4] = s0 / div; b[o4 + 1] = s1 / div; b[o4 + 2] = s2 / div; b[o4 + 3] = s3 / div;
        const ai = i + r + 1, si = i - r;
        const ad = base + (ai > last ? last : ai) * 4, sb = base + (si < 0 ? 0 : si) * 4;
        s0 += a[ad] - a[sb]; s1 += a[ad + 1] - a[sb + 1]; s2 += a[ad + 2] - a[sb + 2]; s3 += a[ad + 3] - a[sb + 3];
      }
    }
    const t = a; a = b; b = t;
  };
  const vpass = () => {
    const last = h - 1;
    sums.fill(0, 0, W4);
    for (let k = -r; k <= r; k++) { const row = (k < 0 ? 0 : k > last ? last : k) * W4; for (let c = 0; c < W4; c++) sums[c] += a[row + c]; }
    for (let i = 0; i < h; i++) {
      const row = i * W4, ai = i + r + 1, si = i - r;
      const addRow = (ai > last ? last : ai) * W4, subRow = (si < 0 ? 0 : si) * W4;
      for (let c = 0; c < W4; c++) { b[row + c] = sums[c] / div; sums[c] += a[addRow + c] - a[subRow + c]; }
    }
    const t = a; a = b; b = t;
  };
  for (let i = 0; i < 3; i++) { hpass(); vpass(); }
  for (let i = 0; i < n; i++) { const al = a[i * 4 + 3]; const inv = al > 0.5 ? 255 / al : 0; d[i * 4] = a[i * 4] * inv; d[i * 4 + 1] = a[i * 4 + 1] * inv; d[i * 4 + 2] = a[i * 4 + 2] * inv; d[i * 4 + 3] = al; }
}
// bit-identity over sizes, sigmas and content (random, transparent, opaque, edges)
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
let checked = 0;
for (const [w, h] of [[1, 1], [3, 2], [17, 9], [64, 48], [150, 100], [480, 300], [37, 211]]) for (const sigma of [0.2, 0.7, 2.3, 6, 12.5, 40]) for (const kind of ["rand", "alpha0", "opaque", "sparse"]) {
  const base = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < base.length; i++) base[i] = kind === "alpha0" && i % 4 === 3 ? 0 : kind === "opaque" && i % 4 === 3 ? 255 : kind === "sparse" ? (rnd() < 0.05 ? 255 : 0) : Math.floor(rnd() * 256);
  const x = new Uint8ClampedArray(base), y = new Uint8ClampedArray(base);
  old(x, w, h, sigma); neu(y, w, h, sigma);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) { console.log("MISMATCH", w, h, sigma, kind, i, x[i], y[i]); process.exit(1); }
  checked++;
}
console.log(`bit-identical on ${checked} cases`);
// timing at the desktop wallpaper's buffer (480x300, sigma 12) and a large one
for (const [w, h, sigma] of [[480, 300, 12], [960, 600, 12], [150, 100, 12]]) {
  const img = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < img.length; i++) img[i] = Math.floor(rnd() * 256);
  const t = (f) => { for (let k = 0; k < 3; k++) f(new Uint8ClampedArray(img), w, h, sigma); const t0 = performance.now(); for (let k = 0; k < 10; k++) f(new Uint8ClampedArray(img), w, h, sigma); return (performance.now() - t0) / 10; };
  const to = t(old), tn = t(neu);
  console.log(`${w}x${h} σ${sigma}: old ${to.toFixed(2)} ms · new ${tn.toFixed(2)} ms · ${(to / tn).toFixed(1)}× faster`);
}
