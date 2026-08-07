var DeclareMac = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res, err2) => function __init() {
    if (err2) throw err2[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err2 = [e], e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // runtime/dist/errors.js
  var DeclareError, DeclareErrors;
  var init_errors = __esm({
    "runtime/dist/errors.js"() {
      "use strict";
      DeclareError = class extends Error {
        pos;
        rawMessage;
        code;
        hint;
        constructor(message, pos, meta) {
          super(pos ? `${message} (line ${pos.line}, col ${pos.col})` : message);
          this.name = "DeclareError";
          this.rawMessage = message;
          if (pos)
            this.pos = pos;
          if (meta?.code !== void 0)
            this.code = meta.code;
          if (meta?.hint !== void 0)
            this.hint = meta.hint;
        }
      };
      DeclareErrors = class extends DeclareError {
        errors;
        constructor(errors) {
          super(errors.length === 1 ? errors[0].message : `${errors.length} errors:
` + errors.map((e) => `  ${e.message}`).join("\n"));
          this.name = "DeclareErrors";
          this.errors = errors;
        }
      };
    }
  });

  // runtime/dist/diagnostics.js
  function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > 2)
      return 3;
    let prev2 = [];
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
        }
      }
      prev2 = prev;
      prev = cur;
    }
    return prev[b.length];
  }
  function extensionsOf(name, candidates) {
    const lower = name.toLowerCase();
    return candidates.filter((c) => c.toLowerCase() !== lower && c.toLowerCase().startsWith(lower));
  }
  function nearestName(name, candidates, budget) {
    const lower = name.toLowerCase();
    let best = null;
    let bestD = budget === void 0 ? 3 : budget + 1;
    let tie = false;
    for (const c of candidates) {
      const d = editDistance(lower, c.toLowerCase());
      if (d < bestD) {
        best = c;
        bestD = d;
        tie = false;
      } else if (d === bestD)
        tie = true;
    }
    const cap = budget ?? (name.length >= 5 ? 2 : 1);
    return best !== null && !tie && bestD <= cap ? best : null;
  }
  var CODE_PREFIX, code4, BASE, err, Diag, DIAGNOSTIC_CATALOG;
  var init_diagnostics = __esm({
    "runtime/dist/diagnostics.js"() {
      "use strict";
      init_errors();
      CODE_PREFIX = "DECLARE";
      code4 = (n) => `${CODE_PREFIX}${n}`;
      BASE = {
        syntax: code4(1e3),
        structure: code4(2e3),
        type: code4(3e3),
        name: code4(4e3),
        module: code4(5e3),
        typecheck: code4(6e3),
        constraint: code4(7e3)
      };
      err = (code, message, pos, hint) => new DeclareError(message, pos, { code, hint });
      Diag = {
        // 1xxx syntax — the parser throws one at a time; a single family code, the
        // grammar message carrying the specifics.
        syntax: (message, pos) => err(code4(1001), message, pos),
        // 2xxx structure. `unknownComponent` takes the known-component names and
        // appends a calibrated near-miss ("did you mean 'Text'?") — the fix, named
        // (diagnostics.md §4); the rule rides the hint.
        unknownComponent: (tag, pos, candidates = []) => {
          const typo = nearestName(tag, candidates, 1);
          const ext = typo === null ? extensionsOf(tag, candidates) : [];
          if (ext.length > 0) {
            const list = ext.length === 1 ? `'${ext[0]}'` : ext.map((e) => `'${e}'`).join(" or ");
            return err(code4(2001), `unknown component '${tag}' \u2014 did you mean ${list}?`, pos);
          }
          const near = nearestName(tag, candidates);
          return near === null ? err(code4(2001), `unknown component '${tag}'`, pos) : err(code4(2001), `unknown component '${tag}' \u2014 did you mean '${near}'?`, pos, `a tag names a built-in component or a class declared in the program`);
        },
        duplicateName: (message, pos) => err(code4(2002), message, pos),
        misplaced: (message, pos) => err(code4(2003), message, pos),
        namespace: (message, pos) => err(code4(2004), message, pos),
        structure: (message, pos) => err(code4(2e3), message, pos),
        // 3xxx type / value
        typeMismatch: (message, pos) => err(code4(3001), message, pos),
        badPercent: (message, pos) => err(code4(3002), message, pos),
        badDatapath: (message, pos) => err(code4(3003), message, pos),
        setTwice: (message, pos) => err(code4(3004), message, pos),
        // A text field whose written size sits under iOS's 16px focus-zoom line
        // (a WARNING — compile.ts smallFieldWarnings; the composed message names
        // the behavior and the fix, diagnostics.md §4).
        smallField: (message, pos, hint) => err(code4(3005), message, pos, hint),
        type: (message, pos) => err(code4(3e3), message, pos),
        // 4xxx name resolution
        unresolved: (name, scope, pos) => err(code4(4001), `cannot resolve '${name}' \u2014 not a member of ${scope}, a parameter, or a global`, pos),
        shadowing: (message, pos) => err(code4(4002), message, pos),
        // `classroot` reaches the root of the component (class) you are defining, so it
        // is meaningful ONLY inside a class body. `where` names the non-class body the
        // code is actually in ("the App", "a stylesheet", "a style bundle").
        classrootOutsideClass: (where, pos) => err(code4(4003), `'classroot' is the root of a component you define \u2014 valid only inside a class body. This code is in ${where}, not a class. Reach values here by a bare name, 'this', or 'app'.`, pos),
        // A CSS color NAME resolved as a bare identifier inside { } — the name form is
        // a bare-slot literal, not an identifier the { } world knows, so name the 0x form.
        namedColorInExpr: (name, hex, pos) => err(code4(4004), `'${name}' is a named color \u2014 the name form works only in a bare slot; inside { } write it as ${hex}.`, pos),
        // 5xxx module / include
        includeCollision: (message, pos) => err(code4(5001), message, pos),
        missingInclude: (path, pos) => err(code4(5002), `cannot find include "${path}"`, pos),
        strayRoot: (message, pos) => err(code4(5003), message, pos),
        module: (message, pos) => err(code4(5e3), message, pos),
        // 6xxx typecheck (tsc over a { } body). `tsCode` (e.g. 2322) rides in the
        // hint so the Declare message stays clean but the TS origin is recoverable.
        typeError: (message, pos, tsCode) => err(code4(6001), message, pos, `TypeScript ${tsCode}`),
        // 7xxx constraint — the dependency extractor met a { } constraint it cannot
        // statically analyze (a dynamic target/cardinality, or an unresolved call).
        // The message is composed at the call site and NAMES the rewrite that makes it
        // analyzable (diagnostics.md §4), so it rides the family code with the
        // specifics in `message`.
        residue: (message, pos) => err(code4(7001), message, pos),
        constraint: (message, pos) => err(code4(7e3), message, pos),
        /** Escape hatch: a fully custom (code, message) for a site that fits no
         *  family yet. Prefer a named factory. */
        code: (code, message, pos, hint) => err(code, message, pos, hint)
      };
      DIAGNOSTIC_CATALOG = [
        { code: code4(1001), phase: "syntax", summary: "the parser rejected a token or shape" },
        { code: code4(2e3), phase: "structure", summary: "structural error (unclassified)" },
        { code: code4(2001), phase: "structure", summary: "unknown component tag" },
        { code: code4(2002), phase: "structure", summary: "a name is declared more than once" },
        { code: code4(2003), phase: "structure", summary: "a member is placed where its node-kind forbids it" },
        { code: code4(2004), phase: "structure", summary: "a name violates the member namespace" },
        { code: code4(3e3), phase: "type", summary: "type/value error (unclassified)" },
        { code: code4(3001), phase: "type", summary: "a value does not fit its slot's type" },
        { code: code4(3002), phase: "type", summary: "a percent with no axis to resolve against" },
        { code: code4(3003), phase: "type", summary: "a malformed datapath" },
        { code: code4(3004), phase: "type", summary: "an attribute is set twice" },
        { code: code4(3005), phase: "type", summary: "a text field's size sits under the iOS focus-zoom line (warning)" },
        { code: code4(4e3), phase: "name", summary: "name-resolution error (unclassified)" },
        { code: code4(4001), phase: "name", summary: "a bare name resolves to nothing in scope" },
        { code: code4(4002), phase: "name", summary: "a bare name shadows an outer member (warning)" },
        { code: code4(5e3), phase: "module", summary: "include/module error (unclassified)" },
        { code: code4(5001), phase: "module", summary: "two included files declare the same class" },
        { code: code4(5002), phase: "module", summary: "an include path cannot be found" },
        { code: code4(5003), phase: "module", summary: "an included library has a tree root" },
        { code: code4(6e3), phase: "typecheck", summary: "typecheck error (unclassified)" },
        { code: code4(6001), phase: "typecheck", summary: "a { } body fails the TypeScript typecheck" },
        { code: code4(7e3), phase: "constraint", summary: "constraint dependency error (unclassified)" },
        { code: code4(7001), phase: "constraint", summary: "a { } constraint cannot be statically analyzed (residue)" }
      ];
    }
  });

  // runtime/dist/parser.js
  function dedent(raw) {
    let s = raw.replace(/\r\n?/g, "\n");
    if (s[0] === "\n")
      s = s.slice(1);
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
      } else {
        col++;
      }
      i++;
    };
    const skipString = (quote, at) => {
      advance();
      while (i < src.length && src[i] !== quote && src[i] !== "\n") {
        if (src[i] === "\\")
          advance();
        advance();
      }
      if (src[i] !== quote)
        throw new DeclareError("unterminated string in { } expression", at);
      advance();
    };
    const skipTemplate = (at) => {
      advance();
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
      advance();
    };
    const skipBraces = (at) => {
      let depth = 1;
      while (i < src.length && depth > 0) {
        const ch = src[i];
        if (ch === "{") {
          depth++;
          advance();
        } else if (ch === "}") {
          depth--;
          advance();
        } else if (ch === '"' || ch === "'")
          skipString(ch, at);
        else if (ch === "`")
          skipTemplate(at);
        else if (ch === "/" && src[i + 1] === "/") {
          while (i < src.length && src[i] !== "\n")
            advance();
        } else if (ch === "/" && src[i + 1] === "*") {
          advance();
          advance();
          while (i < src.length && !(src[i] === "*" && src[i + 1] === "/"))
            advance();
          if (i >= src.length)
            throw new DeclareError("unterminated comment in { } expression", at);
          advance();
          advance();
        } else
          advance();
      }
      if (depth > 0)
        throw new DeclareError("unterminated { } expression", at);
    };
    while (i < src.length) {
      const c = src[i];
      if (c === " " || c === "	" || c === "\r" || c === "\n") {
        advance();
        continue;
      }
      if (c === "/" && src[i + 1] === "/") {
        while (i < src.length && src[i] !== "\n")
          advance();
        continue;
      }
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
      if (c === "<" && src[i + 1] === "-" && src[i + 2] === ">") {
        advance();
        advance();
        advance();
        tokens.push({ kind: "bindtwo", text: "<->", pos: start });
        continue;
      }
      if (c === "<" && src[i + 1] === "-") {
        advance();
        advance();
        tokens.push({ kind: "subfrom", text: "<-", pos: start });
        continue;
      }
      const punct = {
        "[": "lbracket",
        "]": "rbracket",
        "(": "lparen",
        ")": "rparen",
        "=": "eq",
        ",": "comma",
        ":": "colon",
        ".": "dot",
        "*": "star",
        "!": "bang"
      };
      if (punct[c]) {
        advance();
        tokens.push({ kind: punct[c], text: c, pos: start });
        continue;
      }
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
      if (c === '"' || c === "'") {
        const quote = c;
        advance();
        let str = "";
        while (i < src.length && src[i] !== quote) {
          if (src[i] === "\n") {
            throw new DeclareError('a quoted string ends at its line \u2014 for multi-line text use a """\u2026""" block, or \\n for a literal newline', start);
          }
          if (src[i] === "\\") {
            advance();
            const e = src[i];
            str += e === "n" ? "\n" : e === "t" ? "	" : e;
            advance();
          } else {
            str += src[i];
            advance();
          }
        }
        if (i >= src.length)
          throw new DeclareError("unterminated string", start);
        advance();
        tokens.push({ kind: "string", text: str, pos: start, str });
        continue;
      }
      if (c === "{") {
        advance();
        const from = i;
        skipBraces(start);
        tokens.push({ kind: "code", text: "{\u2026}", pos: start, str: src.slice(from, i - 1) });
        continue;
      }
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
      if (isDigit(c) || c === "-" && isDigit(src[i + 1])) {
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
          advance();
          tokens.push({ kind: "percent", text: text + "%", pos: start, num: parseFloat(text) });
          continue;
        }
        tokens.push({ kind: "number", text, pos: start, num: parseFloat(text) });
        continue;
      }
      if (isIdentStart(c)) {
        let name = "";
        while (i < src.length && isIdentPart(src[i])) {
          name += src[i];
          advance();
        }
        tokens.push({ kind: "ident", text: name, pos: start });
        continue;
      }
      if (c === "?") {
        advance();
        tokens.push({ kind: "query", text: "?", pos: start });
        continue;
      }
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
  function parseTopDecls(p) {
    const classes = [];
    const stylesheets = [];
    const styles = [];
    const fonts = [];
    const includes = [];
    const includeSpans = [];
    const uses = [];
    const scripts = [];
    for (; ; ) {
      if (p.atInclude()) {
        const { refs, span } = p.parseIncludeDirective();
        includes.push(...refs);
        includeSpans.push(span);
      } else if (p.atUse())
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
  function parseProgram(source) {
    const p = new Parser(tokenize(source));
    const before = parseTopDecls(p);
    const root = p.parseElement();
    const after = parseTopDecls(p);
    const classes = [...before.classes, ...after.classes];
    const stylesheets = [...before.stylesheets, ...after.stylesheets];
    const styles = [...before.styles, ...after.styles];
    const fonts = [...before.fonts, ...after.fonts];
    const includes = [...before.includes, ...after.includes];
    const includeSpans = [...before.includeSpans, ...after.includeSpans];
    const uses = [...before.uses, ...after.uses];
    const scripts = [...before.scripts, ...after.scripts];
    p.expect("eof", "end of input");
    if (p.errors.length > 0)
      throw new DeclareErrors(p.errors);
    return { classes, stylesheets, styles, fonts, includes, includeSpans, uses, scripts, root };
  }
  function parseLibrary(source) {
    const p = new Parser(tokenize(source));
    const decls = parseTopDecls(p);
    if (p.peek().kind !== "eof") {
      throw Diag.strayRoot("an included file is a library of definitions \u2014 it declares classes, stylesheets, and styles, not an App/root", p.peek().pos);
    }
    if (p.errors.length > 0)
      throw new DeclareErrors(p.errors);
    return decls;
  }
  var isDigit, isIdentStart, isIdentPart, isHex, Parser;
  var init_parser = __esm({
    "runtime/dist/parser.js"() {
      "use strict";
      init_errors();
      init_diagnostics();
      isDigit = (c) => c >= "0" && c <= "9";
      isIdentStart = (c) => c >= "a" && c <= "z" || c >= "A" && c <= "Z" || c === "_";
      isIdentPart = (c) => isIdentStart(c) || isDigit(c);
      isHex = (c) => isDigit(c) || c >= "a" && c <= "f" || c >= "A" && c <= "F";
      Parser = class {
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
        peek() {
          return this.tokens[this.i];
        }
        peekAt(ahead) {
          return this.tokens[Math.min(this.i + ahead, this.tokens.length - 1)];
        }
        next() {
          return this.tokens[this.i++];
        }
        expect(kind, what) {
          const t = this.tokens[this.i];
          if (t.kind !== kind) {
            const err2 = new DeclareError(`expected ${what}, got '${t.text || t.kind}'`, t.pos);
            throw this.errors.length > 0 ? new DeclareErrors([...this.errors, err2]) : err2;
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
            let text2 = "(";
            this.next();
            while (this.peek().kind !== "rparen" && this.peek().kind !== "eof") {
              text2 += this.expect("ident", "a parameter name").text;
              if (this.peek().kind === "colon") {
                this.next();
                text2 += ": " + this.parseTypeRef("a parameter type name").text;
              }
              if (this.peek().kind === "comma") {
                this.next();
                text2 += ", ";
              } else
                break;
            }
            this.expect("rparen", "')'");
            text2 += ")";
            text2 += this.peek().kind === "arrow" ? (this.next(), " -> " + this.parseTypeRef("a return type name").text) : " -> void";
            if (this.peek().kind === "query") {
              this.next();
              text2 += "?";
            }
            return { text: text2, pos: open.pos };
          }
          const name = this.expect("ident", what);
          let text = name.text;
          let end = name.pos.offset + name.text.length;
          while (this.peek().kind === "lbracket" && this.peekAt(1).kind === "rbracket" && this.peek().pos.offset === end) {
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
          let base2 = "Node";
          let basePos = name.pos;
          const ext = this.peek();
          if (ext.kind === "ident" && ext.text === "extends") {
            this.next();
            const b = this.expect("ident", "the base component's name");
            base2 = b.text;
            basePos = b.pos;
          }
          const body = { tag: name.text, name: null, attrs: [], decls: [], methods: [], children: [], pos: name.pos };
          this.expect("lbracket", "'['");
          this.parseMembers(body);
          this.expect("rbracket", "']'");
          return { name: name.text, base: base2, basePos, body, pos: kw.pos };
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
            let prevailing = false;
            let readOnly = false;
            const declPos = name.pos;
            if ((name.text === "prevailing" || name.text === "readonly") && this.peek().kind === "ident" && this.peekAt(1).kind === "colon") {
              if (name.text === "readonly")
                readOnly = true;
              else
                prevailing = true;
              name = this.next();
            }
            if (this.peek().kind === "dot") {
              this.errors.push(new DeclareError(`'${name.text}.\u2026' \u2014 a member sets this element's OWN attributes, never a child's. Write the attribute on '${name.text}' itself, usually as a { } constraint reading the state or flag that drives it`, name.pos));
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
            } else if (this.peek().kind === "bindtwo") {
              this.next();
              const bv = this.parseLiteral();
              if (bv.kind !== "path" && bv.kind !== "code") {
                this.errors.push(new DeclareError(`'${name.text} <-> \u2026' binds a DATAPATH \u2014 write a :path (${name.text} <-> :field), or a { } expression yielding a field NAME. To wire an attribute to another attribute, derive down with a { } constraint and deliver up in an onInput() handler`, bv.pos));
                while (this.peek().kind === "dot") {
                  this.next();
                  if (this.peek().kind === "ident")
                    this.next();
                }
              } else {
                el.attrs.push({ name: name.text, value: bv, pos: name.pos, bind: "two" });
              }
            } else if (this.peek().kind === "colon") {
              this.next();
              if (this.peek().kind === "lbracket") {
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
                  throw new DeclareError(`'${readOnly ? "readonly" : "prevailing"}' marks an attribute declaration \u2014 a child instance cannot carry it`, declPos);
                }
                const child = { tag: type.text, name: name.text, attrs: [], decls: [], methods: [], children: [], pos: name.pos };
                this.next();
                this.parseMembers(child);
                this.expect("rbracket", "']'");
                if (this.peek().kind === "code") {
                  const body = this.next();
                  child.raw = { src: body.str, pos: body.pos };
                }
                el.children.push(child);
              } else if (this.peek().kind === "code") {
                if (prevailing || readOnly) {
                  throw new DeclareError(`'${readOnly ? "readonly" : "prevailing"}' marks an attribute declaration \u2014 a child instance cannot carry it`, declPos);
                }
                const body = this.next();
                el.children.push({
                  tag: type.text,
                  name: name.text,
                  attrs: [],
                  decls: [],
                  methods: [],
                  children: [],
                  raw: { src: body.str, pos: body.pos },
                  pos: name.pos
                });
              } else {
                let def = null;
                if (this.peek().kind === "eq") {
                  this.next();
                  def = this.parseLiteral();
                }
                el.decls.push({ name: name.text, type: type.text, typePos: type.pos, def, prevailing, readOnly, pos: declPos });
              }
            } else if (this.peek().kind === "lparen") {
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
                    } else
                      ptype = tr.text;
                  } else
                    this.errors.push(new DeclareError(`'${pname}:' needs a type name \u2014 write '${pname}: number' (a primitive or a component class), or drop the ':' for an untyped parameter`, this.peek().pos));
                }
                params.push(ptype === void 0 ? { name: pname } : pnullable ? { name: pname, type: ptype, typePos: ptypePos, nullable: true } : { name: pname, type: ptype, typePos: ptypePos });
                if (this.peek().kind === "comma")
                  this.next();
                else
                  break;
              }
              this.expect("rparen", "')'");
              let returns, returnsPos, returnsNullable = false;
              if (this.peek().kind === "arrow" || this.peek().kind === "colon") {
                const marker = this.next();
                if (this.peek().kind === "ident" || this.peek().kind === "lparen") {
                  const tr = this.parseTypeRef("a return type name");
                  returnsPos = tr.pos;
                  if (tr.text.endsWith("?")) {
                    returns = tr.text.slice(0, -1);
                    returnsNullable = true;
                  } else
                    returns = tr.text;
                } else
                  this.errors.push(new DeclareError(`'${marker.text}' needs a return type name \u2014 write '${name.text}(\u2026) -> number { \u2026 }', or drop the '${marker.text}' for a method that returns nothing`, this.peek().pos));
              }
              if (this.peek().kind === "subfrom") {
                const arrow = this.peek();
                this.next();
                const src = this.peek().kind === "ident" ? this.peek().text : "Source";
                const sig = params.map((prm) => prm.type === void 0 ? prm.name : `${prm.name}: ${prm.type}`).join(", ");
                throw new DeclareError(`'<-' subscriptions were removed \u2014 a runtime service is a component member now: write '${src} [ ${name.text}(${sig}) { \u2026 } ]' as a child, in place of '${name.text}(${sig}) <- ${src} { \u2026 }'`, arrow.pos);
              }
              const body = this.peek();
              if (body.kind !== "code") {
                throw new DeclareError(`expected the method body '{ \u2026 }', got '${body.text || body.kind}'`, body.pos);
              }
              this.next();
              el.methods.push(returns === void 0 ? { name: name.text, params, body: body.str, pos: name.pos, bodyPos: body.pos } : { name: name.text, params, returns, returnsPos, returnsNullable, body: body.str, pos: name.pos, bodyPos: body.pos });
            } else {
              const child = { tag: name.text, name: null, attrs: [], decls: [], methods: [], children: [], pos: name.pos };
              if (this.peek().kind === "lbracket") {
                this.next();
                this.parseMembers(child);
                this.expect("rbracket", "']'");
              } else if (this.peek().kind === "code") {
                const body = this.next();
                child.raw = { src: body.str, pos: body.pos };
              }
              el.children.push(child);
            }
            if (this.peek().kind === "comma") {
              this.next();
              continue;
            }
            if (this.peek().kind !== "rbracket" && this.peek().kind !== "eof") {
              this.errors.push(new DeclareError(`members are separated by commas \u2014 add ',' before '${this.peek().text || this.peek().kind}'`, this.peek().pos));
            }
          }
        }
        parseLiteral() {
          const t = this.next();
          switch (t.kind) {
            case "number":
              return { kind: "number", value: t.num, hex: t.hex === true, hexLen: t.hexLen, pos: t.pos };
            case "percent":
              return { kind: "percent", value: t.num, pos: t.pos };
            case "string":
              return { kind: "string", value: t.str, pos: t.pos };
            case "hexColor":
              return { kind: "hexColor", raw: t.text, pos: t.pos };
            case "ident":
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
            case "code":
              return { kind: "code", src: t.str, pos: t.pos };
            case "colon":
              return this.parsePath(t.pos);
            case "lbracket": {
              if (this.peek().kind === "ident") {
                const after = this.peekAt(1).kind;
                if (after === "colon" || after === "query" || after === "bang" || after === "lbracket" && this.peekAt(2).kind === "rbracket") {
                  return { kind: "schema", shape: this.parseShapeFields(), pos: t.pos };
                }
              }
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
            default:
              throw new DeclareError(`expected a value, got '${t.text || t.kind}'`, t.pos);
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
              throw new DeclareError(`'${name.text}!' \u2014 identity is never declared: a record's 'id' field IS its identity by convention (key = :field overrides an unconventional name); drop the '!'`, this.peek().pos);
            }
            this.expect("colon", `':' after the shape field '${name.text}'`);
            let field;
            if (this.peek().kind === "lbracket") {
              this.next();
              const nested = this.parseShapeFields();
              field = { name: name.text, array, optional, type: null, fields: nested };
            } else {
              const ty = this.expect("ident", "a shape field's type \u2014 string | number | boolean | any, or a nested [ \u2026 ]");
              if (ty.text !== "string" && ty.text !== "number" && ty.text !== "boolean" && ty.text !== "any") {
                throw new DeclareError(`a shape field's type is string | number | boolean | any, or a nested [ \u2026 ] \u2014 not '${ty.text}'`, ty.pos);
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
          for (; ; ) {
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
                break;
              }
              if (s.kind === "query") {
                throw new DeclareError("filter selectors ([?\u2026]) are not in the path subset yet (jsonpath-spelling.md \xA75) \u2014 derive the subset in a Dataset [ contents = { \u2026 } ] and bind to that", s.pos);
              }
              if (s.kind === "star") {
                this.next();
                path += "[*]";
                plan.push({ w: 1 });
              } else if (s.kind === "string") {
                this.next();
                path += `[${JSON.stringify(s.str)}]`;
                plan.push(s.str);
              } else if (s.kind === "number" || s.kind === "colon") {
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
                } else {
                  while (parts.length < 3)
                    parts.push(null);
                  path += `[${parts.map((v) => v === null ? "" : String(v)).join(":").replace(/:$/, "")}]`;
                  plan.push({ s: parts });
                }
              } else {
                throw new DeclareError("a path selector is [index], [start:end:step], [*], or ['name']", s.pos);
              }
              if (this.peek().kind === "comma") {
                throw new DeclareError("union selectors ([a, b]) are not in the path subset (jsonpath-spelling.md \xA75) \u2014 write separate reads, or derive the set in a Dataset [ contents = { \u2026 } ]", this.peek().pos);
              }
              const rb = this.expect("rbracket", "']' closing the path selector");
              end = rb.pos.offset + 1;
              planful = true;
              continue;
            }
            break;
          }
          return planful ? { kind: "path", path, many, pos, plan } : { kind: "path", path, many, pos };
        }
        atClass() {
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
          const kw = this.next();
          const body = this.expect("code", "the script body '{ \u2026 }'");
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
      };
    }
  });

  // runtime/dist/css-colors.js
  var CSS_COLORS;
  var init_css_colors = __esm({
    "runtime/dist/css-colors.js"() {
      "use strict";
      CSS_COLORS = {
        aliceblue: 15792383,
        antiquewhite: 16444375,
        aqua: 65535,
        aquamarine: 8388564,
        azure: 15794175,
        beige: 16119260,
        bisque: 16770244,
        black: 0,
        blanchedalmond: 16772045,
        blue: 255,
        blueviolet: 9055202,
        brown: 10824234,
        burlywood: 14596231,
        cadetblue: 6266528,
        chartreuse: 8388352,
        chocolate: 13789470,
        coral: 16744272,
        cornflowerblue: 6591981,
        cornsilk: 16775388,
        crimson: 14423100,
        cyan: 65535,
        darkblue: 139,
        darkcyan: 35723,
        darkgoldenrod: 12092939,
        darkgray: 11119017,
        darkgreen: 25600,
        darkgrey: 11119017,
        darkkhaki: 12433259,
        darkmagenta: 9109643,
        darkolivegreen: 5597999,
        darkorange: 16747520,
        darkorchid: 10040012,
        darkred: 9109504,
        darksalmon: 15308410,
        darkseagreen: 9419919,
        darkslateblue: 4734347,
        darkslategray: 3100495,
        darkslategrey: 3100495,
        darkturquoise: 52945,
        darkviolet: 9699539,
        deeppink: 16716947,
        deepskyblue: 49151,
        dimgray: 6908265,
        dimgrey: 6908265,
        dodgerblue: 2003199,
        firebrick: 11674146,
        floralwhite: 16775920,
        forestgreen: 2263842,
        fuchsia: 16711935,
        gainsboro: 14474460,
        ghostwhite: 16316671,
        gold: 16766720,
        goldenrod: 14329120,
        gray: 8421504,
        green: 32768,
        greenyellow: 11403055,
        grey: 8421504,
        honeydew: 15794160,
        hotpink: 16738740,
        indianred: 13458524,
        indigo: 4915330,
        ivory: 16777200,
        khaki: 15787660,
        lavender: 15132410,
        lavenderblush: 16773365,
        lawngreen: 8190976,
        lemonchiffon: 16775885,
        lightblue: 11393254,
        lightcoral: 15761536,
        lightcyan: 14745599,
        lightgoldenrodyellow: 16448210,
        lightgray: 13882323,
        lightgreen: 9498256,
        lightgrey: 13882323,
        lightpink: 16758465,
        lightsalmon: 16752762,
        lightseagreen: 2142890,
        lightskyblue: 8900346,
        lightslategray: 7833753,
        lightslategrey: 7833753,
        lightsteelblue: 11584734,
        lightyellow: 16777184,
        lime: 65280,
        limegreen: 3329330,
        linen: 16445670,
        magenta: 16711935,
        maroon: 8388608,
        mediumaquamarine: 6737322,
        mediumblue: 205,
        mediumorchid: 12211667,
        mediumpurple: 9662683,
        mediumseagreen: 3978097,
        mediumslateblue: 8087790,
        mediumspringgreen: 64154,
        mediumturquoise: 4772300,
        mediumvioletred: 13047173,
        midnightblue: 1644912,
        mintcream: 16121850,
        mistyrose: 16770273,
        moccasin: 16770229,
        navajowhite: 16768685,
        navy: 128,
        oldlace: 16643558,
        olive: 8421376,
        olivedrab: 7048739,
        orange: 16753920,
        orangered: 16729344,
        orchid: 14315734,
        palegoldenrod: 15657130,
        palegreen: 10025880,
        paleturquoise: 11529966,
        palevioletred: 14381203,
        papayawhip: 16773077,
        peachpuff: 16767673,
        peru: 13468991,
        pink: 16761035,
        plum: 14524637,
        powderblue: 11591910,
        purple: 8388736,
        rebeccapurple: 6697881,
        red: 16711680,
        rosybrown: 12357519,
        royalblue: 4286945,
        saddlebrown: 9127187,
        salmon: 16416882,
        sandybrown: 16032864,
        seagreen: 3050327,
        seashell: 16774638,
        sienna: 10506797,
        silver: 12632256,
        skyblue: 8900331,
        slateblue: 6970061,
        slategray: 7372944,
        slategrey: 7372944,
        snow: 16775930,
        springgreen: 65407,
        steelblue: 4620980,
        tan: 13808780,
        teal: 32896,
        thistle: 14204888,
        tomato: 16737095,
        turquoise: 4251856,
        violet: 15631086,
        wheat: 16113331,
        white: 16777215,
        whitesmoke: 16119285,
        yellow: 16776960,
        yellowgreen: 10145074
      };
    }
  });

  // runtime/dist/shape.js
  function validatePathData(d) {
    let i = 0;
    const skip = () => {
      while (i < d.length && (d[i] === " " || d[i] === "," || d[i] === "	" || d[i] === "\n" || d[i] === "\r"))
        i++;
    };
    skip();
    if (i >= d.length)
      return "an empty path";
    if (d[i].toUpperCase() !== "M")
      return `a path starts with M or m, not '${d[i]}'`;
    while (i < d.length) {
      const cmd = d[i];
      const arity = Object.hasOwn(ARITY, cmd.toUpperCase()) ? ARITY[cmd.toUpperCase()] : void 0;
      if (arity === void 0)
        return `'${cmd}' is not a path command (character ${i + 1})`;
      i++;
      skip();
      if (arity === 0)
        continue;
      do {
        for (let k = 0; k < arity; k++) {
          skip();
          const m = NUMBER.exec(d.slice(i));
          if (m === null)
            return `'${cmd}' expects ${arity} number${arity > 1 ? "s" : ""} per segment (character ${i + 1})`;
          i += m[0].length;
        }
        skip();
      } while (i < d.length && (d[i] === "+" || d[i] === "-" || d[i] === "." || d[i] >= "0" && d[i] <= "9"));
    }
    return null;
  }
  var ARITY, NUMBER;
  var init_shape = __esm({
    "runtime/dist/shape.js"() {
      "use strict";
      ARITY = {
        M: 2,
        L: 2,
        H: 1,
        V: 1,
        C: 6,
        S: 4,
        Q: 4,
        T: 2,
        A: 7,
        Z: 0
      };
      NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/;
    }
  });

  // runtime/dist/animate.js
  function polyIn(fam, t) {
    switch (fam) {
      case "linear":
        return t;
      case "sine":
        return 1 - Math.cos(t * Math.PI / 2);
      case "quad":
        return t * t;
      case "cubic":
        return t * t * t;
      case "quart":
        return t * t * t * t;
      case "quint":
        return t * t * t * t * t;
      case "expo":
        return t === 0 ? 0 : Math.pow(2, 10 * (t - 1));
      case "circ":
        return 1 - Math.sqrt(1 - t * t);
    }
  }
  function directed(f, dir, t) {
    if (dir === "in")
      return f(t);
    if (dir === "out")
      return 1 - f(1 - t);
    return t < 0.5 ? f(2 * t) / 2 : 1 - f(2 * (1 - t)) / 2;
  }
  function bezier(x1, y1, x2, y2, x) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (u2) => ((ax * u2 + bx) * u2 + cx) * u2;
    const sy = (u2) => ((ay * u2 + by) * u2 + cy) * u2;
    const dsx = (u2) => (3 * ax * u2 + 2 * bx) * u2 + cx;
    let u = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(u) - x;
      if (Math.abs(e) < 1e-6)
        return sy(u);
      const d = dsx(u);
      if (Math.abs(d) < 1e-6)
        break;
      u -= e / d;
    }
    let lo = 0, hi = 1;
    u = x;
    for (let i = 0; i < 24 && lo < hi; i++) {
      const e = sx(u);
      if (Math.abs(e - x) < 1e-6)
        break;
      if (x > e)
        lo = u;
      else
        hi = u;
      u = (lo + hi) / 2;
    }
    return sy(u);
  }
  function laszlo(beginPoleDelta, endPoleDelta, t, delta) {
    if (delta === 0)
      return t;
    const cval = 0, to = delta, dir = 1;
    let beginPole, endPole;
    if (cval < to) {
      beginPole = cval - dir * beginPoleDelta;
      endPole = to + dir * endPoleDelta;
    } else {
      beginPole = cval + dir * beginPoleDelta;
      endPole = to - dir * endPoleDelta;
    }
    const kN = (beginPole - to) * (cval - endPole);
    const kD = (beginPole - cval) * (to - endPole);
    const primaryK = kD !== 0 ? Math.abs(kN / kD) : 1;
    const K = Math.exp(t * Math.log(primaryK));
    let value = cval;
    if (K !== 1) {
      const num = beginPole * endPole * (1 - K);
      const den = endPole - K * beginPole;
      if (den !== 0)
        value = num / den;
    }
    return value / delta;
  }
  function sample(motion, t, delta = 0) {
    if (t <= 0)
      return 0;
    if (t >= 1)
      return 1;
    switch (motion.k) {
      case "poly":
        return directed((u) => polyIn(motion.fam, u), motion.dir, t);
      case "bezier":
        return bezier(motion.x1, motion.y1, motion.x2, motion.y2, t);
      case "steps":
        return (motion.jump === "end" ? Math.floor(t * motion.n) : Math.ceil(t * motion.n)) / motion.n;
      case "back":
        return directed((u) => backIn(motion.overshoot, u), motion.dir, t);
      case "laszlo":
        return laszlo(motion.beginPole, motion.endPole, t, delta);
    }
  }
  function motionToken(name) {
    if (name === "linear")
      return { k: "poly", fam: "linear", dir: "in" };
    if (name === "ease")
      return { k: "bezier", x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };
    if (name === "easeIn")
      return { k: "poly", fam: "quad", dir: "in" };
    if (name === "easeOut")
      return { k: "poly", fam: "quad", dir: "out" };
    if (name === "easeBoth")
      return { k: "poly", fam: "quad", dir: "both" };
    for (const fam of FAMILIES)
      for (const [suf, dir] of DIR_SUFFIX)
        if (name === fam + suf)
          return { k: "poly", fam, dir };
    for (const [suf, dir] of DIR_SUFFIX)
      if (name === "back" + suf)
        return { k: "back", dir, overshoot: BACK_DEFAULT };
    if (name === "laszloIn")
      return { k: "laszlo", beginPole: 0.25, endPole: 15 };
    if (name === "laszloOut")
      return { k: "laszlo", beginPole: 100, endPole: 0.25 };
    if (name === "laszloBoth")
      return { k: "laszlo", beginPole: 0.25, endPole: 0.25 };
    return null;
  }
  var DEFAULT_MOTION, BACK_DEFAULT, backIn, DIR_SUFFIX, FAMILIES, MOTION_TOKENS, browserScheduler, Clock, sharedClock;
  var init_animate = __esm({
    "runtime/dist/animate.js"() {
      "use strict";
      DEFAULT_MOTION = { k: "poly", fam: "quad", dir: "both" };
      BACK_DEFAULT = 1.70158;
      backIn = (s, t) => (s + 1) * t * t * t - s * t * t;
      DIR_SUFFIX = [["In", "in"], ["Out", "out"], ["Both", "both"]];
      FAMILIES = ["sine", "quad", "cubic", "quart", "quint", "expo", "circ"];
      MOTION_TOKENS = [
        "linear",
        "ease",
        "easeIn",
        "easeOut",
        "easeBoth",
        ...FAMILIES.flatMap((f) => DIR_SUFFIX.map(([suf]) => f + suf)),
        ...DIR_SUFFIX.map(([suf]) => "back" + suf),
        "laszloIn",
        "laszloOut",
        "laszloBoth"
      ];
      browserScheduler = {
        now: () => typeof performance !== "undefined" ? performance.now() : Date.now(),
        request: (cb) => typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame(cb) : 0,
        cancel: (h) => {
          if (typeof cancelAnimationFrame !== "undefined")
            cancelAnimationFrame(h);
        }
      };
      Clock = class {
        tickers = /* @__PURE__ */ new Set();
        /** The pending frame handle; null = no loop running (idle). */
        handle = null;
        sched;
        /** True only inside a frame's tick loop. A ticker registered re-entrantly
         *  (an onStop that start()s another animator) must NOT schedule its own
         *  frame — the loop's own re-arm below already covers it — or two frames
         *  would run per browser frame from then on. */
        ticking = false;
        constructor(sched = browserScheduler) {
          this.sched = sched;
          this.frame = this.frame.bind(this);
        }
        /** The scheduler's current timestamp — the same value the next frame's
         *  `tick(now)` will be measured against. Lets a ticker seed its own baseline
         *  at ENROLL time, so its first tick integrates a real dt instead of spending
         *  the frame establishing a baseline (under a hand-cranked clock that
         *  baseline frame read as "the animation never ran" — two agents,
         *  independently). */
        now() {
          return this.sched.now();
        }
        /** Register a ticker and, if the clock was idle, start the frame loop.
         *  Idempotent on an already-registered ticker. */
        add(t) {
          this.tickers.add(t);
          if (this.handle === null && !this.ticking)
            this.handle = this.sched.request(this.frame);
        }
        /** Drop a ticker (an explicit `stop()`); if it was the last, go idle. A
         *  ticker that finishes naturally is dropped by `frame` instead. */
        remove(t) {
          this.tickers.delete(t);
          if (this.tickers.size === 0 && this.handle !== null) {
            this.sched.cancel(this.handle);
            this.handle = null;
          }
        }
        /** Whether the frame loop is live — the observable idle-zero state, for the
         *  runtime's assertions and the perceptual "idle is still zero rAF" test. */
        get running() {
          return this.handle !== null;
        }
        /** Whether any motion is in flight — what `settleMotion` (inspect.ts) polls. */
        get busy() {
          return this.tickers.size > 0;
        }
        /** Any FINITE motion in flight — the settle predicate (busy minus the
         *  perpetual tickers; see Ticker.perpetual). */
        get settling() {
          for (const t of this.tickers)
            if (t.perpetual !== true)
              return true;
          return false;
        }
        /** Swap the frame source IN PLACE, keeping enrolled tickers — how the driven
         *  clock (inspect.ts: `step`/`settleMotion`, verify-and-evals.md §2.3) takes
         *  over from rAF and hands back. Cancels any pending frame on the old
         *  scheduler and re-arms on the new one if motion is in flight. The two
         *  timelines share no origin, so every in-flight ticker's anchors are
         *  REBASED by the swap's offset — a handover is a change of frame source,
         *  never a jump in any motion's elapsed time (in either direction: the old
         *  skew ate the driven clock's first steps as negative dt, and a long
         *  settleMotion left `auto()` frozen until real time caught back up). */
        setScheduler(s) {
          if (this.handle !== null) {
            this.sched.cancel(this.handle);
            this.handle = null;
          }
          const delta = s.now() - this.sched.now();
          for (const t of this.tickers)
            t.rebase?.(delta);
          this.sched = s;
          if (this.tickers.size > 0 && !this.ticking)
            this.handle = this.sched.request(this.frame);
        }
        /** One frame: read `now` once, tick every ticker with that same value,
         *  drop the finished, then either re-arm for the next frame or go idle. A
         *  ticker added *during* this frame's ticks (an onStop that starts another)
         *  is included in the next frame, not this one — iteration is over a
         *  snapshot so the same-`now` invariant holds for exactly this frame's set. */
        frame(now) {
          this.handle = null;
          this.ticking = true;
          try {
            const running = [...this.tickers];
            for (const t of running) {
              if (!t.tick(now))
                this.tickers.delete(t);
            }
          } finally {
            this.ticking = false;
          }
          if (this.tickers.size > 0)
            this.handle = this.sched.request(this.frame);
        }
      };
      sharedClock = new Clock();
    }
  });

  // runtime/dist/themes-data.js
  var Cupertino, CupertinoDark, MountainView, MountainViewDark, Redmond, RedmondDark, SanFrancisco, SanFranciscoDark, THEME_RECORDS;
  var init_themes_data = __esm({
    "runtime/dist/themes-data.js"() {
      "use strict";
      Cupertino = /* @__PURE__ */ Object.freeze({
        bg: 16119287,
        surface: 16777215,
        line: 13027016,
        text: 1907999,
        textMuted: 7237235,
        textFaint: 11187390,
        accent: 31487,
        accentText: 16777215,
        control: 16777215,
        controlHover: 15987699,
        controlPressed: 15066597,
        controlSelected: 15266046,
        depth: 1,
        focusRing: true,
        controlRadius: 6,
        buttonRadius: 6,
        fieldRadius: 6,
        fieldPadding: 7,
        buttonHeight: 28,
        switchWidth: 40,
        switchHeight: 24,
        focusRingWidth: 3.5,
        focusRingGap: 0,
        checkboxSize: 14,
        checkboxRadius: 3.5,
        disabledOpacity: 0.5,
        tooltipBg: 15790320,
        tooltipText: 1907999,
        tooltipLine: 13027016,
        tooltipPlacement: "pointer",
        tooltipDelay: 1e3,
        tooltipSize: 11,
        menuRadius: 13,
        menuRow: 24,
        menuShadow: { "dx": 0, "dy": 12, "blur": 44, "color": 4294967360 },
        menuHl: { "angle": 180, "stops": [{ "offset": null, "color": 2066175 }, { "offset": null, "color": 26862 }] },
        menuMaterial: 8488877019,
        menuBackdrop: { "blur": 24, "saturate": 1.5 },
        menuTitleHl: 8589934372,
        scrimColor: 0,
        scrimOpacity: 0.12,
        errorColor: 13186089,
        dialogWidth: 260,
        dialogButtons: "stack",
        dialogAlign: "center",
        dialogTitleSize: 13,
        dialogBodySize: 12,
        buttonBorder: 13027016
      });
      CupertinoDark = /* @__PURE__ */ Object.freeze({
        bg: 1973790,
        surface: 2894894,
        line: 4737098,
        text: 15921911,
        textMuted: 10000541,
        textFaint: 11187390,
        accent: 689407,
        accentText: 16777215,
        control: 3815996,
        controlHover: 4408133,
        controlPressed: 5197649,
        controlSelected: 1850719,
        depth: 1,
        focusRing: true,
        controlRadius: 6,
        buttonRadius: 6,
        fieldRadius: 6,
        fieldPadding: 7,
        buttonHeight: 28,
        switchWidth: 40,
        switchHeight: 24,
        focusRingWidth: 3.5,
        focusRingGap: 0,
        checkboxSize: 14,
        checkboxRadius: 3.5,
        disabledOpacity: 0.5,
        tooltipBg: 2894894,
        tooltipText: 15921911,
        tooltipLine: 4737098,
        tooltipPlacement: "pointer",
        tooltipDelay: 1e3,
        tooltipSize: 11,
        menuRadius: 13,
        menuRow: 24,
        menuShadow: { "dx": 0, "dy": 12, "blur": 44, "color": 4294967411 },
        menuHl: { "angle": 180, "stops": [{ "offset": null, "color": 2854911 }, { "offset": null, "color": 684011 }] },
        menuMaterial: 5036060390,
        menuBackdrop: { "blur": 24, "saturate": 1.5 },
        menuTitleHl: 8589934374,
        scrimColor: 0,
        scrimOpacity: 0.3,
        errorColor: 16738657,
        dialogWidth: 260,
        dialogButtons: "stack",
        dialogAlign: "center",
        dialogTitleSize: 13,
        dialogBodySize: 12,
        buttonBorder: 5921374
      });
      MountainView = /* @__PURE__ */ Object.freeze({
        bg: 16776190,
        surface: 16777215,
        line: 7959678,
        text: 1841951,
        textMuted: 4801871,
        textFaint: 11187390,
        accent: 6770852,
        accentText: 16777215,
        control: 15196396,
        controlHover: 14472673,
        controlPressed: 13551571,
        controlSelected: 15261432,
        depth: 1,
        focusRing: true,
        controlRadius: 4,
        buttonRadius: 999,
        fieldRadius: 4,
        fieldPadding: 12,
        buttonHeight: 40,
        switchWidth: 52,
        switchHeight: 32,
        switchThumbOff: 16,
        focusRingWidth: 3,
        focusRingGap: 2,
        sliderHandle: "bar",
        checkboxSize: 18,
        checkboxRadius: 2,
        disabledOpacity: 0.38,
        tooltipBg: 3223603,
        tooltipText: 16052212,
        menuRadius: 4,
        menuShadow: { "dx": 0, "dy": 4, "blur": 12, "color": 4294967334 },
        menuHl: 15261432,
        menuHlText: 1906987,
        scrimColor: 0,
        scrimOpacity: 0.32,
        errorColor: 11740702,
        dialogWidth: 340,
        dialogTitleSize: 22,
        dialogBodySize: 14
      });
      MountainViewDark = /* @__PURE__ */ Object.freeze({
        bg: 1315352,
        surface: 2170662,
        line: 9670553,
        text: 15130857,
        textMuted: 13288656,
        textFaint: 11187390,
        accent: 13679871,
        accentText: 3677810,
        control: 4801871,
        controlHover: 5394008,
        controlPressed: 6183525,
        controlSelected: 4867160,
        depth: 1,
        focusRing: true,
        controlRadius: 4,
        buttonRadius: 999,
        fieldRadius: 4,
        fieldPadding: 12,
        buttonHeight: 40,
        switchWidth: 52,
        switchHeight: 32,
        switchThumbOff: 16,
        focusRingWidth: 3,
        focusRingGap: 2,
        sliderHandle: "bar",
        checkboxSize: 18,
        checkboxRadius: 2,
        disabledOpacity: 0.38,
        tooltipBg: 15131109,
        tooltipText: 3223603,
        menuRadius: 4,
        menuShadow: { "dx": 0, "dy": 4, "blur": 12, "color": 4294967373 },
        menuHl: 4867160,
        menuHlText: 15130857,
        scrimColor: 0,
        scrimOpacity: 0.55,
        errorColor: 15906997,
        dialogWidth: 340,
        dialogTitleSize: 22,
        dialogBodySize: 14
      });
      Redmond = /* @__PURE__ */ Object.freeze({
        bg: 15987699,
        surface: 16777215,
        line: 13750737,
        text: 1776411,
        textMuted: 6118749,
        textFaint: 10132122,
        accent: 26560,
        accentText: 16777215,
        control: 16514043,
        controlHover: 15724527,
        controlPressed: 14803425,
        controlSelected: 13098737,
        depth: 0.5,
        focusRing: "rest",
        controlRadius: 4,
        buttonRadius: 4,
        fieldRadius: 4,
        fieldPadding: 10,
        buttonHeight: 32,
        switchWidth: 40,
        switchHeight: 20,
        switchThumbOff: 12,
        focusRingWidth: 2,
        focusRingGap: 0,
        focusRingInnerWidth: 1,
        focusColor: 0,
        focusRingInnerColor: 16777215,
        sliderHandle: "dot",
        checkboxSize: 20,
        checkboxRadius: 4,
        disabledOpacity: 0.36,
        tooltipBg: 16514043,
        tooltipText: 1776411,
        tooltipLine: 13750737,
        tooltipPlacement: "above",
        tooltipDelay: 1e3,
        menuRadius: 8,
        menuShadow: { "dx": 0, "dy": 8, "blur": 16, "color": 4294967344 },
        menuHl: 15790320,
        menuHlText: 1776411,
        scrimColor: 0,
        scrimOpacity: 0.3,
        errorColor: 12856092,
        dialogWidth: 448,
        dialogButtons: "fill",
        dialogTitleSize: 20,
        dialogBodySize: 14,
        buttonBorder: 13750737
      });
      RedmondDark = /* @__PURE__ */ Object.freeze({
        bg: 2105376,
        surface: 2829099,
        line: 4210752,
        text: 16777215,
        textMuted: 12961221,
        textFaint: 9145227,
        accent: 5030655,
        accentText: 0,
        control: 3421236,
        controlHover: 4013373,
        controlPressed: 4737096,
        controlSelected: 2835795,
        depth: 0.5,
        focusRing: "rest",
        controlRadius: 4,
        buttonRadius: 4,
        fieldRadius: 4,
        fieldPadding: 10,
        buttonHeight: 32,
        switchWidth: 40,
        switchHeight: 20,
        switchThumbOff: 12,
        focusRingWidth: 2,
        focusRingGap: 0,
        focusRingInnerWidth: 1,
        focusColor: 16777215,
        focusRingInnerColor: 0,
        sliderHandle: "dot",
        checkboxSize: 20,
        checkboxRadius: 4,
        disabledOpacity: 0.36,
        tooltipBg: 2894892,
        tooltipText: 16777215,
        tooltipLine: 4210752,
        tooltipPlacement: "above",
        tooltipDelay: 1e3,
        menuRadius: 8,
        menuShadow: { "dx": 0, "dy": 8, "blur": 16, "color": 4294967385 },
        menuHl: 4013373,
        menuHlText: 16777215,
        scrimColor: 0,
        scrimOpacity: 0.5,
        errorColor: 16751012,
        dialogWidth: 448,
        dialogButtons: "fill",
        dialogTitleSize: 20,
        dialogBodySize: 14,
        buttonBorder: 5263440
      });
      SanFrancisco = /* @__PURE__ */ Object.freeze({
        bg: 16054010,
        surface: 16777215,
        line: 14410217,
        text: 1779507,
        textMuted: 7109256,
        textFaint: 11187390,
        accent: 3043296,
        accentText: 16777215,
        control: 15199217,
        controlHover: 14475494,
        controlPressed: 13554391,
        controlSelected: 13886204,
        depth: 1,
        focusRing: true,
        controlRadius: 7,
        tooltipBg: 1779507,
        tooltipText: 16054010,
        menuRadius: 8,
        menuShadow: { "dx": 0, "dy": 10, "blur": 40, "color": 4294967352 },
        menuHl: { "angle": 180, "stops": [{ "offset": null, "color": 4094440 }, { "offset": null, "color": 2450390 }] },
        scrimColor: 1053979,
        scrimOpacity: 0.32,
        errorColor: 12727592
      });
      SanFranciscoDark = /* @__PURE__ */ Object.freeze({
        bg: 988704,
        surface: 1581356,
        line: 2766402,
        text: 15199986,
        textMuted: 10334396,
        textFaint: 5596787,
        accent: 5017087,
        accentText: 16777215,
        control: 2240576,
        controlHover: 2832713,
        controlPressed: 3556437,
        controlSelected: 2046804,
        depth: 1,
        focusRing: true,
        controlRadius: 7,
        tooltipBg: 15199986,
        tooltipText: 988704,
        menuRadius: 8,
        menuShadow: { "dx": 0, "dy": 10, "blur": 40, "color": 4294967398 },
        menuHl: { "angle": 180, "stops": [{ "offset": null, "color": 5937151 }, { "offset": null, "color": 4161519 }] },
        scrimColor: 0,
        scrimOpacity: 0.5,
        errorColor: 16743022
      });
      THEME_RECORDS = /* @__PURE__ */ Object.freeze({
        Cupertino,
        CupertinoDark,
        MountainView,
        MountainViewDark,
        Redmond,
        RedmondDark,
        SanFrancisco,
        SanFranciscoDark
      });
    }
  });

  // runtime/dist/value.js
  function colorWithAlpha(rgb, a) {
    return a >= 255 ? rgb : ALPHA + rgb * 256 + a;
  }
  function isGradient(f) {
    return typeof f === "object" && f !== null;
  }
  function gradient(...args) {
    let angle = 180;
    if (typeof args[0] === "string") {
      const m = /^(-?\d+(?:\.\d+)?)deg$/.exec(args[0]);
      if (m === null)
        throw new Error(`gradient: an angle is written "45deg", got "${args[0]}"`);
      angle = parseFloat(m[1]);
      args = args.slice(1);
    }
    if (args.length < 2)
      throw new Error("gradient needs at least two stops");
    const stops = args.map((a) => {
      if (typeof a === "number")
        return Object.freeze({ offset: null, color: a });
      if (typeof a === "object" && a !== null && "color" in a)
        return a;
      throw new Error("a gradient stop is a color or stop(offset, color)");
    });
    return Object.freeze({ angle, stops: Object.freeze(stops) });
  }
  function shadowEqual(a, b) {
    return a !== null && b !== null && a.dx === b.dx && a.dy === b.dy && a.blur === b.blur && a.color === b.color;
  }
  function strokeEqual(a, b) {
    return a !== null && b !== null && a.width === b.width && a.color === b.color;
  }
  function backdropEqual(a, b) {
    return a !== null && b !== null && a.blur === b.blur && a.saturate === b.saturate;
  }
  function fillEqual(a, b) {
    if (!isGradient(a) || !isGradient(b))
      return false;
    return a.angle === b.angle && a.stops.length === b.stops.length && a.stops.every((s, i) => s.offset === b.stops[i].offset && s.color === b.stops[i].color);
  }
  function isAlign(v) {
    return typeof v === "object" && v !== null && "align" in v;
  }
  function isPercent(v) {
    return typeof v === "object" && v !== null && "percent" in v;
  }
  function enumType(name, ...tokens) {
    return { kind: "enum", name, tokens };
  }
  function declaredType(name) {
    return Object.hasOwn(DECLARED_TYPES, name) ? DECLARED_TYPES[name] : null;
  }
  function coerce(type, lit) {
    switch (type.kind) {
      case "length":
        if (lit.kind === "number") {
          if (lit.hex && lit.hexLen === 8)
            return fail("a Length", `${describeLiteral(lit)} (an 8-digit 0x is an alpha color, not a number \u2014 write a number in decimal)`);
          return ok(lit.value);
        }
        if (lit.kind === "percent")
          return ok({ percent: lit.value });
        if (lit.kind === "ident" && (lit.name === "center" || lit.name === "end"))
          return ok({ align: lit.name });
        return fail("a Length (a number of pixels, a percent like 50%, or the position literals center | end on x/y)");
      case "number":
        if (lit.kind === "number") {
          if (lit.hex && lit.hexLen === 8)
            return fail("a number", `${describeLiteral(lit)} (an 8-digit 0x is an alpha color, not a number \u2014 write a number in decimal)`);
          return ok(lit.value);
        }
        return fail("a number");
      case "boolean":
        if (lit.kind === "ident" && (lit.name === "true" || lit.name === "false")) {
          return ok(lit.name === "true");
        }
        return fail("a boolean (true or false)");
      case "string":
        if (lit.kind === "string")
          return ok(lit.value);
        return fail("a string");
      case "color":
        return coerceColor(lit);
      case "shape":
        return coerceShape(lit);
      case "dataschema":
        if (lit.kind === "schema")
          return ok(lit.shape);
        if (lit.kind === "ident" && lit.name === "null")
          return ok(null);
        return fail("a schema shape ([ field: type, rows[]: [ \u2026 ] ]), or null for none");
      case "enum":
        if (lit.kind === "ident" && type.tokens.includes(lit.name))
          return ok(lit.name);
        return fail(`${/^[AEIOU]/.test(type.name) ? "an" : "a"} ${type.name} (one of ${type.tokens.join(" | ")})`);
      case "fn":
        if (lit.kind === "ident" && lit.name === "null")
          return ok(null);
        return fail(`a function ${type.written}, or null for none`);
      case "component":
        if (lit.kind === "ident" && lit.name === "null")
          return ok(null);
        return fail(`a ${type.of} component (a member like 'layout: SimpleLayout [ \u2026 ]'), or null for none`);
      case "cursor":
        if (lit.kind === "ident" && lit.name === "null")
          return ok(null);
        return fail("a datapath (':field.path', a { } expression yielding a place in a dataset, or null)");
      case "array":
        if (lit.kind === "ident" && lit.name === "null")
          return ok(null);
        return fail("an array \u2014 a { } binding (plain TS: items = { [ \u2026 ] }), or null");
      case "object":
        if (lit.kind === "ident" && lit.name === "null")
          return ok(null);
        return fail("an object \u2014 a { } binding (plain TS), or null");
      case "view":
        if (lit.kind === "ident" && lit.name === "null")
          return ok(null);
        return fail("a View reference \u2014 assigned at runtime (an opener, a target), or null");
      case "slotref":
        if (lit.kind === "ident" && lit.name !== "null")
          return ok(lit.name);
        return fail("a slot name written as a bare token (like height or x)");
      case "record":
        return fail(`a ${type.name} (a token record \u2014 provide one with a { } binding or a stylesheet)`);
      case "fill":
        return coerceFill(lit);
      case "stroke":
        return coerceStroke(lit);
      case "shadow":
        return coerceShadow(lit);
      case "backdrop":
        return coerceBackdrop(lit);
      case "motion":
        return coerceMotion(lit);
      case "styles":
        if (lit.kind === "ident" && lit.name === "null")
          return ok(null);
        return fail("a style list ([card, danger] \u2014 names of declared style bundles), or null");
      case "stylesheet":
        if (lit.kind === "ident" && lit.name === "null")
          return ok(null);
        return fail("a stylesheet declared in this program (by name), or null");
      case "font":
        if (lit.kind === "string")
          return ok(lit.value);
        return fail('a declared font (by name), or a raw family string like "Helvetica, sans-serif"');
    }
  }
  function coerceColor(lit) {
    switch (lit.kind) {
      case "number":
        if (!lit.hex)
          return fail(COLOR, `${describeLiteral(lit)} (write a color in hex: 0x\u2026 or #\u2026)`);
        if (lit.hexLen === 8)
          return ok(colorWithAlpha(lit.value >>> 8 & 16777215, lit.value & 255));
        if (!Number.isInteger(lit.value) || lit.value < 0 || lit.value > 16777215) {
          return fail(COLOR, `${describeLiteral(lit)} (outside 0x000000\u20130xFFFFFF)`);
        }
        return ok(lit.value);
      case "hexColor": {
        const hex = lit.raw.slice(1);
        if (!/^[0-9a-fA-F]+$/.test(hex) || ![3, 4, 6, 8].includes(hex.length)) {
          return fail(COLOR, `'${lit.raw}' (a hex color is 3, 4, 6, or 8 hex digits)`);
        }
        const long = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
        const rgb = parseInt(long.slice(0, 6), 16);
        return ok(long.length === 8 ? colorWithAlpha(rgb, parseInt(long.slice(6), 16)) : rgb);
      }
      case "ident": {
        if (lit.name === "null")
          return ok(null);
        const key = lit.name.toLowerCase();
        if (Object.hasOwn(CSS_COLORS, key))
          return ok(CSS_COLORS[key]);
        return fail(COLOR, `'${lit.name}' (not a CSS color name)`);
      }
      default:
        return fail(COLOR);
    }
  }
  function argColor(lit) {
    const c = coerceColor(lit);
    return c.ok && typeof c.value === "number" ? c.value : null;
  }
  function argNumber(lit) {
    return lit.kind === "number" ? lit.value : null;
  }
  function coerceFill(lit) {
    if (lit.kind === "call") {
      if (lit.name !== "gradient")
        return fail(FILL, `'${lit.name}(\u2026)' (not a fill constructor)`);
      const args = [...lit.args];
      const angle = args.length > 0 && args[0].kind === "number" && !args[0].hex ? argNumber(args.shift()) : 180;
      const stops = [];
      for (const a of args) {
        if (a.kind === "call" && a.name === "stop") {
          const offset = a.args.length === 2 ? argNumber(a.args[0]) : null;
          const color2 = a.args.length === 2 ? argColor(a.args[1]) : null;
          if (offset === null || color2 === null) {
            return fail(FILL, `a stop is stop(offset, color) \u2014 offset 0\u20261, color a Color`);
          }
          stops.push({ offset, color: color2 });
          continue;
        }
        const color = argColor(a);
        if (color === null)
          return fail(FILL, `${describeLiteral(a)} (a gradient stop is a Color or stop(offset, color))`);
        stops.push({ offset: null, color });
      }
      if (stops.length < 2)
        return fail(FILL, `a gradient needs at least two stops`);
      return ok({ angle, stops });
    }
    const c = coerceColor(lit);
    return c.ok ? c : fail(FILL, c.found);
  }
  function coerceStroke(lit) {
    if (lit.kind === "ident" && lit.name === "null")
      return ok(null);
    if (lit.kind !== "call" || lit.name !== "stroke")
      return fail(STROKE);
    const width = lit.args.length === 2 ? argNumber(lit.args[0]) : null;
    const color = lit.args.length === 2 ? argColor(lit.args[1]) : null;
    if (width === null || color === null || width < 0)
      return fail(STROKE);
    return ok({ width, color });
  }
  function coerceShadow(lit) {
    if (lit.kind === "ident" && lit.name === "null")
      return ok(null);
    if (lit.kind !== "call" || lit.name !== "shadow")
      return fail(SHADOW);
    if (lit.args.length !== 4)
      return fail(SHADOW);
    const [dx, dy, blur] = lit.args.slice(0, 3).map(argNumber);
    const color = argColor(lit.args[3]);
    if (dx === null || dy === null || blur === null || color === null || blur < 0)
      return fail(SHADOW);
    return ok({ dx, dy, blur, color });
  }
  function coerceBackdrop(lit) {
    if (lit.kind === "ident" && lit.name === "null")
      return ok(null);
    if (lit.kind !== "call" || lit.name !== "frost")
      return fail(BACKDROP);
    if (lit.args.length < 1 || lit.args.length > 2)
      return fail(BACKDROP);
    const radius = argNumber(lit.args[0]);
    const saturation = lit.args.length === 2 ? argNumber(lit.args[1]) : 1;
    if (radius === null || saturation === null || radius < 0 || saturation < 0)
      return fail(BACKDROP);
    return ok(frost(radius, saturation));
  }
  function coerceMotion(lit) {
    if (lit.kind === "ident") {
      const m = motionToken(lit.name);
      return m ? ok(m) : fail(MOTION, `'${lit.name}' (not one of ${MOTION_TOKENS.join(" | ")})`);
    }
    if (lit.kind !== "call")
      return fail(MOTION);
    switch (lit.name) {
      case "cubicBezier": {
        if (lit.args.length !== 4)
          return fail(MOTION, "cubicBezier(x1, y1, x2, y2) takes four numbers");
        const [x1, y1, x2, y2] = lit.args.map(argNumber);
        if (x1 === null || y1 === null || x2 === null || y2 === null)
          return fail(MOTION, "cubicBezier(x1, y1, x2, y2) \u2014 four numbers");
        if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1)
          return fail(MOTION, "cubicBezier x-coordinates must be in [0, 1] (time is monotonic)");
        return ok({ k: "bezier", x1, y1, x2, y2 });
      }
      case "back": {
        const s = lit.args.length === 1 ? argNumber(lit.args[0]) : null;
        if (s === null)
          return fail(MOTION, "back(overshoot) \u2014 one number (try back(1.7))");
        return ok({ k: "back", dir: "both", overshoot: s });
      }
      case "steps": {
        if (lit.args.length < 1 || lit.args.length > 2)
          return fail(MOTION, "steps(n[, jumpStart | jumpEnd])");
        const n = argNumber(lit.args[0]);
        if (n === null || !Number.isInteger(n) || n < 1)
          return fail(MOTION, "steps(n, \u2026) \u2014 n a positive integer");
        let jump = "end";
        if (lit.args.length === 2) {
          const j = lit.args[1];
          if (j.kind !== "ident" || j.name !== "jumpStart" && j.name !== "jumpEnd")
            return fail(MOTION, "steps' second argument is jumpStart or jumpEnd");
          jump = j.name === "jumpStart" ? "start" : "end";
        }
        return ok({ k: "steps", n, jump });
      }
      case "laszlo": {
        if (lit.args.length !== 2)
          return fail(MOTION, "laszlo(beginPole, endPole) \u2014 two numbers");
        const [bp, ep] = lit.args.map(argNumber);
        if (bp === null || ep === null || bp <= 0 || ep <= 0)
          return fail(MOTION, "laszlo(beginPole, endPole) \u2014 two positive numbers");
        return ok({ k: "laszlo", beginPole: bp, endPole: ep });
      }
      default:
        return fail(MOTION, `'${lit.name}(\u2026)' (not a motion constructor)`);
    }
  }
  function coerceShape(lit) {
    if (lit.kind === "ident" && lit.name === "null")
      return ok(null);
    if (lit.kind === "ident" && (lit.name === "true" || lit.name === "false")) {
      return ok(lit.name === "true");
    }
    if (lit.kind !== "string")
      return fail(SHAPE);
    const problem = validatePathData(lit.value);
    if (problem !== null)
      return fail(SHAPE, `${describeLiteral(lit)} (${problem})`);
    return ok(lit.value);
  }
  function describeLiteral(lit) {
    switch (lit.kind) {
      case "number":
        return `the number ${lit.hex && lit.value >= 0 ? "0x" + lit.value.toString(16).toUpperCase() : lit.value}`;
      case "percent":
        return `the percent ${lit.value}%`;
      case "string":
        return `the string ${JSON.stringify(lit.value)}`;
      case "hexColor":
        return `the color ${lit.raw}`;
      case "ident":
        return `'${lit.name}'`;
      case "code":
        return "a { \u2026 } expression";
      case "path":
        return `the datapath :${lit.path}${lit.many ? "[]" : ""}`;
      case "schema":
        return "a schema shape";
      case "call":
        return `'${lit.name}(\u2026)'`;
      case "list":
        return `the list [${lit.items.map((i) => i.kind === "ident" ? i.name : i.kind === "string" ? `"${i.value}"` : "\u2026").join(", ")}]`;
    }
  }
  function colorToCss(c) {
    if (c === null)
      return "transparent";
    if (c < ALPHA)
      return "#" + c.toString(16).padStart(6, "0");
    const v = c - ALPHA;
    return "#" + Math.floor(v / 256).toString(16).padStart(6, "0") + (v % 256).toString(16).padStart(2, "0");
  }
  var ALPHA, stop, stroke, shadow, frost, DEFAULT_THEME, DECLARED_TYPES, DECLARED_TYPE_NAMES, ok, fail, COLOR, FILL, STROKE, SHADOW, BACKDROP, MOTION, SHAPE;
  var init_value = __esm({
    "runtime/dist/value.js"() {
      "use strict";
      init_css_colors();
      init_shape();
      init_animate();
      init_themes_data();
      ALPHA = 4294967296;
      stop = (offset, color) => Object.freeze({ offset, color });
      stroke = (width, color) => Object.freeze({ width, color });
      shadow = (dx, dy, blur, color) => Object.freeze({ dx, dy, blur, color });
      frost = (radius, saturation = 1) => Object.freeze({ blur: radius, saturate: saturation });
      DEFAULT_THEME = SanFrancisco;
      DECLARED_TYPES = {
        number: { kind: "number" },
        string: { kind: "string" },
        boolean: { kind: "boolean" },
        Color: { kind: "color" },
        Length: { kind: "length" },
        Shape: { kind: "shape" },
        // The records door (planes.md §4 — components arrange records): a slot
        // holding an ARRAY of records (`items`), a plain OBJECT record, or a VIEW
        // reference (`opener`). Literal defaults are null-only — structured values
        // arrive from `{ }` bindings and runtime writes; the names stay precise
        // (no `any` in the vocabulary) so a declaration still documents intent.
        array: { kind: "array" },
        object: { kind: "object" },
        View: { kind: "view" },
        // Built-in VALUE ENUMS, declarable by name so a library-authored class keeps
        // the bare-token use-site surface (`axis = x`, `align = center`) — these are
        // as built-in as Color. (User-authored unions remain their own future
        // construct, per the note above.)
        Axis: enumType("Axis", "x", "y"),
        WrapAlign: enumType("WrapAlign", "start", "center")
      };
      DECLARED_TYPE_NAMES = Object.keys(DECLARED_TYPES);
      ok = (value) => ({ ok: true, value });
      fail = (expected, found) => ({ ok: false, expected, found });
      COLOR = "a Color (a name like navy, #RGB, #RRGGBB, #RGBA, #RRGGBBAA, 0xRRGGBB, or null)";
      FILL = `a Fill (a Color, gradient(#F8F8F8, #D8D8D8), gradient(angle, \u2026stops), or null)`;
      STROKE = `a Stroke (stroke(width, color) \u2014 drawn inside the box \u2014 or null)`;
      SHADOW = `a Shadow (shadow(dx, dy, blur, color), or null)`;
      BACKDROP = `a Backdrop (frost(radius) or frost(radius, saturation) \u2014 blur what lies beneath, saturation \u2265 0 (default 1) \u2014 or null)`;
      MOTION = `a Motion (a named curve like easeBoth, quartOut, expoIn, or laszloBoth; or a constructor: cubicBezier(x1, y1, x2, y2), back(overshoot), steps(n[, jumpStart | jumpEnd]), laszlo(beginPole, endPole))`;
      SHAPE = `a Shape (SVG path data in a string, like "M0 0 L80 0 L40 60 Z", or null)`;
    }
  });

  // runtime/dist/schema.js
  function descendsFrom(schema, ancestor) {
    for (let s = schema; s !== null; s = s.base) {
      if (s.name === ancestor)
        return true;
    }
    return false;
  }
  function attrType(schema, name) {
    for (let s = schema; s !== null; s = s.base) {
      if (Object.hasOwn(s.attrs, name))
        return s.attrs[name];
    }
    return null;
  }
  function isReadOnly(schema, name) {
    for (let s = schema; s !== null; s = s.base) {
      if (s.readOnly?.includes(name))
        return true;
    }
    return false;
  }
  function eventOfHandler(name) {
    if (name.length < 3 || !name.startsWith("on") || name[2] < "A" || name[2] > "Z")
      return null;
    return name[2].toLowerCase() + name.slice(3);
  }
  function eventsOf(schema) {
    const out = [];
    for (let s = schema; s !== null; s = s.base) {
      if (s.events !== void 0)
        out.unshift(...s.events);
    }
    return out;
  }
  var FONT_WEIGHT, NodeSchema, ViewSchema, AppSchema, TextSchema, ImageSchema, VideoSchema, DOMIslandSchema, EditorSchema, TextInputSchema, RichTextSchema, MarkdownSchema, HTMLTextSchema, LayoutSchema, TweenLayoutSchema, DatasetSchema, DataSourceSchema, AnimatorSchema, AnimatorGroupSchema, SpringSchema, HeartbeatSchema, KeysSchema, FocusSchema, TipSchema, StreamSchema, EventStreamSchema, SocketSchema, StateSchema, SCHEMAS, handlerName, EVENT_PAYLOAD, PAYLOAD_TYPE_NAMES;
  var init_schema = __esm({
    "runtime/dist/schema.js"() {
      "use strict";
      init_value();
      FONT_WEIGHT = enumType("FontWeight", "thin", "extralight", "light", "regular", "normal", "medium", "semibold", "bold", "extrabold", "black");
      NodeSchema = {
        name: "Node",
        base: null,
        attrs: {}
      };
      ViewSchema = {
        name: "View",
        base: NodeSchema,
        attrs: {
          x: { kind: "length" },
          y: { kind: "length" },
          width: { kind: "length" },
          height: { kind: "length" },
          fill: { kind: "fill" },
          cornerRadius: { kind: "number" },
          // pointer-interaction intrinsics (interaction.ts) — read-only (readOnly below):
          // on the live hit chain (hovered) / on the chain captured at pointer-down (pressed)
          hovered: { kind: "boolean" },
          pressed: { kind: "boolean" },
          stroke: { kind: "stroke" },
          shadow: { kind: "shadow" },
          visible: { kind: "boolean" },
          // The two parent-regime OPT-OUTS, declared on the child (one family):
          // `ignoreLayout` — this child is not arranged by the parent's layout (a
          // decoration/overlay owns its own position, both axes); `ignoreClip` —
          // this child is not cut by the parent's clip (paint AND hit — frame
          // chrome that straddles the frame: a window's resize halo, a badge
          // poking out of a clipped card), and it does not count toward the
          // parent's auto-extent (frame geometry derives FROM the parent's bounds
          // and cannot also define them — the percent-slot rule's sibling). An
          // ancestor's clip above the parent still applies.
          ignoreLayout: { kind: "boolean" },
          ignoreClip: { kind: "boolean" },
          // …and `ignoreScroll` — the third member (ruled 2026-07-29): the scroll
          // carries everyone but me. The child rides its nearest enclosing scroll
          // FRAME — the window when the page is the regime, the pane's frame inside
          // a `scrolls` view — and contributes nothing to the scroll range. Fixed
          // headers, pinned toolbars, and the overlay LAYER that stages parked
          // furniture (a sheet waiting beyond the frame's edge) are all this one
          // attribute.
          ignoreScroll: { kind: "boolean" },
          opacity: { kind: "number" },
          // Uniform scale transform (painted only — never layout, like opacity): the
          // view's subtree renders scaled about the pivot point (pivotX/pivotY, in the
          // view's own coordinates; default the top-left corner). Animate it with a
          // Spring for zoom effects; 1 = no transform. Both backends realize it (DOM
          // CSS transform, canvas ctx.scale), and hit-testing follows the visible
          // geometry so a scaled view stays correctly clickable.
          scale: { kind: "number" },
          pivotX: { kind: "number" },
          pivotY: { kind: "number" },
          // Rotation in DEGREES, clockwise, about the same pivot scale uses —
          // painted only, like scale and opacity: the box the tree reasons about
          // never rotates, layout is untouched, and hit-testing follows the
          // VISIBLE geometry through the inverse transform (interaction.ts), so a
          // rotated control stays honestly clickable. Composes with scale in one
          // documented order: scale, then rotate, about the shared pivot (for
          // uniform scale the two commute; the order is stated so nobody has to
          // prove that). 0 = unrotated.
          rotation: { kind: "number" },
          // How this view COMPOSITES against what has already painted beneath it
          // within the nearest isolating ancestor (compositing.md §4.1: the App
          // root, a group-opacity subtree, a scroller's content group, an island
          // boundary — plain containers are transparent to blending, so a multiply
          // chip inside three nested layout Views blends against the card under
          // them). Declaration order — the language's own z-order — is also the
          // blending order. A blending view lands as a UNIT, children included;
          // compositing is paint, never input. Tokens are camelCase (`colorDodge`),
          // the W3C mode set every renderer carries natively.
          blend: enumType("Blend", "normal", "multiply", "screen", "overlay", "darken", "lighten", "colorDodge", "colorBurn", "hardLight", "softLight", "difference", "exclusion", "hue", "saturation", "color", "luminosity", "plusLighter"),
          // The frost (compositing.md §3.2): sample what has already painted
          // beneath this view's own painted shape — box, cornerRadius, or shape
          // clip, over-scanned by the blur radius so edges do not bleed dry —
          // filter it (`frost(radius, saturation?)`), and paint the view's own
          // `fill` OVER the result: the platform-material shape. Samples within
          // the same isolating ancestor blending sees (§4.2); re-samples as
          // content moves beneath — that is the point of frost. null = none.
          backdrop: { kind: "backdrop" },
          clip: { kind: "shape" },
          // Scroll: which AXES of interior overflow this view scrolls (ruled
          // 2026-07-29, the axis-enum form — the Stretch shape): `none` (the View
          // default — overflow is out of frame), `y`, `x`, or `both`. A scrolling
          // view clips to its box; overflow along a declared axis becomes its scroll
          // range (live `scrollY`/`scrollX`), overflow along any other axis is
          // simply gone. Chrome stays fixed for free by being a SIBLING of the
          // scroller — or a child that declares `ignoreScroll`. Both backends
          // realize scrolling natively (DOM `overflow`; canvas clip+translate+wheel).
          scrolls: enumType("Scrolls", "none", "y", "x", "both"),
          // The axis a declared drag CLAIMS (D8 RULED; claim-surface.md): `both`
          // (default — the whole single-finger gesture, today's semantics) or
          // `x`/`y`, scoping the claim to one axis so the cross axis stays the
          // enclosing scroll regime's. The forcing cases: a grid column's header
          // drag and edge-resize on touch.
          claim: enumType("Claim", "both", "x", "y"),
          // the tooltip text — planes.md tier 1; "" (the default) = no tip
          tip: { kind: "string" },
          scrollY: { kind: "number" },
          scrollX: { kind: "number" },
          // Styling: the ruled prevailing built-ins — the four text-style slots
          // (declared on View so any container can provide them; Text renders with
          // the effective values) and the theme token record. NOT prevailing, by
          // ruling: backgroundColor/opacity/visible (their effect already composes
          // through the render tree — a followed copy would apply it twice).
          textColor: { kind: "color" },
          fontSize: { kind: "number" },
          fontFamily: { kind: "font" },
          // fontString maps each weight token to its numeric CSS weight, which also
          // PICKS the matching web face when a `font` provides several.
          fontWeight: FONT_WEIGHT,
          // Tracking (canvas-native: ctx.letterSpacing / CSS letter-spacing), in px;
          // 0 = the browser's natural advances (the Flash auto-tracking stays shed).
          letterSpacing: { kind: "number" },
          // The size an Icon takes from its context — prevailing, so a HOST states
          // it once (a menu row 16, a button 18) and every icon beneath answers.
          // A use site may still override it; this is a default, not a rule.
          iconSize: { kind: "number" },
          // Rich-text STRUCTURE overrides (the prose-specific styling slots — the twin
          // of the text-style slots above, for the parts a `Text` doesn't have). A
          // `Markdown`/`HTMLText` renders its headings/links/inline-code from these;
          // like the text slots they are prevailing (set once on a container → all
          // prose below picks them up) and declared on View so any ancestor provides
          // them. Colors default `null` = the theme-aware house token; `headingWeight`
          // defaults to the house `bold`.
          headingColor: { kind: "color" },
          headingWeight: FONT_WEIGHT,
          linkColor: { kind: "color" },
          codeColor: { kind: "color" },
          // Code face + size — the twin of `codeColor` for monospace regions (inline
          // code, fenced/`<pre>` blocks). Default `0`/`""` = the house code style
          // (PROSE.codeSize / PROSE.mono). Prevailing, so one ancestor sets the code
          // rendition for all prose below it.
          codeSize: { kind: "number" },
          codeFamily: { kind: "font" },
          // The code-BLOCK box paint (fenced ``` and highlighted `<pre>`): a background
          // tint and a left accent bar. Both `null` = the house look (fenced code keeps
          // its themed tint, a `<pre>` stays bare) — so unset changes nothing. Setting
          // `codeBackground` gives a `<pre>` the same tinted box a fenced block has;
          // setting `codeRule` draws a left bar on BOTH (the `buildQuote` bar, reused).
          // Prevailing, the twin of `codeColor`/`codeSize` for the block's chrome.
          codeBackground: { kind: "color" },
          codeRule: { kind: "color" },
          // Per-block-type layout geometry for rendered rich text (Markdown/HTMLText):
          // a plain record keyed by block type (`paragraph`/`heading`/`code`/`pre`/
          // `list`/`table`/`blockquote`/`rule`, plus `default`), each entry giving a
          // `maxWidth` (0 = unbounded), a `margin` ([left, right]), and an `align`
          // (left|center|right). Defaulted IN the consumer (like `theme`): an unset map
          // — or an unset key/field — is today's full-width, left-aligned flow. A `pre`
          // block with no own entry shares the `code` entry. Set it to give prose a
          // reading measure while code fills the column (code wider than prose). Set via
          // a `{ }` object; prevailing, so one ancestor sets the flow geometry below it.
          richTextLayout: { kind: "record", name: "RichTextLayout" },
          // The `theme` slot's runtime default is the HOUSE theme — populated in
          // value.ts (DEFAULT_THEME, the single source; view.ts wires it as the
          // slot's def), so `theme.role` in library components always resolves.
          theme: { kind: "record", name: "Theme" },
          // Native text selection — a prevailing slot so a whole subtree opts in from
          // one place: `selectable = true` on a container makes all its Text (including
          // a `Markdown` component's rendered runs) selectable/copyable. Defaults by
          // SPECIES (ruled 2026-07-30): off for Text and views (a label is chrome), ON
          // for the RichText family (a flowing document is selectable by its nature —
          // markdown.ts effSelectable); any declaration beats any default, in either
          // direction, so a control inside prose vetoes with `selectable = false` and
          // the unusual non-selectable document is one explicit line. Declared on View
          // so any container provides it, like the text-style slots.
          selectable: { kind: "boolean" },
          // The pointer cursor while over this view (a CSS cursor keyword; "" =
          // inherit) — resize affordances, drag handles. Meaningful on views that
          // take input (the sink is the hit target on both backends).
          cursor: { kind: "string" },
          // Whether this view (and its subtree, CSS-inheriting) takes pointer
          // events at all: "auto" (the default) or "none". A view that is pure
          // decoration over live content — a highlight rectangle, a full-viewport
          // chrome overlay — declares "none" so presses reach what is beneath it.
          pointerEvents: { kind: "string" },
          // The other two styling channels: an ordered bundle list (static, ruled
          // v1 — consumed at construction) and the prevailing stylesheet slot
          // (provide it anywhere → that subtree reskins; swap = one settle).
          styles: { kind: "styles" },
          stylesheet: { kind: "stylesheet" },
          // R7: how the view arranges its children — a component-typed slot
          // (language §5: "a reactive Layout attribute you set on the view",
          // Appendix A: "Layout is an attribute, not a child"), written as the
          // member `layout: SimpleLayout [ … ]`, or `layout = null` for none.
          layout: { kind: "component", of: "Layout" },
          // R8: the data cursor (language §9: "`datapath = …` sets the cursor;
          // descendants read relative to it"). Written as a `:path` (relative to
          // the inherited cursor — `:arr[]` replicates this element), a `{ }`
          // expression yielding a place in a dataset, or null.
          datapath: { kind: "cursor" },
          // Keyboard focus (docs/system-design/input.md, Layer 2): `focusable` = a tab stop;
          // `focusTrap` = a self-contained focus group (Tab cycles within, escapes at
          // the boundary). Traversal order is the view tree (no numeric tabindex),
          // customized by overriding the `tabOrder()` method.
          focusable: { kind: "boolean" },
          focusTrap: { kind: "boolean" },
          // Anchor name (location.md §6): give a view a name and a fragment `@name`
          // brings it into view. This is the "named view" half of the reveal namespace
          // (heading slugs are the other); resolution is views-before-slugs, preorder,
          // `-2` on duplicates. "" (the default) = not an anchor. A plain string the
          // reveal walk reads after settle — no rendering effect.
          anchor: { kind: "string" },
          // The linking triple (location.md §0). `link`: this view IS a link to the
          // reference — "#name" in-app, a URL out; "" = not a link (no interest, no
          // focus stop, nothing for the crawl); any view can carry it, and interest
          // derives from it the way it does from a declared handler. `replace`:
          // following this link overwrites the current history entry instead of
          // pushing — fine-grained movement WITHIN a place (a deck's arrows).
          // `shows`: this view manifests the named location — visibility derives
          // from it (the location's destination part equals the name), and the name
          // joins the program's link registry; literal, App-tree only (check.ts).
          link: { kind: "string" },
          replace: { kind: "boolean" },
          shows: { kind: "string" },
          // Read-only intrinsics — the auto-extent computation (view.ts), surfaced:
          // the bounding-box extent of this view's visible children on each axis. A
          // constraint may READ them to clamp a size (`height = { Math.min(
          // contentHeight, 480) }`); they are never set (see readOnly below — the
          // runtime backs them with getters, not stored slots).
          contentWidth: { kind: "length" },
          childViews: { kind: "array" },
          virtualized: { kind: "boolean" },
          // Replication metadata, declared on the replicated child and consumed by
          // the Replicator (stripped from the template — not a live slot on the
          // instance). It is in the schema so it DOCUMENTS ITSELF (the reference is
          // generated from these tables) and so a `{ }` body has a declared type to
          // check against; check.ts gates it to a replication template.
          //
          // `key` is deliberately NOT here, though it is the same kind of metadata.
          // Being a View attribute would take the name out of every author's reach —
          // no member and no child could be called `key` again — and the corpus
          // proved that immediately: library/menu.declare has a child named `key`.
          // A common English word is too expensive to spend on a rare override, so
          // `key` stays a special case in check.ts and is taught in the guide's
          // identity ladder rather than the reference.
          virtualize: { kind: "boolean" },
          contentHeight: { kind: "length" }
        },
        prevailing: ["textColor", "fontSize", "fontFamily", "fontWeight", "letterSpacing", "headingColor", "headingWeight", "linkColor", "codeColor", "codeSize", "codeFamily", "codeBackground", "codeRule", "richTextLayout", "theme", "stylesheet", "selectable", "iconSize"],
        readOnly: ["contentWidth", "contentHeight", "childViews", "virtualized", "hovered", "pressed"],
        // R5: the pointer trio (click = press and release on the same view — the
        // shared router's rule, input.ts) plus the construction-complete lifecycle
        // event `init` (Appendix A's onInit). Hover (pointerOver/Out) waits for its
        // consuming rung — it needs retained enter/leave tracking, not just a
        // per-event hit test.
        // The pointer events come in two layers (input.ts): the RAW facts —
        // pointerDown/Move/Up, the multi-finger `touch*` family, and `wheel` (the
        // wheel stream, trackpad pinch included) — report what the pointer
        // physically did, immediately; the RESOLVED ones — click, dblClick,
        // hold — report what the user MEANT, after the router has watched the whole
        // gesture. Activate on the resolved layer, manipulate on the raw one.
        // Declaring a raw-family handler is also a gesture CLAIM (backend.ts
        // InputWants): it takes from the browser exactly what that handler needs
        // to fire, nothing more.
        events: [
          "click",
          "dblClick",
          "hold",
          "pointerDown",
          "pointerUp",
          "pointerMove",
          "pointerOver",
          "pointerOut",
          "touchStart",
          "touchMove",
          "touchEnd",
          "touchCancel",
          "wheel",
          "pinchStart",
          "pinch",
          "pinchEnd",
          "init",
          "retire",
          "contextMenu",
          "focus",
          "blur",
          "escapeFocus",
          "keyDown",
          "keyUp"
        ]
      };
      AppSchema = {
        name: "App",
        base: ViewSchema,
        attrs: {
          hostWidth: { kind: "number" },
          hostHeight: { kind: "number" },
          scrollY: { kind: "number" },
          pointerX: { kind: "number" },
          pointerY: { kind: "number" },
          pointerDown: { kind: "boolean" },
          hovering: { kind: "boolean" },
          pointerOverText: { kind: "boolean" },
          // the OS color-scheme, `prefers-color-scheme: dark` — the runtime feeds it and
          // keeps it live as the system theme flips, so an app themes off `app.dark`.
          dark: { kind: "boolean" },
          // "am I running on a touch device?" — true when the device's PRIMARY pointer
          // is coarse (`pointer: coarse`), a phone or tablet. A stable device fact (kept
          // live if the input changes), distinct from the transient `hovering`:
          // mouse-only affordances (a cursor-chasing dot, a hover reveal) switch off with
          // `visible = { !app.touchDevice }`.
          touchDevice: { kind: "boolean" },
          // The rest of the device profile (boot.ts wireTouchDevice). `hasTouch` /
          // `hasPointer` are what the device HAS (`any-pointer`), not what is
          // primary: a touch laptop is both, with touchDevice false. Size from
          // `touchDevice`; use `hasTouch` for a hit-target FLOOR on hybrids.
          hasTouch: { kind: "boolean" },
          hasPointer: { kind: "boolean" },
          // What the user JUST used — "mouse" | "touch" | "pen", live. The honest
          // answer on a hybrid, where the truth changes per gesture: drive hover-only
          // affordances from it, never layout.
          lastPointerType: { kind: "string" },
          // The EMBEDDING ENVIRONMENT's parameters — a record the HOST provides and
          // keeps live (an island's slot marker carries `|k=v&k2=v2` after the
          // program path; host-client parses, coerces, and writes the whole record).
          // A hosted app reads them REACTIVELY (`app.env.dark`) exactly as it reads
          // `app.dark` — the clean pass-through for a desktop hosting a child app
          // and pushing its appearance (or anything else) down. `{}` when top-level
          // or when the host passes nothing, so reads never null-crash.
          env: { kind: "object" },
          // `location` — the app's slice of the URL, the FRAGMENT (docs/system-design/location.md).
          // A two-way built-in the host wires with `TextInput.text`'s echo discipline:
          // seeded from the URL fragment BEFORE first settle (a deep link is just an
          // initial state), mirrored outward per-settle (push history), and written back
          // by the host on back/forward. The app OWNS the grammar — an opaque string it
          // parses (`location.split("/")`) and produces (`app.location = "why"`). The
          // declared initial is the DEFAULT: the fragment is omitted whenever the app is
          // at it (§3), so a plain app that never writes it keeps a clean URL. Writable
          // by user code (navigation IS a write) and by the host (the seed / back-forward)
          // — a SCHEMA attr on purpose: §3's `App [ location = "home" ]` needs a checkable
          // [ ] slot (unlike the host-fed read-only channels, which live in LANGUAGE_API).
          location: { kind: "string" },
          // `waypoint` — the STEP: session state the Back button retraces but the URL
          // never shows. The second half of the history entry (the pair is location +
          // waypoint): the host carries it in the History entry's state object —
          // invisible to the address bar, autocomplete, sharing, and the crawl — and
          // writes it back on back/forward exactly as it writes `location`. The
          // dividing test: would you hand the value to a stranger? Yes → location
          // (it's an address); no, but Back should undo it → waypoint; neither →
          // an ordinary attribute. The app owns the grammar, same as location. A
          // pasted URL carries no waypoint (a recipient starts at the declared
          // initial); reload and session restore resume it (the entry survives).
          // Coordinates, never data: derive the data from the waypoint.
          waypoint: { kind: "string" },
          // NOTE: live demo editing is NOT a base-App concern (capabilities.md §7 —
          // RULED shape 3, a component). The app-authored state (editing / liveCard /
          // liveSource) is instance-declared on the demo-hosting apps; the host-fed
          // channels the apps still read (demoSources / liveReport) are interim App
          // runtime surface in scaffold.ts LANGUAGE_API (like navigate), never schema
          // attrs. pageWeight / sourceLines are host-client writes with no Declare
          // reader — not language surface at all.
          // NOTE: app→host navigation is the `navigate(to)` METHOD (view.ts App), not an
          // attribute — a link/button CALLS it in an activation handler (capabilities.md
          // §6). The runtime channel it writes (`pendingNav`) is a plain host-polled
          // field, deliberately not a schema attribute, so no Declare source names it.
          // the app's size floor: the auto-extent never derives below it — in a
          // narrower host the app holds the floor and the stage pans natively.
          // A declared policy (readable statically), not clamp math in a constraint.
          minWidth: { kind: "number" },
          minHeight: { kind: "number" },
          // `appName` — the app's human name; hosts surface it where names go (today:
          // the browser page title, mirrored per settle by host-client; the extractor
          // reads the SETTLED value for the crawled page's <title>). A literal
          // (`appName = "Declare Calendar"`) or a constraint (the viewer derives the
          // viewed file's name) — an ordinary reactive attr, so "dynamic title" is
          // not a mechanism, just a binding. "" (the default) = no opinion; the host
          // keeps its served title.
          appName: { kind: "string" },
          // `revealInset` — the scroll-margin analogue (location.md §0.5.4): a reveal
          // lands this many pixels short of the viewport top, clearing fixed chrome
          // (a 56px sticky header) without per-page marker views. One knob, app-wide.
          revealInset: { kind: "number" },
          // `crawlSeeds` — extra references the extraction crawl seeds beyond the
          // registry (location.md §0.8.2): computed locations worth emitting that no
          // rendered link reaches. An ordinary attribute; the extractor reads it at
          // t=0. Meaningless at runtime, harmless to set.
          crawlSeeds: { kind: "array" }
        },
        // hostWidth/hostHeight are read-only to user code (the runtime feeds them; a
        // set is a compile error) — like View's contentWidth/contentHeight.
        readOnly: ["hostWidth", "hostHeight", "dark", "touchDevice", "hasTouch", "hasPointer", "lastPointerType"],
        // `onFollow(ref) -> ref'` — the app-scoped arrival hook (location.md §0.6):
        // follow() applies it ONCE to every arrival — a linked view, a prose href, a
        // cold URL, back/forward — before routing. Return the reference to proceed
        // with; "" vetoes. Declared as an EVENT so the checker admits the handler;
        // unlike the pointer family it is called BY follow and returns a value.
        events: ["follow"]
      };
      TextSchema = {
        name: "Text",
        base: ViewSchema,
        attrs: {
          text: { kind: "string" },
          // The glyphs' drop shadow — the same shadow(…) value as the box slot.
          textShadow: { kind: "shadow" },
          // Wrapping (docs/system-design/text-and-markdown.md): a bounded-width run wraps by
          // default; `wrap = false` forces a single line. `textAlign` pairs with it.
          wrap: { kind: "boolean" },
          textAlign: enumType("TextAlign", "left", "center", "right"),
          italic: { kind: "boolean" },
          // Fill the glyphs with a gradient (or solid Fill), like the box `fill` —
          // overrides `textColor` when set. `textFill = { gradient("90deg", …) }`.
          textFill: { kind: "fill" },
          // Leading, as a MULTIPLIER of fontSize (the Markdown/RichText convention:
          // the line box is round(fontSize × lineHeight)). `0` — the default — means
          // the font's natural line box (ascent + descent), which is also what keeps
          // a single-line label's geometry byte-identical to the pre-attribute
          // rendering. Wrapped height, contentHeight, and the `y = center` ink band
          // all follow it.
          lineHeight: { kind: "number" },
          // Author-facing font metrics (compositing.md Part III) — read-only,
          // reactive intrinsics of the EFFECTIVE font, measured (not read from
          // tables — see text.ts). `baseline` is the y of the first baseline
          // inside the view, the cross-font/cross-size alignment fact.
          ascent: { kind: "number" },
          descent: { kind: "number" },
          capHeight: { kind: "number" },
          xHeight: { kind: "number" },
          baseline: { kind: "number" }
        },
        readOnly: ["ascent", "descent", "capHeight", "xHeight", "baseline"]
      };
      ImageSchema = {
        name: "Image",
        base: ViewSchema,
        attrs: {
          source: { kind: "string" },
          // `cover`/`contain` (2026-08-06, assessment 1.1): the aspect-PRESERVING
          // fits — contain letterboxes inside the box, cover fills and crops it —
          // beside the axis stretches, which distort by design.
          stretches: enumType("Stretch", "none", "width", "height", "both", "cover", "contain"),
          // A color multiplied over the bitmap's ALPHA (compositing.md §3.4): the
          // one-mask-asset, many-colors idiom — result color = tint, shape = the
          // bitmap's alpha, exactly template-image rendering. null (the default) =
          // the untouched bitmap. `tint = { theme.accent }` is the canonical read.
          tint: { kind: "color" },
          // READ-ONLY (below): the load lifecycle as two facts, surfaced 2026-07-30
          // (David's ruling) when the network-transport tests found them unreadable
          // from constraints. `loaded` = a bitmap has landed (the placeholder
          // derives from it: `visible = { !pic.loaded }`); `failed` = the CURRENT
          // source's load failed (the broken-avatar fallback), reset when a new
          // load starts.
          loaded: { kind: "boolean" },
          failed: { kind: "boolean" },
          // The bitmap's intrinsic size — zero until `loaded`. What an aspect-true
          // layout derives from: `height = { pic.width * pic.naturalHeight / Math.max(1, pic.naturalWidth) }`.
          naturalWidth: { kind: "number" },
          naturalHeight: { kind: "number" }
        },
        readOnly: ["loaded", "failed", "naturalWidth", "naturalHeight"]
      };
      VideoSchema = {
        name: "Video",
        base: ViewSchema,
        attrs: {
          source: { kind: "string" },
          stretches: enumType("Stretch", "none", "width", "height", "both", "cover", "contain"),
          playing: { kind: "boolean" },
          loop: { kind: "boolean" },
          muted: { kind: "boolean" },
          position: { kind: "number" },
          volume: { kind: "number" },
          playbackRate: { kind: "number" },
          // READ-ONLY: the clip's own facts, for constraints to derive from
          ended: { kind: "boolean" },
          duration: { kind: "number" },
          buffering: { kind: "boolean" },
          loaded: { kind: "boolean" },
          failed: { kind: "boolean" }
        },
        readOnly: ["ended", "duration", "buffering", "loaded", "failed"],
        events: ["ended"]
      };
      DOMIslandSchema = {
        name: "DOMIsland",
        base: ViewSchema,
        attrs: {
          slot: { kind: "string" },
          // the reverse of `env` (host→child): the mounted child app's `appName`,
          // reflected UP by the host so a hosting window can title itself by the
          // child (the viewer names its window by the file it is showing). Host-fed,
          // like the read-only environment channels; "" until a child is up.
          childName: { kind: "string" }
        }
      };
      EditorSchema = {
        name: "Editor",
        base: ViewSchema,
        attrs: {
          commitOn: { kind: "string" },
          // "input" (live) | "blur" | "enter" | "manual"
          error: { kind: "string" },
          // the current validation error, "" when valid
          valid: { kind: "boolean" },
          // does the draft pass validate()?
          dirty: { kind: "boolean" },
          // does the draft differ from the committed value?
          // Does the field hold keyboard focus? Maintained by the runtime, and the
          // fact the house field-chrome's own focus edge derives from — declared here
          // so an author who DISPLACES that chrome (assigning `fill`/`stroke`, the
          // yielding-derive escape) can still render the focus affordance. Read-only
          // in practice: writing it does not move platform focus, `Focus.focus(v)` does.
          focused: { kind: "boolean" }
        }
      };
      TextInputSchema = {
        name: "TextInput",
        base: EditorSchema,
        attrs: {
          text: { kind: "string" },
          placeholder: { kind: "string" },
          multiline: { kind: "boolean" },
          spellcheck: { kind: "boolean" },
          wrap: { kind: "boolean" },
          padding: { kind: "number" },
          // The UNCONTROLLED seed (cf. React's defaultValue vs value): `text` follows
          // `initial` until the user edits, then holds the edit — for a field started
          // from a value (a pristine source) that must stay writable. Being one-shot
          // is the point AND the limit: once edited it stops following, so an app
          // cannot reset a field this way. A bound `text` is the CONTROLLED form —
          // the edit reverts and arrives as `onInput` instead, and a handler writing
          // the bound slot closes the loop (that is the shape that CAN clear a
          // field). Prefer `text <-> :path` for a field editing a dataset record.
          initial: { kind: "string" }
        },
        events: ["input", "enter"]
      };
      RichTextSchema = {
        name: "RichText",
        base: ViewSchema,
        attrs: {
          // Prose tuning: `lineHeight` is a leading multiplier on the natural line box
          // (1 = tight, the default; 1.5 = airy); `bodyColor` overrides the running-text
          // color (null = the theme-aware house body). Body size/weight/tracking follow
          // the ambient text style (fontSize/fontWeight/letterSpacing), like a `Text`.
          lineHeight: { kind: "number" },
          bodyColor: { kind: "color" },
          // `scale` multiplies the house structure sizes (headings, code) — a font-size
          // zoom a reader control can drive; 1 = the natural sizes.
          scale: { kind: "number" },
          // `dark` overrides which color scheme the house rich-element palette (the
          // inline-code chip, the fenced-code box, rules, quotes) is drawn from. Unset
          // (null) follows the root App's OS `dark`; set it to an app's OWN effective
          // theme when a Light/Dark selector can differ from the OS: `dark = { app.isDark }`.
          dark: { kind: "boolean" }
        },
        // A link (`[text](url)` / `<a href>`) was clicked — `onLink(href)`. The runtime
        // supplies mechanism only (the click + href); the app dispatches policy (scroll,
        // route, or `app.navigate(href)`). Unhandled links fall back to `app.navigate(href)`.
        events: ["link"]
      };
      MarkdownSchema = {
        name: "Markdown",
        base: RichTextSchema,
        attrs: {
          text: { kind: "string" }
        }
      };
      HTMLTextSchema = {
        name: "HTMLText",
        base: RichTextSchema,
        attrs: {
          html: { kind: "string" },
          unsupported: enumType("Unsupported", "strip", "error"),
          // Named text fills a `<span class="…">` can reference — a map of name → Fill
          // (`accents = { { accent: gradient("90deg", 0x…, 0x…) } }`). The one styling
          // hook: content names a fill the app defines; it never carries CSS itself.
          accents: { kind: "record", name: "Accents" }
        }
      };
      LayoutSchema = {
        name: "Layout",
        base: NodeSchema,
        attrs: {}
      };
      TweenLayoutSchema = {
        name: "TweenLayout",
        base: LayoutSchema,
        attrs: {
          t: { kind: "number" },
          duration: { kind: "number" }
        }
      };
      DatasetSchema = {
        name: "Dataset",
        base: NodeSchema,
        // `contents` is a derived Dataset's value, always a `{ }` constraint (the
        // JSON body is the literal alternative). checkDataNode enforces the `{ }`
        // form and a code value bypasses `kind` in checkAttr — but the TYPED
        // surface flows from this kind, so it is `object` (any): a derived
        // dataset computes arbitrary structure (the records door made the old
        // `string` formality a real typecheck error).
        attrs: {
          contents: { kind: "object" },
          // The optional data shape (B4, language §9): validate on receipt, check
          // `:path`s statically, declare the identity field. Presence is the only
          // switch — the `:path` surface never changes.
          schema: { kind: "dataschema" },
          // The parsed data itself. `contents` is the author's WRITE slot; this is
          // the read one, and the structural verbs (set/insert/removeAt/move) are
          // how it changes.
          value: { kind: "object" }
        },
        readOnly: ["value"]
      };
      DataSourceSchema = {
        name: "DataSource",
        base: DatasetSchema,
        attrs: {
          url: { kind: "string" },
          // "json" (default) or "text" — what the fetched bytes are (data.ts).
          format: { kind: "string" },
          // "GET" (default) or a body-carrying verb — a non-GET sends `body` (A9).
          method: { kind: "string" },
          // the non-GET request payload: an object/array (JSON-encoded) or a string.
          body: { kind: "object" },
          // auto-fetch on url arrival/change (data.ts maybeAuto) — the opt-in for
          // REACTIVE addresses; explicit fetch() stays the default discipline.
          auto: { kind: "boolean" },
          // ── the lifecycle, read-only (see the note above DatasetSchema) ────────
          // One fact, four spellings: `status` is the state and the booleans derive
          // from it, so they can never disagree. Constraints read these — an entry
          // screen is `visible = { !data.loaded }`, not a flag someone remembers to
          // flip.
          status: enumType("DataStatus", "idle", "loading", "loaded", "failed"),
          idle: { kind: "boolean" },
          loading: { kind: "boolean" },
          loaded: { kind: "boolean" },
          failed: { kind: "boolean" },
          // What went wrong as one line, and what the SERVER said, kept apart:
          // `statusCode` is 0 until a reply arrives (distinct from every real code),
          // `errorBody` is the refusal's payload, parsed when it is JSON.
          error: { kind: "string" },
          statusCode: { kind: "number" },
          errorBody: { kind: "object" }
        },
        readOnly: ["status", "idle", "loading", "loaded", "failed", "error", "statusCode", "errorBody"],
        // fired when a fetch lands, after value+status settle — the imperative
        // arrival hook (constraints keep deriving from .loaded)
        events: ["load"]
      };
      AnimatorSchema = {
        name: "Animator",
        base: NodeSchema,
        attrs: {
          attribute: { kind: "slotref" },
          to: { kind: "number" },
          from: { kind: "number" },
          duration: { kind: "number" },
          repeat: { kind: "number" },
          motion: { kind: "motion" },
          relative: { kind: "boolean" },
          started: { kind: "boolean" },
          paused: { kind: "boolean" },
          // ARRIVAL as a reactive fact (animator.ts) — the animation twin of a
          // DataSource's .loaded: true only at an uninterrupted destination.
          settled: { kind: "boolean" }
        },
        // Bare event names (like View's ["click", …]); handlerName() prefixes `on`,
        // so these answer the onStart / onStop / onRepeat handlers (animation.md §1).
        events: ["start", "stop", "repeat"]
      };
      AnimatorGroupSchema = {
        name: "AnimatorGroup",
        base: NodeSchema,
        attrs: {
          attribute: { kind: "slotref" },
          to: { kind: "number" },
          from: { kind: "number" },
          duration: { kind: "number" },
          repeat: { kind: "number" },
          motion: { kind: "motion" },
          process: enumType("Process", "sequential", "simultaneous"),
          relative: { kind: "boolean" },
          started: { kind: "boolean" },
          paused: { kind: "boolean" }
        },
        events: ["start", "stop", "repeat"]
      };
      SpringSchema = {
        name: "Spring",
        base: AnimatorSchema,
        attrs: {
          stiffness: { kind: "number" },
          damping: { kind: "number" },
          mass: { kind: "number" },
          epsilon: { kind: "number" }
        }
      };
      HeartbeatSchema = {
        name: "Heartbeat",
        base: NodeSchema,
        attrs: {
          running: { kind: "boolean" }
        },
        events: ["frame"]
      };
      KeysSchema = {
        name: "Keys",
        base: NodeSchema,
        // via the abstract Source (sources.ts)
        attrs: {},
        // navClaim: an overlay took (true) / released (false) the navigation keys
        // (keys.ts navClaim) — what a focus indicator stands down for.
        events: ["keyDown", "keyUp", "navClaim"]
      };
      FocusSchema = {
        name: "Focus",
        base: NodeSchema,
        // via the abstract Source (sources.ts)
        attrs: {},
        events: ["focusChange", "geometry"]
      };
      TipSchema = {
        name: "Tip",
        base: NodeSchema,
        // via the abstract Source (sources.ts)
        attrs: {},
        events: ["tip"]
      };
      StreamSchema = {
        name: "Stream",
        base: NodeSchema,
        attrs: {
          url: { kind: "string" },
          active: { kind: "boolean" },
          retry: { kind: "number" },
          status: enumType("StreamStatus", "closed", "connecting", "open", "retrying", "failed"),
          error: { kind: "string" },
          last: { kind: "string" },
          open: { kind: "boolean" }
        },
        readOnly: ["status", "error", "last", "open"],
        events: ["message", "open", "close", "error"]
      };
      EventStreamSchema = {
        name: "EventStream",
        base: StreamSchema,
        attrs: {
          // the named SSE event types to deliver (`listenTo = ["delta", "done"]`)
          // — EventSource cannot hear a named `event:` it was not asked for
          // (streams.md §2), and omission is SILENT, which is why the name carries
          // the contract: you hear what you listen to. Unnamed (default) messages
          // always arrive.
          listenTo: { kind: "array", of: "string" }
        }
      };
      SocketSchema = {
        name: "Socket",
        base: StreamSchema,
        attrs: {}
      };
      StateSchema = {
        name: "State",
        base: NodeSchema,
        attrs: {
          applied: { kind: "boolean" }
        },
        events: ["apply", "remove"]
      };
      SCHEMAS = {
        View: ViewSchema,
        App: AppSchema,
        Text: TextSchema,
        Image: ImageSchema,
        Video: VideoSchema,
        DOMIsland: DOMIslandSchema,
        TextInput: TextInputSchema,
        Markdown: MarkdownSchema,
        HTMLText: HTMLTextSchema,
        Layout: LayoutSchema,
        // Editor — the abstract editing base TextInput extends (commitOn/error/valid/
        // dirty and commit()/revert() live here). In the table so the reference can
        // give it a page and TextInput can inherit from a documented class; NOT in the
        // tag registry, so it stays uninstantiable — exactly Layout's arrangement.
        Editor: EditorSchema,
        TweenLayout: TweenLayoutSchema,
        Dataset: DatasetSchema,
        DataSource: DataSourceSchema,
        Animator: AnimatorSchema,
        AnimatorGroup: AnimatorGroupSchema,
        Spring: SpringSchema,
        Heartbeat: HeartbeatSchema,
        Keys: KeysSchema,
        Focus: FocusSchema,
        Tip: TipSchema,
        // Stream — the abstract base EventStream/Socket extend (url/active/retry +
        // the read-only lifecycle intrinsics live here). In the table so the
        // reference documents it once and subclasses inherit checkably; NOT in the
        // tag registry, so it stays uninstantiable — the Editor arrangement.
        Stream: StreamSchema,
        EventStream: EventStreamSchema,
        Socket: SocketSchema,
        State: StateSchema,
        Node: NodeSchema
      };
      handlerName = (event) => "on" + event[0].toUpperCase() + event.slice(1);
      EVENT_PAYLOAD = {
        // the single-point pointer family — view-local or root-space per handler
        click: "PointerEvent",
        dblClick: "PointerEvent",
        hold: "PointerEvent",
        contextMenu: "PointerEvent",
        pointerDown: "PointerEvent",
        pointerMove: "PointerEvent",
        pointerOver: "PointerEvent",
        pointerOut: "PointerEvent",
        pointerUp: "PointerUpEvent",
        // …plus `canceled`
        touchStart: "TouchEvent",
        touchMove: "TouchEvent",
        touchEnd: "TouchEvent",
        touchCancel: "TouchEvent",
        pinchStart: "PinchEvent",
        pinch: "PinchEvent",
        pinchEnd: "PinchEvent",
        wheel: "WheelEvent",
        // the keyboard — the same normalized payload on a View and on `Keys`
        keyDown: "KeyEvent",
        keyUp: "KeyEvent",
        // value-carrying events
        input: "string",
        // TextInput: the new text
        navClaim: "boolean",
        // Keys: an overlay took/released the nav keys
        link: "string",
        // RichText: the href
        follow: "string",
        // App: the reference being followed (onFollow returns the one to proceed with; "" vetoes)
        frame: "number",
        // Heartbeat: dt, in SECONDS
        focusChange: "View",
        // Focus: the newly focused view
        geometry: "FocusGeometry",
        tip: "TipEvent",
        message: "StreamMessage"
        // Stream: data/type/id (streams.ts)
        // payload-free: focus, blur, escapeFocus, init, enter, load,
        // start, stop, repeat, apply, remove, open, close, error
      };
      PAYLOAD_TYPE_NAMES = /* @__PURE__ */ new Set([
        ...Object.values(EVENT_PAYLOAD),
        "Touch",
        // reachable through TouchEvent.touches
        "Draw",
        "DrawGradient"
        // the `draw(d: Draw)` context (draw.ts)
      ]);
    }
  });

  // runtime/dist/teach.js
  function cssAttributeHint(name) {
    const h = Object.hasOwn(CSS_ATTRIBUTE_HINTS, name) ? CSS_ATTRIBUTE_HINTS[name] : "";
    return h ? ` \u2014 the CSS instinct: ${h}` : "";
  }
  function hintedForeignName(name) {
    return name.length >= 5 ? nearestName(name, Object.keys(CSS_ATTRIBUTE_HINTS)) : null;
  }
  var CSS_ATTRIBUTE_HINTS;
  var init_teach = __esm({
    "runtime/dist/teach.js"() {
      "use strict";
      init_diagnostics();
      CSS_ATTRIBUTE_HINTS = {
        border: "a border is 'stroke = { stroke(1, 0xE2E5E9) }' \u2014 drawn inside the box",
        borderWidth: "a border is 'stroke = { stroke(1, 0xE2E5E9) }' \u2014 width and color travel together",
        borderColor: "a border is 'stroke = { stroke(1, 0xE2E5E9) }' \u2014 width and color travel together",
        borderStyle: "a border is 'stroke = { stroke(width, color) }' \u2014 solid only",
        boxShadow: "a shadow is 'shadow = { shadow(dx, dy, blur, 0x00000040) }'",
        background: "the paint slot is 'fill' (a color or gradient(\u2026))",
        backgroundColor: "the paint slot is 'fill'",
        borderRadius: "rounding is 'cornerRadius'",
        color: "text color is 'textColor' (prevailing \u2014 set it on a container)",
        zIndex: "stacking is source order \u2014 later siblings draw above; there is no z-index",
        overflow: "clipping is 'clip = true'; scrolling is 'scrolls = y' (the axis enum)",
        display: "arrangement is the 'layout' attribute \u2014 'layout: SimpleLayout [ axis = y, spacing = 8 ]'",
        flexDirection: "arrangement is the 'layout' attribute \u2014 'axis = x' or 'axis = y'",
        justifyContent: "arrangement is the 'layout' attribute; fine placement is x/y constraints",
        alignItems: "arrangement is the 'layout' attribute; fine placement is x/y constraints",
        gap: "spacing rides the layout \u2014 'layout: SimpleLayout [ axis = y, spacing = 8 ]'",
        margin: "there is no margin \u2014 position with x/y, a layout's spacing, or a wrapping View",
        padding: "there is no padding \u2014 inset children with x/y or an inner View",
        onChange: "the edit event is 'onInput()'",
        // CSS names for capabilities Declare HAS, reached through the wrong door:
        // These earn their place by the table's own rule — one true equivalent each
        // — and they matter because "no such attribute" ends the search at exactly
        // the wrong moment. (`rotation` graduated from this table 2026-08-06: it IS
        // a View attribute now — compositing.md Part II.)
        rotate: "rotation is the attribute \u2014 'rotation = 45' (degrees, clockwise, about pivotX/pivotY); inside a drawing, d.rotate(rad)",
        transform: "there is no transform: position is x/y, size is width/height, 'scale' and 'rotation' transform about a pivot, and arbitrary geometry is a 'draw(d: Draw)' member",
        filter: "blur and friends are drawing ops \u2014 take a 'draw(d: Draw)' member and set d.filter; to blur what lies BENEATH the view, 'backdrop = frost(radius)'",
        blur: "blur is a drawing op \u2014 take a 'draw(d: Draw)' member and set d.filter = 'blur(4px)'; to blur what lies BENEATH the view, 'backdrop = frost(radius)'",
        mixBlendMode: "compositing is the 'blend' attribute \u2014 'blend = multiply' lands this view with the operator; inside a drawing, d.globalCompositeOperation",
        backdropFilter: "the frost is 'backdrop = frost(radius, saturation)' \u2014 samples and blurs what lies beneath the view's own shape",
        mask: "masking is 'clip' \u2014 true for the box, or a path for an arbitrary shape",
        // The 2026-08-08 foreign-reach audit (HTML/CSS · React · iOS, read against the
        // whole reference): the attribute-position instincts a newcomer actually
        // types, each with its one true equivalent. Question-shaped foreign names
        // (useState, VStack, ScrollView) live in the concept table instead —
        // they are asked, never written in an attribute position.
        flex: "there is no flex \u2014 arrangement is the 'layout' attribute; leftover space goes to a 'Spacer' child; proportions are your own arithmetic ('width = { parent.width * 0.4 }')",
        float: "there is no float \u2014 position with x/y, or let 'layout: WrappingLayout [ ]' flow and wrap children",
        position: "there is no position property \u2014 x/y place a view in its parent; 'ignoreScroll = true' is fixed chrome; 'ignoreLayout = true' opts out of arrangement; stacking is source order",
        visibility: "showing is 'visible' \u2014 a 'visible = false' view stays in the tree but paints nothing, and a layout reclaims its space",
        whiteSpace: "wrapping is Text's 'wrap' \u2014 'wrap = false' is the nowrap; there is no ellipsis (clip = true crops at the box)",
        textOverflow: "there is no text-overflow ellipsis \u2014 'wrap = false' keeps one line and 'clip = true' crops at the box edge",
        maxWidth: "there is no maxWidth \u2014 constrain it: 'width = { Math.min(contentWidth, 480) }'",
        maxHeight: "there is no maxHeight \u2014 constrain it: 'height = { Math.min(contentHeight, 400) }'",
        transition: "there is no transition \u2014 motion is declared beside the attribute: an 'Animator' (timed), a 'Spring' (live target), or a 'State' for a bundle that snaps with motion",
        animation: "there is no animation property \u2014 motion is a member: an 'Animator' (timed, from\u2192to), a 'Spring' (chases a live target), an 'AnimatorGroup' (sequence)",
        keyframes: "there are no keyframes \u2014 an 'Animator' drives one attribute from\u2192to through a motion curve; sequence several with 'AnimatorGroup'",
        fontStyle: "italics are Text's 'italic = true'",
        objectFit: "image fitting is 'stretches' \u2014 'cover' fills and crops, 'contain' letterboxes"
      };
    }
  });

  // runtime/dist/include.js
  function exciseSpans(source, spans) {
    let out = source;
    for (const s of [...spans].sort((a, b) => b.start - a.start)) {
      out = out.slice(0, s.start) + out.slice(s.end);
    }
    return out;
  }
  function resolveIncludes(program, host2, originDir) {
    const errors = [];
    const classes = [...program.classes];
    const stylesheets = [...program.stylesheets];
    const styles = [...program.styles];
    const fonts = [...program.fonts];
    const uses = [...program.uses];
    const scripts = [...program.scripts];
    const sources = [];
    const MAIN = "the app";
    const origin = /* @__PURE__ */ new Map();
    for (const c of program.classes)
      origin.set(c.name, MAIN);
    for (const s of program.stylesheets)
      origin.set(s.name, MAIN);
    for (const s of program.styles)
      origin.set(s.name, MAIN);
    for (const f of program.fonts)
      origin.set(f.name, MAIN);
    const visited = /* @__PURE__ */ new Set();
    const fold = (name, pos, from) => {
      const prev = origin.get(name);
      if (prev !== void 0) {
        errors.push(Diag.includeCollision(`'${name}' is declared twice \u2014 in "${from}" and "${prev}"`, pos));
        return false;
      }
      origin.set(name, from);
      return true;
    };
    const walk = (includes, fromDir) => {
      for (const inc of includes) {
        const resolved = host2.resolve(fromDir, inc.path);
        if (resolved === null) {
          errors.push(Diag.missingInclude(inc.path, inc.pos));
          continue;
        }
        if (visited.has(resolved.canonical))
          continue;
        visited.add(resolved.canonical);
        let lib;
        try {
          lib = parseLibrary(resolved.source);
        } catch (e) {
          if (e instanceof DeclareError) {
            errors.push(e);
            continue;
          }
          throw e;
        }
        walk(lib.includes, resolved.dir);
        const from = inc.path;
        for (const c of lib.classes)
          if (fold(c.name, c.pos, from))
            classes.push(c);
        for (const s of lib.stylesheets)
          if (fold(s.name, s.pos, from))
            stylesheets.push(s);
        for (const s of lib.styles)
          if (fold(s.name, s.pos, from))
            styles.push(s);
        for (const f of lib.fonts)
          if (fold(f.name, f.pos, from))
            fonts.push(f);
        uses.push(...lib.uses);
        scripts.push(...lib.scripts);
        sources.push(exciseSpans(resolved.source, lib.includeSpans));
      }
    };
    walk(program.includes, originDir);
    return {
      program: { classes, stylesheets, styles, fonts, includes: [], includeSpans: [], uses: [...new Set(uses)], scripts, root: program.root },
      sources,
      errors,
      visited
    };
  }
  function autoIncludableNames() {
    return autoIncludable;
  }
  var NO_INCLUDES, autoIncludable;
  var init_include = __esm({
    "runtime/dist/include.js"() {
      "use strict";
      init_parser();
      init_errors();
      init_diagnostics();
      NO_INCLUDES = { resolve: () => null };
      autoIncludable = [];
    }
  });

  // runtime/dist/datapath.js
  function staticSegs(plan) {
    const out = [];
    for (const s of plan) {
      if (typeof s === "string")
        out.push(s);
      else if ("i" in s && s.i >= 0)
        out.push(String(s.i));
      else
        return null;
    }
    return out;
  }
  function unescapeName(body, quote) {
    let out = "";
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (c !== "\\") {
        out += c;
        continue;
      }
      const e = body[++i];
      if (e === void 0)
        return null;
      if (e === "b")
        out += "\b";
      else if (e === "t")
        out += "	";
      else if (e === "n")
        out += "\n";
      else if (e === "f")
        out += "\f";
      else if (e === "r")
        out += "\r";
      else if (e === "/")
        out += "/";
      else if (e === "\\")
        out += "\\";
      else if (e === quote)
        out += quote;
      else if (e === "u") {
        const hex = body.slice(i + 1, i + 5);
        if (!/^[0-9a-fA-F]{4}$/.test(hex))
          return null;
        out += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else
        return null;
    }
    return out;
  }
  function parsePathSpec(raw) {
    const t = raw.trim();
    if (t === "*")
      return { seg: { w: 1 }, text: "[*]" };
    if (t.startsWith("?")) {
      return { error: "filter selectors ([?\u2026]) are not in the path subset yet (jsonpath-spelling.md \xA75) \u2014 derive the subset in a Dataset [ contents = { \u2026 } ] and bind to that" };
    }
    if (t.startsWith("'") || t.startsWith('"')) {
      const q = t[0];
      if (t.length < 2 || !t.endsWith(q))
        return { error: "unterminated quoted name" };
      const un = unescapeName(t.slice(1, -1), q);
      if (un === null)
        return { error: `bad escape in a quoted name (RFC 9535 string escapes: \\\\ \\' \\" \\b \\t \\n \\f \\r \\uXXXX)` };
      return { seg: un, text: `[${JSON.stringify(un)}]` };
    }
    if (t.includes(",")) {
      return { error: "union selectors ([a, b]) are not in the path subset (jsonpath-spelling.md \xA75) \u2014 write separate reads, or derive the set in a Dataset [ contents = { \u2026 } ]" };
    }
    const parts = t.split(":");
    if (parts.length > 3)
      return { error: "a slice is [start:end] or [start:end:step]" };
    const nums = [];
    for (const p of parts) {
      const s = p.trim();
      if (s === "") {
        nums.push(null);
        continue;
      }
      if (!/^-?\d+$/.test(s))
        return { error: "a path selector is [index], [start:end:step], [*], or ['name']" };
      nums.push(parseInt(s, 10));
    }
    if (parts.length === 1) {
      if (nums[0] === null)
        return { error: "a path selector is [index], [start:end:step], [*], or ['name']" };
      return { seg: { i: nums[0] }, text: `[${nums[0]}]` };
    }
    while (nums.length < 3)
      nums.push(null);
    const text = `[${nums.map((v) => v === null ? "" : String(v)).join(":").replace(/:$/, "")}]`;
    return { seg: { s: nums }, text };
  }
  function scanDatapaths(src) {
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
      i++;
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
    const code = (inSubstitution) => {
      let depth = 0;
      let ends = false;
      while (i < n) {
        const c = src[i];
        if (c === " " || c === "	" || c === "\r" || c === "\n") {
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
          ends = true;
          continue;
        }
        if (c === ":" && !ends && isIdentStart2(src[i + 1])) {
          const start = i;
          i++;
          let path = "";
          const plan = [];
          let planful = false;
          let trouble = null;
          let many = false;
          {
            let name = "";
            while (i < n && isIdentPart2(src[i]))
              name += src[i++];
            path += name;
            plan.push(name);
          }
          for (; ; ) {
            if (src[i] === "." && isIdentStart2(src[i + 1])) {
              let j = i + 1;
              let name = "";
              while (j < n && isIdentPart2(src[j]))
                name += src[j++];
              if (src[j] === "(")
                break;
              i = j;
              path += "." + name;
              plan.push(name);
              continue;
            }
            if (src[i] === "." && src[i + 1] === "*") {
              i += 2;
              path += "[*]";
              plan.push({ w: 1 });
              planful = true;
              continue;
            }
            if (src[i] === "[") {
              i++;
              let spec = "";
              let q = null;
              while (i < n) {
                const ch = src[i];
                if (q !== null) {
                  if (ch === "\\") {
                    spec += ch + (src[i + 1] ?? "");
                    i += 2;
                    continue;
                  }
                  if (ch === q)
                    q = null;
                  spec += ch;
                  i++;
                  continue;
                }
                if (ch === "'" || ch === '"') {
                  q = ch;
                  spec += ch;
                  i++;
                  continue;
                }
                if (ch === "]")
                  break;
                spec += ch;
                i++;
              }
              if (i >= n || src[i] !== "]") {
                trouble ??= `':${path}[' \u2014 unclosed '[' in a path selector`;
                break;
              }
              i++;
              if (spec.trim() === "") {
                many = true;
                break;
              }
              const r = parsePathSpec(spec);
              if ("error" in r) {
                trouble ??= `':${path}[${spec.trim()}]' \u2014 ${r.error}`;
                path += `[${spec.trim()}]`;
                planful = true;
                continue;
              }
              path += r.text;
              plan.push(r.seg);
              planful = true;
              continue;
            }
            break;
          }
          out.push({ start, end: i, path, many, plan: planful ? plan : void 0, trouble });
          ends = true;
          continue;
        }
        if (isIdentStart2(c)) {
          let word = "";
          while (i < n && isIdentPart2(src[i]))
            word += src[i++];
          ends = !NON_ENDING.has(word);
          continue;
        }
        if (c >= "0" && c <= "9") {
          while (i < n && (isIdentPart2(src[i]) || src[i] === "."))
            i++;
          ends = true;
          continue;
        }
        if (c === ")" || c === "]") {
          i++;
          ends = true;
          continue;
        }
        i++;
        ends = false;
      }
    };
    code(false);
    return out;
  }
  function datapathTrouble(src, islands) {
    for (const p of islands) {
      if (p.trouble != null)
        return p.trouble;
      if (p.path === "$" || p.path.startsWith("$.")) {
        return `':${p.path}' \u2014 a :path has no JSONPath root ('${":" + p.path.replace(/^\$\.?/, "")}' is already cursor-anchored, jsonpath-spelling.md \xA71); drop the '$.'`;
      }
      const c = src[p.end] ?? "";
      const d = src[p.end + 1] ?? "";
      if (c === "-" && isIdentPart2(d)) {
        return `':${p.path}-\u2026' is ambiguous \u2014 for subtraction write ':${p.path} - \u2026' (spaced); for a dashed KEY write a quoted-name selector: ':${beforeLastName(p.path)}['${lastName(p.path)}-\u2026']'`;
      }
      if (c === ".") {
        if (d >= "0" && d <= "9")
          return `':${p.path}.${d}\u2026' \u2014 a numeric segment is written as an index selector: ':${p.path}[${d}\u2026]'`;
        if (d === ".")
          return `':${p.path}..' \u2014 descendant search ('..') is not in the path subset: it selects an unbounded, shape-dependent set that cannot be tracked reactively at acceptable cost (jsonpath-spelling.md \xA73); spell the path to the level you mean`;
      }
    }
    return null;
  }
  function rewriteDatapaths(src) {
    const islands = scanDatapaths(src);
    if (islands.length === 0)
      return { src };
    const trouble = datapathTrouble(src, islands);
    if (trouble !== null)
      return { error: trouble };
    const many = islands.find((p) => p.many);
    if (many !== void 0) {
      return {
        error: `reads ':${many.path}[]' \u2014 a many-path replicates and belongs on a datapath attribute; a { } body reads a single :path`
      };
    }
    let out = "";
    let at = 0;
    for (const p of islands) {
      out += src.slice(at, p.start) + `this.$data(${JSON.stringify(p.plan ?? splitPath(p.path))})`;
      at = p.end;
    }
    return { src: out + src.slice(at) };
  }
  var isSelective, splitPath, NON_ENDING, isIdentStart2, isIdentPart2, lastName, beforeLastName;
  var init_datapath = __esm({
    "runtime/dist/datapath.js"() {
      "use strict";
      isSelective = (plan) => plan.some((s) => typeof s !== "string" && !("i" in s));
      splitPath = (path) => path === "" ? [] : path.split(".");
      NON_ENDING = /* @__PURE__ */ new Set([
        "return",
        "typeof",
        "instanceof",
        "in",
        "of",
        "new",
        "do",
        "else",
        "case",
        "void",
        "delete",
        "throw",
        "yield",
        "await"
      ]);
      isIdentStart2 = (c) => c >= "a" && c <= "z" || c >= "A" && c <= "Z" || c === "_" || c === "$";
      isIdentPart2 = (c) => isIdentStart2(c) || c >= "0" && c <= "9";
      lastName = (path) => path.slice(path.lastIndexOf(".") + 1);
      beforeLastName = (path) => {
        const k = path.lastIndexOf(".");
        return k < 0 ? "" : path.slice(0, k + 1);
      };
    }
  });

  // runtime/dist/expr.js
  function setBodyServices(services) {
    SCOPE = { ...DECOR, ...LOWERED, ...services };
    PRELUDE = `const { ${Object.keys(SCOPE).join(", ")} } = $d;`;
  }
  function withScriptScope(scope, build2) {
    SCRIPT_STACK.push(SCRIPT_SCOPE);
    SCRIPT_SCOPE = scope;
    try {
      return build2();
    } finally {
      SCRIPT_SCOPE = SCRIPT_STACK.pop() ?? {};
    }
  }
  function evalScript(js) {
    const fn = new Function(`"use strict"; ${js}`);
    const out = fn();
    return out !== null && typeof out === "object" ? out : {};
  }
  function scriptPrelude(scope) {
    const names = Object.keys(scope).filter((n) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n));
    return names.length > 0 ? `const { ${names.join(", ")} } = $s;` : "";
  }
  function compileExpr(src) {
    const scripts = SCRIPT_SCOPE;
    let memo = EXPR_MEMO.get(scripts);
    if (memo === void 0)
      EXPR_MEMO.set(scripts, memo = /* @__PURE__ */ new Map());
    const hit = memo.get(src);
    if (hit !== void 0)
      return hit;
    const out = (() => {
      const r = rewriteDatapaths(src);
      if ("error" in r)
        return r;
      try {
        const raw = new Function("$d", "$s", "parent", "classroot", `"use strict"; ${PRELUDE} ${scriptPrelude(scripts)} return (${r.src});`);
        return {
          fn: function(parent, classroot) {
            return raw.call(this, SCOPE, scripts, parent, classroot);
          }
        };
      } catch (e) {
        return { error: `is not a valid expression \u2014 ${e.message}` };
      }
    })();
    memo.set(src, out);
    return out;
  }
  function hashToOx(hex) {
    const full = hex.length === 3 || hex.length === 4 ? hex.split("").map((c) => c + c).join("") : hex;
    return "0x" + full.toLowerCase();
  }
  function looksLikeStatements(src, raw) {
    if (/reserved word/i.test(raw))
      return true;
    if (/(^|[;{])\s*(let|const|var|if|for|while|switch|return|throw)\b/.test(src))
      return true;
    const semi = src.indexOf(";");
    return semi >= 0 && src.slice(semi + 1).trim().length > 0;
  }
  function refineBodyError(src, raw, expression) {
    const dash = raw.indexOf(" \u2014 ");
    const head = dash >= 0 ? raw.slice(0, dash) : raw;
    const hash = src.match(/#([0-9a-fA-F]{3,8})(?![0-9a-fA-F])/);
    if (hash && /invalid character|private identifier/i.test(raw)) {
      return `${head} \u2014 inside { } a color is written ${hashToOx(hash[1])}, not ${hash[0]} (the #\u2026 and named-color forms work only in bare slots)`;
    }
    const pct = src.match(/(?:^|[^\w.])(\d+(?:\.\d+)?)\s*%(?!\s*[\w(])/);
    if (pct && /expression expected|unexpected|invalid/i.test(raw)) {
      const frac = Number((Number(pct[1]) / 100).toFixed(6));
      return `${head} \u2014 there are no percentages: read the parent and scale, so ${pct[1]}% is { parent.width * ${frac} }`;
    }
    if (expression && looksLikeStatements(src, raw)) {
      return `${head} \u2014 an attribute value is one expression, not statements; move the logic into a method and call it (e.g. { classroot.compute() })`;
    }
    return raw;
  }
  function validateExpr(src) {
    let e;
    if (syntaxValidator !== null) {
      const r = rewriteDatapaths(src);
      if ("error" in r)
        return r.error;
      e = syntaxValidator(r.src, true);
    } else {
      const c = compileExpr(src);
      e = "error" in c ? c.error : null;
    }
    return e === null ? null : refineBodyError(src, e, true);
  }
  function validateBody(params, src) {
    let e;
    if (syntaxValidator !== null) {
      const r = rewriteDatapaths(src);
      if ("error" in r)
        return r.error;
      e = syntaxValidator(r.src, false);
    } else {
      const c = compileBody(params, src);
      e = "error" in c ? c.error : null;
    }
    return e === null ? null : refineBodyError(src, e, false);
  }
  function compileBody(params, src) {
    const scripts = SCRIPT_SCOPE;
    let memo = BODY_MEMO.get(scripts);
    if (memo === void 0)
      BODY_MEMO.set(scripts, memo = /* @__PURE__ */ new Map());
    const key = params.join("") + "\0" + src;
    const hit = memo.get(key);
    if (hit !== void 0)
      return hit;
    const out = (() => {
      const r = rewriteDatapaths(src);
      if ("error" in r)
        return r;
      try {
        const raw = new Function("$d", "$s", "parent", "classroot", ...params, `"use strict"; ${PRELUDE} ${scriptPrelude(scripts)} { ${r.src} }`);
        return {
          fn: function(parent, classroot, ...args) {
            return raw.call(this, SCOPE, scripts, parent, classroot, ...args);
          }
        };
      } catch (e) {
        return { error: `is not a valid method body \u2014 ${e.message}` };
      }
    })();
    memo.set(key, out);
    return out;
  }
  var DECOR, LOWERED, SCOPE, PRELUDE, SCRIPT_SCOPE, SCRIPT_STACK, CONSTRUCTOR_NAMES, EXPR_MEMO, BODY_MEMO, syntaxValidator;
  var init_expr = __esm({
    "runtime/dist/expr.js"() {
      "use strict";
      init_datapath();
      init_value();
      DECOR = { gradient, stroke, shadow, stop, frost };
      LOWERED = { colorWithAlpha };
      SCOPE = { ...DECOR, ...LOWERED };
      PRELUDE = `const { ${Object.keys(SCOPE).join(", ")} } = $d;`;
      SCRIPT_SCOPE = {};
      SCRIPT_STACK = [];
      CONSTRUCTOR_NAMES = Object.keys(DECOR);
      EXPR_MEMO = /* @__PURE__ */ new WeakMap();
      BODY_MEMO = /* @__PURE__ */ new WeakMap();
      syntaxValidator = null;
    }
  });

  // runtime/dist/font.js
  function faceWeight(token) {
    const w = FONT_WEIGHTS[token];
    return w === void 0 ? null : String(w);
  }
  function sourceArg(name, call) {
    if (call.args.length !== 1 || call.args[0].kind !== "string") {
      throw new DeclareError(`${name}(\u2026) takes one quoted string`, call.pos);
    }
    return call.args[0].value;
  }
  function cssSource(lit) {
    switch (lit.kind) {
      case "string":
        return `url(${JSON.stringify(lit.value)})`;
      case "call":
        if (lit.name === "url")
          return `url(${JSON.stringify(sourceArg("url", lit))})`;
        if (lit.name === "local")
          return `local(${JSON.stringify(sourceArg("local", lit))})`;
        throw new DeclareError(`a face source is a URL string, url("\u2026"), local("\u2026"), or a list of them \u2014 not '${lit.name}(\u2026)'`, lit.pos);
      case "list":
        if (lit.items.length === 0)
          throw new DeclareError(`a face source list is empty`, lit.pos);
        return lit.items.map(cssSource).join(", ");
      default:
        throw new DeclareError(`a face source is a URL string, url("\u2026"), local("\u2026"), or a list of them`, lit.pos);
    }
  }
  function buildFace(fontName, family, face) {
    let src = null;
    let weight = "400";
    let style = "normal";
    for (const a of face.attrs) {
      if (a.name === "src") {
        src = cssSource(a.value);
        continue;
      }
      if (a.name === "weight") {
        if (a.value.kind !== "ident")
          throw new DeclareError(`font ${fontName}: a Face weight is a token (thin \u2026 black)`, a.value.pos);
        const w = faceWeight(a.value.name);
        if (w === null)
          throw new DeclareError(`font ${fontName}: '${a.value.name}' is not a weight \u2014 use one of ${Object.keys(FONT_WEIGHTS).join(", ")}`, a.value.pos);
        weight = w;
        continue;
      }
      if (a.name === "italic") {
        style = a.value.kind === "ident" && a.value.name === "true" ? "italic" : "normal";
        continue;
      }
      throw new DeclareError(`font ${fontName}: a Face has src, weight, italic \u2014 not '${a.name}'`, a.pos);
    }
    if (src === null)
      throw new DeclareError(`font ${fontName}: a Face needs a src`, face.pos);
    return { family, src, weight, style };
  }
  function buildFonts(decls) {
    const map = /* @__PURE__ */ new Map();
    for (const decl of decls) {
      const b = decl.body;
      let family = decl.name;
      for (const a of b.attrs) {
        if (a.name === "family" && a.value.kind === "string") {
          family = a.value.value;
          continue;
        }
        throw new DeclareError(`font ${decl.name}: a font body carries 'family = "\u2026"' and Face children only`, a.pos);
      }
      const faces = b.children.map((c) => {
        if (c.tag !== "Face")
          throw new DeclareError(`font ${decl.name}: '${c.tag}' is not a Face`, c.pos);
        return buildFace(decl.name, family, c);
      });
      if (b.attrs.length === 0 && faces.length === 0) {
        throw new DeclareError(`font ${decl.name}: declare a family ('family = "\u2026"') or at least one Face`, decl.pos);
      }
      map.set(decl.name, { name: decl.name, family, faces });
    }
    return map;
  }
  function collectFaces(fonts) {
    const out = [];
    for (const f of fonts.values())
      out.push(...f.faces);
    return out;
  }
  function registerFontFaces(root, faces) {
    FACES.set(root, faces);
  }
  function fontFacesOf(root) {
    return FACES.get(root) ?? [];
  }
  var FONT_WEIGHTS, FACES;
  var init_font = __esm({
    "runtime/dist/font.js"() {
      "use strict";
      init_errors();
      FONT_WEIGHTS = Object.freeze({
        thin: 100,
        extralight: 200,
        light: 300,
        regular: 400,
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
        extrabold: 800,
        black: 900
      });
      FACES = /* @__PURE__ */ new WeakMap();
    }
  });

  // runtime/dist/program-schema.js
  function programSchemas(classes) {
    const infos = [];
    const schemas = { ...SCHEMAS };
    const errors = [];
    const classNames = new Set(classes.map((c) => c.name));
    const isComponentName = (n) => Object.hasOwn(schemas, n) || classNames.has(n);
    const byName = /* @__PURE__ */ new Map();
    for (const decl of classes) {
      if (Object.hasOwn(SCHEMAS, decl.name) || byName.has(decl.name)) {
        errors.push(new DeclareError(`there is already a component named '${decl.name}'`, decl.pos));
        continue;
      }
      byName.set(decl.name, decl);
    }
    const state = /* @__PURE__ */ new Map();
    const build2 = (decl) => {
      if (state.get(decl.name) === "done")
        return;
      if (state.get(decl.name) === "building")
        return;
      state.set(decl.name, "building");
      if (!Object.hasOwn(schemas, decl.base)) {
        const userBase = byName.get(decl.base);
        if (userBase !== void 0) {
          if (state.get(decl.base) === "building") {
            errors.push(new DeclareError(`'${decl.name}' and '${decl.base}' extend each other (an inheritance cycle) \u2014 the chain can never reach a built-in; break the loop`, decl.basePos));
            state.set(decl.name, "done");
            return;
          }
          build2(userBase);
        }
      }
      if (!Object.hasOwn(schemas, decl.base)) {
        if (!byName.has(decl.base)) {
          errors.push(new DeclareError(`unknown base '${decl.base}' \u2014 a class extends a built-in component or a class declared in this program`, decl.basePos));
        }
        state.set(decl.name, "done");
        return;
      }
      const base2 = schemas[decl.base];
      const NODE_ROOTS = ["Dataset", "DataSource", "Animator", "AnimatorGroup", "Heartbeat", "Keys", "Focus", "Tip", "State"];
      const wired = descendsFrom(base2, "View") || descendsFrom(base2, "Layout") || descendsFrom(base2, "Node") && !NODE_ROOTS.some((n) => descendsFrom(base2, n));
      if (!wired) {
        errors.push(new DeclareError(`subclassing '${decl.base}' is not wired yet \u2014 a class extends View, Layout, or Node today (Dataset/Animator want the same plumbing; State is declarative)`, decl.basePos));
        state.set(decl.name, "done");
        return;
      }
      const attrs = {};
      const defaults = {};
      const prevailing = [];
      const readOnly = [];
      for (const d of decl.body.decls) {
        const r = checkDecl(base2, d, decl.name, isComponentName);
        if (!r.ok) {
          errors.push(r.error);
          continue;
        }
        if (Object.hasOwn(attrs, d.name))
          continue;
        attrs[d.name] = r.type;
        defaults[d.name] = r.value;
        if (d.prevailing)
          prevailing.push(d.name);
        if (d.readOnly)
          readOnly.push(d.name);
      }
      const schema = { name: decl.name, base: base2, attrs, prevailing, readOnly };
      schemas[decl.name] = schema;
      infos.push({ decl, schema, defaults });
      state.set(decl.name, "done");
    };
    for (const decl of byName.values())
      build2(decl);
    const uses = /* @__PURE__ */ new Map();
    const collect = (el, into) => {
      for (const child of el.children) {
        if (uses.has(child.tag))
          into.add(child.tag);
        collect(child, into);
      }
    };
    for (const info of infos)
      uses.set(info.decl.name, /* @__PURE__ */ new Set());
    for (const info of infos)
      collect(info.decl.body, uses.get(info.decl.name));
    for (const info of infos) {
      const seen = /* @__PURE__ */ new Set();
      const reaches = (name) => {
        if (seen.has(name))
          return false;
        seen.add(name);
        const used = uses.get(name);
        return used !== void 0 && (used.has(info.decl.name) || [...used].some(reaches));
      };
      if (uses.get(info.decl.name).has(info.decl.name) || [...uses.get(info.decl.name)].some(reaches)) {
        errors.push(new DeclareError(`class ${info.decl.name} contains itself \u2014 a class may not appear inside its own body (directly or through another class)`, info.decl.pos));
      }
    }
    return { infos, schemas, errors };
  }
  function coerceToken(lit) {
    switch (lit.kind) {
      case "number":
        return lit.value;
      case "string":
        return lit.value;
      case "hexColor": {
        const c = coerce({ kind: "color" }, lit);
        return c.ok ? c.value : void 0;
      }
      case "ident": {
        if (lit.name === "true")
          return true;
        if (lit.name === "false")
          return false;
        if (lit.name === "null")
          return null;
        const c = coerce({ kind: "color" }, lit);
        return c.ok ? c.value : void 0;
      }
      case "call": {
        const asFill = coerce({ kind: "fill" }, lit);
        if (asFill.ok)
          return asFill.value;
        const asStroke = coerce({ kind: "stroke" }, lit);
        if (asStroke.ok)
          return asStroke.value;
        const asShadow = coerce({ kind: "shadow" }, lit);
        if (asShadow.ok)
          return asShadow.value;
        const asBackdrop = coerce({ kind: "backdrop" }, lit);
        return asBackdrop.ok ? asBackdrop.value : void 0;
      }
      default:
        return void 0;
    }
  }
  function checkDecl(schema, d, owner = schema.name, isComponent = () => false) {
    const err2 = (message, pos) => ({ ok: false, error: new DeclareError(message, pos) });
    if (NOUNS.includes(d.name)) {
      return err2(`'${d.name}' is a scope noun (language \xA711) \u2014 it cannot be declared`, d.pos);
    }
    if (RESERVED.includes(d.name)) {
      return err2(`'${d.name}' is a value constructor (gradient/stroke/shadow/stop/frost) \u2014 it cannot be a member name`, d.pos);
    }
    if (attrType(schema, d.name) !== null) {
      if (isReadOnly(schema, d.name)) {
        return err2(`'${d.name}' is a built-in read-only intrinsic of ${schema.name} \u2014 it is computed for you; choose another name for your derived value`, d.pos);
      }
      return err2(`${schema.name} already has an attribute '${d.name}' \u2014 a declaration introduces a new one; write '${d.name} = \u2026' to set the existing one`, d.pos);
    }
    const arrayOf = (n) => {
      if (!n.endsWith("[]"))
        return null;
      const base2 = n.slice(0, -2);
      const okBase = declaredType(base2) !== null || isComponent(base2) || base2.endsWith("[]") && arrayOf(base2) !== null;
      return okBase ? { kind: "array", of: base2 } : null;
    };
    const type = declaredType(d.type) ?? arrayOf(d.type) ?? (d.type.startsWith("(") ? { kind: "fn", written: d.type } : null) ?? (isComponent(d.type) ? { kind: "component", of: d.type } : null);
    if (type === null) {
      return err2(`unknown type '${d.type}' \u2014 a declared attribute's type is one of ${DECLARED_TYPE_NAMES.join(", ")}, a component class, or a function type '(a: T) -> R'`, d.typePos);
    }
    if (d.def === null)
      return { ok: true, type, value: void 0 };
    if (d.def.kind === "code") {
      const e = validateExpr(d.def.src);
      if (e !== null) {
        return err2(`${owner}.${d.name}'s default = { \u2026 } ${e}`, d.def.pos);
      }
      return { ok: true, type, value: void 0, binding: { src: d.def.src, pos: d.def.pos } };
    }
    if (d.def.kind === "percent") {
      return err2(`${owner}.${d.name}: a percent default would resolve against each instance's parent \u2014 set it per instance until percent defaults are designed`, d.def.pos);
    }
    if (type.kind === "array" && d.def.kind === "list") {
      const items = [];
      for (const it of d.def.items) {
        if (it.kind === "number" || it.kind === "string") {
          items.push(it.value);
          continue;
        }
        if (it.kind === "hexColor" || it.kind === "ident" && it.name !== "null" && it.name !== "true" && it.name !== "false") {
          const cc = coerce({ kind: "color" }, it);
          if (!cc.ok) {
            return err2(`${owner}.${d.name}: a bare list holds plain values \u2014 numbers, strings, booleans, null, colors. For anything computed, write the whole list as a { } binding`, it.pos);
          }
          items.push(cc.value);
          continue;
        }
        if (it.kind === "ident") {
          items.push(it.name === "null" ? null : it.name === "true");
          continue;
        }
        return err2(`${owner}.${d.name}: a bare list holds plain values \u2014 numbers, strings, booleans, null, colors. For anything computed, write the whole list as a { } binding`, it.pos);
      }
      return { ok: true, type, value: Object.freeze(items) };
    }
    const c = coerce(type, d.def);
    if (!c.ok) {
      const hint = d.def.kind === "path" ? ` \u2014 to seed from data, write a { } default: ${d.name}: ${d.type} = { :${d.def.path} }` : "";
      return err2(`${owner}.${d.name}'s default expects ${c.expected}, got ${c.found ?? describeLiteral(d.def)}${hint}`, d.def.pos);
    }
    return { ok: true, type, value: c.value };
  }
  function withDecls(schema, decls, isComponent = () => false) {
    if (decls.length === 0)
      return schema;
    const attrs = {};
    const prevailing = [];
    for (const d of decls) {
      const r = checkDecl(schema, d, schema.name, isComponent);
      if (r.ok && !Object.hasOwn(attrs, d.name)) {
        attrs[d.name] = r.type;
        if (d.prevailing)
          prevailing.push(d.name);
      }
    }
    return { name: schema.name, base: schema, attrs, prevailing };
  }
  function manyPathOf(el, schemas) {
    const schema = Object.hasOwn(schemas, el.tag) ? schemas[el.tag] : null;
    if (schema === null)
      return null;
    for (const a of el.attrs) {
      if (a.value.kind === "path" && a.value.many && attrType(schema, a.name)?.kind === "cursor") {
        return a;
      }
    }
    return null;
  }
  var NOUNS, RESERVED;
  var init_program_schema = __esm({
    "runtime/dist/program-schema.js"() {
      "use strict";
      init_errors();
      init_schema();
      init_value();
      init_expr();
      NOUNS = ["this", "parent", "classroot", "app"];
      RESERVED = CONSTRUCTOR_NAMES;
    }
  });

  // runtime/dist/check.js
  function tagCandidates(schemas) {
    return [.../* @__PURE__ */ new Set([...Object.keys(schemas), ...autoIncludableNames()])];
  }
  function check(input) {
    const program = "root" in input ? input : { classes: [], stylesheets: [], styles: [], fonts: [], includes: [], includeSpans: [], uses: [], scripts: [], root: input };
    const { infos, schemas, errors } = programSchemas(program.classes);
    const env = checkStyleDecls(program, schemas, errors);
    for (const info of infos) {
      checkBodyRootReplication(info.decl.body, errors, `class ${info.decl.name}'s own body`);
      checkElement(info.decl.body, errors, schemas, true, env, null, true);
    }
    checkBodyRootReplication(program.root, errors, "the program root");
    checkElement(program.root, errors, schemas, false, env);
    for (const info of infos)
      checkSignatureTypes(info.decl.body, errors, schemas);
    checkSignatureTypes(program.root, errors, schemas);
    for (const name of program.uses) {
      if (name === "Layout") {
        errors.push(new DeclareError(`use [ Layout ]: 'Layout' is the abstract base \u2014 it names no arrangement to keep. Name a concrete strategy (SimpleLayout, WrappingLayout, ResponsiveLayout, \u2026)`, program.root.pos));
      } else if (!Object.hasOwn(schemas, name)) {
        errors.push(new DeclareError(`use [ ${name} ]: unknown component '${name}' \u2014 a use entry names a built-in or a declared/included class`, program.root.pos));
      }
    }
    errors.sort((a, b) => (a.pos?.offset ?? 0) - (b.pos?.offset ?? 0));
    return errors;
  }
  function checkSignatureTypes(el, errors, schemas) {
    const known2 = (n) => {
      if (n.endsWith("[]"))
        return known2(n.slice(0, -2));
      if (n.startsWith("(")) {
        const types = n.replace(/[A-Za-z_$][\w$]*\s*:/g, " ").match(/[A-Za-z_$][\w$]*/g) ?? [];
        return types.every((w) => w === "void" || known2(w));
      }
      return declaredType(n) !== null || schemas[n] !== void 0 || PAYLOAD_TYPE_NAMES.has(n);
    };
    const schema = schemas[el.tag];
    const firstUnknown = (n) => {
      if (n.endsWith("[]"))
        return firstUnknown(n.slice(0, -2));
      if (!n.startsWith("("))
        return known2(n) ? null : n;
      const types = n.replace(/[A-Za-z_$][\w$]*\s*:/g, " ").match(/[A-Za-z_$][\w$]*/g) ?? [];
      return types.find((w) => w !== "void" && !known2(w)) ?? null;
    };
    for (const m of el.methods) {
      const ev = schema === void 0 ? null : eventOfHandler(m.name);
      if (ev !== null && eventsOf(schema).includes(ev)) {
        const payload = EVENT_PAYLOAD[ev];
        const first = m.params[0];
        if (payload === void 0 && first?.type !== void 0) {
          errors.push(new DeclareError(`'${m.name}' receives nothing \u2014 the '${ev}' event carries no payload, so write '${m.name}()'`, first.typePos ?? m.pos));
        } else if (payload !== void 0 && first?.type !== void 0 && first.type !== payload) {
          errors.push(new DeclareError(`'${m.name}' receives a ${payload} \u2014 write '${m.name}(${first.name}: ${payload})', not '${first.type}'`, first.typePos ?? m.pos));
        }
      }
      for (const prm of m.params) {
        if (prm.type === void 0) {
          const payload = ev !== null && schema !== void 0 && eventsOf(schema).includes(ev) ? EVENT_PAYLOAD[ev] : void 0;
          errors.push(new DeclareError(payload !== void 0 ? `'${prm.name}' needs its payload type \u2014 write '${m.name}(${prm.name}: ${payload})'` : `parameter '${prm.name}' has no type \u2014 a signature is typed name-first: '${m.name}(${prm.name}: number)' (a primitive, a component class, a function type, or 'object' for a genuinely shapeless value)`, m.pos));
          continue;
        }
        const badP = prm.type === void 0 ? null : firstUnknown(prm.type);
        if (badP !== null) {
          errors.push(new DeclareError(`unknown type '${badP}' for parameter '${prm.name}' \u2014 a signature type is one of ${DECLARED_TYPE_NAMES.join(", ")}, a component class in this program, or a function type '(a: T) -> R'`, prm.typePos ?? m.pos));
        }
      }
      const badR = m.returns === void 0 ? null : firstUnknown(m.returns);
      if (badR !== null) {
        errors.push(new DeclareError(`unknown return type '${badR}' for '${m.name}' \u2014 a signature type is one of ${DECLARED_TYPE_NAMES.join(", ")}, a component class in this program, or a function type '(a: T) -> R'`, m.returnsPos ?? m.pos));
      }
    }
    for (const c of el.children)
      checkSignatureTypes(c, errors, schemas);
  }
  function checkStyleDecls(program, schemas, errors) {
    const bundles = /* @__PURE__ */ new Map();
    const stylesheets = /* @__PURE__ */ new Set();
    const fonts = /* @__PURE__ */ new Set();
    const taken = (name) => Object.hasOwn(schemas, name) || bundles.has(name) || stylesheets.has(name) || fonts.has(name);
    for (const s of program.styles) {
      if (taken(s.name)) {
        errors.push(new DeclareError(`there is already a component, stylesheet, style, or font named '${s.name}'`, s.pos));
        continue;
      }
      errors.push(...checkStyleBody(s));
      bundles.set(s.name, s.body);
    }
    for (const s of program.stylesheets) {
      if (taken(s.name)) {
        errors.push(new DeclareError(`there is already a component, stylesheet, style, or font named '${s.name}'`, s.pos));
        continue;
      }
      errors.push(...checkStylesheetBody(s, schemas));
      stylesheets.add(s.name);
    }
    for (const f of program.fonts) {
      if (taken(f.name)) {
        errors.push(new DeclareError(`there is already a component, stylesheet, style, or font named '${f.name}'`, f.pos));
        continue;
      }
      errors.push(...checkFontBody(f));
      fonts.add(f.name);
    }
    return { bundles, stylesheets, fonts, validated: /* @__PURE__ */ new Set() };
  }
  function checkStyleBody(decl) {
    const errors = [];
    const b = decl.body;
    for (const d of b.decls)
      errors.push(new DeclareError(`style ${decl.name}: a bundle declares no attributes \u2014 it is a look, not a component`, d.pos));
    for (const m of b.methods)
      errors.push(new DeclareError(`style ${decl.name}: a bundle has no methods`, m.pos));
    for (const c of b.children)
      errors.push(new DeclareError(`style ${decl.name}: a bundle has no children \u2014 attribute sets only`, c.pos));
    if (b.raw !== void 0)
      errors.push(new DeclareError(`style ${decl.name}: a bundle takes [ ] members, not a { } body`, b.raw.pos));
    return errors;
  }
  function checkFontBody(decl) {
    const errors = [];
    const b = decl.body;
    for (const d of b.decls)
      errors.push(new DeclareError(`font ${decl.name}: a font has no declarations`, d.pos));
    for (const m of b.methods)
      errors.push(new DeclareError(`font ${decl.name}: a font has no methods`, m.pos));
    if (b.raw !== void 0)
      errors.push(new DeclareError(`font ${decl.name}: a font takes a [ ] body, not { }`, b.raw.pos));
    for (const a of b.attrs) {
      if (a.name === "family") {
        if (a.value.kind !== "string")
          errors.push(new DeclareError(`font ${decl.name}: family is a quoted string`, a.value.pos));
        continue;
      }
      errors.push(new DeclareError(`font ${decl.name}: a font body carries 'family = "\u2026"' and Face children only \u2014 not '${a.name}'`, a.pos));
    }
    let faces = 0;
    for (const c of b.children) {
      if (c.tag !== "Face") {
        errors.push(new DeclareError(`font ${decl.name}: '${c.tag}' is not a Face`, c.pos));
        continue;
      }
      errors.push(...checkFace(decl.name, c));
      faces++;
    }
    if (b.attrs.length === 0 && faces === 0) {
      errors.push(new DeclareError(`font ${decl.name}: declare a family ('family = "\u2026"') or at least one Face`, decl.pos));
    }
    return errors;
  }
  function checkFace(fontName, face) {
    const errors = [];
    let hasSrc = false;
    for (const a of face.attrs) {
      if (a.name === "src") {
        errors.push(...checkSource(fontName, a.value));
        hasSrc = true;
        continue;
      }
      if (a.name === "weight") {
        if (a.value.kind !== "ident" || faceWeight(a.value.name) === null)
          errors.push(new DeclareError(`font ${fontName}: a Face weight is a token (${Object.keys(FONT_WEIGHTS).join(", ")})`, a.value.pos));
        continue;
      }
      if (a.name === "italic") {
        if (a.value.kind !== "ident" || a.value.name !== "true" && a.value.name !== "false")
          errors.push(new DeclareError(`font ${fontName}: a Face's italic is true or false`, a.value.pos));
        continue;
      }
      errors.push(new DeclareError(`font ${fontName}: a Face has src, weight, italic \u2014 not '${a.name}'`, a.pos));
    }
    for (const c of face.children)
      errors.push(new DeclareError(`font ${fontName}: a Face has no children`, c.pos));
    if (!hasSrc)
      errors.push(new DeclareError(`font ${fontName}: a Face needs a src`, face.pos));
    return errors;
  }
  function checkSource(fontName, lit) {
    if (lit.kind === "string")
      return [];
    if (lit.kind === "call") {
      if (lit.name !== "url" && lit.name !== "local")
        return [new DeclareError(`font ${fontName}: a face source is a URL string, url("\u2026"), local("\u2026"), or a list \u2014 not '${lit.name}(\u2026)'`, lit.pos)];
      if (lit.args.length !== 1 || lit.args[0].kind !== "string")
        return [new DeclareError(`font ${fontName}: ${lit.name}(\u2026) takes one quoted string`, lit.pos)];
      return [];
    }
    if (lit.kind === "list") {
      if (lit.items.length === 0)
        return [new DeclareError(`font ${fontName}: a face source list is empty`, lit.pos)];
      return lit.items.flatMap((i) => checkSource(fontName, i));
    }
    return [new DeclareError(`font ${fontName}: a face source is a URL string, url("\u2026"), local("\u2026"), or a list of them`, lit.pos)];
  }
  function checkBundleUse(bundle, body, schema, at) {
    const errors = [];
    for (const a of body.attrs) {
      const type = attrType(schema, a.name);
      if (type === null) {
        errors.push(new DeclareError(`style ${bundle} sets '${a.name}', which ${schema.name} (styled at line ${at.line}, col ${at.col}) does not declare`, a.pos));
        continue;
      }
      const bad = UNSTYLABLE[type.kind];
      if (bad !== void 0) {
        errors.push(new DeclareError(`style ${bundle}.${a.name}: ${bad}`, a.pos));
        continue;
      }
      const r = checkAttr(schema, a);
      if (!r.ok)
        errors.push(r.error);
    }
    return errors;
  }
  function checkStylesheetBody(decl, schemas) {
    const errors = [];
    const b = decl.body;
    const where = `stylesheet ${decl.name}`;
    for (const a of b.attrs) {
      errors.push(new DeclareError(`${where}: a stylesheet carries a theme record and class-keyed entries \u2014 write 'theme: Theme [ \u2026 ]' or 'ClassName: [ \u2026 ]'`, a.pos));
    }
    for (const d of b.decls)
      errors.push(new DeclareError(`${where}: a stylesheet declares no attributes`, d.pos));
    for (const m of b.methods)
      errors.push(new DeclareError(`${where}: a stylesheet has no methods`, m.pos));
    if (b.raw !== void 0)
      errors.push(new DeclareError(`${where}: a stylesheet takes [ ] members, not a { } body`, b.raw.pos));
    const seen = /* @__PURE__ */ new Map();
    for (const child of b.children) {
      if (child.name === "theme" && child.tag === "Theme") {
        errors.push(...checkThemeRecord(where, child));
        continue;
      }
      if (child.entry !== true) {
        errors.push(new DeclareError(`${where}: a stylesheet's members are 'theme: Theme [ \u2026 ]' and class-keyed entries ('${child.tag}: [ \u2026 ]')`, child.pos));
        continue;
      }
      const schema = Object.hasOwn(schemas, child.tag) ? schemas[child.tag] : null;
      if (schema === null) {
        errors.push(new DeclareError(`${where}: unknown component '${child.tag}' \u2014 an entry is keyed by a class name`, child.pos));
        continue;
      }
      if (!descendsFrom(schema, "View")) {
        errors.push(new DeclareError(`${where}: '${child.tag}' is not a View \u2014 only views are styled`, child.pos));
        continue;
      }
      const first = seen.get(child.tag);
      if (first !== void 0) {
        errors.push(new DeclareError(`${where}: '${child.tag}' has two entries (first at line ${first.line}, col ${first.col}) \u2014 one entry per class`, child.pos));
        continue;
      }
      seen.set(child.tag, child.pos);
      errors.push(...checkEntry(where, child, schema));
    }
    return errors;
  }
  function checkEntry(where, entry, schema) {
    const errors = [];
    for (const d of entry.decls)
      errors.push(new DeclareError(`${where}.${entry.tag}: an entry declares nothing \u2014 attribute sets only`, d.pos));
    for (const m of entry.methods)
      errors.push(new DeclareError(`${where}.${entry.tag}: an entry has no methods`, m.pos));
    for (const c of entry.children)
      errors.push(new DeclareError(`${where}.${entry.tag}: an entry has no children \u2014 attribute sets only`, c.pos));
    const seen = /* @__PURE__ */ new Map();
    for (const a of entry.attrs) {
      const first = seen.get(a.name);
      if (first !== void 0) {
        errors.push(new DeclareError(`${where}.${entry.tag}.${a.name} is set twice (first set at line ${first.line}, col ${first.col})`, a.pos));
        continue;
      }
      seen.set(a.name, a.pos);
      const type = attrType(schema, a.name);
      if (type === null) {
        errors.push(new DeclareError(`${where}: ${entry.tag} has no attribute '${a.name}'${attributeMiss(schema, a.name)}`, a.pos));
        continue;
      }
      const bad = UNSTYLABLE[type.kind];
      if (bad !== void 0) {
        errors.push(new DeclareError(`${where}.${entry.tag}.${a.name}: ${bad}`, a.pos));
        continue;
      }
      if (a.value.kind === "percent") {
        errors.push(new DeclareError(`${where}.${entry.tag}.${a.name}: a percent resolves against a parent \u2014 an entry carries values (use a { } reading parent.* if you mean it)`, a.value.pos));
        continue;
      }
      if (a.value.kind === "path") {
        errors.push(new DeclareError(`${where}.${entry.tag}.${a.name}: a :path reads a view's cursor \u2014 not stylesheet surface (v1)`, a.value.pos));
        continue;
      }
      const r = checkAttr(schema, a);
      if (!r.ok)
        errors.push(r.error);
    }
    return errors;
  }
  function checkThemeRecord(where, rec) {
    const errors = [];
    for (const d of rec.decls)
      errors.push(new DeclareError(`${where}.theme: a token record declares nothing`, d.pos));
    for (const m of rec.methods)
      errors.push(new DeclareError(`${where}.theme: a token record has no methods`, m.pos));
    for (const c of rec.children)
      errors.push(new DeclareError(`${where}.theme: a token record has no children`, c.pos));
    const seen = /* @__PURE__ */ new Map();
    for (const a of rec.attrs) {
      const first = seen.get(a.name);
      if (first !== void 0) {
        errors.push(new DeclareError(`${where}.theme.${a.name} is set twice (first set at line ${first.line}, col ${first.col})`, a.pos));
        continue;
      }
      seen.set(a.name, a.pos);
      const t = coerceToken(a.value);
      if (t === void 0) {
        errors.push(new DeclareError(`${where}.theme.${a.name}: a token is a number, string, boolean, color, or a value constructor (gradient/stroke/shadow/frost) \u2014 got ${describeLiteral(a.value)}`, a.value.pos));
      }
    }
    return errors;
  }
  function checkBodyRootReplication(el, errors, where) {
    const many = el.attrs.find((a) => a.name === "datapath" && a.value.kind === "path" && a.value.many);
    if (many !== void 0) {
      errors.push(new DeclareError(`${where} cannot replicate \u2014 ':${many.value.path}[]' makes many instances; put it on a child element (or a use site)`, many.value.pos));
    }
  }
  function checkElement(el, errors, schemas, declsOwned, env = EMPTY_ENV, parentSchema = null, classRoot = false) {
    if (el.entry === true) {
      errors.push(new DeclareError(`'${el.tag}: [ \u2026 ]' is a class-keyed entry \u2014 it belongs in a stylesheet`, el.pos));
      return;
    }
    const schema = Object.hasOwn(schemas, el.tag) ? schemas[el.tag] : null;
    const consumed = /* @__PURE__ */ new Set();
    if (schema === null) {
      errors.push(Diag.unknownComponent(el.tag, el.pos, tagCandidates(schemas)));
    } else if (descendsFrom(schema, "Layout") && !classRoot) {
      errors.push(new DeclareError(`'${el.tag}' is a layout \u2014 a layout is an attribute, not a child: write 'layout: ${el.tag} [ \u2026 ]' on the view it arranges`, el.pos));
      return;
    } else if (descendsFrom(schema, "Dataset")) {
      checkDataNode(el, schema, errors);
      return;
    } else if (descendsFrom(schema, "Animator")) {
      checkAnimatorNode(el, schema, parentSchema, errors);
      return;
    } else if (descendsFrom(schema, "AnimatorGroup")) {
      checkAnimatorGroupNode(el, schema, schemas, parentSchema, errors, false);
      return;
    } else if (descendsFrom(schema, "Stream")) {
      if (schema.name === "Stream") {
        errors.push(new DeclareError(`'Stream' is the abstract base \u2014 it names no transport. Declare an EventStream (SSE) or a Socket (WebSocket)`, el.pos));
        return;
      }
      checkSourceNode(el, schema, errors);
      return;
    } else if (isSourceSchema(schema)) {
      checkSourceNode(el, schema, errors);
      return;
    } else if (descendsFrom(schema, "State")) {
      checkStateNode(el, schema, schemas, parentSchema, env, errors);
      return;
    } else {
      if (el.raw !== void 0) {
        errors.push(new DeclareError(`only a Dataset carries a { } body \u2014 a ${el.tag}'s members go in [ ]`, el.raw.pos));
      }
      let eff = schema;
      if (!declsOwned) {
        for (const d of el.decls) {
          const r = checkDecl(schema, d, schema.name, (n) => schemas[n] !== void 0);
          if (!r.ok)
            errors.push(r.error);
        }
        eff = withDecls(schema, el.decls, (n) => schemas[n] !== void 0);
      }
      checkNamespace(el, eff, errors);
      const replicated = manyPathOf(el, schemas) !== null;
      for (const attr of el.attrs) {
        if ((attr.name === "key" || attr.name === "virtualize") && !replicated) {
          errors.push(new DeclareError(`'${attr.name}' is replication metadata \u2014 it belongs on a node whose datapath matches many ('datapath = :rows[]'), beside that path. This node replicates nothing, so there is no collection for it to describe`, attr.pos));
          continue;
        }
        if (attr.name === "key" && replicated) {
          if (attr.value.kind !== "path" || attr.value.many) {
            errors.push(new DeclareError(`key = :field names each record's identity field (e.g. 'key = :id') \u2014 a single :path, not ${attr.value.kind === "path" ? "a many-path" : "a literal"}`, attr.value.pos));
          }
          continue;
        }
        if (attr.name === "virtualize" && replicated) {
          const v = attr.value;
          const okIdent = v.kind === "ident" && (v.name === "true" || v.name === "false");
          if (!okIdent && v.kind !== "code") {
            errors.push(new DeclareError(`virtualize = true | false | { \u2026 } \u2014 virtualize this collection (default false: every record is constructed). It is a boolean because there is no threshold to tune: a windowed block is a flat ~0.06 ms/frame at any size, while constructing every record costs N \xD7 per-instance construction`, v.pos));
          }
          continue;
        }
        const t = attrType(eff, attr.name);
        if (t?.kind === "styles" && attr.value.kind === "list") {
          for (const n of attr.value.items) {
            if (n.kind !== "ident") {
              errors.push(new DeclareError(`a style list holds style names, not values`, n.pos));
              continue;
            }
            const bundle = env.bundles.get(n.name);
            if (bundle === void 0) {
              errors.push(new DeclareError(env.bundles.size > 0 ? `no style named '${n.name}' \u2014 declared styles: ${[...env.bundles.keys()].join(", ")}` : `no style named '${n.name}' \u2014 this program declares no style bundles`, n.pos));
              continue;
            }
            const key = `${n.name}@${eff.name}`;
            if (!env.validated.has(key)) {
              env.validated.add(key);
              errors.push(...checkBundleUse(n.name, bundle, eff, n.pos));
            }
          }
          continue;
        }
        if (t?.kind === "styles" && attr.value.kind === "code") {
          errors.push(new DeclareError(`${eff.name}.styles = { \u2026 }: the bundle list is static (ruled v1) \u2014 conditional looks are constraints on the slots themselves`, attr.value.pos));
          continue;
        }
        if (t?.kind === "stylesheet" && attr.value.kind === "ident" && attr.value.name !== "null") {
          if (!env.stylesheets.has(attr.value.name)) {
            errors.push(new DeclareError(env.stylesheets.size > 0 ? `no stylesheet named '${attr.value.name}' \u2014 declared stylesheets: ${[...env.stylesheets].join(", ")}` : `no stylesheet named '${attr.value.name}' \u2014 this program declares no stylesheets`, attr.value.pos));
          }
          continue;
        }
        if (t?.kind === "font" && (attr.value.kind === "ident" && attr.value.name !== "null" || attr.value.kind === "list")) {
          const items = attr.value.kind === "ident" ? [attr.value] : attr.value.items;
          for (const i of items) {
            if (i.kind === "string")
              continue;
            if (i.kind !== "ident") {
              errors.push(new DeclareError(`a fontFamily list holds font names and strings`, i.pos));
              continue;
            }
            if (!env.fonts.has(i.name)) {
              errors.push(new DeclareError(env.fonts.size > 0 ? `no font named '${i.name}' \u2014 declared fonts: ${[...env.fonts].join(", ")}` : `no font named '${i.name}' \u2014 this program declares no fonts (use a raw family string, or add a 'font ${i.name} [ \u2026 ]')`, i.pos));
            }
          }
          continue;
        }
        if (attrType(eff, attr.name)?.kind === "array" && attr.value.kind === "list") {
          for (const it of attr.value.items) {
            const plain = it.kind === "number" || it.kind === "string" || it.kind === "hexColor" || it.kind === "ident" && (it.name === "null" || it.name === "true" || it.name === "false" || Object.hasOwn(CSS_COLORS, it.name.toLowerCase()));
            if (!plain) {
              errors.push(new DeclareError(`${eff.name}.${attr.name}: a bare list holds plain values \u2014 numbers, strings, booleans, null, colors. For anything computed, write the whole list as a { } binding`, it.pos));
            }
          }
          continue;
        }
        const r = checkAttr(eff, attr);
        if (!r.ok)
          errors.push(r.error);
      }
      for (const m of el.methods) {
        const r = checkMethod(eff, m);
        if (!r.ok)
          errors.push(r.error);
      }
      for (const child of el.children) {
        const many = manyPathOf(child, schemas);
        if (many !== null && child.name !== null) {
          errors.push(new DeclareError(`a replicated child cannot be named \u2014 ':${many.value.path}[]' makes one instance per record, and '${child.name}' can only name one; reach the instances through their data`, child.pos));
        }
        if (child.name === null)
          continue;
        const declared = attrType(eff, child.name);
        if (declared !== null && declared.kind === "component") {
          consumed.add(child);
          errors.push(...checkComponentValue(schemas, schema.name, child.name, declared.of, child));
          continue;
        }
        if (NOUNS.includes(child.name)) {
          errors.push(new DeclareError(`'${child.name}' is a scope noun (language \xA711) \u2014 a child cannot take its name`, child.pos));
        } else if (declared !== null) {
          errors.push(new DeclareError(`${schema.name}.${child.name} is an attribute \u2014 a child may not take an attribute's name`, child.pos));
        }
      }
    }
    const childCtx = schema !== null && !declsOwned ? withDecls(schema, el.decls, (n) => schemas[n] !== void 0) : schema;
    for (const child of el.children) {
      if (!consumed.has(child))
        checkElement(child, errors, schemas, false, env, childCtx);
    }
  }
  function checkDataNode(el, schema, errors) {
    if (el.name === null) {
      errors.push(new DeclareError(`a ${el.tag} needs a name \u2014 write 'events: ${el.tag} \u2026' so bindings can reach it`, el.pos));
    }
    if (el.tag === "Dataset") {
      const derived = el.attrs.some((a) => a.name === "contents");
      if (el.raw === void 0 && !derived) {
        errors.push(new DeclareError(`a Dataset needs data \u2014 a literal JSON body ('${el.name ?? "events"}: Dataset { \u2026 }') or a derived 'contents = { \u2026 }'`, el.pos));
      } else if (el.raw !== void 0 && derived) {
        errors.push(new DeclareError(`${el.name ?? el.tag}: a Dataset is EITHER a literal '{ \u2026 }' body OR a derived 'contents = { \u2026 }', not both`, el.raw.pos));
      } else if (el.raw !== void 0) {
        try {
          JSON.parse(el.raw.src);
        } catch (e) {
          errors.push(new DeclareError(`${el.name ?? el.tag}: the Dataset body is not valid JSON \u2014 ${e.message}`, el.raw.pos));
        }
      }
    } else if (el.raw !== void 0) {
      errors.push(new DeclareError(`a ${el.tag}'s data arrives from its url \u2014 only a Dataset embeds a { } body`, el.raw.pos));
    }
    for (const d of el.decls) {
      errors.push(new DeclareError(`${el.tag}.${d.name}: a data node declares no new attributes`, d.pos));
    }
    for (const m of el.methods) {
      if (el.tag === "DataSource" && m.name === "onLoad")
        continue;
      errors.push(new DeclareError(`${el.tag}.${m.name}: a data node has no method members \u2014 its lifecycle (fetch, clear, set, \u2026) is built in`, m.pos));
    }
    for (const c of el.children) {
      errors.push(new DeclareError(`a data node has no children \u2014 its structure is its data`, c.pos));
    }
    for (const a of el.attrs) {
      if (a.name === "contents" && a.value.kind !== "code") {
        errors.push(new DeclareError(`${el.tag}.contents is a derived value \u2014 write 'contents = { \u2026 }' (a constraint over your reactive state)`, a.value.pos));
        continue;
      }
      if (a.value.kind === "path") {
        errors.push(new DeclareError(`${el.tag}.${a.name} = :${a.value.path}: a data node is where data lives \u2014 a :path reads a view's cursor`, a.value.pos));
        continue;
      }
      const r = checkAttr(schema, a);
      if (!r.ok)
        errors.push(r.error);
    }
  }
  function isSourceSchema(schema) {
    return schema.name === "Heartbeat" || schema.name === "Keys" || schema.name === "Focus" || schema.name === "Tip";
  }
  function checkSourceNode(el, schema, errors) {
    if (el.raw !== void 0) {
      errors.push(new DeclareError(`only a Dataset carries a { } body \u2014 a ${el.tag}'s members go in [ ]`, el.raw.pos));
    }
    for (const d of el.decls) {
      const builtIns = el.tag === "Heartbeat" ? " and 'running'" : descendsFrom(schema, "Stream") ? " and its built-in attributes (url, active, retry, \u2026)" : "";
      errors.push(new DeclareError(`a ${el.tag} declares no attributes of its own \u2014 it carries its handlers${builtIns}`, d.pos));
    }
    for (const c of el.children) {
      errors.push(new DeclareError(`a ${el.tag} takes no children \u2014 it delivers events to its handlers, it is not a container`, c.pos));
    }
    for (const a of el.attrs) {
      if (attrType(schema, a.name)?.kind === "array" && a.value.kind === "list") {
        for (const it of a.value.items) {
          const plain = it.kind === "number" || it.kind === "string" || it.kind === "hexColor" || it.kind === "ident" && (it.name === "null" || it.name === "true" || it.name === "false");
          if (!plain) {
            errors.push(new DeclareError(`${schema.name}.${a.name}: a bare list holds plain values \u2014 numbers, strings, booleans, null. For anything computed, write the whole list as a { } binding`, it.pos));
          }
          if (a.name === "listenTo" && it.kind === "string" && (it.value === "message" || it.value === "open" || it.value === "error")) {
            errors.push(new DeclareError(`${schema.name}.listenTo: "${it.value}" is the transport's own channel, not an SSE event name \u2014 unnamed messages always arrive (drop the entry), the connection's lifecycle is the read-only 'status'/'open'/'error' surface, and failures arrive at onError`, it.pos));
          }
        }
        continue;
      }
      const r = checkAttr(schema, a);
      if (!r.ok)
        errors.push(r.error);
    }
    for (const m of el.methods) {
      const r = checkMethod(schema, m);
      if (!r.ok)
        errors.push(r.error);
    }
  }
  function checkAnimatorNode(el, schema, parentSchema, errors, attributeCascaded = false) {
    if (el.raw !== void 0) {
      errors.push(new DeclareError(`only a Dataset carries a { } body \u2014 an ${el.tag}'s members go in [ ]`, el.raw.pos));
    }
    for (const d of el.decls) {
      errors.push(new DeclareError(`${el.tag}.${d.name}: an animator declares no new attributes \u2014 its surface is built in`, d.pos));
    }
    for (const c of el.children) {
      errors.push(new DeclareError(`an animator drives a slot \u2014 it has no children`, c.pos));
    }
    for (const m of el.methods) {
      const r = checkMethod(schema, m);
      if (!r.ok)
        errors.push(r.error);
    }
    let hasAttribute = false;
    for (const a of el.attrs) {
      if (a.name === "attribute") {
        hasAttribute = true;
        if (a.value.kind === "ident" && a.value.name !== "null") {
          checkTargetSlot(schema, a.value.name, parentSchema, a.value.pos, errors);
        } else {
          errors.push(new DeclareError(`${schema.name}.attribute names the target slot to drive as a bare token (like 'height' or 'x') \u2014 not ${describeLiteral(a.value)}`, a.value.pos));
        }
        continue;
      }
      if (a.value.kind === "path") {
        errors.push(new DeclareError(`${schema.name}.${a.name} = :${a.value.path}: an animator attribute is a value or a { }, not a data read`, a.value.pos));
        continue;
      }
      const r = checkAttr(schema, a);
      if (!r.ok)
        errors.push(r.error);
    }
    if (!hasAttribute && !attributeCascaded) {
      errors.push(new DeclareError(`an ${el.tag} needs 'attribute = <slot>' \u2014 the target slot it drives`, el.pos));
    }
  }
  function checkStateNode(el, schema, schemas, parentSchema, env, errors) {
    if (el.raw !== void 0) {
      errors.push(new DeclareError(`only a Dataset carries a { } body \u2014 a ${el.tag}'s members go in [ ]`, el.raw.pos));
    }
    for (const d of el.decls) {
      errors.push(new DeclareError(`${el.tag}.${d.name}: a state declares no new attributes \u2014 it overrides its view's slots and adds children`, d.pos));
    }
    if (parentSchema === null) {
      errors.push(new DeclareError(`a ${el.tag} must be a member of a view \u2014 at the top level it has no slots to override`, el.pos));
    }
    for (const m of el.methods) {
      const r = checkMethod(schema, m);
      if (!r.ok)
        errors.push(r.error);
    }
    for (const a of el.attrs) {
      if (a.name === "applied") {
        const r2 = checkAttr(schema, a);
        if (!r2.ok)
          errors.push(r2.error);
        continue;
      }
      if (a.value.kind === "path") {
        errors.push(new DeclareError(`${el.tag}.${a.name} = :${a.value.path}: a state override is a value or a { }, not a data read`, a.value.pos));
        continue;
      }
      if (parentSchema === null)
        continue;
      const r = checkAttr(parentSchema, a);
      if (!r.ok)
        errors.push(r.error);
    }
    for (const child of el.children) {
      const cs = Object.hasOwn(schemas, child.tag) ? schemas[child.tag] : null;
      if (cs !== null && descendsFrom(cs, "Layout")) {
        errors.push(new DeclareError(`a state cannot swap '${child.tag}' in \u2014 an override drives the view's value slots, not its layout. Keep one layout and constrain geometry off the state's flag, or reassign the view's layout in an onApply()/onRemove() handler`, child.pos));
        continue;
      }
      checkElement(child, errors, schemas, false, env, parentSchema);
    }
  }
  function checkAnimatorGroupNode(el, schema, schemas, parentSchema, errors, attributeCascaded) {
    if (el.raw !== void 0) {
      errors.push(new DeclareError(`only a Dataset carries a { } body \u2014 an ${el.tag}'s members go in [ ]`, el.raw.pos));
    }
    for (const d of el.decls) {
      errors.push(new DeclareError(`${el.tag}.${d.name}: an animatorgroup declares no new attributes \u2014 its surface is built in`, d.pos));
    }
    for (const m of el.methods) {
      const r = checkMethod(schema, m);
      if (!r.ok)
        errors.push(r.error);
    }
    let providesAttribute = attributeCascaded;
    for (const a of el.attrs) {
      if (a.name === "attribute") {
        providesAttribute = true;
        if (a.value.kind === "ident" && a.value.name !== "null") {
          checkTargetSlot(schema, a.value.name, parentSchema, a.value.pos, errors);
        } else {
          errors.push(new DeclareError(`${schema.name}.attribute names the target slot to drive as a bare token (like 'height' or 'x') \u2014 not ${describeLiteral(a.value)}`, a.value.pos));
        }
        continue;
      }
      if (a.value.kind === "path") {
        errors.push(new DeclareError(`${schema.name}.${a.name} = :${a.value.path}: an animator attribute is a value or a { }, not a data read`, a.value.pos));
        continue;
      }
      const r = checkAttr(schema, a);
      if (!r.ok)
        errors.push(r.error);
    }
    for (const child of el.children) {
      const cs = Object.hasOwn(schemas, child.tag) ? schemas[child.tag] : null;
      if (cs !== null && descendsFrom(cs, "Animator")) {
        checkAnimatorNode(child, cs, parentSchema, errors, providesAttribute);
      } else if (cs !== null && descendsFrom(cs, "AnimatorGroup")) {
        checkAnimatorGroupNode(child, cs, schemas, parentSchema, errors, providesAttribute);
      } else {
        errors.push(new DeclareError(`an ${el.tag} coordinates animators \u2014 '${child.tag}' is not an Animator or AnimatorGroup`, child.pos));
      }
    }
  }
  function checkTargetSlot(animSchema, slot, parentSchema, pos, errors) {
    if (parentSchema === null)
      return;
    const t = attrType(parentSchema, slot);
    if (t === null) {
      errors.push(new DeclareError(`${animSchema.name}.attribute = ${slot}: ${parentSchema.name} has no slot '${slot}' to animate`, pos));
      return;
    }
    if (t.kind !== "length" && t.kind !== "number") {
      errors.push(new DeclareError(`${animSchema.name}.attribute = ${slot}: only numeric slots animate \u2014 ${parentSchema.name}.${slot} is not a number`, pos));
    }
  }
  function checkComponentValue(schemas, owner, attrName, of, el) {
    const schema = Object.hasOwn(schemas, el.tag) ? schemas[el.tag] : null;
    if (schema === null)
      return [Diag.unknownComponent(el.tag, el.pos, tagCandidates(schemas))];
    if (!descendsFrom(schema, of)) {
      return [new DeclareError(`${owner}.${attrName} expects a ${of} \u2014 '${el.tag}' is not one`, el.pos)];
    }
    if (el.tag === "Layout") {
      return [new DeclareError(`${owner}.${attrName}: 'Layout' is the abstract base \u2014 it names no arrangement. Use a concrete strategy (SimpleLayout, WrappingLayout, \u2026) or a class extending Layout that supplies place()`, el.pos)];
    }
    const errors = [];
    if (el.raw !== void 0) {
      errors.push(new DeclareError(`a layout takes [ ] members, not a { } body`, el.raw.pos));
    }
    for (const d of el.decls) {
      errors.push(new DeclareError(`${el.tag}.${d.name}: a layout declares no new attributes`, d.pos));
    }
    for (const m of el.methods) {
      errors.push(new DeclareError(`${el.tag}.${m.name}: a layout has no methods \u2014 it takes literal attributes only`, m.pos));
    }
    for (const c of el.children) {
      errors.push(new DeclareError(`a layout has no children \u2014 it arranges its view's`, c.pos));
    }
    for (const a of el.attrs) {
      if (a.value.kind === "path") {
        errors.push(new DeclareError(`${el.tag}.${a.name} = :${a.value.path}: a layout attribute takes a literal or { } (a :path cursor cannot bind a layout slot)`, a.value.pos));
        continue;
      }
      const r = checkAttr(schema, a);
      if (!r.ok)
        errors.push(r.error);
    }
    return errors;
  }
  function checkNamespace(el, schema, errors) {
    const members = [
      ...el.attrs.map((a) => ({ name: a.name, pos: a.pos, kind: "set" })),
      ...el.decls.map((d) => ({ name: d.name, pos: d.pos, kind: "decl" })),
      ...el.methods.map((m) => ({ name: m.name, pos: m.pos, kind: "method" })),
      ...el.children.filter((c) => c.name !== null).map((c) => ({ name: c.name, pos: c.pos, kind: "child" }))
    ].sort((a, b) => a.pos.offset - b.pos.offset);
    const seen = /* @__PURE__ */ new Map();
    const kindName2 = { set: "set", decl: "declared", method: "a method", child: "a child" };
    for (const m of members) {
      const first = seen.get(m.name);
      if (first === void 0) {
        seen.set(m.name, m);
        continue;
      }
      const at = `(first at line ${first.pos.line}, col ${first.pos.col})`;
      errors.push(new DeclareError(m.kind === "set" && first.kind === "set" ? `${schema.name}.${m.name} is set twice (first set at line ${first.pos.line}, col ${first.pos.col})` : m.kind === "method" && first.kind === "method" ? `${schema.name}.${m.name} is declared twice ${at}` : `${schema.name}.${m.name}: '${m.name}' is already ${kindName2[first.kind]} ${at} \u2014 members share one namespace`, m.pos));
    }
  }
  function attrNames(schema) {
    const out = [];
    for (let sc = schema; sc !== null; sc = sc.base) {
      out.push(...Object.keys(sc.attrs));
      for (const e of sc.events ?? [])
        out.push(handlerName(e));
    }
    return [...new Set(out)];
  }
  function attributeMiss(schema, name) {
    const hint = cssAttributeHint(name);
    if (hint !== "")
      return hint;
    const hinted = hintedForeignName(name);
    if (hinted !== null)
      return cssAttributeHint(hinted);
    const near = nearestName(name, attrNames(schema));
    return near === null ? "" : ` \u2014 did you mean '${near}'?`;
  }
  function checkAttr(schema, attr) {
    const type = attrType(schema, attr.name);
    if (type === null) {
      return { ok: false, error: new DeclareError(`${schema.name} has no attribute '${attr.name}'${attributeMiss(schema, attr.name)}`, attr.pos) };
    }
    if (isReadOnly(schema, attr.name)) {
      return { ok: false, error: new DeclareError(`${schema.name}.${attr.name} is read-only \u2014 it is computed, so a constraint may read it but nothing may set it`, attr.pos) };
    }
    if (attr.name === "clip" && descendsFrom(schema, "App") && attr.value.kind === "ident" && attr.value.name === "false") {
      return { ok: false, error: new DeclareError(`${schema.name}.clip = false: an App is clipped by definition \u2014 overflow along a declared scroll axis is the page's scroll range, and everything else is out of frame. Remove the attribute (a Shape clip is still legal).`, attr.pos) };
    }
    if (attr.bind === "two") {
      if (!descendsFrom(schema, "Editor")) {
        return { ok: false, error: new DeclareError(`${schema.name}.${attr.name} <-> \u2026: the two-way arrow edits a dataset value through an editor's value slot (e.g. 'TextInput.text') \u2014 ${schema.name} is not an editor`, attr.pos) };
      }
      if (attr.value.kind !== "path" && attr.value.kind !== "code") {
        return { ok: false, error: new DeclareError(`${schema.name}.${attr.name} <-> \u2026: two-way binds a datapath \u2014 write '${attr.name} <-> :field' (or '<-> { expr }' for a runtime-named field)`, attr.value.pos) };
      }
      if (attr.value.kind === "path" && attr.value.many) {
        return { ok: false, error: new DeclareError(`${schema.name}.${attr.name} <-> :${attr.value.path}[]: a two-way binding edits one field, not a many-path`, attr.value.pos) };
      }
    }
    if (attr.value.kind === "code" && type.kind === "component") {
      return {
        ok: false,
        error: new DeclareError(`${schema.name}.${attr.name} = { \u2026 }: a component slot takes a member ('${attr.name}: SimpleLayout [ \u2026 ]') or null \u2014 constraining it is not yet surface`, attr.value.pos)
      };
    }
    if (attr.value.kind === "code") {
      const e = validateExpr(attr.value.src);
      if (e !== null) {
        return {
          ok: false,
          error: new DeclareError(`${schema.name}.${attr.name} = { \u2026 } ${e}`, attr.value.pos)
        };
      }
      return { ok: true, binding: { src: attr.value.src, pos: attr.value.pos } };
    }
    if (attr.value.kind === "path") {
      if (type.kind === "component") {
        return {
          ok: false,
          error: new DeclareError(`${schema.name}.${attr.name} expects a ${type.of} \u2014 a :path reads data`, attr.value.pos)
        };
      }
      if (attr.value.many && type.kind !== "cursor") {
        return {
          ok: false,
          error: new DeclareError(`${schema.name}.${attr.name} = :${attr.value.path}[] \u2014 a many-path replicates, which is 'datapath's meaning; a value slot reads a single :path`, attr.value.pos)
        };
      }
      if (attr.value.plan !== void 0 && staticSegs(attr.value.plan) === null) {
        const why = isSelective(attr.value.plan) ? "a selective path (slice/wildcard) matches many" : "a negative index resolves against the array's length \u2014 a live fact, not a place";
        if (attr.bind === "two") {
          return {
            ok: false,
            error: new DeclareError(`'${attr.name} <-> :${attr.value.path}' \u2014 a two-way binding writes ONE place; ${why}. Bind the editor to a singular, static path`, attr.value.pos)
          };
        }
        if (type.kind === "cursor" && !attr.value.many) {
          return {
            ok: false,
            error: new DeclareError(`datapath = :${attr.value.path} \u2014 a cursor is ONE place; ${why}. Read it as a value, or replicate over it: datapath = :${attr.value.path}[]`, attr.value.pos)
          };
        }
      }
      return { ok: true, datapath: { path: attr.value.path, many: attr.value.many, pos: attr.value.pos, plan: attr.value.plan } };
    }
    const c = coerce(type, attr.value);
    if (c.ok && typeof c.value === "object" && c.value !== null && "align" in c.value && attr.name !== "x" && attr.name !== "y") {
      return { ok: false, error: new DeclareError(`${schema.name}.${attr.name} = ${c.value.align}: the position literals center | end are legal on x and y only \u2014 a size wants a number or a percent (width = 100%)`, attr.value.pos) };
    }
    if (!c.ok) {
      const scrollsBool = type.kind === "enum" && type.name === "Scrolls" && attr.value.kind === "ident" && (attr.value.name === "true" || attr.value.name === "false");
      const hint = scrollsBool ? ` \u2014 scrolls is an axis now: ${attr.value.kind === "ident" && attr.value.name === "true" ? "'scrolls = y' is the old 'scrolls = true'" : "'scrolls = none' is the old 'scrolls = false'"}` : attr.value.kind === "ident" && type.kind !== "enum" ? ` \u2014 write { ${attr.value.name} } to bind the attribute${type.kind === "string" ? `, or "${attr.value.name}" for the literal text` : ""}` : "";
      return {
        ok: false,
        error: new DeclareError(`${schema.name}.${attr.name} expects ${c.expected}, got ${c.found ?? describeLiteral(attr.value)}${hint}`, attr.value.pos)
      };
    }
    return { ok: true, value: c.value };
  }
  function checkMethod(schema, m) {
    const err2 = (message, pos) => ({ ok: false, error: new DeclareError(message, pos) });
    if (attrType(schema, m.name) !== null) {
      return err2(`${schema.name}.${m.name} is an attribute \u2014 a method may not take an attribute's name`, m.pos);
    }
    if (RESERVED.includes(m.name)) {
      return err2(`'${m.name}' is a value constructor (gradient/stroke/shadow/stop/frost) \u2014 it cannot be a member name`, m.pos);
    }
    if (eventsOf(schema).includes(m.name)) {
      return err2(`${schema.name}.${m.name}(\u2026) is never called \u2014 '${m.name}' is an EVENT here, delivered to '${handlerName(m.name)}'. Rename it to '${handlerName(m.name)}(\u2026)'. (The 'input(v)' value pattern belongs to CONTROLS \u2014 Checkbox, Slider, Segmented \u2014 which fire no such event; an editor delivers through its event instead.)`, m.pos);
    }
    const event = eventOfHandler(m.name);
    if (event !== null && !eventsOf(schema).includes(event)) {
      const known2 = eventsOf(schema).map(handlerName);
      const renamed = /^onMouse(Down|Up|Move|Over|Out)$/.exec(m.name);
      if (renamed !== null) {
        return err2(`'${m.name}' is now 'onPointer${renamed[1]}' \u2014 one handler serves a mouse and a fingertip alike (the touch-specific stream is 'onTouch\u2026')`, m.pos);
      }
      return err2(known2.length > 0 ? `${schema.name} has no '${m.name}' event \u2014 its handlers: ${known2.join(", ")}` : `${schema.name} declares no events, so '${m.name}' can answer nothing`, m.pos);
    }
    const noun = m.params.map((p) => p.name).find((p) => p === "parent" || p === "classroot" || p === "app");
    if (noun !== void 0) {
      return err2(`${schema.name}.${m.name}: a parameter may not be named '${noun}' \u2014 it is a scope noun (language \xA711)`, m.pos);
    }
    const e = validateBody(m.params.map((p) => p.name), m.body);
    if (e !== null) {
      return err2(`${schema.name}.${m.name}(\u2026) ${e}`, m.bodyPos);
    }
    return { ok: true };
  }
  var EMPTY_ENV, UNSTYLABLE;
  var init_check = __esm({
    "runtime/dist/check.js"() {
      "use strict";
      init_css_colors();
      init_errors();
      init_schema();
      init_diagnostics();
      init_teach();
      init_include();
      init_value();
      init_expr();
      init_datapath();
      init_font();
      init_program_schema();
      init_program_schema();
      EMPTY_ENV = { bundles: /* @__PURE__ */ new Map(), stylesheets: /* @__PURE__ */ new Set(), fonts: /* @__PURE__ */ new Set(), validated: /* @__PURE__ */ new Set() };
      UNSTYLABLE = {
        component: "a component slot (layout) is structure",
        cursor: "a data cursor is structure",
        styles: "a bundle list cannot arrive through the styling channels",
        stylesheet: "a stylesheet cannot set the stylesheet"
      };
    }
  });

  // runtime/dist/reactive.js
  function isTracking() {
    return active !== null;
  }
  function enqueue(c) {
    queues[c.phase].push(c);
    if (!scheduled && !flushing) {
      scheduled = true;
      queueMicrotask(settle);
    }
  }
  function settle() {
    scheduled = false;
    if (flushing)
      return;
    flushing = true;
    stamp++;
    try {
      for (; ; ) {
        const phase = heads[0] < queues[0].length ? 0 : heads[1] < queues[1].length ? 1 : null;
        if (phase === null)
          break;
        queues[phase][heads[phase]++].runQueued(stamp);
      }
    } finally {
      flushing = false;
      for (const phase of [0, 1]) {
        for (let i = heads[phase]; i < queues[phase].length; i++)
          queues[phase][i].abandon();
        queues[phase].length = 0;
        heads[phase] = 0;
      }
    }
  }
  var active, Cell, CYCLE_LIMIT, Constraint, queues, heads, scheduled, flushing, stamp;
  var init_reactive = __esm({
    "runtime/dist/reactive.js"() {
      "use strict";
      init_errors();
      active = null;
      Cell = class {
        subs = /* @__PURE__ */ new Set();
        /** A STRUCTURAL cell (a Node's child-list — node.ts): waking through one
         *  means the dependency SHAPE may have changed, so a statically-wired
         *  subscriber re-probes its edges on the next run instead of trusting the
         *  fixed set (extentOf over children that did not exist at wire time). */
        structural = false;
        /** Record that the running computation read this slot (no-op untracked). */
        track() {
          if (active !== null) {
            this.subs.add(active);
            active.reads(this);
          }
        }
        /** The write half: invalidate every subscriber. Subscribers only get
         *  queued here — re-evaluation is the scheduler's, in batch. */
        changed() {
          for (const c of this.subs)
            c.invalidate(this);
        }
        /** @internal Constraint.run re-tracks from scratch each run. */
        unlink(c) {
          this.subs.delete(c);
        }
      };
      CYCLE_LIMIT = 100;
      Constraint = class {
        label;
        compute;
        apply;
        phase;
        yielding;
        deps = [];
        queued = false;
        dead = false;
        /** Suspended: inert but alive — dependency edges dropped and waking
         *  refused, so an animator can drive this constraint's slot without it
         *  fighting back, then resume() re-runs it against current state
         *  (animation.md §2 rules 2–4, the supersede/restore kernel service). */
        suspended = false;
        // Cycle-guard bookkeeping, valid within one settle (stamped by it).
        stamp = 0;
        runs = 0;
        /** The body's SOURCE TEXT and position, when this constraint came from a
         *  `{ }` in a program (bind.ts sets them). The Inspector's "why" answer is
         *  this string; null for constraints the runtime builds itself (extent
         *  derives, percent/align bindings) and for live-bound ones typed at
         *  runtime, which are marked separately by `isStatic` being false. */
        source = null;
        sourcePos = null;
        /** Installed at RUNTIME by the Inspector's evaluate strip rather than compiled
         *  from source — so the UI can say "temporary" honestly instead of implying it
         *  has the same standing as a compiled constraint. */
        live = false;
        constructor(label, compute, apply, phase = 0, yielding = false) {
          this.label = label;
          this.compute = compute;
          this.apply = apply;
          this.phase = phase;
          this.yielding = yielding;
        }
        /** Static-edge mode (docs/system-design/constraints.md §5): the compiler extracted this
         *  constraint's dependency set, so its edges are wired ONCE — thereafter run()
         *  recomputes and applies with no per-run unlink/re-track. */
        wired = false;
        /** @internal Whether this constraint runs on the static path (test/observe). */
        get isStatic() {
          return this.wired;
        }
        /** The compiler's extracted read-paths, retained verbatim for tooling —
         *  `explain()` (inspect.ts) answers "why does this slot have this value"
         *  by LOOKUP because these ride along (verify-and-evals.md §2.2). Null on
         *  the tracking path. */
        wiredPaths = null;
        /** Wire the supplied edges once, then land the initial value. `probe` reads the
         *  compiler's extracted read-paths under tracking — the same Cell.track path a
         *  full run would use, but over just the (branch-union) dependency set — so the
         *  edges are exact and permanent. The value itself is computed with tracking
         *  OFF (edges already fixed). This is the link-time prewiring. */
        wire(probe, paths) {
          this.probe = probe;
          const prev = active;
          active = this;
          try {
            probe();
          } finally {
            active = prev;
          }
          this.wired = true;
          if (paths !== void 0)
            this.wiredPaths = paths;
          this.apply(this.compute());
        }
        /** The wired probe, retained for structural RE-WIRING (see invalidate). */
        probe = null;
        /** Set when a STRUCTURAL cell woke this constraint: the child-list under
         *  one of its reads changed shape, so the fixed edge set may be stale —
         *  the next run re-probes (unlink + re-track over the same read-paths). */
        needsRewire = false;
        /** Evaluate now. On the static path (wired) the edges are fixed: just
         *  recompute and apply — no unlink, no re-track, no `active` branch on reads.
         *  Otherwise drop last run's edges and rediscover them under tracking. */
        run() {
          if (this.wired) {
            if (this.needsRewire && this.probe !== null) {
              this.needsRewire = false;
              for (const d of this.deps)
                d.unlink(this);
              this.deps.length = 0;
              const prev2 = active;
              active = this;
              try {
                this.probe();
              } finally {
                active = prev2;
              }
            }
            this.apply(this.compute());
            return;
          }
          for (const d of this.deps)
            d.unlink(this);
          this.deps.length = 0;
          const prev = active;
          active = this;
          let v;
          try {
            v = this.compute();
          } finally {
            active = prev;
          }
          this.apply(v);
        }
        /** @internal Called by Cell.track for the active computation. */
        reads(cell) {
          this.deps.push(cell);
        }
        /** Queue for the next settle. Coalesces: already-queued, disposed, or
         *  suspended constraints are a no-op, so N invalidations cost one run. */
        invalidate(from) {
          if (from !== void 0 && from.structural)
            this.needsRewire = true;
          if (this.queued || this.dead || this.suspended)
            return;
          this.queued = true;
          enqueue(this);
        }
        /** Permanently retire (a yielding owner displaced by a direct write). */
        dispose() {
          this.dead = true;
          for (const d of this.deps)
            d.unlink(this);
          this.deps.length = 0;
        }
        /** Displace this constraint without killing it: drop its dependency edges
         *  and refuse to wake, so an animator may drive its slot every tick while
         *  the constraint sits inert (animation.md §2 rule 2). It keeps owning the
         *  slot (the ownership diagnostic still protects it from author writes) but
         *  writes nothing until resumed. Idempotent. */
        suspend() {
          this.suspended = true;
          this.queued = false;
          for (const d of this.deps)
            d.unlink(this);
          this.deps.length = 0;
        }
        /** Resume from suspension and re-evaluate against current state now — the
         *  displaced driver taking its slot back on the animator's completion
         *  (animation.md §2 rule 4: resumed, not reinstated with a stale output). */
        resume() {
          if (!this.suspended)
            return;
          this.suspended = false;
          this.run();
        }
        /** @internal The scheduler's entry: un-queue, count against the cycle
         *  guard, re-run. Clearing `queued` *before* running is what lets a run
         *  that dirties itself (via another constraint) re-enter the queue. */
        runQueued(settleStamp) {
          this.queued = false;
          if (this.dead || this.suspended)
            return;
          if (this.stamp !== settleStamp) {
            this.stamp = settleStamp;
            this.runs = 0;
          }
          if (++this.runs > CYCLE_LIMIT) {
            throw new DeclareError(`constraint cycle: ${this.label} re-evaluated ${CYCLE_LIMIT} times in one update \u2014 it (transitively) depends on its own output`);
          }
          this.run();
        }
        /** @internal An aborted settle clears flags so later writes can requeue. */
        abandon() {
          this.queued = false;
        }
      };
      queues = [[], []];
      heads = [0, 0];
      scheduled = false;
      flushing = false;
      stamp = 0;
    }
  });

  // runtime/dist/node.js
  function onDiscard(node, fn) {
    const list = RETIRE.get(node);
    if (list !== void 0)
      list.push(fn);
    else
      RETIRE.set(node, [fn]);
  }
  function runRetire(node) {
    const retire = RETIRE.get(node);
    if (retire !== void 0) {
      RETIRE.delete(node);
      for (const fn of retire)
        fn();
    }
  }
  var Node2, RETIRE;
  var init_node = __esm({
    "runtime/dist/node.js"() {
      "use strict";
      init_reactive();
      Node2 = class {
        parent = null;
        children = [];
        /** The STRUCTURE cell — lazily created on the first tracked read of this
         *  node's child list (extentOf's contentWidth/contentHeight walk), woken by
         *  insertChild/removeChild. This is what makes a constraint over a
         *  replication-populated container's content extent re-derive when rows
         *  ARRIVE — per-child attr reads track the children that exist, and this
         *  cell tracks that the SET of children changed. */
        structure = null;
        /** Register the caller's interest in "my child list changed" (no-op when
         *  nothing is tracking). Every reactive read works this way — a cell the
         *  reader subscribes to — and the child list's cell is created on first
         *  interest rather than up front, so a tree nobody asks about pays nothing. */
        watchChildList() {
          if (!isTracking())
            return;
          if (this.structure === null) {
            this.structure = new Cell();
            this.structure.structural = true;
          }
          this.structure.track();
        }
        childListChanged() {
          this.structure?.changed();
        }
        /** The scope noun (R6) for members declared in THIS node's body — the
         *  enclosing class instance, set at construction. It lives here, on Node, not
         *  on View: a node's members have a scope whether or not the node is visual
         *  (a controller node's members resolve `classroot` to the controller). */
        classroot = null;
        /** The top of the tree — the App root. A deeply-nested view reaches
         *  app-level state and methods through `this.root` instead of a
         *  fragile fixed-depth `.parent` chain (the language's one escape from
         *  strict child→parent locality; structure, not reactive). */
        get root() {
          let n = this;
          while (n.parent !== null)
            n = n.parent;
          return n;
        }
        /** Link `child` beneath this node. The tree is the single source of
         *  structure; the render backend mirrors it (see View.attach). */
        appendChild(child) {
          child.parent = this;
          this.children.push(child);
          this.childListChanged();
        }
        /** Link `child` at `index` — child order is semantic (tree order is paint
         *  order, and replicated children take their data's order, R8). */
        insertChild(child, index) {
          child.parent = this;
          this.children.splice(index, 0, child);
          this.childListChanged();
        }
        /** Unlink `child`. Model structure only — a live view's surface and
         *  standing computations are the caller's to retire (View.discard). */
        removeChild(child) {
          const i = this.children.indexOf(child);
          if (i >= 0) {
            this.children.splice(i, 1);
            this.childListChanged();
          }
          child.parent = null;
        }
        /** Retire this node's standing machinery, depth-first — called once when a
         *  subtree leaves the tree (replication, navigation). The base recurses and
         *  runs registered teardowns; View overrides it to also drop its surface +
         *  bindings, and Animator to drop its clock enrolment + bindings. Recursing
         *  over EVERY child (not just Views) is what tears down an Animator/Spring
         *  child — a Node, not a View — whose `to` binding would otherwise linger,
         *  subscribed to whatever it read, keeping the whole discarded subtree alive
         *  (and, for a Spring, still ticking). */
        discard() {
          for (const child of this.children)
            child.discard();
          runRetire(this);
        }
      };
      RETIRE = /* @__PURE__ */ new WeakMap();
    }
  });

  // runtime/dist/attributes.js
  function tableFor(map, ctor) {
    let c = ctor;
    while (c !== null && c !== Function.prototype) {
      const t = map.get(c);
      if (t !== void 0) {
        if (c !== ctor)
          map.set(ctor, t);
        return t;
      }
      c = Object.getPrototypeOf(c);
    }
    return null;
  }
  function defineAttributes(ctor, specs) {
    const parent = Object.getPrototypeOf(ctor);
    const defaults = Object.create(tableFor(DEFAULTS, parent));
    const pushers = Object.create(tableFor(PUSHERS, parent));
    const prevailing = Object.create(tableFor(PREVAILING, parent));
    const equals = Object.create(tableFor(EQUALS, parent));
    for (const name of Object.keys(specs)) {
      const spec = specs[name];
      defaults[name] = spec.def;
      pushers[name] = spec.push;
      prevailing[name] = spec.prevailing;
      equals[name] = spec.equal;
      const follows = spec.prevailing === true;
      const defBinding = spec.defBinding;
      const defOuter = spec.defOuter === true;
      const readOnly = spec.readOnly === true;
      Object.defineProperty(ctor.prototype, name, {
        get() {
          const self = this;
          if (isTracking())
            cellFor(self, name).track();
          if ((follows || defBinding !== void 0) && !provided(self, name)) {
            if (follows) {
              const v = followRead(self, name, defaults);
              if (v !== NOTHING)
                return v;
            }
            if (defBinding !== void 0 && (self.$attrs === void 0 || !Object.hasOwn(self.$attrs, name))) {
              return evalDefault(self, name, defBinding, defOuter);
            }
          }
          return (self.$attrs ?? defaults)[name];
        },
        set(v) {
          if (readOnly) {
            throw new DeclareError(`${this.constructor.name}.${name} is read-only \u2014 it is computed from its declaration and cannot be assigned`);
          }
          const self = this;
          if (RUNTIME_WRITE === 0 && ARMED.has(self))
            DIVERGED.add(self);
          const becameProvider = follows && !provided(self, name);
          const owner = self.$owners?.[name];
          if (owner !== void 0) {
            if (!owner.yielding) {
              throw new DeclareError(`${this.constructor.name}.${name} is bound by a constraint (${owner.label}) \u2014 a direct write would be silently overwritten; change what the constraint reads instead`);
            }
            owner.dispose();
            delete self.$owners[name];
          }
          (self.$set ??= /* @__PURE__ */ new Set()).add(name);
          write(this, name, v);
          if (becameProvider)
            self.$cells?.[name]?.changed();
        }
      });
    }
    DEFAULTS.set(ctor, defaults);
    PUSHERS.set(ctor, pushers);
    PREVAILING.set(ctor, prevailing);
    EQUALS.set(ctor, equals);
  }
  function provided(self, name) {
    return (self.$set?.has(name) ?? false) || self.$owners?.[name] !== void 0 || (self.$stylesheetMarks?.has(name) ?? false);
  }
  function evalDefault(self, name, fn, outer) {
    let inFlight = EVALING.get(self);
    if (inFlight?.has(name) === true) {
      throw new DeclareError(`${self.constructor.name}.${name}'s default binding (transitively) reads itself`);
    }
    if (inFlight === void 0)
      EVALING.set(self, inFlight = /* @__PURE__ */ new Set());
    inFlight.add(name);
    try {
      const node = self;
      return fn.call(self, node.parent, outer ? node.classroot : self);
    } finally {
      inFlight.delete(name);
    }
  }
  function declaringOf(table, name) {
    if (table === null)
      return null;
    let m = DECLARING.get(table);
    if (m === void 0)
      DECLARING.set(table, m = /* @__PURE__ */ new Map());
    const hit = m.get(name);
    if (hit !== void 0)
      return hit;
    let found = null;
    for (let t = table; t !== null; t = Object.getPrototypeOf(t)) {
      if (Object.hasOwn(t, name)) {
        found = t;
        break;
      }
    }
    m.set(name, found);
    return found;
  }
  function followRead(self, name, declaring) {
    for (let p = self.parent; typeof p === "object" && p !== null; p = p.parent) {
      const pc = p;
      const pd = tableFor(DEFAULTS, p.constructor);
      if (pd === null || !(name in pd) || declaringOf(pd, name) !== declaring)
        continue;
      if (isTracking())
        cellFor(pc, name).track();
      if (provided(pc, name))
        return (pc.$attrs ?? pd)[name];
    }
    return NOTHING;
  }
  function cellFor(self, name) {
    const cells = self.$cells ??= /* @__PURE__ */ Object.create(null);
    return cells[name] ??= new Cell();
  }
  function write(self, name, v) {
    const carrier = self;
    const defaults = tableFor(DEFAULTS, self.constructor);
    const cur = (carrier.$attrs ?? defaults)[name];
    if (cur === v)
      return;
    const eq = tableFor(EQUALS, self.constructor)?.[name];
    if (eq !== void 0 && eq(cur, v))
      return;
    (carrier.$attrs ??= Object.create(defaults))[name] = v;
    tableFor(PUSHERS, self.constructor)?.[name]?.(self, v);
    carrier.$cells?.[name]?.changed();
  }
  function setBound(self, name, v) {
    write(self, name, v);
  }
  function addBound(self, name, delta) {
    if (delta === 0)
      return;
    const cur = self[name];
    write(self, name, (typeof cur === "number" ? cur : 0) + delta);
  }
  function stylesheetWrite(self, name, v) {
    const carrier = self;
    const becameProvider = tableFor(PREVAILING, self.constructor)?.[name] === true && !provided(carrier, name);
    (carrier.$stylesheetMarks ??= /* @__PURE__ */ new Set()).add(name);
    write(self, name, v);
    if (becameProvider)
      carrier.$cells?.[name]?.changed();
  }
  function stylesheetClear(self, name) {
    const carrier = self;
    if (carrier.$stylesheetMarks === void 0 || !carrier.$stylesheetMarks.delete(name))
      return;
    if (provided(carrier, name))
      return;
    if (carrier.$attrs !== void 0 && Object.hasOwn(carrier.$attrs, name)) {
      delete carrier.$attrs[name];
    }
    carrier.$cells?.[name]?.changed();
    const v = self[name];
    tableFor(PUSHERS, self.constructor)?.[name]?.(self, v);
  }
  function stylesheetMarks(self) {
    return self.$stylesheetMarks;
  }
  function isSet(self, name) {
    return self.$set?.has(name) ?? false;
  }
  function followedValue(self, name) {
    const table = tableFor(DEFAULTS, self.constructor);
    if (table === null)
      return void 0;
    if (tableFor(PREVAILING, self.constructor)?.[name] === true) {
      const v = followRead(self, name, declaringOf(table, name));
      if (v !== NOTHING)
        return v;
    }
    return table[name];
  }
  function prevailingProvided(self, name) {
    const c = self;
    if (isTracking())
      cellFor(c, name).track();
    if (provided(c, name))
      return true;
    const table = tableFor(DEFAULTS, self.constructor);
    if (table === null)
      return false;
    const declaring = declaringOf(table, name);
    if (declaring === null)
      return false;
    return followRead(c, name, declaring) !== NOTHING;
  }
  function disposeBindings(self) {
    const owners = self.$owners;
    if (owners === void 0)
      return;
    for (const name of Object.keys(owners)) {
      owners[name].dispose();
      delete owners[name];
    }
  }
  function disown(self, name) {
    const owners = self.$owners;
    if (owners !== void 0)
      delete owners[name];
  }
  function ownerOf(self, name) {
    return self.$owners?.[name] ?? null;
  }
  function ownValues(self) {
    const own2 = self.$attrs;
    const out = {};
    if (own2 !== void 0)
      for (const k of Object.keys(own2))
        out[k] = own2[k];
    return out;
  }
  function ownedSlots(self) {
    const owners = self.$owners;
    return owners !== void 0 ? Object.keys(owners) : [];
  }
  function asRuntimeWrite(f) {
    RUNTIME_WRITE++;
    try {
      return f();
    } finally {
      RUNTIME_WRITE--;
    }
  }
  function armDivergence(self) {
    ARMED.add(self);
  }
  function nodeDiverged(self) {
    return DIVERGED.has(self);
  }
  function markPercent(c) {
    PERCENTS.add(c);
  }
  function percentOwned(self, name) {
    const owner = self.$owners?.[name];
    return owner !== void 0 && PERCENTS.has(owner);
  }
  function own(self, name, c) {
    const owners = self.$owners ??= /* @__PURE__ */ Object.create(null);
    const prior = owners[name];
    if (prior !== void 0 && prior.yielding) {
      prior.dispose();
      delete owners[name];
    } else if (prior !== void 0) {
      throw new DeclareError(`${self.constructor.name}.${name} is already bound (by ${prior.label})`);
    }
    owners[name] = c;
    wakeIfPrevailing(self, name);
  }
  function release(self, name, c) {
    const owners = self.$owners;
    if (owners !== void 0 && owners[name] === c) {
      delete owners[name];
      wakeIfPrevailing(self, name);
    }
  }
  function wakeIfPrevailing(self, name) {
    if (tableFor(PREVAILING, self.constructor)?.[name] === true) {
      self.$cells?.[name]?.changed();
    }
  }
  function bindDerived(self, name, compute) {
    const c = new Constraint(`${self.constructor.name}.${name} (runtime derive)`, compute, (v) => write(self, name, v), 0, true);
    own(self, name, c);
    c.run();
    return c;
  }
  var DEFAULTS, PUSHERS, PREVAILING, EQUALS, NOTHING, EVALING, DECLARING, ARMED, DIVERGED, RUNTIME_WRITE, PERCENTS;
  var init_attributes = __esm({
    "runtime/dist/attributes.js"() {
      "use strict";
      init_reactive();
      init_errors();
      DEFAULTS = /* @__PURE__ */ new WeakMap();
      PUSHERS = /* @__PURE__ */ new WeakMap();
      PREVAILING = /* @__PURE__ */ new WeakMap();
      EQUALS = /* @__PURE__ */ new WeakMap();
      NOTHING = /* @__PURE__ */ Symbol("no provider");
      EVALING = /* @__PURE__ */ new WeakMap();
      DECLARING = /* @__PURE__ */ new WeakMap();
      ARMED = /* @__PURE__ */ new WeakSet();
      DIVERGED = /* @__PURE__ */ new WeakSet();
      RUNTIME_WRITE = 0;
      PERCENTS = /* @__PURE__ */ new WeakSet();
    }
  });

  // runtime/dist/stylesheet.js
  function buildStylesheet(name, theme, entries) {
    return { name, theme, entries, merged: /* @__PURE__ */ new Map() };
  }
  function mergedFor(stylesheet, chain) {
    const key = chain.join(",");
    let m = stylesheet.merged.get(key);
    if (m === void 0) {
      const out = /* @__PURE__ */ Object.create(null);
      for (let i = chain.length - 1; i >= 0; i--) {
        const entry = stylesheet.entries.get(chain[i]);
        if (entry !== void 0) {
          for (const f of entry)
            out[f.name] = f;
        }
      }
      stylesheet.merged.set(key, m = out);
    }
    return m;
  }
  function chainOf(view) {
    const names = [];
    for (let c = view.constructor; typeof c === "function" && c !== Function.prototype; c = Object.getPrototypeOf(c)) {
      const n = c.name;
      if (n !== "" && names[names.length - 1] !== n)
        names.push(n);
    }
    return names;
  }
  function providesStylesheet(view) {
    return isSet(view, "stylesheet") || ownerOf(view, "stylesheet") !== null;
  }
  function ensureApplier(view) {
    const v = view;
    if (APPLIERS.has(view))
      return;
    if (v.stylesheet === null)
      return;
    const chain = chainOf(v);
    const applier = new Constraint(
      `${v.constructor.name}'s stylesheet`,
      // Compute under tracking: the effective stylesheet (a tracked follow — a swap
      // anywhere above wakes this), each applicable field's value (a { } field
      // tracks what it reads — theme tokens re-skin exactly their readers).
      () => {
        const stylesheet = v.stylesheet;
        const offers = /* @__PURE__ */ Object.create(null);
        if (stylesheet !== null) {
          if (stylesheet.theme !== null && providesStylesheet(v))
            offers.theme = stylesheet.theme;
          const fields = mergedFor(stylesheet, chain);
          for (const name in fields) {
            if (isSet(view, name) || ownerOf(view, name) !== null)
              continue;
            const f = fields[name];
            offers[name] = f.fn !== void 0 ? f.fn.call(view, v.parent, null) : f.value;
          }
        }
        return offers;
      },
      // Apply untracked: withdraw fields no longer offered, land the rest.
      (offers) => {
        const o = offers;
        const marks = stylesheetMarks(view);
        if (marks !== void 0) {
          for (const name of [...marks]) {
            if (!(name in o))
              stylesheetClear(view, name);
          }
        }
        for (const name in o)
          stylesheetWrite(view, name, o[name]);
      }
    );
    APPLIERS.set(view, applier);
    applier.run();
  }
  function stylesheetArrived(view) {
    const walk = (n) => {
      ensureApplier(n);
      for (const c of n.children ?? []) {
        if (typeof c === "object" && c !== null && "stylesheet" in c)
          walk(c);
      }
    };
    walk(view);
  }
  function disposeApplier(view) {
    const a = APPLIERS.get(view);
    if (a !== void 0) {
      APPLIERS.delete(view);
      a.dispose();
    }
  }
  function registerStylesheets(root, stylesheets) {
    REGISTRY.set(root, stylesheets);
  }
  function stylesheetByName(root, name) {
    const stylesheet = REGISTRY.get(root)?.get(name);
    if (stylesheet === void 0) {
      throw new DeclareError(`no stylesheet named '${name}' is declared in this program`);
    }
    return stylesheet;
  }
  var APPLIERS, REGISTRY;
  var init_stylesheet = __esm({
    "runtime/dist/stylesheet.js"() {
      "use strict";
      init_reactive();
      init_errors();
      init_attributes();
      APPLIERS = /* @__PURE__ */ new WeakMap();
      REGISTRY = /* @__PURE__ */ new WeakMap();
    }
  });

  // runtime/dist/backend.js
  function allowedRef(ref) {
    if (ref.startsWith("#"))
      return true;
    const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(ref);
    if (m === null)
      return true;
    const scheme = m[1].toLowerCase();
    return scheme === "http" || scheme === "https" || scheme === "mailto";
  }
  var POINTER_TYPES, TOUCH_TYPES, PINCH_TYPES;
  var init_backend = __esm({
    "runtime/dist/backend.js"() {
      "use strict";
      POINTER_TYPES = ["pointerDown", "pointerUp", "click", "dblClick", "pointerMove", "pointerOver", "pointerOut", "hold", "contextMenu", "touchStart", "touchMove", "touchEnd", "touchCancel", "pinchStart", "pinch", "pinchEnd", "wheel"];
      TOUCH_TYPES = ["touchStart", "touchMove", "touchEnd", "touchCancel"];
      PINCH_TYPES = ["pinchStart", "pinch", "pinchEnd"];
    }
  });

  // runtime/dist/interaction.js
  function traceHitAt(root, x, y, pierce = false) {
    const notes = [];
    if (!isView(root))
      return { hit: null, notes };
    return { hit: leafAt(root, x, y, pierce, notes), notes };
  }
  function initInteraction(test) {
    isView = test;
  }
  function toChildLocal(v, c, lx, ly) {
    if (v.scrolls !== "none" && !c.ignoreScroll) {
      lx += v.scrollX;
      ly += v.scrollY;
    }
    let cx = lx - c.x;
    let cy = ly - c.y;
    const s = c.scale;
    const rot = c.rotation;
    if (s !== 1 && s !== 0 || rot !== 0) {
      let dx = cx - c.pivotX;
      let dy = cy - c.pivotY;
      if (s !== 1 && s !== 0) {
        dx /= s;
        dy /= s;
      }
      if (rot !== 0) {
        const a = -rot * Math.PI / 180;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const rx = dx * ca - dy * sa;
        const ry = dx * sa + dy * ca;
        dx = rx;
        dy = ry;
      }
      cx = dx + c.pivotX;
      cy = dy + c.pivotY;
    }
    return [cx, cy];
  }
  function leafAt(v, lx, ly, pierce = false, trace) {
    if (!v.visible) {
      if (trace !== void 0)
        trace.push({ view: v, why: "skipped \u2014 visible = false", x: Math.round(lx), y: Math.round(ly) });
      return null;
    }
    if (!pierce && v.pointerEvents === "none") {
      if (trace !== void 0)
        trace.push({ view: v, why: 'skipped \u2014 pointerEvents = "none" (the subtree is pointer-transparent)', x: Math.round(lx), y: Math.round(ly) });
      return null;
    }
    const inside = lx >= 0 && ly >= 0 && lx <= v.width && ly <= v.height;
    if (v.scrolls !== "none" && !inside) {
      if (trace !== void 0)
        trace.push({ view: v, why: "skipped \u2014 outside a scroller's FRAME, so its whole subtree is out of view", x: Math.round(lx), y: Math.round(ly) });
      return null;
    }
    const clipping = v.clip !== null && v.clip !== false && v.clip !== "";
    const kids = v.children;
    if (v.scrolls !== "none") {
      for (let i = kids.length - 1; i >= 0; i--) {
        const c = kids[i];
        if (!isView(c) || !c.ignoreScroll)
          continue;
        if (clipping && !inside && !c.ignoreClip)
          continue;
        const [cx, cy] = toChildLocal(v, c, lx, ly);
        const hit = leafAt(c, cx, cy, pierce, trace);
        if (hit !== null)
          return hit;
      }
    }
    for (let i = kids.length - 1; i >= 0; i--) {
      const c = kids[i];
      if (!isView(c))
        continue;
      if (v.scrolls !== "none" && c.ignoreScroll)
        continue;
      if (clipping && !inside && !c.ignoreClip)
        continue;
      const [cx, cy] = toChildLocal(v, c, lx, ly);
      const hit = leafAt(c, cx, cy, pierce, trace);
      if (hit !== null)
        return hit;
    }
    if (!inside) {
      if (trace !== void 0)
        trace.push({ view: v, why: "missed \u2014 the point is outside this view's own box", x: Math.round(lx), y: Math.round(ly) });
      return null;
    }
    if (trace !== void 0)
      trace.push({ view: v, why: "HIT \u2014 the deepest box containing the point", x: Math.round(lx), y: Math.round(ly) });
    return v;
  }
  function chainAt(app, x, y) {
    const chain = /* @__PURE__ */ new Set();
    let leaf = leafAt(app, x, y);
    while (leaf !== null) {
      chain.add(leaf);
      leaf = isView(leaf.parent) ? leaf.parent : null;
    }
    return chain;
  }
  function ensureApp(app) {
    let state = APPS.get(app);
    if (state !== void 0)
      return state;
    const press = { wasDown: false, chain: /* @__PURE__ */ new Set() };
    const recs = /* @__PURE__ */ new Map();
    const driver = new Constraint("App.$interaction", () => {
      const x = app.pointerX;
      const y = app.pointerY;
      const down = app.pointerDown;
      const hovering = app.hovering;
      const chain = hovering ? chainAt(app, x, y) : /* @__PURE__ */ new Set();
      if (down && !press.wasDown)
        press.chain = hovering ? new Set(chain) : chainAt(app, x, y);
      if (!down)
        press.chain.clear();
      press.wasDown = down;
      return { chain, down, hovering };
    }, (v) => {
      const { chain, down, hovering } = v;
      for (const [view, rec] of recs) {
        if (view.parent === null && view !== app) {
          recs.delete(view);
          continue;
        }
        const h = chain.has(view);
        const p = down && press.chain.has(view) && (hovering ? chain.has(view) : true);
        if (h !== rec.hovered) {
          rec.hovered = h;
          rec.hCell.changed();
        }
        if (p !== rec.pressed) {
          rec.pressed = p;
          rec.pCell.changed();
        }
      }
    });
    state = { recs, press, driver };
    APPS.set(app, state);
    return state;
  }
  function recOf(view) {
    const root = view.root;
    if (root !== null && root !== void 0 && isView(root)) {
      const state = ensureApp(root);
      let r2 = state.recs.get(view);
      if (r2 === void 0) {
        r2 = ORPHANS.get(view) ?? { hovered: false, pressed: false, hCell: new Cell(), pCell: new Cell() };
        state.recs.set(view, r2);
        state.driver.run();
      }
      return r2;
    }
    let r = ORPHANS.get(view);
    if (r === void 0) {
      r = { hovered: false, pressed: false, hCell: new Cell(), pCell: new Cell() };
      ORPHANS.set(view, r);
    }
    return r;
  }
  function hitAt(root, x, y, pierce = false) {
    if (!isView(root))
      return null;
    return leafAt(root, x, y, pierce);
  }
  function boxContains(view, x, y) {
    const chain = [];
    for (let n = view; isView(n); n = n.parent)
      chain.push(n);
    const rootV = chain[chain.length - 1];
    let lx = x - rootV.scrollX;
    let ly = y - rootV.scrollY;
    for (let i = chain.length - 2; i >= 0; i--) {
      [lx, ly] = toChildLocal(chain[i + 1], chain[i], lx, ly);
    }
    return lx >= 0 && ly >= 0 && lx <= view.width && ly <= view.height;
  }
  function rootFrameOrigin(view) {
    let x = 0;
    let y = 0;
    for (let n = view; n !== null; ) {
      x += n.x;
      y += n.y;
      const p = isView(n.parent) ? n.parent : null;
      if (p !== null && p.scrolls !== "none" && !n.ignoreScroll) {
        x -= p.scrollX;
        y -= p.scrollY;
      }
      n = p;
    }
    return { x, y };
  }
  function readHovered(view) {
    const r = recOf(view);
    r.hCell.track();
    return r.hovered;
  }
  function readPressed(view) {
    const r = recOf(view);
    r.pCell.track();
    return r.pressed;
  }
  var isView, APPS, ORPHANS;
  var init_interaction = __esm({
    "runtime/dist/interaction.js"() {
      "use strict";
      init_reactive();
      isView = (_n) => false;
      APPS = /* @__PURE__ */ new WeakMap();
      ORPHANS = /* @__PURE__ */ new WeakMap();
    }
  });

  // runtime/dist/tip.js
  var SHOW_DELAY_MS, WARM_MS, TipService, Tip;
  var init_tip = __esm({
    "runtime/dist/tip.js"() {
      "use strict";
      init_interaction();
      SHOW_DELAY_MS = 500;
      WARM_MS = 300;
      TipService = class {
        handlers = /* @__PURE__ */ new Set();
        timer = null;
        current = null;
        shown = false;
        warmUntil = 0;
        /** Subscribe (`Tip [ onTip(e) { … } ]`). Returns the unsubscribe thunk. */
        onTip(fn) {
          this.handlers.add(fn);
          return () => this.handlers.delete(fn);
        }
        /** The pointer entered a tip-carrying view. */
        over(view) {
          if (view === this.current)
            return;
          this.current = view;
          this.clearTimer();
          if (this.shown || Date.now() < this.warmUntil) {
            this.publish(view);
            return;
          }
          const theme = view.theme;
          const delay = typeof theme?.tooltipDelay === "number" ? theme.tooltipDelay : SHOW_DELAY_MS;
          this.timer = setTimeout(() => {
            this.timer = null;
            if (this.current === view)
              this.publish(view);
          }, delay);
        }
        /** The pointer left the view. Hiding by DEPARTURE keeps the system warm. */
        out(view) {
          if (view !== this.current)
            return;
          this.current = null;
          this.clearTimer();
          if (this.shown) {
            this.shown = false;
            this.warmUntil = Date.now() + WARM_MS;
            this.emit(null);
          }
        }
        /** A press (or any interaction) dismisses AND cools — the tip never
         *  outlives intent, and the next hover earns the full delay again. */
        hide() {
          this.current = null;
          this.clearTimer();
          this.warmUntil = 0;
          if (this.shown) {
            this.shown = false;
            this.emit(null);
          }
        }
        publish(view) {
          const text = String(view.tip ?? "");
          if (text === "")
            return;
          const o = rootFrameOrigin(view);
          let root = view;
          for (let n = view; n !== null && typeof n === "object"; ) {
            root = n;
            n = n.parent ?? null;
          }
          this.shown = true;
          this.emit({ text, x: o.x, y: o.y, w: view.width, h: view.height, root });
        }
        emit(e) {
          for (const fn of [...this.handlers])
            fn(e);
        }
        clearTimer() {
          if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
          }
        }
      };
      Tip = new TipService();
    }
  });

  // runtime/dist/draw.js
  function matMul(m, n) {
    const [a, b, c, d, e, f] = m;
    const [a2, b2, c2, d2, e2, f2] = n;
    return [a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2, a * e2 + c * f2 + e, b * e2 + d * f2 + f];
  }
  function union(b, x0, y0, x1, y1) {
    if (b === null)
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    const nx = Math.min(b.x, x0);
    const ny = Math.min(b.y, y0);
    return { x: nx, y: ny, w: Math.max(b.x + b.w, x1) - nx, h: Math.max(b.y + b.h, y1) - ny };
  }
  function record(fn, boxW, boxH) {
    const d = new Draw(boxW, boxH);
    fn(d);
    return d.list();
  }
  var cssOf, DrawGradient, isGradient2, Draw;
  var init_draw = __esm({
    "runtime/dist/draw.js"() {
      "use strict";
      init_errors();
      init_value();
      cssOf = (v) => typeof v === "string" ? v : colorToCss(v);
      DrawGradient = class {
        /** @internal the recorded form the style setter reads. */
        rec;
        constructor(kind, coords) {
          this.rec = { kind, coords, stops: [] };
        }
        addColorStop(offset, color) {
          this.rec.stops.push([offset, cssOf(color)]);
        }
      };
      isGradient2 = (v) => v instanceof DrawGradient;
      Draw = class {
        ops = [];
        /** THE VIEW'S OWN SIZE, for a drawing that sizes itself — `d.w` / `d.h`.
         *
         *  The scaffold has typed these since draw() was typed at all, so arithmetic
         *  on them compiled; the runtime never supplied them, so they read `undefined`,
         *  the arithmetic went NaN, the recording bounded to nothing and the drawing
         *  silently vanished. Typechecked, documented, and absent — found by a cold
         *  agent run, 2026-08-05.
         *
         *  GETTERS, not fields, and that is the whole design. `record()` runs inside a
         *  tracked computation, so reading the view's width here registers a dependency
         *  — meaning a plain field would make EVERY drawing re-record on resize, which
         *  is exactly the size-dependent recording the icon guidance warns costs a
         *  reallocation per frame. A getter is read only if the body reads it, so the
         *  dependency is pay-per-use: `d.w` opts a drawing into re-recording on resize,
         *  and a drawing that never mentions it never pays. */
        boxW;
        boxH;
        get w() {
          return this.boxW();
        }
        get h() {
          return this.boxH();
        }
        constructor(boxW = () => 0, boxH = () => 0) {
          this.boxW = boxW;
          this.boxH = boxH;
        }
        // ── bounds bookkeeping (recording-internal, never exposed) ──
        /** Everything painted so far; null until the first paint op. */
        ink = null;
        /** Extent of the current path; reset by beginPath, kept by fill/stroke
         *  (mirroring Canvas2D, where filling does not clear the path). */
        path = null;
        /** Mirror of the recorded lineWidth, for stroke expansion. */
        strokeHalf = 0.5;
        /** Cleared once an op paints an extent the recorder can't bound locally. */
        exactBounds = true;
        /** The live transform matrix [a,b,c,d,e,f] and its save/restore stack. Every
         *  painted extent is mapped through it before it grows the ink box, so the
         *  recording's bounds land in the VIEW's local space even under scale/rotate/
         *  translate — the per-view raster canvas is then sized to what actually
         *  paints, not to the pre-transform authoring coordinates (without this a
         *  scaled illustration is sized to its unscaled box and detaches from the
         *  view as it grows). */
        ctm = [1, 0, 0, 1, 0, 0];
        ctmStack = [];
        // ── styles ──
        set fillStyle(v) {
          this.ops.push(isGradient2(v) ? { op: "fillStyle", grad: v.rec } : { op: "fillStyle", v: cssOf(v) });
        }
        get fillStyle() {
          return this.readOnly("fillStyle");
        }
        set strokeStyle(v) {
          this.ops.push(isGradient2(v) ? { op: "strokeStyle", grad: v.rec } : { op: "strokeStyle", v: cssOf(v) });
        }
        get strokeStyle() {
          return this.readOnly("strokeStyle");
        }
        set lineWidth(v) {
          this.strokeHalf = v / 2;
          this.ops.push({ op: "set", k: "lineWidth", v });
        }
        get lineWidth() {
          return this.readOnly("lineWidth");
        }
        set lineCap(v) {
          this.ops.push({ op: "set", k: "lineCap", v });
        }
        get lineCap() {
          return this.readOnly("lineCap");
        }
        set lineJoin(v) {
          this.ops.push({ op: "set", k: "lineJoin", v });
        }
        get lineJoin() {
          return this.readOnly("lineJoin");
        }
        set miterLimit(v) {
          this.ops.push({ op: "set", k: "miterLimit", v });
        }
        get miterLimit() {
          return this.readOnly("miterLimit");
        }
        set lineDashOffset(v) {
          this.ops.push({ op: "set", k: "lineDashOffset", v });
        }
        get lineDashOffset() {
          return this.readOnly("lineDashOffset");
        }
        setLineDash(segments) {
          this.ops.push({ op: "setLineDash", segments: segments.slice() });
        }
        set globalAlpha(v) {
          this.ops.push({ op: "set", k: "globalAlpha", v });
        }
        get globalAlpha() {
          return this.readOnly("globalAlpha");
        }
        set globalCompositeOperation(v) {
          this.ops.push({ op: "set", k: "globalCompositeOperation", v });
        }
        get globalCompositeOperation() {
          return this.readOnly("globalCompositeOperation");
        }
        // shadow/blur: the extent grows unpredictably past the shape, so bounds go loose
        set shadowBlur(v) {
          this.exactBounds = false;
          this.ops.push({ op: "set", k: "shadowBlur", v });
        }
        get shadowBlur() {
          return this.readOnly("shadowBlur");
        }
        set shadowColor(v) {
          this.ops.push({ op: "set", k: "shadowColor", v: cssOf(v) });
        }
        get shadowColor() {
          return this.readOnly("shadowColor");
        }
        set shadowOffsetX(v) {
          this.exactBounds = false;
          this.ops.push({ op: "set", k: "shadowOffsetX", v });
        }
        get shadowOffsetX() {
          return this.readOnly("shadowOffsetX");
        }
        set shadowOffsetY(v) {
          this.exactBounds = false;
          this.ops.push({ op: "set", k: "shadowOffsetY", v });
        }
        get shadowOffsetY() {
          return this.readOnly("shadowOffsetY");
        }
        set filter(v) {
          this.exactBounds = false;
          this.ops.push({ op: "set", k: "filter", v });
        }
        get filter() {
          return this.readOnly("filter");
        }
        set imageSmoothingEnabled(v) {
          this.ops.push({ op: "set", k: "imageSmoothingEnabled", v });
        }
        get imageSmoothingEnabled() {
          return this.readOnly("imageSmoothingEnabled");
        }
        set imageSmoothingQuality(v) {
          this.ops.push({ op: "set", k: "imageSmoothingQuality", v });
        }
        get imageSmoothingQuality() {
          return this.readOnly("imageSmoothingQuality");
        }
        // text state
        set font(v) {
          this.ops.push({ op: "set", k: "font", v });
        }
        get font() {
          return this.readOnly("font");
        }
        set textAlign(v) {
          this.ops.push({ op: "set", k: "textAlign", v });
        }
        get textAlign() {
          return this.readOnly("textAlign");
        }
        set textBaseline(v) {
          this.ops.push({ op: "set", k: "textBaseline", v });
        }
        get textBaseline() {
          return this.readOnly("textBaseline");
        }
        set direction(v) {
          this.ops.push({ op: "set", k: "direction", v });
        }
        get direction() {
          return this.readOnly("direction");
        }
        set letterSpacing(v) {
          this.ops.push({ op: "set", k: "letterSpacing", v });
        }
        get letterSpacing() {
          return this.readOnly("letterSpacing");
        }
        set wordSpacing(v) {
          this.ops.push({ op: "set", k: "wordSpacing", v });
        }
        get wordSpacing() {
          return this.readOnly("wordSpacing");
        }
        set fontKerning(v) {
          this.ops.push({ op: "set", k: "fontKerning", v });
        }
        get fontKerning() {
          return this.readOnly("fontKerning");
        }
        // ── gradients (recordable handles — Canvas2D shape, plain-data payload) ──
        createLinearGradient(x0, y0, x1, y1) {
          return new DrawGradient("linear", [x0, y0, x1, y1]);
        }
        createRadialGradient(x0, y0, r0, x1, y1, r1) {
          return new DrawGradient("radial", [x0, y0, r0, x1, y1, r1]);
        }
        createConicGradient(startAngle, x, y) {
          return new DrawGradient("conic", [startAngle, x, y]);
        }
        // ── rects ──
        fillRect(x, y, w, h) {
          this.ops.push({ op: "fillRect", x, y, w, h });
          this.mark(x, y, x + w, y + h);
        }
        strokeRect(x, y, w, h) {
          this.ops.push({ op: "strokeRect", x, y, w, h });
          const e = this.strokeHalf;
          this.mark(x - e, y - e, x + w + e, y + h + e);
        }
        clearRect(x, y, w, h) {
          this.ops.push({ op: "clearRect", x, y, w, h });
          this.mark(x, y, x + w, y + h);
        }
        // ── path building ──
        beginPath() {
          this.ops.push({ op: "beginPath" });
          this.path = null;
        }
        moveTo(x, y) {
          this.ops.push({ op: "moveTo", x, y });
          this.extend(x, y, x, y);
        }
        lineTo(x, y) {
          this.ops.push({ op: "lineTo", x, y });
          this.extend(x, y, x, y);
        }
        /** Bounds take the full circle's box — conservative for partial arcs,
         *  exact for full ones, and no trigonometry in the recorder. */
        arc(x, y, r, a0, a1, ccw = false) {
          this.ops.push({ op: "arc", x, y, r, a0, a1, ccw });
          this.extend(x - r, y - r, x + r, y + r);
        }
        /** The tangent arc's box is bounded by its two guide points (conservative:
         *  the curve stays within their span plus the corner it rounds). */
        arcTo(x1, y1, x2, y2, r) {
          this.ops.push({ op: "arcTo", x1, y1, x2, y2, r });
          this.extend(x1, y1, x1, y1);
          this.extend(x2, y2, x2, y2);
        }
        ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) {
          this.ops.push({ op: "ellipse", x, y, rx, ry, rot, a0, a1, ccw });
          const r = Math.max(Math.abs(rx), Math.abs(ry));
          this.extend(x - r, y - r, x + r, y + r);
        }
        rect(x, y, w, h) {
          this.ops.push({ op: "rect", x, y, w, h });
          this.extend(x, y, x + w, y + h);
        }
        roundRect(x, y, w, h, radii = 0) {
          this.ops.push({ op: "roundRect", x, y, w, h, radii: Array.isArray(radii) ? radii.slice() : radii });
          this.extend(x, y, x + w, y + h);
        }
        quadraticCurveTo(cpx, cpy, x, y) {
          this.ops.push({ op: "quadraticCurveTo", cpx, cpy, x, y });
          this.extend(cpx, cpy, cpx, cpy);
          this.extend(x, y, x, y);
        }
        bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
          this.ops.push({ op: "bezierCurveTo", cp1x, cp1y, cp2x, cp2y, x, y });
          this.extend(cp1x, cp1y, cp1x, cp1y);
          this.extend(cp2x, cp2y, cp2x, cp2y);
          this.extend(x, y, x, y);
        }
        closePath() {
          this.ops.push({ op: "closePath" });
        }
        // ── paint ──
        fill(rule) {
          this.ops.push({ op: "fill", rule });
          if (this.path)
            this.mark(this.path.x, this.path.y, this.path.x + this.path.w, this.path.y + this.path.h);
        }
        /** Stroke ink extends half the line width beyond the path box. (A sharp
         *  miter join can poke further; bounds stay advisory until dirty-region
         *  culling consumes them — the rung that lands culling owns tightening.) */
        stroke() {
          this.ops.push({ op: "stroke" });
          if (this.path) {
            const e = this.strokeHalf;
            this.mark(this.path.x - e, this.path.y - e, this.path.x + this.path.w + e, this.path.y + this.path.h + e);
          }
        }
        /** Clip narrows subsequent painting to the current path — no ink of its own,
         *  scoped by save/restore. */
        clip(rule) {
          this.ops.push({ op: "clip", rule });
        }
        // Text: the run's width/height need font metrics the recorder can't measure,
        // so bounds go loose (the anchor point is recorded for a floor).
        fillText(text, x, y, maxWidth) {
          this.ops.push({ op: "fillText", text: String(text), x, y, maxWidth });
          this.exactBounds = false;
          this.mark(x, y, x, y);
        }
        strokeText(text, x, y, maxWidth) {
          this.ops.push({ op: "strokeText", text: String(text), x, y, maxWidth });
          this.exactBounds = false;
          this.mark(x, y, x, y);
        }
        // ── state + transform ──
        // The recorder tracks the transform matrix, so bounds stay EXACT under any
        // affine transform (the mapped corners give the local-space extent); only
        // blur/filter/text leave bounds inexact.
        save() {
          this.ctmStack.push([...this.ctm]);
          this.ops.push({ op: "save" });
        }
        restore() {
          const m = this.ctmStack.pop();
          if (m)
            this.ctm = m;
          this.ops.push({ op: "restore" });
        }
        translate(x, y) {
          const [a, b, c, d, e, f] = this.ctm;
          this.ctm = [a, b, c, d, a * x + c * y + e, b * x + d * y + f];
          this.ops.push({ op: "translate", x, y });
        }
        rotate(angle) {
          const s = Math.sin(angle), co = Math.cos(angle);
          this.ctm = matMul(this.ctm, [co, s, -s, co, 0, 0]);
          this.ops.push({ op: "rotate", angle });
        }
        scale(x, y) {
          const [a, b, c, d, e, f] = this.ctm;
          this.ctm = [a * x, b * x, c * y, d * y, e, f];
          this.ops.push({ op: "scale", x, y });
        }
        transform(a, b, c, d, e, f) {
          this.ctm = matMul(this.ctm, [a, b, c, d, e, f]);
          this.ops.push({ op: "transform", m: [a, b, c, d, e, f] });
        }
        setTransform(a, b, c, d, e, f) {
          this.ctm = [a, b, c, d, e, f];
          this.ops.push({ op: "setTransform", m: [a, b, c, d, e, f] });
        }
        resetTransform() {
          this.ctm = [1, 0, 0, 1, 0, 0];
          this.ops.push({ op: "resetTransform" });
        }
        /** The finished recording. Called by record(); a Draw is single-use. */
        list() {
          return { ops: this.ops, bounds: this.ink, exact: this.exactBounds };
        }
        readOnly(what) {
          throw new DeclareError(`the draw context is write-only \u2014 ${what} cannot be read back; inputs come in through attributes (rendering model)`);
        }
        extend(x0, y0, x1, y1) {
          this.path = union(this.path, x0, y0, x1, y1);
        }
        /** Grow the ink box by a painted extent, mapping its four corners through
         *  the live transform first (a rotate makes the axis-aligned span of the
         *  mapped corners the tight local box). Callers pass authoring coordinates;
         *  `extend` keeps the current PATH in those same coordinates, and the
         *  transform is applied here, once, when the path/rect is committed to ink. */
        mark(x0, y0, x1, y1) {
          const [a, b, c, d, e, f] = this.ctm;
          if (a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0) {
            this.ink = union(this.ink, x0, y0, x1, y1);
            return;
          }
          const xa = a * x0 + c * y0 + e, xb = a * x1 + c * y0 + e, xc = a * x0 + c * y1 + e, xd = a * x1 + c * y1 + e;
          const ya = b * x0 + d * y0 + f, yb = b * x1 + d * y0 + f, yc = b * x0 + d * y1 + f, yd = b * x1 + d * y1 + f;
          this.ink = union(this.ink, Math.min(xa, xb, xc, xd), Math.min(ya, yb, yc, yd), Math.max(xa, xb, xc, xd), Math.max(ya, yb, yc, yd));
        }
      };
    }
  });

  // runtime/dist/select.js
  function sliceIndices(len, [start, end, step0]) {
    const step = step0 ?? 1;
    if (step === 0)
      return [];
    const norm = (v) => v >= 0 ? v : len + v;
    const s = start ?? (step > 0 ? 0 : len - 1);
    const e = end ?? (step > 0 ? len : -len - 1);
    const out = [];
    if (step > 0) {
      const lower = Math.min(Math.max(norm(s), 0), len);
      const upper = Math.min(Math.max(norm(e), 0), len);
      for (let i = lower; i < upper; i += step)
        out.push(i);
    } else {
      const upper = Math.min(Math.max(norm(s), -1), len - 1);
      const lower = Math.min(Math.max(norm(e), -1), len - 1);
      for (let i = upper; i > lower; i += step)
        out.push(i);
    }
    return out;
  }
  function applySeg(nodes, seg) {
    const out = [];
    for (const n of nodes) {
      const v = n.value;
      if (typeof seg === "string") {
        if (isObj(v) && !Array.isArray(v) && Object.hasOwn(v, seg)) {
          out.push({ path: [...n.path, seg], value: v[seg] });
        }
      } else if ("i" in seg) {
        if (Array.isArray(v)) {
          const i = seg.i < 0 ? v.length + seg.i : seg.i;
          if (i >= 0 && i < v.length)
            out.push({ path: [...n.path, String(i)], value: v[i] });
        }
      } else if ("w" in seg) {
        if (Array.isArray(v)) {
          v.forEach((el, i) => out.push({ path: [...n.path, String(i)], value: el }));
        } else if (isObj(v)) {
          for (const key of Object.keys(v))
            out.push({ path: [...n.path, key], value: v[key] });
        }
      } else {
        if (Array.isArray(v)) {
          for (const i of sliceIndices(v.length, seg.s)) {
            out.push({ path: [...n.path, String(i)], value: v[i] });
          }
        }
      }
    }
    return out;
  }
  function selectNodes(data, base2, plan) {
    const k = plan.findIndex((s) => typeof s !== "string");
    const prefix = k < 0 ? plan : plan.slice(0, k);
    const path = [...base2, ...prefix];
    const start = data.read(path);
    if (start === void 0)
      return [];
    let nodes = [{ path, value: start }];
    if (k >= 0)
      for (const seg of plan.slice(k))
        nodes = applySeg(nodes, seg);
    return nodes;
  }
  function selectValue(data, base2, plan) {
    const singular = plan.every((s) => typeof s === "string" || "i" in s);
    const nodes = selectNodes(data, base2, plan);
    if (singular)
      return nodes.length > 0 && nodes[0].value !== void 0 ? nodes[0].value : null;
    return nodes.map((n) => n.value);
  }
  var isObj;
  var init_select = __esm({
    "runtime/dist/select.js"() {
      "use strict";
      isObj = (v) => typeof v === "object" && v !== null;
    }
  });

  // runtime/dist/view.js
  function provideViewCreator(fn) {
    viewCreator = fn;
  }
  function isWindowedBlock(v) {
    return WINDOWED_BLOCKS.has(v);
  }
  function readVirtualized(v) {
    windowedCell(v).track();
    return WINDOWED_BLOCKS.has(v);
  }
  function markWindowedBlock(v, on) {
    const was = WINDOWED_BLOCKS.has(v);
    if (on)
      WINDOWED_BLOCKS.add(v);
    else
      WINDOWED_BLOCKS.delete(v);
    if (was !== on)
      windowedCell(v).changed();
  }
  function markEvicting(v) {
    EVICTING.add(v);
  }
  function fireRetireTree(v) {
    if (RETIRED.has(v))
      return;
    RETIRED.add(v);
    for (const c of v.children) {
      if (c instanceof View)
        fireRetireTree(c);
    }
    fireEvent(v, "retire");
  }
  function fireInitTree(v) {
    fireEvent(v, "init");
    for (const c of v.children) {
      if (c instanceof View)
        fireInitTree(c);
    }
  }
  function inheritedCursor(node) {
    for (let n = node; n !== null; n = n.parent) {
      if (n instanceof View) {
        const dp = n.datapath;
        if (dp !== null)
          return dp;
      }
    }
    return null;
  }
  function setFocusDiscardHook(fn) {
    focusDiscardHook = fn;
  }
  function fireEvent(view, event, arg) {
    const h = view[handlerName(event)];
    if (typeof h === "function")
      h.call(view, arg);
  }
  function markRichPending(v) {
    const walk = (n) => {
      const f = n;
      if (typeof f.measurePending === "boolean" && f.surface?.deferredRichMeasure === true)
        f.measurePending = true;
      for (const c of n.children)
        walk(c);
    };
    walk(v);
  }
  function anyRichPending(root) {
    let pending = false;
    const walk = (n) => {
      if (pending)
        return;
      if (n.measurePending === true) {
        pending = true;
        return;
      }
      for (const c of n.children)
        walk(c);
    };
    walk(root);
    return pending;
  }
  function findAnchor(root, name) {
    const inset = root.revealInset ?? 0;
    const views = [];
    const slugs = [];
    const walk = (n) => {
      if (n instanceof View) {
        if (n.anchor !== "") {
          const v = n;
          views.push({ base: v.anchor, fire: () => {
            if (v.surface === null)
              return false;
            v.scrollIntoView("start", false, inset);
            return true;
          } });
        }
        const flow = n;
        if (typeof flow.anchorSlugs === "function" && typeof flow.revealAnchor === "function") {
          for (const s of flow.anchorSlugs())
            slugs.push({ base: s, fire: () => flow.revealAnchor(s, inset) });
        }
      }
      for (const c of n.children)
        walk(c);
    };
    walk(root);
    const seen = /* @__PURE__ */ new Map();
    for (const c of [...views, ...slugs]) {
      const n = (seen.get(c.base) ?? 0) + 1;
      seen.set(c.base, n);
      const key = n === 1 ? c.base : `${c.base}-${n}`;
      if (key === name)
        return c.fire;
    }
    return null;
  }
  var viewCreator, INSTALLED, WINDOWED_BLOCKS, WINDOWED_CELLS, windowedCell, EVICTING, RETIRED, EXTENT, AXIS_OF, View, pushTransform, pushScrolls, focusDiscardHook, App, EMPTY_ENV2, DOMIsland;
  var init_view = __esm({
    "runtime/dist/view.js"() {
      "use strict";
      init_node();
      init_value();
      init_stylesheet();
      init_backend();
      init_tip();
      init_draw();
      init_reactive();
      init_interaction();
      init_attributes();
      init_schema();
      init_datapath();
      init_select();
      init_node();
      viewCreator = null;
      INSTALLED = /* @__PURE__ */ new WeakMap();
      WINDOWED_BLOCKS = /* @__PURE__ */ new WeakSet();
      WINDOWED_CELLS = /* @__PURE__ */ new WeakMap();
      windowedCell = (v) => {
        let c = WINDOWED_CELLS.get(v);
        if (c === void 0)
          WINDOWED_CELLS.set(v, c = new Cell());
        return c;
      };
      EVICTING = /* @__PURE__ */ new WeakSet();
      RETIRED = /* @__PURE__ */ new WeakSet();
      EXTENT = /* @__PURE__ */ new WeakMap();
      AXIS_OF = { width: "x", height: "y" };
      View = class _View extends Node2 {
        /** The navigation target the compiler's link extraction (links.ts) found for
         *  this instance's activation handler — stamped by instantiate from the source
         *  element's `link`. Read only by the static extractor (static-html.ts) to wrap the
         *  subtree in `<a href>`; undefined for all but the handful of navigable views. */
        _navLink;
        /** Resolve a declared stylesheet by name — the honest public call for
         *  reaching a stylesheet from inside a `{ }` body, where you are in real TS and
         *  a bare `Dark` is (correctly) just an unresolved identifier, NOT sugar:
         *  `stylesheet = { night ? this.lookupStylesheet("Dark")
         *                        : this.lookupStylesheet("Light") }`.
         *  The bare-name form `stylesheet = Dark` is the DECLARATIVE surface and is
         *  compile-checked there; inside a body the name is a runtime string, so a
         *  miss throws loud + positioned (stylesheetByName) rather than resolving to a
         *  silent null. Resolved against the program registry at the tree root. */
        lookupStylesheet(name) {
          let root = this;
          while (root.parent !== null)
            root = root.parent;
          return stylesheetByName(root, name);
        }
        /** The enclosing class instance — the node this view was *written* inside
         *  (a named class's root, or the App root, whose whole tree is the
         *  anonymous App class, language §5/§11): a class-body child points at its
         *  class instance; a class instance itself (and any use-site child) points
         *  at the OUTER scope, since its element is written in the outer body.
         *  Structure, like `parent` — set once by instantiate, not reactive. Null
         *  on the root and on hand-built trees. */
        classroot = null;
        /** This view's handle on the render backend — null until attached. */
        surface = null;
        /** The backend this view attached on — what lets a view that arrives
         *  AFTER attach (a replicated instance, R8) realize itself into the live
         *  tree. Null until attached. */
        backend = null;
        /** The draw method's standing recording (null until one exists). Phase 1:
         *  it re-records only after value constraints settle, so a draw body
         *  always sees consistent attributes. */
        drawing = null;
        /** Realize this view and its subtree on a backend: create the surface,
         *  flush the current visual state across the seam, parent it (before
         *  `before` when the tree is mutating mid-list — R8; null appends), and
         *  recurse. This is the substrate-agnostic render pass — View touches only
         *  the Surface API. After this, the attribute setters push changes to the
         *  live surface one Surface call at a time. */
        attach(backend2, parentSurface, before = null) {
          this.backend = backend2;
          this.bindExtent();
          const s = this.surface = backend2.createSurface();
          this.flush(s);
          parentSurface?.insertChild(s, before);
          for (const child of this.children) {
            if (child instanceof _View)
              child.attach(backend2, s);
          }
        }
        /** Read data relative to this view's inherited cursor — the runtime form
         *  every `:path` in a `{ }` body resolves to. The COMPILER emits the
         *  pre-parsed segments (`:location.city` → `this.$data(["location","city"])`,
         *  compile.ts resolveBody — data-paths.md §5's emitted plans); the string
         *  form remains for hand-written calls and the direct-instantiate dev path
         *  (expr.ts's link-time rewrite). Tracked like any read: the binding wakes
         *  when exactly this region — or any datapath on the chain above — changes.
         *  An unresolved path yields null (language §9). */
        $data(path) {
          const cursor = inheritedCursor(this);
          if (cursor === null)
            return null;
          const plan = typeof path === "string" ? splitPath(path) : path;
          if (plan.every((s) => typeof s === "string")) {
            const v = cursor.data.read([...cursor.path, ...plan]);
            return v === void 0 ? null : v;
          }
          return selectValue(cursor.data, cursor.path, plan);
        }
        /** Write `v` to `path` relative to this view's inherited cursor — the write
         *  twin of `$data`, the runtime half of a two-way `<->` binding (language §9,
         *  the leaf-input exception). Lands through `Dataset.set` (equality-gated →
         *  the read side that fed the field re-reads the same value and stops at the
         *  gate, so committing a draft is a no-op round-trip, not a loop). A datapath
         *  that resolves to no dataset is a no-op — there is nowhere to write.
         *  Accepts pre-parsed segments like $data, for symmetry. */
        $setData(path, v) {
          const cursor = inheritedCursor(this);
          if (cursor === null)
            return;
          const segs = typeof path === "string" ? splitPath(path) : path;
          cursor.data.set([...cursor.path, ...segs], v);
        }
        /** The tree-mutation entry (R8): children were inserted/removed/reordered
         *  as a unit — re-arm the installed arrangement and re-derive auto-extent,
         *  once per burst (the replicator calls this once per reconcile, not per
         *  child). A replicated block arriving under a never-sized view can also
         *  make a slot newly derivable — bindExtent picks it up. */
        childrenMutated() {
          this.layout?.rearm();
          if (this.backend !== null)
            this.bindExtent();
          const derives = EXTENT.get(this);
          if (derives !== void 0) {
            for (const size of ["width", "height"]) {
              const d = derives[size];
              if (d !== void 0 && ownerOf(this, size) === d)
                d.run();
            }
          }
        }
        /** This view's own content's extent on a size axis, folded into the
         *  auto-extent max — 0 for a plain view; Image overrides with the bitmap's
         *  natural size. Runs under tracking, so an override may read reactive
         *  state (Image reads `loaded`). */
        contentExtent(_size) {
          return 0;
        }
        /** Install auto-extent derives for whichever never-set, unowned size slots
         *  qualify — only on views with View children (a childless view keeps its
         *  zero-cost default; Dataset children are not geometry). Protected so the
         *  App can retarget it from content to its host. */
        bindExtent() {
          if (!this.children.some((c) => c instanceof _View))
            return;
          let derives = EXTENT.get(this);
          for (const size of ["width", "height"]) {
            if (isSet(this, size) || ownerOf(this, size) !== null)
              continue;
            if (derives === void 0)
              EXTENT.set(this, derives = {});
            derives[size] = bindDerived(this, size, () => this.extentOf(size));
          }
        }
        extentOf(size) {
          this.watchChildList();
          const axis = AXIS_OF[size];
          let max = this.contentExtent(size);
          for (const c of this.children) {
            if (!(c instanceof _View) || !c.visible)
              continue;
            if (c.ignoreClip)
              continue;
            if (percentOwned(c, axis) || percentOwned(c, size))
              continue;
            const extent = c[axis] + c[size];
            if (extent > max)
              max = extent;
          }
          return max;
        }
        /** The bounding-box extent of this view's visible children on each axis — the
         *  same value auto-extent derives into an *unset* size slot (`extentOf`),
         *  surfaced as read-only reactive attributes (schema.ts marks them readOnly,
         *  so a set is a compile error) so a constraint can CLAMP a size:
         *  `height = { Math.min(classroot.contentHeight, 480) }`. Reading either from
         *  a size constraint is loop-free — `extentOf` excludes percent-bound children
         *  on the derived axis, the same cycle guard auto-extent relies on. Always
         *  live, and independent of this view's own width/height. */
        get contentWidth() {
          return this.extentOf("width");
        }
        get contentHeight() {
          return this.extentOf("height");
        }
        /** This view's View children — the reactive read of the child list, and the
         *  only one there is: `children` is a plain array (machinery included, and
         *  unlike the DOM's `children` it is NOT pre-filtered), so reading it in a
         *  `{ }` tracks nothing and freezes. This wakes on arrival and removal, which
         *  is what a container populated by replication or `createView` needs.
         *
         *  Set membership only — the cell does not carry a child's own attributes, so
         *  `.length` is live while `.map(c => c.width)` would wire half of what it
         *  reads. Aggregation over a node collection is refused for exactly that
         *  reason (dep-extract); the number you want is usually in the data. */
        get childViews() {
          this.watchChildList();
          return this.children.filter((c) => c instanceof _View);
        }
        /** Is this view's replicated content virtualized right now? Read-only, and
         *  TRACKED — the policy takes a `{ }`, so a block can engage and disengage
         *  while the program runs, and a constraint reading this follows it.
         *
         *  This is what makes `childViews` legible on a virtualized block: the list
         *  is the instances that exist, which is a subset, and this says so. Counts
         *  of the collection still come from the DATA, which is complete by
         *  definition — but that is now a thing you can see rather than a rule the
         *  runtime enforces by refusing to answer. */
        get virtualized() {
          return readVirtualized(this);
        }
        /** Pointer-interaction intrinsics (interaction.ts): `hovered` is true while
         *  this view is on the live hit chain — the topmost visible view under the
         *  pointer and its ancestors, occlusion-correct, false on touch; `pressed`
         *  while it is on the chain captured at pointer-down (a mouse press releases
         *  dragged off, re-arms dragged back; a touch press holds while down).
         *  Read-only reactive intrinsics like `contentWidth` (schema readOnly — a
         *  set is a compile error); reading one from a constraint subscribes it.
         *  Pay-per-use: a program that never reads them allocates nothing. */
        get hovered() {
          return readHovered(this);
        }
        get pressed() {
          return readPressed(this);
        }
        /** The default focus-traversal members of this view: its visible View
         *  children in source order (docs/system-design/input.md, Layer 2). The focus
         *  service descends into each; a view whose `tabOrder()` is not overridden
         *  uses this, so an all-default tree is pure tree preorder. An override may
         *  call it to compose ("the rest, minus X"). */
        tabDefault() {
          const out = [];
          for (const c of this.children)
            if (c instanceof _View && c.visible)
              out.push(c);
          return out;
        }
        /** Internal focus notification, called by the focus service when this view
         *  gains (true) or loses (false) Declare focus — SEPARATE from the user's
         *  `onFocus`/`onBlur` handlers, so a built-in component (TextInput) can drive
         *  its native element without occupying the author's event slot. No-op on a
         *  plain view. */
        focusChanged(_focused) {
        }
        /** The OPTICAL band the `center` position literal centers — { lead, size }
         *  along the given axis, in this view's own coordinates. The base answer is
         *  the whole box (lead 0); Text overrides the y axis with its ink band (cap
         *  height to last baseline — the text-box-trim semantics). The same
         *  component-supplies-its-shape protocol family as the focus silhouette. */
        alignBand(axis) {
          return { lead: 0, size: axis === "x" ? this.width : this.height };
        }
        /** Retire this subtree: dispose every standing computation (bindings,
         *  percents, derives, a laid parent's constraints on these slots, the draw
         *  recording), run registered teardowns (a replicator's), uninstall the
         *  arrangement, and destroy the surfaces — so no data or attribute change
         *  can ever wake work for a removed view. Children first; the model links
         *  (parent/children) are the caller's to cut (Node.removeChild). */
        discard() {
          if (EVICTING.has(this))
            EVICTING.delete(this);
          else
            fireRetireTree(this);
          focusDiscardHook?.(this);
          for (const child of this.children)
            child.discard();
          runRetire(this);
          const undoLayout = INSTALLED.get(this);
          if (undoLayout !== void 0) {
            INSTALLED.delete(this);
            undoLayout();
          }
          disposeApplier(this);
          disposeBindings(this);
          this.drawing?.dispose();
          this.drawing = null;
          const s = this.surface;
          this.surface = null;
          this.backend = null;
          s?.destroy();
        }
        /** Push this view's full visual state across the seam. Subclasses extend
         *  it with their capabilities (Text, Image); it runs before the children
         *  attach, so a backend that keeps content in arrival order (the DOM) gets
         *  exactly the paint order the Canvas walk uses: content, then children. */
        flush(s) {
          if (this.selectable === true)
            s.setSelectableRegion?.(true);
          s.setX(this.x);
          s.setY(this.y);
          s.setWidth(this.width);
          s.setHeight(this.height);
          s.setFill(this.fill);
          if (this.cornerRadius !== 0)
            s.setCornerRadius(this.cornerRadius);
          if (this.stroke !== null)
            s.setStroke(this.stroke);
          if (this.shadow !== null)
            s.setShadow(this.shadow);
          s.setVisible(this.visible);
          s.setOpacity(this.opacity);
          if (this.ignoreClip)
            s.setIgnoreClip?.(true);
          if (this.ignoreScroll)
            s.setIgnoreScroll?.(true);
          if (this.cursor !== "")
            s.setCursor(this.cursor);
          if (this.pointerEvents !== "")
            s.setPointerEvents(this.pointerEvents);
          if (this.scale !== 1 || this.pivotX !== 0 || this.pivotY !== 0)
            s.setScale(this.scale, this.pivotX, this.pivotY);
          if (this.rotation !== 0)
            s.setRotation?.(this.rotation, this.pivotX, this.pivotY);
          if (this.blend !== "normal")
            s.setBlend?.(this.blend);
          if (this.backdrop !== null)
            s.setBackdrop?.(this.backdrop);
          this.applyClip(this.clip);
          if (this.scrolls === "y" || this.scrolls === "both")
            s.setScroll?.(true, (y) => {
              this.scrollY = y;
            });
          if (this.scrolls === "x" || this.scrolls === "both")
            s.setScrollX?.(true, (x) => {
              this.scrollX = x;
            });
          const sink = this.inputSink();
          if (sink !== null)
            s.setInput(sink, this.inputWants());
          if (this.cursor === "" && this.link !== "")
            s.setCursor("pointer");
          if (this.link !== "")
            s.setLink?.(this.link, this.label ?? "");
          if (this.draw)
            this.bindDraw();
        }
        /** THE HIT TEST: the view under a root-space point, or null. The same walk
         *  the pointer is routed by (interaction.ts) — clip shapes, scale, pivot,
         *  `pointerEvents`, and `ignoreClip` all count exactly as they do for a real
         *  press — so what a handler computes and what the runtime routes can never
         *  disagree. Answers the deepest (topmost) view; walk `.parent` to find an
         *  eligible ancestor:
         *
         *      onPointerUp(e) {
         *          let t = app.viewAt(e.x, e.y)
         *          while (t != null && t.accept == null) t = t.parent
         *          if (t != null) t.accept(dragged)
         *          },
         *
         *  Root-space, like the coordinates `onPointerMove`/`onPointerUp` carry, so a
         *  drag can pass its own event coordinates straight in. (Root-space is the
         *  root's CONTENT space; the walk itself runs in frame space, so the root's
         *  own scroll converts here at the boundary — the contract stays exactly
         *  what the drag pairing needs, scrolled or not.) */
        viewAt(x, y) {
          const r = this.root ?? this;
          return hitAt(r, x - r.scrollX, y - r.scrollY);
        }
        /** Does this view's box contain the root-space point? Geometry only — what
         *  paints ON TOP is `viewAt`'s question — so a drop target can ask about
         *  itself without walking the tree. */
        containsPoint(x, y) {
          return boxContains(this, x, y);
        }
        /** This view's origin in ROOT space (the root's content coordinates — the
         *  same space `viewAt` takes and drag events carry). THE one walk
         *  (interaction.ts): translate per level MINUS every intermediate scroll
         *  offset, with the root's own scroll added back at the boundary — so an
         *  overlay anchored by it (a menu at a pointer, a popover under a control)
         *  lands where the view is SEEN, at any scroll. Components call this
         *  instead of hand-accumulating ancestor x/y, which is scroll-blind. */
        rootOrigin() {
          const o = rootFrameOrigin(this);
          const r = this.root ?? this;
          return { x: o.x + r.scrollX, y: o.y + r.scrollY };
        }
        /** Travel with `scroller`: re-host this view's SURFACE inside the
         *  scroller's container so the platform carries it with the scrolled
         *  content — zero-lag chrome that belongs to content (the FocusRing's
         *  ride; the inverse of `ignoreScroll`). Position slots then mean the
         *  scroller's CONTENT coordinates. Pass null (or this view's own parent —
         *  its natural host) to come home; the ROOT is a real destination, not
         *  home, so chrome can climb OUT of a scroller that sits directly under
         *  it (the DataGrid header's escape).
         *  Returns whether the surface now rides the scroller — false when the
         *  backend can't (no surface yet, or no travelWith), so callers keep the
         *  reactive root-space fallback. */
        travelWith(scroller) {
          const s = this.surface;
          if (s === null || typeof s.travelWith !== "function")
            return false;
          const home = scroller === null || scroller === this.parent;
          if (home) {
            s.travelWith(null);
            return false;
          }
          if (scroller.surface === null)
            return false;
          s.travelWith(scroller.surface);
          return true;
        }
        /** Scroll this view to the top of its nearest scrolling ancestor — the
         *  imperative companion to the reactive `scrolls`/`scrollY` pair (a click
         *  handler calls it to jump to a target). Both backends do the work in their
         *  Surface; a no-op before attach or with nothing scrolling above. (Named for
         *  the platform primitive — `reveal` is deliberately left free as a member name,
         *  e.g. a `reveal:` fade-in Spring.) */
        scrollIntoView(align, smooth, inset) {
          this.surface?.scrollIntoView(align, smooth, inset);
        }
        /** Promotion (planes.md §1 — order is a slot): re-link this view among its
         *  siblings, tree and surface both. `raise()` moves it to the FRONT (last
         *  child — stacking is source order); `raise(below)` moves it to just BENEATH
         *  a sibling instead, so a pinned band above it (e.g. the dock's minimized
         *  windows) stays on top. Same parent only — the verb form of z-order, no
         *  numbers. A Menu raises at open; a Window raises on activation.
         *
         *  A TRAVELING surface (travelWith) keeps its host: its parentage is the
         *  travel host's business, and re-seating it under the model parent would
         *  drag it home while its position slots still read the host's CONTENT
         *  coordinates — the ring painting a scroller's origin above its target.
         *  The MODEL order still moves; only the surface seat is left alone. */
        raise(below) {
          const p = this.parent;
          if (!(p instanceof _View))
            return;
          const away = this.surface?.isTraveling?.() === true;
          if (below == null || below === this || below.parent !== p) {
            if (p.children[p.children.length - 1] === this)
              return;
            p.removeChild(this);
            p.insertChild(this, p.children.length);
            if (!away && this.surface !== null && p.surface !== null)
              p.surface.insertChild(this.surface, null);
            return;
          }
          if (p.children[p.children.indexOf(below) - 1] === this)
            return;
          p.removeChild(this);
          const at = p.children.indexOf(below);
          p.insertChild(this, at < 0 ? p.children.length : at);
          if (!away && this.surface !== null && p.surface !== null && below.surface !== null) {
            p.surface.insertChild(this.surface, below.surface);
          }
        }
        /** This view's input route, or null when it answers no pointer event —
         *  interactivity *derives* from declared handlers (Decisions §R5): a view
         *  with none is never wired (pay-per-use) and stays transparent to input,
         *  which is what lets a decorative child sit over an interactive parent
         *  without stealing its clicks (LZX's `clickable` intent, made automatic).
         *  A handler receives one plain event argument — the pointer position in
         *  this view's own coordinates. */
        inputSink() {
          const self = this;
          const handled = POINTER_TYPES.some((t) => typeof self[handlerName(t)] === "function");
          if (!handled && this.tip === "" && this.link === "")
            return null;
          return (type, x, y, extra) => {
            if (this.tip !== "") {
              if (type === "pointerOver")
                Tip.over(this);
              else if (type === "pointerOut")
                Tip.out(this);
              else if (type === "pointerDown")
                Tip.hide();
            }
            if (handled)
              fireEvent(this, type, extra === void 0 ? { x, y } : { x, y, ...extra });
            if (type === "click" && this.link !== "") {
              const app = this.root;
              app?.follow?.(this.link, this.replace);
            }
          };
        }
        /** Re-derive the surface's input wiring — the pusher for attributes that
         *  GRANT interest by their value (`link`; a post-attach handler install goes
         *  through here too). Idempotent: attach-time flush and this call converge
         *  on the same sink/wants pair. */
        rewireInput() {
          const s = this.surface;
          if (s === null)
            return;
          const sink = this.inputSink();
          if (sink !== null)
            s.setInput(sink, this.inputWants());
          if (this.cursor === "")
            s.setCursor(this.link !== "" ? "pointer" : "");
        }
        /** What the ROUTER needs to know about this view's declared handlers to
         *  arbitrate gestures for it (input.ts HitTarget): whether it answers
         *  double-clicks (so its single click waits out the double window), holds,
         *  or the raw touch family (so the whole multi-finger stream is delivered and
         *  nothing is interpreted). Declaration IS the opt-in — no configuration. */
        inputWants() {
          const self = this;
          const has = (t) => typeof self[handlerName(t)] === "function";
          return {
            wantsDbl: has("dblClick"),
            wantsHold: has("hold"),
            wantsTouch: TOUCH_TYPES.some(has),
            wantsPinch: PINCH_TYPES.some(has),
            wantsDrag: has("pointerMove"),
            wantsWheel: has("wheel"),
            claimAxis: this.claim,
            wantsContext: has("contextMenu")
          };
        }
        /** Stand up the draw method as a tracked, re-recording computation. */
        bindDraw() {
          this.drawing = new Constraint(
            `${this.constructor.name}.draw`,
            // The box arrives as THUNKS so `d.w`/`d.h` register a dependency only when
            // the body actually reads one (draw.ts) — a drawing that ignores its size
            // must not re-record on every resize.
            () => record((d) => this.draw(d), () => this.width, () => this.height),
            // Constraint is deliberately untyped across compute→apply (reactive.ts);
            // this apply's input is exactly its compute's output.
            (list) => this.surface?.setDrawing(list),
            1
          );
          this.drawing.run();
        }
        /** Re-record right now — the explicit half of draw-on-invalidation (the
         *  attribute-driven half is the recording's own tracked reads). Also the
         *  entry point for a draw method assigned after attach. */
        invalidateDraw() {
          if (this.drawing !== null)
            this.drawing.run();
          else if (this.draw && this.surface !== null)
            this.bindDraw();
        }
        /** Realize the `clip` slot across the seam (the pusher and flush both land
         *  here). Both modes are set explicitly on every apply, so a switch between
         *  the forms — true → a Shape path → false — never leaves two clips
         *  fighting. Pre-attach (surface null) it is a no-op; flush replays it once
         *  the surface exists.
         *    - `true`  → the backend BOX-clip mode (setBoxClip): clip to the view's
         *      own rounded box, tracked by the backend as it animates — and with
         *      CONTAINMENT semantics (backend.ts): children parked beyond the box
         *      contribute no scrollable overflow and cannot be focus-scrolled into
         *      view. No derive needed — the backend reads the box at use time.
         *    - a Shape string → that path, straight to the backend (shape-clip,
         *      paint + hit only);
         *    - false / null   → no clip. */
        applyClip(clip) {
          if (this.surface === null)
            return;
          this.surface.setBoxClip(clip === true);
          this.surface.setClip(typeof clip === "string" ? clip : null);
        }
      };
      pushTransform = (v) => {
        v.surface?.setScale(v.scale, v.pivotX, v.pivotY);
        v.surface?.setRotation?.(v.rotation, v.pivotX, v.pivotY);
      };
      pushScrolls = (v, ax) => {
        v.surface?.setScroll?.(ax === "y" || ax === "both", (y) => {
          v.scrollY = y;
        });
        v.surface?.setScrollX?.(ax === "x" || ax === "both", (x) => {
          v.scrollX = x;
        });
      };
      defineAttributes(View, {
        x: { def: 0, push: (v, n) => v.surface?.setX(n) },
        y: { def: 0, push: (v, n) => v.surface?.setY(n) },
        width: { def: 0, push: (v, n) => v.surface?.setWidth(n) },
        height: { def: 0, push: (v, n) => v.surface?.setHeight(n) },
        fill: { def: null, push: (v, f) => v.surface?.setFill(f), equal: fillEqual },
        cornerRadius: { def: 0, push: (v, r) => v.surface?.setCornerRadius(r) },
        stroke: { def: null, push: (v, st) => v.surface?.setStroke(st), equal: strokeEqual },
        shadow: { def: null, push: (v, sh) => v.surface?.setShadow(sh), equal: shadowEqual },
        visible: { def: true, push: (v, b) => {
          v.surface?.setVisible(b);
          if (b)
            markRichPending(v);
        } },
        ignoreLayout: { def: false, push: (v) => {
          const p = v.parent;
          if (p instanceof View)
            p.childrenMutated();
        } },
        ignoreClip: { def: false, push: (v, b) => v.surface?.setIgnoreClip?.(b) },
        ignoreScroll: { def: false, push: (v, b) => v.surface?.setIgnoreScroll?.(b) },
        opacity: { def: 1, push: (v, o) => v.surface?.setOpacity(o) },
        cursor: { def: "", push: (v, c) => v.surface?.setCursor(c) },
        pointerEvents: { def: "", push: (v, c) => v.surface?.setPointerEvents(c) },
        // Scale + rotation + pivot ride one transform at the seam: any of the four
        // re-pushes the combined value (transform + transform-origin on the DOM).
        // setScale always accompanies setRotation so a backend can keep ONE
        // composed transform without ordering questions.
        scale: { def: 1, push: pushTransform },
        pivotX: { def: 0, push: pushTransform },
        pivotY: { def: 0, push: pushTransform },
        rotation: { def: 0, push: pushTransform },
        // optional-chained (the ignoreScroll pattern): backends adopt independently,
        // and the seam table (test/seam.test.mjs) says which have.
        blend: { def: "normal", push: (v, b) => v.surface?.setBlend?.(b) },
        backdrop: { def: null, push: (v, b) => v.surface?.setBackdrop?.(b), equal: backdropEqual },
        focusable: { def: false },
        focusTrap: { def: false },
        // `anchor` — the view's name in the reveal namespace (location.md §6). A stored
        // slot the reveal walk reads after settle; "" = not an anchor. No push: it has
        // no surface effect. (Materializes §6's "named view"; heading slugs are the rest.)
        anchor: { def: "" },
        // `link` — the view IS a link to this reference (location.md §0): "#name" in-app,
        // anything else out through `navigate`. "" = not a link (no interest, no focus
        // stop, nothing for the crawl). Interest derives from it exactly as from declared
        // handlers (inputSink) — the `tip` precedent — so the push REWIRES the surface's
        // input when the value changes (empty↔non-empty flips interest itself).
        link: { def: "", push: (v) => {
          v.rewireInput();
          v.surface?.setLink?.(v.link, v.label ?? "");
        } },
        // `replace` — this link overwrites the current history entry instead of pushing
        // (location.md §0.5.6): fine-grained movement WITHIN a place (a deck's arrows),
        // not movement between places. Read by App.follow when the link is followed.
        replace: { def: false },
        // `shows` — this view manifests the named location (location.md §0.4). The slot
        // stores the name for the registry and introspection; the VISIBILITY it implies
        // is lowered to a `visible` binding at instantiation (instantiate.ts), so the
        // hit walk, focus traversal, and auto-extent all see it through the one channel.
        shows: { def: "" },
        clip: { def: null, push: (v, c) => v.applyClip(c) },
        // Scroll container: the axis enum wires the backend's native scroll per
        // declared axis and feeds the user's offsets back into `scrollY`/`scrollX`
        // (plain reactive writes — no push, so they never echo to the surface;
        // reads drive fades/reveals).
        scrolls: { def: "none", push: pushScrolls },
        tip: { def: "" },
        // TWO-WAY: the backend mirrors user scrolling IN (setScroll's callback); a
        // program write pushes OUT. The echo is inert — a mirrored value arrives
        // already equal to the surface's, so the push's scrollTo is a no-op there.
        // This is what lets an app drive its own scroller (the Files strip animates
        // `scrollX` to reveal a fresh column) instead of asking a platform reveal to
        // find one — scrollIntoView is axis-blind and walks ancestors, which is how
        // a horizontal strip reveal once vertically scrolled the island hosting it.
        scrollY: { def: 0, push: (v, y) => v.surface?.scrollToY?.(y) },
        claim: { def: "both" },
        scrollX: { def: 0, push: (v, x) => v.surface?.scrollToX?.(x) },
        // The prevailing built-ins: model-side on View (no push — Text's style
        // derive is the consumer that crosses the seam). Defaults are the
        // browser-native text defaults Text carried through R3–R9.
        textColor: { def: 0, prevailing: true },
        selectable: {
          def: false,
          prevailing: true,
          // Phase-2 selection: an explicitly-selectable container realizes as a
          // selection surface (optional-chained — DOM-only affordance).
          push: (v, val) => v.surface?.setSelectableRegion?.(val === true)
        },
        fontSize: { def: 16, prevailing: true },
        fontFamily: { def: "sans-serif", prevailing: true },
        fontWeight: { def: "normal", prevailing: true },
        letterSpacing: { def: 0, prevailing: true },
        iconSize: { def: 16, prevailing: true },
        // Rich-text structure overrides — consumed by Markdown/HTMLText (null color =
        // the theme-aware house token; headingWeight = the house bold).
        headingColor: { def: null, prevailing: true },
        headingWeight: { def: "bold", prevailing: true },
        linkColor: { def: null, prevailing: true },
        codeColor: { def: null, prevailing: true },
        codeSize: { def: 0, prevailing: true },
        codeFamily: { def: "", prevailing: true },
        codeBackground: { def: null, prevailing: true },
        codeRule: { def: null, prevailing: true },
        richTextLayout: { def: null, prevailing: true },
        theme: { def: DEFAULT_THEME, prevailing: true },
        styles: { def: null },
        // The pusher installs appliers under a newly-providing view (existing
        // appliers re-run through their own tracked follow of this slot).
        stylesheet: { def: null, prevailing: true, push: (v) => stylesheetArrived(v) },
        layout: {
          def: null,
          // The install/uninstall side of the slot: detach the old arrangement
          // (releasing its ownership of child positions), stand up the new one over
          // the children present now. instantiate assigns it after the tree is
          // linked; a runtime swap goes through this same one path.
          push: (v, l) => {
            INSTALLED.get(v)?.();
            INSTALLED.delete(v);
            if (l !== null)
              INSTALLED.set(v, l.attachTo(v));
          }
        },
        // The cursor is model state: bindings read it (tracked), nothing renders it.
        datapath: { def: null }
      });
      focusDiscardHook = null;
      App = class _App extends View {
        /** app→host navigation channel: `navigate(to)` sets it, the host (host-client.js
         *  / a backend) polls it, opens the URL, and clears it to "". A plain field, not
         *  a reactive attribute — nothing in the tree renders from it, and no Declare
         *  source names it: navigation is the CALL, never an observed attribute. */
        pendingNav = "";
        /** navigate(to) — the navigation SERVICE ACTION (capabilities.md §6). A link or
         *  button calls `app.navigate(url)` in an activation handler; the compiler reads
         *  the call statically (links.ts → `<a href>` in the static extraction), and at
         *  runtime the host opens `to`. DOM-free: bodies never touch window.location, so
         *  navigation rides this channel like `editing` — one clear way, analyzable. */
        /** Imperative creation (planes.md §7): instantiate a component by NAME
         *  into `parent`, a full citizen (bindings installed, init fired). Resolves
         *  against this tree's program registry; a name referenced only here needs
         *  `use [ Name ]` to survive static tracing. `props` are post-init writes
         *  (`datapath: record` gives the instance a data context — replication's
         *  convention). */
        createView(tag, parent, props) {
          if (viewCreator === null)
            throw new Error("createView: the instantiation module is not loaded");
          return viewCreator(this, tag, parent, props);
        }
        navigate(to) {
          this.pendingNav = to;
        }
        /** The reference schemes a link may carry (location.md §0.4) — the shared
         *  predicate lives at the render seam (backend.ts allowedRef), because the
         *  realization path enforces it too: a disallowed scheme never becomes an
         *  href, so copy-link and middle-click — native paths that never enter
         *  follow — stay shut. */
        static allowedRef(ref) {
          return allowedRef(ref);
        }
        /** The destination part of a location — the runtime strips ITS OWN trailing
         *  `@name` (§6's one shared grammar character); the app never writes the
         *  split. `shows` lowers to a comparison against this (instantiate.ts). */
        destinationOf(loc) {
          const at = loc.indexOf("@");
          return at >= 0 ? loc.slice(0, at) : loc;
        }
        /** The history verb the NEXT location mirror should use (location.md §0.5.6):
         *  "push" (default), or "replace" — set by follow when the link carries
         *  `replace = true`, and by the host itself on traversal/cold arrivals so a
         *  redirect can never mint an entry (no Back loops). Consumed (reset to
         *  "push") by the host at the mirror. A plain field, like pendingNav. */
        pendingHistoryVerb = "push";
        /** follow(ref) — the ONE operation behind every arrival (location.md §0.5):
         *  a linked view's activation, a rich-text href, a cold URL, back/forward.
         *  Source requests, runtime delivers, destination decides. The app-scoped
         *  hook `onFollow(ref) -> ref'` (a user-declared method, §0.6) is applied
         *  ONCE — transform, veto (""), or side-effect; then an external reference
         *  leaves through `navigate`, and a `#…` writes `location`. The anchor
         *  reveal rides the existing retained intent (resolveReveal); an anchorless
         *  arrival seeds the scroll to the top. Re-following the current reference
         *  re-runs the arrival step — no dead clicks. */
        follow(ref, replace = false) {
          if (!_App.allowedRef(ref))
            return;
          const hook = this.onFollow;
          if (typeof hook === "function") {
            const out = hook.call(this, ref);
            if (typeof out !== "string" || out === "")
              return;
            ref = out;
            if (!_App.allowedRef(ref))
              return;
          }
          if (!ref.startsWith("#")) {
            this.navigate(ref);
            return;
          }
          let loc = ref.slice(1);
          if (loc !== "" && loc.indexOf("@") < 0 && loc.indexOf("/") < 0) {
            const dest = this.destinationOfAnchor(loc);
            if (dest !== null)
              loc = dest === "" ? this.destinationOf(this.location) + "@" + loc : dest + "@" + loc;
          }
          if (replace)
            this.pendingHistoryVerb = "replace";
          const same = this.location === loc;
          this.location = loc;
          if (loc.indexOf("@") < 0)
            this.scrollIntoView("start");
          else if (same)
            this.rearmReveal();
        }
        /** The destination gating an anchored view: walk the tree for `anchor ===
         *  name`, then up from it for the nearest `shows`. null = no such anchor
         *  (the name is a destination or a computed location); "" = an anchor
         *  outside any destination (reveal within the current location). */
        destinationOfAnchor(name) {
          let found = null;
          const walk = (n) => {
            if (found !== null)
              return;
            if (n instanceof View && n.anchor === name) {
              found = n;
              return;
            }
            for (const c of n.children)
              walk(c);
          };
          walk(this);
          const f = found;
          if (f === null)
            return null;
          for (let v = f; v !== null; v = v.parent instanceof View ? v.parent : null) {
            if (v.shows !== "")
              return v.shows;
          }
          return "";
        }
        /** app→host channel for openWindow, exactly like pendingNav: the verb writes
         *  it, the host polls it on the next frame and window.opens (still inside the
         *  click's transient user activation, so it isn't popup-blocked). */
        pendingOpen = "";
        /** app→host channel for the Inspector (the third of the same shape). A button
         *  calls `app.inspect("run:spring")` naming an island slot — or `""` for this
         *  app itself — and the host opens the Inspector on that subject. A plain
         *  field, not a reactive attribute: nothing renders from it, and no Declare
         *  source reads it. */
        pendingInspect = null;
        /** inspect(slot) — the Inspector SERVICE ACTION. `slot` names an embedded
         *  app's island ("run:spring"); omit it to inspect this app. Like navigate(),
         *  the intent rides a channel the host owns, so a `{ }` body never touches
         *  the document. */
        inspect(slot = "") {
          this.pendingInspect = slot;
        }
        /** openWindow(to) — navigate's NEW-WINDOW sibling (a "View Source" that must
         *  not replace the running app). Same discipline: bodies never touch
         *  `window`, the intent rides a channel the host owns. */
        openWindow(to) {
          this.pendingOpen = to;
        }
        /** The reveal intent held from `location`'s trailing `@name` (location.md §6) —
         *  null when the location carries no anchor. Retained across settles until the
         *  name appears in a settled tree; re-armed or cancelled when `location` changes. */
        pendingAnchor = null;
        lastRevealLocation = null;
        /** Resolve the pending `@name` reveal against the current settled tree. The host
         *  calls this after settles — and each frame while an intent is held, so a cold
         *  deep link (`/#guide/22-reach@some-heading`) fires once the DataSource lands and
         *  the heading renders. A location CHANGE re-arms the intent from its trailing
         *  `@name` (a change with no anchor cancels it); a resolved name fires the reveal
         *  and clears the intent. Runtime-side and backend-agnostic — the reveal itself
         *  splits at the surface seam (DOM scrollIntoView / canvas scroll clamp). Returns
         *  the name it revealed this call (else null) — the host ignores it; tests read it. */
        resolveReveal() {
          if (this.location !== this.lastRevealLocation) {
            this.lastRevealLocation = this.location;
            const at = this.location.indexOf("@");
            this.pendingAnchor = at >= 0 ? this.location.slice(at + 1) : null;
          }
          const name = this.pendingAnchor;
          if (name === null || name === "")
            return null;
          if (anyRichPending(this))
            return null;
          const fire = findAnchor(this, name);
          if (fire !== null && fire()) {
            this.pendingAnchor = null;
            return name;
          }
          return null;
        }
        /** Re-arm the reveal intent for the CURRENT location — follow's no-dead-click
         *  rule (§0.5): re-following `#why@story` while already there re-runs the
         *  reveal, which resolveReveal's location-change guard would otherwise skip. */
        rearmReveal() {
          this.lastRevealLocation = null;
        }
        /** Cancel a HELD reveal intent — the user's first scroll or touch takes
         *  ownership of the viewport (location.md §0.5.5, the uncontrolled-editor
         *  rule): a reference SEEDS the scroll position, it never owns it. The host
         *  calls this from its scroll/wheel/touch listeners; a reveal that already
         *  landed cleared the intent itself, so this is a no-op then — which is what
         *  makes the reveal's own scrollIntoView (whose scroll event arrives a tick
         *  later) safe from self-cancellation. */
        cancelReveal() {
          this.pendingAnchor = null;
        }
        /** The App's auto-extent is the HOST, not its content: an unset width/height
         *  follows hostWidth/hostHeight (reactive on resize), so the root app fills its
         *  enclosing area with no declaration — the near-universal case. An explicit
         *  `width = …` still wins (isSet skips the derive), and there is no children
         *  guard: the app fills its host even while empty. This is the exact yielding
         *  default the content path uses (View.bindExtent), retargeted from content to
         *  host — so a resize repaints like any dependency. `minWidth`/`minHeight`
         *  floor the derive (tracked reads, so a reactive floor re-applies live). */
        bindExtent() {
          let derives = EXTENT.get(this);
          for (const size of ["width", "height"]) {
            if (isSet(this, size) || ownerOf(this, size) !== null)
              continue;
            if (derives === void 0)
              EXTENT.set(this, derives = {});
            derives[size] = bindDerived(this, size, () => size === "width" ? Math.max(this.hostWidth, this.minWidth) : Math.max(this.hostHeight, this.minHeight));
          }
          this.bindPageScroll();
        }
        /** An App is CLIPPED BY DEFINITION (ruled 2026-07-29): a program owns its
         *  rectangle. The boolean form of `clip` is absorbed here — the per-axis
         *  realization (overflow along a declared scroll axis is the page's range;
         *  overflow along any other axis is out of frame) lives in the backend's
         *  root scroll styling, composed with `scrolls`. A Shape clip keeps its
         *  paint+hit meaning; `clip = false` is refused at compile time (check.ts). */
        applyClip(clip) {
          if (this.surface === null)
            return;
          this.surface.setClip(typeof clip === "string" ? clip : null);
        }
        /** Derive "can the page scroll right now?" from the model — a declared
         *  scroll axis with overflowing content, or a frame the floors hold larger
         *  than the host — and hand it to the root surface (backend.ts
         *  setPageScrollable), which keys the app's gesture default on it: pan
         *  stays with the user exactly when the page has somewhere to go, and
         *  retires (stilling the rubber-band) when it doesn't. Reactive — content
         *  growth, floor changes, and host resizes all re-derive; child mutations
         *  re-run it through childrenMutated like the auto-extent derives. */
        pageScroll = null;
        bindPageScroll() {
          if (this.pageScroll !== null)
            return;
          this.pageScroll = new Constraint("App.pageExtent", () => [this.contentWidth, this.contentHeight], (wh) => {
            const [w, h] = wh;
            this.surface?.setPageExtent?.(w, h);
          }, 1);
          this.pageScroll.run();
        }
        childrenMutated() {
          super.childrenMutated();
          this.pageScroll?.run();
        }
      };
      initInteraction((n) => n instanceof View);
      EMPTY_ENV2 = Object.freeze({});
      defineAttributes(App, {
        // An App SCROLLS BY DEFAULT, and its scroller is the page (ruled
        // 2026-07-29): the App is the outermost view, so its scroll regime is the
        // browser's own — content taller than the frame makes the page itself
        // scroll. Same pusher as View's; the backend realizes the ROOT regime as
        // the document scroll instead of a pane (dom-backend applyScrollStyle).
        // An app whose content fits has nothing to scroll — the fixed window is
        // this default, idle. A calendar-shaped app may state `scrolls = none`.
        scrolls: { def: "y", push: pushScrolls },
        // `revealInset` — the scroll-margin analogue (location.md §0.5.4): fixed
        // chrome (a sticky header) overlaps a reveal target pinned to the viewport
        // top; the reveal lands this many pixels short instead. One knob, app-wide.
        revealInset: { def: 0 },
        // `crawlSeeds` — extra references the extraction crawl seeds beyond the
        // registry (location.md §0.8.2): computed locations worth emitting that no
        // rendered link reaches. An ordinary attribute the extractor reads at t=0.
        crawlSeeds: { def: [] },
        // Stored reactive slots the runtime feeds (index.ts). Read-only to USER code
        // via schema.readOnly (a compile error) — not `readOnly: true` here, which
        // would throw the setter the runtime feed needs. `width`/`height` default to
        // these (bindExtent above).
        hostWidth: { def: 0 },
        hostHeight: { def: 0 },
        scrollY: { def: 0 },
        pointerX: { def: 0 },
        pointerDown: { def: false },
        pointerY: { def: 0 },
        hovering: { def: false },
        pointerOverText: { def: false },
        dark: { def: false },
        touchDevice: { def: false },
        hasTouch: { def: false },
        hasPointer: { def: true },
        // a plain desktop until the profile says otherwise
        lastPointerType: { def: "mouse" },
        // the embedding environment's parameters (schema.ts): the HOST replaces the
        // whole record on every change (never mutates), so the default may be one
        // shared frozen empty object — reads like `app.env.dark` never null-crash
        env: { def: EMPTY_ENV2 },
        pageWeight: { def: 0 },
        sourceLines: { def: 0 },
        // `location` — the app's URL fragment (docs/system-design/location.md). A stored reactive
        // slot: the host seeds/writes it (deep link, back/forward), the app writes it to
        // navigate, and `{ }` constraints that read it (`visible = { app.location == … }`)
        // re-derive on every change. Default "" so an app that declares no initial keeps
        // a clean URL. NOT readOnly — navigation IS a write from app code.
        location: { def: "" },
        // `waypoint` — the history-carried step (schema.ts has the full contract).
        // A stored reactive slot exactly like location, with the opposite visibility:
        // the host mirrors it into the History entry's STATE OBJECT (never the URL)
        // and writes it back on traversal. Default "" = the declared initial step.
        waypoint: { def: "" },
        demoSources: { def: {} },
        liveReport: { def: "" },
        // the size floor (bindExtent) — author-settable, 0 = none
        minWidth: { def: 0 },
        minHeight: { def: 0 },
        // the app's human name (page title etc.) — author-settable, "" = host default
        appName: { def: "" }
      });
      DOMIsland = class extends View {
        flush(s) {
          super.flush(s);
          if (this.slot !== "")
            s.setEmbed(this.slot, this);
        }
      };
      defineAttributes(DOMIsland, {
        slot: { def: "", push: (v, id) => v.surface?.setEmbed(id, v) },
        childName: { def: "" }
      });
    }
  });

  // runtime/dist/animator.js
  function ledgerFor(target) {
    const t = target;
    return t[LEDGER] ??= /* @__PURE__ */ new Map();
  }
  function numOf(target, attr) {
    const v = target[attr];
    return typeof v === "number" ? v : 0;
  }
  function isAnimatable(n) {
    return n instanceof Animator || n instanceof AnimatorGroup;
  }
  var LEDGER, Animator, AnimatorGroup;
  var init_animator = __esm({
    "runtime/dist/animator.js"() {
      "use strict";
      init_node();
      init_animate();
      init_attributes();
      LEDGER = /* @__PURE__ */ Symbol("animatedAttributes");
      Animator = class _Animator extends Node2 {
        perpetual = false;
        // ── Per-run state: set by start(), read by tick(), cleared by end(). All
        //    the driving inputs are SAMPLED at start (animation.md §1) so writing
        //    `to`/`duration`/… mid-run has no effect until a restart. ────────────
        running = false;
        /** Group-driven: an enclosing AnimatorGroup registers the clock and ticks
         *  us, so start()/stop() must NOT touch the shared clock themselves. */
        grouped = false;
        runTarget = null;
        runAttr = "";
        /** The eased delta this run travels — measured against the ledger's expected
         *  value (LZX `this.to`), so an absolute `to` composes with everything in
         *  flight. Excludes the `from` snap (that rides `fromJump`). */
        runDelta = 0;
        /** The one-time `from` snap (from − slot's value at start), applied over the
         *  first frame; 0 when `from` is unset. Deferred to the first tick so a
         *  restart shows no jump at start() time. */
        fromJump = 0;
        /** How much this animator has contributed to the target so far — the sum of
         *  its written increments, `fromJump + ease(t)·runDelta`. The additive
         *  currentValue (LZX), one frame's increment being the delta of this. */
        traveled = 0;
        runDuration = 0;
        runMotion = DEFAULT_MOTION;
        cyclesLeft = 1;
        elapsed = 0;
        // accumulated ms in the current cycle (pause-aware)
        lastNow = null;
        autoStarted = false;
        /** Marked by an enclosing AnimatorGroup at construct: the group drives the
         *  clock and cascades attributes, so this animator is group-controlled. */
        markGrouped() {
          this.grouped = true;
        }
        isRunning() {
          return this.running;
        }
        /** The node whose slot this animator drives: its parent, but for a grouped
         *  member the enclosing group is transparent — the target is the group's own
         *  target (LZX cascades `target` down a group), i.e. the nearest ancestor
         *  that is not itself an animator/group. For an ungrouped animator this is
         *  just its parent (a View). Matches the checker's target context, which
         *  threads the group's PARENT schema through to its members. */
        resolveTarget() {
          let t = this.parent;
          while (t !== null && (t instanceof _Animator || t instanceof AnimatorGroup))
            t = t.parent;
          return t;
        }
        /** Auto-start at init if `started` (the initTree hook — once per lifetime,
         *  after the tree is linked and every binding has evaluated, so `from`
         *  samples a settled target value). A grouped animator is never reached here
         *  (its group is the init-time child, and it drives its members). */
        autoStart() {
          if (this.autoStarted || this.grouped)
            return;
          this.autoStarted = true;
          if (this.started)
            this.start();
        }
        /** Begin driving the target slot through the curve (LZX's doStart). A no-op
         *  while already running (LZX's guard). Samples from / to / duration /
         *  motion / repeat ONCE here, and enrolls in the slot's exact-landing ledger
         *  (displacing the slot's prior non-animator driver on the first arrival). */
        start() {
          if (this.running)
            return;
          const target = this.resolveTarget();
          const attr = this.attribute;
          if (target === null || attr === "")
            return;
          this.runTarget = target;
          this.runAttr = attr;
          const ledger = ledgerFor(target);
          let entry = ledger.get(attr);
          const fresh = entry === void 0;
          if (entry === void 0) {
            entry = { expected: 0, count: 0, displaced: null };
            ledger.set(attr, entry);
          }
          if (entry.count === 0) {
            entry.displaced = ownerOf(target, attr);
            entry.displaced?.suspend();
          }
          const preStart = numOf(target, attr);
          if (fresh)
            entry.expected = this.from !== null ? this.from : preStart;
          this.runDelta = this.relative ? this.to : this.to - entry.expected;
          entry.expected += this.runDelta;
          entry.count += 1;
          this.fromJump = this.from !== null ? this.from - preStart : 0;
          this.traveled = 0;
          this.runDuration = this.duration;
          this.runMotion = this.motion;
          this.cyclesLeft = this.repeat;
          this.perpetual = this.repeat === Infinity;
          this.elapsed = 0;
          this.lastNow = sharedClock.now();
          this.running = true;
          setBound(this, "settled", false);
          if (!this.grouped)
            sharedClock.add(this);
          this.fire("onStart");
        }
        /** Halt in place — no snap to either end (LZX). Idempotent; a no-op when not
         *  running. Leaves the ledger (resuming the displaced driver when it was the
         *  last animator), without landing an end value (animation.md §2). */
        stop() {
          if (!this.running)
            return;
          if (!this.grouped)
            sharedClock.remove(this);
          this.releaseSlot(false);
          this.end();
        }
        /** Retire with the host view (View.discard reaches us now): drop off the
         *  clock and dispose our own `{ }` bindings (`to`, `attribute`, …). Without
         *  this a discarded Spring's `to` binding stays subscribed to what it read —
         *  the leak — and the spring keeps ticking. Bindings first, so a stop() that
         *  fires onStop cannot re-target through a live binding. */
        discard() {
          disposeBindings(this);
          this.stop();
          super.discard();
        }
        /** One clock frame (the Ticker contract): advance by real elapsed time,
         *  write the eased DELTA additively, handle repeat / completion. `frozen`
         *  (an enclosing group's pause) freezes progression while keeping `lastNow`
         *  fresh so nothing jumps on unpause. Returns whether still running (false
         *  drops it from the clock; a group reads it to retire a finished member). */
        /** Shift the anchor across a scheduler handover (Ticker.rebase). */
        rebase(delta) {
          if (this.lastNow !== null)
            this.lastNow += delta;
        }
        tick(now, frozen = false) {
          if (!this.running)
            return false;
          if (this.lastNow === null)
            this.lastNow = now;
          const dt = Math.max(now - this.lastNow, 0);
          this.lastNow = now;
          if (this.paused || frozen)
            return true;
          this.elapsed += dt;
          while (this.runDuration > 0 && this.elapsed >= this.runDuration && this.cyclesLeft > 1) {
            this.elapsed -= this.runDuration;
            this.cyclesLeft -= 1;
            this.fire("onRepeat");
          }
          const t = this.runDuration > 0 ? Math.min(this.elapsed / this.runDuration, 1) : 1;
          if (t >= 1) {
            this.releaseSlot(true);
            setBound(this, "settled", true);
            this.end();
            return this.running;
          }
          const contribution = this.fromJump + sample(this.runMotion, t, this.runDelta) * this.runDelta;
          addBound(this.runTarget, this.runAttr, contribution - this.traveled);
          this.traveled = contribution;
          return true;
        }
        /** Leave the slot's exact-landing ledger. Decrement the live-animator count;
         *  on a natural completion (`finalize`) with others still running, bring this
         *  animator's own contribution to its full delta first. When the count hits
         *  zero: resume the one displaced driver re-evaluated (animation.md §2 rule
         *  4), and — on a natural completion — assign the exact expected value (no
         *  float drift, LaszloAnimation.lzs:347–365); a mid-flight stop() halts in
         *  place, only rolling its un-travelled remainder out of `expected` so the
         *  animators still running land where they were headed. */
        releaseSlot(finalize) {
          const target = this.runTarget;
          if (target === null)
            return;
          const attr = this.runAttr;
          const ledger = ledgerFor(target);
          const entry = ledger.get(attr);
          if (entry === void 0)
            return;
          entry.count -= 1;
          if (finalize && entry.count > 0) {
            addBound(target, attr, this.fromJump + this.runDelta - this.traveled);
            this.traveled = this.fromJump + this.runDelta;
          }
          if (entry.count <= 0) {
            const expected = entry.expected;
            ledger.delete(attr);
            if (finalize)
              setBound(target, attr, expected);
            entry.displaced?.resume();
          } else if (!finalize) {
            entry.expected -= this.fromJump + this.runDelta - this.traveled;
          }
        }
        /** Shared teardown for imperative stop AND natural completion (LZX has no
         *  finished-vs-stopped split): mark stopped, clear run state, fire onStop
         *  (which MAY restart us). The ledger cleanup + displaced resume already ran
         *  in releaseSlot; this only closes out the animator. */
        end() {
          this.running = false;
          this.runTarget = null;
          this.fire("onStop");
        }
        /** Fire a carried handler if one is installed (onStart / onStop / onRepeat).
         *  A plain Node dispatch — fireEvent (view.ts) is View-typed, and an
         *  animator is a Node; an absent handler is a silent no-op. */
        fire(handler) {
          const h = this[handler];
          if (typeof h === "function")
            h.call(this);
        }
      };
      defineAttributes(Animator, {
        attribute: { def: "" },
        to: { def: 0 },
        from: { def: null },
        relative: { def: false },
        duration: { def: 1e3 },
        motion: { def: DEFAULT_MOTION },
        repeat: { def: 1 },
        started: { def: false },
        paused: { def: false },
        settled: { def: false }
      });
      AnimatorGroup = class extends Node2 {
        running = false;
        /** The members still to finish this run, in tree order — LZX's `actAnim`. */
        active = [];
        cyclesLeft = 1;
        grouped = false;
        autoStarted = false;
        markGrouped() {
          this.grouped = true;
        }
        isRunning() {
          return this.running;
        }
        /** This group's members (child Animators / AnimatorGroups), in tree order. */
        members() {
          return this.children.filter(isAnimatable);
        }
        autoStart() {
          if (this.autoStarted || this.grouped)
            return;
          this.autoStarted = true;
          if (this.started)
            this.start();
        }
        /** Begin the group (LZX doStart): snapshot the members to run this cycle and
         *  register the one group ticker (unless the group is itself group-driven).
         *  Members are NOT started here — each is started lazily when it first
         *  becomes active (so a sequential member samples its `from` only once the
         *  members before it have moved the slot). */
        start() {
          if (this.running)
            return;
          this.running = true;
          this.cyclesLeft = this.repeat;
          this.active = this.members();
          if (!this.grouped)
            sharedClock.add(this);
          this.fire("onStart");
        }
        /** Stop the group (LZX stop): halt every still-running member in place, drop
         *  the group ticker, fire onStop. Idempotent. */
        stop() {
          if (!this.running)
            return;
          if (!this.grouped)
            sharedClock.remove(this);
          for (const m of this.active)
            if (m.isRunning())
              m.stop();
          this.endGroup();
        }
        /** Retire with the host view: drop the group ticker + own bindings, then
         *  recurse so each member animator disposes its own bindings too. */
        discard() {
          disposeBindings(this);
          this.stop();
          super.discard();
        }
        /** One group frame: drive the active members with the shared `now`, retire
         *  the finished, replay or finish when all are done. `sequential` advances
         *  only the head member per frame; `simultaneous` advances all. A `frozen`
         *  group (its own pause, or an enclosing group's) keeps running members'
         *  clocks fresh but neither starts pending members nor advances progression. */
        rebase(delta) {
          for (const m of this.active)
            m.rebase?.(delta);
        }
        tick(now, frozen = false) {
          if (!this.running)
            return false;
          const freeze = frozen || this.paused;
          if (freeze) {
            for (const m of this.active)
              if (m.isRunning())
                m.tick(now, true);
            return true;
          }
          if (this.process === "sequential") {
            const head = this.active[0];
            if (head !== void 0) {
              if (!head.isRunning())
                head.start();
              if (!head.tick(now))
                this.active.shift();
            }
          } else {
            let i = 0;
            while (i < this.active.length) {
              const m = this.active[i];
              if (!m.isRunning())
                m.start();
              if (m.tick(now))
                i += 1;
              else
                this.active.splice(i, 1);
            }
          }
          if (this.active.length === 0)
            return this.cycleComplete();
          return true;
        }
        /** All members done: replay the whole group (repeat) or finish it. */
        cycleComplete() {
          if (this.cyclesLeft > 1) {
            this.cyclesLeft -= 1;
            this.fire("onRepeat");
            this.active = this.members();
            return true;
          }
          this.endGroup();
          return this.running;
        }
        endGroup() {
          this.running = false;
          this.active = [];
          this.fire("onStop");
        }
        fire(handler) {
          const h = this[handler];
          if (typeof h === "function")
            h.call(this);
        }
      };
      defineAttributes(AnimatorGroup, {
        attribute: { def: "" },
        to: { def: 0 },
        from: { def: null },
        relative: { def: false },
        duration: { def: 1e3 },
        motion: { def: DEFAULT_MOTION },
        process: { def: "sequential" },
        repeat: { def: 1 },
        started: { def: false },
        paused: { def: false }
      });
    }
  });

  // runtime/dist/layout.js
  var BOX_SLOTS, Layout, TweenLayout;
  var init_layout = __esm({
    "runtime/dist/layout.js"() {
      "use strict";
      init_node();
      init_reactive();
      init_attributes();
      init_errors();
      init_view();
      init_animator();
      init_animate();
      BOX_SLOTS = [
        ["x", "x"],
        ["y", "y"],
        ["w", "width"],
        ["h", "height"],
        ["vis", "visible"]
      ];
      Layout = class extends Node2 {
        /** The view whose children this strategy arranges; null when unattached.
         *  Kept in step with `parent` (a Node link for upward navigation); this is
         *  the View-typed handle the arrangement uses. */
        view = null;
        undo = null;
        /** Each claimed (child, slot)'s AUTHORED BASE value, captured at first claim
         *  and kept across rearm. When a strategy vacates a slot (an axis flip, a
         *  layout swap) the slot reverts to this base — the authored cross-axis
         *  literal (`y = 15`) or the class default — instead of stranding whatever
         *  the arrangement last wrote (release() leaves the stored value; the
         *  restore is ours to make). */
        bases = /* @__PURE__ */ new Map();
        /** Begin arranging `view` (the View.layout pusher's entry). One strategy
         *  arranges one view: a strategy is written per element, and sharing one
         *  across views would make its reactive attributes action-at-a-distance.
         *
         *  Alongside install, a SHAPE WATCHER stands guard: the set of slots a
         *  strategy manages can itself depend on its inputs (a ResponsiveLayout
         *  tier flip swaps row→stack and shares appear/disappear), and the
         *  installed claims were probed from one shape. The watcher re-derives the
         *  shape signature under tracking and REARMS on change — a rearm restores
         *  vacated slots to their authored bases (see `rearming`) and re-probes.
         *  It lives OUTSIDE the install/undo cycle (rearm must not dispose its own
         *  trigger) and is disposed only on detach. */
        attachTo(view) {
          if (this.view !== null) {
            throw new DeclareError(`this ${this.constructor.name} already arranges a ${this.view.constructor.name} \u2014 one strategy per view`);
          }
          this.view = view;
          this.parent = view;
          this.undo = this.install(view);
          let lastShape = null;
          const watcher = new Constraint(`${this.constructor.name} shape`, () => this.place().map((b) => BOX_SLOTS.filter(([k]) => b[k] !== void 0).map(([k]) => k).join()).join("|"), (sig) => {
            if (lastShape === null) {
              lastShape = sig;
            } else if (sig !== lastShape) {
              lastShape = sig;
              this.rearm();
            }
          });
          watcher.run();
          return () => {
            watcher.dispose();
            this.undo?.();
            this.undo = null;
            this.view = null;
            this.parent = null;
          };
        }
        /** True while rearm() swaps installs — unclaim restores authored bases only
         *  then. A full detach (layout = null, a strategy swap) keeps the last
         *  arranged values instead (the documented release semantics: the slot
         *  reverts to a plain stored value); a rearm within ONE strategy (an axis
         *  flip, a plan regime change) must not strand the old arrangement's
         *  offsets on slots the new install no longer drives. */
        rearming = false;
        /** Re-run install — the entry for a *structural* attribute change (axis),
         *  where the constraints' target slots themselves change. Value-level
         *  attributes (spacing) never need this: constraints read them under
         *  tracking and re-run through the ordinary machinery. */
        rearm() {
          if (this.view === null)
            return;
          const undo = this.undo;
          this.undo = null;
          this.rearming = true;
          try {
            undo?.();
            this.undo = this.install(this.view);
          } finally {
            this.rearming = false;
          }
        }
        /** The children this strategy arranges: the view's View children, honoring
         *  the `ignoreLayout` opt-out (LZX's rule — a decoration/overlay child owns
         *  its own position, both axes). Non-View members (a Dataset, an Animator, a
         *  State) are never laid. In child order — order is the layout semantics —
         *  and `place()`'s boxes align with this array BY INDEX. */
        laid() {
          const v = this.view;
          if (v === null)
            return [];
          return v.children.filter((c) => c instanceof View && c.ignoreLayout !== true);
        }
        /** Claim `slot` on `child` for constraint `k`: capture the authored base
         *  (first claim only — rearm must not capture the arrangement's own writes),
         *  then take ownership. Errors loudly on a standing AUTHOR binding (two
         *  owners), naming both sides. A *yielding* prior — auto-extent, auto-size,
         *  the runtime derive every child without an authored size carries — is not
         *  a second author: it yields to a layout's claim exactly as it yields to an
         *  author write (`own` disposes it), which is what lets a `place()` that
         *  returns sizes arrange children that never declared any. Refusing it here
         *  was the bug a data-driven treemap found (issue #16): every templated
         *  child auto-derives its size, so the arrangement died on a conflict the
         *  ownership machinery downstream was built to resolve — and the message
         *  blamed an authored binding that did not exist. */
        claim(child, slot, k, label) {
          const prior = ownerOf(child, slot);
          if (prior !== null && !prior.yielding) {
            throw new DeclareError(`${child.constructor.name}.${slot} is already bound (by ${prior.label}), but ${label} arranges its children's ${slot} \u2014 drop one of the two`);
          }
          const base2 = this.bases.get(child) ?? {};
          if (!(slot in base2)) {
            base2[slot] = child[slot];
            this.bases.set(child, base2);
          }
          own(child, slot, k);
        }
        /** Release `k`'s claim of `slot` on `child`; during a rearm, restore the
         *  authored base (see `rearming` — a full detach keeps the last values).
         *  Does NOT dispose `k` — one constraint may back many slots (the pass), so
         *  disposal is the detacher's, once per distinct constraint. */
        unclaim(child, slot, k) {
          release(child, slot, k);
          if (!this.rearming)
            return;
          if (this.view !== null && isWindowedBlock(this.view))
            return;
          const base2 = this.bases.get(child);
          if (base2 !== void 0 && slot in base2) {
            setBound(child, slot, base2[slot]);
          }
        }
        /** The label claims and conflict errors carry. A strategy with an `axis`
         *  attribute gets it tagged on ("App's SimpleLayout[y]") — sharp diagnostics
         *  for any axis-bearing strategy, library or native. */
        label() {
          const ax = this.axis;
          const tag = typeof ax === "string" ? `[${ax}]` : "";
          return `${this.view === null ? "?" : this.view.constructor.name}'s ${this.constructor.name}${tag}`;
        }
        /** Stand up standing constraints over `view`'s children from `place()` —
         *  the ONE kernel wiring every strategy shares. Each child's own probe box
         *  declares its managed slots (shape may vary per child: a Spacer carries
         *  its flexed size, a plan-shared child its width, a plain sibling only its
         *  position). POSITIONS and VISIBILITY ride one shared pass-constraint —
         *  compute place() once per wave, fan out equality-gated writes (the
         *  kernel-only one-engine-many-slots shape the header describes). SIZES get
         *  a percent-family constraint per (child, slot) — markPercent — because a
         *  kernel-driven size is parent-extent-derived by nature and must sit out
         *  of auto-extent's max (the cycle guard percent Lengths ride); positions
         *  stay unmarked so containers keep auto-extending around laid children.
         *  Transactional: on a mid-install error nothing stays owned. Children are
         *  read at install (tree mutation is R8's rearm). TweenLayout overrides
         *  this with its interpolating write path over the same place(). */
        install(_view) {
          const kids = this.laid();
          if (kids.length === 0)
            return () => {
            };
          const label = this.label();
          const probe = this.place();
          if (probe.length !== kids.length) {
            throw new DeclareError(`${label}.place() returned ${probe.length} boxes for ${kids.length} laid children \u2014 one box per child, by index`);
          }
          const passClaims = [];
          const sizeClaims = [];
          kids.forEach((child, i) => {
            const box = probe[i] ?? {};
            for (const [key, slot] of BOX_SLOTS) {
              if (box[key] === void 0)
                continue;
              if (key === "w" || key === "h")
                sizeClaims.push({ child, slot, key, i });
              else
                passClaims.push({ child, slot, key, i });
            }
          });
          const installed = [];
          const detach = () => {
            const seen = /* @__PURE__ */ new Set();
            for (const o of installed) {
              if (!seen.has(o.k)) {
                seen.add(o.k);
                o.k.dispose();
              }
              this.unclaim(o.child, o.slot, o.k);
            }
          };
          try {
            if (passClaims.length > 0) {
              const pass = new Constraint(label, () => this.place(), (v) => {
                if (this.view !== null && isWindowedBlock(this.view))
                  return;
                const boxes = v;
                for (const c of passClaims) {
                  const b = boxes[c.i];
                  if (b !== void 0 && b[c.key] !== void 0)
                    setBound(c.child, c.slot, b[c.key]);
                }
              });
              for (const c of passClaims) {
                this.claim(c.child, c.slot, pass, label);
                installed.push({ child: c.child, slot: c.slot, k: pass });
              }
              pass.run();
            }
            for (const c of sizeClaims) {
              const k = new Constraint(`${label} \u2192 ${c.child.constructor.name}.${c.slot}`, () => this.place()[c.i]?.[c.key], (v) => {
                if (this.view !== null && isWindowedBlock(this.view))
                  return;
                setBound(c.child, c.slot, v);
              });
              markPercent(k);
              this.claim(c.child, c.slot, k, label);
              installed.push({ child: c.child, slot: c.slot, k });
              k.run();
            }
          } catch (e) {
            detach();
            throw e;
          }
          return detach;
        }
      };
      TweenLayout = class extends Layout {
        /** The single animator that drives `t`. A Node child of the layout, so it
         *  targets the layout itself (Animator.resolveTarget walks parent); created
         *  lazily on first install and reused across re-arms. */
        tween = null;
        /** Stand up one lerp constraint per laid child per geometry slot (owning it,
         *  the one-owner model), snapshot the initial layout, and evaluate. Re-run
         *  wholesale by rearm when the child set changes (R8). */
        install(_view) {
          if (this.tween === null) {
            const a = new Animator();
            a.attribute = "t";
            a.to = 1;
            a.motion = motionToken("laszloBoth");
            this.appendChild(a);
            this.tween = a;
          }
          const kids = this.laid();
          const owned = [];
          const SLOTS = [
            ["x", "x"],
            ["y", "y"],
            ["width", "w"],
            ["height", "h"]
          ];
          const detach = () => {
            this.tween?.stop();
            for (const o of owned) {
              release(o.child, o.slot, o.k);
              o.k.dispose();
            }
          };
          try {
            kids.forEach((child, idx) => {
              for (const [slot, key] of SLOTS) {
                const k = new Constraint(`${this.constructor.name}[${idx}].${slot}`, () => {
                  const f = this.from[idx];
                  const g = this.to[idx];
                  if (f === void 0 || g === void 0)
                    return 0;
                  const a = f[key];
                  const b = g[key];
                  return a + (b - a) * this.t;
                }, (v) => setBound(child, slot, v));
                own(child, slot, k);
                owned.push({ child, slot, k });
              }
              const kv = new Constraint(`${this.constructor.name}[${idx}].visible`, () => {
                const f = this.from[idx];
                const g = this.to[idx];
                if (f === void 0 || g === void 0)
                  return true;
                return this.t < 1 ? f.vis : g.vis;
              }, (v) => setBound(child, "visible", v));
              own(child, "visible", kv);
              owned.push({ child, slot: "visible", k: kv });
            });
          } catch (e) {
            for (const o of owned) {
              release(o.child, o.slot, o.k);
              o.k.dispose();
            }
            throw e;
          }
          this.retarget(false);
          for (const o of owned)
            o.k.run();
          return detach;
        }
        /** Snap or slide the laid children to the CURRENT target layout. `from` is
         *  the children's live boxes (so a re-trigger mid-slide glides from wherever
         *  they are); `to` is place(). animate ? ease t:0→1 : jam t←1. The one
         *  imperative entry — the app calls it after setting the layout's state on a
         *  geometry-affecting change the constraints can't infer (mode, focus). */
        retarget(animate) {
          const kids = this.laid();
          this.from = kids.map((c) => ({ x: c.x, y: c.y, w: c.width, h: c.height, vis: c.visible }));
          this.to = this.place();
          if (animate && this.tween !== null) {
            this.t = 0;
            this.tween.duration = this.duration;
            this.tween.stop();
            this.tween.start();
          } else {
            this.t = 1;
          }
        }
      };
      defineAttributes(TweenLayout, {
        t: { def: 1 },
        from: { def: [] },
        to: { def: [] },
        duration: { def: 500 }
      });
    }
  });

  // runtime/dist/spring.js
  function numOf2(target, attr) {
    const v = target[attr];
    return typeof v === "number" ? v : 0;
  }
  function arriveSubtree(root) {
    const stack = [root];
    while (stack.length > 0) {
      const n = stack.pop();
      if (n instanceof Spring) {
        n.arrive();
        continue;
      }
      const kids = n?.children;
      if (kids !== void 0)
        for (const k of kids)
          stack.push(k);
    }
  }
  var drive, Spring;
  var init_spring = __esm({
    "runtime/dist/spring.js"() {
      "use strict";
      init_animator();
      init_animate();
      init_attributes();
      drive = (target, attr, v) => {
        asRuntimeWrite(() => {
          target[attr] = v;
        });
      };
      Spring = class extends Animator {
        springRunning = false;
        /** Armed by `arrive()`: consume the next target outright (see arrive). */
        arriving = false;
        springLastNow = null;
        vel = 0;
        primed = false;
        /** Called by the `to` pusher on every retarget: (re)enroll on the clock.
         *  A no-op while already live, so a moving target does not pile up tickers. */
        wake() {
          if (this.arriving) {
            this.arriving = false;
            this.stop();
            this.vel = 0;
            this.primed = true;
            const at = this.resolveTarget();
            if (at !== null && this.attribute !== "")
              drive(at, this.attribute, this.to);
            return;
          }
          if (this.springRunning)
            return;
          if (this.attribute === "" || this.resolveTarget() === null)
            return;
          this.springRunning = true;
          this.springLastNow = sharedClock.now();
          sharedClock.add(this);
        }
        isRunning() {
          return this.springRunning;
        }
        /** A Spring is not start()-triggered — it wakes on `to`. Keep start()/stop()
         *  as simple clock enroll/withdraw so the Animatable contract still holds
         *  (e.g. an author who does call spring.stop() to pin it). */
        start() {
          this.wake();
        }
        stop() {
          if (!this.springRunning)
            return;
          this.springRunning = false;
          sharedClock.remove(this);
        }
        /** One integration frame (semi-implicit Euler). The SLOT is the position
         *  state — read live each frame — so the spring resumes from wherever the
         *  value actually is, and a mid-flight retarget just curves toward the new
         *  `to`. Returns false (drops off the clock) once at rest. */
        /** Consume the DECLARATION SNAP at init (instantiate's animator walk): the
         *  first computed target is a boot fact, so the slot takes it outright — a
         *  Switch declared checked renders checked; it does not slide there.
         *  Physics governs every change AFTER this. Priming must happen HERE, not
         *  lazily at the first wake: a spring whose boot target equals the slot's
         *  default never wakes at boot (the equality gate swallows the push), and
         *  a lazy primer would then swallow the first REAL change instead — the
         *  calendar's month→year zoom snapping while year→month animated. */
        prime() {
          if (this.primed)
            return;
          this.primed = true;
          const t = this.resolveTarget();
          if (t !== null && this.attribute !== "")
            drive(t, this.attribute, this.to);
          this.vel = 0;
        }
        /** ARRIVAL (recycling / materialization). A recycled or freshly built
         *  instance is presenting a record it was not presenting before, so the
         *  geometry it lands on is a FACT ABOUT THAT RECORD, not a change this
         *  row lived through — it must appear, not animate.
         *
         *  This arms rather than snaps because the new target is not known yet:
         *  the cursor write that will produce it invalidates lazily, so reading
         *  `to` here would return the DEPARTED record's value and pin it. The
         *  next target this spring receives is therefore taken outright; the
         *  arming clears itself on the following microtask, so a genuine change
         *  a moment later still animates. When the two records agree the slot is
         *  already correct and no push ever comes — which is also right.
         *
         *  (A windowed row whose height animates makes this load-bearing: an
         *  expanded row scrolled out and back must return at its open height,
         *  and the measured ladder must never see it slide.) */
        arrive() {
          this.arriving = true;
          const raf = globalThis.requestAnimationFrame;
          if (typeof raf === "function")
            raf(() => {
              this.arriving = false;
            });
          else
            setTimeout(() => {
              this.arriving = false;
            }, 0);
        }
        /** Shift the anchor across a scheduler handover (Ticker.rebase); the
         *  Animator half never runs for a spring, but super keeps its own anchor
         *  coherent if it ever does. */
        rebase(delta) {
          super.rebase(delta);
          if (this.springLastNow !== null)
            this.springLastNow += delta;
        }
        tick(now) {
          if (!this.springRunning)
            return false;
          if (!this.primed) {
            this.prime();
            this.springRunning = false;
            sharedClock.remove(this);
            return false;
          }
          if (this.springLastNow === null) {
            this.springLastNow = now;
            return true;
          }
          const dt = Math.min(Math.max((now - this.springLastNow) / 1e3, 0), 0.064);
          this.springLastNow = now;
          const target = this.resolveTarget();
          const attr = this.attribute;
          if (target === null || attr === "") {
            this.springRunning = false;
            return false;
          }
          const to = this.to;
          let pos = numOf2(target, attr);
          if (!Number.isFinite(pos))
            pos = to;
          const m = this.mass > 0 ? this.mass : 1;
          const H2 = 1 / 120;
          for (let t = dt; t > 0; t -= H2) {
            const h = t < H2 ? t : H2;
            const accel = (this.stiffness * (to - pos) - this.damping * this.vel) / m;
            this.vel += accel * h;
            pos += this.vel * h;
          }
          if (!Number.isFinite(pos)) {
            pos = to;
            this.vel = 0;
          }
          const eps = this.epsilon;
          if (Math.abs(to - pos) < eps && Math.abs(this.vel) < eps * 60) {
            drive(target, attr, to);
            this.vel = 0;
            this.springRunning = false;
            sharedClock.remove(this);
            return false;
          }
          drive(target, attr, pos);
          return true;
        }
      };
      defineAttributes(Spring, {
        to: { def: 0, push: (s) => s.wake() },
        stiffness: { def: 170 },
        damping: { def: 22 },
        mass: { def: 1 },
        epsilon: { def: 0.1 }
      });
    }
  });

  // runtime/dist/state.js
  function stacksFor(view) {
    const v = view;
    return v[STACKS] ??= /* @__PURE__ */ new Map();
  }
  function driveTop(view, slot, s) {
    const top = s.entries[s.entries.length - 1];
    s.topK = top.make(view);
    disown(view, slot);
    own(view, slot, s.topK);
    s.topK.run();
  }
  function pushOverride(view, slot, priority, make) {
    const map = stacksFor(view);
    let s = map.get(slot);
    if (s === void 0) {
      const owner = ownerOf(view, slot);
      owner?.suspend();
      s = {
        baseOwner: owner,
        baseValue: owner === null ? view[slot] : void 0,
        entries: [],
        topK: null
      };
      map.set(slot, s);
    }
    let i = s.entries.length;
    while (i > 0 && s.entries[i - 1].priority > priority)
      i--;
    s.entries.splice(i, 0, { priority, make });
    if (i === s.entries.length - 1) {
      s.topK?.dispose();
      driveTop(view, slot, s);
    }
  }
  function popOverride(view, slot, priority) {
    const map = stacksFor(view);
    const s = map.get(slot);
    if (s === void 0)
      return;
    const i = s.entries.findIndex((e) => e.priority === priority);
    if (i < 0)
      return;
    const wasTop = i === s.entries.length - 1;
    s.entries.splice(i, 1);
    if (!wasTop)
      return;
    s.topK?.dispose();
    s.topK = null;
    if (s.entries.length > 0) {
      driveTop(view, slot, s);
      return;
    }
    map.delete(slot);
    disown(view, slot);
    if (s.baseOwner !== null) {
      own(view, slot, s.baseOwner);
      s.baseOwner.resume();
    } else {
      setBound(view, slot, s.baseValue);
    }
  }
  function surfaceAfter(target, v) {
    const kids = target.children;
    for (let i = kids.indexOf(v) + 1; i < kids.length; i++) {
      const c = kids[i];
      if (c instanceof View && c.surface !== null)
        return c.surface;
    }
    return null;
  }
  var STACKS, State;
  var init_state = __esm({
    "runtime/dist/state.js"() {
      "use strict";
      init_node();
      init_view();
      init_reactive();
      init_attributes();
      init_errors();
      STACKS = /* @__PURE__ */ Symbol("overrideStacks");
      State = class extends Node2 {
        // Captured from the body at construct.
        /** Value overrides on the enclosing view. */
        overrides = [];
        /** Conditional child templates, the build-time materializer, and the
         *  classroot their bodies' members bind to (the state's use site). */
        childTemplates = [];
        materialize = null;
        childClassroot = null;
        // Runtime state.
        /** Declaration-order precedence, cached at init before any child inserts. */
        priority = 0;
        /** Whether the effects are currently installed (idempotency guard). */
        installed = false;
        /** The live child views this state instantiated, for teardown. */
        builtChildren = [];
        /** Cache declaration-order precedence the moment the state is linked under its
         *  view (appendChildren, pass one) — before any gate fires in pass two and
         *  before sibling states insert children, so the index is pure source order
         *  (states.md §3: later-declared wins). */
        onLinked() {
          const parent = this.parent;
          if (parent !== null)
            this.priority = parent.children.indexOf(this);
        }
        /** Apply the initial value once the tree is linked (initTree). A gated state
         *  has usually already synced from its gate's first run in pass two — this is
         *  idempotent — but a literal `applied = true` (no gate) applies here. */
        init() {
          this.sync(this.applied);
        }
        apply() {
          this.drive(true);
        }
        remove() {
          this.drive(false);
        }
        toggle() {
          this.drive(!this.applied);
        }
        /** The verbs' one write path: reject when a declarative gate owns `applied`
         *  (states.md §2 — gate XOR verbs), else drive through setBound (→ push →
         *  sync), the sanctioned path, not a raw assignment. */
        drive(v) {
          if (ownerOf(this, "applied") !== null) {
            throw new DeclareError(`${this.constructor.name}.applied is bound by a constraint \u2014 a state is gated by { } OR driven by the verbs, not both; change what the gate reads instead of calling ${v ? "apply" : "remove"}()`);
          }
          setBound(this, "applied", v);
        }
        /** Install or remove this state's effects. Idempotent, and a no-op until the
         *  enclosing view is linked (the initial sync runs from init()). */
        sync(v) {
          const target = this.parent;
          if (!(target instanceof View))
            return;
          if (v === this.installed)
            return;
          this.installed = v;
          if (v) {
            for (const o of this.overrides)
              pushOverride(target, o.slot, this.priority, o.make);
            this.buildChildren(target);
            this.fire("onApply");
          } else {
            this.fire("onRemove");
            this.teardownChildren(target);
            for (const o of this.overrides)
              popOverride(target, o.slot, this.priority);
          }
        }
        /** Instantiate the conditional subtree into the target at the state's slot
         *  (just after the state node), attach live surfaces, fire init — the same
         *  construct/finish path replicate.ts runs per record. */
        buildChildren(target) {
          if (this.materialize === null || this.childTemplates.length === 0)
            return;
          let index = target.children.indexOf(this) + 1;
          const finishes = [];
          for (const tmpl of this.childTemplates) {
            const { view, finish } = this.materialize(tmpl, this.childClassroot ?? target);
            target.insertChild(view, index++);
            if (tmpl.name !== null && !(tmpl.name in target)) {
              target[tmpl.name] = view;
            }
            this.builtChildren.push(view);
            finishes.push(finish);
          }
          if (target.backend !== null && target.surface !== null) {
            for (const v of this.builtChildren) {
              const before = surfaceAfter(target, v);
              v.attach(target.backend, target.surface, before);
            }
          }
          for (const f of finishes)
            f();
        }
        /** Retire the subtree: discard each built view's standing machinery and
         *  surface, unlink it, and drop any name it bound. */
        teardownChildren(target) {
          for (const v of this.builtChildren) {
            v.discard();
            target.removeChild(v);
          }
          for (const tmpl of this.childTemplates) {
            if (tmpl.name !== null && target[tmpl.name] !== void 0) {
              delete target[tmpl.name];
            }
          }
          this.builtChildren = [];
        }
        /** Retire with the host view (View.discard reaches every child now): dispose
         *  our `applied` gate binding — else it lingers, subscribed to whatever it
         *  gated on (`applied = { app.openSection … }`), keeping this state and its
         *  view alive. The state's EFFECTS (override constraints owned by the target,
         *  built children spliced into the target) are torn down by the target view's
         *  own discard, so there is nothing else to undo here. */
        discard() {
          disposeBindings(this);
          super.discard();
        }
        /** Fire a carried handler if installed (onApply / onRemove) — a plain Node
         *  dispatch, like the Animator's on* firing. */
        fire(handler) {
          const h = this[handler];
          if (typeof h === "function")
            h.call(this);
        }
      };
      defineAttributes(State, {
        applied: { def: false, push: (self, v) => self.sync(v) }
      });
    }
  });

  // runtime/dist/data-schema.js
  function typeOk(type, v) {
    if (type === "any")
      return v !== void 0;
    return typeof v === type;
  }
  function describe(v) {
    if (v === null)
      return "null";
    if (Array.isArray(v))
      return "an array";
    return typeof v === "object" ? "an object" : typeof v;
  }
  function validateShape(value, fields, at = []) {
    if (!isObj2(value)) {
      return `${showPtr(at) || "/"} \u2014 expected an object with ${fields.map((f) => f.name).join(", ")}, got ${describe(value)}`;
    }
    for (const f of fields) {
      const v = value[f.name];
      const here = [...at, f.name];
      if (v === void 0 || v === null) {
        if (f.optional)
          continue;
        return `${showPtr(here)} is ${v === null ? "null" : "missing"} \u2014 the schema requires ${f.array ? "an array" : f.type ?? "a structure"} (mark it '${f.name}?' if it may be absent)`;
      }
      if (f.array) {
        if (!Array.isArray(v)) {
          return `${showPtr(here)} \u2014 the schema declares '${f.name}[]' (an array), got ${describe(v)}`;
        }
        for (let i = 0; i < v.length; i++) {
          const el = v[i];
          if (f.fields !== void 0) {
            const err2 = validateShape(el, f.fields, [...here, i]);
            if (err2 !== null)
              return err2;
          } else if (!typeOk(f.type, el)) {
            return `${showPtr([...here, i])} \u2014 expected ${f.type}, got ${describe(el)}`;
          }
        }
        continue;
      }
      if (f.fields !== void 0) {
        const err2 = validateShape(v, f.fields, here);
        if (err2 !== null)
          return err2;
        continue;
      }
      if (!typeOk(f.type, v)) {
        return `${showPtr(here)} \u2014 expected ${f.type}, got ${describe(v)}`;
      }
    }
    return null;
  }
  var isObj2, showPtr;
  var init_data_schema = __esm({
    "runtime/dist/data-schema.js"() {
      "use strict";
      isObj2 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
      showPtr = (segs) => "/" + segs.map((t) => String(t).replace(/~/g, "~0").replace(/\//g, "~1")).join("/");
    }
  });

  // runtime/dist/data.js
  function cellAt(container, key) {
    let cells = CELLS.get(container);
    if (cells === void 0)
      CELLS.set(container, cells = /* @__PURE__ */ new Map());
    let cell = cells.get(key);
    if (cell === void 0)
      cells.set(key, cell = new Cell());
    return cell;
  }
  function wakeTree(v) {
    if (!isContainer(v))
      return;
    wakeAll(v);
    for (const k of Object.keys(v))
      wakeTree(v[k]);
  }
  function tagTree(data, v, path) {
    if (!isContainer(v))
      return;
    TAGS.set(v, { data, path });
    for (const k of Object.keys(v))
      tagTree(data, v[k], [...path, k]);
  }
  function parsePointer(p) {
    const out = [];
    for (const raw of p.slice(1).split("/")) {
      const bad = raw.match(/~(?![01])/);
      if (bad !== null) {
        throw new DeclareError(`'${p}' is not an RFC 6901 pointer \u2014 '~' escapes only as ~0 ('~') or ~1 ('/')`);
      }
      out.push(raw.replace(/~1/g, "/").replace(/~0/g, "~"));
    }
    return out;
  }
  function toSegs(path) {
    if (typeof path !== "string")
      return path.map(String);
    if (path.startsWith("/"))
      return parsePointer(path);
    if (path === "")
      return [];
    throw new DeclareError(`'${path}' \u2014 paths are segments (["${path.split(".").join('", "')}"]) or an RFC 6901 pointer ("/${path.split(".").join("/")}"); the dot-string form retired with Pointer writes (data-paths.md \xA711)`);
  }
  function parseProblem(raw) {
    if (raw === "")
      return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  function provideTransport(fn) {
    const prev = transport;
    transport = fn;
    return prev;
  }
  function toCursor(v, context) {
    if (v === null || v === void 0)
      return null;
    if (!isContainer(v)) {
      throw new DeclareError(`${context}: a datapath is a place in a dataset \u2014 got ${typeof v} (point at an object or array; read leaf fields with :path)`);
    }
    const tag = TAGS.get(v);
    if (tag === void 0) {
      throw new DeclareError(`${context}: this value belongs to no Dataset/DataSource \u2014 a cursor can only point into declared data`);
    }
    if (resolveTracked(tag.data, tag.path) !== v) {
      const healed = locateByIdentity(tag.data.value, v, []);
      if (healed === null) {
        throw new DeclareError(`${context}: this value is no longer anywhere in its dataset`);
      }
      tag.path = healed;
      resolveTracked(tag.data, tag.path);
    }
    return tag.data.cursorAt(tag.path);
  }
  function resolveTracked(data, path) {
    let cur = data.value;
    for (const seg of path) {
      if (!isContainer(cur))
        return void 0;
      if (isTracking())
        cellAt(cur, seg).track();
      cur = getOwn(cur, seg);
    }
    return cur;
  }
  function locateByIdentity(cur, target, path) {
    if (cur === target)
      return path;
    if (!isContainer(cur))
      return null;
    for (const k of Object.keys(cur)) {
      const found = locateByIdentity(getOwn(cur, k), target, [...path, k]);
      if (found !== null)
        return found;
    }
    return null;
  }
  function coerceData(type, v, def) {
    if (v === null || v === void 0)
      return def;
    switch (type.kind) {
      case "string":
        return typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : def;
      case "number":
      case "length":
        return typeof v === "number" ? v : def;
      case "boolean":
        return typeof v === "boolean" ? v : def;
      case "color":
        return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 16777215 ? v : def;
      case "fill":
        return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 16777215 ? v : def;
      case "shape":
        return typeof v === "string" ? v : def;
      case "dataschema":
        return def;
      // a shape is declaration surface, never a data read
      case "enum":
        return typeof v === "string" && type.tokens.includes(v) ? v : def;
      // the records door: a data-borne array/record binds as itself
      case "array":
        return Array.isArray(v) ? v : def;
      case "object":
        return typeof v === "object" ? v : def;
      case "view":
        return def;
      // a View reference never arrives from data
      case "cursor":
      case "component":
      case "fn":
      case "record":
      case "stroke":
      case "shadow":
      case "backdrop":
      case "motion":
      case "styles":
      case "stylesheet":
      case "font":
      case "slotref":
        return def;
    }
  }
  var CELLS, TAGS, isContainer, wake, wakeAll, getOwn, showPath, Dataset, transport, DataSource;
  var init_data = __esm({
    "runtime/dist/data.js"() {
      "use strict";
      init_node();
      init_reactive();
      init_errors();
      init_attributes();
      init_data_schema();
      CELLS = /* @__PURE__ */ new WeakMap();
      TAGS = /* @__PURE__ */ new WeakMap();
      isContainer = (v) => typeof v === "object" && v !== null;
      wake = (container, key) => {
        CELLS.get(container)?.get(key)?.changed();
      };
      wakeAll = (container) => {
        const cells = CELLS.get(container);
        if (cells !== void 0)
          for (const c of cells.values())
            c.changed();
      };
      getOwn = (container, key) => Object.hasOwn(container, key) ? container[key] : void 0;
      showPath = (segs) => "/" + segs.map((t) => t.replace(/~/g, "~0").replace(/\//g, "~1")).join("/");
      Dataset = class extends Node2 {
        cursors = /* @__PURE__ */ new Map();
        /** The interned cursor for `path` — one object per distinct place, so a
         *  re-derived cursor is `===` the old one and the equality gate holds.
         *  The intern key joins on NUL, not "." — a key containing a dot must not
         *  collide with the path that spells it as two segments. */
        cursorAt(path) {
          const key = path.join("\0");
          let c = this.cursors.get(key);
          if (c === void 0)
            this.cursors.set(key, c = { data: this, path: [...path] });
          return c;
        }
        /** Tracked read of the region at `path` (root-relative). Registers exactly
         *  one region cell — the deepest slot the walk reaches (see the header) —
         *  plus the `value` attribute read the first line makes. `undefined` means
         *  unresolved (a missing region); consumers surface it as null. Takes the
         *  path currency: segments, or an RFC 6901 pointer string. */
        read(path) {
          let cur = this.value;
          let container = null;
          let key = "";
          for (const seg of toSegs(path)) {
            if (!isContainer(cur)) {
              cur = void 0;
              break;
            }
            container = cur;
            key = seg;
            cur = getOwn(cur, seg);
          }
          if (isTracking() && container !== null)
            cellAt(container, key).track();
          return cur;
        }
        // ── The mutation API — THE structural-mutation authoring surface (D7,
        //    ratified 2026-07-30 with data-paths.md §11: handler-called dataset
        //    methods plus `<->` for leaf edits close language §13's open design).
        //    Paths are the currency above: segments (documented) or an RFC 6901
        //    pointer (interop); leaf writes address the slot, structural verbs
        //    address the ARRAY and take indices as arguments (the §11.2 ruling —
        //    a structural edit is an operation on the array, which is literally
        //    the wake model below). ────────────────────────────────────────────
        /** Set the field at `path`. The path's containers must exist (a pointed
         *  error names the first missing step); the final field may be new.
         *  Against an array, the final token `-` (RFC 6901's after-last) APPENDS —
         *  `set("/rows/-", v)` / `set(["rows", "-"], v)`; against an object, "-"
         *  is just the key "-". Equality-gated: writing the value already there
         *  wakes nothing. */
        set(path, v) {
          const segs = this.segs(path);
          const { chain, container, key: at } = this.locate(segs);
          const key = at === "-" && Array.isArray(container) ? String(container.length) : at;
          if (key !== at) {
            segs[segs.length - 1] = key;
            chain[chain.length - 1] = [container, key];
          }
          const old = getOwn(container, key);
          if (old === v)
            return;
          container[key] = v;
          tagTree(this, v, segs);
          this.wakeChain(chain);
          if (key !== at)
            wakeAll(container);
          wakeTree(old);
        }
        /** Insert `v` at `index` of the array at `path`. */
        insert(path, index, v) {
          const { arr, chain, segs } = this.array(path);
          arr.splice(index, 0, v);
          tagTree(this, v, [...segs, String(index)]);
          wakeAll(arr);
          this.wakeChain(chain);
        }
        /** Remove (and return) the element at `index` of the array at `path`. */
        removeAt(path, index) {
          const { arr, chain } = this.array(path);
          const [removed] = arr.splice(index, 1);
          wakeAll(arr);
          this.wakeChain(chain);
          wakeTree(removed);
          return removed;
        }
        /** Move the element at `from` to `to` within the array at `path` — a pure
         *  reorder: item regions are identity-anchored, so only order readers (the
         *  array's own cells, the ancestors) wake; no item REGION cell stirs (the
         *  replicator's re-pointed cursors are the only item-side wake, and their
         *  equal re-reads die at the equality gate — replicate.ts). */
        move(path, from, to) {
          if (from === to)
            return;
          const { arr, chain } = this.array(path);
          const [item] = arr.splice(from, 1);
          arr.splice(to, 0, item);
          wakeAll(arr);
          this.wakeChain(chain);
        }
        segs(path) {
          const segs = toSegs(path);
          if (segs.length === 0) {
            throw new DeclareError(`an empty path addresses the whole dataset \u2014 assign .value to replace it`);
          }
          return segs;
        }
        /** Walk `segs` from the root, collecting the (container, key) step chain —
         *  which is exactly the ancestor set a write must wake. */
        locate(segs) {
          let cur = this.value;
          const chain = [];
          for (let i = 0; ; i++) {
            if (!isContainer(cur)) {
              const at = i === 0 ? "the dataset has no value" : `'${showPath(segs.slice(0, i))}' is ${cur === void 0 ? "missing" : "not a container"}`;
              throw new DeclareError(`'${showPath(segs)}' addresses nothing \u2014 ${at}`);
            }
            chain.push([cur, segs[i]]);
            if (i === segs.length - 1)
              return { chain, container: cur, key: segs[i] };
            cur = getOwn(cur, segs[i]);
          }
        }
        array(path) {
          const segs = this.segs(path);
          const { chain, container, key } = this.locate(segs);
          const arr = getOwn(container, key);
          if (!Array.isArray(arr)) {
            throw new DeclareError(`'${showPath(segs)}' is not an array \u2014 structural edits need one`);
          }
          return { arr, chain, segs };
        }
        wakeChain(chain) {
          for (const [container, key] of chain)
            wake(container, key);
        }
      };
      defineAttributes(Dataset, {
        // Adopting a value tags its containers with their locations, which is what
        // lets `datapath = { … }` expressions turn dereferenced values back into
        // places. The write itself is ordinary reactive machinery: every data read
        // tracked this slot, so replacement wakes them all.
        value: { def: null, push: (d, v) => tagTree(d, v, []) },
        schema: { def: null },
        // A derived Dataset's `contents = { … }` binds here; its push mirrors the
        // computed value into `value` through value's own reactive setter — so a
        // recompute tags the new tree and wakes every `:path` reader and replicator,
        // exactly as a wholesale `.value` replacement does. `contents` itself is
        // never read back (nothing tracks it); it is the author-facing write slot.
        contents: { def: null, push: (d, v) => {
          d.value = v;
        } }
      });
      transport = (url, init) => globalThis.fetch(url, init);
      DataSource = class extends Dataset {
        // Tracked reads of `status`, so a constraint on `.loaded` wakes exactly
        // when the lifecycle moves (all four share the one status cell — they are
        // four views of one fact and can never disagree).
        get idle() {
          return this.status === "idle";
        }
        get loading() {
          return this.status === "loading";
        }
        get loaded() {
          return this.status === "loaded";
        }
        get failed() {
          return this.status === "failed";
        }
        autoUrl = "";
        maybeAuto() {
          if (!this.auto)
            return;
          if (this.url === "") {
            this.autoUrl = "";
            return;
          }
          if (this.url === this.autoUrl)
            return;
          this.autoUrl = this.url;
          void this.fetch();
        }
        /** Discards a superseded request: only the latest fetch/clear may land
         *  (the Image loader's sequence discipline). */
        seq = 0;
        /** The fetch init from `method`/`body`. A GET (the default) sends no body — a
         *  bare url, unchanged. A non-GET carries `body`: an object/array is
         *  JSON-encoded with a JSON `Content-Type`; a string is sent verbatim. */
        requestInit() {
          const method = (this.method || "GET").toUpperCase();
          if (method === "GET")
            return void 0;
          const init = { method };
          const body = this.body;
          if (body != null) {
            if (typeof body === "string")
              init.body = body;
            else {
              init.body = JSON.stringify(body);
              init.headers = { "Content-Type": "application/json" };
            }
          }
          return init;
        }
        /** Fetch `url` over HTTP. Explicit by design — the weather app's entry screen
         *  decides when (`doEnterDown() { weatherData.fetch() }`); `auto = true` is the
         *  opt-in for reactive addresses (above). A non-GET `method` sends `body`. */
        async fetch() {
          const seq = ++this.seq;
          settle();
          const url = this.url;
          setBound(this, "status", "loading");
          setBound(this, "error", null);
          setBound(this, "statusCode", 0);
          setBound(this, "errorBody", null);
          try {
            const res = await transport(url, this.requestInit());
            if (seq === this.seq)
              setBound(this, "statusCode", res.status);
            if (!res.ok) {
              let raw = "";
              try {
                raw = typeof res.text === "function" ? await res.text() : "";
              } catch {
                raw = "";
              }
              if (seq === this.seq)
                setBound(this, "errorBody", parseProblem(raw));
              throw new Error(`HTTP ${res.status} for ${url}`);
            }
            const value = this.format === "text" ? await res.text() : await res.json();
            if (seq !== this.seq)
              return;
            if (this.schema !== null && this.format === "json") {
              const err2 = validateShape(value, this.schema);
              if (err2 !== null)
                throw new Error(`the response does not match the schema \u2014 ${err2}`);
            }
            setBound(this, "value", value);
            setBound(this, "status", "loaded");
            const h = this["onLoad"];
            if (typeof h === "function")
              h.call(this);
          } catch (e) {
            if (seq !== this.seq)
              return;
            setBound(this, "error", e instanceof Error ? e.message : String(e));
            setBound(this, "status", "failed");
          }
        }
        /** Reset to idle (the doc's "back to the entry screen — declaratively"). */
        clear() {
          this.seq++;
          setBound(this, "value", null);
          setBound(this, "error", null);
          setBound(this, "statusCode", 0);
          setBound(this, "errorBody", null);
          setBound(this, "status", "idle");
        }
      };
      defineAttributes(DataSource, {
        // both pushes route through maybeAuto, so `auto = true` + a url that lands
        // later (or the reverse order) fetches exactly once per distinct address
        url: { def: "", push: (d, _v) => d.maybeAuto() },
        auto: { def: false, push: (d, _v) => d.maybeAuto() },
        format: { def: "json" },
        method: { def: "GET" },
        body: { def: null },
        status: { def: "idle" },
        error: { def: null },
        // 0 = no reply yet (or none ever arrived) — distinct from every real HTTP
        // code, so a constraint can tell "not asked" from "asked and refused".
        statusCode: { def: 0 },
        errorBody: { def: null }
      });
    }
  });

  // runtime/dist/bind.js
  function bindConstraint(view, name, src, pos, classroot, deps) {
    const c = compileExpr(src);
    if ("error" in c) {
      throw new DeclareError(`${view.constructor.name}.${name} = { \u2026 } ${c.error}`, pos);
    }
    const fn = c.fn;
    const k = new Constraint(`${view.constructor.name}.${name}`, () => fn.call(view, view.parent, classroot), (v) => setBound(view, name, v));
    k.source = src;
    if (pos != null && typeof pos.line === "number") {
      k.sourcePos = { line: pos.line, col: pos.col ?? 0 };
    }
    own(view, name, k);
    const regionReactive = deps !== void 0 && deps.some((rp) => rp.startsWith(":") || rp.includes(".read("));
    if (deps !== void 0 && deps.length > 0 && !regionReactive) {
      const probes = deps.map((rp) => compileExpr(rp)).filter((r) => "fn" in r).map((r) => r.fn);
      k.wire(() => {
        for (const p of probes) {
          try {
            p.call(view, view.parent, classroot);
          } catch {
          }
        }
      }, deps);
    } else {
      k.run();
    }
  }
  function bindData(view, name, path, type, plan) {
    const UNRESOLVED = {};
    const read = plan ?? path;
    const k = new Constraint(`${view.constructor.name}.${name} = :${path}`, () => {
      const v = coerceData(type, view.$data(read), UNRESOLVED);
      return v === UNRESOLVED ? followedValue(view, name) : v;
    }, (v) => setBound(view, name, v));
    own(view, name, k);
    k.run();
  }
  function bindDatapath(view, path) {
    const segs = typeof path === "string" ? splitPath(path) : path;
    const k = new Constraint(`${view.constructor.name}.datapath = :${typeof path === "string" ? path : path.join(".")}`, () => {
      const base2 = inheritedCursor(view.parent);
      return base2 === null ? null : base2.data.cursorAt([...base2.path, ...segs]);
    }, (v) => setBound(view, "datapath", v));
    own(view, "datapath", k);
    k.run();
  }
  function bindCursor(view, src, pos, classroot) {
    const c = compileExpr(src);
    if ("error" in c) {
      throw new DeclareError(`${view.constructor.name}.datapath = { \u2026 } ${c.error}`, pos);
    }
    const fn = c.fn;
    const label = `${view.constructor.name}.datapath`;
    const k = new Constraint(label, () => toCursor(fn.call(view, view.parent, classroot), label), (v) => setBound(view, "datapath", v));
    own(view, "datapath", k);
    k.run();
  }
  function bindPercent(view, name, percent, pos) {
    const cls = view.constructor.name;
    const axis = Object.hasOwn(PERCENT_AXIS, name) ? PERCENT_AXIS[name] : null;
    if (axis === null) {
      throw new DeclareError(`${cls}.${name} = ${percent}%: no axis to resolve a percent against`, pos);
    }
    if (!(view.parent instanceof View)) {
      throw new DeclareError(`${cls}.${name} = ${percent}%: the root has no parent for a percent to resolve against`, pos);
    }
    const k = new Constraint(`${cls}.${name} = ${percent}%`, () => view.parent[axis] * (percent / 100), (v) => setBound(view, name, v));
    markPercent(k);
    own(view, name, k);
    k.run();
  }
  function bindAlign(view, name, align, pos) {
    const cls = view.constructor.name;
    const size = name === "x" ? "width" : "height";
    if (!(view.parent instanceof View)) {
      throw new DeclareError(`${cls}.${name} = ${align}: the root has no parent to align against`, pos);
    }
    const k = new Constraint(`${cls}.${name} = ${align}`, () => {
      const P = view.parent[size];
      if (align === "end")
        return P - view[size];
      const band = view.alignBand(name);
      return (P - band.size) / 2 - band.lead;
    }, (v) => setBound(view, name, v));
    markPercent(k);
    own(view, name, k);
    k.run();
  }
  var PERCENT_AXIS;
  var init_bind = __esm({
    "runtime/dist/bind.js"() {
      "use strict";
      init_errors();
      init_reactive();
      init_attributes();
      init_expr();
      init_view();
      init_data();
      init_datapath();
      PERCENT_AXIS = {
        x: "width",
        y: "height",
        width: "width",
        height: "height"
      };
    }
  });

  // runtime/dist/editor.js
  function sessionOf(view, name) {
    return SESSIONS.get(view)?.get(name);
  }
  function isTwoWay(view, name) {
    return sessionOf(view, name) !== void 0;
  }
  function committed(view, s) {
    return coerceData(s.type, view.$data(s.path()), "");
  }
  function register(view, name, path, type) {
    let map = SESSIONS.get(view);
    if (map === void 0)
      SESSIONS.set(view, map = /* @__PURE__ */ new Map());
    map.set(name, { path, type });
    const reseed = new Constraint(`${view.constructor.name}.${name} <->`, () => coerceData(type, view.$data(path()), ""), (v) => {
      setBound(view, name, v);
      refresh(view, name);
    });
    onDiscard(view, () => reseed.dispose());
    reseed.run();
    refresh(view, name);
  }
  function bindTwoWay(view, name, path, type) {
    register(view, name, () => path, type);
  }
  function bindTwoWayDynamic(view, name, src, pos, classroot, type) {
    const c = compileExpr(src);
    if ("error" in c)
      throw new DeclareError(`${view.constructor.name}.${name} <-> { \u2026 } ${c.error}`, pos);
    const fn = c.fn;
    register(view, name, () => String(fn.call(view, view.parent, classroot)), type);
  }
  function runValidate(view, v) {
    const fn = view.validate;
    if (typeof fn !== "function")
      return null;
    const r = fn.call(view, v);
    if (r === true || r == null || r === "")
      return null;
    if (r === false)
      return "invalid";
    return String(r);
  }
  function publish(view, name, v) {
    if (name in view)
      setBound(view, name, v);
  }
  function refresh(view, name) {
    const s = sessionOf(view, name);
    if (s === void 0)
      return;
    const draft = view[name];
    const err2 = runValidate(view, draft);
    publish(view, "error", err2 ?? "");
    publish(view, "valid", err2 === null);
    publish(view, "dirty", draft !== committed(view, s));
  }
  function edited(view, name, commitOn) {
    refresh(view, name);
    if (commitOn === "input")
      commitDraft(view, name);
  }
  function commitDraft(view, name) {
    const s = sessionOf(view, name);
    if (s === void 0)
      return;
    const draft = view[name];
    if (runValidate(view, draft) !== null)
      return;
    view.$setData(s.path(), draft);
  }
  function revertDraft(view, name) {
    const s = sessionOf(view, name);
    if (s === void 0)
      return;
    setBound(view, name, committed(view, s));
    refresh(view, name);
  }
  var SESSIONS, Editor;
  var init_editor = __esm({
    "runtime/dist/editor.js"() {
      "use strict";
      init_reactive();
      init_view();
      init_attributes();
      init_data();
      init_expr();
      init_errors();
      SESSIONS = /* @__PURE__ */ new WeakMap();
      Editor = class extends View {
        /** @api Commit the current draft into the bound dataset field, if it
         *  validates — for a `commitOn = "manual"` field or a Save button. */
        commit() {
          commitDraft(this, this.draftSlot());
        }
        /** @api Discard edits — reset the field to the committed dataset value. */
        revert() {
          revertDraft(this, this.draftSlot());
        }
      };
      defineAttributes(Editor, {
        commitOn: { def: "input" },
        error: { def: "" },
        valid: { def: true },
        dirty: { def: false }
      });
    }
  });

  // runtime/dist/focus.js
  function sequence(root) {
    const out = [];
    const walk = (v) => {
      for (const m of tabOrderOf(v)) {
        if (!m.visible)
          continue;
        if (m.focusable || m.link !== "")
          out.push(m);
        if (m.focusTrap && m !== root)
          continue;
        walk(m);
      }
    };
    walk(root);
    return out;
  }
  function tabOrderOf(v) {
    const fn = v.tabOrder;
    const members = typeof fn === "function" ? fn.call(v) : v.tabDefault();
    return Array.isArray(members) ? members.filter((m) => m instanceof View) : [];
  }
  function rootOf(view) {
    let v = view;
    while (v.parent instanceof View)
      v = v.parent;
    return v;
  }
  function isInSubtree(node, ancestor) {
    for (let v = node; v !== null; v = v.parent instanceof View ? v.parent : null) {
      if (v === ancestor)
        return true;
    }
    return false;
  }
  function deliverKeys(keys, focus) {
    const perFocus = DELIVERING.get(keys) ?? /* @__PURE__ */ new WeakMap();
    DELIVERING.set(keys, perFocus);
    const existing = perFocus.get(focus);
    if (existing !== void 0)
      return existing;
    const offDown = keys.onKeyDown((e) => {
      if (e.code === "Tab") {
        if (e.shift)
          focus.prev();
        else
          focus.next();
        return;
      }
      const f = focus.getFocus();
      if (f !== null) {
        fireEvent(f, "keyDown", e);
        if (e.code === "Enter" && f.link !== "") {
          const app = f.root;
          app?.follow?.(f.link, f.replace);
        }
      }
    });
    const offUp = keys.onKeyUp((e) => {
      if (e.code === "Tab")
        return;
      const f = focus.getFocus();
      if (f !== null)
        fireEvent(f, "keyUp", e);
    });
    const off = () => {
      perFocus.delete(focus);
      offDown();
      offUp();
    };
    perFocus.set(focus, off);
    return off;
  }
  var FocusService, DELIVERING, Focus;
  var init_focus = __esm({
    "runtime/dist/focus.js"() {
      "use strict";
      init_view();
      init_reactive();
      init_interaction();
      FocusService = class {
        current = null;
        rootView = null;
        /** Whether the LAST focus change was keyboard-driven (Tab traversal). The
         *  focus-visible modality: a ring/indicator shows only for keyboard focus —
         *  a pointer press focuses silently (the click itself is the feedback).
         *  A REACTIVE fact: `byKeyboard()` is a tracked read, so a component's
         *  styling constraint (a Tab header's focus edge) re-derives when the
         *  modality flips — same slot, event handlers and constraints alike. */
        keyboard = false;
        keyboardCell = new Cell();
        setKeyboard(v) {
          if (this.keyboard === v)
            return;
          this.keyboard = v;
          this.keyboardCell.changed();
        }
        /** Subscribers to focus CHANGES (`Focus [ onFocusChange(v) { … } ]`) —
         *  called with the newly focused view (or null on blur) after the change
         *  settles. What the traveling focus indicator rides. */
        changeHandlers = /* @__PURE__ */ new Set();
        /** Subscribers to the focused control's LIVE GEOMETRY
         *  (`Focus [ onGeometry(g) { … } ]`). A standing runtime constraint follows
         *  the target: tracked reads
         *  of the parent chain's x/y and the control's focusShape() mean an
         *  arrow-keyed slider thumb, a reflowing layout, or a resized ancestor
         *  moves the resting ring WITH its control — no re-focus needed. */
        geometryHandlers = /* @__PURE__ */ new Set();
        follower = null;
        /** Reentrancy lock: a focus change fires onFocus/onBlur handlers that may
         *  call focus() again; remember the latest target and apply it after the
         *  current change settles (LZX's discipline). */
        changing = false;
        queued = false;
        queuedTarget = null;
        /** The tree root, for traversal when nothing is focused (set at attach). */
        setRoot(view) {
          this.rootView = view;
        }
        getFocus() {
          return this.current;
        }
        /** True when the current focus arrived by KEYBOARD (Tab/Shift-Tab) — the
         *  focus-visible modality gate an indicator reads: show for keyboard focus,
         *  stay hidden for pointer/programmatic focus. */
        byKeyboard() {
          this.keyboardCell.track();
          return this.keyboard;
        }
        /** Test/lifecycle reset. */
        reset() {
          this.current = null;
          this.rootView = null;
          this.changing = false;
          this.queued = false;
          this.follower?.dispose();
          this.follower = null;
        }
        /** Focus a view (null = blur). A non-focusable or invisible view is ignored
         *  (never becomes the focus). Fires onBlur on the old, onFocus on the new.
         *  This public entry is the POINTER/PROGRAMMATIC path — it clears the
         *  keyboard modality; Tab traversal (move) sets it. */
        focus(view) {
          this.setKeyboard(false);
          this.apply(view);
        }
        apply(view) {
          if (view !== null && !((view.focusable || view.link !== "") && view.visible))
            return;
          if (this.changing) {
            this.queued = true;
            this.queuedTarget = view;
            return;
          }
          if (view === this.current)
            return;
          this.changing = true;
          const old = this.current;
          this.current = view;
          if (old !== null) {
            old.focusChanged(false);
            fireEvent(old, "blur");
          }
          if (view !== null) {
            view.focusChanged(true);
            fireEvent(view, "focus");
          }
          this.changing = false;
          this.retargetFollower();
          for (const h of [...this.changeHandlers])
            h(this.current);
          if (this.queued) {
            this.queued = false;
            this.apply(this.queuedTarget);
          }
        }
        /** Subscribe to focus changes. Returns the unsubscribe thunk — the `<-`
         *  wiring's contract (sources.ts). */
        onFocusChange(fn) {
          this.changeHandlers.add(fn);
          return () => this.changeHandlers.delete(fn);
        }
        onGeometry(fn) {
          this.geometryHandlers.add(fn);
          return () => this.geometryHandlers.delete(fn);
        }
        /** (Re)install the follower for the current focus. The constraint's body
         *  reads TRACKED slots (ancestor x/y AND every scroll offset on the chain —
         *  the shared walk's reads; the focusShape's inputs), so any change,
         *  scrolling included, re-fires it; its push notifies the geometry
         *  subscribers. Geometry is the root's CONTENT space — the FocusRing is a
         *  child of the App and scrolls with the page like the control it rings, so
         *  the root's own scroll is added back onto the frame-space origin;
         *  an intermediate pane's scroll (which moves the control on screen while
         *  the ring's coordinate space stands still) stays subtracted. Hand-rolled
         *  x/y accumulation here was the scroll-blind focus ring (found 2026-07-31,
         *  the same missing term as the pointer walk's — ONE WALK, everywhere). */
        retargetFollower() {
          this.follower?.dispose();
          this.follower = null;
          const v = this.current;
          if (v === null || this.geometryHandlers.size === 0)
            return;
          const k = new Constraint("Focus.follower", () => {
            const o = rootFrameOrigin(v);
            const root = rootOf(v);
            const x = o.x + root.scrollX;
            const y = o.y + root.scrollY;
            let scroller = root;
            for (let n = v.parent; n instanceof View; n = n.parent) {
              if (n.scrolls !== "none") {
                scroller = n;
                break;
              }
            }
            let homeX = 0, homeY = 0;
            for (let n = v; n !== scroller; ) {
              homeX += n.x;
              homeY += n.y;
              if (!(n.parent instanceof View))
                break;
              n = n.parent;
            }
            if (scroller === root) {
              homeX = x;
              homeY = y;
            }
            const fsFn = v.focusShape;
            const fs = typeof fsFn === "function" ? fsFn.call(v) : null;
            return {
              x: x + (fs ? fs.x : 0),
              y: y + (fs ? fs.y : 0),
              w: fs ? fs.w : v.width,
              h: fs ? fs.h : v.height,
              rad: fs ? fs.rad : v.cornerRadius > 0 ? v.cornerRadius : 4,
              view: v,
              root,
              scroller,
              homeX: homeX + (fs ? fs.x : 0),
              homeY: homeY + (fs ? fs.y : 0)
            };
          }, (g) => {
            if (g != null)
              for (const fn of [...this.geometryHandlers])
                fn(g);
          });
          k.run();
        }
        blur() {
          this.focus(null);
        }
        next() {
          this.move(1);
        }
        prev() {
          this.move(-1);
        }
        /** The ordered focus stops in a view's group — its focusTrap ancestor, else
         *  the root. Exposed for tooling/tests. */
        sequenceFor(view) {
          const group = view !== null ? this.groupRoot(view) : this.rootView;
          return group !== null ? sequence(group) : [];
        }
        move(dir) {
          const group = this.current !== null ? this.groupRoot(this.current) : this.rootView;
          if (group === null)
            return;
          const seq = sequence(group);
          if (seq.length === 0)
            return;
          const idx = this.current !== null ? seq.indexOf(this.current) : dir === 1 ? -1 : 0;
          const atEdge = idx !== -1 && (dir === 1 && idx === seq.length - 1 || dir === -1 && idx === 0);
          if (group.focusTrap && atEdge)
            fireEvent(group, "escapeFocus");
          const nidx = ((idx + dir) % seq.length + seq.length) % seq.length;
          this.setKeyboard(true);
          this.apply(seq[nidx]);
          if (this.current === seq[nidx])
            seq[nidx].scrollIntoView("nearest");
        }
        /** The focused view's subtree is being discarded (or hidden) — move focus to
         *  a live stop OUTSIDE it before it goes, so focus never dangles. Survivors
         *  come from the dying view's OWN tree: when an embedded app is torn down
         *  (a live-edit re-render), focus is dropped, never re-anchored into the
         *  host app's controls. Called from View.discard() via the seam in view.ts. */
        noteDiscarded(view) {
          if (this.current === null || !isInSubtree(this.current, view))
            return;
          const survivors = sequence(rootOf(view)).filter((v) => !isInSubtree(v, view));
          this.current = null;
          if (survivors.length > 0)
            this.focus(survivors[0]);
        }
        /** The nearest focusTrap ancestor of `view` (the group it belongs to), or the
         *  view's OWN tree root when there is none. The tree anchor matters when more
         *  than one app shares the page (an embedded preview inside a host app): the
         *  focused view's group is ITS app's tree, so Tab cycles within the app the
         *  user is interacting with and never leaks into the host's controls. */
        groupRoot(view) {
          for (let v = view.parent instanceof View ? view.parent : null; v !== null; v = v.parent instanceof View ? v.parent : null) {
            if (v.focusTrap)
              return v;
          }
          return rootOf(view);
        }
      };
      DELIVERING = /* @__PURE__ */ new WeakMap();
      Focus = new FocusService();
      setFocusDiscardHook((view) => Focus.noteDiscarded(view));
    }
  });

  // runtime/dist/replicate.js
  function extentScale(logical, viewH) {
    if (logical <= EXTENT_CAP)
      return 1;
    const logicalRange = logical - viewH;
    const physicalRange = EXTENT_CAP - viewH;
    return physicalRange > 0 ? logicalRange / physicalRange : 1;
  }
  function materializationInfo(view) {
    const b = BLOCKS.get(view)?.[0];
    return b === void 0 ? null : b.info();
  }
  function lastNodeOf(prev) {
    if (prev === null)
      return null;
    return prev instanceof Replicator ? prev.last() : prev;
  }
  function focusedWithin(root) {
    const f = Focus.getFocus();
    if (f === null)
      return false;
    for (let n = f; n !== null; n = n.parent) {
      if (n === root)
        return true;
    }
    return false;
  }
  function subtreeDiverged(root) {
    if (nodeDiverged(root))
      return true;
    for (const c of root.children ?? []) {
      if (subtreeDiverged(c))
        return true;
    }
    return false;
  }
  function armTree(root) {
    armDivergence(root);
    for (const c of root.children ?? [])
      armTree(c);
  }
  function safeStringify(v) {
    try {
      return JSON.stringify(v);
    } catch {
      return null;
    }
  }
  var DEFAULT_UNIT, BUFFER_ROWS, EXTENT_CAP, physicalExtent, BLOCKS, ExtentLedger, Replicator;
  var init_replicate = __esm({
    "runtime/dist/replicate.js"() {
      "use strict";
      init_node();
      init_view();
      init_reactive();
      init_attributes();
      init_datapath();
      init_focus();
      init_spring();
      init_select();
      DEFAULT_UNIT = 24;
      BUFFER_ROWS = 5;
      EXTENT_CAP = 16777216;
      physicalExtent = (logical) => Math.min(logical, EXTENT_CAP);
      BLOCKS = /* @__PURE__ */ new WeakMap();
      ExtentLedger = class {
        est = 0;
        // the per-row estimate (includes the gap)
        estMeasured = false;
        // has est ever come from real rows?
        n = 0;
        fen = null;
        // Fenwick over (h_i − est); 1-based
        fenTotal = 0;
        known = /* @__PURE__ */ new Map();
        // member id → measured h
        knownSum = 0;
        // Σ known — shouldRebaseline is per-match, keep it O(1)
        /** Remember a measured height (by identity). Returns the CHANGE at that
         *  index (0 when already current) so callers can anchor-compensate. */
        measure(index, id, h) {
          const prev = this.known.get(id);
          if (prev === h)
            return 0;
          this.known.set(id, h);
          this.knownSum += h - (prev ?? 0);
          const before = prev ?? this.est;
          this.update(index, h - before);
          return h - before;
        }
        measuredCount() {
          return this.known.size;
        }
        /** Has the measured mean drifted far enough from the estimate that the
         *  unmeasured majority is being mis-sized? (Checked per match; a rebuild
         *  is O(n) and happens only when this fires or membership changes.) */
        shouldRebaseline() {
          if (this.known.size === 0)
            return false;
          if (!this.estMeasured)
            return true;
          const mean = this.knownSum / this.known.size;
          return Math.abs(mean - this.est) > Math.max(1, this.est * 0.2);
        }
        /** Rebuild the index-keyed corrections for a NEW membership (data change).
         *  `est` re-baselines to the measured mean when it has drifted. */
        rebuild(ids, fallbackEst) {
          this.n = ids.length;
          if (this.known.size > 0) {
            const mean = this.knownSum / this.known.size;
            if (!this.estMeasured || Math.abs(mean - this.est) > this.est * 0.2)
              this.est = mean;
            this.estMeasured = true;
          }
          if (this.est === 0)
            this.est = fallbackEst;
          this.fen = null;
          this.fenTotal = 0;
          for (let i = 0; i < ids.length; i++) {
            const h = this.known.get(ids[i]);
            if (h !== void 0 && h !== this.est)
              this.update(i, h - this.est);
          }
        }
        update(index, delta) {
          if (delta === 0 || index < 0 || index >= this.n)
            return;
          if (this.fen === null)
            this.fen = new Float64Array(this.n + 1);
          for (let i = index + 1; i <= this.n; i += i & -i)
            this.fen[i] += delta;
          this.fenTotal += delta;
        }
        /** Sum of corrections for rows [0, index). */
        prefix(index) {
          if (this.fen === null)
            return 0;
          let s = 0;
          for (let i = Math.min(index, this.n); i > 0; i -= i & -i)
            s += this.fen[i];
          return s;
        }
        /** The top of row `index`, block-local (no leading). */
        offset(index) {
          return index * this.est + this.prefix(index);
        }
        /** One row's span (measured, else the estimate) — the incremental
         *  placement walk's step, O(1). */
        span(id) {
          return this.known.get(id) ?? this.est;
        }
        /** Total extent of all n rows. */
        total() {
          return this.n * this.est + this.fenTotal;
        }
        /** The row whose span contains block-local `y` (clamped). O(log n): a
         *  Fenwick walk over est·i + corrections, exact because spans are
         *  positive. Uniform fast path: plain division. */
        indexAt(y) {
          if (this.n === 0)
            return 0;
          if (this.fen === null) {
            return Math.max(0, Math.min(this.n - 1, Math.floor(y / this.est)));
          }
          let lo = 0;
          let hi = this.n - 1;
          while (lo < hi) {
            const mid = lo + hi + 1 >> 1;
            if (this.offset(mid) <= y)
              lo = mid;
            else
              hi = mid - 1;
          }
          return lo;
        }
      };
      Replicator = class {
        parent;
        path;
        classroot;
        make;
        prev;
        plan;
        policy;
        views = [];
        items = [];
        /** Every child this block currently owns: the window instances plus the
         *  RETAINED (touched, off-window) instances — what linking and discard
         *  operate over. Equal to `views` when nothing is retained. */
        allViews = [];
        /** Touched instances kept alive off-window (keep-alive, D5): member
         *  identity → instance. Bounded by rows a human actually touched. */
        retained = /* @__PURE__ */ new Map();
        /** PARKED spares (recycling's idle pool): clean instances the window no
         *  longer needs, kept hidden instead of discarded so the next growth —
         *  an oscillating overscan lead, a direction flip, a viewport resize —
         *  re-points an existing row instead of constructing one (the thumb-drag
         *  bench's spikes were exactly these discard-then-rebuild bursts). */
        spares = [];
        /** Member identities whose init has fired — the membership-anchored
         *  lifecycle (D5): an identity in this set never refires onInit while its
         *  membership lasts; intersected with the live membership on data change,
         *  so leave-and-return is a NEW membership and fires again. */
        inited = /* @__PURE__ */ new Set();
        unit = 0;
        // measured row extent (0 = none yet)
        measuredUnit = false;
        windowedActive = false;
        fallback = null;
        // why windowing disengaged (diagnostic)
        winStart = 0;
        logical = 0;
        positioned = false;
        // we own instance y's (windowed placement)
        // Extent compression (the 2²⁵ ceiling): the live logical↔physical ratio and
        // the physical scroll offset into this block, both published by the match so
        // placement can re-base against them. `scale === 1` is the uncompressed case
        // and every consumer reduces to its old form there.
        scale = 1;
        pRel = 0;
        relLogical = 0;
        heightOwner = null;
        // the parent-extent derive
        lastLeading = 0;
        // the block-start offset (see Match.leading)
        lastRel = null;
        // last window offset — the overscan's velocity probe
        ledger = new ExtentLedger();
        rowGap = 0;
        /** The membership signature the ledger was last rebuilt for. */
        ledgerShape = null;
        /** The viewport-stability anchor: the first in-view member and where its
         *  top sat relative to the scroll, captured each match — a data change
         *  that moves it (a prepend, a measured correction above) compensates the
         *  scroll so the user's view holds still (Tracker criterion 2). */
        anchorId = void 0;
        anchorDelta = 0;
        lastArr = null;
        // membership-change detection
        lastLen = -1;
        /** Wakes the match when the FIRST instances exist to measure — the
         *  estimate-then-correct loop's trigger (a plain cell; reconcile pings it
         *  after creating rows while the unit is still predicted). */
        measureCell = new Cell();
        indexCache = null;
        // identity → logical index (retained bookkeeping)
        template;
        constraint;
        /** The record field that identifies an instance across re-derivations
         *  (`key = :field`), split into segments — or null to reconcile by object
         *  identity (===), the default. A derived collection produces FRESH record
         *  objects every recompute, so identity would rebuild all of them; a key
         *  pools by a stable field, so only genuinely changed records rebuild. */
        keyPath;
        constructor(parent, element, path, classroot, make, prev, key = null, plan = null, policy = false) {
          this.parent = parent;
          this.path = path;
          this.classroot = classroot;
          this.make = make;
          this.prev = prev;
          this.plan = plan;
          this.policy = policy;
          this.keyPath = key === null ? null : splitPath(key);
          this.template = {
            ...element,
            attrs: element.attrs.filter((a) => !(a.name === "datapath" && a.value.kind === "path" && a.value.many) && !(a.name === "key" && a.value.kind === "path") && a.name !== "virtualize")
          };
          this.constraint = new Constraint(`${parent.constructor.name}'s replication (:${path}[])`, () => this.match(), (m) => this.reconcile(m));
        }
        /** The live policy answer. A literal is itself; a `{ }` constraint is called
         *  — and callers must only do that from inside match(), so the read lands in
         *  the Constraint's dependency set. A throwing expression is NOT caught: every
         *  other `{ }` in the language propagates, and swallowing this one would make
         *  a broken policy look like a deliberate `false`. */
        wantsVirtual() {
          return typeof this.policy === "function" ? !!this.policy() : this.policy;
        }
        /** First run (instantiate pass two — the tree is linked) + retire with the
         *  parent, so a discarded subtree's replicators can never wake again. */
        arm() {
          const list = BLOCKS.get(this.parent);
          if (list !== void 0)
            list.push(this);
          else
            BLOCKS.set(this.parent, [this]);
          onDiscard(this.parent, () => this.constraint.dispose());
          this.constraint.run();
        }
        // ── The kernel window API (D5: the live window is runtime/library
        //    surface — layout, AT, the inspector, navigate-to-record) ───────────
        /** The block's logical member count. */
        logicalCount() {
          return this.logical;
        }
        /** The realized instances, each with its LOGICAL index — the live
         *  window under the mechanism's name-of-art, spoken as `realized` so the
         *  API never collides with Window-the-component. */
        realized() {
          const out = [];
          this.views.forEach((view, i) => out.push({ view, index: this.winStart + i }));
          for (const [id, view] of this.retained) {
            const idx = this.indexCache?.get(id);
            if (idx !== void 0)
              out.push({ view, index: idx });
          }
          return out;
        }
        /** Navigate-to-logical-record (materialization.md §3.5 — required by the
         *  observer boundary): scroll so the record at `index` materializes —
         *  app-level search's landing and the AT-traversal path. Imperative (a
         *  handler's verb), so reads here are untracked by design. */
        navigateTo(index) {
          if (!this.windowedActive) {
            this.views[index]?.scrollIntoView("nearest");
            return;
          }
          const scroller = this.findScroller();
          if (scroller === null)
            return;
          const into = this.lastLeading + index * (this.unit > 0 ? this.unit : DEFAULT_UNIT);
          const target = this.offsetTo(scroller) + into / extentScale(this.ledger.total(), scroller.height);
          scroller.scrollY = Math.max(0, target);
        }
        /** The inspector diagnostic (§3.6). */
        info() {
          return {
            windowed: this.windowedActive,
            logical: this.logical,
            materialized: this.views.length,
            retained: this.retained.size,
            unit: this.unit,
            extent: this.windowedActive ? this.measuredUnit ? "measured" : "predicted" : null,
            fallback: this.fallback,
            identity: this.identityMode()
          };
        }
        /** The nearest scrolling ancestor (scrolls = y | both), or null. Tracked
         *  when called from match(), plain when called imperatively. */
        findScroller() {
          for (let v = this.parent; v instanceof View; v = v.parent) {
            const ax = v.scrolls;
            if (ax === "y" || ax === "both")
              return v;
          }
          return null;
        }
        /** This block's y offset within the scroller's CONTENT coordinates: the
         *  sum of `y` from the block's parent up to (excluding) the scroller. */
        offsetTo(scroller) {
          let off = 0;
          for (let v = this.parent; v instanceof View && v !== scroller; v = v.parent)
            off += v.y;
          return off;
        }
        /** The tracked half: the inherited cursor chain + the matched region — and
         *  in windowed mode also the scroll box (scrollY, viewport extent, the
         *  offset chain, the first row's measured height): the windowed match is
         *  the SAME standing computation with more tracked dependencies
         *  (materialization.md §3.1). A non-array (unresolved, or scalar) matches
         *  nothing — zero instances, re-matched the moment the region becomes an
         *  array. A SELECTIVE plan (`:rows[2:8][]`) replicates the selection
         *  itself — windowing over selections is a later increment. */
        match() {
          const none = { data: null, nodes: [], items: [], arrayPath: null, logical: 0, start: 0, unit: 0, windowed: false, dataChanged: true, leading: 0 };
          const base2 = inheritedCursor(this.parent);
          if (base2 === null)
            return none;
          if (this.plan !== null && isSelective(this.plan)) {
            if (this.wantsVirtual())
              this.fallback = "a selective path replicates its selection fully (windowing over selections is a later increment)";
            const nodes2 = selectNodes(base2.data, base2.path, this.plan);
            return { data: base2.data, nodes: nodes2, items: nodes2.map((n) => n.value), arrayPath: null, logical: nodes2.length, start: 0, unit: 0, windowed: false, dataChanged: true, leading: 0 };
          }
          const at = this.plan === null ? splitPath(this.path) : selectNodes(base2.data, base2.path, this.plan)[0]?.path;
          if (at === void 0)
            return { ...none, data: base2.data };
          const arrayPath = this.plan === null ? [...base2.path, ...at] : at;
          const arr = base2.data.read(arrayPath);
          if (!Array.isArray(arr))
            return { ...none, data: base2.data };
          const logical = arr.length;
          const dataChanged = arr !== this.lastArr || logical !== this.lastLen;
          this.lastArr = arr;
          this.lastLen = logical;
          const wants = this.wantsVirtual();
          const full = () => ({
            data: base2.data,
            nodes: arr.map((value, i) => ({ path: [...arrayPath, String(i)], value })),
            items: arr,
            arrayPath,
            logical,
            start: 0,
            unit: 0,
            windowed: false,
            dataChanged,
            leading: 0
          });
          if (!wants) {
            this.fallback = null;
            return full();
          }
          const scroller = this.findScroller();
          if (scroller === null) {
            this.fallback = "no scrolling ancestor (scrolls = y) to window against";
            return full();
          }
          const lay = this.parent.layout;
          let gap = 0;
          if (lay !== null) {
            if (lay.axis === "y") {
              gap = typeof lay.spacing === "number" ? lay.spacing : 0;
              this.rowGap = gap;
            } else {
              this.fallback = "the block's parent runs a layout windowing cannot predict (a vertical SimpleLayout composes; others fall back) \u2014 set virtualize = false or drop the layout";
              return full();
            }
          }
          this.fallback = null;
          let y = scroller.scrollY;
          const viewH = scroller.height;
          const offset = this.offsetTo(scroller);
          this.measureCell.track();
          for (const v of this.views)
            void v.height;
          const probe = this.views[0];
          const measured = probe !== void 0 ? probe.height + gap : 0;
          if (measured > gap)
            this.measuredUnit = true;
          const unit = measured > gap ? measured : this.unit > 0 ? this.unit : DEFAULT_UNIT + gap;
          this.unit = unit;
          let membershipRebuilt = false;
          if (dataChanged || this.ledgerShape === null || this.ledger.shouldRebaseline()) {
            const ids = dataChanged || this.ledgerShape === null ? arr.map((v) => this.idOf(v)) : this.ledgerShape;
            const oldOffset = this.anchorId !== void 0 ? this.anchorFind(this.anchorId) : null;
            this.ledger.rebuild(ids, unit);
            this.ledgerShape = ids;
            membershipRebuilt = dataChanged;
            if (oldOffset !== null) {
              const at2 = ids.indexOf(this.anchorId);
              if (at2 >= 0) {
                const shift = (this.ledger.offset(at2) - oldOffset) / extentScale(this.ledger.total(), scroller.height);
                if (shift !== 0) {
                  y = Math.max(0, y + shift);
                  setBound(scroller, "scrollY", y);
                }
              }
            }
          }
          if (this.ledger.est === 0)
            this.ledger.rebuild(arr.map((v) => this.idOf(v)), unit);
          const anchor = this.leadingAnchor();
          const leading = anchor !== null ? anchor.y + anchor.height + gap : 0;
          if (membershipRebuilt) {
            const end = Math.max(0, offset + leading + physicalExtent(this.ledger.total()) - viewH);
            if (y > end) {
              y = end;
              setBound(scroller, "scrollY", y);
            }
          }
          const pRel = Math.max(0, y - offset - leading);
          this.scale = extentScale(this.ledger.total(), viewH);
          this.pRel = pRel;
          const rel = this.scale === 1 ? pRel : Math.min(Math.max(0, this.ledger.total() - viewH), pRel * this.scale);
          this.relLogical = rel;
          const delta = this.lastRel === null ? 0 : rel - this.lastRel;
          this.lastRel = rel;
          const estRow = this.ledger.est > 0 ? this.ledger.est : unit;
          const deltaRows = Math.ceil(Math.abs(delta) / estRow);
          const viewRows = Math.ceil(viewH / estRow);
          const lead = deltaRows > viewRows ? BUFFER_ROWS : Math.min(30, BUFFER_ROWS + 3 * deltaRows);
          const before = delta >= 0 ? BUFFER_ROWS : lead;
          const after = delta >= 0 ? lead : BUFFER_ROWS;
          const firstIdx = this.ledger.indexAt(rel);
          const lastIdx = this.ledger.indexAt(rel + viewH);
          const start = Math.max(0, Math.min(logical, firstIdx - before));
          const count = Math.max(0, Math.min(logical - start, lastIdx - firstIdx + 1 + before + after));
          this.anchorId = arr.length > 0 ? this.idOf(arr[Math.min(arr.length - 1, firstIdx)]) : void 0;
          this.anchorDelta = rel - this.ledger.offset(Math.min(Math.max(0, arr.length - 1), firstIdx));
          const nodes = [];
          for (let i = 0; i < count; i++) {
            nodes.push({ path: [...arrayPath, String(start + i)], value: arr[start + i] });
          }
          return { data: base2.data, nodes, items: arr, arrayPath, logical, start, unit, windowed: true, dataChanged, leading };
        }
        /** A record's pooling identity, per the REVISED ladder (ruled 2026-07-30,
         *  the invisible version): the explicit `key = :field` override first,
         *  then the INFERRED convention — a record's own scalar `id` field IS its
         *  identity, no declaration anywhere — then the record object itself
         *  (===; the structural-equality fallback catches misses beneath that). */
        idOf(item) {
          if (this.keyPath !== null) {
            let cur = item;
            for (const seg of this.keyPath) {
              if (cur === null || typeof cur !== "object")
                return void 0;
              cur = cur[seg];
            }
            return cur;
          }
          if (item !== null && typeof item === "object" && !Array.isArray(item) && Object.hasOwn(item, "id")) {
            const v = item.id;
            if (v !== null && v !== void 0 && typeof v !== "object")
              return v;
          }
          return item;
        }
        /** The identity mode in force — the inspector's honesty about an invisible
         *  rule (key | id | object; structural fallback applies on misses either
         *  way when keyless). */
        identityMode() {
          if (this.keyPath !== null)
            return "key";
          const first = this.items[0];
          if (first !== null && typeof first === "object" && !Array.isArray(first) && Object.hasOwn(first, "id"))
            return "id";
          return "object";
        }
        reconcile(m) {
          const { data, nodes, windowed, dataChanged } = m;
          this.logical = m.logical;
          this.winStart = m.start;
          this.lastLeading = m.leading;
          const items = nodes.map((n) => n.value);
          const droppedRetained = [];
          if (dataChanged) {
            this.indexCache = null;
            if (this.retained.size > 0 || this.inited.size > 0) {
              const idx = /* @__PURE__ */ new Map();
              m.items.forEach((item, i) => {
                const id = this.idOf(item);
                if (!idx.has(id))
                  idx.set(id, i);
              });
              this.indexCache = idx;
              for (const id of this.inited)
                if (!idx.has(id))
                  this.inited.delete(id);
              for (const [id, view] of this.retained) {
                if (!idx.has(id)) {
                  this.retained.delete(id);
                  droppedRetained.push(view);
                }
              }
            }
          }
          const pool = /* @__PURE__ */ new Map();
          const entries = [];
          this.items.forEach((item, i) => {
            const e = { item, view: this.views[i], used: false };
            entries.push(e);
            const id = this.idOf(item);
            const q = pool.get(id);
            if (q !== void 0)
              q.push(e);
            else
              pool.set(id, [e]);
          });
          const take = (q) => {
            const e = q?.find((p) => !p.used);
            if (e === void 0)
              return void 0;
            e.used = true;
            return e.view;
          };
          let byContent = null;
          const contentMatch = (value) => {
            if (this.keyPath !== null || typeof value !== "object" || value === null)
              return void 0;
            if (byContent === null) {
              byContent = /* @__PURE__ */ new Map();
              for (const e of entries) {
                if (e.used || typeof e.item !== "object" || e.item === null)
                  continue;
                const k2 = safeStringify(e.item);
                if (k2 === null)
                  continue;
                const q = byContent.get(k2);
                if (q !== void 0)
                  q.push(e);
                else
                  byContent.set(k2, [e]);
              }
            }
            const k = safeStringify(value);
            return k === null ? void 0 : take(byContent.get(k));
          };
          const next = [];
          const fresh = /* @__PURE__ */ new Map();
          const misses = [];
          for (const node of nodes) {
            const id = this.idOf(node.value);
            let v = take(pool.get(id));
            if (v === void 0) {
              const kept = this.retained.get(id);
              if (kept !== void 0) {
                this.retained.delete(id);
                v = kept;
              }
            }
            if (v === void 0)
              v = contentMatch(node.value);
            if (v !== void 0) {
              next.push(v);
            } else {
              next.push(null);
              misses.push({ slot: next.length - 1, id });
            }
          }
          const recycled = [];
          const recycledNewMember = [];
          if (windowed && misses.length > 0) {
            const harvest = [];
            for (const [id, q] of pool) {
              if (harvest.length >= misses.length)
                break;
              for (const e of q) {
                if (e.used || harvest.length >= misses.length)
                  continue;
                const stillMember = !dataChanged || this.indexCache?.has(id) === true;
                if (stillMember && !subtreeDiverged(e.view) && !focusedWithin(e.view)) {
                  e.used = true;
                  harvest.push(e.view);
                }
              }
            }
            let hAt = 0;
            for (const miss of misses) {
              const r = hAt < harvest.length ? harvest[hAt++] : this.unpark();
              if (r === void 0)
                break;
              next[miss.slot] = r;
              recycled.push(r);
              if (!this.inited.has(miss.id))
                recycledNewMember.push(r);
            }
          }
          for (const miss of misses) {
            if (next[miss.slot] !== null)
              continue;
            const made = this.make(this.template, this.classroot);
            if (this.inited.has(miss.id))
              made.suppressInit();
            fresh.set(made.view, made.finish);
            next[miss.slot] = made.view;
          }
          const removed = [...droppedRetained];
          const evictions = /* @__PURE__ */ new Set();
          for (const [id, q] of pool) {
            for (const e of q) {
              if (e.used)
                continue;
              const stillMember = windowed && (!dataChanged || this.indexCache?.has(id) === true);
              if (stillMember && (subtreeDiverged(e.view) || focusedWithin(e.view))) {
                this.retained.set(id, e.view);
              } else {
                if (stillMember) {
                  if (windowed && this.spares.length < 60) {
                    this.park(e.view);
                    continue;
                  }
                  evictions.add(e.view);
                  markEvicting(e.view);
                }
                removed.push(e.view);
              }
            }
          }
          for (const v of removed)
            if (!evictions.has(v))
              fireRetireTree(v);
          const retainedViews = [...this.retained.values()];
          const nextAll = [...next, ...retainedViews, ...this.spares];
          const changed = fresh.size > 0 || removed.length > 0 || nextAll.length !== this.allViews.length || nextAll.some((v, i) => this.allViews[i] !== v);
          if (changed) {
            for (const v of this.allViews)
              this.parent.removeChild(v);
            let at = this.start();
            const end = at + nextAll.length;
            for (const v of nextAll)
              this.parent.insertChild(v, at++);
            for (const v of removed)
              v.discard();
            const sameSet = windowed && fresh.size === 0 && removed.length === 0;
            const ps = this.parent.surface;
            if (ps !== null && this.parent.backend !== null && !sameSet) {
              let before = this.surfaceAfter(end);
              for (let i = nextAll.length - 1; i >= 0; i--) {
                const v = nextAll[i];
                if (v.surface === null)
                  v.attach(this.parent.backend, ps, before);
                else
                  ps.insertChild(v.surface, before);
                before = v.surface;
              }
            }
          }
          next.forEach((v, i) => {
            setBound(v, "datapath", data === null ? null : data.cursorAt(nodes[i].path));
          });
          for (const v of recycled)
            arriveSubtree(v);
          for (const v of fresh.keys())
            arriveSubtree(v);
          if (m.arrayPath !== null && this.retained.size > 0) {
            for (const [id, v] of this.retained) {
              const idx = this.indexCache?.get(id);
              if (idx !== void 0 && data !== null) {
                setBound(v, "datapath", data.cursorAt([...m.arrayPath, String(idx)]));
              }
            }
          }
          if (windowed) {
            const base2 = m.leading + this.pRel - this.relLogical;
            let yy = base2 + this.ledger.offset(m.start);
            next.forEach((v, i) => {
              setBound(v, "y", yy);
              yy += this.ledger.span(this.idOf(m.items[m.start + i]));
            });
            for (const [id, v] of this.retained) {
              const idx = this.indexCache?.get(id);
              if (idx !== void 0)
                setBound(v, "y", base2 + this.ledger.offset(idx));
            }
            this.positioned = true;
            const total = m.leading + this.ledger.total();
            const published = physicalExtent(total);
            const heightAuthored = isSet(this.parent, "height") || ownerOf(this.parent, "height")?.yielding === false;
            if (heightAuthored) {
              this.heightOwner?.dispose();
              this.heightOwner = null;
              if (this.parent.scrolls !== "none")
                this.parent.surface?.setVirtualExtent?.(published);
            } else if (this.heightOwner === null) {
              this.totalExtent = published;
              this.heightOwner = bindDerived(this.parent, "height", () => this.totalExtent);
            } else if (this.totalExtent !== published) {
              this.totalExtent = published;
              this.heightOwner.run();
            }
          } else if (this.windowedActive) {
            this.heightOwner?.dispose();
            this.heightOwner = null;
            this.parent.surface?.setVirtualExtent?.(null);
            for (const v of this.spares.splice(0)) {
              markEvicting(v);
              this.parent.removeChild(v);
              v.discard();
            }
            if (this.positioned) {
              for (const v of nextAll)
                setBound(v, "y", 0);
              this.positioned = false;
            }
          }
          this.parent.surface?.setRowCount?.(windowed ? m.logical : null);
          next.forEach((v, i) => v.surface?.setRowIndex?.(windowed ? m.start + i + 1 : null));
          if (windowed) {
            for (const [id, v] of this.retained) {
              const idx = this.indexCache?.get(id);
              v.surface?.setRowIndex?.(idx !== void 0 ? idx + 1 : null);
            }
          }
          if (this.windowedActive !== windowed) {
            this.windowedActive = windowed;
            markWindowedBlock(this.parent, windowed);
          }
          this.views = next;
          this.items = items;
          this.allViews = nextAll;
          for (const finish of fresh.values())
            finish();
          for (const v of recycledNewMember)
            fireInitTree(v);
          for (const node of nodes) {
            const id = this.idOf(node.value);
            if (!this.inited.has(id))
              this.inited.add(id);
          }
          for (const view of fresh.keys())
            armTree(view);
          for (const view of recycled)
            armTree(view);
          if (windowed && next.length > 0) {
            const justPointed = new Set(recycled);
            for (const v of fresh.keys())
              justPointed.add(v);
            let changed2 = false;
            let aboveShift = 0;
            const anchorIdx = this.anchorId !== void 0 ? this.indexCache?.get(this.anchorId) : void 0;
            for (let i = 0; i < next.length; i++) {
              const idx = m.start + i;
              if (justPointed.has(next[i])) {
                changed2 = true;
                continue;
              }
              const h = next[i].height + this.rowGap;
              if (h <= this.rowGap)
                continue;
              const d = this.ledger.measure(idx, this.idOf(m.items[idx]), h);
              if (d !== 0) {
                changed2 = true;
                if (anchorIdx !== void 0 && idx < anchorIdx)
                  aboveShift += d;
              }
            }
            if (aboveShift !== 0) {
              const sc = this.findScroller();
              if (sc !== null)
                setBound(sc, "scrollY", Math.max(0, sc.scrollY + aboveShift));
            }
            if (changed2 || !this.measuredUnit)
              this.measureCell.changed();
          }
          if (changed) {
            this.parent.childrenMutated();
            this.measureCell.changed();
          }
        }
        /** The parent-extent the height derive publishes (windowed mode). */
        totalExtent = 0;
        /** Where the block starts right now: after its anchor. */
        start() {
          const anchor = lastNodeOf(this.prev);
          return anchor === null ? 0 : this.parent.children.indexOf(anchor) + 1;
        }
        /** The last VISIBLE View before the block — the GEOMETRY anchor the
         *  window's leading offset builds on. Distinct from the structural anchor
         *  (`lastNodeOf(this.prev)`): an invisible sibling (a DataGrid Column, a
         *  hidden control) occupies no space — the SimpleLayout rule — so the
         *  walk skips it rather than offsetting below a phantom. */
        /** The anchor member's offset under the CURRENT (pre-rebuild) ledger,
         *  or null when it is no longer known. */
        anchorFind(id) {
          const shape = this.ledgerShape;
          if (shape === null)
            return null;
          const at = shape.indexOf(id);
          return at < 0 ? null : this.ledger.offset(at) - this.anchorDelta + this.anchorDelta;
        }
        /** Hide and shelve a clean evicted instance for reuse. */
        park(v) {
          setBound(v, "visible", false);
          this.spares.push(v);
        }
        /** Take a spare back into service (visible again; the caller re-points). */
        unpark() {
          const v = this.spares.pop();
          if (v !== void 0)
            setBound(v, "visible", true);
          return v;
        }
        leadingAnchor() {
          for (let i = this.start() - 1; i >= 0; i--) {
            const sib = this.parent.children[i];
            if (sib instanceof View && sib.visible && sib.ignoreLayout !== true)
              return sib;
          }
          return null;
        }
        /** The first live surface after the block — the `before` reference the
         *  re-inserted surfaces stack up against (null = the parent's end). */
        surfaceAfter(index) {
          for (let i = index; i < this.parent.children.length; i++) {
            const sib = this.parent.children[i];
            if (sib instanceof View && sib.surface !== null)
              return sib.surface;
          }
          return null;
        }
        /** @internal The block's last instance — the next block's anchor. */
        last() {
          return this.allViews.length > 0 ? this.allViews[this.allViews.length - 1] : lastNodeOf(this.prev);
        }
      };
    }
  });

  // runtime/dist/measure.js
  function cssWeight(w) {
    return WEIGHT_CSS[w] ?? "400";
  }
  function measurer() {
    return measureCtx ??= document.createElement("canvas").getContext("2d");
  }
  function provideMeasurer(ctx) {
    measureCtx = ctx;
  }
  function fontString(style) {
    return `${style.italic ? "italic " : ""}${cssWeight(style.fontWeight)} ${style.fontSize}px ${style.fontFamily}`;
  }
  function textWidth(text, font, letterSpacing = 0) {
    const m = measurer();
    m.font = font;
    const ls = m;
    ls.letterSpacing = `${letterSpacing}px`;
    const w = m.measureText(text).width;
    ls.letterSpacing = "0px";
    return w;
  }
  function fontMetrics(font) {
    const m = measurer();
    m.font = font;
    const t = m.measureText("");
    return { ascent: t.fontBoundingBoxAscent, descent: t.fontBoundingBoxDescent };
  }
  function capHeight(font) {
    const m = measurer();
    m.font = font;
    const t = m.measureText("H");
    if (typeof t.actualBoundingBoxAscent === "number" && t.actualBoundingBoxAscent > 0)
      return t.actualBoundingBoxAscent;
    const size = /(\d+(?:\.\d+)?)px/.exec(font);
    return 0.7 * (size ? parseFloat(size[1]) : 16);
  }
  function xHeight(font) {
    const m = measurer();
    m.font = font;
    const t = m.measureText("x");
    if (typeof t.actualBoundingBoxAscent === "number" && t.actualBoundingBoxAscent > 0)
      return t.actualBoundingBoxAscent;
    const size = /(\d+(?:\.\d+)?)px/.exec(font);
    return 0.5 * (size ? parseFloat(size[1]) : 16);
  }
  function wrapLines(text, font, width, letterSpacing = 0) {
    if (width <= 0)
      return text.split("\n");
    const m = measurer();
    m.font = font;
    const ls = m;
    ls.letterSpacing = `${letterSpacing}px`;
    const out = [];
    for (const seg of text.split("\n")) {
      let cur = "";
      for (const word of seg.split(" ")) {
        const chunks = word.split(/(?<=[/-])/);
        for (let j = 0; j < chunks.length; j++) {
          const glue = j === 0 && cur !== "" ? " " : "";
          const trial = cur === "" ? chunks[j] : cur + glue + chunks[j];
          if (cur !== "" && m.measureText(trial).width > width) {
            out.push(cur);
            cur = chunks[j];
          } else
            cur = trial;
        }
      }
      out.push(cur);
    }
    ls.letterSpacing = "0px";
    return out.length === 0 ? [""] : out;
  }
  var WEIGHT_CSS, measureCtx;
  var init_measure = __esm({
    "runtime/dist/measure.js"() {
      "use strict";
      WEIGHT_CSS = {
        thin: "100",
        extralight: "200",
        light: "300",
        regular: "400",
        normal: "400",
        medium: "500",
        semibold: "600",
        bold: "700",
        extrabold: "800",
        black: "900"
      };
      measureCtx = null;
    }
  });

  // runtime/dist/text.js
  var Text;
  var init_text = __esm({
    "runtime/dist/text.js"() {
      "use strict";
      init_view();
      init_value();
      init_measure();
      init_attributes();
      init_reactive();
      Text = class extends View {
        // `selectable` is a prevailing View slot now (inherited): the textStyle derive
        // below reads `this.selectable` so a `selectable` container opts a whole subtree in.
        /** The per-line advance: the declared leading (a fontSize multiplier, the
         *  Markdown convention) or, at the 0 default, the font's natural line box. */
        lineAdvance(m) {
          return this.lineHeight > 0 ? Math.round(this.fontSize * this.lineHeight) : m.ascent + m.descent;
        }
        // ── Author-facing font metrics (compositing.md Part III) — read-only,
        // REACTIVE intrinsics of the EFFECTIVE font (the prevailing slots): each
        // getter measures through fontString(this), whose slot reads are tracked,
        // so a constraint reading `label.ascent` re-derives when the effective
        // font changes — a provider re-rooting above included. Measurement, not
        // font tables, deliberately: no web API reads a font's binary (unreachable
        // for system fonts, and it carries THREE competing ascent/descent sets
        // browsers disagree on) — the measurer reports what THIS engine renders.
        // RULED in-build: Text-only v1 (no per-font query service until a real
        // program needs one that a hidden Text cannot serve).
        /** The effective font's ascent above the baseline (the font bounding box,
         *  a property of the font — independent of this run's characters). */
        get ascent() {
          return fontMetrics(fontString(this)).ascent;
        }
        /** The effective font's descent below the baseline — ascent + descent is
         *  the natural line box. */
        get descent() {
          return fontMetrics(fontString(this)).descent;
        }
        /** The capital ink band above the baseline (probed from "H" — what
         *  `y = center` optically centers). */
        get capHeight() {
          return capHeight(fontString(this));
        }
        /** The lowercase ink band above the baseline (probed from "x"). */
        get xHeight() {
          return xHeight(fontString(this));
        }
        /** The y of the FIRST baseline inside this view — what cross-font,
         *  cross-size baseline alignment positions against:
         *  `y = { title.y + title.baseline - this.baseline }`. Both renderers
         *  place the first line's baseline at the font ascent (the natural-box
         *  rule; a declared `lineHeight` changes the stride between lines, never
         *  where the first baseline sits). */
        get baseline() {
          return fontMetrics(fontString(this)).ascent;
        }
        attach(backend2, parentSurface) {
          if (!isSet(this, "width") && ownerOf(this, "width") === null) {
            bindDerived(this, "width", () => Math.ceil(textWidth(this.text, fontString(this), this.letterSpacing)));
          }
          if (!isSet(this, "height") && ownerOf(this, "height") === null) {
            bindDerived(this, "height", () => {
              const m = fontMetrics(fontString(this));
              const lineH = this.lineAdvance(m);
              const bounded = (isSet(this, "width") || ownerOf(this, "width") !== null) && this.width > 0;
              const lines = bounded && this.wrap ? wrapLines(this.text, fontString(this), this.width, this.letterSpacing).length : 1;
              return Math.ceil(lineH * lines);
            });
          }
          super.attach(backend2, parentSurface);
        }
        /** A Text's own content folds into `contentWidth`/`contentHeight` as its
         *  MEASURED glyph extent — the way an Image folds in its bitmap (view.ts
         *  contentExtent). Without this a Text reported the base 0, so a container
         *  sizing to `label.contentWidth` (an auto-sized pill/badge) always read
         *  empty. Reads `text` and the font slots under tracking (contentExtent runs
         *  tracked), so it re-measures when the text or style changes — the fix for
         *  content-bound labels. The natural single-line width; height follows the
         *  wrapped line count when the width is bounded, matching the derives above. */
        contentExtent(size) {
          const font = fontString(this);
          if (size === "width")
            return Math.ceil(textWidth(this.text, font, this.letterSpacing));
          const m = fontMetrics(font);
          const bounded = (isSet(this, "width") || ownerOf(this, "width") !== null) && this.width > 0;
          const lines = bounded && this.wrap ? wrapLines(this.text, font, this.width, this.letterSpacing).length : 1;
          return Math.ceil(this.lineAdvance(m) * lines);
        }
        /** The ink band (y axis): first line's cap top to the last line's baseline
         *  — what `y = center` centers (bind.ts bindAlign). Descenders hang below
         *  the band as overhang, per typographic convention. The x axis stays the
         *  geometric box. */
        alignBand(axis) {
          if (axis === "x")
            return super.alignBand(axis);
          const font = fontString(this);
          const m = fontMetrics(font);
          const cap = capHeight(font);
          const bounded = (isSet(this, "width") || ownerOf(this, "width") !== null) && this.width > 0;
          const lines = bounded && this.wrap ? wrapLines(this.text, font, this.width, this.letterSpacing).length : 1;
          return { lead: m.ascent - cap, size: (lines - 1) * this.lineAdvance(m) + cap };
        }
        flush(s) {
          super.flush(s);
          const style = new Constraint(
            `${this.constructor.name}.textStyle`,
            () => ({
              fontFamily: this.fontFamily,
              fontSize: this.fontSize,
              fontWeight: this.fontWeight,
              letterSpacing: this.letterSpacing,
              color: this.textColor,
              shadow: this.textShadow,
              wrap: this.wrap && (isSet(this, "width") || ownerOf(this, "width") !== null) && this.width > 0,
              align: this.textAlign,
              italic: this.italic,
              textFill: this.textFill,
              selectable: this.selectable,
              lineHeight: this.lineHeight
            }),
            // Constraint is deliberately untyped across compute→apply; this
            // apply's input is exactly its compute's output.
            (st) => this.surface?.setTextStyle(st),
            0
          );
          style.run();
          onDiscard(this, () => style.dispose());
          s.setText(this.text);
        }
      };
      defineAttributes(Text, {
        text: { def: "", push: (t, v) => t.surface?.setText(v) },
        textShadow: { def: null, equal: shadowEqual },
        wrap: { def: true },
        textAlign: { def: "left" },
        italic: { def: false },
        textFill: { def: null },
        lineHeight: { def: 0 }
      });
    }
  });

  // runtime/dist/image.js
  function resolveAsset(source) {
    if (assetBase === null || source === "")
      return source;
    if (/^[a-z][a-z0-9+.-]*:/i.test(source) || source.startsWith("//") || source.startsWith("/"))
      return source;
    try {
      return new URL(source, assetBase).href;
    } catch {
      return source;
    }
  }
  var assetBase, Image;
  var init_image = __esm({
    "runtime/dist/image.js"() {
      "use strict";
      init_view();
      init_attributes();
      assetBase = null;
      Image = class extends View {
        /** Discards a superseded load: only the latest request may land. */
        loadSeq = 0;
        /** The arrived bitmap's natural size — what contentExtent folds into a
         *  parent-style auto-extent when this Image has children of its own (LZX's
         *  max(resource, subviews)). Zero until loaded. */
        natural = { width: 0, height: 0 };
        /** Auto-extent's content hook: the bitmap's natural extent. Reads `loaded`
         *  (tracked), so an owning extent derive re-runs when the bitmap arrives. */
        contentExtent(size) {
          return this.loaded ? this.natural[size] : 0;
        }
        attach(backend2, parentSurface) {
          super.attach(backend2, parentSurface);
          this.load();
        }
        flush(s) {
          super.flush(s);
          s.setImageStretch(this.stretches);
          if (this.tint !== null)
            s.setImageTint?.(this.tint);
        }
        /** (Re)load `source` — called at attach and by the `source` pusher. */
        load() {
          const seq = ++this.loadSeq;
          const s = this.surface;
          if (s === null)
            return;
          setBound(this, "failed", false);
          if (this.source === "") {
            s.setImage(null);
            return;
          }
          if (typeof document === "undefined")
            return;
          const img = document.createElement("img");
          img.onload = () => {
            if (seq !== this.loadSeq || this.surface === null)
              return;
            this.natural = { width: img.naturalWidth, height: img.naturalHeight };
            setBound(this, "naturalWidth", img.naturalWidth);
            setBound(this, "naturalHeight", img.naturalHeight);
            if (!isSet(this, "width") && ownerOf(this, "width") === null) {
              setBound(this, "width", img.naturalWidth);
            }
            if (!isSet(this, "height") && ownerOf(this, "height") === null) {
              setBound(this, "height", img.naturalHeight);
            }
            setBound(this, "loaded", true);
            this.surface.setImage(img);
          };
          img.onerror = () => {
            if (seq !== this.loadSeq || this.surface === null)
              return;
            setBound(this, "failed", true);
          };
          img.src = resolveAsset(this.source);
        }
      };
      defineAttributes(Image, {
        source: { def: "", push: (i) => i.load() },
        stretches: { def: "none", push: (i, v) => i.surface?.setImageStretch(v) },
        tint: { def: null, push: (i, v) => i.surface?.setImageTint?.(v) },
        loaded: { def: false },
        failed: { def: false },
        naturalWidth: { def: 0 },
        naturalHeight: { def: 0 }
      });
    }
  });

  // runtime/dist/video.js
  var Video;
  var init_video = __esm({
    "runtime/dist/video.js"() {
      "use strict";
      init_view();
      init_attributes();
      init_image();
      Video = class extends View {
        /** Discards a superseded load: only the latest request may land. */
        loadSeq = 0;
        el = null;
        /** The frame's natural size — what contentExtent folds into an auto-extent. */
        natural = { width: 0, height: 0 };
        contentExtent(size) {
          return this.loaded ? this.natural[size] : 0;
        }
        attach(backend2, parentSurface) {
          super.attach(backend2, parentSurface);
          this.load();
        }
        flush(s) {
          super.flush(s);
          s.setImageStretch(this.stretches);
        }
        /** (Re)load `source` — at attach, and from the `source` pusher. */
        load() {
          const seq = ++this.loadSeq;
          const s = this.surface;
          if (s === null)
            return;
          setBound(this, "failed", false);
          setBound(this, "ended", false);
          if (this.source === "") {
            this.el = null;
            s.setImage(null);
            return;
          }
          if (typeof document === "undefined")
            return;
          const el = document.createElement("video");
          this.el = el;
          el.muted = this.muted;
          el.loop = this.loop;
          el.volume = this.volume;
          el.playbackRate = this.playbackRate;
          el.playsInline = true;
          el.preload = "metadata";
          el.onloadedmetadata = () => {
            if (seq !== this.loadSeq || this.surface === null)
              return;
            this.natural = { width: el.videoWidth, height: el.videoHeight };
            if (!isSet(this, "width") && ownerOf(this, "width") === null) {
              setBound(this, "width", el.videoWidth);
            }
            if (!isSet(this, "height") && ownerOf(this, "height") === null) {
              setBound(this, "height", el.videoHeight);
            }
            setBound(this, "duration", isFinite(el.duration) ? el.duration : 0);
            setBound(this, "loaded", true);
            this.surface.setImage(el);
            if (this.playing)
              this.syncPlaying();
          };
          el.onerror = () => {
            if (seq !== this.loadSeq || this.surface === null)
              return;
            setBound(this, "failed", true);
          };
          el.onplay = () => {
            if (seq !== this.loadSeq)
              return;
            setBound(this, "playing", true);
            setBound(this, "ended", false);
          };
          el.onpause = () => {
            if (seq === this.loadSeq)
              setBound(this, "playing", false);
          };
          el.onended = () => {
            if (seq !== this.loadSeq)
              return;
            setBound(this, "playing", false);
            setBound(this, "ended", true);
            fireEvent(this, "ended");
          };
          el.onwaiting = () => {
            if (seq === this.loadSeq)
              setBound(this, "buffering", true);
          };
          el.onplaying = () => {
            if (seq === this.loadSeq)
              setBound(this, "buffering", false);
          };
          el.ontimeupdate = () => {
            if (seq !== this.loadSeq)
              return;
            setBound(this, "position", el.currentTime);
          };
          el.src = resolveAsset(this.source);
        }
        /** Author (or constraint) asked to play or pause. `play()` can be REFUSED —
         *  autoplay policy, a source that never loaded — and it answers with a
         *  rejected promise. When it is refused the slot goes back to false, because
         *  a `playing` that reads true over a still picture is a lie. */
        syncPlaying() {
          const el = this.el;
          if (el === null)
            return;
          if (this.playing) {
            const p = el.play();
            if (p !== void 0 && typeof p.catch === "function") {
              p.catch(() => {
                if (this.el === el)
                  setBound(this, "playing", false);
              });
            }
          } else if (!el.paused) {
            el.pause();
          }
        }
        /** Author asked to seek. Guarded by a quarter-second so the runtime's own
         *  `timeupdate` writes — which land in this same slot — cannot bounce back
         *  out as seeks and stutter the playhead. */
        seek() {
          const el = this.el;
          if (el === null)
            return;
          if (Math.abs(el.currentTime - this.position) > 0.25)
            el.currentTime = this.position;
        }
      };
      defineAttributes(Video, {
        source: { def: "", push: (v) => v.load() },
        stretches: { def: "none", push: (v, s) => v.surface?.setImageStretch(s) },
        playing: { def: false, push: (v) => v.syncPlaying() },
        loop: { def: false, push: (v, on) => {
          const e = v.el;
          if (e !== null)
            e.loop = on;
        } },
        muted: { def: true, push: (v, on) => {
          const e = v.el;
          if (e !== null)
            e.muted = on;
        } },
        position: { def: 0, push: (v) => v.seek() },
        volume: { def: 1, push: (v, n) => {
          const e = v.el;
          if (e !== null)
            e.volume = n;
        } },
        playbackRate: { def: 1, push: (v, n) => {
          const e = v.el;
          if (e !== null)
            e.playbackRate = n;
        } },
        ended: { def: false },
        duration: { def: 0 },
        buffering: { def: false },
        loaded: { def: false },
        failed: { def: false }
      });
    }
  });

  // runtime/dist/text-input.js
  var TextInput;
  var init_text_input = __esm({
    "runtime/dist/text-input.js"() {
      "use strict";
      init_view();
      init_attributes();
      init_reactive();
      init_focus();
      init_editor();
      init_value();
      TextInput = class extends Editor {
        // The editor session (commitOn / error / valid / dirty + commit()/revert())
        // is inherited from Editor; `text` is this editor's draft slot.
        draftSlot() {
          return "text";
        }
        attach(backend2, parentSurface) {
          if (!isSet(this, "focusable") && ownerOf(this, "focusable") === null)
            this.focusable = true;
          super.attach(backend2, parentSurface);
          if (!isSet(this, "text") && ownerOf(this, "text") === null) {
            bindDerived(this, "text", () => this.initial);
          }
          const tok = (name, fallback) => {
            const v = this.theme?.[name];
            return typeof v === "number" ? v : fallback;
          };
          if (!isSet(this, "fill") && ownerOf(this, "fill") === null)
            bindDerived(this, "fill", () => tok("surface", 16777215));
          if (!isSet(this, "stroke") && ownerOf(this, "stroke") === null)
            bindDerived(this, "stroke", () => stroke(1, this.focused ? tok("accent", 3043296) : tok("line", 14410217)));
          if (!isSet(this, "cornerRadius") && ownerOf(this, "cornerRadius") === null)
            bindDerived(this, "cornerRadius", () => tok("fieldRadius", tok("controlRadius", 7)));
          if (!isSet(this, "padding") && ownerOf(this, "padding") === null)
            bindDerived(this, "padding", () => tok("fieldPadding", 10));
        }
        flush(s) {
          super.flush(s);
          const style = new Constraint("TextInput.editStyle", () => this.editStyle(), () => this.syncEditable(), 0);
          style.run();
          onDiscard(this, () => style.dispose());
          this.syncEditable();
        }
        editStyle() {
          return {
            fontFamily: this.fontFamily,
            fontSize: this.fontSize,
            fontWeight: this.fontWeight,
            letterSpacing: this.letterSpacing,
            color: this.textColor,
            shadow: null
          };
        }
        /** Push the whole editable spec across the seam — value, style, callbacks.
         *  Idempotent and cheap; called on any model change (text/placeholder/
         *  multiline pushes, the style derive) and at flush. */
        syncEditable() {
          const s = this.surface;
          if (s === void 0 || s === null)
            return;
          const spec = {
            value: this.text,
            multiline: this.multiline,
            spellcheck: this.spellcheck,
            wrap: this.wrap,
            padding: this.padding,
            placeholder: this.placeholder,
            style: this.editStyle(),
            onInput: (v) => this.onNativeInput(v),
            // The native element ECHOES focus the runtime just gave it (Tab →
            // focusChanged → el.focus() → this event). Re-announcing the already-
            // focused view through Focus.focus() would clear keyboard modality —
            // every Tab into a field cancelling its own focus-visible state — so
            // the echo is silenced HERE, at its source; a genuine first focus from
            // the element (a click into the field) still claims normally.
            onFocus: () => {
              if (Focus.getFocus() !== this)
                Focus.focus(this);
            },
            onBlur: () => {
              if (Focus.getFocus() === this)
                Focus.blur();
              if (this.commitOn === "blur" && isTwoWay(this, "text"))
                commitDraft(this, "text");
            },
            onEnter: () => {
              if (this.commitOn === "enter" && isTwoWay(this, "text"))
                commitDraft(this, "text");
              fireEvent(this, "enter");
            }
          };
          s.setEditable(spec);
        }
        /** The native element's value changed. A writable `text` takes the edit; a
         *  HARD constraint makes text a controlled, read-only field — revert the
         *  element to the model. A YIELDING default (a `{ }` the field merely STARTS
         *  from — a theme value, a pristine source) is overridable: the edit disposes
         *  it, exactly like any author write (attributes.ts set path), so a field can
         *  be seeded from a binding yet stay editable. */
        onNativeInput(v) {
          const owner = ownerOf(this, "text");
          if (owner !== null && !owner.yielding) {
            fireEvent(this, "input", v);
            settle();
            this.syncEditable();
            return;
          }
          if (this.text !== v)
            this.text = v;
          if (isTwoWay(this, "text"))
            edited(this, "text", this.commitOn);
          fireEvent(this, "input", v);
        }
        /** Declare focus arrived/left — give or take the platform caret (Layer 2 hook,
         *  separate from the author's onFocus/onBlur). */
        focusChanged(focused) {
          this.focused = focused;
          this.surface?.activateEditable(focused);
        }
      };
      defineAttributes(TextInput, {
        text: { def: "", push: (t) => t.syncEditable() },
        placeholder: { def: "", push: (t) => t.syncEditable() },
        multiline: { def: false, push: (t) => t.syncEditable() },
        spellcheck: { def: true, push: (t) => t.syncEditable() },
        wrap: { def: true, push: (t) => t.syncEditable() },
        padding: { def: 0, push: (t) => t.syncEditable() },
        initial: { def: "" },
        focused: { def: false }
        // commitOn / error / valid / dirty are declared on the Editor base.
      });
    }
  });

  // runtime/dist/md.js
  function parse(src) {
    const lines = src.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
    return parseBlocks(lines, 0, lines.length);
  }
  function parseBlocks(lines, lo, hi) {
    const out = [];
    let i = lo;
    while (i < hi) {
      const line = lines[i];
      if (line.trim() === "") {
        i++;
        continue;
      }
      if (line.trimStart().startsWith("<!--")) {
        let j2 = i, k = line.indexOf("-->", line.indexOf("<!--") + 4);
        while (k === -1 && ++j2 < hi)
          k = lines[j2].indexOf("-->");
        if (j2 >= hi)
          break;
        const rest = lines[j2].slice(k + 3);
        if (rest.trim() !== "") {
          lines[j2] = rest;
          i = j2;
        } else
          i = j2 + 1;
        continue;
      }
      if (RE_RULE.test(line)) {
        out.push({ t: "rule" });
        i++;
        continue;
      }
      const atx = RE_ATX.exec(line);
      if (atx) {
        out.push({ t: "heading", level: atx[1].length, inline: parseInline(atx[2]) });
        i++;
        continue;
      }
      const fence = RE_FENCE.exec(line);
      if (fence) {
        const marker = fence[1][0];
        const body = [];
        let j2 = i + 1;
        for (; j2 < hi; j2++) {
          if (lines[j2].trimStart().startsWith(marker.repeat(3)) && lines[j2].trim().replace(new RegExp(`^\\${marker}+`), "").trim() === "")
            break;
          body.push(lines[j2]);
        }
        out.push({ t: "code", lang: fence[2].trim(), text: body.join("\n") });
        i = j2 < hi ? j2 + 1 : j2;
        continue;
      }
      if (/^ {4}/.test(line)) {
        const body = [];
        let j2 = i;
        for (; j2 < hi; j2++) {
          if (lines[j2].trim() === "") {
            body.push("");
            continue;
          }
          if (!/^ {4}/.test(lines[j2]))
            break;
          body.push(lines[j2].slice(4));
        }
        while (body.length && body[body.length - 1] === "")
          body.pop();
        out.push({ t: "code", lang: "", text: body.join("\n") });
        i = j2;
        continue;
      }
      if (RE_QUOTE.test(line)) {
        const inner = [];
        let j2 = i;
        for (; j2 < hi; j2++) {
          const q = RE_QUOTE.exec(lines[j2]);
          if (q)
            inner.push(q[1]);
          else if (lines[j2].trim() === "")
            break;
          else
            inner.push(lines[j2]);
        }
        out.push({ t: "blockquote", blocks: parseBlocks(inner, 0, inner.length) });
        i = j2;
        continue;
      }
      if (line.includes("|") && i + 1 < hi && isTableDelim(lines[i + 1])) {
        const align = parseAlignRow(lines[i + 1]);
        const header = splitRow(line).map(parseInline);
        const rows2 = [];
        let j2 = i + 2;
        for (; j2 < hi && lines[j2].includes("|") && lines[j2].trim() !== ""; j2++) {
          rows2.push(splitRow(lines[j2]).map(parseInline));
        }
        out.push({ t: "table", align, header, rows: rows2 });
        i = j2;
        continue;
      }
      const bullet = RE_BULLET.exec(line);
      const ordered = RE_ORDERED.exec(line);
      if (bullet || ordered) {
        const [list, next] = parseList(lines, i, hi);
        out.push(list);
        i = next;
        continue;
      }
      const para = [];
      let j = i;
      for (; j < hi; j++) {
        const l = lines[j];
        if (l.trim() === "")
          break;
        if (RE_RULE.test(l) || RE_ATX.test(l) || RE_FENCE.test(l) || RE_QUOTE.test(l) || RE_BULLET.test(l) || RE_ORDERED.test(l))
          break;
        para.push(l.trim());
      }
      out.push({ t: "paragraph", inline: parseInline(para.join("\n")) });
      i = j;
    }
    return out;
  }
  function parseList(lines, start, hi) {
    const first = RE_BULLET.exec(lines[start]) ?? RE_ORDERED.exec(lines[start]);
    const ordered = !RE_BULLET.test(lines[start]);
    const startNum = ordered ? parseInt(RE_ORDERED.exec(lines[start])[2], 10) : 1;
    const baseIndent = first[1].length;
    const items = [];
    let i = start;
    while (i < hi) {
      const m = RE_BULLET.exec(lines[i]) ?? RE_ORDERED.exec(lines[i]);
      if (!m || m[1].length !== baseIndent || RE_BULLET.test(lines[i]) === ordered)
        break;
      const owned = [m[3]];
      let j = i + 1;
      const contIndent = baseIndent + (lines[i].length - lines[i].trimStart().length === baseIndent ? m[2].length + 1 : 2);
      let blanked = false;
      for (; j < hi; j++) {
        if (lines[j].trim() === "") {
          owned.push("");
          blanked = true;
          continue;
        }
        const indent = lines[j].length - lines[j].trimStart().length;
        const isMarker = RE_BULLET.test(lines[j]) || RE_ORDERED.test(lines[j]);
        if (isMarker && indent <= baseIndent)
          break;
        if (blanked && indent < contIndent)
          break;
        owned.push(lines[j].slice(Math.min(indent, contIndent)));
      }
      while (owned.length && owned[owned.length - 1] === "")
        owned.pop();
      let task = null;
      const tk = RE_TASK.exec(owned[0] ?? "");
      if (tk) {
        task = tk[1].toLowerCase() === "x";
        owned[0] = tk[2];
      }
      items.push({ task, blocks: parseBlocks(owned, 0, owned.length) });
      i = j;
    }
    return [{ t: "list", ordered, start: startNum, items }, i];
  }
  function isTableDelim(line) {
    return /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(line) && line.includes("-");
  }
  function parseAlignRow(line) {
    return splitRawRow(line).map((c) => {
      const s = c.trim();
      const l = s.startsWith(":"), r = s.endsWith(":");
      return l && r ? "center" : r ? "right" : l ? "left" : null;
    });
  }
  function splitRow(line) {
    return splitRawRow(line).map((c) => c.trim());
  }
  function splitRawRow(line) {
    const cells = [];
    let cur = "";
    for (let i = 0; i < line.length; i++) {
      if (line[i] === "\\" && line[i + 1] === "|") {
        cur += "|";
        i++;
        continue;
      }
      if (line[i] === "|") {
        cells.push(cur);
        cur = "";
        continue;
      }
      cur += line[i];
    }
    cells.push(cur);
    if (cells.length && cells[0].trim() === "")
      cells.shift();
    if (cells.length && cells[cells.length - 1].trim() === "")
      cells.pop();
    return cells;
  }
  function parseInline(src) {
    const out = [];
    let buf = "";
    const flush = () => {
      if (buf !== "") {
        out.push({ t: "text", value: decodeEntities(buf) });
        buf = "";
      }
    };
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === "\\") {
        if (i + 1 < src.length && PUNCT.has(src[i + 1])) {
          buf += src[i + 1];
          i += 2;
          continue;
        }
        if (src[i + 1] === "\n") {
          flush();
          out.push({ t: "br" });
          i += 2;
          continue;
        }
      }
      if (c === "`") {
        let n = 0;
        while (src[i + n] === "`")
          n++;
        const close = src.indexOf("`".repeat(n), i + n);
        const afterClose = close + n;
        if (close !== -1 && (src[afterClose] !== "`" || n === countBackticksAt(src, close))) {
          flush();
          out.push({ t: "code", value: src.slice(i + n, close).replace(/^ | $/g, "") });
          i = afterClose;
          continue;
        }
      }
      if (c === "[") {
        const close = matchBracket(src, i);
        if (close !== -1 && src[close + 1] === "(") {
          const end = src.indexOf(")", close + 2);
          if (end !== -1) {
            flush();
            const href = src.slice(close + 2, end).trim();
            out.push({ t: "link", href, inline: parseInline(src.slice(i + 1, close)) });
            i = end + 1;
            continue;
          }
        }
      }
      if (c === "<") {
        if (src.startsWith("<!--", i)) {
          const close = src.indexOf("-->", i + 4);
          i = close === -1 ? src.length : close + 3;
          continue;
        }
        const gt = src.indexOf(">", i + 1);
        if (gt !== -1) {
          const url = src.slice(i + 1, gt);
          if (/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(url) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) {
            flush();
            const href = url.includes("@") && !url.includes(":") ? "mailto:" + url : url;
            out.push({ t: "link", href, inline: [{ t: "text", value: url }] });
            i = gt + 1;
            continue;
          }
        }
      }
      const delim = c === "~" ? "~~" : c === "*" || c === "_" ? src[i + 1] === c ? c + c : c : "";
      if (delim && (c !== "~" || src[i + 1] === "~")) {
        const kind = delim.length === 2 ? c === "~" ? "strike" : "strong" : "em";
        const close = findCloser(src, i + delim.length, delim);
        if (close !== -1) {
          flush();
          const inner = parseInline(src.slice(i + delim.length, close));
          out.push({ t: kind, inline: inner });
          i = close + delim.length;
          continue;
        }
      }
      if (c === "\n") {
        if (buf.endsWith("  ")) {
          buf = buf.replace(/ +$/, "");
          flush();
          out.push({ t: "br" });
        } else {
          flush();
          buf = " ";
          flush();
        }
        i++;
        continue;
      }
      buf += c;
      i++;
    }
    flush();
    return out;
  }
  function countBackticksAt(s, at) {
    let n = 0;
    while (s[at + n] === "`")
      n++;
    return n;
  }
  function matchBracket(s, open) {
    let depth = 0;
    for (let i = open; i < s.length; i++) {
      if (s[i] === "\\") {
        i++;
        continue;
      }
      if (s[i] === "[")
        depth++;
      else if (s[i] === "]" && --depth === 0)
        return i;
    }
    return -1;
  }
  function findCloser(s, from, delim) {
    const ch = delim[0];
    for (let i = from; i < s.length; i++) {
      if (s[i] === "\\") {
        i++;
        continue;
      }
      if (s[i] === "`") {
        const c = s.indexOf("`", i + 1);
        if (c !== -1) {
          i = c;
          continue;
        }
      }
      if (s.startsWith(delim, i)) {
        if (delim.length === 1 && (s[i + 1] === ch || s[i - 1] === ch))
          continue;
        if (i === from)
          continue;
        return i;
      }
    }
    return -1;
  }
  function decodeEntities(s) {
    if (s.indexOf("&") === -1)
      return s;
    return s.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (m, body) => {
      if (body[0] === "#") {
        const cp = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        return Number.isFinite(cp) && cp > 0 && cp <= 1114111 ? String.fromCodePoint(cp) : m;
      }
      return NAMED[body.toLowerCase()] ?? m;
    });
  }
  var RE_ATX, RE_FENCE, RE_RULE, RE_BULLET, RE_ORDERED, RE_QUOTE, RE_TASK, PUNCT, NAMED;
  var init_md = __esm({
    "runtime/dist/md.js"() {
      "use strict";
      RE_ATX = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
      RE_FENCE = /^(```+|~~~+)\s*([^`]*)$/;
      RE_RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
      RE_BULLET = /^(\s*)([-*+])\s+(.*)$/;
      RE_ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
      RE_QUOTE = /^\s*>\s?(.*)$/;
      RE_TASK = /^\[([ xX])\]\s+(.*)$/;
      PUNCT = new Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~".split(""));
      NAMED = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
        nbsp: "\xA0",
        copy: "\xA9",
        reg: "\xAE",
        trade: "\u2122",
        hellip: "\u2026",
        mdash: "\u2014",
        ndash: "\u2013",
        laquo: "\xAB",
        raquo: "\xBB",
        ldquo: "\u201C",
        rdquo: "\u201D",
        lsquo: "\u2018",
        rsquo: "\u2019",
        times: "\xD7",
        divide: "\xF7",
        deg: "\xB0",
        plusmn: "\xB1",
        middot: "\xB7",
        bull: "\u2022"
      };
    }
  });

  // runtime/dist/slug.js
  function headingSlug(text) {
    return text.toLowerCase().replace(/[^a-z0-9 -]+/g, "").trim().replace(/[\s-]+/g, "-").replace(/^-+|-+$/g, "");
  }
  var init_slug = __esm({
    "runtime/dist/slug.js"() {
      "use strict";
    }
  });

  // runtime/dist/html.js
  function unsupported(tag) {
    return new Error(`HTMLText: unsupported tag <${tag}> \u2014 supported: ${SUPPORTED_TAGS.join(", ")}`);
  }
  function buildTree(src, policy) {
    const root = { tag: "", attrs: {}, kids: [] };
    const stack = [];
    const target = () => {
      for (let k = stack.length - 1; k >= 0; k--)
        if (stack[k].el)
          return stack[k].el;
      return root;
    };
    const inPre = () => stack.some((f) => f.tag === "pre");
    const pushText = (raw) => {
      if (raw === "")
        return;
      const text = inPre() ? decodeEntities(raw) : decodeEntities(raw).replace(/\s+/g, " ");
      if (text !== "")
        target().kids.push({ text });
    };
    let i = 0;
    const n = src.length;
    while (i < n) {
      const lt = src.indexOf("<", i);
      if (lt === -1) {
        pushText(src.slice(i));
        break;
      }
      if (lt > i)
        pushText(src.slice(i, lt));
      if (src.startsWith("<!--", lt)) {
        const e = src.indexOf("-->", lt + 4);
        i = e === -1 ? n : e + 3;
        continue;
      }
      if (src[lt + 1] === "!" || src[lt + 1] === "?") {
        const gt2 = src.indexOf(">", lt);
        i = gt2 === -1 ? n : gt2 + 1;
        continue;
      }
      const gt = src.indexOf(">", lt);
      if (gt === -1) {
        pushText(src.slice(lt));
        break;
      }
      const raw = src.slice(lt + 1, gt);
      if (raw[0] === "/") {
        const tag2 = raw.slice(1).trim().toLowerCase();
        for (let k = stack.length - 1; k >= 0; k--)
          if (stack[k].tag === tag2) {
            stack.length = k;
            break;
          }
        i = gt + 1;
        continue;
      }
      const selfClose = raw.endsWith("/");
      const { tag, attrs } = parseTag(selfClose ? raw.slice(0, -1) : raw);
      if (tag === "") {
        pushText(src.slice(lt, gt + 1));
        i = gt + 1;
        continue;
      }
      if (RAWTEXT.has(tag)) {
        if (policy === "error")
          throw unsupported(tag);
        const close = src.toLowerCase().indexOf(`</${tag}>`, gt + 1);
        i = close === -1 ? n : close + tag.length + 3;
        continue;
      }
      if (!known(tag)) {
        if (policy === "error")
          throw unsupported(tag);
        if (!selfClose)
          stack.push({ tag, el: null });
        i = gt + 1;
        continue;
      }
      const el = { tag, attrs, kids: [] };
      target().kids.push(el);
      if (!selfClose && !VOID.has(tag))
        stack.push({ tag, el });
      i = gt + 1;
    }
    return root;
  }
  function parseTag(inner) {
    const m = inner.match(/^\s*([a-zA-Z][a-zA-Z0-9]*)/);
    if (!m)
      return { tag: "", attrs: {} };
    const tag = m[1].toLowerCase();
    const attrs = {};
    const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let mm;
    const rest = inner.slice(m[0].length);
    while ((mm = re.exec(rest)) !== null)
      attrs[mm[1].toLowerCase()] = decodeEntities(mm[2] ?? mm[3] ?? mm[4] ?? "");
    return { tag, attrs };
  }
  function textOf(el) {
    let s = "";
    for (const k of el.kids)
      s += "text" in k ? k.text : textOf(k);
    return s;
  }
  function trimLeadingNewline(inline) {
    const first = inline[0];
    if (first && first.t === "text" && first.value.startsWith("\n")) {
      const v = first.value.slice(1);
      return v === "" ? inline.slice(1) : [{ t: "text", value: v }, ...inline.slice(1)];
    }
    return inline;
  }
  function inlineOf(kids) {
    const out = [];
    for (const k of kids) {
      if ("text" in k) {
        out.push({ t: "text", value: k.text });
        continue;
      }
      switch (k.tag) {
        case "b":
        case "strong":
          out.push({ t: "strong", inline: inlineOf(k.kids) });
          break;
        case "i":
        case "em":
          out.push({ t: "em", inline: inlineOf(k.kids) });
          break;
        case "s":
        case "strike":
        case "del":
          out.push({ t: "strike", inline: inlineOf(k.kids) });
          break;
        case "code":
          out.push({ t: "code", value: textOf(k) });
          break;
        case "a":
          out.push({ t: "link", href: k.attrs.href ?? "", inline: inlineOf(k.kids) });
          break;
        case "br":
          out.push({ t: "br" });
          break;
        // A classed span carries a NAMED accent (resolved to a themed fill by the
        // flow engine against the component's `accents`); an unknown/absent class
        // just unwraps. This is the one styling hook — reference-only, no CSS.
        case "span":
          k.attrs.class ? out.push({ t: "fill", name: k.attrs.class.trim(), inline: inlineOf(k.kids) }) : out.push(...inlineOf(k.kids));
          break;
        default:
          for (const b of blocksOf([k]))
            if (b.t === "paragraph" || b.t === "heading")
              out.push(...b.inline);
      }
    }
    return out;
  }
  function blockOf(el) {
    const tag = el.tag;
    if (tag === "p")
      return [{ t: "paragraph", inline: inlineOf(el.kids) }];
    if (/^h[1-6]$/.test(tag))
      return [{ t: "heading", level: +tag[1], inline: inlineOf(el.kids) }];
    if (tag === "hr")
      return [{ t: "rule" }];
    if (tag === "blockquote")
      return [{ t: "blockquote", blocks: blocksOf(el.kids) }];
    if (tag === "pre")
      return [{ t: "pre", inline: trimLeadingNewline(inlineOf(el.kids)) }];
    if (tag === "div")
      return blocksOf(el.kids);
    if (tag === "ul" || tag === "ol") {
      const ordered = tag === "ol";
      const start = ordered ? parseInt(el.attrs.start ?? "1", 10) || 1 : 1;
      const items = [];
      for (const c of el.kids)
        if (!("text" in c) && c.tag === "li")
          items.push({ task: null, blocks: blocksOf(c.kids) });
      return [{ t: "list", ordered, start, items }];
    }
    return [];
  }
  function blocksOf(kids) {
    const out = [];
    let buf = [];
    const flush = () => {
      if (buf.length === 0)
        return;
      const inl = inlineOf(buf);
      buf = [];
      if (inl.length === 0)
        return;
      if (inl.length === 1 && inl[0].t === "text" && inl[0].value.trim() === "")
        return;
      out.push({ t: "paragraph", inline: inl });
    };
    for (const k of kids) {
      if ("text" in k)
        buf.push(k);
      else if (BLOCK.has(k.tag)) {
        flush();
        out.push(...blockOf(k));
      } else
        buf.push(k);
    }
    flush();
    return out;
  }
  function parseHtml(src, policy = "strip") {
    return blocksOf(buildTree(src, policy).kids);
  }
  var INLINE, BLOCK, VOID, RAWTEXT, SUPPORTED_TAGS, known;
  var init_html = __esm({
    "runtime/dist/html.js"() {
      "use strict";
      init_md();
      INLINE = /* @__PURE__ */ new Set(["b", "strong", "i", "em", "code", "s", "strike", "del", "a", "span", "br"]);
      BLOCK = /* @__PURE__ */ new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol", "li", "pre", "hr", "div"]);
      VOID = /* @__PURE__ */ new Set(["br", "hr"]);
      RAWTEXT = /* @__PURE__ */ new Set(["script", "style"]);
      SUPPORTED_TAGS = [.../* @__PURE__ */ new Set([...BLOCK, ...INLINE])].sort();
      known = (tag) => INLINE.has(tag) || BLOCK.has(tag);
    }
  });

  // runtime/dist/markdown.js
  function geoFor(t) {
    const d = LAYOUT.default ?? {};
    const own2 = LAYOUT[t] ?? (t === "pre" ? LAYOUT.code : void 0) ?? {};
    const margin = own2.margin ?? d.margin ?? [0, 0];
    return {
      maxWidth: own2.maxWidth ?? d.maxWidth ?? 0,
      ml: margin[0] ?? 0,
      mr: margin[1] ?? 0,
      align: own2.align ?? d.align ?? "left"
    };
  }
  function contentWidth(width, g) {
    const track = Math.max(0, width - g.ml - g.mr);
    return g.maxWidth > 0 ? Math.min(track, g.maxWidth) : track;
  }
  function placeX(width, cw, g) {
    if (g.align === "center")
      return g.ml + (width - g.ml - g.mr - cw) / 2;
    if (g.align === "right")
      return width - g.mr - cw;
    return g.ml;
  }
  function resolveAccent(name) {
    if (name in ACCENTS)
      return ACCENTS[name];
    for (const tok of name.split(/\s+/))
      if (tok in ACCENTS)
        return ACCENTS[tok];
    return void 0;
  }
  function base(size, weight, color, tracking = 0) {
    return { size: sz(size), weight, italic: false, mono: false, strike: false, color, tracking };
  }
  function flatten(ns, style, out) {
    for (const n of ns) {
      switch (n.t) {
        case "text":
          out.push({ text: n.value, style });
          break;
        case "code":
          out.push({ text: n.value, style: { ...style, mono: true, color: CODEC } });
          break;
        case "br":
          out.push({ br: true });
          break;
        case "strong":
          flatten(n.inline, { ...style, weight: "bold" }, out);
          break;
        case "em":
          flatten(n.inline, { ...style, italic: true }, out);
          break;
        case "strike":
          flatten(n.inline, { ...style, strike: true }, out);
          break;
        case "link":
          flatten(n.inline, { ...style, color: LINKC, link: n.href }, out);
          break;
        case "fill": {
          const f = resolveAccent(n.name);
          flatten(n.inline, f !== void 0 ? { ...style, fill: f } : style, out);
          break;
        }
      }
    }
  }
  function textView(width, size, color, weight, body) {
    const t = new Text();
    t.width = width;
    t.fontSize = size;
    t.textColor = color;
    t.fontWeight = weight;
    t.text = body;
    return t;
  }
  function rectView(width, height, fill, radius = 0) {
    const v = new View();
    v.width = width;
    v.height = height;
    v.fill = fill;
    if (radius)
      v.cornerRadius = radius;
    return v;
  }
  function setClick(v, fn) {
    v.onClick = fn;
  }
  function rectAt(x, y, w, h, fill) {
    const v = rectView(w, h, fill);
    v.x = x;
    v.y = y;
    return v;
  }
  function richRunsOf(inline, style, family) {
    const atoms = [];
    flatten(inline, style, atoms);
    return atoms.map((a) => {
      if ("br" in a)
        return { br: true };
      const s = a.style;
      const run = {
        text: a.text,
        size: s.size,
        weight: s.weight,
        italic: s.italic,
        family: s.mono ? CODEFAM : family,
        strike: s.strike,
        color: s.color,
        tracking: s.tracking
      };
      if (s.link !== void 0)
        run.href = s.link;
      if (s.fill !== void 0)
        run.fill = s.fill;
      return run;
    });
  }
  function flowRichCanvas(blocks, width, onLink) {
    const views = [];
    const anchors = /* @__PURE__ */ new Map();
    let y = 0;
    for (const b of blocks) {
      y += b.gapBefore;
      if (b.anchor !== void 0 && !anchors.has(b.anchor))
        anchors.set(b.anchor, y);
      const lead = b.runs.find((r) => "text" in r);
      const bm = fontMetrics(fontString({ fontFamily: lead?.family ?? FALLBACK_FAMILY, fontSize: lead?.size ?? sz(PROSE.body), fontWeight: lead?.weight ?? "normal" }));
      const lineH = Math.ceil(bm.ascent + bm.descent);
      const adv = Math.round(b.fontSize * b.lineHeight);
      const halfLead = Math.round((adv - lineH) / 2);
      const spaceFont = fontString({ fontFamily: lead?.family ?? FALLBACK_FAMILY, fontSize: lead?.size ?? sz(PROSE.body), fontWeight: "normal" });
      const spaceW = textWidth(" ", spaceFont);
      if (b.pre) {
        let px = 0, ln = 0;
        for (const r of b.runs) {
          if ("br" in r) {
            ln++;
            px = 0;
            continue;
          }
          const f = fontString({ fontFamily: r.family, fontSize: r.size, fontWeight: r.weight, italic: r.italic });
          const segs = r.text.split("\n");
          for (let si = 0; si < segs.length; si++) {
            if (si > 0) {
              ln++;
              px = 0;
            }
            const seg = segs[si];
            if (seg === "")
              continue;
            const w = textWidth(seg, f, r.tracking);
            const t = new Text();
            t.x = px;
            t.y = y + ln * adv + halfLead;
            t.width = Math.ceil(w) + 2;
            t.wrap = false;
            t.fontSize = r.size;
            t.fontWeight = r.weight;
            t.italic = r.italic;
            t.fontFamily = r.family;
            t.textColor = r.color;
            t.text = seg;
            if (r.tracking !== 0)
              t.letterSpacing = r.tracking;
            if (r.fill !== void 0)
              t.textFill = r.fill;
            if (r.href !== void 0 && onLink) {
              const href = r.href;
              setClick(t, () => onLink(href));
            }
            views.push(t);
            px += w;
          }
        }
        y += (ln + 1) * adv;
        continue;
      }
      const toks = [];
      let word = [];
      const flush = () => {
        if (word.length) {
          toks.push({ word });
          word = [];
        }
      };
      for (const r of b.runs) {
        if ("br" in r) {
          flush();
          toks.push({ br: true });
          continue;
        }
        const f = fontString({ fontFamily: r.family, fontSize: r.size, fontWeight: r.weight, italic: r.italic });
        for (const part of r.text.split(/(\s+)/)) {
          if (part === "")
            continue;
          if (/^\s+$/.test(part)) {
            flush();
            const last = toks[toks.length - 1];
            if (last && "word" in last)
              toks.push({ sp: true });
          } else
            word.push({ text: part, run: r, w: textWidth(part, f, r.tracking) });
        }
      }
      flush();
      const blockViews = [];
      const lineRight = /* @__PURE__ */ new Map();
      let x = 0, line = 0, pending = false;
      let group = null;
      const flushGroup = () => {
        if (group === null)
          return;
        const g = group;
        group = null;
        const r = g.run;
        const t = new Text();
        t.x = g.x0;
        t.y = g.y;
        t.width = Math.ceil(g.end - g.x0) + 2;
        t.wrap = false;
        t.fontSize = r.size;
        t.fontWeight = r.weight;
        t.italic = r.italic;
        t.fontFamily = r.family;
        t.textColor = r.color;
        t.text = g.parts.join("");
        if (r.tracking !== 0)
          t.letterSpacing = r.tracking;
        if (r.fill !== void 0)
          t.textFill = r.fill;
        if (r.href !== void 0 && onLink) {
          const href = r.href;
          setClick(t, () => onLink(href));
        }
        blockViews.push({ v: t, line: g.line });
      };
      for (const tok of toks) {
        if ("br" in tok) {
          flushGroup();
          line++;
          x = 0;
          pending = false;
          continue;
        }
        if ("sp" in tok) {
          pending = true;
          continue;
        }
        const ww = tok.word.reduce((s, p) => s + p.w, 0);
        const gap = pending && x > 0 ? spaceW : 0;
        if (x + gap + ww > width && x > 0) {
          flushGroup();
          line++;
          x = 0;
        } else
          x += gap;
        pending = false;
        let first = true;
        for (const p of tok.word) {
          const py = y + line * adv + halfLead, r = p.run;
          const plain = r.chipBg === void 0 && !r.strike && fontString({ fontFamily: r.family, fontSize: r.size, fontWeight: r.weight, italic: r.italic }) === spaceFont;
          if (group !== null && (!plain || group.run !== r || group.line !== line))
            flushGroup();
          if (plain) {
            if (group === null)
              group = { run: r, x0: x, y: py, line, parts: [], end: x };
            else if (first && gap > 0)
              group.parts.push(" ");
            group.parts.push(p.text);
            x += p.w;
            group.end = x;
          } else {
            const t = new Text();
            if (r.chipBg !== void 0) {
              const c = rectView(Math.ceil(p.w) + 6, lineH, r.chipBg, 3);
              c.x = x - 3;
              c.y = py;
              blockViews.push({ v: c, line });
            }
            t.x = x;
            t.y = py;
            t.width = Math.ceil(p.w) + 2;
            t.wrap = false;
            t.fontSize = r.size;
            t.fontWeight = r.weight;
            t.italic = r.italic;
            t.fontFamily = r.family;
            t.textColor = r.color;
            t.text = p.text;
            if (r.tracking !== 0)
              t.letterSpacing = r.tracking;
            if (r.fill !== void 0)
              t.textFill = r.fill;
            if (r.href !== void 0 && onLink) {
              const href = r.href;
              setClick(t, () => onLink(href));
            }
            blockViews.push({ v: t, line });
            if (r.strike)
              blockViews.push({ v: rectAt(x, py + Math.round(r.size * 0.55), Math.ceil(p.w), 1, r.color), line });
            x += p.w;
          }
          lineRight.set(line, x);
          first = false;
        }
      }
      flushGroup();
      if (b.align === "center" || b.align === "right") {
        for (const { v, line: ln } of blockViews) {
          const free = width - (lineRight.get(ln) ?? 0);
          if (free > 0)
            v.x += b.align === "center" ? free / 2 : free;
        }
      }
      for (const { v } of blockViews)
        views.push(v);
      y += (line + 1) * adv;
    }
    return { views, height: y, anchors };
  }
  function yStack(spacing) {
    const s = new ProseStack();
    s.spacing = spacing;
    return s;
  }
  function flowView(content, width, ctx) {
    const rt = new TextFlow();
    rt.width = width;
    rt.flowWidth = width;
    rt.content = content;
    rt.onLink = ctx.onLink;
    setRewidth(rt, (w) => rt.reflow(w));
    return rt;
  }
  function setRewidth(v, f) {
    REWIDTH.set(v, f);
    return v;
  }
  function inlineText(inline) {
    let s = "";
    for (const n of inline) {
      if (n.t === "text" || n.t === "code")
        s += n.value;
      else if (n.t === "br")
        s += " ";
      else
        s += inlineText(n.inline);
    }
    return s;
  }
  function proseBlock(b, gapBefore, bodyColor, ctx) {
    if (b.t === "heading") {
      const size = PROSE.heading[b.level - 1];
      return { tag: `h${b.level}`, runs: richRunsOf(b.inline, base(size, HEADINGW, HEADINGC), ctx.family), gapBefore, lineHeight: 1.2, fontSize: sz(size), anchor: headingSlug(inlineText(b.inline)) || void 0 };
    }
    return { tag: "p", runs: richRunsOf(b.inline, base(BODY.size, BODY.weight, bodyColor, BODY.tracking), ctx.family), gapBefore, lineHeight: ctx.lead, fontSize: sz(BODY.size) };
  }
  function layoutBlocks(blocks, width, bodyColor, ctx) {
    const out = [];
    let group = [];
    let prevProse = null;
    let groupGeo = null;
    const flush = () => {
      if (group.length && groupGeo) {
        const cw = contentWidth(width, groupGeo);
        const v = flowView(group, cw, ctx);
        v.x = placeX(width, cw, groupGeo);
        out.push({ view: v, geo: groupGeo });
      }
      group = [];
      prevProse = null;
      groupGeo = null;
    };
    for (const b of blocks) {
      if (b.t === "paragraph" || b.t === "heading") {
        const g2 = geoFor(b.t);
        if (group.length && groupGeo && !geoEqual(groupGeo, g2))
          flush();
        const gap = group.length === 0 ? 0 : b.t === "heading" ? PROSE.headingGap[b.level - 1] : prevProse === "heading" ? PROSE.headingBelow : PROSE.blockGap;
        group.push(proseBlock(b, gap, bodyColor, ctx));
        prevProse = b.t;
        groupGeo = g2;
        continue;
      }
      flush();
      const g = geoFor(b.t);
      const cw = contentWidth(width, g);
      let v = null;
      switch (b.t) {
        case "list":
          v = buildList(b, cw, bodyColor, ctx);
          break;
        case "table":
          v = buildTable(b, cw, bodyColor, ctx);
          break;
        case "blockquote":
          v = buildQuote(b, cw, ctx);
          break;
        case "code":
          v = buildCode(b, cw);
          break;
        case "pre":
          v = buildPre(b, cw, bodyColor, ctx);
          break;
        case "rule":
          v = setRewidth(rectView(cw, 1, C.rule), (w) => {
            v.width = w;
          });
          break;
      }
      if (v !== null) {
        v.x = placeX(width, cw, g);
        out.push({ view: v, geo: g });
      }
    }
    flush();
    return out;
  }
  function buildBlocks(blocks, width, bodyColor, ctx) {
    const c = new View();
    c.width = width;
    const laid = layoutBlocks(blocks, width, bodyColor, ctx);
    for (const e of laid)
      c.appendChild(e.view);
    c.layout = yStack(PROSE.blockGap);
    setRewidth(c, (w) => {
      c.width = w;
      relayoutEntries(laid, w);
    });
    return c;
  }
  function relayoutEntries(entries, width) {
    for (const e of entries)
      if (REWIDTH.get(e.view) === void 0)
        return false;
    for (const e of entries) {
      const cw = contentWidth(width, e.geo);
      REWIDTH.get(e.view)(cw);
      e.view.x = placeX(width, cw, e.geo);
    }
    return true;
  }
  function buildPre(b, width, bodyColor, ctx) {
    const bar = CODERULE !== null;
    const boxed = CODEBG !== null || bar;
    const padL = boxed ? codePadLeft(bar) : 0;
    const padR = boxed ? PROSE.codePad : 0;
    const flowW = width - padL - padR;
    const runs = richRunsOf(b.inline, base(CODESIZE, BODY.weight, bodyColor, BODY.tracking), CODEFAM);
    const fm = fontMetrics(fontString({ fontFamily: CODEFAM, fontSize: sz(CODESIZE), fontWeight: "normal" }));
    const lead = (fm.ascent + fm.descent) / sz(CODESIZE);
    const flow = flowView([{ tag: "pre", runs, gapBefore: 0, lineHeight: lead, fontSize: sz(CODESIZE), pre: true }], flowW, ctx);
    if (!boxed)
      return flow;
    const box = rectView(width, 1, CODEBG ?? C.codeBg, PROSE.codeRadius);
    box.clip = true;
    const rule = bar ? rectView(PROSE.codeRuleWidth, 1, CODERULE) : null;
    if (rule !== null) {
      rule.x = 0;
      rule.y = 0;
      box.appendChild(rule);
    }
    const scroller = new View();
    scroller.x = padL;
    scroller.y = PROSE.codePad;
    scroller.width = flowW;
    scroller.scrolls = "x";
    flow.x = 0;
    flow.y = 0;
    scroller.appendChild(flow);
    box.appendChild(scroller);
    const c = new Constraint("RichText.codeBox", () => `${flow.height}`, () => {
      const h = Math.max(1, flow.height + 2 * PROSE.codePad);
      box.height = h;
      scroller.height = flow.height;
      if (rule !== null)
        rule.height = h;
    }, 0);
    c.run();
    onDiscard(box, () => c.dispose());
    setRewidth(box, (w) => {
      box.width = w;
      const fw = w - padL - padR;
      scroller.width = fw;
      flow.reflow(fw);
    });
    return box;
  }
  function buildCode(b, width) {
    const fm = fontMetrics(fontString({ fontFamily: CODEFAM, fontSize: sz(CODESIZE), fontWeight: "normal" }));
    const bar = CODERULE !== null;
    const padL = codePadLeft(bar);
    const lines = b.text === "" ? 1 : b.text.split("\n").length;
    const h = Math.ceil(lines * (fm.ascent + fm.descent)) + 2 * PROSE.codePad;
    const box = rectView(width, h, CODEBG ?? C.codeBg, PROSE.codeRadius);
    box.clip = true;
    if (bar) {
      const rule = rectView(PROSE.codeRuleWidth, h, CODERULE);
      rule.x = 0;
      rule.y = 0;
      box.appendChild(rule);
    }
    const scroller = new View();
    scroller.x = padL;
    scroller.y = PROSE.codePad;
    scroller.width = width - padL - PROSE.codePad;
    scroller.height = h - 2 * PROSE.codePad;
    scroller.scrolls = "x";
    const t = textView(width - padL - PROSE.codePad, sz(CODESIZE), C.codeFg, "normal", b.text);
    t.x = 0;
    t.y = 0;
    t.wrap = false;
    t.fontFamily = CODEFAM;
    scroller.appendChild(t);
    box.appendChild(scroller);
    setRewidth(box, (w) => {
      box.width = w;
      const iw = w - padL - PROSE.codePad;
      scroller.width = iw;
      t.width = iw;
    });
    return box;
  }
  function buildList(b, width, bodyColor, ctx) {
    const list = new View();
    list.width = width;
    const rows2 = [];
    const bodyW = width - PROSE.indent;
    for (let i = 0; i < b.items.length; i++) {
      const it = b.items[i];
      const marker = b.ordered ? `${b.start + i}.` : it.task === null ? "\u2022" : it.task ? "\u2611" : "\u2610";
      const row = new View();
      row.width = width;
      const mk = flowView([{ tag: "p", runs: richRunsOf([{ t: "text", value: marker }], base(BODY.size, BODY.weight, bodyColor, BODY.tracking), ctx.family), gapBefore: 0, lineHeight: ctx.lead, fontSize: sz(BODY.size), align: "right" }], PROSE.indent - PROSE.markerGap, ctx);
      mk.x = 0;
      mk.y = 0;
      const body = buildBlocks(it.blocks, bodyW, bodyColor, ctx);
      body.x = PROSE.indent;
      body.y = 0;
      row.appendChild(mk);
      row.appendChild(body);
      list.appendChild(row);
      rows2.push({ row, body });
    }
    list.layout = yStack(PROSE.itemGap);
    setRewidth(list, (w) => {
      list.width = w;
      for (const r of rows2) {
        r.row.width = w;
        REWIDTH.get(r.body)?.(w - PROSE.indent);
      }
    });
    return list;
  }
  function buildTable(b, width, bodyColor, ctx) {
    const cols = b.header.length;
    const colW = (width - (cols - 1) * PROSE.cellGap) / cols;
    const colX = (c) => c * (colW + PROSE.cellGap);
    const table = new View();
    table.width = width;
    const laidRows = [];
    const makeRow = (cells, weight, color) => {
      const rowCells = [];
      const row = new View();
      row.width = width;
      for (let c = 0; c < cols; c++) {
        const al = b.align[c];
        const cell = flowView([{
          tag: "p",
          runs: richRunsOf(cells[c] ?? [], base(BODY.size, weight, color, BODY.tracking), ctx.family),
          gapBefore: 0,
          lineHeight: ctx.lead,
          fontSize: sz(BODY.size),
          align: al === "center" || al === "right" ? al : void 0
        }], colW, ctx);
        cell.x = colX(c);
        cell.y = 0;
        rowCells.push(cell);
        row.appendChild(cell);
      }
      laidRows.push({ row, cells: rowCells });
      return row;
    };
    table.appendChild(makeRow(b.header, HEADINGW, HEADINGC));
    const headRule = rectView(width, 1, C.rule);
    table.appendChild(headRule);
    for (const r of b.rows)
      table.appendChild(makeRow(r, "normal", bodyColor));
    table.layout = yStack(PROSE.itemGap);
    setRewidth(table, (w) => {
      const cw2 = (w - (cols - 1) * PROSE.cellGap) / cols;
      table.width = w;
      headRule.width = w;
      for (const lr of laidRows) {
        lr.row.width = w;
        lr.cells.forEach((cell, c) => {
          cell.x = c * (cw2 + PROSE.cellGap);
          cell.reflow(cw2);
        });
      }
    });
    return table;
  }
  function buildQuote(b, width, ctx) {
    const outer = new View();
    outer.width = width;
    const body = buildBlocks(b.blocks, width - PROSE.quoteIndent, C.quoteColor, ctx);
    body.x = PROSE.quoteIndent;
    body.y = 0;
    const rule = rectView(3, 1, C.quoteRule);
    rule.x = 0;
    rule.y = 0;
    outer.appendChild(rule);
    outer.appendChild(body);
    const c = new Constraint("RichText.quoteRule", () => `${body.height}`, () => {
      rule.height = Math.max(1, body.height);
    }, 0);
    c.run();
    onDiscard(outer, () => c.dispose());
    setRewidth(outer, (w) => {
      outer.width = w;
      REWIDTH.get(body)?.(w - PROSE.quoteIndent);
    });
    return outer;
  }
  var PROSE, COLORS_DARK, COLORS_LIGHT, C, SCALE, ACCENTS, BODY, HEADINGW, HEADINGC, LINKC, CODEC, CODESIZE, CODEFAM, CODEBG, CODERULE, LAYOUT, geoEqual, sz, FALLBACK_FAMILY, TextFlow, ProseStack, REWIDTH, codePadLeft, RichText, Markdown, HTMLText;
  var init_markdown = __esm({
    "runtime/dist/markdown.js"() {
      "use strict";
      init_view();
      init_text();
      init_layout();
      init_reactive();
      init_attributes();
      init_measure();
      init_md();
      init_slug();
      init_html();
      PROSE = {
        heading: [32, 24, 20, 18, 16, 15],
        // px by level 1..6
        headingGap: [40, 38, 30, 24, 20, 18],
        // space ABOVE a heading (not first), by level
        headingBelow: 10,
        // space below a heading, before its content
        body: 16,
        codeSize: 13,
        // the house code rendition size — shared by inline, fenced, and <pre> code
        codeRadius: 8,
        codePad: 14,
        codeRuleWidth: 2,
        // the `codeRule` left accent bar's thickness
        codeRuleGap: 12,
        // extra left padding for code text when a `codeRule` bar is present
        mono: "ui-monospace, SFMono-Regular, monospace",
        blockGap: 16,
        itemGap: 6,
        indent: 28,
        // list item body's hanging indent (text left)
        markerGap: 7,
        // gap between the marker's right edge and the item text
        quoteIndent: 20,
        cellGap: 18
      };
      COLORS_DARK = {
        headingColor: 16777215,
        bodyColor: 13095126,
        code: 12111855,
        codeChip: 1518393,
        codeFg: 12109004,
        codeBg: 1187626,
        rule: 2373962,
        link: 6989055,
        quoteRule: 3099228,
        quoteColor: 10465466
      };
      COLORS_LIGHT = {
        headingColor: 1121316,
        bodyColor: 3359310,
        code: 2905464,
        codeChip: 15134195,
        codeFg: 3029830,
        codeBg: 15133938,
        rule: 13884644,
        link: 3108832,
        quoteRule: 12898522,
        quoteColor: 5924980
      };
      C = COLORS_DARK;
      SCALE = 1;
      ACCENTS = {};
      BODY = { size: 16, weight: "normal", tracking: 0 };
      HEADINGW = "bold";
      HEADINGC = 0;
      LINKC = 0;
      CODEC = 0;
      CODESIZE = 0;
      CODEFAM = "";
      CODEBG = null;
      CODERULE = null;
      LAYOUT = {};
      geoEqual = (a, b) => a.maxWidth === b.maxWidth && a.ml === b.ml && a.mr === b.mr && a.align === b.align;
      sz = (n) => Math.round(n * SCALE);
      FALLBACK_FAMILY = "system-ui, sans-serif";
      TextFlow = class extends View {
        content = [];
        flowWidth = 0;
        /** Re-flow at a new width, keeping the view and its content.
         *
         *  ⚠ THE EARLY-OUT IS THE WHOLE POINT. Prose is capped at a reading measure,
         *  so most flows in a document do NOT change width when the window does —
         *  and re-laying them out is the expensive part (on the native host
         *  `setRichContent` runs a synchronous AppKit text layout). Rebuilding used
         *  to re-lay every flow unconditionally: ~40 of them per drag step, 699ms of
         *  a 712ms resize frame, nearly all of it for flows whose width was
         *  identical before and after. */
        reflow(w) {
          if (this.flowWidth === w)
            return;
          this.width = w;
          this.flowWidth = w;
          if (this.content.every((b) => b.pre === true)) {
            if (this.surface?.setRichWidth !== void 0) {
              this.surface.setRichWidth(w);
              return;
            }
          }
          this.render();
        }
        onLink = null;
        /** The default link behavior (location.md §0.5). §12.2's mechanism, closed:
         *  a Markdown/HTMLText instance is a RichText PARENT holding TextFlow
         *  children — an author's declared `onLink` installs on the parent, while
         *  each flow reads its own `this.onLink`, so no handler ever arrived and
         *  every authored href was dead. The default therefore walks UP: the
         *  nearest ancestor with a declared onLink wins whole (the docs app's
         *  openDocLink keeps its custom routing untouched); with none, the href
         *  goes into the app's follow — "#story" navigates in-app, a URL leaves
         *  through navigate. Bound, so either backend can take it as a bare fn. */
        followLink = (href) => {
          for (let n = this.parent; n !== null; n = n.parent) {
            const h = n.onLink;
            if (typeof h === "function") {
              h.call(n, href);
              return;
            }
          }
          const app = this.root;
          app?.follow?.(href);
        };
        manual = [];
        /** Canvas only: each heading anchor's y offset inside this flow, captured on
         *  the manual layout (the DOM path finds the tagged element instead). */
        anchorYs = /* @__PURE__ */ new Map();
        /** The heading anchor slugs this flow renders — read from `content`, so it is
         *  the same on both backends and available as soon as the content is set (before
         *  a native measure). The reveal walk (view.ts) collects these. */
        anchorSlugs() {
          const out = [];
          for (const b of this.content)
            if (b.anchor !== void 0)
              out.push(b.anchor);
          return out;
        }
        /** Bring heading `slug` into view (location.md §6). Backend-split at the seam:
         *  DOM finds the `data-anchor` element and scrolls it natively; Canvas passes the
         *  recorded y offset so the surface clamps the scroll ancestor. Returns whether
         *  it revealed — false before the flow has realized that heading. */
        revealAnchor(slug, inset = 0) {
          const within2 = this.anchorYs.has(slug) ? this.anchorYs.get(slug) : -1;
          return this.surface?.revealRichAnchor(slug, within2, inset) ?? false;
        }
        /** True while this flow's height is a PROVISIONAL number — rendered (or just
         *  un-hidden), with the backend's asynchronous measurement still outstanding
         *  (§12.1: the DOM's ResizeObserver reports a frame after layout; a flow
         *  inside a display:none subtree measures 0 until re-shown). The reveal
         *  machinery HOLDS an anchored arrival while any flow reports true
         *  (location.md §0.5.3 — the component-sourced veto). Set at render and at
         *  visibility-flip (view.ts markRichPending); cleared by the measurement
         *  callback. Synchronous backends (headless, canvas) never set it. */
        measurePending = false;
        /** The flow's EFFECTIVE `selectable` — the species default (ruled
         *  2026-07-30): a flowing document is selectable BY ITS NATURE, so when
         *  nobody on the prevailing chain says otherwise, the answer is true — the
         *  Jots shape (a Markdown note, no declaration anywhere) reads as the
         *  document it is. Any provision still wins over this default, in either
         *  direction: `selectable = false` on the instance, a container, or a
         *  Control ancestor vetoes it (the unusual non-selectable document, one
         *  explicit line); the View-wide default stays false for everything that is
         *  not a flow (a `Text` is a label). `prevailingProvided` is tracked, so a
         *  provision appearing later re-flows. */
        effSelectable() {
          return prevailingProvided(this, "selectable") ? this.selectable : true;
        }
        attach(backend2, parentSurface, before = null) {
          super.attach(backend2, parentSurface, before);
          const c = new Constraint("TextFlow.flow", () => `${this.flowWidth} ${this.effSelectable()}`, () => this.render(), 0);
          c.run();
          onDiscard(this, () => c.dispose());
        }
        clearManual() {
          for (const v of this.manual) {
            this.removeChild(v);
            v.discard();
          }
          this.manual = [];
        }
        /** The backend re-measured the native flow (font load, or becoming visible
         *  after attaching under a zero-sized ancestor). Track it so the stack re-flows. */
        onMeasured(h) {
          this.measurePending = false;
          if (this.surface !== null && h >= 0)
            this.height = h;
        }
        render() {
          const s = this.surface;
          if (s === null)
            return;
          const link = this.onLink ?? this.followLink;
          this.measurePending = s.deferredRichMeasure === true;
          const h = s.setRichContent(this.content, this.effSelectable(), this.flowWidth, (nh) => this.onMeasured(nh), link);
          if (h >= 0) {
            this.clearManual();
            this.height = h;
            return;
          }
          this.clearManual();
          const { views, height, anchors } = flowRichCanvas(this.content, this.flowWidth, this.onLink ?? this.followLink);
          this.anchorYs = anchors;
          let at = 0;
          for (const v of views) {
            this.insertChild(v, at++);
            this.manual.push(v);
            if (this.backend !== null)
              v.attach(this.backend, this.surface);
          }
          this.height = height;
          this.childrenMutated();
        }
      };
      ProseStack = class extends Layout {
        spacing = 0;
        place() {
          let pos = 0;
          return this.laid().map((c) => {
            const box = { y: pos };
            if (c.visible)
              pos += c.height + this.spacing;
            return box;
          });
        }
      };
      REWIDTH = /* @__PURE__ */ new WeakMap();
      codePadLeft = (bar) => PROSE.codePad + (bar ? PROSE.codeRuleWidth + PROSE.codeRuleGap : 0);
      RichText = class extends View {
        built = [];
        /** Named text fills a source can reference (HTMLText's `accents`); none by
         *  default — Markdown has no syntax to name one. */
        accentsOf() {
          return {};
        }
        /** RichText's `scale` is a FONT-SIZE multiplier consumed by rebuild(), not the
         *  paint transform it means on a plain View — so mask the base flush()'s scale
         *  push. Without this, a `scale` constraint that evaluates before the surface
         *  attaches bakes a CSS transform ON TOP of the scaled fonts (double-scaling),
         *  and the view's measured height no longer matches its painted height. */
        flush(s) {
          super.flush(s);
          if (this.scale !== 1)
            s.setScale(1, this.pivotX, this.pivotY);
        }
        attach(backend2, parentSurface, before = null) {
          super.attach(backend2, parentSurface, before);
          const c = new Constraint(`${this.constructor.name}.render`, () => `${this.sourceKey()} ${this.lineHeight} ${this.bodyColor} ${this.isDark()} ${this.scale} ${this.codeBackground} ${this.codeRule}`, () => this.rebuild(), 0);
          c.run();
          onDiscard(this, () => c.dispose());
          const cw = new Constraint(`${this.constructor.name}.rewidth`, () => `${this.width}`, () => this.relayout(this.width > 0 ? this.width : 640), 0);
          cw.run();
          onDiscard(this, () => cw.dispose());
        }
        /** The color scheme for the house rich-element palette: the explicit `dark`
         *  override if set (an app whose own theme selector differs from the OS), else
         *  the root App's OS `dark`, read by walking to the tree root. */
        isDark() {
          if (this.dark != null)
            return this.dark;
          let r = this;
          while (r instanceof View && r.parent !== null)
            r = r.parent;
          return !!r.dark;
        }
        /** A link run was activated. Mechanism only: fire `onLink(href)` for the app to
         *  dispatch (custom routing — the docs app's openDocLink); unhandled, the href
         *  goes into the App's FOLLOW (location.md §0.5) — "#story" navigates in-app,
         *  anything else leaves through navigate — so authored prose links work with
         *  no wiring at all. (The old fallback was `navigate(href)` raw, which sent a
         *  fragment ref to the HOST as an outbound URL — the browser then opened
         *  DISTRO_ROOT + "#…", a different page entirely: §12.2's second half.) */
        dispatchLink(href) {
          if (typeof this.onLink === "function") {
            fireEvent(this, "link", href);
            return;
          }
          let r = this;
          while (r instanceof View && r.parent !== null)
            r = r.parent;
          const app = r;
          if (typeof app.follow === "function")
            app.follow(href);
          else
            app.navigate?.(href);
        }
        /** The last layout's blocks, with the geometry each derived from. */
        laid = [];
        /** A WIDTH-ONLY change: re-width what is already built instead of rebuilding.
         *
         *  Nothing structural depends on width — `parseSource()` never sees it, and a
         *  RichBlock carries no wrapping (the backend is handed the width and does
         *  the wrapping itself). All width does is set each block's content width and
         *  x. Rebuilding for it re-parsed the source, discarded every view and
         *  re-attached fresh ones, which on the native host meant a synchronous text
         *  layout per flow — ~40 per drag step, 699ms of a 712ms frame, most of it for
         *  flows whose width had not actually changed.
         *
         *  Falls back to a full rebuild if any block has no re-width registered, so an
         *  unconverted block type stays correct. */
        relayout(width) {
          if (this.laid.length === 0) {
            this.rebuild();
            return;
          }
          if (!relayoutEntries(this.laid, width)) {
            this.rebuild();
            return;
          }
          this.childrenMutated();
        }
        rebuild() {
          C = this.isDark() ? COLORS_DARK : COLORS_LIGHT;
          SCALE = this.scale || 1;
          ACCENTS = this.accentsOf();
          for (const v of this.built) {
            this.removeChild(v);
            v.discard();
          }
          this.built = [];
          const width = this.width > 0 ? this.width : 640;
          const family = this.fontFamily || FALLBACK_FAMILY;
          const lead = this.lineHeight || 1;
          const bodyColor = this.bodyColor ?? C.bodyColor;
          BODY = { size: this.fontSize || PROSE.body, weight: this.fontWeight || "normal", tracking: this.letterSpacing || 0 };
          HEADINGW = this.headingWeight || "bold";
          HEADINGC = this.headingColor ?? C.headingColor;
          LINKC = this.linkColor ?? C.link;
          CODEC = this.codeColor ?? C.code;
          CODESIZE = this.codeSize || PROSE.codeSize;
          CODEFAM = this.codeFamily || PROSE.mono;
          CODEBG = this.codeBackground;
          CODERULE = this.codeRule;
          LAYOUT = this.richTextLayout ?? {};
          const ctx = { family, lead, onLink: (href) => this.dispatchLink(href) };
          const children = layoutBlocks(this.parseSource(), width, bodyColor, ctx);
          let at = 0;
          for (const e of children) {
            this.insertChild(e.view, at++);
            this.built.push(e.view);
            if (this.backend !== null)
              e.view.attach(this.backend, this.surface);
          }
          this.laid = children;
          this.layout = yStack(PROSE.blockGap);
          this.childrenMutated();
        }
      };
      Markdown = class extends RichText {
        // `?? ""` on both: an unresolved `:path` is defined to fall back to the
        // default, but one browser-side crash report (`.replace` on null) suggests a
        // path where a null still reaches here — unreproduced headless, guarded
        // anyway, since the correct rendering of a null source IS the empty flow.
        sourceKey() {
          return this.text ?? "";
        }
        parseSource() {
          return parse(this.text ?? "");
        }
      };
      HTMLText = class extends RichText {
        // `accents` folded into the key (as a signature) so a re-themed fill re-renders.
        sourceKey() {
          return this.html + " " + this.unsupported + " " + JSON.stringify(this.accents ?? {});
        }
        parseSource() {
          return parseHtml(this.html, this.unsupported);
        }
        accentsOf() {
          return this.accents ?? {};
        }
      };
      defineAttributes(RichText, { lineHeight: { def: 1 }, bodyColor: { def: null }, scale: { def: 1 }, dark: { def: null } });
      defineAttributes(Markdown, { text: { def: "" } });
      defineAttributes(HTMLText, { html: { def: "" }, unsupported: { def: "strip" }, accents: { def: {} } });
    }
  });

  // runtime/dist/heartbeat.js
  var MAX_DT, Heartbeat;
  var init_heartbeat = __esm({
    "runtime/dist/heartbeat.js"() {
      "use strict";
      init_node();
      init_animate();
      init_attributes();
      MAX_DT = 1 / 15;
      Heartbeat = class extends Node2 {
        /** Life by KIND (Ticker.perpetual): a Heartbeat integrates while `running`
         *  and never "arrives" — it must not hold settleMotion open. */
        perpetual = true;
        /** The previous frame's timestamp, or null before the first tick. */
        last = null;
        registered = false;
        constructor() {
          super();
          onDiscard(this, () => this.leave());
        }
        /** Sync clock membership with `running` — called at init and on every
         *  write to the slot (the attribute's pusher). */
        sync() {
          if (this.running)
            this.join();
          else
            this.leave();
        }
        join() {
          if (this.registered)
            return;
          this.registered = true;
          this.last = null;
          sharedClock.add(this);
        }
        leave() {
          if (!this.registered)
            return;
          this.registered = false;
          sharedClock.remove(this);
          this.last = null;
        }
        /** Shift the anchor across a scheduler handover (Ticker.rebase) — the
         *  resume-yields-no-step rule at `join()` is about ENROLLMENT; a live
         *  heartbeat crossing a clock handover has no reason to skip a beat. */
        rebase(delta) {
          if (this.last !== null)
            this.last += delta;
        }
        /** Called once per frame by the shared clock. Returns whether to keep
         *  ticking (the clock's protocol). */
        tick(now) {
          if (!this.running)
            return false;
          const prev = this.last;
          this.last = now;
          if (prev === null)
            return true;
          const dt = Math.min(Math.max((now - prev) / 1e3, 0), MAX_DT);
          const fn = this.onFrame;
          if (typeof fn === "function")
            fn.call(this, dt);
          return this.running;
        }
        /** Construction-complete (instantiate.ts fires this on animators; Heartbeat
         *  joins the same lifecycle) — start if `running` was left true. */
        autoStart() {
          this.sync();
        }
      };
      defineAttributes(Heartbeat, {
        running: {
          def: true,
          push: (f) => f.sync()
        }
      });
    }
  });

  // runtime/dist/keys.js
  function setKeysFocusProbe(fn) {
    keysFocusProbe = fn;
  }
  function normalize(ev) {
    return {
      code: ev.code,
      key: ev.key,
      shift: ev.shiftKey,
      ctrl: ev.ctrlKey,
      alt: ev.altKey,
      meta: ev.metaKey,
      repeat: ev.repeat
    };
  }
  var keysFocusProbe, KeysService, LISTENING, Keys;
  var init_keys = __esm({
    "runtime/dist/keys.js"() {
      "use strict";
      keysFocusProbe = null;
      KeysService = class {
        /** The held-key set (LZX's downKeysHash) — what is pressed right now. */
        heldKeys = /* @__PURE__ */ new Set();
        /** Views currently claiming the NAVIGATION keys (arrows, Space, Home/End,
         *  PageUp/Down) from the browser's scroll defaults — an open Menu chain,
         *  any overlay that roves with arrows while nothing holds Declare focus.
         *  A Set of claimant owners so overlapping claims (a menu over a menu)
         *  compose; `navClaim(owner, false)` releases only its own. */
        navClaims = /* @__PURE__ */ new Set();
        navHandlers = /* @__PURE__ */ new Set();
        /** Claim (or release) the navigation keys for `owner`. While any claim is
         *  live, the DOM listener prevents the browser's scroll defaults for the
         *  nav keys exactly as it does when a Declare control holds focus — an
         *  open menu's arrows rove the menu, never scroll the page. Idempotent.
         *  0↔1 transitions notify onNavClaim subscribers (the FocusRing stands
         *  down while an overlay owns the keys — the menu's rover is the focus). */
        navClaim(owner, on) {
          const was = this.navClaims.size > 0;
          if (on)
            this.navClaims.add(owner);
          else
            this.navClaims.delete(owner);
          const is = this.navClaims.size > 0;
          if (was !== is)
            for (const fn of [...this.navHandlers])
              fn(is);
        }
        /** Is any navigation-keys claim live right now? */
        navClaimed() {
          return this.navClaims.size > 0;
        }
        /** Subscribe to nav-claim TRANSITIONS (true = an overlay took the keys,
         *  false = the last claim released). Returns the unsubscribe thunk. */
        onNavClaim(fn) {
          this.navHandlers.add(fn);
          return () => this.navHandlers.delete(fn);
        }
        downHandlers = /* @__PURE__ */ new Set();
        upHandlers = /* @__PURE__ */ new Set();
        chords = [];
        /** Is this physical key (KeyboardEvent.code) down right now? The "key
         *  bitmap" query. */
        isDown(code) {
          return this.heldKeys.has(code);
        }
        /** Every currently-held code (a copy — callers may not mutate the set). */
        held() {
          return [...this.heldKeys];
        }
        /** Subscribe to key-down / key-up. Returns an unsubscribe thunk. */
        onKeyDown(fn) {
          this.downHandlers.add(fn);
          return () => this.downHandlers.delete(fn);
        }
        onKeyUp(fn) {
          this.upHandlers.add(fn);
          return () => this.upHandlers.delete(fn);
        }
        /** Fire `fn` once when every code in `codes` is simultaneously held (LZX's
         *  callOnKeyCombo). Re-arms once any of the keys releases. Returns an
         *  unsubscribe thunk. (v1 matches physical codes; modifier-normalized
         *  chords — "ctrl"+"KeyS" — are a later refinement.) */
        onChord(codes, fn) {
          const chord = { codes: new Set(codes), fn, active: false };
          this.chords.push(chord);
          return () => {
            const i = this.chords.indexOf(chord);
            if (i >= 0)
              this.chords.splice(i, 1);
          };
        }
        // ── Fed by the adapter (or a test) ────────────────────────────────────────
        /** A key went down: record it, fire the down stream, then complete any chord
         *  whose keys are now all held. */
        keyDown(e) {
          this.heldKeys.add(e.code);
          for (const h of [...this.downHandlers])
            h(e);
          for (const c of this.chords) {
            if (!c.active && this.allHeld(c.codes)) {
              c.active = true;
              c.fn();
            }
          }
        }
        /** A key went up: drop it, fire the up stream, then re-arm any chord it broke. */
        keyUp(e) {
          this.heldKeys.delete(e.code);
          for (const h of [...this.upHandlers])
            h(e);
          for (const c of this.chords) {
            if (c.active && !this.allHeld(c.codes))
              c.active = false;
          }
        }
        /** Release everything — on app blur, so a key held across a focus-out does
         *  not stick (a key-up may never arrive while the app is unfocused). */
        clearHeld() {
          this.heldKeys.clear();
          for (const c of this.chords)
            c.active = false;
        }
        allHeld(codes) {
          for (const code of codes)
            if (!this.heldKeys.has(code))
              return false;
          return true;
        }
        /** Wire this service to a DOM host: keydown/keyup feed the core, blur clears
         *  the held set. Listeners live on `window` (a key released outside the tree
         *  must still update state) and self-retire once `alive` goes false — the
         *  same discipline as routeInput. Node-free core; only this method touches
         *  the DOM.
         *
         *  IDEMPOTENT PER TARGET. A browser calls this once per document, so
         *  stacking never showed there — but a LONG-LIVED host re-mounts app after
         *  app into one process, and wireInput calls this per mount. Un-guarded,
         *  each mount stacked another listener trio whose `alive` (the old app's)
         *  never went false, so every keydown fed the core once per mount ever
         *  made: N listeners × N delivery handlers = N² focus advances per Tab on
         *  the native host, with N² 's parity alternating per boot — measured
         *  2026-08-01 as nextCalls 9, 16, 25, 36 on four consecutive boots, and
         *  presenting for two days as a focus "coin toss". A repeat call now
         *  REPLACES the previous registration's liveness probe instead of adding
         *  listeners: the newest app owns the wire, exactly re-mount semantics. */
        listen(alive, target = window) {
          const bound = LISTENING.get(target);
          if (bound !== void 0) {
            bound.alive = alive;
            return;
          }
          const box = { alive };
          LISTENING.set(target, box);
          const isAlive = () => box.alive();
          const retire = () => {
            LISTENING.delete(target);
            target.removeEventListener("keydown", onDown);
            target.removeEventListener("keyup", onUp);
            target.removeEventListener("blur", onBlur);
          };
          const focusHolds = () => keysFocusProbe !== null && keysFocusProbe();
          const onDown = (ev) => {
            if (!isAlive())
              return retire();
            if (ev.key === "Tab")
              ev.preventDefault();
            if (document.activeElement === document.body || document.activeElement === null) {
              const nav = ev.key === " " || ev.key === "ArrowUp" || ev.key === "ArrowDown" || ev.key === "ArrowLeft" || ev.key === "ArrowRight";
              const jump = ev.key === "Home" || ev.key === "End" || ev.key === "PageUp" || ev.key === "PageDown";
              if (nav && (focusHolds() || this.navClaimed()) || jump && this.navClaimed())
                ev.preventDefault();
            }
            this.keyDown(normalize(ev));
          };
          const onUp = (ev) => {
            if (!isAlive())
              return retire();
            this.keyUp(normalize(ev));
          };
          const onBlur = () => {
            if (!isAlive())
              return retire();
            this.clearHeld();
          };
          target.addEventListener("keydown", onDown);
          target.addEventListener("keyup", onUp);
          target.addEventListener("blur", onBlur);
        }
      };
      LISTENING = /* @__PURE__ */ new WeakMap();
      Keys = new KeysService();
    }
  });

  // runtime/dist/sources.js
  var Source, KeysSource, CHANNELS_KEYS, FocusSource, CHANNELS_FOCUS, TipSource, CHANNELS_TIP;
  var init_sources = __esm({
    "runtime/dist/sources.js"() {
      "use strict";
      init_node();
      init_keys();
      init_focus();
      init_tip();
      Source = class extends Node2 {
        wired = false;
        /** Construction-complete (instantiate.ts's initTree — the same lifecycle hook
         *  an animator's autoStart uses): the compiled handler members are installed
         *  by now, which is the first moment we can tell which channels to wire. */
        autoStart() {
          if (this.wired)
            return;
          this.wired = true;
          const self = this;
          const offs = [];
          for (const [member, subscribe] of this.channels()) {
            const fn = self[member];
            if (typeof fn !== "function")
              continue;
            const handler = (arg) => {
              fn.call(this, arg);
            };
            offs.push(subscribe(handler));
          }
          if (offs.length > 0)
            onDiscard(this, () => {
              for (const off of offs)
                off();
            });
        }
      };
      KeysSource = class extends Source {
        channels() {
          return CHANNELS_KEYS;
        }
      };
      CHANNELS_KEYS = [
        ["onKeyDown", (fn) => Keys.onKeyDown(fn)],
        ["onKeyUp", (fn) => Keys.onKeyUp(fn)],
        ["onNavClaim", (fn) => Keys.onNavClaim(fn)]
      ];
      FocusSource = class extends Source {
        channels() {
          return CHANNELS_FOCUS;
        }
      };
      CHANNELS_FOCUS = [
        ["onFocusChange", (fn) => Focus.onFocusChange(fn)],
        ["onGeometry", (fn) => Focus.onGeometry(fn)]
      ];
      TipSource = class extends Source {
        channels() {
          return CHANNELS_TIP;
        }
      };
      CHANNELS_TIP = [
        ["onTip", (fn) => Tip.onTip(fn)]
      ];
    }
  });

  // runtime/dist/stream-seam.js
  function browserEventSource(url, listen, cb) {
    const es = new EventSource(url);
    const deliver = (e) => cb.message({ data: typeof e.data === "string" ? e.data : String(e.data), type: e.type, id: e.lastEventId });
    es.onopen = () => cb.open();
    es.onmessage = deliver;
    for (const type of listen) {
      if (type === "message" || type === "open" || type === "error")
        continue;
      es.addEventListener(type, deliver);
    }
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED)
        cb.end(`the server closed the stream at ${url}`, true);
      else
        cb.end("", false);
    };
    return { close: () => es.close() };
  }
  function browserSocket(url, cb) {
    const ws = new WebSocket(url);
    ws.onopen = () => cb.open();
    ws.onmessage = (e) => {
      if (typeof e.data === "string")
        cb.message({ data: e.data, type: "message", id: "" });
    };
    ws.onclose = (e) => cb.end(e.wasClean ? "" : e.reason !== "" ? e.reason : `connection lost (code ${e.code})`, true);
    return { close: () => ws.close(), send: (t) => ws.send(t) };
  }
  function currentStreams() {
    return factories;
  }
  var factories;
  var init_stream_seam = __esm({
    "runtime/dist/stream-seam.js"() {
      "use strict";
      factories = { eventSource: browserEventSource, socket: browserSocket };
    }
  });

  // runtime/dist/streams.js
  var Stream, EventStream, Socket;
  var init_streams = __esm({
    "runtime/dist/streams.js"() {
      "use strict";
      init_node();
      init_attributes();
      init_stream_seam();
      Stream = class extends Node2 {
        /** The boolean view of `status`, like DataSource.loaded: four names, one
         *  fact, never in disagreement. */
        get open() {
          return this.status === "open";
        }
        handle = null;
        timer = null;
        /** Bumped whenever the current handle stops being ours (drop, terminal
         *  end, reconnect) — the sequence discipline: a stale handle's callbacks
         *  land nowhere (DataSource.seq for connections). */
        gen = 0;
        /** Did the CURRENT connection reach open? — decides whether going down is
         *  an onClose fact. */
        wasOpen = false;
        /** Set at initTree's autoStart: attribute pushes during construction and
         *  the initial binding evaluations must not connect — autoStart syncs once,
         *  with the settled initial values (zero churn by construction). */
        wired = false;
        constructor() {
          super();
          onDiscard(this, () => this.drop(true));
        }
        /** Construction-complete (instantiate.ts initTree — the hook every source
         *  uses): handlers and initial attribute values are all in place. */
        autoStart() {
          if (this.wired)
            return;
          this.wired = true;
          this.sync();
        }
        /** `url` (or `listen`) changed: close and reopen at the new address — the
         *  Dataset.url discipline, push-driven (the attribute pushers below reach
         *  these two private hooks the way Heartbeat' pusher reaches its sync). */
        readdressed() {
          if (!this.wired)
            return;
          this.drop(false);
          this.sync();
        }
        /** `active` changed: the gate. */
        gated() {
          if (!this.wired)
            return;
          if (!this.active)
            this.drop(false);
          this.sync();
        }
        /** Converge on what the declaration wants: connected exactly when `active`
         *  and a non-empty `url` say so ("" = detached, the AppIsland idiom). */
        sync() {
          if (this.active && this.url !== "") {
            if (this.handle === null && this.timer === null)
              this.connect();
          } else if (this.status !== "closed") {
            setBound(this, "status", "closed");
          }
        }
        connect() {
          const gen = ++this.gen;
          setBound(this, "status", "connecting");
          const cb = {
            open: () => {
              if (gen !== this.gen)
                return;
              this.wasOpen = true;
              setBound(this, "error", "");
              setBound(this, "status", "open");
              this.fire("onOpen");
            },
            message: (m) => {
              if (gen !== this.gen)
                return;
              setBound(this, "last", m.data);
              this.fire("onMessage", m);
            },
            end: (error, final) => {
              if (gen !== this.gen)
                return;
              this.ended(error, final);
            }
          };
          try {
            this.handle = this.dial(cb);
          } catch (e) {
            this.handle = null;
            setBound(this, "error", e instanceof Error ? e.message : String(e));
            setBound(this, "status", "failed");
            this.fire("onError");
          }
        }
        /** The connection went down (the factory's `end`). Not final = the
         *  platform repairs it itself (SSE native retry): just "retrying". Final =
         *  the handle is dead; a declared `retry` schedules the reconnect, else
         *  the stream rests at "failed" (a failure) or "closed" (a clean end). */
        ended(error, final) {
          if (error !== "") {
            setBound(this, "error", error);
            this.fire("onError");
          }
          if (!final) {
            setBound(this, "status", "retrying");
            return;
          }
          this.gen++;
          this.handle = null;
          if (this.wasOpen) {
            this.wasOpen = false;
            this.fire("onClose");
          }
          if (this.retry > 0 && this.active) {
            setBound(this, "status", "retrying");
            this.timer = setTimeout(() => {
              this.timer = null;
              this.sync();
            }, this.retry * 1e3);
          } else {
            setBound(this, "status", error !== "" ? "failed" : "closed");
          }
        }
        /** Close whatever is live or pending. `quiet` (discard) fires no handlers —
         *  nothing may run into a tree being torn down. */
        drop(quiet) {
          this.gen++;
          if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
          }
          if (this.handle !== null) {
            try {
              this.handle.close();
            } catch {
            }
            this.handle = null;
          }
          if (this.wasOpen) {
            this.wasOpen = false;
            if (!quiet)
              this.fire("onClose");
          }
        }
        /** A handler is an ordinary function-typed member the app may not have
         *  declared — pay-per-use, like every source. */
        fire(name, arg) {
          const fn = this[name];
          if (typeof fn === "function")
            fn.call(this, arg);
        }
      };
      defineAttributes(Stream, {
        url: { def: "", push: (s) => s.readdressed() },
        active: { def: true, push: (s) => s.gated() },
        retry: { def: 0 },
        status: { def: "closed" },
        error: { def: "" },
        last: { def: "" }
      });
      EventStream = class extends Stream {
        dial(cb) {
          const listen = this.listenTo.filter((s) => typeof s === "string" && s !== "");
          return currentStreams().eventSource(this.url, listen, cb);
        }
      };
      defineAttributes(EventStream, {
        // listeners attach at construction, so changing what you listen to is a
        // readdress: close and reopen with the new set
        listenTo: { def: Object.freeze([]), push: (s) => s.readdressed() }
      });
      Socket = class extends Stream {
        dial(cb) {
          return currentStreams().socket(this.url, cb);
        }
        /** A call you make; `onMessage` is it calling you. On a socket that is not
         *  open: a reported error, not a silent queue (§5). */
        send(text) {
          if (this.open && this.handle?.send !== void 0) {
            this.handle.send(text);
            return;
          }
          setBound(this, "error", "send(\u2026) on a socket that is not open \u2014 nothing was sent (gate on .open, or send from onOpen)");
          this.fire("onError");
        }
      };
    }
  });

  // runtime/dist/registry.js
  var TAGS2, LAYOUTS, LAYOUT_BASES, DATA, ANIMATORS, SOURCES, ANIMATOR_GROUPS, STATES, REGISTRY_NAMES;
  var init_registry = __esm({
    "runtime/dist/registry.js"() {
      "use strict";
      init_view();
      init_node();
      init_text();
      init_image();
      init_video();
      init_text_input();
      init_markdown();
      init_layout();
      init_data();
      init_animator();
      init_spring();
      init_heartbeat();
      init_sources();
      init_streams();
      init_state();
      TAGS2 = {
        App,
        View,
        Text,
        Image,
        Video,
        DOMIsland,
        TextInput,
        Markdown,
        HTMLText,
        Node: Node2
      };
      LAYOUTS = {};
      LAYOUT_BASES = { Layout, TweenLayout };
      DATA = { Dataset, DataSource };
      ANIMATORS = { Animator, Spring };
      SOURCES = {
        Heartbeat,
        Keys: KeysSource,
        Focus: FocusSource,
        Tip: TipSource,
        // the stream family (streams.ts) — `Stream` itself is schema-only
        // (abstract, uninstantiable), so only the concrete transports register
        EventStream,
        Socket
      };
      ANIMATOR_GROUPS = { AnimatorGroup };
      STATES = { State };
      REGISTRY_NAMES = [
        ...Object.keys(TAGS2),
        ...Object.keys(LAYOUTS),
        ...Object.keys(LAYOUT_BASES),
        ...Object.keys(DATA),
        ...Object.keys(ANIMATORS),
        ...Object.keys(ANIMATOR_GROUPS),
        ...Object.keys(SOURCES),
        ...Object.keys(STATES)
      ];
    }
  });

  // runtime/dist/instantiate.js
  function isSourceNode(n) {
    return typeof n?.autoStart === "function";
  }
  function routeAttr(schema, attr, trusted) {
    if (!trusted)
      return checkAttr(schema, attr);
    const v = attr.value;
    if (v.kind === "code")
      return { ok: true, binding: { src: v.src, pos: v.pos } };
    if (v.kind === "path")
      return { ok: true, datapath: { path: v.path, many: v.many, pos: v.pos, plan: v.plan } };
    const type = attrType(schema, attr.name);
    const c = type !== null ? coerce(type, v) : null;
    if (c === null || !c.ok) {
      throw new DeclareError(`${schema.name}.${attr.name}: this precompiled program does not match its runtime (rebuild the artifact)`, attr.pos);
    }
    return { ok: true, value: c.value };
  }
  function instantiate(input) {
    const program = "root" in input ? input : { classes: [], stylesheets: [], styles: [], fonts: [], includes: [], includeSpans: [], uses: [], scripts: [], root: input };
    const trusted = program.trusted === true;
    const scriptScope = {};
    for (const s of program.scripts)
      Object.assign(scriptScope, evalScript(s.src));
    CURRENT_SCRIPTS = scriptScope;
    return withScriptScope(scriptScope, () => buildTree2(program, trusted));
  }
  function buildTree2(program, trusted) {
    const { infos, schemas, errors } = programSchemas(program.classes);
    if (errors.length > 0)
      throw errors[0];
    const tags = { ...TAGS2 };
    const layoutCtors = { ...LAYOUT_BASES };
    const classes = /* @__PURE__ */ new Map();
    for (const info of infos) {
      const chain = [...classes.get(info.decl.base)?.chain ?? [], info.decl.body];
      if (descendsFrom(info.schema, "Layout")) {
        const ctor = synthesize(layoutCtors[info.schema.base.name], info.decl.name, info.decl.body, () => info.defaults);
        layoutCtors[info.decl.name] = ctor;
        classes.set(info.decl.name, { info, ctor, chain });
      } else {
        const ctor = synthesize(tags[info.schema.base.name], info.decl.name, info.decl.body, () => info.defaults);
        classes.set(info.decl.name, { info, ctor, chain });
        tags[info.decl.name] = ctor;
      }
    }
    const ctx = {
      tags,
      layoutCtors,
      schemas,
      classes,
      stylesheets: buildStylesheets(program, schemas, trusted),
      fonts: buildFonts(program.fonts),
      bundles: collectBundles(program),
      pending: [],
      expanding: /* @__PURE__ */ new Set(),
      trusted
    };
    const root = construct(program.root, null, ctx);
    if (!(root instanceof View)) {
      throw new DeclareError(`the root must be a view, not a ${program.root.tag}`, program.root.pos);
    }
    CONTEXTS.set(root, ctx);
    registerStylesheets(root, ctx.stylesheets);
    registerFontFaces(root, collectFaces(ctx.fonts));
    installPending(ctx.pending, ctx);
    initTree(root);
    return root;
  }
  function installPending(pending, ctx) {
    for (const p of pending) {
      if ("code" in p)
        bindConstraint(p.view, p.attr.name, p.code, p.attr.value.pos, p.classroot, p.attr.value.kind === "code" ? p.attr.value.deps : void 0);
      else if ("twoWay" in p)
        bindTwoWay(p.view, p.attr.name, p.twoWay, p.type);
      else if ("twoWayCode" in p)
        bindTwoWayDynamic(p.view, p.attr.name, p.twoWayCode, p.attr.value.pos, p.classroot, p.type);
      else if ("dataPath" in p)
        bindData(p.view, p.attr.name, p.dataPath, p.type, p.plan);
      else if ("cursorPath" in p)
        bindDatapath(p.view, p.cursorPath);
      else if ("cursorCode" in p)
        bindCursor(p.view, p.cursorCode, p.attr.value.pos, p.classroot);
      else if ("layoutEl" in p) {
        if (!ctx.trusted) {
          const errs = checkComponentValue(ctx.schemas, p.view.constructor.name, p.layoutEl.name, p.of, p.layoutEl);
          if (errs.length > 0)
            throw errs[0];
        }
        p.view[p.layoutEl.name] = buildLayout(p.layoutEl, p.view, ctx);
      } else if ("replicator" in p)
        p.replicator.arm();
      else if ("align" in p)
        bindAlign(p.view, p.attr.name, p.align, p.attr.value.pos);
      else
        bindPercent(p.view, p.attr.name, p.percent, p.attr.value.pos);
    }
  }
  function markInited(view) {
    INITED.add(view);
    for (const child of view.children) {
      if (child instanceof View)
        markInited(child);
    }
  }
  function initTree(view) {
    ensureApplier(view);
    for (const child of view.children) {
      if (child instanceof View)
        initTree(child);
    }
    if (!INITED.has(view)) {
      INITED.add(view);
      fireEvent(view, "init");
    }
    for (const child of view.children) {
      if (child instanceof Spring)
        child.prime();
      if (child instanceof Animator || child instanceof AnimatorGroup)
        child.autoStart();
      else if (isSourceNode(child))
        child.autoStart();
      else if (child instanceof State)
        child.init();
    }
  }
  function buildStylesheets(program, schemas, trusted) {
    const stylesheets = /* @__PURE__ */ new Map();
    for (const decl of program.stylesheets) {
      const where = `stylesheet ${decl.name}`;
      let theme = null;
      const entries = /* @__PURE__ */ new Map();
      for (const child of decl.body.children) {
        if (child.name === "theme" && child.tag === "Theme") {
          if (!trusted) {
            const errs = checkThemeRecord(where, child);
            if (errs.length > 0)
              throw errs[0];
          }
          const rec = {};
          for (const a of child.attrs)
            rec[a.name] = coerceToken(a.value);
          theme = Object.freeze(rec);
          continue;
        }
        const schema = Object.hasOwn(schemas, child.tag) ? schemas[child.tag] : null;
        if (child.entry !== true || schema === null) {
          throw new DeclareError(`${where}: a stylesheet's members are 'theme: Theme [ \u2026 ]' and class-keyed entries ('${child.tag}: [ \u2026 ]')`, child.pos);
        }
        if (!trusted) {
          const errs = checkEntry(where, child, schema);
          if (errs.length > 0)
            throw errs[0];
        }
        entries.set(child.tag, child.attrs.map((a) => {
          if (a.value.kind === "code") {
            const c = compileExpr(a.value.src);
            if ("error" in c) {
              throw new DeclareError(`${where}.${child.tag}.${a.name} = { \u2026 } ${c.error}`, a.value.pos);
            }
            return { name: a.name, fn: c.fn };
          }
          const r = routeAttr(schema, a, trusted);
          if (!r.ok)
            throw r.error;
          if (!("value" in r) || isPercent(r.value) || isAlign(r.value)) {
            throw new DeclareError(`${where}.${child.tag}.${a.name}: an entry field is a literal or a { }`, a.value.pos);
          }
          return { name: a.name, value: r.value };
        }));
      }
      stylesheets.set(decl.name, buildStylesheet(decl.name, theme, entries));
    }
    return stylesheets;
  }
  function collectBundles(program) {
    const bundles = /* @__PURE__ */ new Map();
    for (const s of program.styles) {
      const b = s.body;
      if (b.decls.length > 0 || b.methods.length > 0 || b.children.length > 0 || b.raw !== void 0) {
        throw new DeclareError(`style ${s.name}: a bundle carries attribute sets only \u2014 a look, not a component`, s.pos);
      }
      bundles.set(s.name, b);
    }
    return bundles;
  }
  function synthesize(base2, name, body, defaults, outer = false) {
    const B = base2;
    const cls = class extends B {
    };
    Object.defineProperty(cls, "name", { value: name, configurable: false });
    if (body.decls.length > 0) {
      const probe = new B();
      const specs = {};
      const defs = defaults();
      for (const d of body.decls) {
        if (d.name in probe) {
          throw new DeclareError(`${name}.${d.name}: '${d.name}' is a built-in member of the runtime ${base2.name} \u2014 choose another name`, d.pos);
        }
        let defBinding;
        if (d.def?.kind === "code") {
          const c = compileExpr(d.def.src);
          if ("error" in c)
            throw new DeclareError(`${name}.${d.name}'s default = { \u2026 } ${c.error}`, d.def.pos);
          defBinding = c.fn;
        }
        specs[d.name] = {
          def: Object.hasOwn(defs, d.name) ? defs[d.name] : void 0,
          // The runtime half of the slot's identity: a prevailing declaration
          // makes the accessor's unset branch the follow walk (attributes.ts);
          // a readonly one makes its setter throw (its `{ }` default is the
          // value, evaluated live and un-overridable).
          prevailing: d.prevailing || void 0,
          readOnly: d.readOnly || void 0,
          defBinding,
          defOuter: outer || void 0
        };
      }
      defineAttributes(cls, specs);
    }
    return cls;
  }
  function ctorWithDecls(el, base2, schema, isComponent) {
    if (el.decls.length === 0)
      return base2;
    let ctor = ANON.get(el);
    if (ctor === void 0) {
      const defaults = () => {
        const defs = {};
        for (const d of el.decls) {
          const r = checkDecl(schema, d, schema.name, isComponent);
          if (!r.ok)
            throw r.error;
          defs[d.name] = r.value;
        }
        return defs;
      };
      ctor = synthesize(base2, base2.name, el, defaults, true);
      ANON.set(el, ctor);
    }
    return ctor;
  }
  function construct(el, outer, ctx, parentSchema = null) {
    const baseCtor = Object.hasOwn(ctx.tags, el.tag) ? ctx.tags[el.tag] : null;
    const schema = Object.hasOwn(ctx.schemas, el.tag) ? ctx.schemas[el.tag] : null;
    if (schema !== null && descendsFrom(schema, "Layout")) {
      throw new DeclareError(`'${el.tag}' is a layout \u2014 a layout is an attribute, not a child: write 'layout: ${el.tag} [ \u2026 ]' on the view it arranges`, el.pos);
    }
    if (schema !== null && descendsFrom(schema, "Dataset")) {
      return constructData(el, schema, outer, ctx);
    }
    if (schema !== null && descendsFrom(schema, "Animator")) {
      return constructAnimator(el, schema, outer, ctx);
    }
    if (schema !== null && descendsFrom(schema, "AnimatorGroup")) {
      return constructAnimatorGroup(el, schema, outer, ctx);
    }
    if (schema !== null && Object.hasOwn(SOURCES, el.tag)) {
      return constructSource(el, schema, outer, ctx);
    }
    if (schema !== null && descendsFrom(schema, "State")) {
      return constructState(el, schema, outer, ctx, parentSchema);
    }
    if (baseCtor === null || schema === null)
      throw new DeclareError(`unknown component '${el.tag}'`, el.pos);
    const user = ctx.classes.get(el.tag);
    const view = new (ctorWithDecls(el, baseCtor, schema, (n) => ctx.schemas[n] !== void 0))();
    view.classroot = outer;
    const croot = outer ?? view;
    const eff = withDecls(schema, el.decls, (n) => ctx.schemas[n] !== void 0);
    const methods = /* @__PURE__ */ new Map();
    const attrs = /* @__PURE__ */ new Map();
    const sources = [...(user?.chain ?? []).map((body) => ({ el: body, croot: view })), { el, croot }];
    for (const s of sources)
      if (s.el.link)
        view._navLink = s.el.link;
    for (const s of sources) {
      for (const m of s.el.methods)
        methods.set(m.name, { m, croot: s.croot });
    }
    for (const s of sources.slice(0, -1)) {
      for (const a of s.el.attrs)
        attrs.set(a.name, { attr: a, croot: s.croot });
    }
    for (const name of effectiveStyles(sources, eff)) {
      const bundle = ctx.bundles.get(name);
      if (bundle === void 0) {
        throw new DeclareError(`no style named '${name}' \u2014 this program declares ${ctx.bundles.size > 0 ? [...ctx.bundles.keys()].join(", ") : "no style bundles"}`, el.pos);
      }
      for (const a of bundle.attrs)
        attrs.set(a.name, { attr: a, croot: view });
    }
    for (const a of el.attrs)
      attrs.set(a.name, { attr: a, croot });
    let layoutEl = null;
    for (const s of sources) {
      for (const a of s.el.attrs) {
        if (attrType(eff, a.name)?.kind === "component")
          layoutEl = null;
      }
      for (const c of s.el.children) {
        if (c.name !== null && attrType(eff, c.name)?.kind === "component")
          layoutEl = c;
      }
    }
    if (layoutEl !== null) {
      const t = attrType(eff, layoutEl.name);
      if (t !== null && t.kind === "component")
        ctx.pending.push({ view, layoutEl, of: t.of });
    }
    for (const { m, croot: mcroot } of methods.values()) {
      if (!ctx.trusted) {
        const r = checkMethod(eff, m);
        if (!r.ok)
          throw r.error;
      }
      if (m.name in view) {
        throw new DeclareError(`${schema.name}.${m.name}: '${m.name}' is a built-in member of the runtime ${schema.name} \u2014 choose another name`, m.pos);
      }
      const c = compileBody(m.params.map((p) => p.name), m.body);
      if ("error" in c)
        throw new DeclareError(`${schema.name}.${m.name}(\u2026) ${c.error}`, m.bodyPos);
      const fn = c.fn;
      const installed = (...args) => fn.call(view, view.parent, mcroot, ...args);
      view[m.name] = installed;
    }
    for (const { attr, croot: acroot } of attrs.values()) {
      const t0 = attrType(eff, attr.name);
      if (t0?.kind === "styles" && attr.value.kind === "list") {
        view[attr.name] = Object.freeze(attr.value.items.flatMap((n) => n.kind === "ident" ? [n.name] : []));
        continue;
      }
      if (t0?.kind === "array" && attr.value.kind === "list") {
        view[attr.name] = Object.freeze(attr.value.items.map((it) => {
          if (it.kind === "number" || it.kind === "string")
            return it.value;
          if (it.kind === "hexColor") {
            const c = coerce({ kind: "color" }, it);
            return c.ok ? c.value : null;
          }
          if (it.kind === "ident") {
            if (it.name === "null")
              return null;
            if (it.name === "true")
              return true;
            if (it.name === "false")
              return false;
            const c = coerce({ kind: "color" }, it);
            return c.ok ? c.value : null;
          }
          return null;
        }));
        continue;
      }
      if (t0?.kind === "styles" && attr.value.kind === "code") {
        throw new DeclareError(`${eff.name}.styles = { \u2026 }: the bundle list is static (ruled v1) \u2014 conditional looks are constraints on the slots themselves`, attr.value.pos);
      }
      if (t0?.kind === "stylesheet" && attr.value.kind === "ident" && attr.value.name !== "null") {
        const stylesheet = ctx.stylesheets.get(attr.value.name);
        if (stylesheet === void 0) {
          throw new DeclareError(ctx.stylesheets.size > 0 ? `no stylesheet named '${attr.value.name}' \u2014 declared stylesheets: ${[...ctx.stylesheets.keys()].join(", ")}` : `no stylesheet named '${attr.value.name}' \u2014 this program declares no stylesheets`, attr.value.pos);
        }
        view[attr.name] = stylesheet;
        continue;
      }
      if (t0?.kind === "font" && (attr.value.kind === "ident" && attr.value.name !== "null" || attr.value.kind === "list")) {
        const familyOf = (name, pos) => {
          const font = ctx.fonts.get(name);
          if (font === void 0) {
            throw new DeclareError(ctx.fonts.size > 0 ? `no font named '${name}' \u2014 declared fonts: ${[...ctx.fonts.keys()].join(", ")}` : `no font named '${name}' \u2014 this program declares no fonts`, pos);
          }
          return font.family;
        };
        const family = attr.value.kind === "ident" ? familyOf(attr.value.name, attr.value.pos) : attr.value.items.map((i) => {
          if (i.kind === "ident")
            return familyOf(i.name, i.pos);
          if (i.kind === "string")
            return i.value;
          throw new DeclareError(`a fontFamily list holds font names and strings`, i.pos);
        }).join(", ");
        view[attr.name] = family;
        continue;
      }
      const r = routeAttr(eff, attr, ctx.trusted);
      if (!r.ok)
        throw r.error;
      if ("binding" in r) {
        if (attr.bind === "two") {
          ctx.pending.push({ view, attr, twoWayCode: r.binding.src, type: attrType(eff, attr.name), classroot: acroot });
        } else if (attrType(eff, attr.name)?.kind === "cursor") {
          ctx.pending.push({ view, attr, cursorCode: r.binding.src, classroot: acroot });
        } else {
          ctx.pending.push({ view, attr, code: r.binding.src, classroot: acroot });
        }
      } else if ("datapath" in r) {
        const t = attrType(eff, attr.name);
        if (t.kind === "cursor") {
          if (r.datapath.many) {
            throw new DeclareError(`':${r.datapath.path}[]' makes many instances \u2014 a replication belongs on a child element, not here`, r.datapath.pos);
          }
          const cSegs = r.datapath.plan === void 0 ? null : staticSegs(r.datapath.plan);
          if (r.datapath.plan !== void 0 && cSegs === null) {
            throw new DeclareError(`datapath = :${r.datapath.path} \u2014 a cursor is ONE place; a selective or data-resolved path matches elsewhere. Read it as a value, or replicate over it: datapath = :${r.datapath.path}[]`, r.datapath.pos);
          }
          ctx.pending.push({ view, attr, cursorPath: cSegs ?? r.datapath.path });
        } else if (attr.bind === "two") {
          const wSegs = r.datapath.plan === void 0 ? null : staticSegs(r.datapath.plan);
          if (r.datapath.plan !== void 0 && wSegs === null) {
            throw new DeclareError(`'${attr.name} <-> :${r.datapath.path}' \u2014 a two-way binding writes ONE place; a selective or data-resolved path cannot name it`, r.datapath.pos);
          }
          ctx.pending.push({ view, attr, twoWay: wSegs ?? r.datapath.path, type: t });
        } else {
          ctx.pending.push({ view, attr, dataPath: r.datapath.path, type: t, plan: r.datapath.plan });
        }
      } else if (isPercent(r.value)) {
        ctx.pending.push({ view, attr, percent: r.value.percent });
      } else if (isAlign(r.value)) {
        ctx.pending.push({ view, attr, align: r.value.align });
      } else {
        view[attr.name] = r.value;
      }
    }
    const slot = { prev: null };
    if (user !== void 0) {
      if (ctx.expanding.has(el.tag)) {
        throw new DeclareError(`class ${el.tag} contains itself \u2014 a class may not appear inside its own body`, el.pos);
      }
      ctx.expanding.add(el.tag);
      try {
        for (const body of user.chain)
          appendChildren(body, view, view, ctx, eff, slot);
      } finally {
        ctx.expanding.delete(el.tag);
      }
    }
    appendChildren(el, view, croot, ctx, eff, slot);
    return view;
  }
  function effectiveStyles(sources, eff) {
    let names = [];
    for (const s of sources) {
      for (const a of s.el.attrs) {
        if (attrType(eff, a.name)?.kind !== "styles")
          continue;
        names = a.value.kind === "list" ? a.value.items.flatMap((n) => n.kind === "ident" ? [n.name] : []) : [];
      }
    }
    return names;
  }
  function constructData(el, schema, outer, ctx) {
    const handlers = el.methods.filter((m) => el.tag === "DataSource" && m.name === "onLoad");
    if (el.decls.length > 0 || el.methods.length > handlers.length || el.children.length > 0) {
      throw new DeclareError(`a ${el.tag} takes attributes only`, el.pos);
    }
    const node = new DATA[el.tag]();
    for (const m of handlers) {
      const c = compileBody(m.params.map((p) => p.name), m.body);
      if ("error" in c)
        throw new DeclareError(`${schema.name}.${m.name}(\u2026) ${c.error}`, m.bodyPos);
      const fn = c.fn;
      node[m.name] = (...args) => fn.call(node, node.parent, outer, ...args);
    }
    for (const a of el.attrs) {
      const r = routeAttr(schema, a, ctx.trusted);
      if (!r.ok)
        throw r.error;
      if ("binding" in r)
        ctx.pending.push({ view: node, attr: a, code: r.binding.src, classroot: outer });
      else if ("datapath" in r) {
        throw new DeclareError(`${el.tag}.${a.name} = :${r.datapath.path}: a data node is where data lives \u2014 a :path reads a view's cursor`, r.datapath.pos);
      } else if (isPercent(r.value)) {
        throw new DeclareError(`${el.tag}.${a.name}: no axis to resolve a percent against`, a.value.pos);
      } else {
        node[a.name] = r.value;
      }
    }
    if (el.tag === "Dataset") {
      const derived = el.attrs.some((a) => a.name === "contents");
      if (el.raw === void 0 && !derived) {
        throw new DeclareError(`a Dataset needs data \u2014 a JSON body '{ \u2026 }' or a derived 'contents = { \u2026 }'`, el.pos);
      }
      if (el.raw !== void 0) {
        let value;
        try {
          value = JSON.parse(el.raw.src);
        } catch (e) {
          throw new DeclareError(`${el.name ?? el.tag}: the Dataset body is not valid JSON \u2014 ${e.message}`, el.raw.pos);
        }
        const shape = node.schema;
        if (shape !== null) {
          const err2 = validateShape(value, shape);
          if (err2 !== null) {
            throw new DeclareError(`${el.name ?? el.tag}: the embedded data does not match the schema \u2014 ${err2}`, el.raw.pos);
          }
        }
        node.value = value;
      }
    } else if (el.raw !== void 0) {
      throw new DeclareError(`a ${el.tag}'s data arrives from its url \u2014 only a Dataset embeds a { } body`, el.raw.pos);
    }
    return node;
  }
  function constructAnimator(el, schema, outer, ctx) {
    if (el.decls.length > 0 || el.children.length > 0) {
      throw new DeclareError(`an ${el.tag} takes attributes and on* handlers only`, el.pos);
    }
    if (el.raw !== void 0) {
      throw new DeclareError(`only a Dataset carries a { } body \u2014 an ${el.tag}'s members go in [ ]`, el.raw.pos);
    }
    const node = new ANIMATORS[el.tag]();
    for (const m of el.methods) {
      if (!ctx.trusted) {
        const r = checkMethod(schema, m);
        if (!r.ok)
          throw r.error;
      }
      if (m.name in node) {
        throw new DeclareError(`${schema.name}.${m.name}: '${m.name}' is a built-in member of the runtime ${schema.name} \u2014 choose another name`, m.pos);
      }
      const c = compileBody(m.params.map((p) => p.name), m.body);
      if ("error" in c)
        throw new DeclareError(`${schema.name}.${m.name}(\u2026) ${c.error}`, m.bodyPos);
      const fn = c.fn;
      node[m.name] = (...args) => fn.call(node, node.parent, outer, ...args);
    }
    for (const a of el.attrs) {
      const r = routeAttr(schema, a, ctx.trusted);
      if (!r.ok)
        throw r.error;
      if ("binding" in r)
        ctx.pending.push({ view: node, attr: a, code: r.binding.src, classroot: outer });
      else if ("datapath" in r) {
        throw new DeclareError(`${el.tag}.${a.name}: an animator attribute is a value or a { }, not a data read`, a.value.pos);
      } else if (isPercent(r.value)) {
        throw new DeclareError(`${el.tag}.${a.name}: no axis to resolve a percent against`, a.value.pos);
      } else {
        node[a.name] = r.value;
      }
    }
    return node;
  }
  function constructSource(el, schema, outer, ctx) {
    if (el.decls.length > 0 || el.children.length > 0) {
      throw new DeclareError(`a ${el.tag} takes attributes and its own handlers only`, el.pos);
    }
    if (el.raw !== void 0) {
      throw new DeclareError(`only a Dataset carries a { } body \u2014 a ${el.tag}'s members go in [ ]`, el.raw.pos);
    }
    const node = new SOURCES[el.tag]();
    for (const m of el.methods) {
      if (!ctx.trusted) {
        const r = checkMethod(schema, m);
        if (!r.ok)
          throw r.error;
      }
      if (m.name in node) {
        throw new DeclareError(`${schema.name}.${m.name}: '${m.name}' is a built-in member of the runtime ${schema.name} \u2014 choose another name`, m.pos);
      }
      const c = compileBody(m.params.map((p) => p.name), m.body);
      if ("error" in c)
        throw new DeclareError(`${schema.name}.${m.name}(\u2026) ${c.error}`, m.bodyPos);
      const fn = c.fn;
      node[m.name] = (...args) => fn.call(node, node.parent, outer, ...args);
    }
    for (const a of el.attrs) {
      if (attrType(schema, a.name)?.kind === "array" && a.value.kind === "list") {
        node[a.name] = Object.freeze(a.value.items.map((it) => {
          if (it.kind === "number" || it.kind === "string")
            return it.value;
          if (it.kind === "ident") {
            if (it.name === "null")
              return null;
            if (it.name === "true")
              return true;
            if (it.name === "false")
              return false;
          }
          return null;
        }));
        continue;
      }
      const r = routeAttr(schema, a, ctx.trusted);
      if (!r.ok)
        throw r.error;
      if ("binding" in r)
        ctx.pending.push({ view: node, attr: a, code: r.binding.src, classroot: outer });
      else if ("datapath" in r) {
        throw new DeclareError(`${el.tag}.${a.name}: a ${el.tag} attribute is a value or a { }, not a data read`, a.value.pos);
      } else if (isPercent(r.value)) {
        throw new DeclareError(`${el.tag}.${a.name}: no axis to resolve a percent against`, a.value.pos);
      } else {
        node[a.name] = r.value;
      }
    }
    return node;
  }
  function constructAnimatorGroup(el, schema, outer, ctx, inherited = {}) {
    if (el.raw !== void 0) {
      throw new DeclareError(`only a Dataset carries a { } body \u2014 an ${el.tag}'s members go in [ ]`, el.raw.pos);
    }
    if (el.decls.length > 0) {
      throw new DeclareError(`an ${el.tag} takes attributes, on* handlers, and animator members only`, el.pos);
    }
    const node = new ANIMATOR_GROUPS[el.tag]();
    for (const m of el.methods) {
      if (!ctx.trusted) {
        const r = checkMethod(schema, m);
        if (!r.ok)
          throw r.error;
      }
      if (m.name in node) {
        throw new DeclareError(`${schema.name}.${m.name}: '${m.name}' is a built-in member of the runtime ${schema.name} \u2014 choose another name`, m.pos);
      }
      const c = compileBody(m.params.map((p) => p.name), m.body);
      if ("error" in c)
        throw new DeclareError(`${schema.name}.${m.name}(\u2026) ${c.error}`, m.bodyPos);
      const fn = c.fn;
      node[m.name] = (...args) => fn.call(node, node.parent, outer, ...args);
    }
    const cascade = { ...inherited };
    for (const a of el.attrs) {
      const r = routeAttr(schema, a, ctx.trusted);
      if (!r.ok)
        throw r.error;
      if ("binding" in r)
        ctx.pending.push({ view: node, attr: a, code: r.binding.src, classroot: outer });
      else if ("datapath" in r) {
        throw new DeclareError(`${el.tag}.${a.name}: an animator attribute is a value or a { }, not a data read`, a.value.pos);
      } else if (isPercent(r.value)) {
        throw new DeclareError(`${el.tag}.${a.name}: no axis to resolve a percent against`, a.value.pos);
      } else {
        node[a.name] = r.value;
        if (CASCADE_ATTRS.has(a.name))
          cascade[a.name] = r.value;
      }
    }
    for (const childEl of el.children) {
      const cs = Object.hasOwn(ctx.schemas, childEl.tag) ? ctx.schemas[childEl.tag] : null;
      if (cs === null || !(descendsFrom(cs, "Animator") || descendsFrom(cs, "AnimatorGroup"))) {
        throw new DeclareError(`an ${el.tag} coordinates animators \u2014 '${childEl.tag}' is not an Animator or AnimatorGroup`, childEl.pos);
      }
      let member;
      if (descendsFrom(cs, "AnimatorGroup")) {
        member = constructAnimatorGroup(childEl, cs, outer, ctx, cascade);
      } else {
        member = constructAnimator(childEl, cs, outer, ctx);
        const memberSet = new Set(childEl.attrs.map((a) => a.name));
        for (const k of Object.keys(cascade)) {
          if (!memberSet.has(k))
            member[k] = cascade[k];
        }
      }
      node.appendChild(member);
      member.markGrouped();
    }
    return node;
  }
  function constructState(el, schema, outer, ctx, parentSchema) {
    if (el.raw !== void 0) {
      throw new DeclareError(`only a Dataset carries a { } body \u2014 a ${el.tag}'s members go in [ ]`, el.raw.pos);
    }
    const node = new STATES[el.tag]();
    const label = el.name ?? el.tag;
    for (const m of el.methods) {
      if (!ctx.trusted) {
        const r = checkMethod(schema, m);
        if (!r.ok)
          throw r.error;
      }
      if (m.name in node) {
        throw new DeclareError(`${schema.name}.${m.name}: '${m.name}' is a built-in member of the runtime ${schema.name} \u2014 choose another name`, m.pos);
      }
      const c = compileBody(m.params.map((p) => p.name), m.body);
      if ("error" in c)
        throw new DeclareError(`${schema.name}.${m.name}(\u2026) ${c.error}`, m.bodyPos);
      const fn = c.fn;
      node[m.name] = (...args) => fn.call(node, node.parent, outer, ...args);
    }
    const overrides = [];
    for (const a of el.attrs) {
      if (a.name === "applied") {
        const r2 = routeAttr(schema, a, ctx.trusted);
        if (!r2.ok)
          throw r2.error;
        if ("binding" in r2)
          ctx.pending.push({ view: node, attr: a, code: r2.binding.src, classroot: outer });
        else if ("value" in r2)
          node.applied = r2.value;
        continue;
      }
      if (parentSchema === null) {
        throw new DeclareError(`a ${el.tag} overrides its enclosing view's slots, but '${a.name}' has no view to target here`, a.value.pos);
      }
      const r = routeAttr(parentSchema, a, ctx.trusted);
      if (!r.ok)
        throw r.error;
      const slot = a.name;
      if ("binding" in r) {
        const c = compileExpr(r.binding.src);
        if ("error" in c)
          throw new DeclareError(`${parentSchema.name}.${slot} = { \u2026 } ${c.error}`, a.value.pos);
        const fn = c.fn;
        const croot = outer;
        overrides.push({
          slot,
          make: (t) => new Constraint(`${t.constructor.name}.${slot} (state ${label})`, () => fn.call(t, t.parent, croot), (v) => setBound(t, slot, v))
        });
      } else if ("datapath" in r) {
        throw new DeclareError(`${el.tag}.${slot}: a state override is a value or a { }, not a data read`, a.value.pos);
      } else {
        const value = r.value;
        overrides.push({
          slot,
          make: (t) => new Constraint(`${t.constructor.name}.${slot} (state ${label})`, () => value, (v) => setBound(t, slot, v))
        });
      }
    }
    node.overrides = overrides;
    node.childTemplates = el.children;
    node.materialize = materializer(ctx);
    node.childClassroot = outer;
    return node;
  }
  function buildLayout(el, owner, ctx) {
    const userClass = ctx.classes.get(el.tag);
    if (userClass !== void 0) {
      const layout = new ctx.layoutCtors[el.tag]();
      layout.parent = owner;
      installLayoutClass(layout, el, userClass, owner, ctx);
      return layout;
    }
    const strategy = new LAYOUTS[el.tag]();
    strategy.parent = owner;
    const schema = ctx.schemas[el.tag];
    const croot = owner.classroot ?? owner;
    for (const a of el.attrs) {
      if (a.value.kind === "code") {
        bindConstraint(strategy, a.name, a.value.src, a.value.pos, croot);
        continue;
      }
      const r = routeAttr(schema, a, ctx.trusted);
      if (!r.ok)
        throw r.error;
      if (!("value" in r) || isPercent(r.value)) {
        throw new DeclareError(`${el.tag}.${a.name}: a layout attribute takes a literal or { }`, a.pos);
      }
      strategy[a.name] = r.value;
    }
    return strategy;
  }
  function installLayoutClass(layout, el, uc, owner, ctx) {
    const eff = withDecls(ctx.schemas[el.tag], el.decls, (n) => ctx.schemas[n] !== void 0);
    const croot = owner.classroot ?? owner;
    const self = layout;
    const methods = /* @__PURE__ */ new Map();
    for (const body of uc.chain)
      for (const m of body.methods)
        methods.set(m.name, m);
    for (const m of el.methods)
      methods.set(m.name, m);
    for (const m of methods.values()) {
      if (!ctx.trusted) {
        const r = checkMethod(eff, m);
        if (!r.ok)
          throw r.error;
      }
      if (m.name in layout) {
        throw new DeclareError(`${el.tag}.${m.name}: '${m.name}' is a built-in member of the runtime layout \u2014 choose another name`, m.pos);
      }
      const c = compileBody(m.params.map((p) => p.name), m.body);
      if ("error" in c)
        throw new DeclareError(`${el.tag}.${m.name}(\u2026) ${c.error}`, m.bodyPos);
      const fn = c.fn;
      self[m.name] = (...args) => fn.call(layout, layout.parent, croot, ...args);
    }
    const attrs = /* @__PURE__ */ new Map();
    for (const body of uc.chain)
      for (const a of body.attrs)
        attrs.set(a.name, a);
    for (const a of el.attrs)
      attrs.set(a.name, a);
    for (const a of attrs.values()) {
      if (a.value.kind === "code") {
        bindConstraint(layout, a.name, a.value.src, a.value.pos, croot);
        continue;
      }
      const r = routeAttr(eff, a, ctx.trusted);
      if (!r.ok)
        throw r.error;
      if (!("value" in r) || isPercent(r.value)) {
        throw new DeclareError(`${el.tag}.${a.name}: a layout attribute takes a literal or { }`, a.pos);
      }
      self[a.name] = r.value;
    }
  }
  function appendChildren(from, parentView, croot, ctx, eff, slot) {
    for (const childEl of from.children) {
      if (childEl.name !== null && attrType(eff, childEl.name)?.kind === "component")
        continue;
      const many = manyPathOf(childEl, ctx.schemas);
      if (many !== null && many.value.kind === "path") {
        if (childEl.name !== null) {
          throw new DeclareError(`a replicated child cannot be named \u2014 ':${many.value.path}[]' makes one instance per record, and '${childEl.name}' can only name one; reach the instances through their data`, childEl.pos);
        }
        const keyAttr = childEl.attrs.find((a) => a.name === "key" && a.value.kind === "path");
        const keyPath = keyAttr !== void 0 ? keyAttr.value.path : null;
        const vAttr = childEl.attrs.find((a) => a.name === "virtualize");
        let policy = false;
        if (vAttr !== void 0) {
          const wv = vAttr.value;
          if (wv.kind === "code") {
            const c = compileExpr(wv.src ?? "");
            if ("error" in c)
              throw new DeclareError(`virtualize = { \u2026 } ${c.error}`, vAttr.value.pos);
            const fn = c.fn;
            policy = () => !!fn.call(parentView, parentView.parent, croot);
          } else {
            policy = wv.name === "true";
          }
        }
        const replicator = new Replicator(parentView, childEl, many.value.path, croot, materializer(ctx), slot.prev, keyPath, many.value.plan ?? null, policy);
        ctx.pending.push({ replicator });
        slot.prev = replicator;
        continue;
      }
      const child = construct(childEl, croot, ctx, eff);
      parentView.appendChild(child);
      if (child instanceof State)
        child.onLinked();
      slot.prev = child;
      if (childEl.name !== null) {
        if (childEl.name in parentView) {
          throw new DeclareError(`'${childEl.name}' is already a member of the running ${parentView.constructor.name} \u2014 choose another name for this child`, childEl.pos);
        }
        parentView[childEl.name] = child;
      }
    }
  }
  function createViewIn(root, tag, parent, props) {
    const ctx = CONTEXTS.get(root);
    if (ctx === void 0) {
      throw new DeclareError(`createView: this tree was not built from a program (no registry to resolve '${tag}' against)`);
    }
    if (!Object.hasOwn(ctx.tags, tag)) {
      const hint = tag in TAGS2 ? "" : ` \u2014 declare the class, include its library, or keep it with 'use [ ${tag} ]'`;
      throw new DeclareError(`createView: no component named '${tag}'${hint}`);
    }
    const el = { tag, name: null, attrs: [], decls: [], methods: [], children: [], pos: { line: 0, col: 0 } };
    const made = materializer(ctx)(el, parent);
    parent.insertChild(made.view, parent.children.length);
    const ps = parent.surface;
    if (ps !== null && parent.backend !== null)
      made.view.attach(parent.backend, ps, null);
    if (props !== void 0) {
      for (const [k, v] of Object.entries(props)) {
        const val = k === "datapath" && v !== null && !v?.data ? toCursor(v, "createView: the datapath prop") : v;
        made.view[k] = val;
      }
    }
    made.finish();
    return made.view;
  }
  function materializer(ctx) {
    return (template, classroot) => {
      const saved = ctx.pending;
      ctx.pending = [];
      try {
        const node = withScriptScope(CURRENT_SCRIPTS, () => construct(template, classroot, ctx));
        if (!(node instanceof View)) {
          throw new DeclareError(`a ${template.tag} cannot replicate \u2014 it is not a view`, template.pos);
        }
        const pending = ctx.pending;
        return {
          view: node,
          // finish COMPILES (installPending binds constraints, which capture
          // the script scope at compile time) — it needs the scope exactly as
          // construct does
          finish: () => {
            withScriptScope(CURRENT_SCRIPTS, () => installPending(pending, ctx));
            initTree(node);
          },
          // Membership-anchored init (the D5 ruling): the reconciler calls this
          // before finish when the record's membership already fired its init —
          // a reconstructed window row, a keyed re-derivation — so initTree
          // stays silent for the whole subtree.
          suppressInit: () => markInited(node)
        };
      } finally {
        ctx.pending = saved;
      }
    };
  }
  function createElementIn(root, el, parent) {
    const ctx = CONTEXTS.get(root);
    if (ctx === void 0) {
      throw new DeclareError("evaluate: this tree was not built from a program (no registry to resolve against)");
    }
    const wasTrusted = ctx.trusted;
    ctx.trusted = false;
    try {
      const made = materializer(ctx)(el, parent);
      parent.insertChild(made.view, parent.children.length);
      const ps = parent.surface;
      if (ps !== null && parent.backend !== null)
        made.view.attach(parent.backend, ps, null);
      made.finish();
      return made.view;
    } finally {
      ctx.trusted = wasTrusted;
    }
  }
  var CURRENT_SCRIPTS, INITED, ANON, CASCADE_ATTRS, CONTEXTS;
  var init_instantiate = __esm({
    "runtime/dist/instantiate.js"() {
      "use strict";
      init_errors();
      init_view();
      init_node();
      init_layout();
      init_animator();
      init_spring();
      init_state();
      init_reactive();
      init_schema();
      init_check();
      init_program_schema();
      init_stylesheet();
      init_font();
      init_expr();
      init_value();
      init_attributes();
      init_bind();
      init_editor();
      init_replicate();
      init_datapath();
      init_view();
      init_data();
      init_data_schema();
      init_registry();
      CURRENT_SCRIPTS = {};
      INITED = /* @__PURE__ */ new WeakSet();
      ANON = /* @__PURE__ */ new WeakMap();
      CASCADE_ATTRS = /* @__PURE__ */ new Set([
        "attribute",
        "to",
        "from",
        "duration",
        "motion",
        "relative"
      ]);
      CONTEXTS = /* @__PURE__ */ new WeakMap();
      provideViewCreator(createViewIn);
    }
  });

  // runtime/dist/inspect-service.js
  var inspect_service_exports = {};
  __export(inspect_service_exports, {
    Inspect: () => Inspect,
    evaluateIn: () => evaluateIn,
    inspectionOrigin: () => inspectionOrigin,
    inspectionTarget: () => inspectionTarget,
    setInspectionTarget: () => setInspectionTarget
  });
  function setInspectionTarget(app, origin = ZERO) {
    TARGET = app;
    ORIGIN = origin;
  }
  function inspectionOrigin() {
    return ORIGIN();
  }
  function inspectionTarget() {
    return TARGET;
  }
  function rectOf(n) {
    if (!(n instanceof View))
      return null;
    const o = rootFrameOrigin(n);
    return { x: o.x, y: o.y, width: n.width || 0, height: n.height || 0 };
  }
  function rows(n, open, depth, path, out) {
    let anyConstrained = false;
    let anyMotion = false;
    let kidCount = 0;
    try {
      anyConstrained = ownedSlots(n).length > 0;
    } catch {
    }
    for (const c of n.children) {
      if (c instanceof View)
        kidCount++;
      const cn = c.constructor.name;
      if (!anyMotion && (cn === "Spring" || cn === "Animator" || cn === "AnimatorGroup"))
        anyMotion = true;
    }
    const kids = { length: kidCount };
    out.push({
      path,
      name: memberOf(n) ?? "",
      kind: kindName(n),
      depth,
      hasKids: kids.length > 0,
      visible: n instanceof View ? n.visible !== false : true,
      constrained: anyConstrained,
      motion: anyMotion
    });
    if (open[path] !== true)
      return;
    n.children.forEach((c, i) => {
      if (!(c instanceof View))
        return;
      rows(c, open, depth + 1, `${path}.${memberOf(c) ?? i}`, out);
    });
  }
  function splitAssign(src) {
    let depth = 0;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (c === "(" || c === "[" || c === "{")
        depth++;
      else if (c === ")" || c === "]" || c === "}")
        depth--;
      else if (c === "=" && depth === 0) {
        const prev = src[i - 1], next = src[i + 1];
        if (next === "=" || prev === "=" || prev === "!" || prev === "<" || prev === ">")
          continue;
        const attr = src.slice(0, i).trim();
        if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(attr))
          return null;
        return { attr, rest: src.slice(i + 1).trim() };
      }
    }
    return null;
  }
  function show(v) {
    if (v === null || v === void 0)
      return "null";
    const t = typeof v;
    if (t === "string")
      return JSON.stringify(v);
    if (t === "number")
      return Number.isInteger(v) ? String(v) : v.toFixed(3);
    if (t === "boolean" || t === "bigint")
      return String(v);
    if (t === "function")
      return "\xABfn\xBB";
    if (v instanceof View)
      return `${v.constructor.name} \u203A`;
    if (Array.isArray(v))
      return `array[${v.length}]`;
    try {
      return JSON.stringify(v).slice(0, 400);
    } catch {
      return String(v);
    }
  }
  function cursorRecord(node) {
    const c = inheritedCursor(node);
    if (c === null)
      return void 0;
    try {
      return c.data.read([...c.path]);
    } catch {
      return void 0;
    }
  }
  function cursorKeys(node) {
    const r = cursorRecord(node);
    if (r === null || r === void 0 || typeof r !== "object")
      return [];
    return Array.isArray(r) ? r.map((_, i) => String(i)) : Object.keys(r);
  }
  function datapathGuard(node, src) {
    const islands = scanDatapaths(src);
    if (islands.length === 0)
      return null;
    const many = islands.find((p) => p.many);
    if (many !== void 0) {
      return `':${many.path}[]' is a many-path \u2014 it replicates, and belongs on a datapath attribute, not in an expression`;
    }
    if (inheritedCursor(node) === null) {
      return `this view has no data cursor, so ':${islands[0].path}' reads nothing.
Select a view under a 'datapath' (a replicated row) to read ':' paths.`;
    }
    return null;
  }
  function qualify(node, src) {
    let out = "";
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '"' || ch === "'" || ch === "`") {
        const quote = ch;
        let j = i + 1;
        while (j < src.length && src[j] !== quote) {
          if (src[j] === "\\")
            j++;
          j++;
        }
        out += src.slice(i, Math.min(j + 1, src.length));
        i = j + 1;
        continue;
      }
      if (/[A-Za-z_$]/.test(ch)) {
        let j = i;
        while (j < src.length && /[A-Za-z0-9_$]/.test(src[j]))
          j++;
        const word = src.slice(i, j);
        const prev = out.replace(/\s+$/, "").slice(-1);
        const after = src.slice(j).replace(/^\s+/, "").slice(0, 1);
        const member = prev === "." || prev === "?";
        const key = after === ":";
        if (!member && !key && !KEYWORDS.has(word)) {
          if (word === "app")
            out += "this.root";
          else if (word in node)
            out += `this.${word}`;
          else
            out += word;
        } else
          out += word;
        i = j;
        continue;
      }
      out += ch;
      i++;
    }
    return out;
  }
  function evaluateIn(app, path, src) {
    const trimmed = src.trim();
    const fail2 = (text, input = trimmed) => ({ ok: false, input, text, verb: "error" });
    if (trimmed === "")
      return fail2("");
    const node = find(app, path);
    if (node === null)
      return fail2(`no object at '${path}'`);
    const self = node;
    const classroot = node.classroot ?? null;
    const run = (body2) => {
      const guard = datapathGuard(node, body2);
      if (guard !== null)
        return { error: guard };
      const bad = VALIDATE(qualify(node, body2));
      if (bad !== null)
        return { error: bad };
      const c = compileExpr(qualify(node, body2));
      if ("error" in c)
        return { error: c.error };
      try {
        const value = c.fn.call(node, node.parent, classroot);
        const islands = scanDatapaths(body2);
        if (value === null && islands.length > 0) {
          const keys = cursorKeys(node);
          const missing = islands.filter((p) => {
            const head = p.path.split(".")[0];
            return keys.length > 0 && !keys.includes(head);
          });
          if (missing.length > 0) {
            return { error: `':${missing[0].path}' is not in this record.
it has: ${keys.join(", ")}` };
          }
        }
        return { value };
      } catch (e) {
        return { error: `threw \u2014 ${e.message}` };
      }
    };
    if (isViewLiteral(trimmed)) {
      if (!(node instanceof View))
        return fail2("only a View can take a child");
      try {
        const prog = parseProgram(`App [
${trimmed}
]`);
        const el = prog.root.children[0];
        if (el === void 0)
          return fail2("that parsed to no view");
        const made = createElementIn(app, el, node);
        settle();
        return {
          ok: true,
          input: trimmed,
          verb: "view",
          temporary: true,
          text: `added ${kindName(made)} to ${path}`
        };
      } catch (e) {
        if (e instanceof DeclareErrors)
          return fail2(e.errors.map((x) => x.message).join("\n"));
        return fail2(e.message);
      }
    }
    const asg = splitAssign(trimmed);
    if (asg !== null) {
      const { attr, rest } = asg;
      const body2 = unwrapBody(rest);
      if (body2 !== null) {
        const guard = datapathGuard(node, body2);
        if (guard !== null)
          return fail2(guard);
        const q = qualify(node, body2);
        const bad = VALIDATE(q);
        if (bad !== null)
          return fail2(bad);
        try {
          if (ownerOf(node, attr) !== null)
            disown(node, attr);
          bindConstraint(node, attr, q, { line: 0, col: 0 }, classroot);
          const owner = ownerOf(node, attr);
          if (owner !== null)
            owner.live = true;
          settle();
          return {
            ok: true,
            input: trimmed,
            verb: "bind",
            temporary: true,
            text: `${attr} is now bound \u2014 temporary, it will not survive a reload`
          };
        } catch (e) {
          return fail2(e.message);
        }
      }
      const r2 = run(rest);
      if ("error" in r2)
        return fail2(r2.error);
      if (ownerOf(node, attr) !== null) {
        return fail2(`${attr} is held by a constraint, so a plain write would be overwritten on the next settle.
Replace the constraint instead:  ${attr} = { \u2026 }`);
      }
      try {
        self[attr] = r2.value;
        settle();
        return { ok: true, input: trimmed, verb: "set", text: `${attr} = ${show(r2.value)}` };
      } catch (e) {
        return fail2(e.message);
      }
    }
    const body = unwrapBody(trimmed);
    const r = run(body ?? trimmed);
    if ("error" in r)
      return fail2(r.error);
    const verb = body === null && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(trimmed) ? "read" : "eval";
    return { ok: true, input: trimmed, verb, text: show(r.value) };
  }
  function pathOfNode(n) {
    const parts = [];
    let cur = n;
    while (cur !== null && cur.parent !== null) {
      const m = memberOf(cur);
      parts.unshift(m ?? String(cur.parent.children.indexOf(cur)));
      cur = cur.parent;
    }
    return ["app", ...parts].join(".");
  }
  var TARGET, ZERO, ORIGIN, VALIDATE, lastRows, lastRowsSig, needTarget, memberOf, isViewLiteral, unwrapBody, KEYWORDS, Inspect;
  var init_inspect_service = __esm({
    "runtime/dist/inspect-service.js"() {
      "use strict";
      init_node();
      init_view();
      init_interaction();
      init_inspect();
      init_expr();
      init_datapath();
      init_parser();
      init_bind();
      init_attributes();
      init_instantiate();
      init_errors();
      init_reactive();
      TARGET = null;
      ZERO = () => ({ x: 0, y: 0 });
      ORIGIN = ZERO;
      VALIDATE = validateExpr;
      lastRows = [];
      lastRowsSig = "";
      needTarget = () => {
        if (TARGET === null)
          throw new DeclareError("Inspect: no subject app is attached");
        return TARGET;
      };
      memberOf = (c) => nameOf(c);
      isViewLiteral = (s) => /^[A-Z][A-Za-z0-9_]*\s*\[/.test(s.trim());
      unwrapBody = (s) => {
        const t = s.trim();
        return t.startsWith("{") && t.endsWith("}") ? t.slice(1, -1).trim() : null;
      };
      KEYWORDS = /* @__PURE__ */ new Set([
        "true",
        "false",
        "null",
        "undefined",
        "new",
        "typeof",
        "instanceof",
        "in",
        "of",
        "return",
        "const",
        "let",
        "var",
        "if",
        "else",
        "for",
        "while",
        "do",
        "function",
        "this",
        "parent",
        "classroot",
        "void",
        "delete",
        "class",
        "extends",
        "yield",
        "await"
      ]);
      Inspect = {
        ready: () => TARGET !== null,
        /** Flattened tree rows honouring the caller's open-set.
         *
         *  MEMOISED on the rendered content, and it matters more than it looks: the
         *  caller feeds this straight into a Dataset that replicates one view per row.
         *  Handing back a fresh array on every refresh tick makes replication rebuild
         *  hundreds of views several times a second — which is nearly all the CPU an
         *  open Inspector used to burn. Identical content returns the IDENTICAL array,
         *  so the equality gate upstream stops the churn dead. */
        rows: (open) => {
          const out = [];
          rows(needTarget(), open ?? {}, 0, "app", out);
          const sig = JSON.stringify(out);
          if (sig === lastRowsSig)
            return lastRows;
          lastRowsSig = sig;
          lastRows = out;
          return out;
        },
        node: (path) => inspect(needTarget(), path),
        kindOf: (path) => {
          const n = find(needTarget(), path);
          return n === null ? "" : kindName(n);
        },
        slots: (path) => {
          const n = find(needTarget(), path);
          return n === null ? [] : slotsOf(n);
        },
        explain: (path, attr) => {
          const n = find(needTarget(), path);
          return n === null ? null : explain(n, attr);
        },
        /** The current value of one of a constraint's wired read-paths, resolved
         *  against the owning node — what makes the dependency list live. */
        depValue: (path, readPath) => {
          const n = find(needTarget(), path);
          if (n === null)
            return "";
          const c = compileExpr(readPath);
          if ("error" in c)
            return "";
          try {
            return show(c.fn.call(n, n.parent, n.classroot ?? null));
          } catch {
            return "\u2014";
          }
        },
        /** Does a read-path name a view? Then the Why pane can offer to outline it. */
        depTargetPath: (path, readPath) => {
          const n = find(needTarget(), path);
          if (n === null)
            return "";
          const c = compileExpr(readPath.replace(/\.[A-Za-z0-9_$]+$/, ""));
          if ("error" in c)
            return "";
          try {
            const v = c.fn.call(n, n.parent, n.classroot ?? null);
            if (!(v instanceof View))
              return "";
            return pathOfNode(v);
          } catch {
            return "";
          }
        },
        expand: (path, attr, trail) => {
          const n = find(needTarget(), path);
          return n === null ? { kind: "primitive", text: "" } : expandValue(n, attr, trail);
        },
        dependents: (attr) => dependentsOf(needTarget(), attr),
        rect: (path) => {
          const n = find(needTarget(), path);
          if (n === null)
            return null;
          const r = rectOf(n);
          if (r === null)
            return null;
          const o = ORIGIN();
          return { x: r.x + o.x, y: r.y + o.y, width: r.width, height: r.height };
        },
        at: (x, y) => {
          const o = ORIGIN();
          const v = pickAt(needTarget(), x - o.x, y - o.y);
          return v === null ? "" : pathOfNode(v);
        },
        /** WHY the point resolved that way — the hit walk's own decisions in order.
         *  `at` answers what, which is enough when the answer is right and useless
         *  when it is wrong; every interaction bug of the 2026-07 run was a
         *  disagreement between where a view paints and where the walk thinks it is,
         *  and each was diagnosed from outside because nothing could be asked. The
         *  narration instruments THE walk, so it cannot drift from the router, and
         *  it is backend-neutral: the same answer over the DOM bridge, the canvas
         *  host, and the native control channel's `eval`. `pierce` defaults to the
         *  ROUTER's rule (false), so a pointer-transparent view reports as skipped
         *  rather than quietly being the answer — which is the shape of the
         *  homepage's cursor-dot bug, where the dot settled under every resting
         *  pointer and swallowed the page's hover and press. */
        explainHit: (x, y, pierce = false) => {
          const o = ORIGIN();
          return explainHit(needTarget(), x - o.x, y - o.y, pierce);
        },
        stats: () => stats(needTarget()),
        /** Is this view under a datapath? The Object pane badges it, and the
         *  evaluate strip's `:` support depends on it. */
        hasData: (path) => {
          const n = find(needTarget(), path);
          return n !== null && inheritedCursor(n) !== null;
        },
        dataKeys: (path) => {
          const n = find(needTarget(), path);
          return n === null ? [] : cursorKeys(n);
        },
        /** The cursor record as Object-pane rows — the data a `:field` would read,
         *  shown beside the view's own slots rather than hidden behind them. */
        dataRows: (path) => {
          const n = find(needTarget(), path);
          if (n === null)
            return [];
          const rec = cursorRecord(n);
          if (rec === null || rec === void 0 || typeof rec !== "object")
            return [];
          const out = [];
          for (const [k, v] of Object.entries(rec).slice(0, 200)) {
            const kind = v === null || typeof v !== "object" ? "primitive" : Array.isArray(v) ? "array" : "record";
            out.push({
              key: k,
              kind,
              text: kind === "array" ? `array[${v.length}]` : kind === "record" ? "{ }" : typeof v === "string" ? JSON.stringify(v) : String(v),
              open: kind !== "primitive"
            });
          }
          return out;
        },
        dataPreview: (path) => {
          const n = find(needTarget(), path);
          if (n === null)
            return "";
          const c = inheritedCursor(n);
          if (c === null)
            return "";
          try {
            const v = c.data.read([...c.path]);
            return JSON.stringify(v) ?? "";
          } catch {
            return "";
          }
        },
        evaluate: (path, src) => evaluateIn(needTarget(), path, src),
        clock
      };
    }
  });

  // runtime/dist/inspect.js
  function indexRegistry() {
    if (registryIndexed)
      return;
    registryIndexed = true;
    try {
      for (const table of [TAGS2, LAYOUTS, DATA, ANIMATORS, ANIMATOR_GROUPS, STATES]) {
        for (const [name, ctor] of Object.entries(table ?? {})) {
          if (typeof ctor === "function")
            REGISTRY_NAME.set(ctor, name);
        }
      }
    } catch {
    }
  }
  function stampedName(ctor) {
    const d = Object.getOwnPropertyDescriptor(ctor, "name");
    if (d === void 0 || d.configurable !== false)
      return null;
    const v = typeof d.value === "string" ? d.value : "";
    return v === "" ? null : v;
  }
  function kindName(n) {
    indexRegistry();
    let ctor = n.constructor;
    let registryHit = null;
    let hops = 0;
    while (typeof ctor === "function" && hops++ < 12) {
      const stamped = stampedName(ctor);
      if (stamped !== null)
        return stamped;
      if (registryHit === null) {
        const own2 = REGISTRY_NAME.get(ctor);
        if (own2 !== void 0)
          registryHit = own2;
      }
      ctor = Object.getPrototypeOf(ctor);
    }
    if (registryHit !== null)
      return registryHit;
    const raw = n.constructor.name;
    return raw === "" ? "View" : raw;
  }
  function safeAttr(v, depth = 0, seen = /* @__PURE__ */ new Set()) {
    if (v === null || v === void 0)
      return null;
    const t = typeof v;
    if (t === "string" || t === "boolean")
      return v;
    if (t === "number")
      return Number.isFinite(v) ? v : String(v);
    if (t === "function")
      return "\xABfn\xBB";
    if (t !== "object")
      return String(v);
    if (seen.has(v) || depth >= 4)
      return "\xAB\u2026\xBB";
    seen.add(v);
    try {
      if (Array.isArray(v))
        return v.slice(0, 64).map((e) => safeAttr(e, depth + 1, seen));
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) {
        const path = v.path;
        const name = v.constructor?.name ?? "object";
        return Array.isArray(path) ? `\xAB${name} ${path.join(".")}\xBB` : `\xAB${name}\xBB`;
      }
      const out = {};
      for (const k of Object.keys(v))
        out[k] = safeAttr(v[k], depth + 1, seen);
      return out;
    } finally {
      seen.delete(v);
    }
  }
  function nameOf(node) {
    for (const holder of [node.parent, node.classroot]) {
      if (holder === null || holder === void 0)
        continue;
      for (const k of Object.keys(holder)) {
        if (k.startsWith("$") || k === "parent" || k === "children" || k === "classroot")
          continue;
        if (holder[k] === node)
          return k;
      }
    }
    return null;
  }
  function inspect(node, path = "app") {
    const v = isView2(node) ? node : null;
    let rootX = 0, rootY = 0;
    if (v !== null) {
      const o = rootFrameOrigin(v);
      rootX = o.x;
      rootY = o.y;
    }
    let shown = true;
    for (let n = node; n !== null; n = n.parent) {
      if (isView2(n) && !n.visible) {
        shown = false;
        break;
      }
    }
    const record2 = {
      kind: kindName(node),
      name: nameOf(node),
      path,
      x: v?.x ?? 0,
      y: v?.y ?? 0,
      width: v?.width ?? 0,
      height: v?.height ?? 0,
      rootX,
      rootY,
      visible: v?.visible ?? true,
      shown,
      attrs: safeAttr(ownValues(node)),
      children: node.children.map((c, i) => {
        const childName = nameOf(c);
        return inspect(c, `${path}.${childName ?? i}`);
      })
    };
    const text = node.text;
    if (typeof text === "string" && text !== "")
      record2.text = text;
    if (v !== null) {
      const w = materializationInfo(v);
      if (w !== null)
        record2.materialization = w;
    }
    return record2;
  }
  function find(root, path) {
    const segs = path.split(".").filter((s) => s !== "");
    let cur = root;
    for (let i = segs[0] === "app" ? 1 : 0; i < segs.length; i++) {
      const seg = segs[i];
      const asIndex = /^\d+$/.test(seg) ? cur.children[Number(seg)] : void 0;
      const asName = cur[seg];
      const next = asIndex ?? (asName instanceof Node2 ? asName : void 0);
      if (next === void 0)
        return null;
      cur = next;
    }
    return cur;
  }
  function explain(node, attr) {
    const owner = ownerOf(node, attr);
    let spring = null;
    for (const c of node.children) {
      const s = c;
      if (c.constructor.name === "Spring" && s.attribute === attr) {
        spring = { target: s.to, stiffness: s.stiffness, damping: s.damping };
        break;
      }
    }
    return {
      attr,
      value: safeAttr(node[attr]),
      set: isSet(node, attr),
      constraint: owner !== null ? {
        // Composed fresh rather than echoing owner.label: that string is baked
        // at bind time from the raw constructor name, which a bundler may have
        // minified to `t`. kindName() recovers the component's real name.
        label: `${kindName(node)}.${attr}`,
        static: owner.isStatic,
        live: owner.live === true,
        deps: owner.wiredPaths,
        // A sourceless owner is machinery — and for a box slot the writer
        // is almost always the parent's layout. Name it (duck-typed on
        // `place`, the Layout contract; kindName resists minification).
        writer: owner.source == null ? (() => {
          const p = node.parent ?? null;
          const lay = p?.layout;
          return lay != null && typeof lay.place === "function" ? kindName(lay) : null;
        })() : null,
        source: owner.source,
        pos: owner.sourcePos
      } : null,
      spring
    };
  }
  function stats(root) {
    let nodes = 0, owned = 0;
    const walk = (n) => {
      nodes++;
      owned += ownedSlots(n).length;
      for (const c of n.children)
        walk(c);
    };
    walk(root);
    return { nodes, ownedSlots: owned, motionBusy: sharedClock.busy };
  }
  function primeEvalService() {
    if (evalService !== null || evalServicePriming)
      return;
    evalServicePriming = true;
    void Promise.resolve().then(() => (init_inspect_service(), inspect_service_exports)).then((m) => {
      evalService = m;
    });
  }
  function bridgeFor(root) {
    primeEvalService();
    return {
      inspect: (path) => {
        const n = path !== void 0 ? find(root, path) : root;
        return n !== null ? inspect(n, path ?? "app") : null;
      },
      find: (path) => find(root, path),
      explain: (path, attr) => {
        const n = find(root, path);
        return n !== null ? explain(n, attr) : null;
      },
      stats: () => stats(root),
      /** Geometry + causality queries — the same set the Inspector's panes use, so
       *  an agent, an assert script and the UI all ask the identical questions. */
      slots: (path) => {
        const n = find(root, path);
        return n === null ? [] : slotsOf(n);
      },
      expand: (path, attr, trail = []) => {
        const n = find(root, path);
        return n === null ? null : expandValue(n, attr, trail);
      },
      at: (x, y, pierce = false) => {
        const v = pickAt(root, x, y, pierce);
        return v === null ? null : { path: pathOf(root, v), kind: kindName(v) };
      },
      /** WHY that point resolved so — the hit walk's own decisions in order.
       *  On the bridge because this is the question a HOST asks: the DOM's
       *  `__declare`, the canvas page, and the native control channel's `eval`
       *  all reach it identically, so "what would take this press, and what did
       *  it step over" is one answer with three transports instead of a verb
       *  per host. (The native `trace` narrates the Mac LAYER walk, which is a
       *  different question about a different tree.) */
      explainHit: (x, y, pierce = false) => explainHit(root, x, y, pierce),
      dependents: (attr) => dependentsOf(root, attr),
      /** Evaluate Declare in the scope of a node — read, set, bind, or add a view.
       *  The Inspector's strip and an agent hit the same entry point. Once the
       *  primed service is loaded (which boot arranges), the effect lands
       *  synchronously inside this call — set-then-step-then-read in one turn
       *  works; only the promise wrapper remains, for the result value. */
      evaluate: (path, src) => {
        if (evalService !== null)
          return Promise.resolve(evalService.evaluateIn(root, path, src));
        return Promise.resolve().then(() => (init_inspect_service(), inspect_service_exports)).then((m) => {
          evalService = m;
          return m.evaluateIn(root, path, src);
        });
      },
      clock
    };
  }
  function pathOf(root, n) {
    const parts = [];
    let cur = n;
    while (cur !== null && cur.parent !== null && cur !== root) {
      const m = nameOf(cur);
      parts.unshift(m ?? String(cur.parent.children.indexOf(cur)));
      cur = cur.parent;
    }
    return ["app", ...parts].join(".");
  }
  function pickAt(root, x, y, pierce = true) {
    return hitAt(root, x, y, pierce);
  }
  function explainHit(root, x, y, pierce = false) {
    const { hit, notes } = traceHitAt(root, x, y, pierce);
    const path = (v) => {
      const parts = [];
      for (let n = v; n !== null && n.parent !== null; n = n.parent) {
        parts.unshift(nameOf(n) ?? String(n.parent.children.indexOf(n)));
      }
      return ["app", ...parts].join(".");
    };
    return {
      hit: hit === null ? null : path(hit),
      steps: notes.map((n) => ({ path: path(n.view), kind: kindName(n.view), why: n.why, x: n.x, y: n.y }))
    };
  }
  function dependentsOf(root, attr) {
    const out = [];
    const walk = (n, path) => {
      for (const slot of ownedSlots(n)) {
        const owner = ownerOf(n, slot);
        const paths = owner?.wiredPaths;
        if (owner == null || paths == null)
          continue;
        if (paths.some((rp) => rp === attr || rp.endsWith("." + attr))) {
          out.push({ path, attr: slot, label: owner.label });
        }
      }
      n.children.forEach((c, i) => {
        const nm = c.$member;
        walk(c, `${path}.${nm ?? i}`);
      });
    };
    walk(root, "app");
    return out;
  }
  function reach(base2, trail) {
    let cur = base2;
    for (const k of trail) {
      if (cur === null || cur === void 0)
        return void 0;
      cur = cur[k];
    }
    return cur;
  }
  function expandValue(node, attr, trail = []) {
    const root = node[attr];
    const v = reach(root, trail);
    const kind = sliceKind(v);
    if (kind === "view") {
      return { kind, viewKind: kindName(v) };
    }
    if (kind === "primitive" || kind === "opaque") {
      return { kind, text: leafText(v) };
    }
    const holder = kind === "dataset" ? v.value : v;
    const hk = sliceKind(holder);
    if (hk === "primitive" || hk === "opaque")
      return { kind: hk, text: leafText(holder) };
    const entries = [];
    if (Array.isArray(holder)) {
      holder.slice(0, 200).forEach((e, i) => {
        const k = sliceKind(e);
        entries.push({
          key: String(i),
          kind: k,
          text: k === "view" ? kindName(e) : k === "array" ? `array[${e.length}]` : k === "record" ? "{ }" : leafText(e),
          open: k === "record" || k === "array" || k === "dataset"
        });
      });
      return { kind: "array", entries, count: holder.length };
    }
    for (const [k, e] of Object.entries(holder).slice(0, 200)) {
      const kk = sliceKind(e);
      entries.push({
        key: k,
        kind: kk,
        text: kk === "view" ? kindName(e) : kk === "array" ? `array[${e.length}]` : kk === "record" ? "{ }" : leafText(e),
        open: kk === "record" || kk === "array" || kk === "dataset"
      });
    }
    return { kind: "record", entries, count: entries.length };
  }
  function isColorSlot(node, attr) {
    let sc = node.$schema ?? null;
    if (sc === null)
      return /color$|^fill$|^stroke$|Color$|color/i.test(attr);
    return false;
  }
  function slotsOf(node) {
    const out = [];
    const own2 = ownValues(node);
    const names = /* @__PURE__ */ new Set([...Object.keys(own2), ...ownedSlots(node)]);
    for (const attr of [...names].sort()) {
      const v = node[attr];
      const k = sliceKind(v);
      const owner = ownerOf(node, attr);
      const motion = node.children.some((c) => {
        const s = c;
        const cn = c.constructor.name;
        return (cn === "Spring" || cn === "Animator" || cn === "AnimatorGroup") && s.attribute === attr;
      });
      const colorish = typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 16777215 && isColorSlot(node, attr);
      out.push({
        attr,
        kind: k,
        color: colorish ? HEX(v) : void 0,
        text: colorish ? HEX(v) : k === "view" ? kindName(v) : k === "array" ? `array[${v.length}]` : k === "record" ? "{ }" : k === "dataset" ? "Dataset" : leafText(v),
        open: k === "record" || k === "array" || k === "dataset",
        viewKind: k === "view" ? kindName(v) : void 0,
        origin: owner !== null ? "constraint" : isSet(node, attr) ? "set" : "default",
        motion
      });
    }
    return out;
  }
  var isView2, REGISTRY_NAME, registryIndexed, ManualScheduler, manual, clockMode, clock, evalService, evalServicePriming, leafText, sliceKind, HEX;
  var init_inspect = __esm({
    "runtime/dist/inspect.js"() {
      "use strict";
      init_node();
      init_interaction();
      init_view();
      init_attributes();
      init_replicate();
      init_animate();
      init_registry();
      init_reactive();
      isView2 = (n) => n instanceof View;
      REGISTRY_NAME = /* @__PURE__ */ new WeakMap();
      registryIndexed = false;
      ManualScheduler = class {
        t = typeof performance !== "undefined" ? performance.now() : 0;
        pending = null;
        now() {
          return this.t;
        }
        request(cb) {
          this.pending = cb;
          return 1;
        }
        cancel() {
          this.pending = null;
        }
        fire(ms) {
          this.t += ms;
          const cb = this.pending;
          this.pending = null;
          if (cb !== null)
            cb(this.t);
        }
      };
      manual = new ManualScheduler();
      clockMode = "auto";
      clock = {
        get mode() {
          return clockMode;
        },
        /** Take the shared clock off rAF; time advances only through step(). */
        manual() {
          if (clockMode === "manual")
            return;
          clockMode = "manual";
          sharedClock.setScheduler(manual);
        },
        /** Hand the clock back to the real frame source. */
        auto() {
          if (clockMode === "auto")
            return;
          clockMode = "auto";
          sharedClock.setScheduler(browserScheduler);
        },
        /** Advance time by `ms` (one synthetic frame), then settle the reactive
         *  graph — every constraint downstream of the motion lands before return.
         *  Settles BEFORE firing too: a write earlier in this same turn (a bridge
         *  `evaluate`, a handler) may not have propagated to the motion tier yet —
         *  a spring must retarget from it before the frame it is stepped through,
         *  or the step ticks against stale targets and reads as lost motion. */
        step(ms = 16.7) {
          if (clockMode !== "manual")
            this.manual();
          settle();
          manual.fire(ms);
          settle();
        },
        /** Run all in-flight FINITE motion to rest (springs settle, non-looping
         *  animators finish), frame by frame. Perpetual motion — a Heartbeat, an
         *  `repeat = Infinity` animator — is life, not transition (RULED
         *  2026-08-06; Ticker.perpetual): it keeps ticking under the steps but
         *  never holds settle open, so a pulsing indicator no longer makes the one
         *  determinism primitive time out. Returns false if `maxMs` of stepped
         *  time wasn't enough — the "this never settles" signal, now reserved for
         *  genuine non-convergence (e.g. a spring perpetually re-armed from its
         *  own rest). */
        settleMotion(maxMs = 5e3) {
          if (clockMode !== "manual")
            this.manual();
          let t = 0;
          while (sharedClock.settling && t < maxMs) {
            this.step(16.7);
            t += 16.7;
          }
          return !sharedClock.settling;
        }
      };
      evalService = null;
      evalServicePriming = false;
      leafText = (v) => {
        if (v === null || v === void 0)
          return "null";
        const t = typeof v;
        if (t === "string")
          return JSON.stringify(v);
        if (t === "number")
          return Number.isInteger(v) ? String(v) : v.toFixed(2);
        if (t === "boolean")
          return String(v);
        if (t === "function")
          return "\xABfn\xBB";
        const cn = v.constructor?.name;
        return cn !== void 0 && cn !== "Object" ? kindName(v) : String(v);
      };
      sliceKind = (v) => {
        if (v === null || v === void 0)
          return "primitive";
        if (v instanceof View)
          return "view";
        const t = typeof v;
        if (t !== "object")
          return "primitive";
        if (Array.isArray(v))
          return "array";
        const ctor = v.constructor?.name;
        if (ctor === "Dataset" || ctor === "DataSource")
          return "dataset";
        if (ctor === "Object" || ctor === void 0)
          return "record";
        return "opaque";
      };
      HEX = (n) => "#" + (n >>> 0).toString(16).padStart(6, "0").toUpperCase().slice(-6);
    }
  });

  // browser/mac-boot.js
  var mac_boot_exports = {};
  __export(mac_boot_exports, {
    macBoot: () => macBoot
  });

  // runtime/dist/index.js
  init_parser();
  init_check();
  init_instantiate();

  // runtime/dist/deps.js
  function forEachCodeValue(program, fn) {
    const walk = (el) => {
      for (const a of el.attrs)
        if (a.value.kind === "code")
          fn(a.value);
      for (const d of el.decls)
        if (d.def && d.def.kind === "code")
          fn(d.def);
      for (const c of el.children)
        walk(c);
    };
    walk(program.root);
    for (const c of program.classes)
      walk(c.body);
  }
  function applyDeps(program, list) {
    let i = 0;
    forEachCodeValue(program, (v) => {
      const d = list[i++];
      if (d && d.length > 0)
        v.deps = d;
    });
  }

  // runtime/dist/links.js
  function forEachElement(program, fn) {
    const walk = (el) => {
      fn(el);
      for (const c of el.children)
        walk(c);
    };
    walk(program.root);
    for (const c of program.classes)
      walk(c.body);
  }
  function applyLinks(program, list) {
    if (list.length === 0)
      return;
    const byIndex = new Map(list.map((e) => [e.i, e]));
    let i = 0;
    forEachElement(program, (el) => {
      const e = byIndex.get(i++);
      if (e)
        el.link = "href" in e ? { href: e.href } : { read: e.read };
    });
  }

  // runtime/dist/index.js
  init_include();
  init_view();
  init_font();
  init_errors();

  // runtime/dist/boot.js
  init_instantiate();
  init_view();
  init_font();
  init_errors();
  init_keys();
  init_focus();
  init_inspect();

  // runtime/dist/dom-backend.js
  init_backend();
  init_value();

  // runtime/dist/boxpaint.js
  init_value();

  // runtime/dist/dom-backend.js
  init_measure();
  init_draw();

  // runtime/dist/input.js
  var holdCapture = false;
  var SLOP_MOUSE = 4;
  var SLOP_TOUCH = 10;
  var DBL_MS = 400;
  var HOLD_MS = 500;
  function routeInput(alive, resolve, rootPoint, onHover) {
    let held = null;
    let pressX = 0;
    let pressY = 0;
    let pressSlop = SLOP_MOUSE;
    let wandered = false;
    let lastClickKey = null;
    let lastClickAt = 0;
    let lastClickX = 0;
    let lastClickY = 0;
    let pendingClick = null;
    const flushPendingClick = () => {
      const p = pendingClick;
      pendingClick = null;
      if (p !== null) {
        clearTimeout(p.timer);
        p.fire();
      }
    };
    const dropPendingClick = () => {
      if (pendingClick !== null) {
        clearTimeout(pendingClick.timer);
        pendingClick = null;
      }
    };
    let holdTimer = null;
    const disarmHold = () => {
      if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    };
    let pressOnSelectable = false;
    let hoveredKey = null;
    let hoveredSink = null;
    const fingers = /* @__PURE__ */ new Map();
    const touchList = () => [...fingers.values()];
    let touchSink = null;
    const pinchPts = /* @__PURE__ */ new Map();
    let pinchGesture = null;
    const endPinch = () => {
      const g = pinchGesture;
      if (g === null)
        return;
      pinchGesture = null;
      const fa = pinchPts.get(g.a);
      const fb = pinchPts.get(g.b);
      const cx = fa !== void 0 && fb !== void 0 ? (fa.x + fb.x) / 2 : (fa ?? fb)?.x ?? 0;
      const cy = fa !== void 0 && fb !== void 0 ? (fa.y + fb.y) / 2 : (fa ?? fb)?.y ?? 0;
      g.owner.sink("pinchEnd", cx, cy, { scale: g.scale, center: { x: cx, y: cy } });
    };
    let pressId = null;
    let pressFinger = false;
    let pressEl = null;
    let lastX = 0;
    let lastY = 0;
    let swallowUp = null;
    const clearHover = () => {
      if (hoveredSink !== null)
        hoveredSink("pointerOut", 0, 0);
      hoveredKey = null;
      hoveredSink = null;
    };
    const listen = (type, handle) => {
      const listener = (e) => {
        if (!alive()) {
          window.removeEventListener(type, listener);
          return;
        }
        handle(e);
      };
      window.addEventListener(type, listener);
    };
    {
      const ctxListener = (e) => {
        if (!alive()) {
          window.removeEventListener("contextmenu", ctxListener);
          return;
        }
        const t = resolve(e);
        if (t !== null && t.wantsContext === true) {
          e.preventDefault();
          t.sink("contextMenu", t.x, t.y);
        }
      };
      window.addEventListener("contextmenu", ctxListener);
    }
    listen("pointerdown", (e) => {
      const t = resolve(e);
      held = t;
      wandered = false;
      pressSlop = e.pointerType === "touch" ? SLOP_TOUCH : SLOP_MOUSE;
      const p0 = rootPoint !== void 0 ? rootPoint(e) : { x: e.clientX, y: e.clientY };
      pressX = p0.x;
      pressY = p0.y;
      pressId = e.pointerId;
      pressFinger = e.pointerType !== "mouse";
      pressEl = typeof Element !== "undefined" && e.target instanceof Element ? e.target : null;
      lastX = p0.x;
      lastY = p0.y;
      swallowUp = null;
      if (t !== null) {
        const el = typeof Element !== "undefined" && e.target instanceof Element ? e.target : null;
        const editable = typeof HTMLElement !== "undefined" && el instanceof HTMLElement && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
        const cs = el !== null && typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
        const selectable = el !== null && typeof el.closest === "function" && el.closest("[data-declare-selectable]") !== null && (cs === null || (cs.userSelect ?? cs.webkitUserSelect) !== "none");
        if (el !== null && !editable && !selectable && e.pointerType !== "touch")
          e.preventDefault();
        pressOnSelectable = editable || selectable;
        if (pendingClick !== null && t.key !== lastClickKey)
          flushPendingClick();
        if (t.wantsTouch === true) {
          fingers.set(e.pointerId, { id: e.pointerId, x: p0.x, y: p0.y });
          touchSink = t;
          t.sink("touchStart", p0.x, p0.y, { touches: touchList(), changed: [{ id: e.pointerId, x: p0.x, y: p0.y }] });
        }
        if (t.pinch !== void 0 && e.pointerType === "touch") {
          pinchPts.set(e.pointerId, { x: p0.x, y: p0.y, owner: t.pinch });
          if (pinchGesture === null && pinchPts.size >= 2) {
            const pair = [...pinchPts.entries()].slice(-2);
            const [[ida, fa], [idb, fb]] = pair;
            if (fa.owner.key === fb.owner.key) {
              const d = Math.hypot(fb.x - fa.x, fb.y - fa.y);
              if (d > 0) {
                pinchGesture = { owner: fa.owner, a: ida, b: idb, startDist: d, scale: 1 };
                const cx = (fa.x + fb.x) / 2;
                const cy = (fa.y + fb.y) / 2;
                fa.owner.sink("pinchStart", cx, cy, { scale: 1, center: { x: cx, y: cy } });
                disarmHold();
                wandered = true;
              }
            }
          }
        }
        t.sink("pointerDown", t.x, t.y);
        if (t.wantsHold === true) {
          const target = t;
          const touch = e.pointerType === "touch";
          holdTimer = setTimeout(() => {
            holdTimer = null;
            if (held === target && !wandered) {
              if (touch && target.wantsDrag === true)
                holdCapture = true;
              target.sink("hold", target.x, target.y);
            }
          }, HOLD_MS);
        }
      }
    });
    let selectionSuppressed = false;
    const suppressSelection = (on) => {
      if (typeof document === "undefined" || on === selectionSuppressed)
        return;
      selectionSuppressed = on;
      document.body.style.userSelect = on ? "none" : "";
      document.body.style.webkitUserSelect = on ? "none" : "";
      if (on)
        document.getSelection()?.removeAllRanges();
    };
    listen("pointermove", (e) => {
      const t = resolve(e);
      const key = t !== null ? t.key : null;
      if (key !== hoveredKey) {
        if (onHover !== void 0)
          onHover(t);
        if (hoveredSink !== null)
          hoveredSink("pointerOut", 0, 0);
        hoveredKey = key;
        hoveredSink = t !== null ? t.sink : null;
        if (t !== null)
          t.sink("pointerOver", t.x, t.y);
      }
      if (rootPoint !== void 0 && pinchPts.has(e.pointerId)) {
        const pp = rootPoint(e);
        const rec = pinchPts.get(e.pointerId);
        rec.x = pp.x;
        rec.y = pp.y;
        const g = pinchGesture;
        if (g !== null && (e.pointerId === g.a || e.pointerId === g.b)) {
          const fa = pinchPts.get(g.a);
          const fb = pinchPts.get(g.b);
          if (fa !== void 0 && fb !== void 0) {
            const d = Math.hypot(fb.x - fa.x, fb.y - fa.y);
            if (d > 0)
              g.scale = d / g.startDist;
            const cx = (fa.x + fb.x) / 2;
            const cy = (fa.y + fb.y) / 2;
            g.owner.sink("pinch", cx, cy, { scale: g.scale, center: { x: cx, y: cy } });
          }
        }
      }
      if (held === null || rootPoint === void 0)
        return;
      const p = rootPoint(e);
      lastX = p.x;
      lastY = p.y;
      if (!wandered) {
        const dx = p.x - pressX;
        const dy = p.y - pressY;
        if (dx * dx + dy * dy > pressSlop * pressSlop) {
          wandered = true;
          disarmHold();
        }
      }
      if (!pressOnSelectable)
        suppressSelection(true);
      if (held.wantsTouch === true && fingers.has(e.pointerId)) {
        fingers.set(e.pointerId, { id: e.pointerId, x: p.x, y: p.y });
        held.sink("touchMove", p.x, p.y, { touches: touchList(), changed: [{ id: e.pointerId, x: p.x, y: p.y }] });
      }
      held.sink("pointerMove", p.x, p.y);
    });
    listen("pointerup", (e) => {
      if (swallowUp !== null && e.pointerId === swallowUp) {
        swallowUp = null;
        return;
      }
      suppressSelection(false);
      disarmHold();
      holdCapture = false;
      if (pinchGesture !== null && (e.pointerId === pinchGesture.a || e.pointerId === pinchGesture.b))
        endPinch();
      pinchPts.delete(e.pointerId);
      const t = resolve(e);
      const captor = held;
      held = null;
      const gone = fingers.get(e.pointerId);
      if (gone !== void 0) {
        fingers.delete(e.pointerId);
        if (touchSink !== null) {
          const tp = rootPoint !== void 0 ? rootPoint(e) : { x: gone.x, y: gone.y };
          touchSink.sink("touchEnd", tp.x, tp.y, { touches: touchList(), changed: [gone] });
        }
        if (fingers.size === 0)
          touchSink = null;
      }
      if (captor !== null) {
        const p = rootPoint !== void 0 ? rootPoint(e) : { x: captor.x, y: captor.y };
        captor.sink("pointerUp", p.x, p.y, { canceled: false });
        if (t !== null && t.key === captor.key && !wandered) {
          const now = Date.now();
          const dx = p.x - lastClickX;
          const dy = p.y - lastClickY;
          const near = dx * dx + dy * dy <= pressSlop * 3 * (pressSlop * 3);
          const isSecond = lastClickKey === captor.key && now - lastClickAt < DBL_MS && near;
          if (isSecond) {
            const held1 = pendingClick !== null;
            dropPendingClick();
            if (!held1)
              captor.sink("click", t.x, t.y);
            captor.sink("dblClick", t.x, t.y);
            lastClickKey = null;
          } else {
            lastClickKey = captor.key;
            lastClickAt = now;
            lastClickX = p.x;
            lastClickY = p.y;
            const fire = () => captor.sink("click", t.x, t.y);
            if (captor.wantsDbl === true) {
              dropPendingClick();
              pendingClick = { timer: setTimeout(() => {
                pendingClick = null;
                fire();
              }, DBL_MS), fire };
            } else {
              fire();
            }
          }
        }
      } else if (t !== null) {
        t.sink("pointerUp", t.x, t.y, { canceled: false });
      }
      if (e.pointerType === "touch")
        clearHover();
    });
    listen("pointercancel", (e) => {
      if (swallowUp !== null && e.pointerId === swallowUp) {
        swallowUp = null;
        return;
      }
      suppressSelection(false);
      disarmHold();
      holdCapture = false;
      if (pinchGesture !== null && (e.pointerId === pinchGesture.a || e.pointerId === pinchGesture.b))
        endPinch();
      pinchPts.delete(e.pointerId);
      const captor = held;
      held = null;
      const gone = fingers.get(e.pointerId);
      if (gone !== void 0) {
        fingers.delete(e.pointerId);
        if (touchSink !== null) {
          const tp = rootPoint !== void 0 ? rootPoint(e) : { x: gone.x, y: gone.y };
          touchSink.sink("touchCancel", tp.x, tp.y, { touches: touchList(), changed: [gone] });
        }
        if (fingers.size === 0)
          touchSink = null;
      }
      if (captor !== null) {
        const p = rootPoint !== void 0 ? rootPoint(e) : { x: captor.x, y: captor.y };
        captor.sink("pointerUp", p.x, p.y, { canceled: true });
      }
      if (e.pointerType === "touch")
        clearHover();
    });
    {
      const scrollListener = (e) => {
        if (!alive()) {
          window.removeEventListener("scroll", scrollListener, true);
          return;
        }
        if (held === null || !pressFinger || holdCapture)
          return;
        const s = e.target;
        const isEl = typeof Element !== "undefined" && s instanceof Element;
        if (isEl && pressEl !== null && !s.contains(pressEl))
          return;
        suppressSelection(false);
        disarmHold();
        const captor = held;
        held = null;
        swallowUp = pressId;
        const gone = pressId !== null ? fingers.get(pressId) : void 0;
        if (gone !== void 0 && pressId !== null) {
          fingers.delete(pressId);
          if (touchSink !== null) {
            touchSink.sink("touchCancel", gone.x, gone.y, { touches: touchList(), changed: [gone] });
          }
          if (fingers.size === 0)
            touchSink = null;
        }
        captor.sink("pointerUp", lastX, lastY, { canceled: true });
        clearHover();
      };
      window.addEventListener("scroll", scrollListener, true);
    }
  }

  // runtime/dist/dom-backend.js
  var TRANSFORMS = /* @__PURE__ */ new WeakMap();
  var liveTransforms = 0;
  function declareTransformed(el) {
    if (liveTransforms === 0)
      return false;
    for (let a = el; a !== null; a = a.parentElement) {
      if (TRANSFORMS.has(a))
        return true;
    }
    return false;
  }
  function localPoint(el, cx, cy) {
    if (declareTransformed(el))
      return throughTransforms(el, cx, cy);
    const r = el.getBoundingClientRect();
    return { x: cx - r.left, y: cy - r.top };
  }
  function throughTransforms(el, cx, cy) {
    const op = el.offsetParent;
    let x, y;
    if (op instanceof HTMLElement) {
      const p = localPoint(op, cx, cy);
      x = p.x - op.clientLeft + op.scrollLeft - el.offsetLeft;
      y = p.y - op.clientTop + op.scrollTop - el.offsetTop;
    } else {
      const r = el.getBoundingClientRect();
      x = cx - r.left;
      y = cy - r.top;
    }
    const t = TRANSFORMS.get(el);
    if (t !== void 0) {
      const rad = -t.deg * Math.PI / 180;
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      const dx = (x - t.ox) / t.k;
      const dy = (y - t.oy) / t.k;
      x = t.ox + dx * c - dy * s;
      y = t.oy + dx * s + dy * c;
    }
    return { x, y };
  }

  // runtime/dist/boot.js
  async function loadFonts(fonts) {
    if (typeof FontFace === "undefined" || typeof document === "undefined")
      return;
    await Promise.all(fonts.map(async (f) => {
      const face = new FontFace(f.family, f.src, {
        weight: String(f.weight ?? "normal"),
        style: f.style ?? "normal"
      });
      await face.load();
      document.fonts.add(face);
    }));
  }
  function isEmbedded(host2) {
    return typeof document !== "undefined" && typeof host2.closest === "function" && host2.closest("[data-declare-app], [data-declare-embed]") !== null;
  }
  var TEARDOWN = /* @__PURE__ */ new WeakMap();
  function wireInput(app, host2, chrome = false) {
    const embedded = isEmbedded(host2);
    wireEnvironment(app, host2, chrome ? false : embedded);
    if (chrome || embedded)
      return;
    Focus.setRoot(app);
    Keys.listen(() => app.surface !== null);
    deliverKeys(Keys, Focus);
    window.__declare = bridgeFor(app);
  }
  function wireColorScheme(app) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    app.dark = mq.matches;
    const update = () => {
      app.dark = mq.matches;
    };
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }
  function wireTouchDevice(app) {
    const primary = window.matchMedia("(pointer: coarse)");
    const anyCoarse = window.matchMedia("(any-pointer: coarse)");
    const anyFine = window.matchMedia("(any-pointer: fine)");
    const update = () => {
      app.touchDevice = primary.matches;
      app.hasTouch = anyCoarse.matches;
      app.hasPointer = anyFine.matches;
    };
    update();
    primary.addEventListener("change", update);
    anyCoarse.addEventListener("change", update);
    anyFine.addEventListener("change", update);
    return () => {
      primary.removeEventListener("change", update);
      anyCoarse.removeEventListener("change", update);
      anyFine.removeEventListener("change", update);
    };
  }
  function wireEnvironment(app, host2, embedded) {
    if (typeof window === "undefined")
      return;
    if (embedded)
      return wireEnvironmentEmbedded(app, host2);
    const w = window;
    wireColorScheme(app);
    wireTouchDevice(app);
    const size = () => {
      const de = w.document.documentElement;
      app.hostWidth = de.clientWidth;
      app.hostHeight = de.clientHeight;
    };
    const scroll = () => {
      app.scrollY = w.scrollY;
    };
    const move = (e) => {
      app.pointerX = e.clientX;
      app.pointerY = e.clientY;
      app.lastPointerType = e.pointerType === "touch" || e.pointerType === "pen" ? e.pointerType : "mouse";
      app.hovering = e.pointerType !== "touch";
      const t = e.target;
      app.pointerOverText = t instanceof HTMLElement && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA");
    };
    const out = (e) => {
      if (e.relatedTarget === null) {
        app.hovering = false;
        app.pointerOverText = false;
      }
    };
    const down = (e) => {
      app.pointerX = e.clientX;
      app.pointerY = e.clientY;
      app.hovering = e.pointerType !== "touch";
      app.lastPointerType = e.pointerType === "touch" || e.pointerType === "pen" ? e.pointerType : "mouse";
      app.pointerDown = true;
    };
    const up = () => {
      app.pointerDown = false;
    };
    size();
    scroll();
    w.addEventListener("resize", size);
    w.addEventListener("scroll", scroll, { passive: true });
    w.addEventListener("pointermove", move, { passive: true, capture: true });
    w.addEventListener("pointerdown", down, { passive: true, capture: true });
    w.addEventListener("pointerup", up, { passive: true, capture: true });
    w.addEventListener("pointercancel", up, { passive: true, capture: true });
    w.addEventListener("pointerout", out);
  }
  function wireEnvironmentEmbedded(app, host2) {
    const sync = () => {
      app.hostWidth = host2.clientWidth;
      app.hostHeight = host2.clientHeight;
      if (app.minWidth > 0 || app.minHeight > 0)
        host2.style.overflow = "auto";
    };
    const move = (e) => {
      const p = localPoint(host2, e.clientX, e.clientY);
      app.pointerX = p.x;
      app.pointerY = p.y;
      app.hovering = e.pointerType !== "touch";
      const t = e.target;
      app.pointerOverText = t instanceof HTMLElement && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA");
    };
    const leave = () => {
      app.hovering = false;
      app.pointerOverText = false;
    };
    const unTheme = wireColorScheme(app);
    const unPointer = wireTouchDevice(app);
    const down = (e) => {
      const p = localPoint(host2, e.clientX, e.clientY);
      app.pointerX = p.x;
      app.pointerY = p.y;
      app.hovering = e.pointerType !== "touch";
      app.pointerDown = true;
    };
    const up = () => {
      app.pointerDown = false;
    };
    sync();
    host2.addEventListener("pointermove", move, { passive: true, capture: true });
    host2.addEventListener("pointerdown", down, { passive: true, capture: true });
    host2.addEventListener("pointerup", up, { passive: true });
    host2.addEventListener("pointercancel", up, { passive: true });
    host2.addEventListener("pointerleave", leave);
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(sync);
      ro.observe(host2);
    }
    TEARDOWN.set(app, () => {
      host2.removeEventListener("pointermove", move, { capture: true });
      host2.removeEventListener("pointerdown", down, { capture: true });
      host2.removeEventListener("pointerup", up);
      host2.removeEventListener("pointercancel", up);
      host2.removeEventListener("pointerleave", leave);
      ro?.disconnect();
      unTheme();
      unPointer();
    });
  }
  function mountApp(app, host2, backend2, opts = {}) {
    app.attach(backend2, null);
    backend2.attachRoot(host2, app.surface);
    applyDeclaredScroll(app);
    wireInput(app, host2, opts.chrome === true);
    return app;
  }
  function applyDeclaredScroll(v) {
    if (v.scrolls !== "none") {
      if (v.scrollY !== 0)
        v.surface?.scrollToY?.(v.scrollY);
      if (v.scrollX !== 0)
        v.surface?.scrollToX?.(v.scrollX);
    }
    for (const c of v.children)
      if (c instanceof View)
        applyDeclaredScroll(c);
  }

  // runtime/dist/index.js
  init_parser();
  init_include();
  init_check();
  init_program_schema();
  init_instantiate();
  init_inspect_service();
  init_inspect();
  init_node();
  init_view();
  init_text();
  init_image();
  init_text_input();
  init_layout();
  init_data();
  init_image();
  init_video();
  init_stream_seam();
  init_tip();
  init_animator();
  init_reactive();
  init_inspect();
  init_draw();
  init_font();
  init_measure();
  init_shape();

  // runtime/dist/canvas-backend.js
  init_errors();
  init_value();
  init_measure();
  init_draw();

  // runtime/dist/index.js
  init_schema();
  init_value();
  init_attributes();
  init_css_colors();
  init_errors();
  init_slug();
  init_keys();
  init_focus();

  // runtime/dist/services.js
  init_expr();
  init_keys();

  // runtime/dist/themes.js
  init_themes_data();
  var Themes = Object.freeze({
    sanFrancisco: (dark) => dark ? THEME_RECORDS.SanFranciscoDark : THEME_RECORDS.SanFrancisco,
    cupertino: (dark) => dark ? THEME_RECORDS.CupertinoDark : THEME_RECORDS.Cupertino,
    mountainView: (dark) => dark ? THEME_RECORDS.MountainViewDark : THEME_RECORDS.MountainView,
    redmond: (dark) => dark ? THEME_RECORDS.RedmondDark : THEME_RECORDS.Redmond,
    /** An active tone derived from an accent — 22% over the surface tone. */
    tint(c, dark) {
      const base2 = dark ? 34 : 255;
      const mix = (ch) => Math.round(ch * 0.22 + base2 * 0.78);
      return mix(c >> 16 & 255) << 16 | mix(c >> 8 & 255) << 8 | mix(c & 255);
    }
  });

  // runtime/dist/services.js
  init_focus();
  init_inspect_service();
  setBodyServices({ Focus, Keys, Themes, Inspect });
  setKeysFocusProbe(() => Focus.getFocus() !== null);

  // runtime/dist/index.js
  function build(source, opts = {}) {
    const parsed = parseProgram(source);
    const { program, errors: incErrors } = resolveIncludes(parsed, opts.host ?? NO_INCLUDES, opts.originDir ?? "");
    const errors = [...incErrors, ...check(program)];
    errors.sort((a, b) => (a.pos?.offset ?? 0) - (b.pos?.offset ?? 0));
    if (errors.length > 0)
      throw new DeclareErrors(errors);
    if (opts.deps !== void 0)
      applyDeps(program, opts.deps);
    if (opts.links !== void 0)
      applyLinks(program, opts.links);
    const root = instantiate(program);
    if (!(root instanceof App)) {
      throw new DeclareError("a program's root must be 'App [ \u2026 ]'", program.root.pos);
    }
    return root;
  }

  // runtime/dist/mac-backend.js
  init_value();
  var OP = {
    CREATE: 1,
    DESTROY: 2,
    INSERT: 3,
    ROOT: 4,
    GEOM: 5,
    FILL: 6,
    GRADIENT: 7,
    RADIUS: 8,
    STROKE: 9,
    SHADOW: 10,
    VISIBLE: 11,
    OPACITY: 12,
    SCALE: 13,
    CLIP: 14,
    BOXCLIP: 15,
    TEXT: 16,
    TEXTSTYLE: 17,
    DRAW: 18,
    IMAGE: 19,
    STRETCH: 20,
    SCROLL: 21,
    SCROLLPOS: 22,
    CURSOR: 23,
    EDIT: 24,
    EDITFOCUS: 25,
    RICH: 26,
    RICHSCROLL: 27,
    EMBED: 28,
    IGNORECLIP: 29,
    SCROLLX: 30,
    SCROLLXPOS: 31,
    PAGEFILL: 32,
    IGNORESCROLL: 33,
    RICHWIDTH: 34,
    BLEND: 35,
    BACKDROP: 36,
    TINT: 37,
    ROTATE: 38
  };
  function host() {
    const h = globalThis.__declareMacHost;
    if (h === void 0)
      throw new Error("mac backend: no host bridge installed");
    return h;
  }
  var ops = [];
  var flushScheduled = false;
  function emit(op, id, ...args) {
    ops.push([op, id, ...args]);
    if (!flushScheduled) {
      flushScheduled = true;
      const raf = globalThis.requestAnimationFrame;
      if (typeof raf === "function")
        raf(flushOps);
      else
        queueMicrotask(flushOps);
    }
  }
  function countOps() {
    return ops.length;
  }
  function peekOps() {
    return JSON.stringify(ops).length;
  }
  function flushOps() {
    flushScheduled = false;
    if (ops.length === 0)
      return;
    const json = JSON.stringify(ops);
    ops.length = 0;
    host().commit(json);
  }
  var nextId = 1;
  var MacSurface = class {
    id = nextId++;
    x = 0;
    y = 0;
    width = 0;
    height = 0;
    visible = true;
    opacity = 1;
    cursorStyle = "";
    scaleK = 1;
    pivotX = 0;
    pivotY = 0;
    rotationDeg = 0;
    scrolls = false;
    scrollOffset = 0;
    onScrollCb = null;
    parent = null;
    children = [];
    ignoresClip = false;
    sink = null;
    /** What the view declared it wants (dbl / hold / touch) — see setInput. */
    wants = void 0;
    /** Shape clip (path data) and box clip — kept for the HIT walk, which must
     *  subtract exactly what the paint does. */
    clipData = null;
    boxClip = false;
    scrollsX = false;
    scrollXOffset = 0;
    /** Set when this surface hosts native rich content: its height is answered
     *  by the host's text layout, and its hit region is the box (the overlay
     *  owns interior selection). */
    richHeight = 0;
    constructor() {
      emit(OP.CREATE, this.id);
    }
    setX(v) {
      this.x = v;
      this.geom();
    }
    setY(v) {
      this.y = v;
      this.geom();
    }
    setWidth(v) {
      this.width = v;
      this.geom();
    }
    setHeight(v) {
      this.height = v;
      this.geom();
    }
    geom() {
      emit(OP.GEOM, this.id, this.x, this.y, this.width, this.height);
    }
    /** The last realized SOLID fill, as css — attachRoot reads it to paint the
     *  page behind a top-level app (the DOM/canvas attachRoot rule, mirrored).
     *  Solid fills only, exactly like the canvas mirror: a gradient app ground
     *  gets no page echo there either. */
    fillCss = null;
    setFill(fill) {
      if (isGradient(fill)) {
        const g = fill;
        this.fillCss = null;
        emit(OP.GRADIENT, this.id, { angle: g.angle, stops: g.stops.map((st) => [st.offset, colorToCss(st.color)]) });
      } else {
        this.fillCss = fill === null ? null : colorToCss(fill);
        emit(OP.FILL, this.id, this.fillCss);
      }
    }
    setCornerRadius(r) {
      emit(OP.RADIUS, this.id, r);
    }
    setStroke(s) {
      emit(OP.STROKE, this.id, s === null ? null : s.width, s === null ? null : colorToCss(s.color));
    }
    setShadow(sh) {
      if (sh === null)
        emit(OP.SHADOW, this.id, null);
      else
        emit(OP.SHADOW, this.id, sh.dx, sh.dy, sh.blur, colorToCss(sh.color));
    }
    setVisible(v) {
      this.visible = v;
      emit(OP.VISIBLE, this.id, v ? 1 : 0);
    }
    setOpacity(o) {
      this.opacity = o;
      emit(OP.OPACITY, this.id, o);
    }
    /** The schema token rides the wire verbatim; the Swift side maps it to a
     *  CIFilter for `layer.compositingFilter` (public on macOS — LayerTree
     *  case 35). A compositing filter rides the layer, not the order, so the
     *  restack/clipHost machinery is untouched. */
    setBlend(mode) {
      emit(OP.BLEND, this.id, mode);
    }
    /** The frost, natively (LayerTree case 36): the Swift side samples the
     *  layers beneath the node's padded region (CALayer.render(in:)), filters
     *  in encoded sRGB (the DrawReplay color-space precedent) and lands the
     *  result as a masked layer under the node's own fill. [blur, saturate]
     *  ride the wire; null clears. */
    setBackdrop(spec) {
      emit(OP.BACKDROP, this.id, spec === null ? null : spec.blur, spec === null ? 1 : spec.saturate);
    }
    setCursor(c) {
      this.cursorStyle = c;
      emit(OP.CURSOR, this.id, c);
    }
    /** No CSS pointer-events natively: the hit walk is ours, so an inert
     *  surface simply drops its sink (setInput(null)) — this is a no-op kept
     *  for protocol completeness. The carved-sink rule needs nothing here
     *  because nothing but our own walk ever hit-tests. */
    /** Consulted by hit() below — the walk decides, so the walk must know. */
    pe = "";
    setPointerEvents(mode) {
      this.pe = mode;
    }
    /** Rotation rides its own op; the pivot arrives via SCALE (the runtime
     *  always pushes both — view.ts pushTransform), and the Swift side folds
     *  both into one CATransform3D (applyScale). */
    setRotation(deg, _px, _py) {
      this.rotationDeg = deg;
      emit(OP.ROTATE, this.id, deg);
    }
    /** Invert the paint transform (scale, then rotation, about the shared
     *  pivot) — the hit/cursor/wheel walks' transform term, the same inverse
     *  interaction.ts toChildLocal applies (the ONE-WALK rule). */
    invertTransform(lx, ly) {
      if (this.scaleK === 1 && this.rotationDeg === 0)
        return [lx, ly];
      let dx = lx - this.pivotX;
      let dy = ly - this.pivotY;
      if (this.scaleK !== 1 && this.scaleK !== 0) {
        dx /= this.scaleK;
        dy /= this.scaleK;
      }
      if (this.rotationDeg !== 0) {
        const a = -this.rotationDeg * Math.PI / 180;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const rx = dx * ca - dy * sa;
        const ry = dx * sa + dy * ca;
        dx = rx;
        dy = ry;
      }
      return [dx + this.pivotX, dy + this.pivotY];
    }
    setScale(scale, px, py) {
      this.scaleK = scale;
      this.pivotX = px;
      this.pivotY = py;
      emit(OP.SCALE, this.id, scale, px, py);
    }
    setClip(pathData) {
      this.clipData = pathData;
      emit(OP.CLIP, this.id, pathData);
    }
    setBoxClip(on) {
      this.boxClip = on;
      emit(OP.BOXCLIP, this.id, on ? 1 : 0);
    }
    setIgnoreClip(on) {
      this.ignoresClip = on;
      emit(OP.IGNORECLIP, this.id, on ? 1 : 0);
    }
    /** Fixed chrome: this surface does not ride its scroller's content. The host
     *  realizes it by hosting the layer on the scroller's OWN layer rather than
     *  the content layer that translates — the same escape shape `setIgnoreClip`
     *  uses, one property over.
     *
     *  Was absent entirely until 2026-08-05, which the seam table (test/seam.test.mjs)
     *  had recorded as a GAP and gate-baseline.json had sized: `ignorescroll`'s
     *  1.17% structural figure WAS this hole, since no pixel test can see an
     *  absence unless something is actually scrolled under the pinned thing. */
    /** Retained for the wheel walk (wheelTo): pinned chrome reads FRAME
     *  coordinates, not the scrolled content's. The Swift side owns the
     *  visual realization; this is the model's copy of the same fact. */
    ignoresScroll = false;
    setIgnoreScroll(on) {
      this.ignoresScroll = on;
      emit(OP.IGNORESCROLL, this.id, on ? 1 : 0);
    }
    /** An app ROOT (top-level or an island tenant) — roots keep to their frame
     *  and never self-scroll (the DOM's applyScrollStyle root branch). Stamped by
     *  attachRoot / mountEmbed, which run AFTER attach's scrolls push — so the
     *  push guards on it for any later re-push. */
    appRoot = false;
    setScroll(on, onScroll) {
      if (this.appRoot && on)
        return;
      this.scrolls = on;
      this.onScrollCb = on ? onScroll : null;
      if (!on)
        this.scrollOffset = 0;
      emit(OP.SCROLL, this.id, on ? 1 : 0);
    }
    /** Horizontal scroll is not yet realized natively (code blocks clip). */
    setScrollX(on) {
      if (this.appRoot && on)
        return;
      this.scrollsX = on;
      emit(OP.SCROLLX, this.id, on ? 1 : 0);
    }
    /** The widest a child reaches — the horizontal twin of contentExtent().
     *
     *  RECURSES, because this stands in for the DOM's `scrollWidth`, which
     *  measures where the content actually ends rather than what the immediate
     *  child declares. The Files strip is exactly that case: its row's declared
     *  width lags the columns inside it, so a shallow sum said the content fit
     *  and no column ever slid into view. A child that clips (or scrolls on this
     *  axis) contains its own overflow, so the walk stops there — again as the
     *  DOM does. */
    contentExtentXPublic() {
      return this.contentExtentX();
    }
    /** Set the vertical offset and notify, for the smooth-reveal animation. */
    setScrollOffset(v) {
      this.scrollOffset = v;
      this.onScrollCb?.(v);
    }
    contentExtentX() {
      let w = 0;
      for (const c of this.children) {
        if (!c.visible)
          continue;
        let cw = c.width;
        if (!c.boxClip && c.clipData === null && !c.scrollsX)
          cw = Math.max(cw, c.contentExtentX());
        w = Math.max(w, c.x + cw);
      }
      return w;
    }
    /** Reveal this surface within its nearest HORIZONTALLY scrolling ancestor. */
    revealX(align, smooth = false) {
      let sc = this.parent;
      let left = this.x;
      while (sc !== null && !sc.scrollsX) {
        left += sc.x;
        sc = sc.parent;
      }
      if (sc === null)
        return;
      const right = left + this.width;
      const viewLeft = sc.scrollXOffset;
      const viewRight = viewLeft + sc.width;
      let next = sc.scrollXOffset;
      if (align === "start")
        next = left;
      else if (left < viewLeft && right > viewRight) {
      } else if (left < viewLeft)
        next = this.width > sc.width ? right - sc.width : left;
      else if (right > viewRight)
        next = this.width > sc.width ? left : right - sc.width;
      const max = Math.max(0, sc.contentExtentX() - sc.width);
      next = Math.min(max, Math.max(0, next));
      if (next !== sc.scrollXOffset) {
        if (smooth)
          glideX(sc, next);
        else {
          sc.scrollXOffset = next;
          emit(OP.SCROLLXPOS, sc.id, next, sc.contentExtentX());
        }
      }
    }
    setText(text) {
      emit(OP.TEXT, this.id, text);
    }
    setTextStyle(style) {
      emit(OP.TEXTSTYLE, this.id, {
        family: style.fontFamily,
        size: style.fontSize,
        weight: style.fontWeight,
        italic: style.italic === true,
        color: style.color === null ? null : colorToCss(style.color),
        // A gradient text-fill: the DOM clips a background to the glyphs and the
        // canvas realizes the same ramp over the box, so the host is handed the
        // ramp itself and clips it to the glyph outlines.
        fillGradient: style.textFill != null && isGradient(style.textFill) ? {
          angle: style.textFill.angle,
          stops: style.textFill.stops.map((st) => [st.offset, colorToCss(st.color)])
        } : null,
        align: style.align ?? "left",
        wrap: style.wrap === true,
        letterSpacing: style.letterSpacing ?? 0,
        // Leading as a fontSize multiplier (0 = natural). The host's TextEngine
        // does not consume it yet — seam row in test/seam.test.mjs.
        lineHeight: style.lineHeight ?? 0,
        selectable: style.selectable === true,
        shadow: style.shadow == null ? null : [style.shadow.dx, style.shadow.dy, style.shadow.blur, colorToCss(style.shadow.color)]
      });
    }
    setDrawing(list) {
      emit(OP.DRAW, this.id, list === null ? null : { ops: list.ops, bounds: list.bounds });
    }
    setImage(image) {
      const handle = image === null ? null : image.__handle ?? null;
      emit(OP.IMAGE, this.id, handle);
    }
    setImageStretch(stretch) {
      emit(OP.STRETCH, this.id, stretch);
    }
    /** Tint (compositing.md §3.4): the color rides as CSS text; the Swift side
     *  re-derives the bitmap as an alpha-mask fill (LayerTree case 37). */
    setImageTint(color) {
      emit(OP.TINT, this.id, color === null ? null : colorToCss(color));
    }
    /** Native rich text: the host lays the blocks out (Core Text) and answers
     *  the flowed height, which the runtime treats exactly as the DOM
     *  backend's measured height. `selectable` mounts a real NSTextView so
     *  selection is the platform's own. */
    setRichContent(blocks, selectable, width, onResize, onLink) {
      richCallbacks.set(this.id, { onResize, onLink });
      this.richHeight = host().richLayout(this.id, JSON.stringify(blocks), selectable, width);
      return this.richHeight;
    }
    /** Width-only: an all-`pre` flow cannot re-wrap, so its lines and height are
     *  unchanged — but the host box must still adopt the width, because it bounds
     *  the pre's native horizontal scroller and a box left at its boot-time width
     *  clips the flow to nothing. No blocks cross the bridge: the host holds the
     *  laid-out state and only re-sizes its container. */
    setRichWidth(width) {
      emit(OP.RICHWIDTH, this.id, width);
    }
    /** Called from the host when a rich flow's laid-out height is known. */
    applyRichHeight(h) {
      if (h === this.richHeight)
        return;
      this.richHeight = h;
      richCallbacks.get(this.id)?.onResize(h);
    }
    /** The write half of scrollY/scrollX — clamped like every other write, and
     *  emitted so the layer tree moves this frame. */
    scrollToY(v) {
      if (!this.scrolls)
        return;
      const next = Math.min(Math.max(0, this.contentExtent() - this.height), Math.max(0, v));
      if (next === this.scrollOffset)
        return;
      this.setScrollOffset(next);
      emit(OP.SCROLLPOS, this.id, next, this.contentExtent());
    }
    scrollToX(v) {
      if (!this.scrollsX)
        return;
      const next = Math.min(Math.max(0, this.contentExtentX() - this.width), Math.max(0, v));
      if (next === this.scrollXOffset)
        return;
      this.scrollXOffset = next;
      emit(OP.SCROLLXPOS, this.id, next, this.contentExtentX());
    }
    scrollIntoView(align = "nearest", smooth = false) {
      this.revealX(align, smooth);
      let sc = this.parent;
      let top = this.y;
      while (sc !== null && !sc.scrolls) {
        top += sc.y;
        sc = sc.parent;
      }
      if (sc === null)
        return;
      const bottom = top + this.height;
      const viewTop = sc.scrollOffset;
      const viewBottom = viewTop + sc.height;
      let next = sc.scrollOffset;
      if (align === "start")
        next = top;
      else if (top < viewTop && bottom > viewBottom) {
      } else if (top < viewTop)
        next = this.height > sc.height ? bottom - sc.height : top;
      else if (bottom > viewBottom)
        next = this.height > sc.height ? top : bottom - sc.height;
      const max = Math.max(0, sc.contentExtent() - sc.height);
      next = Math.min(max, Math.max(0, next));
      if (next !== sc.scrollOffset) {
        if (smooth)
          glideY(sc, next);
        else {
          sc.scrollOffset = next;
          sc.onScrollCb?.(next);
          emit(OP.SCROLLPOS, sc.id, next, sc.contentExtent());
        }
      }
    }
    revealRichAnchor(_slug, _within) {
      return false;
    }
    /** An embed marker (DOMIsland's `slot`, and so AppIsland's `run:…` key).
     *  Natively nothing mounts into an element — the host reads the pending
     *  markers and inserts a child app's ROOT SURFACE here, so the tenant
     *  lands in this very layer tree (mountEmbed below). */
    setEmbed(id, view) {
      if (id === "") {
        embeds.delete(this.id);
        islandViews.delete(this.id);
      } else {
        embeds.set(this.id, id);
        if (view !== void 0)
          islandViews.set(this.id, view);
      }
      emit(OP.EMBED, this.id, id);
    }
    /** The sink, plus WHAT THIS VIEW ASKED FOR.
     *
     *  `wants` is not decoration: the shared router reads `wantsDbl` off the hit
     *  target to decide whether to HOLD a click for the double-click window, and
     *  `wantsHold` to arm the hold timer. A backend that drops it silently loses
     *  onDblClick and onHold — the DOM backend keeps the same fact in a WANTS map
     *  and spreads it onto every hit target, so this mirrors it exactly.
     *  `wantsTouch` is recorded for symmetry; a Mac mouse never reports fingers. */
    setInput(sink, wants) {
      this.sink = sink;
      this.wants = sink !== null ? wants : void 0;
    }
    setEditable(spec) {
      if (spec === null) {
        editCallbacks.delete(this.id);
        emit(OP.EDIT, this.id, null);
        return;
      }
      editCallbacks.set(this.id, spec);
      emit(OP.EDIT, this.id, {
        multiline: spec.multiline === true,
        spellcheck: spec.spellcheck !== false,
        wrap: spec.wrap !== false,
        padding: spec.padding ?? 0,
        value: spec.value ?? "",
        placeholder: spec.placeholder ?? "",
        // An editable carries its OWN style — the DOM backend styles the element
        // from `spec.style`, not from the surface's text style. Leaving it out made
        // every field fall back to the default face, which is why the Viewer's
        // code editor was proportional where the DOM's was monospace.
        style: {
          family: spec.style.fontFamily,
          size: spec.style.fontSize,
          weight: spec.style.fontWeight,
          italic: spec.style.italic === true,
          color: spec.style.color === null ? null : colorToCss(spec.style.color),
          align: spec.style.align ?? "left",
          letterSpacing: spec.style.letterSpacing ?? 0
        }
      });
    }
    activateEditable(active2) {
      emit(OP.EDITFOCUS, this.id, active2 ? 1 : 0);
    }
    insertChild(child, before) {
      const c = child;
      const b = before;
      if (c.parent !== null) {
        const i = c.parent.children.indexOf(c);
        if (i >= 0)
          c.parent.children.splice(i, 1);
      }
      const at = b === null ? this.children.length : Math.max(0, this.children.indexOf(b));
      this.children.splice(at, 0, c);
      c.parent = this;
      emit(OP.INSERT, this.id, c.id, b === null ? -1 : b.id);
    }
    destroy() {
      if (this.parent !== null) {
        const i = this.parent.children.indexOf(this);
        if (i >= 0)
          this.parent.children.splice(i, 1);
        this.parent = null;
      }
      richCallbacks.delete(this.id);
      editCallbacks.delete(this.id);
      surfaces.delete(this.id);
      emit(OP.DESTROY, this.id);
    }
    // ── the scene model: extent, hit, scroll (the canvas walk, natively) ──────
    /** Content extent for scrolling: the furthest child bottom. */
    /** The DOM's `scrollHeight`: where the content ends, descendants included
     *  (see contentExtentX for why the walk has to go deeper than the children). */
    /** A windowed block's LOGICAL extent — the DOM backend's strut, as a floor.
     *
     *  A virtualized collection materializes ~a viewport of rows, so the walk
     *  below measures the WINDOW and the scroller's range would cover only the
     *  rows currently realized: dragging the thumb to the end lands mid-collection.
     *  The DOM realizes the floor as an inert zero-width strut child whose height
     *  IS the range; there is no reason to fake a child here, because the extent
     *  is computed rather than measured — a floor says the same thing directly.
     *  `null` clears it (the block stopped virtualizing). */
    virtualExtent = null;
    setVirtualExtent(h) {
      if (h === this.virtualExtent)
        return;
      this.virtualExtent = h;
      for (let sc = this.parent; sc !== null; sc = sc.parent) {
        if (!sc.scrolls)
          continue;
        emit(OP.SCROLLPOS, sc.id, sc.scrollOffset, sc.contentExtent());
        break;
      }
    }
    contentExtent() {
      let max = 0;
      for (const c of this.children) {
        if (!c.visible)
          continue;
        let ch = c.height;
        if (!c.boxClip && c.clipData === null && !c.scrolls)
          ch = Math.max(ch, c.contentExtent());
        const b = c.y + ch;
        if (b > max)
          max = b;
      }
      return this.virtualExtent !== null ? Math.max(max, this.virtualExtent) : max;
    }
    /** Hit-test a point in this surface's parent coordinates. The canvas
     *  backend's walk, kept identical so the two renderers resolve the same
     *  target for the same point: scale inverted, shape clip subtracted (only
     *  ignoreclip children survive outside it), scroll frame corrected,
     *  children probed in reverse paint order, then this surface's own sink. */
    hit(px, py) {
      if (!this.visible || this.pe === "none")
        return null;
      let lx = px - this.x;
      let ly = py - this.y;
      [lx, ly] = this.invertTransform(lx, ly);
      const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
      const clipped = this.clipData !== null || this.boxClip;
      if (clipped && !this.insideClip(lx, ly)) {
        const cyx = this.scrolls ? ly + this.scrollOffset : ly;
        const cxx = this.scrollsX ? lx + this.scrollXOffset : lx;
        for (let i = this.children.length - 1; i >= 0; i--) {
          const c = this.children[i];
          if (!c.ignoresClip)
            continue;
          const t = c.hit(cxx, cyx);
          if (t !== null)
            return t;
        }
        return null;
      }
      if ((this.scrolls || this.scrollsX) && !inBox)
        return null;
      const cy = this.scrolls ? ly + this.scrollOffset : ly;
      const cx = this.scrollsX ? lx + this.scrollXOffset : lx;
      for (let i = this.children.length - 1; i >= 0; i--) {
        const t = this.children[i].hit(cx, cy);
        if (t !== null)
          return t;
      }
      if (this.sink !== null && inBox) {
        return {
          key: this,
          sink: this.sink,
          ...this.wants,
          x: lx,
          y: ly,
          cursor: this.cursorStyle !== "" ? this.cursorStyle : void 0
        };
      }
      return null;
    }
    /** Inside this surface's clip? The box clip is the rounded box; a shape
     *  clip asks the host (Core Graphics owns the path) — cached per path so
     *  the walk stays cheap. */
    /** The cursor the pointer should show at a point.
     *
     *  NOT the same walk as hit(). On the web a cursor comes from CSS on
     *  whatever element is under the pointer, whether or not it takes events —
     *  the window's resize band is exactly that: eight strips that style a
     *  cursor and carry no handlers, sitting inside one halo that owns the
     *  press. Reading the cursor off the hit TARGET therefore found nothing, and
     *  the window edges showed no resize cursor at all. */
    cursorAt(px, py) {
      if (!this.visible || this.opacity <= 0)
        return "";
      let lx = px - this.x;
      let ly = py - this.y;
      [lx, ly] = this.invertTransform(lx, ly);
      const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
      const clipped = this.clipData !== null || this.boxClip;
      if (clipped && !this.insideClip(lx, ly)) {
        for (let i = this.children.length - 1; i >= 0; i--) {
          const c = this.children[i];
          if (!c.ignoresClip)
            continue;
          const got = c.cursorAt(lx, ly);
          if (got !== "")
            return got;
        }
        return "";
      }
      if ((this.scrolls || this.scrollsX) && !inBox)
        return "";
      const cy = this.scrolls ? ly + this.scrollOffset : ly;
      const cx = this.scrollsX ? lx + this.scrollXOffset : lx;
      for (let i = this.children.length - 1; i >= 0; i--) {
        const got = this.children[i].cursorAt(cx, cy);
        if (got !== "")
          return got;
      }
      return inBox ? this.cursorStyle : "";
    }
    /** Walk the tree the way hit() does, narrating each step. */
    trace(px, py, depth = 0) {
      const pad = "  ".repeat(depth);
      const lx0 = px - this.x, ly0 = py - this.y;
      let lx = lx0, ly = ly0;
      [lx, ly] = this.invertTransform(lx, ly);
      const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
      const clipped = this.clipData !== null || this.boxClip;
      console.log(`${pad}#${this.id} box=${this.x},${this.y} ${this.width}x${this.height} local=${lx.toFixed(0)},${ly.toFixed(0)} vis=${this.visible} inBox=${inBox} clip=${clipped} ignoreclip=${this.ignoresClip} scrollsX=${this.scrollsX} sink=${this.sink !== null} kids=${this.children.length}`);
      if (!this.visible || this.opacity <= 0) {
        console.log(`${pad}  -> invisible, stop`);
        return;
      }
      if (clipped && !this.insideClip(lx, ly)) {
        console.log(`${pad}  -> outside own clip; only ignoreclip kids`);
        for (let i = this.children.length - 1; i >= 0; i--) {
          if (!this.children[i].ignoresClip)
            continue;
          this.children[i].trace(lx, ly, depth + 1);
        }
        return;
      }
      if ((this.scrolls || this.scrollsX) && !inBox) {
        console.log(`${pad}  -> scroller, point outside, stop`);
        return;
      }
      for (let i = this.children.length - 1; i >= 0; i--)
        this.children[i].trace(lx, ly, depth + 1);
    }
    insideClip(lx, ly) {
      if (this.clipData !== null)
        return pointInPath(this.clipData, lx, ly);
      return lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
    }
    /** Does this surface contain the point (its clip respected)? A wheel
     *  belongs to the topmost surface under the pointer and then to ITS
     *  ancestors — never to an occluded sibling, which is what let a scroll
     *  over the front window drive a scroller in the window behind it. */
    ownsPoint(px, py) {
      if (!this.visible || this.opacity <= 0)
        return false;
      let lx = px - this.x;
      let ly = py - this.y;
      [lx, ly] = this.invertTransform(lx, ly);
      if (this.clipData !== null || this.boxClip)
        return this.insideClip(lx, ly);
      return lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
    }
    /** The wheel CLAIM walk (canvas-backend wheelTo, mirrored): descend to the
     *  view under the point and answer with the nearest `onWheel` CLAIMANT or
     *  the nearest scroller — whichever is deeper wins, the DOM's delegation
     *  (an intervening scroller keeps its wheel; a claimant with no nearer
     *  scroller hears the stream, trackpad pinch included). The transform
     *  inverse keeps a rotated subtree honest. Null = neither wants it. */
    wheelTo(px, py, deltaX, deltaY, pinch) {
      if (!this.visible || this.opacity <= 0)
        return null;
      let lx = px - this.x;
      let ly = py - this.y;
      [lx, ly] = this.invertTransform(lx, ly);
      if ((this.clipData !== null || this.boxClip) && !this.insideClip(lx, ly))
        return null;
      const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
      if ((this.scrolls || this.scrollsX) && !inBox)
        return null;
      const cy = this.scrolls ? ly + this.scrollOffset : ly;
      const cx = this.scrollsX ? lx + this.scrollXOffset : lx;
      for (let i = this.children.length - 1; i >= 0; i--) {
        const c = this.children[i];
        const r = c.wheelTo(c.ignoresScroll ? lx : cx, c.ignoresScroll ? ly : cy, deltaX, deltaY, pinch);
        if (r !== null)
          return r;
      }
      if (this.wants?.wantsWheel === true && this.sink !== null && inBox) {
        this.sink("wheel", lx, ly, { deltaX, deltaY, pinch });
        return "claimed";
      }
      return (this.scrolls || this.scrollsX) && inBox ? "scroller" : null;
    }
    /** Route a HORIZONTAL wheel delta to the innermost surface that scrolls on
     *  that axis. A trackpad reports both deltas and the DOM routes each to
     *  whichever ancestor scrolls that way; only the vertical half existed here,
     *  so the Files strip could be revealed programmatically but never dragged. */
    scrollByX(px, py, dx) {
      if (!this.visible || this.opacity <= 0)
        return false;
      let lx = px - this.x;
      let ly = py - this.y;
      [lx, ly] = this.invertTransform(lx, ly);
      const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
      if ((this.scrolls || this.scrollsX) && !inBox)
        return false;
      const cy = this.scrolls ? ly + this.scrollOffset : ly;
      const cx = this.scrollsX ? lx + this.scrollXOffset : lx;
      for (let i = this.children.length - 1; i >= 0; i--) {
        const c = this.children[i];
        if (!c.ownsPoint(cx, cy))
          continue;
        if (c.scrollByX(cx, cy, dx))
          return true;
        break;
      }
      if (this.scrollsX && inBox) {
        const max = Math.max(0, this.contentExtentX() - this.width);
        const next = Math.min(max, Math.max(0, this.scrollXOffset + dx));
        if (next !== this.scrollXOffset) {
          this.scrollXOffset = next;
          emit(OP.SCROLLXPOS, this.id, next, this.contentExtentX());
          return true;
        }
        return max > 0;
      }
      return false;
    }
    /** Route a wheel delta to the innermost scrolling surface under the point
     *  (the canvas backend's scrollBy, verbatim + the op emit). */
    scrollBy(px, py, dy) {
      if (!this.visible || this.opacity <= 0)
        return false;
      let lx = px - this.x;
      let ly = py - this.y;
      [lx, ly] = this.invertTransform(lx, ly);
      const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
      if ((this.scrolls || this.scrollsX) && !inBox)
        return false;
      const cy = this.scrolls ? ly + this.scrollOffset : ly;
      const cx = this.scrollsX ? lx + this.scrollXOffset : lx;
      for (let i = this.children.length - 1; i >= 0; i--) {
        if (this.children[i].scrollBy(cx, cy, dy))
          return true;
      }
      if (this.scrolls && inBox) {
        const max = Math.max(0, this.contentExtent() - this.height);
        const next = Math.min(max, Math.max(0, this.scrollOffset + dy));
        if (next !== this.scrollOffset) {
          this.scrollOffset = next;
          this.onScrollCb?.(next);
          emit(OP.SCROLLPOS, this.id, next, this.contentExtent());
          return true;
        }
        return max > 0;
      }
      return false;
    }
  };
  var surfaces = /* @__PURE__ */ new Map();
  var richCallbacks = /* @__PURE__ */ new Map();
  var editCallbacks = /* @__PURE__ */ new Map();
  var embeds = /* @__PURE__ */ new Map();
  var islandViews = /* @__PURE__ */ new Map();
  function surfaceOrigin(id) {
    const s = surfaces.get(id);
    if (s === void 0)
      return [0, 0];
    let x = s.x, y = s.y;
    for (let p = s.parent; p !== null; p = p.parent) {
      if (p.scrolls)
        y -= p.scrollOffset;
      if (p.scrollsX)
        x -= p.scrollXOffset;
      x += p.x;
      y += p.y;
    }
    return [x, y];
  }
  function publishChildName(islandId, name) {
    const v = islandViews.get(islandId);
    if (v !== void 0 && v.childName !== name)
      v.childName = name;
  }
  function embedsPending() {
    const out = [];
    for (const [id, slot] of embeds)
      out.push({ id, slot });
    return out;
  }
  function mountEmbed(islandId, childRoot) {
    surfaces.get(islandId)?.insertChild(childRoot, null);
    const r = childRoot;
    r.scrolls = false;
    r.scrollsX = false;
    r.scrollOffset = 0;
    r.scrollXOffset = 0;
    emit(OP.SCROLLPOS, r.id, 0, 0);
    emit(OP.SCROLLXPOS, r.id, 0, 0);
    emit(OP.SCROLL, r.id, 0);
    emit(OP.SCROLLX, r.id, 0);
    r.appRoot = true;
    r.setBoxClip(true);
  }
  function clearEmbed(islandId) {
    const s = surfaces.get(islandId);
    if (s === void 0)
      return;
    for (const c of [...s.children])
      c.destroy();
  }
  function surfaceById(id) {
    return surfaces.get(id) ?? null;
  }
  var pointInPathImpl = null;
  function provideHitPath(fn) {
    pointInPathImpl = fn;
  }
  function pointInPath(d, x, y) {
    return pointInPathImpl === null ? true : pointInPathImpl(d, x, y);
  }
  var MacBackend = class {
    root = null;
    createSurface() {
      const s = new MacSurface();
      surfaces.set(s.id, s);
      return s;
    }
    /** No HTMLElement here: the "host" is the native window's root layer. The
     *  root surface is named to the Swift side, and input routing starts. */
    attachRoot(_host, root) {
      const r = root;
      this.root = r;
      macRoot = r;
      emit(OP.ROOT, r.id);
      emit(OP.PAGEFILL, r.id, r.fillCss);
      routeInput(() => macRoot === r, (e) => {
        const ee = e;
        const t = r.hit(ee.clientX, ee.clientY);
        if (ee.type === "pointermove") {
          const cur = r.cursorAt(ee.clientX, ee.clientY);
          if (cur !== lastCursor) {
            lastCursor = cur;
            emit(OP.CURSOR, 0, cur);
          }
        }
        if (globalThis.__declareHitDebug === true && ee.type !== "pointermove") {
          console.log("[hit] " + ee.type + " @" + ee.clientX.toFixed(0) + "," + ee.clientY.toFixed(0) + " -> " + (t === null ? "null" : "id " + t.key.id));
        }
        return t;
      }, (e) => ({ x: e.clientX, y: e.clientY }), (t) => {
        void t;
        if (globalThis.__declareHitDebug === true) {
          console.log("[hit] hover -> " + (t === null ? "null" : "id " + t.key.id + " cursor=" + (t.cursor ?? "-")));
        }
      });
    }
  };
  var macRoot = null;
  var lastCursor = "";
  var GLIDE_MS = 320;
  var ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function glide(from, to, step) {
    const t0 = Date.now();
    let ticks = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - t0) / GLIDE_MS);
      ticks++;
      step(from + (to - from) * ease(t));
      if (t < 1)
        requestAnimationFrame(tick);
      else if (globalThis.__declareHitDebug === true) {
        console.log(`[glide] ${from.toFixed(0)} -> ${to.toFixed(0)} in ${ticks} frames`);
      }
    };
    requestAnimationFrame(tick);
  }
  function glideX(sc, to) {
    glide(sc.scrollXOffset, to, (v) => {
      sc.scrollXOffset = v;
      emit(OP.SCROLLXPOS, sc.id, v, sc.contentExtentXPublic());
      flushOps();
    });
  }
  function glideY(sc, to) {
    glide(sc.scrollOffset, to, (v) => {
      sc.setScrollOffset(v);
      emit(OP.SCROLLPOS, sc.id, v, sc.contentExtent());
      flushOps();
    });
  }
  function macScrollTo(id, y, x = null) {
    const s = surfaces.get(id);
    if (s === void 0)
      return;
    let moved = false;
    if (s.scrolls) {
      const max = Math.max(0, s.contentExtent() - s.height);
      const next = Math.min(max, Math.max(0, y));
      if (next !== s.scrollOffset) {
        s.setScrollOffset(next);
        emit(OP.SCROLLPOS, s.id, next, s.contentExtent());
        moved = true;
      }
    }
    if (x !== null && s.scrollsX) {
      const maxX = Math.max(0, s.contentExtentXPublic() - s.width);
      const nextX = Math.min(maxX, Math.max(0, x));
      if (nextX !== s.scrollXOffset) {
        s.scrollXOffset = nextX;
        emit(OP.SCROLLXPOS, s.id, nextX, s.contentExtentXPublic());
        moved = true;
      }
    }
    if (moved)
      flushOps();
  }
  function macTraceHit(x, y) {
    const t = macRoot?.hit(x, y) ?? null;
    console.log(`[trace] === hit walk at ${x},${y} -> ` + (t === null ? "NOTHING" : `id ${t.key.id} cursor=${t.cursor ?? "-"}`) + ` (cursorAt="${macRoot?.cursorAt(x, y) ?? ""}") ===`);
    macRoot?.trace(x, y);
  }
  function macScroll(x, y, dy, dx = 0) {
    if (dy !== 0)
      macRoot?.scrollBy(x, y, dy);
    if (dx !== 0)
      macRoot?.scrollByX(x, y, dx);
    flushOps();
  }
  function macWheel(x, y, dx, dy, pinch) {
    if (macRoot?.wheelTo(x, y, dx, dy, pinch) !== "claimed") {
      if (dy !== 0)
        macRoot?.scrollBy(x, y, dy);
      if (dx !== 0)
        macRoot?.scrollByX(x, y, dx);
    }
    flushOps();
  }
  function macRichHeight(id, h) {
    surfaces.get(id)?.applyRichHeight(h);
  }
  function macRichLink(id, href) {
    richCallbacks.get(id)?.onLink(href);
  }
  function macEditInput(id, value) {
    editCallbacks.get(id)?.onInput?.(value);
  }
  function macEditFocus(id, focused) {
    const spec = editCallbacks.get(id);
    if (focused)
      spec?.onFocus?.();
    else
      spec?.onBlur?.();
  }
  function macEditEnter(id) {
    editCallbacks.get(id)?.onEnter?.();
  }

  // browser/mac-boot.js
  var H = globalThis.__declareMacHost;
  var log = (m) => H.log("log", m);
  provideMeasurer(globalThis.__declareMeasurer);
  provideHitPath((d, x, y) => H.pathHit(d, x, y));
  provideTransport((url, opts) => fetch(new URL(url, globalThis.__declareBase || "http://localhost/").href, opts));
  var CACHE_NS = "programs";
  async function fromProduction(dirUrl) {
    try {
      const res = await fetch(new URL("program.json", dirUrl).href);
      if (!res.ok) return null;
      const j = await res.json();
      if (!j || !j.source) return null;
      log("boot: production artifact");
      return { source: j.source, deps: j.deps ?? {}, base: dirUrl };
    } catch {
      return null;
    }
  }
  async function fromServer(programUrl) {
    const u = new URL(programUrl);
    u.search = (u.search ? u.search + "&" : "?") + "program&render=mac";
    const key = CACHE_NS + ":" + programUrl;
    let cached = null;
    try {
      const raw = H.cacheGet(key);
      if (raw) cached = JSON.parse(raw);
    } catch {
      cached = null;
    }
    const headers = cached && cached.etag ? { "if-none-match": cached.etag } : void 0;
    const res = await fetch(u.href, headers ? { headers } : void 0);
    if (res.status === 304 && cached) {
      log("boot: client cache (304, revalidated)");
      return { source: cached.source, deps: cached.deps ?? {}, base: programUrl };
    }
    if (!res.ok) return null;
    const j = await res.json();
    if (!j || !j.source) {
      if (j && j.report) throw new Error(j.report);
      return null;
    }
    const etag = j.etag ?? null;
    try {
      H.cacheSet(key, JSON.stringify({ source: j.source, deps: j.deps ?? {}, etag }));
    } catch {
    }
    log("boot: server compile" + (etag ? " (cached for next time)" : ""));
    return { source: j.source, deps: j.deps ?? {}, base: programUrl };
  }
  var compilerLoaded = false;
  async function loadCompiler(origin) {
    if (compilerLoaded) return true;
    const url = new URL("/bundles/declare-compiler-mac.js", origin).href;
    const res = await fetch(url);
    if (!res.ok) return false;
    const src = await res.text();
    H.evaluate(src, url);
    compilerLoaded = typeof globalThis.__declareCompiler === "object";
    return compilerLoaded;
  }
  async function ensureLibrary(origin) {
    if (globalThis.__declareLibLoaded) return;
    try {
      const manifest = await (await fetch(new URL("/library/autoincludes.json", origin).href)).json();
      const names = [...new Set(Object.values(manifest).filter((v) => typeof v === "string"))];
      const files = {};
      await Promise.all(names.map(async (f) => {
        const r = await fetch(new URL("/library/" + f, origin).href);
        if (r.ok) files["library/" + f] = await r.text();
      }));
      globalThis.__declareCompiler.setDefaultLibrary({ files, manifest, libraryRoot: "library" });
      globalThis.__declareLibLoaded = true;
    } catch (e) {
      log("client compile: library fetch failed \u2014 " + e.message);
    }
  }
  async function fromClient(programUrl) {
    const origin = new URL(programUrl).origin;
    if (!await loadCompiler(origin)) return null;
    const src = await (await fetch(programUrl)).text();
    await ensureLibrary(origin);
    const dir = programUrl.replace(/[^/]*$/, "");
    const out = globalThis.__declareCompiler.compile(src, { originDir: dir });
    if (!out.source) throw new Error(out.report || "compile failed");
    log("boot: client compile");
    return { source: out.source, deps: out.deps ?? {}, base: programUrl };
  }
  async function resolveProgram(url) {
    if (url.endsWith("/") || url.endsWith("program.json")) {
      const p = await fromProduction(url.endsWith("/") ? url : url.replace(/program\.json$/, ""));
      if (p) return p;
    }
    try {
      const s = await fromServer(url);
      if (s) return s;
    } catch (e) {
      log("server compile unavailable (" + e.message + ") \u2014 trying the client tier");
    }
    const c = await fromClient(url);
    if (c) return c;
    throw new Error("could not load " + url);
  }
  var currentApp = null;
  var backend = null;
  async function macBoot(url) {
    const { source, deps, base: base2 } = await resolveProgram(url);
    globalThis.__declareBase = base2.replace(/[^/]*$/, "");
    globalThis.__declareMain = base2;
    const app = build(source, { deps });
    currentApp = app;
    globalThis.__app = app;
    liveApps.set(app, null);
    installChildPointerEnv();
    const hash = new URL(base2).hash.replace(/^#/, "");
    if (hash) {
      app.location = hash;
      settle();
    }
    try {
      await loadFonts(fontFacesOf(app));
    } catch {
    }
    backend = new MacBackend();
    mountApp(app, hostStub(), backend);
    globalThis.__declare = bridgeFor(app);
    Focus.setRoot(app);
    Keys.listen(() => currentApp?.surface != null);
    deliverKeys(Keys, Focus);
    wireDiag();
    settle();
    flushOps();
    H.setTitle(app.appName || programName(base2));
    startPumps(app);
    return app;
  }
  function hostStub() {
    return {
      closest: () => null,
      clientWidth: globalThis.innerWidth,
      clientHeight: globalThis.innerHeight,
      style: {},
      appendChild() {
      },
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener() {
      },
      removeEventListener() {
      },
      isConnected: true,
      ownerDocument: globalThis.document
    };
  }
  var programName = (u) => (u.split("/").pop() || "app").replace(/\.declare$/, "");
  function startPumps(app) {
    let title = "";
    const tick = () => {
      if (currentApp !== app) return;
      if (app.appName !== title) {
        title = app.appName;
        H.setTitle(title || "Declare");
      }
      wireEmbeds();
      liveTick();
      globalThis.requestAnimationFrame(tick);
    };
    globalThis.requestAnimationFrame(tick);
  }
  var wiredEmbeds = /* @__PURE__ */ new Map();
  var embedGen = /* @__PURE__ */ new Map();
  var liveApps = /* @__PURE__ */ new Map();
  var liveSigs = /* @__PURE__ */ new Map();
  var childIslands = /* @__PURE__ */ new Map();
  globalThis.__children = () => [...liveApps.keys()].filter((a) => childIslands.has(a));
  function installChildPointerEnv() {
    const g = globalThis;
    const orig = g.__declarePointer;
    if (typeof orig !== "function" || g.__declareChildPointerEnv) return;
    g.__declareChildPointerEnv = true;
    g.__declarePointer = (type, x, y, buttons, mods) => {
      for (const [child] of liveApps) {
        const islandId = childIslands.get(child);
        if (islandId === void 0) continue;
        const [ox, oy] = surfaceOrigin(islandId);
        const px = x - ox, py = y - oy;
        if (child.pointerX !== px) child.pointerX = px;
        if (child.pointerY !== py) child.pointerY = py;
        if (type === "pointerdown" && !child.pointerDown) child.pointerDown = true;
        if (type === "pointerup" && child.pointerDown) child.pointerDown = false;
        if (!child.hovering) child.hovering = true;
      }
      orig(type, x, y, buttons, mods);
    };
  }
  function wireEmbeds() {
    const pend = embedsPending();
    if (pend.length === 0) return;
    for (const { id, slot } of pend) {
      const prev = wiredEmbeds.get(id);
      if (prev === slot) continue;
      wiredEmbeds.set(id, slot);
      if (!slot || !slot.startsWith("run:")) continue;
      const spec = slot.slice(4).split("|");
      const name = spec[0];
      const env = parseEnv(spec[1] || "");
      if (!name || name.startsWith("__")) continue;
      log("island mount: " + name + " env=" + JSON.stringify(env) + " slot=" + slot);
      mountChild(id, name, env).catch((e) => log("island " + name + ": " + e.message));
    }
  }
  function within(s, root) {
    for (let c = s; c; c = c.parent) if (c === root) return true;
    return false;
  }
  function liveIsland(card, scopeBox, appRoot) {
    for (const { id, slot } of embedsPending()) {
      if (!slot.startsWith("run:" + card)) continue;
      const s = surfaceById(id);
      if (!s) continue;
      if (scopeBox !== null && !within(s, scopeBox)) continue;
      if (scopeBox === null && appRoot && !within(s, appRoot)) continue;
      return id;
    }
    return -1;
  }
  function watchLive(app, scopeBox) {
    const card = typeof app.liveCard === "string" ? app.liveCard : "";
    if (card === "") return;
    const body = typeof app.liveSource === "string" ? app.liveSource : "";
    const sig = card + "\0" + body;
    if (liveSigs.get(app) === sig) return;
    const id = liveIsland(card, scopeBox, app.surface);
    if (id < 0) return;
    liveSigs.set(app, sig);
    compileLive(body).then((r) => {
      if (r && r.source) {
        app.liveReport = "";
        mountCompiled(id, r, null);
      } else if (r && r.report != null) app.liveReport = String(r.report);
      else liveSigs.delete(app);
    }).catch(() => liveSigs.delete(app));
  }
  async function compileLive(src) {
    const main = globalThis.__declareMain || "";
    let origin = "";
    try {
      origin = new URL(main).origin;
    } catch {
      return null;
    }
    try {
      const res = await fetch(
        new URL("/compile?main=" + encodeURIComponent(main), origin).href,
        { method: "POST", body: src }
      );
      if (res.ok) {
        const r = await res.json();
        return r.source ? { source: r.source, deps: r.deps ?? {} } : { report: r.report || "compile failed" };
      }
    } catch (e) {
      log("live compile: " + e.message);
    }
    if (!await loadCompiler(origin)) return null;
    await ensureLibrary(origin);
    try {
      const dir = main.replace(/[^/]*$/, "");
      const out = globalThis.__declareCompiler.compile(src, { originDir: dir });
      return out.source ? { source: out.source, deps: out.deps ?? {} } : { report: out.report || "compile failed" };
    } catch (e) {
      return { report: e && e.message ? e.message : String(e) };
    }
  }
  function liveTick() {
    for (const [app, box] of liveApps) watchLive(app, box);
  }
  function parseEnv(q) {
    const env = {};
    for (const pair of q.split("&")) {
      if (!pair) continue;
      const i = pair.indexOf("=");
      const k = i < 0 ? pair : pair.slice(0, i);
      const v = i < 0 ? "true" : pair.slice(i + 1);
      env[k] = v === "true" || v === "1" ? true : v === "false" || v === "0" ? false : v !== "" && !isNaN(Number(v)) ? Number(v) : v;
    }
    return env;
  }
  async function mountChild(surfaceId, name, env) {
    const box = surfaceById(surfaceId);
    if (!box) return;
    const base2 = globalThis.__declareBase || "";
    const url = new URL(name.endsWith(".declare") ? name : name + ".declare", new URL("demos/", base2)).href;
    const { source, deps } = await resolveProgram(url);
    mountCompiled(surfaceId, { source, deps }, env);
    log("island: " + name + " mounted");
  }
  function mountCompiled(surfaceId, compiled, env) {
    const box = surfaceById(surfaceId);
    if (!box) return null;
    const gen = (embedGen.get(surfaceId) || 0) + 1;
    embedGen.set(surfaceId, gen);
    clearEmbed(surfaceId);
    const child = build(compiled.source, { deps: compiled.deps ?? {} });
    child.attach(backend, null);
    mountEmbed(surfaceId, child.surface);
    child.hostWidth = box.width;
    child.hostHeight = box.height;
    if ((child.minWidth > 0 || child.minHeight > 0) && box.setScroll) {
      box.setScroll(true, (y) => {
      });
    }
    if (env && Object.keys(env).length) child.env = env;
    child.dark = H.appearance() === "dark";
    liveApps.set(child, box);
    childIslands.set(child, surfaceId);
    const follow = () => {
      if (embedGen.get(surfaceId) !== gen) {
        liveApps.delete(child);
        childIslands.delete(child);
        return;
      }
      if (surfaceById(surfaceId) !== box) {
        liveApps.delete(child);
        childIslands.delete(child);
        return;
      }
      if (child.hostWidth !== box.width || child.hostHeight !== box.height) {
        child.hostWidth = box.width;
        child.hostHeight = box.height;
      }
      const dark = H.appearance() === "dark";
      if (child.dark !== dark) child.dark = dark;
      publishChildName(surfaceId, typeof child.appName === "string" ? child.appName : "");
      globalThis.requestAnimationFrame(follow);
    };
    globalThis.requestAnimationFrame(follow);
    settle();
    flushOps();
    return child;
  }
  globalThis.__declareBoot = (url) => macBoot(url).catch((e) => {
    H.log("error", "boot failed: " + (e && e.stack || e));
    H.bootFailed(String(e && e.message || e));
  });
  globalThis.__declareScroll = (x, y, dy, dx) => macScroll(x, y, dy, dx || 0);
  globalThis.__declareWheel = (x, y, dx, dy, pinch) => macWheel(x, y, dx || 0, dy || 0, !!pinch);
  globalThis.__declareScrollTo = (id, y, x) => {
    macScrollTo(id, y, x === void 0 || x === null ? null : x);
    settle();
    flushOps();
  };
  globalThis.__declareTraceHit = (x, y) => macTraceHit(x, y);
  globalThis.__declareRichHeight = (id, h) => {
    macRichHeight(id, h);
    settle();
    flushOps();
  };
  globalThis.__declareRichLink = (id, href) => {
    macRichLink(id, href);
    settle();
    flushOps();
  };
  globalThis.__declareEditInput = (id, v) => {
    macEditInput(id, v);
    settle();
    flushOps();
  };
  globalThis.__declareEditFocus = (id, f) => {
    macEditFocus(id, f);
    settle();
    flushOps();
  };
  globalThis.__declareEditEnter = (id) => {
    macEditEnter(id);
    settle();
    flushOps();
  };
  globalThis.__declareSettle = () => {
    settle();
    flushOps();
  };
  globalThis.__declareBench = () => {
    const app = currentApp;
    const out = { ops: 0, settleMs: 0, serializeMs: 0, settles: 0 };
    if (!app) return JSON.stringify(out);
    const t = () => H.now();
    const w = app.hostWidth, h = app.hostHeight;
    const N = 60;
    let settleTotal = 0, opTotal = 0, serTotal = 0;
    for (let i = 0; i < N; i++) {
      app.hostWidth = w + (i % 2 ? 1 : -1);
      const a = t();
      settle();
      settleTotal += t() - a;
      const b = t();
      const json = peekOps();
      serTotal += t() - b;
      opTotal += countOps();
      flushOps();
    }
    app.hostWidth = w;
    app.hostHeight = h;
    settle();
    flushOps();
    out.settles = N;
    out.settleMs = +(settleTotal / N).toFixed(3);
    out.serializeMs = +(serTotal / N).toFixed(3);
    out.ops = Math.round(opTotal / N);
    return JSON.stringify(out);
  };
  var diag = { rawKeydowns: 0, deliveries: 0, nextCalls: 0 };
  globalThis.__declareDiag = () => ({
    ...diag,
    focused: Focus.getFocus()?.constructor?.name ?? null
  });
  globalThis.__declareDiagReset = () => {
    diag.rawKeydowns = 0;
    diag.deliveries = 0;
    diag.nextCalls = 0;
    return "ok";
  };
  var diagWired = false;
  function wireDiag() {
    if (diagWired) return;
    diagWired = true;
    window.addEventListener("keydown", () => {
      diag.rawKeydowns++;
    });
    Keys.onKeyDown(() => {
      diag.deliveries++;
    });
    const origNext = Focus.next.bind(Focus);
    Focus.next = () => {
      diag.nextCalls++;
      origNext();
    };
  }
  globalThis.__declareReset = () => {
    Focus.reset();
    Keys.clearHeld();
    return "ok";
  };
  globalThis.__declareEnvChanged = () => {
    globalThis.__declareAppearanceChanged?.();
    if (currentApp) {
      currentApp.dark = H.appearance() === "dark";
      settle();
      flushOps();
    }
  };
  return __toCommonJS(mac_boot_exports);
})();
