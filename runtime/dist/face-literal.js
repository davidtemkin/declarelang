// A FACE'S LITERAL FORMS — the weights and sources a `Face [ … ]` is written
// with, shared by the checker, the coercion and the Font class so the three
// cannot disagree. Its own file so a production build carries it only for a
// program that declares a Face (declarec's slim-face).
/** The formalized weight tokens (CSS 100–900), plus the `normal`/`bold` aliases. */
export const FONT_WEIGHTS = Object.freeze({
    thin: 100, extralight: 200, light: 300, regular: 400, normal: 400,
    medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900,
});
/** A weight token → its numeric CSS weight, or null if not a formalized token. */
export function faceWeight(token) {
    const w = FONT_WEIGHTS[token];
    return w === undefined ? null : String(w);
}
export const FACE_WEIGHT_FORMS = "a token (thin … black), a number 1–1000, or range(lo, hi) for a variable font";
/** What a Face's `weight` may be written as — the one rule for the checker and
 *  the coercion. `range(lo, hi)` is a VARIABLE font whose `wght` axis spans the
 *  range: the face answers every weight in it (CSS's `font-weight: 100 900`). */
export function faceWeightLiteral(lit) {
    const inRange = (n) => Number.isInteger(n) && n >= 1 && n <= 1000;
    if (lit.kind === "ident") {
        if (faceWeight(lit.name) !== null)
            return { value: lit.name };
        return { error: `'${lit.name}' is not a weight — ${FACE_WEIGHT_FORMS}` };
    }
    if (lit.kind === "number") {
        if (inRange(lit.value))
            return { value: lit.value };
        return { error: `a numeric weight is a whole number 1–1000, not ${lit.value}` };
    }
    if (lit.kind === "call" && lit.name === "range") {
        const [lo, hi] = lit.args;
        if (lit.args.length === 2 && lo.kind === "number" && hi.kind === "number" && inRange(lo.value) && inRange(hi.value) && lo.value < hi.value) {
            return { value: [lo.value, hi.value] };
        }
        return { error: `range(lo, hi) takes two whole numbers 1–1000 with lo < hi — the weights a variable font covers` };
    }
    return { error: `a Face weight is ${FACE_WEIGHT_FORMS}` };
}
/** A runtime weight → the CSS `font-weight` descriptor a face registers with. */
export function faceWeightDescriptor(v) {
    if (typeof v === "number" && Number.isFinite(v))
        return String(Math.round(Math.min(1000, Math.max(1, v))));
    if (Array.isArray(v) && v.length === 2)
        return `${faceWeightDescriptor(v[0])} ${faceWeightDescriptor(v[1])}`;
    if (typeof v === "string")
        return faceWeight(v) ?? "400";
    return "400";
}
/** What a Face's `src` may be written as: a URL string, `url("…")`, `local("…")`,
 *  or a list of those tried in order. The value is the CSS form of each item. */
export function faceSourceLiteral(lit) {
    const one = (l) => {
        if (l.kind === "string")
            return l.value;
        if (l.kind === "call" && (l.name === "url" || l.name === "local")) {
            if (l.args.length !== 1 || l.args[0].kind !== "string")
                return { error: `${l.name}(…) takes one quoted string` };
            return `${l.name}(${JSON.stringify(l.args[0].value)})`;
        }
        if (l.kind === "call")
            return { error: `a face source is a URL string, url("…"), local("…"), or a list of them — not '${l.name}(…)'` };
        return { error: `a face source is a URL string, url("…"), local("…"), or a list of them` };
    };
    if (lit.kind === "list") {
        if (lit.items.length === 0)
            return { error: `a face source list is empty` };
        const out = [];
        for (const i of lit.items) {
            const r = one(i);
            if (typeof r !== "string")
                return r;
            out.push(r);
        }
        return { value: out };
    }
    const r = one(lit);
    return typeof r === "string" ? { value: r } : r;
}
/** A runtime source → a CSS `src` value, relative URLs rebased with `rebase`.
 *  A bare string is a URL; `url("…")` / `local("…")` pass through (a url's
 *  argument rebased); a list joins in order. */
export function faceSourceCss(v, rebase) {
    if (Array.isArray(v))
        return v.map((i) => faceSourceCss(i, rebase)).filter((s) => s !== "").join(", ");
    if (typeof v !== "string" || v === "")
        return "";
    if (v.startsWith("local("))
        return v;
    const m = /^url\("((?:[^"\\]|\\.)*)"\)$/.exec(v);
    if (m !== null) {
        try {
            return `url(${JSON.stringify(rebase(JSON.parse(`"${m[1]}"`)))})`;
        }
        catch {
            return v;
        }
    }
    return `url(${JSON.stringify(rebase(v))})`;
}
//# sourceMappingURL=face-literal.js.map