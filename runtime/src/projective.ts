// The 3D transform's projection (graphics-pass.md §6): a view rotated about
// the X or Y axis, or pushed along Z, under a parent's `perspective`, lands on
// the screen through a PROJECTIVE map — parallel lines stop being parallel, so
// the affine machinery (affine.ts) cannot invert it. For points on the view's
// own plane (z = 0) the map is a 3×3 homography on (x, y, 1), and that is what
// everything here builds, inverts (the hit walk), and pushes boxes through
// (footprints, overlays). Conventions are CSS's: x right, y down, z toward the
// viewer; rotateX(a)·rotateY(b) as matrices, applied to a point right-to-left;
// the eye sits `perspective` px in front of the parent's perspective origin.

import type { Affine } from "./affine.js";

/** Row-major 3×3: [x-row, y-row, w-row]. */
export type Homography = readonly [number, number, number, number, number, number, number, number, number];

export interface Parts3D { rotateX: number; rotateY: number; translateZ: number }
export const has3D = (p: Parts3D): boolean => p.rotateX !== 0 || p.rotateY !== 0 || p.translateZ !== 0;

/** local (u, v) on the plane → the PARENT's coordinates, as a homography.
 *  `affine` is the view's 2D matrix (about its pivot), `x`/`y` its position in
 *  the parent, `pivot` the 3D rotation's centre (the same pivot), `P` the
 *  parent's perspective (0 = orthographic) about the parent-space origin
 *  (ox, oy). */
export function homography(affine: Affine, x: number, y: number, pivotX: number, pivotY: number,
  p3: Parts3D, P: number, ox: number, oy: number): Homography {
  const ax = (p3.rotateX * Math.PI) / 180, ay = (p3.rotateY * Math.PI) / 180;
  const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
  // R = Rx · Ry, on (X, Y, Z) relative to the pivot
  //   Ry: X' = cy·X + sy·Z ; Y' = Y ; Z' = −sy·X + cy·Z
  //   Rx: X'' = X' ; Y'' = cx·Y' − sx·Z' ; Z'' = sx·Y' + cx·Z'
  // with Z = 0 on the plane: X' = cy·X, Z' = −sy·X
  //   X'' = cy·X ; Y'' = cx·Y + sx·sy·X ; Z'' = sx·Y − cx·sy·X
  // A point on the plane, in the parent's space before projection:
  //   (u,v) → affine → (X + pivot) → rotate about pivot → + (x, y), Z'' + translateZ
  const [a, b, c, d, e, f] = affine;
  // the three columns of the map (u, v, 1) → (X, Y) relative to the pivot
  const colU = [a, b], colV = [c, d], col1 = [e - pivotX, f - pivotY];
  const rows: number[][] = [];
  for (const [X, Y] of [colU, colV, col1]) {
    const Xr = cy * X;
    const Yr = cx * Y + sx * sy * X;
    const Zr = sx * Y - cx * sy * X;
    rows.push([Xr, Yr, Zr]);
  }
  // back to the parent's space: + pivot + (x, y); Z + translateZ
  const px = pivotX + x, py = pivotY + y;
  // screen = origin + (point − origin) · P / (P − Z)  ⇒  w = 1 − Z/P, x_s·w = (X − ox)·1 + ox·w … written as a homography:
  //   x_s = (X + ox·(w − 1)) / w  where X is the unprojected x  ⇒  numerator = X − ox·Z/P
  const k = P > 0 ? 1 / P : 0;
  const H: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const [Xr, Yr, Zr] = rows[i];
    const X = Xr + (i === 2 ? px : 0);
    const Y = Yr + (i === 2 ? py : 0);
    const Z = Zr + (i === 2 ? p3.translateZ : 0);
    H[i] = X - ox * Z * k;          // x-row
    H[3 + i] = Y - oy * Z * k;      // y-row
    H[6 + i] = (i === 2 ? 1 : 0) - Z * k;   // w-row
  }
  return H as unknown as Homography;
}

export const applyH = (h: Homography, x: number, y: number): [number, number] => {
  const w = h[6] * x + h[7] * y + h[8];
  const iw = Math.abs(w) < 1e-9 ? 0 : 1 / w;
  return [(h[0] * x + h[1] * y + h[2]) * iw, (h[3] * x + h[4] * y + h[5]) * iw];
};

export function invertH(h: Homography): Homography {
  const [a, b, c, d, e, f, g, hh, i] = h;
  const A = e * i - f * hh, B = -(d * i - f * g), C = d * hh - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const s = 1 / det;
  return [A * s, -(b * i - c * hh) * s, (b * f - c * e) * s,
          B * s, (a * i - c * g) * s, -(a * f - c * d) * s,
          C * s, -(a * hh - b * g) * s, (a * e - b * d) * s];
}

/** Is a point on the plane in FRONT of the eye (w > 0)? Behind it there is
 *  nothing to hit — the inverse would name a point the viewer cannot see. */
export const inFront = (h: Homography, x: number, y: number): boolean => h[6] * x + h[7] * y + h[8] > 1e-6;

/** The projected quad of a local box, and its axis-aligned bounds. */
export function quadThrough(h: Homography, x: number, y: number, w: number, hgt: number): [number, number][] {
  return [[x, y], [x + w, y], [x + w, y + hgt], [x, y + hgt]].map(([px, py]) => applyH(h, px, py));
}
export function boxThroughH(h: Homography, x: number, y: number, w: number, hgt: number): { x: number; y: number; width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [fx, fy] of quadThrough(h, x, y, w, hgt)) {
    if (fx < minX) minX = fx; if (fx > maxX) maxX = fx;
    if (fy < minY) minY = fy; if (fy > maxY) maxY = fy;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** The affine that agrees with the homography at three corners of a box —
 *  the similarity-shaped facts (rootTransform, apparentScale) of a 3D view. */
export function affineFit(h: Homography, w: number, hgt: number): Affine {
  const [x0, y0] = applyH(h, 0, 0), [x1, y1] = applyH(h, w, 0), [x2, y2] = applyH(h, 0, hgt);
  const a = w > 0 ? (x1 - x0) / w : 1, b = w > 0 ? (y1 - y0) / w : 0;
  const c = hgt > 0 ? (x2 - x0) / hgt : 0, d = hgt > 0 ? (y2 - y0) / hgt : 1;
  return [a, b, c, d, x0, y0];
}

/** Is the view's FRONT face toward the viewer? The projected quad's winding
 *  flips when the back shows (backface = hidden hides it then). */
export function frontFacing(h: Homography, w: number, hgt: number): boolean {
  const q = quadThrough(h, 0, 0, w, hgt);
  const cross = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[0][0]);
  return cross >= 0;
}

// ── The 3D paths the runtime's walks go through ───────────────────────────────
// The view, the hit walk and the DOM backend reach the third dimension only
// through these, so a production build for a program that names no 3D attribute
// carries none of it (declarec's slim-3d stubs this file). Views are read
// structurally — this file imports no node class.

/** A view as the 3D paths read it. */
export interface View3D {
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  readonly pivotX: number; readonly pivotY: number;
  readonly rotateX?: number; readonly rotateY?: number; readonly translateZ?: number;
  readonly backface?: string; readonly perspective?: number;
}

/** What a surface is handed for a view out of its plane: its rotation, and the
 *  parent's eye (perspective about the parent's box centre). */
export interface Spec3D {
  rotateX: number; rotateY: number; translateZ: number; backfaceHidden: boolean;
  perspective: number; originX: number; originY: number;
}

const partsOf = (v: View3D): Parts3D => ({ rotateX: v.rotateX ?? 0, rotateY: v.rotateY ?? 0, translateZ: v.translateZ ?? 0 });

/** The seam spec for `v` under `parent`, or null for a view that stays in its plane. */
export function spec3DOf(v: View3D, parent: View3D | null): Spec3D | null {
  const p3 = partsOf(v);
  if (!has3D(p3)) return null;
  return { ...p3, backfaceHidden: v.backface === "hidden",
    perspective: parent?.perspective ?? 0, originX: parent !== null ? parent.width / 2 : 0, originY: parent !== null ? parent.height / 2 : 0 };
}

/** Child `c`'s map local → `parent`'s coordinates, or null for a view that
 *  stays in its plane. `affine` is asked only for a view that leaves it. */
export function childHomography(parent: View3D | null, c: View3D, affine: () => Affine): Homography | null {
  const p3 = partsOf(c);
  if (!has3D(p3)) return null;
  return homography(affine(), c.x, c.y, c.pivotX, c.pivotY, p3, parent?.perspective ?? 0,
    parent !== null ? parent.width / 2 : 0, parent !== null ? parent.height / 2 : 0);
}

/** A parent-space point → child `c`'s plane through its homography; far away
 *  when it lies behind the eye or lands on a hidden back face (nothing to hit). */
export function unprojectChild(h: Homography, c: View3D, x: number, y: number): [number, number] {
  const inv = invertH(h);
  if (!inFront(inv, x, y)) return [-1e9, -1e9];
  if (c.backface === "hidden" && !frontFacing(h, c.width, c.height)) return [-1e9, -1e9];
  return applyH(inv, x, y);
}

/** A point → the plane through `h` (no back-face rule), far away behind the eye. */
export function unproject(h: Homography, x: number, y: number): [number, number] {
  const inv = invertH(h);
  return inFront(inv, x, y) ? applyH(inv, x, y) : [-1e9, -1e9];
}

/** A 3D view's layout footprint: the projected quad's bounds, measured as if the
 *  vanishing point sat at the view's own pivot — position-free by construction
 *  (the exact projection depends on where the view sits in a parent that may be
 *  sizing itself from this very footprint; hit-testing uses the exact homography). */
export function footprint3D(v: View3D, affine: Affine, parentPerspective: number): { x: number; y: number; width: number; height: number } {
  const H = homography(affine, 0, 0, v.pivotX, v.pivotY, partsOf(v), parentPerspective, v.pivotX, v.pivotY);
  return boxThroughH(H, 0, 0, v.width, v.height);
}

/** The DOM's realization: the homography its pointer inverse keeps, and the CSS
 *  3D transform about the pivot that goes between the translation and the matrix. */
export function domTransform3D(affine: Affine, x: number, y: number, pivotX: number, pivotY: number, d: Spec3D): { h: Homography; css: string } {
  return {
    h: homography(affine, x, y, pivotX, pivotY, d, d.perspective, d.originX, d.originY),
    css: `translate3d(${pivotX}px,${pivotY}px,0) rotateX(${d.rotateX}deg) rotateY(${d.rotateY}deg) translateZ(${d.translateZ}px) translate3d(${-pivotX}px,${-pivotY}px,0) `,
  };
}
