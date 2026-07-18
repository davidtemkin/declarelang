// The CSS parser: CSS text → typed Rule[]. A faithful port of OpenLaszlo 5's
// compiler/src/css.ts selector tokenizing + specificity, EXTENDED to emit
// compound condition chains (`.red.green`, `view.red`) as a typed AST, and
// DEVIATING deliberately in one way: values are stored as raw trimmed strings
// (RawValue) — all folding (hex/rgb/named/px → number) is the coercers' job
// (css-coerce.ts), never the parser's. Unsupported surface (`!important`,
// `>`/`+`/`~`, pseudo-classes) is rejected cleanly for the checker (M5).
export class CssUnsupported extends Error {
    /** Offset into the CSS text where the unsupported construct starts. */
    offset;
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
        else if (ch === ":") {
            const m = /^:([\w-]+)/.exec(token.slice(i));
            if (!m || (m[1] !== "hover" && m[1] !== "active" && m[1] !== "focus")) {
                throw new CssUnsupported(`unsupported pseudo-class near '${token.slice(i)}'`);
            }
            conditions.push({ kind: "pseudo", name: m[1] });
            i += m[0].length;
        }
        else if (ch === ">" || ch === "+" || ch === "~") {
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
/** Parse a declaration body `a: 1; b: 2` (at source offset `base`) into raw
 *  string values + per-property positions. `!important` rejects cleanly. */
function parseDecls(body, base) {
    const decls = new Map();
    const declPos = new Map();
    let cursor = 0; // offset within body of the current fragment
    for (const part of body.split(";")) {
        const partStart = base + cursor;
        cursor += part.length + 1; // + the ";"
        const idx = part.indexOf(":");
        if (idx < 0) {
            if (part.trim() !== "") {
                const e = new CssUnsupported(`malformed declaration '${part.trim()}' (expected 'property: value')`);
                e.offset = partStart + (part.length - part.trimStart().length);
                throw e;
            }
            continue;
        }
        const rawName = part.slice(0, idx);
        const name = rawName.trim().toLowerCase();
        const namePos = partStart + (rawName.length - rawName.trimStart().length);
        const rawValue = part.slice(idx + 1);
        const value = rawValue.trim();
        const valuePos = partStart + idx + 1 + (rawValue.length - rawValue.trimStart().length);
        if (name === "")
            continue;
        if (/!\s*important/i.test(value)) {
            const e = new CssUnsupported(`unsupported '!important' in '${name}: ${value}'`);
            e.offset = valuePos;
            throw e;
        }
        decls.set(name, value);
        declPos.set(name, { namePos, valuePos });
    }
    return { decls, declPos };
}
/** Parse a full stylesheet text into Rule[]: mask comments (same-length, so
 *  offsets stay valid), split `selector { body }`, expand comma-grouped
 *  selectors to one Rule each (shared decls, own sourceIndex + selPos), stamp
 *  specificity + a monotonic source index. */
export function parseCss(text) {
    // Mask (not strip) comments so every offset still maps to the original text,
    // and a `}` inside a comment can't truncate a rule.
    const masked = text.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));
    const rules = [];
    // `[^{}]` for selector and body assumes the supported flat subset — no nested
    // rules, no `{`/`}` inside a value (e.g. no `@media`/`url(...{...})`).
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(masked)) !== null) {
        const groupStart = m.index; // offset of m[1]
        const bodyStart = m.index + m[1].length + 1; // after the "{"
        const { decls, declPos } = parseDecls(m[2], bodyStart);
        let selCursor = 0;
        for (const selText of m[1].split(",")) {
            const selStart = groupStart + selCursor;
            selCursor += selText.length + 1; // + the ","
            const trimmed = selText.trim();
            if (trimmed === "")
                continue;
            const selPos = selStart + (selText.length - selText.trimStart().length);
            let selector;
            try {
                selector = parseSelectorText(trimmed);
            }
            catch (e) {
                if (e instanceof CssUnsupported && e.offset === undefined)
                    e.offset = selPos;
                throw e;
            }
            rules.push({ selector, specificity: specificityOf(selector), sourceIndex: rules.length, decls, declPos, selPos });
        }
    }
    return rules;
}
//# sourceMappingURL=css-parse.js.map