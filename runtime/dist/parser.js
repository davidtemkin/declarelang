// The parser for the `[ ]` declarative layer — pure syntax, no semantics.
// It turns neo-LZX source into an Element tree of raw literals; deciding what
// a literal *means* (which type it coerces to) is the attribute schema's job
// (instantiate.ts), keeping the closed value vocabulary out of the grammar.
//
// R0–R6 grammar (literal + `{ }` attributes, method members, child instances,
// and — since R6 — class declarations, attribute declarations, and named
// children; the canonical typed method form `name: (p: T) -> R { }` waits
// for the type surface, see HANDOFF §R5):
//
//   program  := class* element
//   class    := 'class' IDENT 'extends' IDENT '[' members ']'
//   element  := IDENT ( '[' members ']' )?
//   members  := ( member ( ',' member )* ','? )?
//   member   := IDENT '=' value             -- set an attribute
//             | 'prevailing'? IDENT ':' IDENT ( '=' literal )?
//                                            -- declare an attribute (typed,
//                                               optionally defaulted; the
//                                               styling rung's modifier marks
//                                               it prevailing — followed from
//                                               the nearest providing ancestor
//                                               when unset)
//             | IDENT ':' IDENT '[' … ']'    -- a named child instance
//             | IDENT '(' params ')' CODE    -- a method (language §4 shorthand)
//             | element                      -- an anonymous child instance
//   params   := ( IDENT ( ',' IDENT )* ','? )?
//   value    := literal | '{' ts-expression '}'
//   literal  := NUMBER '%'? | STRING | HASHCOLOR | IDENT | PATH
//   PATH     := ':' IDENT ( '.' IDENT )* '[]'?    -- a datapath (language §9)
//
// R8 adds the data surface: the `:path` literal (a datapath — its own value
// mode, neither literal-typed nor TypeScript; the trailing `[]` is the
// replication form), and the embedded-JSON member `name: Dataset { … }` —
// a named child whose body is a raw `{ }` region instead of `[ ]` members
// (the one place `{ }` carries its JSON meaning, language §9). Whether a
// tag admits a raw body is the checker's question, like every other meaning.
//
// `class` and `extends` are contextual (top level only) — the language stays
// keyword-free inside `[ ]`. The one deliberate ambiguity: `name: Type`
// *without* brackets is always an attribute declaration; a named child needs
// its `[ ]` (even empty). The parser stays pure syntax — whether `Type` names
// a value type or a component is the checker's question, and this rule keeps
// it out of the grammar (recorded in HANDOFF §R6).
//
// A `{ }` value is captured as raw source (language §3: "when you see `{`,
// you have stepped into TypeScript until the matching `}`") — the parser
// finds the matching brace, nothing more; compiling the body is expr.ts's
// job (and tsc's, later). Matching must respect TS's own lexical islands —
// strings, template literals (with nested `${ }`), comments — so a brace
// inside them cannot end the body. Known, accepted gap until the tsc
// front-end owns real lexing: a regex literal containing a brace or quote
// (`/}/`) defeats the scan (regex-vs-division needs full lexing context);
// write such regexes as new RegExp("…"). Recorded in HANDOFF §R4.
import { NeoError } from "./errors.js";
import { Diag } from "./diagnostics.js";
const isDigit = (c) => c >= "0" && c <= "9";
const isIdentStart = (c) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isIdentPart = (c) => isIdentStart(c) || isDigit(c);
const isHex = (c) => isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
function tokenize(src) {
    const tokens = [];
    let i = 0, line = 1, col = 1;
    const here = () => ({ line, col, offset: i });
    const advance = () => {
        if (src[i] === "\n") {
            line++;
            col = 1;
        }
        else {
            col++;
        }
        i++;
    };
    // ── the `{ }` body scan: balanced braces, blind to TS except its lexical
    //    islands (strings / templates / comments), where a brace is just text.
    //    skipBraces and skipTemplate are mutually recursive because the
    //    islands nest: `{ \`a ${ { b: "}" } } c\` }` is one body. ───────────
    const skipString = (quote, at) => {
        advance(); // opening quote
        while (i < src.length && src[i] !== quote && src[i] !== "\n") {
            if (src[i] === "\\")
                advance();
            advance();
        }
        if (src[i] !== quote)
            throw new NeoError("unterminated string in { } expression", at);
        advance(); // closing quote
    };
    const skipTemplate = (at) => {
        advance(); // opening backtick
        while (i < src.length && src[i] !== "`") {
            if (src[i] === "\\") {
                advance();
                advance();
                continue;
            }
            if (src[i] === "$" && src[i + 1] === "{") {
                advance();
                advance();
                skipBraces(at);
                continue;
            }
            advance();
        }
        if (i >= src.length)
            throw new NeoError("unterminated template literal in { } expression", at);
        advance(); // closing backtick
    };
    const skipBraces = (at) => {
        // Called just inside a `{`; consumes through its matching `}`.
        let depth = 1;
        while (i < src.length && depth > 0) {
            const ch = src[i];
            if (ch === "{") {
                depth++;
                advance();
            }
            else if (ch === "}") {
                depth--;
                advance();
            }
            else if (ch === '"' || ch === "'")
                skipString(ch, at);
            else if (ch === "`")
                skipTemplate(at);
            else if (ch === "/" && src[i + 1] === "/") {
                while (i < src.length && src[i] !== "\n")
                    advance();
            }
            else if (ch === "/" && src[i + 1] === "*") {
                advance();
                advance();
                while (i < src.length && !(src[i] === "*" && src[i + 1] === "/"))
                    advance();
                if (i >= src.length)
                    throw new NeoError("unterminated comment in { } expression", at);
                advance();
                advance();
            }
            else
                advance();
        }
        if (depth > 0)
            throw new NeoError("unterminated { } expression", at);
    };
    while (i < src.length) {
        const c = src[i];
        // whitespace
        if (c === " " || c === "\t" || c === "\r" || c === "\n") {
            advance();
            continue;
        }
        // line comment
        if (c === "/" && src[i + 1] === "/") {
            while (i < src.length && src[i] !== "\n")
                advance();
            continue;
        }
        const start = here();
        // single-character punctuation
        const punct = {
            "[": "lbracket", "]": "rbracket", "(": "lparen", ")": "rparen", "=": "eq", ",": "comma", ":": "colon", ".": "dot",
        };
        if (punct[c]) {
            advance();
            tokens.push({ kind: punct[c], text: c, pos: start });
            continue;
        }
        // string
        if (c === '"' || c === "'") {
            const quote = c;
            advance();
            let str = "";
            while (i < src.length && src[i] !== quote) {
                if (src[i] === "\\") {
                    advance();
                    const e = src[i];
                    str += e === "n" ? "\n" : e === "t" ? "\t" : e; // minimal escapes
                    advance();
                }
                else {
                    str += src[i];
                    advance();
                }
            }
            if (i >= src.length)
                throw new NeoError("unterminated string", start);
            advance(); // closing quote
            tokens.push({ kind: "string", text: str, pos: start, str });
            continue;
        }
        // `{ … }` — a constraint body: capture the raw source between the braces
        if (c === "{") {
            advance(); // the `{`
            const from = i;
            skipBraces(start);
            tokens.push({ kind: "code", text: "{…}", pos: start, str: src.slice(from, i - 1) });
            continue;
        }
        // hash color
        if (c === "#") {
            advance();
            let hex = "";
            while (i < src.length && isHex(src[i])) {
                hex += src[i];
                advance();
            }
            tokens.push({ kind: "hexColor", text: "#" + hex, pos: start });
            continue;
        }
        // number: -?  ( 0x[hex]+ | [0-9]+ ( . [0-9]+ )?  '%'? )
        if (isDigit(c) || (c === "-" && isDigit(src[i + 1]))) {
            let text = "";
            if (c === "-") {
                text += "-";
                advance();
            }
            if (src[i] === "0" && (src[i + 1] === "x" || src[i + 1] === "X")) {
                text += "0x";
                advance();
                advance();
                let hex = "";
                while (i < src.length && isHex(src[i])) {
                    hex += src[i];
                    advance();
                }
                tokens.push({ kind: "number", text: text + hex, pos: start, num: parseInt(hex, 16) * (text[0] === "-" ? -1 : 1), hex: true });
                continue;
            }
            while (i < src.length && isDigit(src[i])) {
                text += src[i];
                advance();
            }
            if (src[i] === "." && isDigit(src[i + 1])) {
                text += ".";
                advance();
                while (i < src.length && isDigit(src[i])) {
                    text += src[i];
                    advance();
                }
            }
            if (src[i] === "%") {
                // `%` binds to the number it follows (no space), like CSS.
                advance();
                tokens.push({ kind: "percent", text: text + "%", pos: start, num: parseFloat(text) });
                continue;
            }
            tokens.push({ kind: "number", text, pos: start, num: parseFloat(text) });
            continue;
        }
        // identifier
        if (isIdentStart(c)) {
            let name = "";
            while (i < src.length && isIdentPart(src[i])) {
                name += src[i];
                advance();
            }
            tokens.push({ kind: "ident", text: name, pos: start });
            continue;
        }
        throw new NeoError(`unexpected character '${c}'`, start);
    }
    tokens.push({ kind: "eof", text: "", pos: here() });
    return tokens;
}
// ── Parser ────────────────────────────────────────────────────────────────
/** One parser over a token stream; parse() and parseProgram() both drive it. */
class Parser {
    tokens;
    i = 0;
    constructor(tokens) {
        this.tokens = tokens;
    }
    peek() { return this.tokens[this.i]; }
    peekAt(ahead) { return this.tokens[Math.min(this.i + ahead, this.tokens.length - 1)]; }
    next() { return this.tokens[this.i++]; }
    expect(kind, what) {
        const t = this.tokens[this.i];
        if (t.kind !== kind)
            throw new NeoError(`expected ${what}, got '${t.text || t.kind}'`, t.pos);
        return this.tokens[this.i++];
    }
    /** `'class' Name ('extends' Base)? '[' members ']'` — `extends` is a
     *  contextual ident; the caller has already seen `class` + a name.
     *
     *  The base is OPTIONAL, and its omission is not a shorthand — it is the
     *  uniform rule made visible: a class you declare is a Node, and the ones
     *  that say `extends View` are the visible ones. A class with no base IS a
     *  Node — the plain object-graph atom: a non-visual controller / service /
     *  coordinator (reactive state + methods). So the ordinary case a newcomer
     *  reaches for reads as a plain class, with no ceremony that presupposes the
     *  graph; the graph is learned later, when reaching one from a view. */
    parseClass() {
        const kw = this.expect("ident", "'class'");
        const name = this.expect("ident", "the class's name");
        let base = "Node";
        let basePos = name.pos;
        const ext = this.peek();
        if (ext.kind === "ident" && ext.text === "extends") {
            this.next();
            const b = this.expect("ident", "the base component's name");
            base = b.text;
            basePos = b.pos;
        }
        // The body is an Element whose tag is the class's own name, positioned at
        // the name — the checker validates it exactly like an instance of the
        // class (once the schema is registered), with zero new machinery.
        const body = { tag: name.text, name: null, attrs: [], decls: [], methods: [], children: [], pos: name.pos };
        this.expect("lbracket", "'['");
        this.parseMembers(body);
        this.expect("rbracket", "']'");
        return { name: name.text, base, basePos, body, pos: kw.pos };
    }
    parseElement() {
        const tag = this.expect("ident", "a component name");
        const el = { tag: tag.text, name: null, attrs: [], decls: [], methods: [], children: [], pos: tag.pos };
        if (this.peek().kind === "lbracket") {
            this.next();
            this.parseMembers(el);
            this.expect("rbracket", "']'");
        }
        return el;
    }
    parseMembers(el) {
        while (this.peek().kind !== "rbracket" && this.peek().kind !== "eof") {
            let name = this.expect("ident", "a member name");
            // The `prevailing` declaration modifier (styling rung) — contextual:
            // only when what follows is itself a declaration head (`name :`), so a
            // member actually named `prevailing` still parses everywhere else.
            let prevailing = false;
            const declPos = name.pos;
            if (name.text === "prevailing" && this.peek().kind === "ident" && this.peekAt(1).kind === "colon") {
                prevailing = true;
                name = this.next();
            }
            if (this.peek().kind === "eq") {
                this.next();
                el.attrs.push({ name: name.text, value: this.parseLiteral(), pos: name.pos });
            }
            else if (this.peek().kind === "colon") {
                // `name: Type …` — a declaration (R6): with `[ ]` it is a named child
                // instance; without, an attribute declaration (optionally defaulted).
                // See the header note on this rule — the parser never asks whether
                // `Type` names a component or a value type.
                this.next();
                if (this.peek().kind === "lbracket") {
                    // `Button: [ … ]` — a class-keyed ENTRY (a stylesheet's member;
                    // anywhere else the checker refuses it).
                    const child = { tag: name.text, name: null, entry: true, attrs: [], decls: [], methods: [], children: [], pos: name.pos };
                    this.next();
                    this.parseMembers(child);
                    this.expect("rbracket", "']'");
                    el.children.push(child);
                    if (this.peek().kind === "comma") {
                        this.next();
                        continue;
                    }
                    break;
                }
                const type = this.expect("ident", "a type or component name");
                if (this.peek().kind === "lbracket") {
                    if (prevailing) {
                        throw new NeoError(`'prevailing' marks an attribute declaration — a child instance cannot be prevailing`, declPos);
                    }
                    const child = { tag: type.text, name: name.text, attrs: [], decls: [], methods: [], children: [], pos: name.pos };
                    this.next();
                    this.parseMembers(child);
                    this.expect("rbracket", "']'");
                    el.children.push(child);
                }
                else if (this.peek().kind === "code") {
                    // `events: Dataset { …json… }` — a named child with an embedded raw
                    // body (language §9). Pure syntax here; the checker owns whether
                    // the tag admits one and whether the text is valid JSON.
                    if (prevailing) {
                        throw new NeoError(`'prevailing' marks an attribute declaration — a child instance cannot be prevailing`, declPos);
                    }
                    const body = this.next();
                    el.children.push({
                        tag: type.text, name: name.text, attrs: [], decls: [], methods: [], children: [],
                        raw: { src: body.str, pos: body.pos }, pos: name.pos,
                    });
                }
                else {
                    let def = null;
                    if (this.peek().kind === "eq") {
                        this.next();
                        def = this.parseLiteral();
                    }
                    el.decls.push({ name: name.text, type: type.text, typePos: type.pos, def, prevailing, pos: declPos });
                }
            }
            else if (this.peek().kind === "lparen") {
                // a method — `name(params) { statements }`; params are bare names
                // (their names are in scope in the body, language §4). A trailing
                // comma is legal, as everywhere in the language.
                this.next();
                const params = [];
                while (this.peek().kind === "ident") {
                    params.push(this.next().text);
                    if (this.peek().kind === "comma")
                        this.next();
                    else
                        break;
                }
                this.expect("rparen", "')'");
                const body = this.peek();
                if (body.kind !== "code")
                    throw new NeoError(`expected the method body '{ … }', got '${body.text || body.kind}'`, body.pos);
                this.next();
                el.methods.push({ name: name.text, params, body: body.str, pos: name.pos, bodyPos: body.pos });
            }
            else {
                // an anonymous child instance — bare `Name` or `Name [ … ]` (or the
                // raw-bodied form, for the checker to judge: data nodes need names).
                const child = { tag: name.text, name: null, attrs: [], decls: [], methods: [], children: [], pos: name.pos };
                if (this.peek().kind === "lbracket") {
                    this.next();
                    this.parseMembers(child);
                    this.expect("rbracket", "']'");
                }
                else if (this.peek().kind === "code") {
                    const body = this.next();
                    child.raw = { src: body.str, pos: body.pos };
                }
                el.children.push(child);
            }
            if (this.peek().kind === "comma")
                this.next();
            else
                break; // no comma ⇒ this must be the last member
        }
    }
    parseLiteral() {
        const t = this.next();
        switch (t.kind) {
            case "number": return { kind: "number", value: t.num, hex: t.hex === true, pos: t.pos };
            case "percent": return { kind: "percent", value: t.num, pos: t.pos };
            case "string": return { kind: "string", value: t.str, pos: t.pos };
            case "hexColor": return { kind: "hexColor", raw: t.text, pos: t.pos };
            case "ident":
                // `name(args)` — a value constructor (gradient/stroke/shadow/stop).
                if (this.peek().kind === "lparen") {
                    this.next();
                    const args = [];
                    while (this.peek().kind !== "rparen" && this.peek().kind !== "eof") {
                        args.push(this.parseLiteral());
                        if (this.peek().kind === "comma")
                            this.next();
                        else
                            break;
                    }
                    this.expect("rparen", "')'");
                    return { kind: "call", name: t.text, args, pos: t.pos };
                }
                return { kind: "ident", name: t.text, pos: t.pos };
            case "code": return { kind: "code", src: t.str, pos: t.pos };
            case "colon": return this.parsePath(t.pos);
            case "lbracket": {
                // `[a, b, …]` — a list literal (idents for `styles`; font names,
                // strings, and url()/local() sources for the font slots).
                const items = [];
                while (this.peek().kind !== "rbracket" && this.peek().kind !== "eof") {
                    items.push(this.parseLiteral());
                    if (this.peek().kind === "comma")
                        this.next();
                    else
                        break;
                }
                this.expect("rbracket", "']'");
                return { kind: "list", items, pos: t.pos };
            }
            default: throw new NeoError(`expected a value, got '${t.text || t.kind}'`, t.pos);
        }
    }
    /** `:field(.field)*` with an optional glued `[]` (the replication form,
     *  language §9: `:arr[]` matches many). `[]` must sit hard against the
     *  path — `%`-style adjacency: the marker is part of the value's spelling. */
    parsePath(pos) {
        let last = this.expect("ident", "a field name after ':'");
        let path = last.text;
        while (this.peek().kind === "dot") {
            this.next();
            last = this.expect("ident", "a field name after '.'");
            path += "." + last.text;
        }
        let many = false;
        const lb = this.peek();
        if (lb.kind === "lbracket" && lb.pos.offset === last.pos.offset + last.text.length) {
            this.next();
            this.expect("rbracket", "']' — a many-path is written ':items[]'");
            many = true;
        }
        return { kind: "path", path, many, pos };
    }
    atClass() {
        // Contextual: `class` followed by another identifier opens a class
        // declaration; a bare component happens never to be named `class` in
        // practice, and `class [ … ]` would still parse as one.
        const t = this.tokens[this.i];
        const u = this.tokens[this.i + 1];
        return t.kind === "ident" && t.text === "class" && u.kind === "ident";
    }
    /** At a `stylesheet Name [ … ]` / `style name [ … ]` top-level declaration
     *  (styling rung) — the same contextual-keyword rule as atClass. */
    atTop(keyword) {
        const t = this.tokens[this.i];
        const u = this.tokens[this.i + 1];
        return t.kind === "ident" && t.text === keyword && u.kind === "ident";
    }
    /** At an `include [ … ]` directive (composition.md §1) — contextual: the
     *  ident `include` followed by `[`. (`include` followed by anything else is
     *  an ordinary component name, exactly as `class`/`stylesheet` are.) */
    atInclude() {
        const t = this.tokens[this.i];
        const u = this.tokens[this.i + 1];
        return t.kind === "ident" && t.text === "include" && u.kind === "lbracket";
    }
    /** `'include' '[' STRING ( ',' STRING )* ','? ']'` — a top-level directive
     *  whose body is neo's list grammar restricted to quoted paths. Non-string
     *  entries are a positioned error (paths are quoted strings, no bare-token
     *  magic — composition.md §1). Returns one IncludeRef per path plus the
     *  directive's whole source span (the `include` keyword through `]`), which
     *  the source-merge excises to build a self-contained program. */
    parseIncludeDirective() {
        const kw = this.expect("ident", "'include'");
        this.expect("lbracket", "'['");
        const refs = [];
        while (this.peek().kind !== "rbracket" && this.peek().kind !== "eof") {
            const t = this.peek();
            if (t.kind !== "string") {
                throw new NeoError("an include path is a quoted string", t.pos);
            }
            this.next();
            refs.push({ path: t.str, pos: t.pos });
            if (this.peek().kind === "comma")
                this.next();
            else
                break;
        }
        const rb = this.expect("rbracket", "']'");
        return { refs, span: { start: kw.pos.offset, end: rb.pos.offset + rb.text.length } };
    }
    /** `('stylesheet' | 'style') name '[' members ']'`. The body is an Element
     *  tagged with the declaration's own name — pure syntax; what a stylesheet
     *  or bundle body may carry is the checker's question. */
    parseTopDecl(what) {
        const kw = this.expect("ident", `'${what}'`);
        const name = this.expect("ident", `the ${what}'s name`);
        const body = { tag: name.text, name: null, attrs: [], decls: [], methods: [], children: [], pos: name.pos };
        this.expect("lbracket", "'['");
        this.parseMembers(body);
        this.expect("rbracket", "']'");
        return { name: name.text, body, pos: kw.pos };
    }
}
/** Parse a component fragment — one element, no class declarations. The
 *  entry tools and tests use for pieces; a whole source goes through
 *  parseProgram (which build()/render() call). */
export function parse(source) {
    const p = new Parser(tokenize(source));
    const root = p.parseElement();
    p.expect("eof", "end of input");
    return root;
}
/** Parse the top-level declarations shared by a program and a library:
 *  `include` directives, class declarations, and `stylesheet`/`style`
 *  bundles, in any order. Stops at the first token that opens none of them
 *  (the root element in a program, or eof in a library). */
function parseTopDecls(p) {
    const classes = [];
    const stylesheets = [];
    const styles = [];
    const fonts = [];
    const includes = [];
    const includeSpans = [];
    for (;;) {
        if (p.atInclude()) {
            const { refs, span } = p.parseIncludeDirective();
            includes.push(...refs);
            includeSpans.push(span);
        }
        else if (p.atClass())
            classes.push(p.parseClass());
        else if (p.atTop("stylesheet"))
            stylesheets.push(p.parseTopDecl("stylesheet"));
        else if (p.atTop("style"))
            styles.push(p.parseTopDecl("style"));
        else if (p.atTop("font"))
            fonts.push(p.parseTopDecl("font"));
        else
            break;
    }
    return { classes, stylesheets, styles, fonts, includes, includeSpans };
}
/** Parse a whole neo-LZX source: `include`s and top-level declarations
 *  (classes, stylesheets, style bundles — in any order), then the root
 *  instance. */
export function parseProgram(source) {
    const p = new Parser(tokenize(source));
    const { classes, stylesheets, styles, fonts, includes, includeSpans } = parseTopDecls(p);
    const root = p.parseElement();
    p.expect("eof", "end of input");
    return { classes, stylesheets, styles, fonts, includes, includeSpans, root };
}
/** Parse an INCLUDED file (composition.md §1): the same top-level
 *  declarations as a program, then eof — a library declares classes,
 *  stylesheets, and styles, never a root. A stray root element is a
 *  positioned error: an included file is a library of definitions, not an
 *  App. */
export function parseLibrary(source) {
    const p = new Parser(tokenize(source));
    const decls = parseTopDecls(p);
    if (p.peek().kind !== "eof") {
        throw Diag.strayRoot("an included file is a library of definitions — it declares classes, stylesheets, and styles, not an App/root", p.peek().pos);
    }
    return decls;
}
//# sourceMappingURL=parser.js.map