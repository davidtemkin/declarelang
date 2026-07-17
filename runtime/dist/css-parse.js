// The CSS parser: CSS text → typed Rule[]. A faithful port of OpenLaszlo 5's
// compiler/src/css.ts selector tokenizing + specificity, EXTENDED to emit
// compound condition chains (`.red.green`, `view.red`) as a typed AST, and
// DEVIATING deliberately in one way: values are stored as raw trimmed strings
// (RawValue) — all folding (hex/rgb/named/px → number) is the coercers' job
// (css-coerce.ts), never the parser's. Unsupported surface (`!important`,
// `>`/`+`/`~`, pseudo-classes) is rejected cleanly for the checker (M5).
export class CssUnsupported extends Error {
    constructor(message) {
        super(message);
        this.name = "CssUnsupported";
    }
}
/** Specificity = sum over every condition: id 100, class/attr 10, tag 1, * 0. */
export function specificityOf(sel) {
    let s = 0;
    for (const simple of sel) {
        for (const c of simple.conditions) {
            s += c.kind === "id" ? 100 : c.kind === "tag" ? 1 : 10;
        }
    }
    return s;
}
/** Tokenize one simple selector (`view.red`, `#x`, `[k~=v]`, `*`) into a
 *  SimpleSelector. A leading identifier is the tag; `.x` `#x` `[..]` are
 *  conditions; `*` yields an empty condition list (universal). */
function parseSimple(token) {
    const conditions = [];
    let i = 0;
    const tagMatch = /^[A-Za-z_][\w-]*/.exec(token);
    if (tagMatch) {
        conditions.push({ kind: "tag", name: tagMatch[0] });
        i = tagMatch[0].length;
    }
    else if (token[0] === "*") {
        i = 1;
    }
    while (i < token.length) {
        const ch = token[i];
        if (ch === ".") {
            const m = /^\.([\w-]+)/.exec(token.slice(i));
            if (!m)
                throw new CssUnsupported(`unsupported selector near '${token.slice(i)}'`);
            conditions.push({ kind: "class", name: m[1] });
            i += m[0].length;
        }
        else if (ch === "#") {
            const m = /^#([\w-]+)/.exec(token.slice(i));
            if (!m)
                throw new CssUnsupported(`unsupported selector near '${token.slice(i)}'`);
            conditions.push({ kind: "id", name: m[1] });
            i += m[0].length;
        }
        else if (ch === "[") {
            const m = /^\[\s*([\w-]+)\s*(?:([~|]?=)\s*"?([^"\]]*)"?\s*)?\]/.exec(token.slice(i));
            if (!m)
                throw new CssUnsupported(`unsupported attribute selector near '${token.slice(i)}'`);
            const cond = { kind: "attr", name: m[1] };
            if (m[2]) {
                cond.op = m[2];
                cond.value = m[3];
            }
            conditions.push(cond);
            i += m[0].length;
        }
        else if (ch === ":" || ch === ">" || ch === "+" || ch === "~") {
            throw new CssUnsupported(`unsupported selector feature '${ch}'`);
        }
        else {
            throw new CssUnsupported(`unsupported selector near '${token.slice(i)}'`);
        }
    }
    return { conditions };
}
/** Parse a full selector: whitespace-separated simple selectors → a descendant
 *  chain (ancestor-first). Combinators `>`/`+`/`~` and pseudo `:` are rejected. */
export function parseSelectorText(text) {
    const trimmed = text.trim();
    // Mask attribute-selector bodies so `~=`/`|=` don't read as combinators.
    const masked = trimmed.replace(/\[[^\]]*\]/g, "[]");
    if (/[>+~]/.test(masked))
        throw new CssUnsupported(`unsupported combinator in '${trimmed}'`);
    return trimmed.split(/\s+/).map(parseSimple);
}
//# sourceMappingURL=css-parse.js.map