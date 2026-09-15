// The 2D affine transform every renderer and the hit walk share (graphics-
// pass.md §5). A view's paint transform used to be a SIMILARITY — one scale
// and one rotation about a pivot — and each backend inverted it by hand. With
// per-axis scale and skew it is a general 2×3 matrix, so the math lives here
// once: build it from the attributes, compose it up the tree, invert it for a
// hit, map a box through it for a footprint. Column-major like CSS/Canvas2D:
// [a, b, c, d, e, f] maps (x, y) → (a·x + c·y + e, b·x + d·y + f).
export const IDENTITY = [1, 0, 0, 1, 0, 0];
export const isIdentityParts = (p) => p.scale === 1 && p.scaleX === 1 && p.scaleY === 1 && p.rotation === 0 && p.skewX === 0 && p.skewY === 0;
/** M = T(pivot) · R(rotation) · K(skew) · S(scale) · T(−pivot): scale first,
 *  then skew, then rotate — about the shared pivot (the documented order; for
 *  a uniform scale and no skew it collapses to the old similarity). */
export function fromParts(p) {
    if (isIdentityParts(p))
        return IDENTITY;
    const sx = p.scale * p.scaleX, sy = p.scale * p.scaleY;
    const kx = Math.tan((p.skewX * Math.PI) / 180), ky = Math.tan((p.skewY * Math.PI) / 180);
    const r = (p.rotation * Math.PI) / 180, cr = Math.cos(r), sr = Math.sin(r);
    // K·S = [sx, ky·sx, kx·sy, sy]  (skew applied to the scaled point)
    const a0 = sx, b0 = ky * sx, c0 = kx * sy, d0 = sy;
    // R·(K·S)
    const a = cr * a0 - sr * b0, b = sr * a0 + cr * b0;
    const c = cr * c0 - sr * d0, d = sr * c0 + cr * d0;
    // about the pivot: e = px − (a·px + c·py), f = py − (b·px + d·py)
    return [a, b, c, d, p.pivotX - (a * p.pivotX + c * p.pivotY), p.pivotY - (b * p.pivotX + d * p.pivotY)];
}
export const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
/** m1 ∘ m2 — apply m2 first, then m1. */
export function compose(m1, m2) {
    return [
        m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
    ];
}
/** The inverse, or the identity for a degenerate (zero-scale) matrix — a
 *  collapsed view is hit nowhere, and the callers check the box after. */
export function invert(m) {
    const det = m[0] * m[3] - m[1] * m[2];
    if (Math.abs(det) < 1e-12)
        return [0, 0, 0, 0, 0, 0];
    const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
    return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}
/** The uniform scale a general matrix "is" — √|det|, the geometric mean of
 *  the axis scales — and its rotation: what raster density and the
 *  similarity-shaped facts (`apparentScale`, `rootTransform().scale`) report. */
export const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
export const rotationOf = (m) => Math.atan2(m[1], m[0]);
export const isIdentity = (m) => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
/** A local box through the matrix — its axis-aligned footprint. */
export function boxThrough(m, x, y, w, h) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
        const [fx, fy] = apply(m, px, py);
        if (fx < minX)
            minX = fx;
        if (fx > maxX)
            maxX = fx;
        if (fy < minY)
            minY = fy;
        if (fy > maxY)
            maxY = fy;
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
export const cssMatrix = (m) => `matrix(${m.join(",")})`;
//# sourceMappingURL=affine.js.map