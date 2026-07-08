// The `:path` value mode's lexical layer (language §9: "a leading `:` marks a
// datapath — its own value mode, neither literal nor TypeScript"). A `{ }`
// body is TypeScript *plus datapath islands*: `:location.city` may appear
// anywhere an expression may. This module finds those islands — so expr.ts
// can rewrite them to their explicit runtime form (`this.$data("…")`, the
// same discipline as R6's bare-name rewrites) and compile.ts can neutralize
// them before handing the body to the TypeScript parser.
//
// Disambiguation: `:` also appears in TS as the ternary's second clause, an
// object literal's key separator, a label, and a type annotation. The rule —
// the same class of prev-token heuristic every JS lexer uses for regex-vs-
// division — is positional: a `:` beginning a datapath sits where an
// EXPRESSION is expected (after `(`, `,`, an operator, `?`, `=`, `return`, at
// the start), while every TS colon follows a completed expression or a name
// (`cond ?`-branches end in an operand; `key:` and `x: T` follow identifiers).
// So: a `:` opens a datapath iff the previous significant token cannot end an
// expression and an identifier follows. Shares the parser's known, accepted
// regex-literal gap (a `/}/`-style regex defeats any heuristic short of full
// lexing — HANDOFF §R4); real lexing arrives with the tsc front-end.
/** Split a dot-path into segments ("" → the cursor itself: no segments).
 *  Array indices are ordinary string segments — JS containers index
 *  identically with "2" and 2, so the path currency stays one type. */
export const splitPath = (path) => (path === "" ? [] : path.split("."));
// Identifier-shaped words that may directly PRECEDE an expression — after
// these, a `:` still opens a datapath (`return :title`, `yield :x`).
const NON_ENDING = new Set([
    "return", "typeof", "instanceof", "in", "of", "new", "do", "else", "case",
    "void", "delete", "throw", "yield", "await",
]);
const isIdentStart = (c) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_" || c === "$";
const isIdentPart = (c) => isIdentStart(c) || (c >= "0" && c <= "9");
/** Every datapath island in a `{ }` body, in source order. Pure lexical scan,
 *  honoring the same TS islands as the parser's brace scan (strings,
 *  templates — whose `${ }` substitutions are scanned recursively, since a
 *  datapath is legal inside them — and comments). */
export function scanDatapaths(src) {
    const out = [];
    const n = src.length;
    let i = 0;
    const string = (quote) => {
        i++;
        while (i < n && src[i] !== quote && src[i] !== "\n") {
            if (src[i] === "\\")
                i++;
            i++;
        }
        if (i < n)
            i++;
    };
    const template = () => {
        i++; // opening backtick
        while (i < n && src[i] !== "`") {
            if (src[i] === "\\") {
                i += 2;
                continue;
            }
            if (src[i] === "$" && src[i + 1] === "{") {
                i += 2;
                code(true);
                continue;
            }
            i++;
        }
        if (i < n)
            i++;
    };
    /** Scan a code region: the whole body, or (inSubstitution) through the `}`
     *  closing a template's `${ }`. `ends` tracks whether the last significant
     *  token can end an expression — the disambiguation state. */
    const code = (inSubstitution) => {
        let depth = 0;
        let ends = false;
        while (i < n) {
            const c = src[i];
            if (c === " " || c === "\t" || c === "\r" || c === "\n") {
                i++;
                continue;
            }
            if (c === "/" && src[i + 1] === "/") {
                while (i < n && src[i] !== "\n")
                    i++;
                continue;
            }
            if (c === "/" && src[i + 1] === "*") {
                i += 2;
                while (i < n && !(src[i] === "*" && src[i + 1] === "/"))
                    i++;
                i += 2;
                continue;
            }
            if (c === '"' || c === "'") {
                string(c);
                ends = true;
                continue;
            }
            if (c === "`") {
                template();
                ends = true;
                continue;
            }
            if (c === "{") {
                depth++;
                i++;
                ends = false;
                continue;
            }
            if (c === "}") {
                if (inSubstitution && depth === 0) {
                    i++;
                    return;
                }
                depth--;
                i++;
                ends = true; // an object literal's end is an operand
                continue;
            }
            if (c === ":" && !ends && isIdentStart(src[i + 1])) {
                const start = i;
                i++;
                let path = "";
                for (;;) {
                    while (i < n && isIdentPart(src[i]))
                        path += src[i++];
                    if (src[i] === "." && isIdentStart(src[i + 1])) {
                        path += ".";
                        i++;
                        continue;
                    }
                    break;
                }
                let many = false;
                if (src[i] === "[" && src[i + 1] === "]") {
                    many = true;
                    i += 2;
                }
                out.push({ start, end: i, path, many });
                ends = true; // a datapath read is an operand
                continue;
            }
            if (isIdentStart(c)) {
                let word = "";
                while (i < n && isIdentPart(src[i]))
                    word += src[i++];
                ends = !NON_ENDING.has(word);
                continue;
            }
            if (c >= "0" && c <= "9") {
                while (i < n && (isIdentPart(src[i]) || src[i] === "."))
                    i++;
                ends = true;
                continue;
            }
            if (c === ")" || c === "]") {
                i++;
                ends = true;
                continue;
            }
            i++; // every other punctuation expects an expression next
            ends = false;
        }
    };
    code(false);
    return out;
}
/** Rewrite a body's datapath islands to their explicit runtime form —
 *  `:location.city` → `this.$data("location.city")` — the R6 rewrite
 *  discipline extended to the data mode (`$` is not in the language's
 *  identifier grammar, so no member can ever collide with `$data`). A
 *  many-path is refused: `:items[]` replicates, which is a datapath
 *  attribute's meaning, not a value a body can hold. */
export function rewriteDatapaths(src) {
    const islands = scanDatapaths(src);
    if (islands.length === 0)
        return { src };
    const many = islands.find((p) => p.many);
    if (many !== undefined) {
        return {
            error: `reads ':${many.path}[]' — a many-path replicates and belongs on a datapath attribute; a { } body reads a single :path`,
        };
    }
    let out = "";
    let at = 0;
    for (const p of islands) {
        out += src.slice(at, p.start) + `this.$data(${JSON.stringify(p.path)})`;
        at = p.end;
    }
    return { src: out + src.slice(at) };
}
/** Replace each island with a same-length, identifier-free TS expression
 *  (`0` + padding), so the TypeScript parser can consume the body for
 *  free-identifier analysis (compile.ts) with every source offset intact —
 *  the resolved output keeps the `:path` spelling (it is language surface;
 *  the runtime performs the final rewrite). */
export function fillDatapaths(src) {
    const islands = scanDatapaths(src);
    if (islands.length === 0)
        return src;
    let out = "";
    let at = 0;
    for (const p of islands) {
        out += src.slice(at, p.start) + "0" + " ".repeat(p.end - p.start - 1);
        at = p.end;
    }
    return out + src.slice(at);
}
//# sourceMappingURL=datapath.js.map