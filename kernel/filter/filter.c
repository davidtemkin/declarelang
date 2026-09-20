// filter — the canvas `filter` FALLBACK's pixel arithmetic, in WebAssembly.
//
// Safari's 2D canvas accepts `ctx.filter` and paints unfiltered, so the runtime
// filters in software there (runtime/src/canvas-filter.ts): a three-pass box
// blur standing in for a gaussian, and the CSS colour-function matrix. These are
// the same two loops, moved here because they are pure arithmetic over pixels.
//
// THE CONTRACT IS BIT-IDENTITY WITH THE JAVASCRIPT. Every value is computed in
// the same precision and order the JS computes it: blur sums in double, blur
// buffers in float32 (a Float32Array's rounding on store), divisions in double,
// matrix arithmetic in double evaluated left to right as written — and the byte
// written back goes through the Uint8ClampedArray rule (clamp, then round half
// to even). Core WebAssembly has no fused multiply-add, so nothing contracts.
// mac-host/profile/blurcheck.mjs holds both forms to it.
//
// Freestanding: no libc, no allocation. The caller lays out the buffers in this
// module's memory and passes their addresses.
#include <wasm_simd128.h>

typedef unsigned char u8;

/** ToUint8Clamp: NaN and anything ≤ 0 → 0, ≥ 255 → 255, else round half to even. */
static inline u8 clamp_u8(double x) {
  if (!(x > 0)) return 0;
  if (x >= 255) return 255;
  int f = (int)x;                 // floor, for x > 0
  double diff = x - (double)f;
  if (diff < 0.5) return (u8)f;
  if (diff > 0.5) return (u8)(f + 1);
  return (f & 1) ? (u8)(f + 1) : (u8)f;
}

/** f32x4 → the two f64x2 halves, exactly (promotion is exact). */
static inline v128_t lo64(v128_t v) { return wasm_f64x2_promote_low_f32x4(v); }
static inline v128_t hi64(v128_t v) { return wasm_f64x2_promote_low_f32x4(wasm_i32x4_shuffle(v, v, 2, 3, 0, 1)); }
/** two f64x2 → one f32x4, each lane rounded to float32 as a Float32Array store would. */
static inline v128_t to32(v128_t a, v128_t b) {
  v128_t x = wasm_f32x4_demote_f64x2_zero(a), y = wasm_f32x4_demote_f64x2_zero(b);
  return wasm_i32x4_shuffle(x, y, 0, 1, 4, 5);
}

/** The box blur: premultiply `d` (w×h RGBA bytes) into `a`, three horizontal +
 *  vertical passes of radius `r` ping-ponging a↔b (running sums in `sums`, one
 *  double per row-channel), then un-premultiply back into `d`. `a` and `b` hold
 *  w·h·4 floats, `sums` w·4 doubles; all 16-byte aligned. */
__attribute__((export_name("filter_blur")))
void filter_blur(u8 *d, int w, int h, int r, float *a, float *b, double *sums) {
  const int n = w * h, W4 = w * 4;
  const double div = 2 * r + 1;
  const v128_t vdiv = wasm_f64x2_splat(div);
  for (int i = 0; i < n; i++) {
    double al = d[i * 4 + 3] / 255.0;
    a[i * 4] = (float)(d[i * 4] * al);
    a[i * 4 + 1] = (float)(d[i * 4 + 1] * al);
    a[i * 4 + 2] = (float)(d[i * 4 + 2] * al);
    a[i * 4 + 3] = (float)d[i * 4 + 3];
  }
  for (int pass = 0; pass < 3; pass++) {
    // horizontal: one row at a time, the four channels of a pixel together
    const int lastx = w - 1;
    for (int o = 0; o < h; o++) {
      const int base = o * W4;
      v128_t s01 = wasm_f64x2_splat(0), s23 = wasm_f64x2_splat(0);
      for (int k = -r; k <= r; k++) {
        const int x = base + (k < 0 ? 0 : k > lastx ? lastx : k) * 4;
        v128_t v = wasm_v128_load(a + x);
        s01 = wasm_f64x2_add(s01, lo64(v)); s23 = wasm_f64x2_add(s23, hi64(v));
      }
      for (int i = 0; i < w; i++) {
        wasm_v128_store(b + base + i * 4, to32(wasm_f64x2_div(s01, vdiv), wasm_f64x2_div(s23, vdiv)));
        const int ai = i + r + 1, si = i - r;
        v128_t va = wasm_v128_load(a + base + (ai > lastx ? lastx : ai) * 4);
        v128_t vs = wasm_v128_load(a + base + (si < 0 ? 0 : si) * 4);
        s01 = wasm_f64x2_add(s01, wasm_f64x2_sub(lo64(va), lo64(vs)));
        s23 = wasm_f64x2_add(s23, wasm_f64x2_sub(hi64(va), hi64(vs)));
      }
    }
    { float *t = a; a = b; b = t; }
    // vertical: row by row over per-column running sums
    const int lasty = h - 1;
    for (int c = 0; c < W4; c++) sums[c] = 0;
    for (int k = -r; k <= r; k++) {
      const int row = (k < 0 ? 0 : k > lasty ? lasty : k) * W4;
      for (int c = 0; c < W4; c += 4) {
        v128_t v = wasm_v128_load(a + row + c);
        wasm_v128_store(sums + c, wasm_f64x2_add(wasm_v128_load(sums + c), lo64(v)));
        wasm_v128_store(sums + c + 2, wasm_f64x2_add(wasm_v128_load(sums + c + 2), hi64(v)));
      }
    }
    for (int i = 0; i < h; i++) {
      const int row = i * W4, ai = i + r + 1, si = i - r;
      const int addRow = (ai > lasty ? lasty : ai) * W4, subRow = (si < 0 ? 0 : si) * W4;
      for (int c = 0; c < W4; c += 4) {
        v128_t s01 = wasm_v128_load(sums + c), s23 = wasm_v128_load(sums + c + 2);
        wasm_v128_store(b + row + c, to32(wasm_f64x2_div(s01, vdiv), wasm_f64x2_div(s23, vdiv)));
        v128_t va = wasm_v128_load(a + addRow + c), vs = wasm_v128_load(a + subRow + c);
        wasm_v128_store(sums + c, wasm_f64x2_add(s01, wasm_f64x2_sub(lo64(va), lo64(vs))));
        wasm_v128_store(sums + c + 2, wasm_f64x2_add(s23, wasm_f64x2_sub(hi64(va), hi64(vs))));
      }
    }
    { float *t = a; a = b; b = t; }
  }
  for (int i = 0; i < n; i++) {
    const double al = a[i * 4 + 3];
    const double inv = al > 0.5 ? 255 / al : 0;
    d[i * 4] = clamp_u8(a[i * 4] * inv);
    d[i * 4 + 1] = clamp_u8(a[i * 4 + 1] * inv);
    d[i * 4 + 2] = clamp_u8(a[i * 4 + 2] * inv);
    d[i * 4 + 3] = clamp_u8(al);
  }
}

/** The colour matrix over `len` bytes of RGBA (alpha untouched). `p` holds the
 *  parameters as the JavaScript computes them: s, b, k, gs, iv, sp, cOff, hue
 *  (nonzero = rotate), then the nine hue-rotate coefficients. */
__attribute__((export_name("filter_matrix")))
void filter_matrix(u8 *d, int len, const double *p) {
  const double s = p[0], bb = p[1], k = p[2], gs = p[3], iv = p[4], sp = p[5], cOff = p[6], hue = p[7];
  const double *H = p + 8;
  const double LR = 0.2126, LG = 0.7152, LB = 0.0722;
  for (int i = 0; i < len; i += 4) {
    double r = d[i], gr = d[i + 1], bl = d[i + 2];
    if (s != 1 || gs != 0) {
      const double lum = LR * r + LG * gr + LB * bl;
      const double m = gs != 0 ? (1 - gs) * s : s;
      r = lum + (r - lum) * m;
      gr = lum + (gr - lum) * m;
      bl = lum + (bl - lum) * m;
    }
    if (sp != 0) {
      const double sr = 0.393 * r + 0.769 * gr + 0.189 * bl, sg = 0.349 * r + 0.686 * gr + 0.168 * bl, sb = 0.272 * r + 0.534 * gr + 0.131 * bl;
      r += (sr - r) * sp; gr += (sg - gr) * sp; bl += (sb - bl) * sp;
    }
    if (hue != 0) {
      const double nr = H[0] * r + H[1] * gr + H[2] * bl, ng = H[3] * r + H[4] * gr + H[5] * bl, nb = H[6] * r + H[7] * gr + H[8] * bl;
      r = nr; gr = ng; bl = nb;
    }
    if (bb != 1) { r *= bb; gr *= bb; bl *= bb; }
    if (k != 1) { r = r * k + cOff; gr = gr * k + cOff; bl = bl * k + cOff; }
    if (iv != 0) { r = r + (255 - 2 * r) * iv; gr = gr + (255 - 2 * gr) * iv; bl = bl + (255 - 2 * bl) * iv; }
    d[i] = clamp_u8(r < 0 ? 0 : r > 255 ? 255 : r);
    d[i + 1] = clamp_u8(gr < 0 ? 0 : gr > 255 ? 255 : gr);
    d[i + 2] = clamp_u8(bl < 0 ? 0 : bl > 255 ? 255 : bl);
  }
}
