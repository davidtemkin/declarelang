// The PER-SIDE stroke — everything a four-element `stroke` list means, in one
// module, so a program that never writes one does not carry it.
//
// `View.stroke` holds ONE Stroke on all four sides, or FOUR (top, right,
// bottom, left, clockwise from the top — value.ts's BoxStroke). The uniform
// case is the overwhelmingly common one and stays on the single-ring fast path
// in both backends; this file owns the other arm end to end:
//
//   - the split (`strokeSides`) and the "do the four agree?" test
//     (`sidesUniform`) value.ts's `strokeUniform` defers to;
//   - the list's structural equality (`sidesEqual`), behind `strokeEqual`;
//   - the list literal's coercion (`coerceStrokeSides`), behind `coerceStroke`;
//   - the canvas paint (`paintSides`) boxpaint.ts calls;
//   - the DOM paint (`sideShadows`) dom-backend.ts calls.
//
// IT IS NO LONGER GATED, and the reason is worth keeping. It rode behind a
// build fact (`usesStrokeSides`) that read a four-element LIST LITERAL out of
// the tree, which was exact only while `stroke`'s body-facing type was
// `Stroke | null` — that type foreclosed every other way of producing a list.
// The slot's type is `BoxStroke` now (compiler/src/scaffold.ts), so a `{ }`
// constraint computes the four sides — `stroke = { [ stroke(1, theme.line),
// null, stroke(1, theme.line), null ] }`, which is how a themed border is
// written — and a method body may assign one. Neither is a literal, so neither
// can be read from the parse tree, and a fact that can MISS would stub this
// module out from under a program that runs. The module ships to every build
// instead (~213 B gzipped); tools/declarec.mjs states the trade at the site.
// `data.ts` still refuses to bind a stroke slot from data (`case "stroke":
// return def`), so nothing arrives from a record.
import { colorToCss } from "./value.js";
/** The four sides of a BoxStroke — top, right, bottom, left. A single Stroke
 *  (or null) answers on every side, so one branch serves both written forms. */
export function strokeSides(s) {
    if (s === null)
        return [null, null, null, null];
    if (!Array.isArray(s)) {
        const st = s;
        return [st, st, st, st];
    }
    const l = s;
    return [l[0] ?? null, l[1] ?? null, l[2] ?? null, l[3] ?? null];
}
/** The uniform Stroke a four-side LIST is on all four sides, or null when it is
 *  bare on all four — and `undefined` when the sides genuinely differ, which is
 *  the signal to take a painter's per-side path. `strokeUniform` (value.ts)
 *  answers the single-Stroke and null forms itself and defers here only for a
 *  list, so this is the only piece of the question that is per-side. */
export function sidesUniform(s) {
    const [t, r, b, l] = strokeSides(s);
    const same = (a, c) => a === c || (a !== null && c !== null && a.width === c.width && a.color === c.color);
    return same(t, r) && same(t, b) && same(t, l) ? t : undefined;
}
/** Structural equality where either side is a four-side list — the arm
 *  `strokeEqual` (value.ts) hands over once it knows one of them is. */
export function sidesEqual(a, b) {
    const x = strokeSides(a);
    const y = strokeSides(b);
    return x.every((s, i) => {
        const t = y[i];
        return s === t || (s !== null && t !== null && s.width === t.width && s.color === t.color);
    });
}
/** The per-side literal's coercion: four, clockwise from the top, `null` for a
 *  bare side. A list reaches coercion whole (like a filter list) — refused here
 *  by shape, because a two-item list is a mistake, not a shorthand. `one` is
 *  value.ts's single-stroke coercer and `expected` its wording, so the type and
 *  its diagnostic stay one thing. */
export function coerceStrokeSides(lit, one, expected) {
    if (lit.items.length !== 4)
        return { ok: false, expected };
    const sides = [];
    for (const it of lit.items) {
        const r = one(it);
        if (!r.ok)
            return { ok: false, expected, found: r.found };
        sides.push(r.value);
    }
    return { ok: true, value: Object.freeze(sides) };
}
/** How far the box shifts to leave each side's band behind it, per unit of
 *  stroke width: top, right, bottom, left — clockwise from the top, the order
 *  a per-side stroke is written in. */
const SIDE_SHIFT = [[0, 1], [-1, 0], [0, -1], [1, 0]];
/** The per-side border on CANVAS. Each side is painted as the box MINUS a copy
 *  of itself shifted in from that edge by the side's width, clipped to the box —
 *  which is exactly what a zero-blur inset shadow paints, and is how the DOM
 *  backend spells the same thing (`sideShadows`, four `inset` box-shadows). Two
 *  consequences worth knowing, and they are the same on both backends:
 *
 *   • On a ROUNDED box a side's band follows the corner arc and tapers into it,
 *     rather than being mitred against its neighbour. Two adjacent stroked
 *     sides therefore meet along the curve with a hairline of overlap, not a
 *     diagonal seam; two opposite ones (the rules-only case this exists for)
 *     never meet at all.
 *   • Sides of DIFFERENT widths do not mitre either — each is its own band. */
export function paintSides(ctx, box, s, w, h) {
    const sides = strokeSides(s);
    if (sides.every((x) => x === null || x.width <= 0))
        return;
    // Big enough to enclose every shifted copy of the box; the clip does the
    // real work, so this only has to be generous.
    const K = w + h + 4;
    ctx.save();
    ctx.clip(box);
    for (let i = 0; i < 4; i++) {
        const side = sides[i];
        if (side === null || side.width <= 0)
            continue;
        const [sx, sy] = SIDE_SHIFT[i];
        const cut = new Path2D();
        cut.rect(-K, -K, w + 2 * K, h + 2 * K);
        // A plain matrix init, not a DOMMatrix: the painter this serves is the one
        // both backends share, and the canvas 2D context is all it may assume.
        cut.addPath(box, { a: 1, b: 0, c: 0, d: 1, e: sx * side.width, f: sy * side.width });
        ctx.fillStyle = colorToCss(side.color);
        ctx.fill(cut, "evenodd");
    }
    ctx.restore();
}
/** The per-side border on the DOM — one `inset` box-shadow per stroked side, in
 *  the order the shadow list wants them. `inset 0 Wpx 0 0` leaves a band of W
 *  along the top, and its three rotations do the other edges. On a rounded box
 *  each band follows the corner arc and tapers into it (the browser clips an
 *  inset shadow to the border box), which is the same shape `paintSides` draws
 *  — a rounded card with only its top and bottom stroked gets two rules that
 *  curve away at the corners rather than two straight lines butting into them. */
export function sideShadows(s) {
    const [top, right, bottom, left] = strokeSides(s);
    const parts = [];
    if (top !== null && top.width > 0)
        parts.push(`inset 0 ${top.width}px 0 0 ${colorToCss(top.color)}`);
    if (right !== null && right.width > 0)
        parts.push(`inset ${-right.width}px 0 0 0 ${colorToCss(right.color)}`);
    if (bottom !== null && bottom.width > 0)
        parts.push(`inset 0 ${-bottom.width}px 0 0 ${colorToCss(bottom.color)}`);
    if (left !== null && left.width > 0)
        parts.push(`inset ${left.width}px 0 0 0 ${colorToCss(left.color)}`);
    return parts;
}
//# sourceMappingURL=stroke-sides.js.map