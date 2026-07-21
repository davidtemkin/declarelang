// highlight — the compiler's "preprocessed form of a source file" (the ruled
// path for the code viewer). A .declare file is split into an ordered list of
// SEGMENTS: prose (the Markdown carried in a `/* … */` comment) interleaved with
// code (syntax-highlighted `<pre>` HTML). The viewer renders prose through the
// Markdown component and code through HTMLText — one contiguous, selectable
// monospace flow per code segment (the preformatted-flow primitive), colored by
// the app's own `accents` map so light/dark stays a render-time decision.
//
// Why in the compiler, not a hand-scanner in a `{ }` body: this reuses the
// language's exact lexical shape — strings, `'''`-templates, `{ }` expression
// bodies (captured WHOLE, so a regex inside one never reaches this scan),
// triple-quoted blocks, and comments — so what it highlights is precisely what
// the compiler tokenizes. A file the compiler accepts highlights faithfully by
// construction, and comments (which `tokenize` drops as trivia) are preserved
// here because the viewer must render them.
// The role vocabulary — short class names the viewer's `accents` map keys on.
// A token with no role is emitted as plain text (body color): whitespace,
// brackets, commas, and bare identifiers that are neither a type nor an
// attribute name read as structure, not color.
//   k keyword   t type (Uppercase)   a attribute name (ident before `=`)
//   s string    n number/percent     h hex color   p datapath (`:a.b`)
//   o operator (`<->`)   b `{ }` expression body   c line comment
// The reserved words the parser special-cases, plus the literal constants. An
// attribute *use* (ident before `=`) wins over the keyword class, so `style = …`
// colors as an attribute while a top-level `style [ … ]` colors as a keyword.
const KEYWORDS = new Set([
    "class", "extends", "prevailing", "readonly", "include", "use",
    "font", "stylesheet", "style", "true", "false", "null",
]);
const isDigit = (c) => c >= "0" && c <= "9";
const isIdentStart = (c) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isIdentPart = (c) => isIdentStart(c) || isDigit(c);
const isHex = (c) => isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
const isSpace = (c) => c === " " || c === "\t" || c === "\r" || c === "\n";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** A `{ … }` expression body: consume from just past the opening `{` through
 *  its matching `}`, blind to TS except its lexical islands (strings,
 *  templates, comments) where a brace is text. Mirrors parser.ts `skipBraces`,
 *  so a body this returns is exactly one the compiler would. Returns the index
 *  just past the closing brace. */
function scanBraces(src, i, n) {
    let depth = 1;
    while (i < n && depth > 0) {
        const ch = src[i];
        if (ch === "{") {
            depth++;
            i++;
        }
        else if (ch === "}") {
            depth--;
            i++;
        }
        else if (ch === '"' || ch === "'") {
            i++;
            while (i < n && src[i] !== ch) {
                if (src[i] === "\\")
                    i++;
                i++;
            }
            i++;
        }
        else if (ch === "`") {
            i++;
            while (i < n && src[i] !== "`") {
                if (src[i] === "\\") {
                    i += 2;
                    continue;
                }
                if (src[i] === "$" && src[i + 1] === "{") {
                    i = scanBraces(src, i + 2, n);
                    continue;
                }
                i++;
            }
            i++;
        }
        else if (ch === "/" && src[i + 1] === "/") {
            while (i < n && src[i] !== "\n")
                i++;
        }
        else if (ch === "/" && src[i + 1] === "*") {
            i += 2;
            while (i < n && !(src[i] === "*" && src[i + 1] === "/"))
                i++;
            i += 2;
        }
        else
            i++;
    }
    return i;
}
/** Strip the least-common leading indent from a set of lines (blank lines
 *  ignored when measuring), leaving relative indentation intact. */
function dedentLines(lines) {
    let min = Infinity;
    for (const l of lines) {
        if (l.trim() === "")
            continue;
        min = Math.min(min, l.length - l.trimStart().length);
    }
    if (!Number.isFinite(min))
        min = 0;
    return lines.map((l) => l.slice(min));
}
/** The Markdown inside a `/* … *\/` comment, tidied like the language's `"""`
 *  blocks so source layout stays cosmetic. Three shapes, all producing clean
 *  authored Markdown: a jsdoc `*` gutter (stripped when every line wears one);
 *  an inline first line `/* text…` (its post-`/*` gap trimmed, the rest
 *  dedented as a block); or a plain indented block (dedented by common indent). */
function dedentComment(raw) {
    let s = raw.replace(/\r\n?/g, "\n");
    const firstInline = s.length > 0 && s[0] !== "\n";
    if (s[0] === "\n")
        s = s.slice(1);
    let lines = s.split("\n");
    const nonEmpty = lines.filter((l) => l.trim() !== "");
    const gutter = nonEmpty.length > 0 && nonEmpty.every((l) => /^\s*\*/.test(l));
    if (gutter) {
        lines = dedentLines(lines.map((l) => l.replace(/^\s*\* ?/, "")));
    }
    else if (firstInline && lines.length) {
        lines = [lines[0].replace(/^[ \t]+/, ""), ...dedentLines(lines.slice(1))];
    }
    else {
        lines = dedentLines(lines);
    }
    return lines.join("\n").replace(/\s+$/, "").replace(/^\n+/, "");
}
export function lineMetrics(src) {
    const n = src.length;
    const mask = new Uint8Array(n); // 0 whitespace · 1 code · 2 comment
    const paint = (from, to, v) => { for (let k = from; k < to && k < n; k++)
        mask[k] = v; return Math.min(to, n); };
    let i = 0;
    while (i < n) {
        const c = src[i];
        if (c === "/" && src[i + 1] === "*") {
            let j = i + 2;
            while (j < n && !(src[j] === "*" && src[j + 1] === "/"))
                j++;
            i = paint(i, j + 2, 2);
            continue;
        }
        if (c === "/" && src[i + 1] === "/") {
            let j = i + 2;
            while (j < n && src[j] !== "\n")
                j++;
            i = paint(i, j, 2);
            continue;
        }
        if (isSpace(c)) {
            i++;
            continue;
        }
        if (c === '"' && src[i + 1] === '"' && src[i + 2] === '"') {
            let j = i + 3;
            while (j < n && !(src[j] === '"' && src[j + 1] === '"' && src[j + 2] === '"'))
                j++;
            i = paint(i, j + 3, 1);
            continue;
        }
        if (c === '"' || c === "'") {
            let j = i + 1;
            while (j < n && src[j] !== c) {
                if (src[j] === "\\")
                    j++;
                j++;
            }
            i = paint(i, j + 1, 1);
            continue;
        }
        if (c === "{") {
            i = paint(i, scanBraces(src, i + 1, n), 1);
            continue;
        }
        mask[i] = 1;
        i++;
    }
    let total = 0, code = 0, comment = 0, blank = 0, hasCode = false, hasComment = false;
    const closeLine = () => { total++; if (hasCode)
        code++;
    else if (hasComment)
        comment++;
    else
        blank++; hasCode = hasComment = false; };
    for (let k = 0; k < n; k++) {
        if (src[k] === "\n") {
            closeLine();
            continue;
        }
        if (isSpace(src[k]))
            continue; // indentation never classifies a line
        if (mask[k] === 2)
            hasComment = true;
        else
            hasCode = true;
    }
    if (n > 0 && src[n - 1] !== "\n")
        closeLine();
    return { total, code, comment, blank };
}
/** Preprocess a .declare source into renderable segments. Pure and
 *  dependency-free, so it runs at build time (the `--highlight` flag), on the
 *  dev server (`GET /highlight/…`), or in the browser alike. */
export function highlight(src) {
    const segments = [];
    let pieces = [];
    const emit = (cls, text) => { if (text)
        pieces.push({ cls, text }); };
    const flushCode = () => {
        // Trim whole whitespace-only pieces off both ends so a segment doesn't open
        // or close on the blank lines that separated it from a comment.
        while (pieces.length && pieces[0].cls === null && pieces[0].text.trim() === "")
            pieces.shift();
        while (pieces.length && pieces[pieces.length - 1].cls === null && pieces[pieces.length - 1].text.trim() === "")
            pieces.pop();
        if (!pieces.length)
            return;
        const html = "<pre>" + pieces.map((p) => p.cls ? `<span class="${p.cls}">${esc(p.text)}</span>` : esc(p.text)).join("") + "</pre>";
        segments.push({ kind: "code", html });
        pieces = [];
    };
    let i = 0;
    const n = src.length;
    while (i < n) {
        const c = src[i];
        // `/* … */` — a Markdown comment: close the code run, open a prose segment.
        if (c === "/" && src[i + 1] === "*") {
            flushCode();
            let j = i + 2;
            while (j < n && !(src[j] === "*" && src[j + 1] === "/"))
                j++;
            segments.push({ kind: "prose", md: dedentComment(src.slice(i + 2, j)) });
            i = Math.min(j + 2, n);
            continue;
        }
        // `// …` — a line comment stays in the code, colored.
        if (c === "/" && src[i + 1] === "/") {
            let j = i + 2;
            while (j < n && src[j] !== "\n")
                j++;
            emit("c", src.slice(i, j));
            i = j;
            continue;
        }
        // whitespace run — one plain piece (kept verbatim: <pre> honours it)
        if (isSpace(c)) {
            let j = i;
            while (j < n && isSpace(src[j]))
                j++;
            emit(null, src.slice(i, j));
            i = j;
            continue;
        }
        // `"""…"""` triple-quoted block, then ordinary "…" / '…' strings
        if (c === '"' && src[i + 1] === '"' && src[i + 2] === '"') {
            let j = i + 3;
            while (j < n && !(src[j] === '"' && src[j + 1] === '"' && src[j + 2] === '"'))
                j++;
            emit("s", src.slice(i, Math.min(j + 3, n)));
            i = Math.min(j + 3, n);
            continue;
        }
        if (c === '"' || c === "'") {
            let j = i + 1;
            while (j < n && src[j] !== c) {
                if (src[j] === "\\")
                    j++;
                j++;
            }
            emit("s", src.slice(i, Math.min(j + 1, n)));
            i = Math.min(j + 1, n);
            continue;
        }
        // `{ … }` expression body — one span (a body a regex can hide inside)
        if (c === "{") {
            const end = scanBraces(src, i + 1, n);
            emit("b", src.slice(i, end));
            i = end;
            continue;
        }
        // `<->` two-way binding arrow
        if (c === "<" && src[i + 1] === "-" && src[i + 2] === ">") {
            emit("o", "<->");
            i += 3;
            continue;
        }
        // `:a.b` / `:arr[]` datapath
        if (c === ":" && isIdentStart(src[i + 1])) {
            let j = i + 1;
            while (j < n && (isIdentPart(src[j]) || src[j] === "." || src[j] === "[" || src[j] === "]"))
                j++;
            emit("p", src.slice(i, j));
            i = j;
            continue;
        }
        // `#RGB` / `#RRGGBB` color literal
        if (c === "#") {
            let j = i + 1;
            while (j < n && isHex(src[j]))
                j++;
            emit("h", src.slice(i, j));
            i = j;
            continue;
        }
        // number: -? ( 0x hex | digits (.digits)? %? )
        if (isDigit(c) || (c === "-" && isDigit(src[i + 1]))) {
            let j = i;
            if (src[j] === "-")
                j++;
            if (src[j] === "0" && (src[j + 1] === "x" || src[j + 1] === "X")) {
                j += 2;
                while (j < n && isHex(src[j]))
                    j++;
            }
            else {
                while (j < n && isDigit(src[j]))
                    j++;
                if (src[j] === "." && isDigit(src[j + 1])) {
                    j++;
                    while (j < n && isDigit(src[j]))
                        j++;
                }
                if (src[j] === "%")
                    j++;
            }
            emit("n", src.slice(i, j));
            i = j;
            continue;
        }
        // identifier: keyword, Type (Uppercase), attribute name (before `=`), or plain
        if (isIdentStart(c)) {
            let j = i;
            while (j < n && isIdentPart(src[j]))
                j++;
            const name = src.slice(i, j);
            let k = j;
            while (k < n && (src[k] === " " || src[k] === "\t"))
                k++;
            const attr = src[k] === "=" && src[k + 1] !== "=";
            const cls = attr ? "a"
                : KEYWORDS.has(name) ? "k"
                    : /^[A-Z]/.test(name) ? "t"
                        : null;
            emit(cls, name);
            i = j;
            continue;
        }
        // punctuation / anything else — plain structural text
        emit(null, c);
        i++;
    }
    flushCode();
    return segments;
}
//# sourceMappingURL=highlight.js.map