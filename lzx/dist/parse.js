const NAME_START = /[A-Za-z_:]/;
const NAME_CHAR = /[A-Za-z0-9_:.\-]/;
const ENTITIES = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&apos;": "'" };
function decodeEntities(s) {
    return s.replace(/&(?:lt|gt|amp|quot|apos);/g, (m) => ENTITIES[m] ?? m);
}
class Reader {
    s;
    i = 0;
    line = 1;
    col = 1;
    errors = [];
    constructor(s) {
        this.s = s;
    }
    pos() { return { line: this.line, col: this.col, offset: this.i }; }
    eof() { return this.i >= this.s.length; }
    peek() { return this.s[this.i] ?? ""; }
    startsWith(t) { return this.s.startsWith(t, this.i); }
    adv(n = 1) {
        for (let k = 0; k < n && this.i < this.s.length; k++) {
            if (this.s[this.i] === "\n") {
                this.line++;
                this.col = 1;
            }
            else {
                this.col++;
            }
            this.i++;
        }
    }
    skipWs() { while (!this.eof() && /\s/.test(this.peek()))
        this.adv(); }
    name() {
        let out = "";
        if (!this.eof() && NAME_START.test(this.peek())) {
            out += this.peek();
            this.adv();
            while (!this.eof() && NAME_CHAR.test(this.peek())) {
                out += this.peek();
                this.adv();
            }
        }
        return out;
    }
}
export function parseLzx(src) {
    const r = new Reader(src);
    skipProlog(r);
    const root = parseElement(r);
    return { root, errors: r.errors };
}
function skipProlog(r) {
    for (;;) {
        r.skipWs();
        if (r.startsWith("<!--")) {
            r.adv(4);
            skipUntil(r, "-->");
            continue;
        }
        if (r.startsWith("<?")) {
            skipUntil(r, "?>");
            continue;
        }
        if (r.startsWith("<!")) {
            skipUntil(r, ">");
            continue;
        }
        return;
    }
}
function skipUntil(r, term) {
    while (!r.eof() && !r.startsWith(term))
        r.adv();
    if (r.startsWith(term))
        r.adv(term.length);
}
function parseElement(r) {
    if (r.peek() !== "<")
        return null;
    const pos = r.pos();
    r.adv();
    const tag = r.name();
    if (tag === "") {
        r.errors.push({ message: "expected tag name after '<'", pos });
        return null;
    }
    const attrs = parseAttrs(r);
    r.skipWs();
    if (r.startsWith("/>")) {
        r.adv(2);
        return { tag, attrs, children: [], text: "", pos };
    }
    if (r.peek() === ">") {
        r.adv();
        const { children, text } = parseContent(r, tag);
        return { tag, attrs, children, text, pos };
    }
    r.errors.push({ message: `malformed tag <${tag}>`, pos: r.pos() });
    return { tag, attrs, children: [], text: "", pos };
}
function parseAttrs(r) {
    const attrs = [];
    for (;;) {
        r.skipWs();
        const c = r.peek();
        if (c === "" || c === ">" || c === "/")
            break;
        const pos = r.pos();
        const name = r.name();
        if (name === "") {
            r.adv();
            continue;
        }
        r.skipWs();
        let value = "";
        if (r.peek() === "=") {
            r.adv();
            r.skipWs();
            const q = r.peek();
            if (q === '"' || q === "'") {
                r.adv();
                while (!r.eof() && r.peek() !== q) {
                    value += r.peek();
                    r.adv();
                }
                r.adv();
            }
            else {
                while (!r.eof() && !/[\s>/]/.test(r.peek())) {
                    value += r.peek();
                    r.adv();
                }
            }
        }
        attrs.push({ name, value: decodeEntities(value), pos });
    }
    return attrs;
}
function parseContent(r, tag) {
    const children = [];
    let text = "";
    for (;;) {
        if (r.eof()) {
            r.errors.push({ message: `unclosed <${tag}>`, pos: r.pos() });
            break;
        }
        if (r.startsWith("</")) {
            r.adv(2);
            r.name();
            r.skipWs();
            if (r.peek() === ">")
                r.adv();
            break;
        }
        if (r.startsWith("<![CDATA[")) {
            r.adv(9);
            let raw = "";
            while (!r.eof() && !r.startsWith("]]>")) {
                raw += r.peek();
                r.adv();
            }
            if (r.startsWith("]]>"))
                r.adv(3);
            text += raw; // opaque — no entity decoding
            continue;
        }
        if (r.startsWith("<!--")) {
            r.adv(4);
            skipUntil(r, "-->");
            continue;
        }
        else if (r.startsWith("<!")) {
            skipUntil(r, ">");
            continue;
        }
        if (r.startsWith("<?")) {
            skipUntil(r, "?>");
            continue;
        }
        if (r.peek() === "<") {
            const child = parseElement(r);
            if (child)
                children.push(child);
            else
                r.adv();
            continue;
        }
        let chunk = "";
        while (!r.eof() && r.peek() !== "<") {
            chunk += r.peek();
            r.adv();
        }
        text += decodeEntities(chunk);
    }
    return { children, text };
}
//# sourceMappingURL=parse.js.map