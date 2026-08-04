// The parser for the `[ ]` declarative layer — pure syntax, no semantics.
// It turns Declare source into an Element tree of raw literals; deciding what
// a literal *means* (which type it coerces to) is the attribute schema's job
// (instantiate.ts), keeping the closed value vocabulary out of the grammar.
//
// R0–R6 grammar (literal + `{ }` attributes, method members, child instances,
// and — since R6 — class declarations, attribute declarations, and named
// children; since 2026-07-28 a method signature carries its parameter and
// return TYPES, language §4's canonical form):
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
//             | IDENT '(' params ')' ret? CODE  -- a method (language §4)
//             | element                      -- an anonymous child instance
//   params   := ( param ( ',' param )* ','? )?
//   param    := IDENT ( ':' IDENT '?'? )?        -- name-first; '?' = nullable
//   ret      := ( '->' | ':' ) IDENT '?'?        -- '->' is house style
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
import { DeclareError, DeclareErrors } from "./errors.js";
import { Diag } from "./diagnostics.js";
const isDigit = (c) => c >= "0" && c <= "9";
const isIdentStart = (c) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isIdentPart = (c) => isIdentStart(c) || isDigit(c);
const isHex = (c) => isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
/** A `"""…"""` text block's content, dedented like a Swift/Java text block:
 *  drop the newline right after the opening delimiter, strip the least common
 *  leading indentation from every line, and drop the final line if it holds
 *  only the closing delimiter's indentation. Source layout stays cosmetic. */
function dedent(raw) {
    let s = raw.replace(/\r\n?/g, "\n");
    if (s[0] === "\n")
        s = s.slice(1); // opening-delimiter line
    const lines = s.split("\n");
    let min = Infinity;
    for (const ln of lines) {
        if (ln.trim() === "")
            continue;
        min = Math.min(min, ln.length - ln.trimStart().length);
    }
    if (!Number.isFinite(min))
        min = 0;
    return lines.map((ln) => ln.slice(min)).join("\n").replace(/\n[ \t]*$/, "");
}
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
            throw new DeclareError("unterminated string in { } expression", at);
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
            throw new DeclareError("unterminated template literal in { } expression", at);
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
                    throw new DeclareError("unterminated comment in { } expression", at);
                advance();
                advance();
            }
            else
                advance();
        }
        if (depth > 0)
            throw new DeclareError("unterminated { } expression", at);
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
        // block comment — trivia like a line comment, but also the home of LITERATE
        // Markdown: a `/* … */` at the top level documents the code around it, and the
        // code viewer renders it as prose (compiler/src/highlight.ts). Skipped here so
        // it is valid anywhere a line comment is (a comment inside a `{ }` body is the
        // body scanner's job, not this).
        if (c === "/" && src[i + 1] === "*") {
            const at = here();
            advance();
            advance();
            while (i < src.length && !(src[i] === "*" && src[i + 1] === "/"))
                advance();
            if (i >= src.length)
                throw new DeclareError("unterminated block comment", at);
            advance();
            advance();
            continue;
        }
        const start = here();
        // two-way data-binding arrow (language §9, the leaf-input exception):
        // `name <-> :path`. Multi-char, so it is lexed before the single-char table.
        if (c === "<" && src[i + 1] === "-" && src[i + 2] === ">") {
            advance();
            advance();
            advance();
            tokens.push({ kind: "bindtwo", text: "<->", pos: start });
            continue;
        }
        // `<-` is NO LONGER LANGUAGE (subscriptions became components, 2026-07-26).
        // It is still LEXED so the parser can answer a program written against the
        // old form with the rewrite instead of a bare syntax error — the diagnostics
        // rule (name the fix) applied to a removed feature.
        if (c === "<" && src[i + 1] === "-") {
            advance();
            advance();
            tokens.push({ kind: "subfrom", text: "<-", pos: start });
            continue;
        }
        // single-character punctuation
        const punct = {
            "[": "lbracket", "]": "rbracket", "(": "lparen", ")": "rparen", "=": "eq", ",": "comma", ":": "colon", ".": "dot", "*": "star", "!": "bang",
        };
        if (punct[c]) {
            advance();
            tokens.push({ kind: punct[c], text: c, pos: start });
            continue;
        }
        // triple-quoted text block: raw, multi-line, common indentation stripped
        // (docs/system-design/text-and-markdown.md). Pleasant hand-authored Markdown without
        // `\n` noise; the language stays content-agnostic — this is just a
        // dedented RAW string (no escape processing, so Markdown's own `\` is its
        // own), and the dedent keeps source indentation cosmetic.
        if (c === '"' && src[i + 1] === '"' && src[i + 2] === '"') {
            advance();
            advance();
            advance();
            let raw = "";
            while (i < src.length && !(src[i] === '"' && src[i + 1] === '"' && src[i + 2] === '"')) {
                raw += src[i];
                advance();
            }
            if (i >= src.length)
                throw new DeclareError('unterminated text block (""")', start);
            advance();
            advance();
            advance();
            const v = dedent(raw);
            tokens.push({ kind: "string", text: v, pos: start, str: v });
            continue;
        }
        // string
        if (c === '"' || c === "'") {
            const quote = c;
            advance();
            let str = "";
            while (i < src.length && src[i] !== quote) {
                // a NEWLINE inside a quoted string is refused: multi-line text is a
                // `\"\"\"` block's job (dedented, content-agnostic), and the loose form
                // was usually an unterminated string swallowing the rest of the member
                if (src[i] === "\n") {
                    throw new DeclareError('a quoted string ends at its line — for multi-line text use a \"\"\"…\"\"\" block, or \\n for a literal newline', start);
                }
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
                throw new DeclareError("unterminated string", start);
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
                // the digit count survives to the checker: `0x` colors are RULED
                // 6-digit opaque, so an 8-digit form (alpha intent) can be caught
                tokens.push({ kind: "number", text: text + hex, pos: start, num: parseInt(hex, 16) * (text[0] === "-" ? -1 : 1), hex: true, hexLen: hex.length });
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
        // `?` — the NULLABLE marker on a signature type (`c: Menu?`). Only legal
        // there; anywhere else the parser reports it as the unexpected token it is.
        if (c === "?") {
            advance();
            tokens.push({ kind: "query", text: "?", pos: start });
            continue;
        }
        // `->` — the return-type marker (language §4). Inside a { } body it rides
        // the opaque code token, so it reaches the lexer only in a signature.
        if (c === "-" && src[i + 1] === ">") {
            advance();
            advance();
            tokens.push({ kind: "arrow", text: "->", pos: start });
            continue;
        }
        throw new DeclareError(`unexpected character '${c}'`, start);
    }
    tokens.push({ kind: "eof", text: "", pos: here() });
    return tokens;
}
// ── Parser ────────────────────────────────────────────────────────────────
/** One parser over a token stream; parse() and parseProgram() both drive it. */
class Parser {
    tokens;
    /** Recovered-through errors (the TS-ism recognition layer, E-series): a
     *  RECOGNIZED foreign production is consumed whole, its fix-naming error
     *  recorded here, and parsing continues at the member comma — so one compile
     *  reports the full list, the way check() already does. Unrecognized junk
     *  still throws immediately (blind recovery manufactures cascades). The
     *  entry points raise these as one DeclareErrors at completion. */
    errors = [];
    i = 0;
    constructor(tokens) {
        this.tokens = tokens;
    }
    peek() { return this.tokens[this.i]; }
    peekAt(ahead) { return this.tokens[Math.min(this.i + ahead, this.tokens.length - 1)]; }
    next() { return this.tokens[this.i++]; }
    expect(kind, what) {
        const t = this.tokens[this.i];
        if (t.kind !== kind) {
            const err = new DeclareError(`expected ${what}, got '${t.text || t.kind}'`, t.pos);
            // a hard stop with recovered errors pending reports ALL of them
            throw this.errors.length > 0 ? new DeclareErrors([...this.errors, err]) : err;
        }
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
    /** Read a type reference and return it AS WRITTEN. Two shapes (language §4):
     *  a name (`number`, `Menu`, either optionally `?`-marked), or a FUNCTION type
     *  `(params) -> Ret` — the type a method IS ("a method is a named field of
     *  function type … the `{ body }` is its value"), and therefore the type a
     *  callback parameter or a callback-holding slot needs. Before this,
     *  library/dialog.declare had to write `cb: object = null` for a slot holding
     *  a function, because `object` was the closest thing sayable.
     *
     *  The result is the written source TEXT, because that is what a written type
     *  has always been in this AST — a compound one is no different. Translating
     *  it to TypeScript is a single `->` → `=>` rewrite (scaffold.ts); validating
     *  the names inside it is the checker's job, as for every written type. */
    parseTypeRef(what) {
        if (this.peek().kind === "lparen") {
            const open = this.peek();
            let text = "(";
            this.next();
            while (this.peek().kind !== "rparen" && this.peek().kind !== "eof") {
                text += this.expect("ident", "a parameter name").text;
                if (this.peek().kind === "colon") {
                    this.next();
                    text += ": " + this.parseTypeRef("a parameter type name").text;
                }
                if (this.peek().kind === "comma") {
                    this.next();
                    text += ", ";
                }
                else
                    break;
            }
            this.expect("rparen", "')'");
            text += ")";
            // `-> Ret` is optional: a function type without one is void, the same
            // rule a method signature follows. It is MADE explicit here so every
            // function type carries a return, and the TypeScript translation stays a
            // single token rewrite at every nesting depth.
            text += this.peek().kind === "arrow"
                ? (this.next(), " -> " + this.parseTypeRef("a return type name").text)
                : " -> void";
            if (this.peek().kind === "query") {
                this.next();
                text += "?";
            }
            return { text, pos: open.pos };
        }
        const name = this.expect("ident", what);
        let text = name.text;
        // `Window[]` — an element-typed array (the type is TS's own; only the
        // written-type grammar had to admit it). The `[]` must be GLUED to the
        // name: `w: Window [ ]` with a space is a named CHILD with an empty body,
        // and adjacency is what separates the two readings — the same convention
        // TS itself writes, and the formatter keeps.
        let end = name.pos.offset + name.text.length;
        while (this.peek().kind === "lbracket" && this.peekAt(1).kind === "rbracket"
            && this.peek().pos.offset === end) {
            end = this.peekAt(1).pos.offset + 1;
            this.next();
            this.next();
            text += "[]";
        }
        if (this.peek().kind === "query") {
            this.next();
            return { text: text + "?", pos: name.pos };
        }
        return { text, pos: name.pos };
    }
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
            let readOnly = false;
            const declPos = name.pos;
            // Contextual declaration modifiers (`prevailing` / `readonly`): recognized
            // ONLY when a declaration head (`name :`) follows, so a member actually
            // named `prevailing` / `readonly` still parses everywhere else. One at a
            // time — the two never combine (a computed slot does not also follow).
            if ((name.text === "prevailing" || name.text === "readonly") &&
                this.peek().kind === "ident" && this.peekAt(1).kind === "colon") {
                if (name.text === "readonly")
                    readOnly = true;
                else
                    prevailing = true;
                name = this.next();
            }
            // E-4: `t.opacity = …` — a dotted member, the reach-into-a-child instinct
            // (commonly inside a State, to override a child). A member sets its OWN
            // element's attributes; name the rule, CONSUME the production, continue —
            // so the rest of the body still gets checked (recognition layer).
            if (this.peek().kind === "dot") {
                this.errors.push(new DeclareError(`'${name.text}.…' — a member sets this element's OWN attributes, never a child's. Write the attribute on '${name.text}' itself, usually as a { } constraint reading the state or flag that drives it`, name.pos));
                while (this.peek().kind === "dot") {
                    this.next();
                    if (this.peek().kind === "ident")
                        this.next();
                }
                if (this.peek().kind === "eq") {
                    this.next();
                    this.parseLiteral();
                }
                if (this.peek().kind === "comma") {
                    this.next();
                    continue;
                }
                break;
            }
            if (this.peek().kind === "eq") {
                this.next();
                el.attrs.push({ name: name.text, value: this.parseLiteral(), pos: name.pos });
            }
            else if (this.peek().kind === "bindtwo") {
                // `name <-> :path` — two-way: the slot reads the datapath AND writes
                // edits back to it. The value is a `:path` (or a `{ }` expression
                // yielding a FIELD NAME — the generic-editor form, evaluated for a
                // string and resolved against the enclosing datapath, NOT a reference
                // to the slot it names); anything else gets the rule
                // named HERE (E-7: `text <-> classroot.field` otherwise dies
                // downstream as an opaque "expected ']', got '.'").
                this.next();
                const bv = this.parseLiteral();
                if (bv.kind !== "path" && bv.kind !== "code") {
                    this.errors.push(new DeclareError(`'${name.text} <-> …' binds a DATAPATH — write a :path (${name.text} <-> :field), or a { } expression yielding a field NAME. To wire an attribute to another attribute, derive down with a { } constraint and deliver up in an onInput() handler`, bv.pos));
                    // consume a stray dotted chain (`<-> classroot.field`), drop the member
                    while (this.peek().kind === "dot") {
                        this.next();
                        if (this.peek().kind === "ident")
                            this.next();
                    }
                }
                else {
                    el.attrs.push({ name: name.text, value: bv, pos: name.pos, bind: "two" });
                }
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
                const type = this.parseTypeRef("a type or component name");
                if (this.peek().kind === "lbracket") {
                    if (prevailing || readOnly) {
                        throw new DeclareError(`'${readOnly ? "readonly" : "prevailing"}' marks an attribute declaration — a child instance cannot carry it`, declPos);
                    }
                    const child = { tag: type.text, name: name.text, attrs: [], decls: [], methods: [], children: [], pos: name.pos };
                    this.next();
                    this.parseMembers(child);
                    this.expect("rbracket", "']'");
                    // `d: Dataset [ schema = [ … ] ] { …json… }` (B4): attributes AND
                    // an embedded body compose — the schema'd embedded dataset's form.
                    // Pure syntax here; the checker owns whether the tag admits a body.
                    if (this.peek().kind === "code") {
                        const body = this.next();
                        child.raw = { src: body.str, pos: body.pos };
                    }
                    el.children.push(child);
                }
                else if (this.peek().kind === "code") {
                    // `events: Dataset { …json… }` — a named child with an embedded raw
                    // body (language §9). Pure syntax here; the checker owns whether
                    // the tag admits one and whether the text is valid JSON.
                    if (prevailing || readOnly) {
                        throw new DeclareError(`'${readOnly ? "readonly" : "prevailing"}' marks an attribute declaration — a child instance cannot carry it`, declPos);
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
                    el.decls.push({ name: name.text, type: type.text, typePos: type.pos, def, prevailing, readOnly, pos: declPos });
                }
            }
            else if (this.peek().kind === "lparen") {
                // a method — `name(p: Type, …) -> Ret { statements }` (language §4:
                // "Parameters are name-first (`h: int`) … Omit `-> Ret` for a void
                // method"). Parameter names are in scope in the body. A trailing comma
                // is legal, as everywhere in the language.
                //
                // Both these annotations were PARSED and discarded until 2026-07-28,
                // with an error (E-9) telling the author they were illegal — a
                // diagnostics pass that mistook a not-yet-built feature for a rule and
                // then defended it. They are the spec; the type is now kept.
                this.next();
                const params = [];
                while (this.peek().kind === "ident") {
                    const pname = this.next().text;
                    let ptype, ptypePos, pnullable = false;
                    if (this.peek().kind === "colon") {
                        this.next();
                        if (this.peek().kind === "ident" || this.peek().kind === "lparen") {
                            const tr = this.parseTypeRef("a parameter type name");
                            ptypePos = tr.pos;
                            if (tr.text.endsWith("?")) {
                                ptype = tr.text.slice(0, -1);
                                pnullable = true;
                            }
                            else
                                ptype = tr.text;
                        }
                        else
                            this.errors.push(new DeclareError(`'${pname}:' needs a type name — write '${pname}: number' (a primitive or a component class), or drop the ':' for an untyped parameter`, this.peek().pos));
                    }
                    params.push(ptype === undefined ? { name: pname }
                        : pnullable ? { name: pname, type: ptype, typePos: ptypePos, nullable: true }
                            : { name: pname, type: ptype, typePos: ptypePos });
                    if (this.peek().kind === "comma")
                        this.next();
                    else
                        break;
                }
                this.expect("rparen", "')'");
                // The return annotation. `-> Ret` is house style (what §4 writes);
                // `: Ret` parses too — the formatter normalizes it.
                let returns, returnsPos, returnsNullable = false;
                if (this.peek().kind === "arrow" || this.peek().kind === "colon") {
                    const marker = this.next();
                    if (this.peek().kind === "ident" || this.peek().kind === "lparen") {
                        const tr = this.parseTypeRef("a return type name");
                        returnsPos = tr.pos;
                        if (tr.text.endsWith("?")) {
                            returns = tr.text.slice(0, -1);
                            returnsNullable = true;
                        }
                        else
                            returns = tr.text;
                    }
                    else
                        this.errors.push(new DeclareError(`'${marker.text}' needs a return type name — write '${name.text}(…) -> number { … }', or drop the '${marker.text}' for a method that returns nothing`, this.peek().pos));
                }
                // The removed subscription form: `member(params) <- Source { body }`.
                // A service is an ordinary component member now, so name that rewrite
                // with the author's own source and member filled in.
                if (this.peek().kind === "subfrom") {
                    const arrow = this.peek();
                    this.next();
                    const src = this.peek().kind === "ident" ? this.peek().text : "Source";
                    // Echo the signature back AS WRITTEN — `params` carries types now, so
                    // a bare join would print "[object Object]" into the author's face.
                    const sig = params.map((prm) => (prm.type === undefined ? prm.name : `${prm.name}: ${prm.type}`)).join(", ");
                    throw new DeclareError(`'<-' subscriptions were removed — a runtime service is a component member now: write '${src} [ ${name.text}(${sig}) { … } ]' as a child, in place of '${name.text}(${sig}) <- ${src} { … }'`, arrow.pos);
                }
                const body = this.peek();
                if (body.kind !== "code") {
                    throw new DeclareError(`expected the method body '{ … }', got '${body.text || body.kind}'`, body.pos);
                }
                this.next();
                el.methods.push(returns === undefined
                    ? { name: name.text, params, body: body.str, pos: name.pos, bodyPos: body.pos }
                    : { name: name.text, params, returns, returnsPos, returnsNullable, body: body.str, pos: name.pos, bodyPos: body.pos });
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
            // Members are SEPARATED by commas (ruled 2026-07-28, reversing the
            // optional-comma stance above this line once took): the grammar could
            // delimit by idents alone, but a missing comma is nearly always an
            // editing accident — a deleted line's survivor gluing onto the next
            // member — and the formatter has always refused the comma-free form.
            // The parser now agrees. A TRAILING comma before `]` stays legal;
            // house style omits it. Recovery: report and keep parsing, so every
            // missing comma in a body is one positioned error, not a cascade.
            if (this.peek().kind === "comma") {
                this.next();
                continue;
            }
            if (this.peek().kind !== "rbracket" && this.peek().kind !== "eof") {
                this.errors.push(new DeclareError(`members are separated by commas — add ',' before '${this.peek().text || this.peek().kind}'`, this.peek().pos));
            }
        }
    }
    parseLiteral() {
        const t = this.next();
        switch (t.kind) {
            case "number": return { kind: "number", value: t.num, hex: t.hex === true, hexLen: t.hexLen, pos: t.pos };
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
                // `[ name: … ]` — a data-shape literal (B4): a field name followed by
                // a shape marker or `:` distinguishes it from a plain list at two
                // tokens of lookahead ([a, b] hits comma; [a] hits rbracket).
                if (this.peek().kind === "ident") {
                    const after = this.peekAt(1).kind;
                    if (after === "colon" || after === "query" || after === "bang" ||
                        (after === "lbracket" && this.peekAt(2).kind === "rbracket")) {
                        return { kind: "schema", shape: this.parseShapeFields(), pos: t.pos };
                    }
                }
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
            default: throw new DeclareError(`expected a value, got '${t.text || t.kind}'`, t.pos);
        }
    }
    /** The fields of a data-shape literal (B4), after the opening `[`:
     *  `name markers : (type | [ nested ])` comma-separated to the `]`.
     *  Markers, in this order when combined: `[]` (array), `?` (optional).
     *  Identity is never declared — a record's `id` field is its identity by
     *  convention (the invisible rule), so `!` refuses pointedly. */
    parseShapeFields() {
        const fields = [];
        while (this.peek().kind !== "rbracket" && this.peek().kind !== "eof") {
            const name = this.expect("ident", "a field name in the schema shape");
            let array = false, optional = false;
            if (this.peek().kind === "lbracket" && this.peekAt(1).kind === "rbracket") {
                this.next();
                this.next();
                array = true;
            }
            if (this.peek().kind === "query") {
                this.next();
                optional = true;
            }
            if (this.peek().kind === "bang") {
                throw new DeclareError(`'${name.text}!' — identity is never declared: a record's 'id' field IS its identity by convention (key = :field overrides an unconventional name); drop the '!'`, this.peek().pos);
            }
            this.expect("colon", `':' after the shape field '${name.text}'`);
            let field;
            if (this.peek().kind === "lbracket") {
                this.next();
                const nested = this.parseShapeFields();
                field = { name: name.text, array, optional, type: null, fields: nested };
            }
            else {
                const ty = this.expect("ident", "a shape field's type — string | number | boolean | any, or a nested [ … ]");
                if (ty.text !== "string" && ty.text !== "number" && ty.text !== "boolean" && ty.text !== "any") {
                    throw new DeclareError(`a shape field's type is string | number | boolean | any, or a nested [ … ] — not '${ty.text}'`, ty.pos);
                }
                field = { name: name.text, array, optional, type: ty.text };
            }
            fields.push(field);
            if (this.peek().kind === "comma")
                this.next();
            else
                break;
        }
        this.expect("rbracket", "']' closing the schema shape");
        return fields;
    }
    /** `:field(.field)*` with selectors (B3, jsonpath-spelling.md): glued
     *  bracket groups carry the RFC 9535 v1 subset — `[2]` index (negative from
     *  the end), `[a:b]`/`[a:b:c]` slice, `[*]` wildcard (`.​*` normalizes to
     *  it), `["name"]`/`['name']` quoted name — and the empty `[]` remains the
     *  replication marker, trailing only (D4 §2: `[]` replicates, `[*]`
     *  selects). Brackets sit hard against the path (`%`-style adjacency);
     *  filters and unions refuse with their gate named. `plan` is attached
     *  exactly when the spelling used anything beyond dot-idents. */
    parsePath(pos) {
        const first = this.expect("ident", "a field name after ':'");
        let path = first.text;
        const plan = [first.text];
        let planful = false;
        let end = first.pos.offset + first.text.length;
        let many = false;
        for (;;) {
            const t = this.peek();
            if (t.kind === "dot") {
                this.next();
                if (this.peek().kind === "star") {
                    const st = this.next();
                    path += "[*]";
                    plan.push({ w: 1 });
                    planful = true;
                    end = st.pos.offset + 1;
                    continue;
                }
                const name = this.expect("ident", "a field name after '.' (an index is written [2])");
                path += "." + name.text;
                plan.push(name.text);
                end = name.pos.offset + name.text.length;
                continue;
            }
            if (t.kind === "lbracket" && t.pos.offset === end) {
                this.next();
                const s = this.peek();
                if (s.kind === "rbracket") {
                    this.next();
                    many = true;
                    break; // the replication marker is trailing by grammar
                }
                if (s.kind === "query") {
                    throw new DeclareError("filter selectors ([?…]) are not in the path subset yet (jsonpath-spelling.md §5) — derive the subset in a Dataset [ contents = { … } ] and bind to that", s.pos);
                }
                if (s.kind === "star") {
                    this.next();
                    path += "[*]";
                    plan.push({ w: 1 });
                }
                else if (s.kind === "string") {
                    this.next();
                    path += `[${JSON.stringify(s.str)}]`;
                    plan.push(s.str);
                }
                else if (s.kind === "number" || s.kind === "colon") {
                    const readInt = () => {
                        if (this.peek().kind !== "number")
                            return null;
                        const nt = this.next();
                        if (!Number.isInteger(nt.num) || nt.hex === true)
                            throw new DeclareError("a path index is a plain integer", nt.pos);
                        return nt.num;
                    };
                    const parts = [readInt()];
                    let colons = 0;
                    while (this.peek().kind === "colon" && colons < 2) {
                        this.next();
                        colons++;
                        parts.push(readInt());
                    }
                    if (colons === 0) {
                        path += `[${parts[0]}]`;
                        plan.push({ i: parts[0] });
                    }
                    else {
                        while (parts.length < 3)
                            parts.push(null);
                        path += `[${parts.map((v) => (v === null ? "" : String(v))).join(":").replace(/:$/, "")}]`;
                        plan.push({ s: parts });
                    }
                }
                else {
                    throw new DeclareError("a path selector is [index], [start:end:step], [*], or ['name']", s.pos);
                }
                if (this.peek().kind === "comma") {
                    throw new DeclareError("union selectors ([a, b]) are not in the path subset (jsonpath-spelling.md §5) — write separate reads, or derive the set in a Dataset [ contents = { … } ]", this.peek().pos);
                }
                const rb = this.expect("rbracket", "']' closing the path selector");
                end = rb.pos.offset + 1;
                planful = true;
                continue;
            }
            break;
        }
        return planful
            ? { kind: "path", path, many, pos, plan }
            : { kind: "path", path, many, pos };
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
    /** At a `script { … }` block — contextual, like every other top-level
     *  keyword: the ident `script` followed by a `{ … }` body. (`script`
     *  followed by anything else is an ordinary component name.) */
    atScript() {
        const t = this.tokens[this.i];
        const u = this.tokens[this.i + 1];
        return t.kind === "ident" && t.text === "script" && u.kind === "code";
    }
    /** `'script' '{' … '}'` — the body is captured raw; TypeScript judges it. */
    parseScript() {
        const kw = this.next(); // 'script'
        const body = this.expect("code", "the script body '{ … }'");
        // A `code` token's `text` is the placeholder "{…}", not the source — the
        // real extent is the captured body plus its two braces, measured from the
        // opening one (the token's own position).
        const end = body.pos.offset + body.str.length + 2;
        return { src: body.str, pos: kw.pos, span: { start: kw.pos.offset, end } };
    }
    /** At an `include [ … ]` directive (composition.md §1) — contextual: the
     *  ident `include` followed by `[`. (`include` followed by anything else is
     *  an ordinary component name, exactly as `class`/`stylesheet` are.) */
    atInclude() {
        const t = this.tokens[this.i];
        const u = this.tokens[this.i + 1];
        return t.kind === "ident" && t.text === "include" && u.kind === "lbracket";
    }
    /** At a `use [ … ]` directive — the dependency KEEP-LIST (composition.md §1c):
     *  contextual, the ident `use` followed by `[`. Names components the app may
     *  construct by a name static analysis can't see (create-by-string, §8), so the
     *  build keeps them. `use` followed by anything else is an ordinary component
     *  name, exactly as `include`/`class`/`stylesheet` are. */
    atUse() {
        const t = this.tokens[this.i];
        const u = this.tokens[this.i + 1];
        return t.kind === "ident" && t.text === "use" && u.kind === "lbracket";
    }
    /** `'use' '[' IDENT ( ',' IDENT )* ','? ']'` — the keep-list: bare component
     *  NAMES (not quoted paths — these are types, like a `class` base). A non-ident
     *  entry is a positioned error. Returns the names; the used-set folds them in. */
    parseUseDirective() {
        this.expect("ident", "'use'");
        this.expect("lbracket", "'['");
        const names = [];
        while (this.peek().kind !== "rbracket" && this.peek().kind !== "eof") {
            const t = this.peek();
            if (t.kind !== "ident") {
                throw new DeclareError("a use entry is a component name", t.pos);
            }
            this.next();
            names.push(t.text);
            if (this.peek().kind === "comma")
                this.next();
            else
                break;
        }
        this.expect("rbracket", "']'");
        return names;
    }
    /** `'include' '[' STRING ( ',' STRING )* ','? ']'` — a top-level directive
     *  whose body is Declare's list grammar restricted to quoted paths. Non-string
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
                throw new DeclareError("an include path is a quoted string", t.pos);
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
    if (p.errors.length > 0)
        throw new DeclareErrors(p.errors);
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
    const uses = [];
    const scripts = [];
    for (;;) {
        if (p.atInclude()) {
            const { refs, span } = p.parseIncludeDirective();
            includes.push(...refs);
            includeSpans.push(span);
        }
        else if (p.atUse())
            uses.push(...p.parseUseDirective());
        else if (p.atScript())
            scripts.push(p.parseScript());
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
    return { classes, stylesheets, styles, fonts, includes, includeSpans, uses, scripts };
}
/** Parse a whole Declare source: `include`s and top-level declarations
 *  (classes, stylesheets, style bundles — in any order), then the root
 *  instance. */
export function parseProgram(source) {
    const p = new Parser(tokenize(source));
    const { classes, stylesheets, styles, fonts, includes, includeSpans, uses, scripts } = parseTopDecls(p);
    const root = p.parseElement();
    p.expect("eof", "end of input");
    if (p.errors.length > 0)
        throw new DeclareErrors(p.errors);
    return { classes, stylesheets, styles, fonts, includes, includeSpans, uses, scripts, root };
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
    if (p.errors.length > 0)
        throw new DeclareErrors(p.errors);
    return decls;
}
//# sourceMappingURL=parser.js.map