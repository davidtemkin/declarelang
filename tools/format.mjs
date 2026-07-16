#!/usr/bin/env node
// format.mjs — the Declare canon formatter (design/formatting.md).
//
//   node tools/format.mjs <file>            formatted source → stdout
//   node tools/format.mjs --write <files…>  rewrite in place (only when changed)
//   node tools/format.mjs --check <files…>  exit 1 if any file is not canon
//
// WHAT IT ENFORCES (the mechanical part of the canon — §2, §3, §5):
//   - four-space indentation everywhere, from Declare bracket depth; wrapped
//     members land at block indent (§2.5) because a continuation line and a
//     nested member share a column by construction;
//   - token spacing (§3): single space is the machine default — 0 gaps
//     normalize to the canonical spacing, glue positions stay glued — and an
//     author's 2+-space interior run (the aligned LEDGER) is preserved
//     verbatim (ruled 2026-07-13: alignment at the author's discretion; the
//     formatter never manufactures a column);
//   - the two closing styles (§2.4): an attributes-only ("leaf") body closes
//     inline (`… ],`), a body holding a declaration / method / child closes
//     hanging (`],` alone at content indent), and the member before a hanging
//     close always carries the trailing comma;
//   - declarations, methods, and child instances each start their own line and
//     end it (plain attrs may pack); the FIRST member may ride the header line
//     (the canon's own examples do: `class Screen extends View [ shown: … ,`);
//   - trailing-comment gap (§2.7, re-ruled 2026-07-13): minimum TWO spaces,
//     no upper bound — a 0–1-space gap widens to two, anything wider is the
//     author's verbatim (gofmt school), so trailing-comment column alignment
//     is unrestricted — the one ruled exception to §3's no-alignment rule;
//   - standalone comment padding (§2.7, ruled 2026-07-13): a standalone
//     comment block gets a blank line above AND below — missing blanks are
//     inserted — except above a block that opens its body or the file, and
//     never against a closing bracket; the comment still documents the member
//     below it, blank notwithstanding;
//   - the top-level separator is NORMALIZED (§2.1, ruled 2026-07-13,
//     superseding the discretional rule): exactly ONE blank line after a
//     one-line top-level declaration, exactly TWO after a multiline one —
//     measured to the next item's first line; a doc comment counts as part
//     of the declaration it documents, so the separator sits above the
//     comment and the comment keeps its own §2.7 padding below;
//   - blank-line CLAMP elsewhere (§4, ruled 2026-07-13): at most 2
//     consecutive blanks at top level (around detached comment blocks), at
//     most 1 inside any bracket body; within those caps the author's
//     blank-line choices are preserved.
//
// WHAT IT NEVER TOUCHES (§5.3, §5.5 — the never-retoken rule):
//   - `{ }` bodies (constraints, methods, Dataset `{ json }`) are opaque: the
//     block is shifted as a whole when its member re-indents, lines inside
//     multi-line strings/templates are never shifted, and the only skeleton
//     fix is a lone closing `}` re-seated at body indent (§2.6);
//   - comment TEXT is byte-exact — `//`/`/* */` raws are never rewritten, only
//     re-indented (block-comment and `"""` interiors are verbatim: they carry
//     Markdown, where columns mean things);
//   - literal spellings (`0x…` vs `#…`, quote style, escapes) are verbatim;
//   - member order, author line breaks, and author blank lines (within CLAMP).
//
// Deliberately NOT implemented (conservative v1 — see the design summary in
// test/format.test.mjs): header-line packing and width-based re-wrapping. The
// exemplar (examples/codeviewer/codeviewer.declare) fills headers by judgment,
// not to a mechanical width (it carries 154-char lines the canon's own dial
// would re-wrap), so the formatter keeps the author's line breaks and only
// normalizes what the canon states mechanically.
//
// Every run self-verifies (§5.5): comment raws byte-identical, token streams
// identical modulo the trailing comma a close style adds/removes, `{ }` island
// lines byte-identical. A violation aborts (and never writes).

import { readFileSync, writeFileSync } from "node:fs";

// ── Lexer ───────────────────────────────────────────────────────────────────
// Mirrors runtime/src/parser.ts's tokenize(), but keeps trivia: comments are
// tokens, raw slices are exact source bytes, and `{ }` code spans record the
// string/template ISLANDS inside them (line starts inside an island are never
// re-indented — that whitespace is program data).

const PUNCT = { "[": "lb", "]": "rb", "(": "lp", ")": "rp", "=": "eq", ",": "comma", ":": "colon", ".": "dot" };
const isDigit = (c) => c >= "0" && c <= "9";
const isIdentStart = (c) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isIdentPart = (c) => isIdentStart(c) || isDigit(c);
const isHex = (c) => isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");

class FormatError extends Error {
  constructor(message, line) {
    super(line ? `${message} (line ${line})` : message);
    this.line = line;
  }
}

export function lex(src) {
  const tokens = [];
  let i = 0;
  let line = 1;

  const err = (m) => { throw new FormatError(m, line); };
  const countLines = (s) => { let n = 0; for (const c of s) if (c === "\n") n++; return n; };
  const push = (kind, start) => {
    const raw = src.slice(start, i);
    const t = { kind, raw, start, end: i, line, endLine: line + countLines(raw) };
    // `line` tracked lazily: recompute properly below.
    tokens.push(t);
    line = t.endLine;
    return t;
  };

  // Balanced-brace scan for `{ }` code spans, blind to TS except its lexical
  // islands (strings / templates / comments) — parser.ts's scan, plus island
  // spans recorded so the emitter never shifts a line that starts inside one.
  const scanCode = (start) => {
    const islands = [];
    let depth = 1;
    const skipString = (q) => {
      const s = i; i++;
      while (i < src.length && src[i] !== q && src[i] !== "\n") { if (src[i] === "\\") i++; i++; }
      if (src[i] !== q) err("unterminated string in { } expression");
      i++;
      islands.push([s, i]);
    };
    const skipTemplate = () => {
      const s = i; i++;
      while (i < src.length && src[i] !== "`") {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "$" && src[i + 1] === "{") {
          // The interpolation is code, but shifting only PART of a template's
          // lines would tear it — treat the whole template as one island.
          i += 2;
          let d = 1;
          while (i < src.length && d > 0) {
            if (src[i] === "{") d++;
            else if (src[i] === "}") d--;
            else if (src[i] === '"' || src[i] === "'") { skipString(src[i]); continue; }
            else if (src[i] === "`") { skipTemplate(); continue; }
            i++;
          }
          continue;
        }
        i++;
      }
      if (i >= src.length) err("unterminated template literal in { } expression");
      i++;
      islands.push([s, i]);
    };
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === "{") { depth++; i++; }
      else if (ch === "}") { depth--; i++; }
      else if (ch === '"' || ch === "'") skipString(ch);
      else if (ch === "`") skipTemplate();
      else if (ch === "/" && src[i + 1] === "/") { const s = i; while (i < src.length && src[i] !== "\n") i++; islands.push([s, i]); }
      else if (ch === "/" && src[i + 1] === "*") {
        const s = i; i += 2;
        while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
        if (i >= src.length) err("unterminated comment in { } expression");
        i += 2;
        islands.push([s, i]);
      }
      else i++;
    }
    if (depth > 0) err("unterminated { } expression");
    const t = push("code", start);
    t.islands = islands;
  };

  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\r") { i++; continue; }
    if (c === "\n") { i++; line++; continue; }

    const start = i;

    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; push("lcomment", start); continue; }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      if (i >= src.length) err("unterminated block comment");
      i += 2;
      push("bcomment", start);
      continue;
    }
    if (c === "<" && src[i + 1] === "-" && src[i + 2] === ">") { i += 3; push("bindtwo", start); continue; }
    if (c === "<" && src[i + 1] === "-") { i += 2; push("subfrom", start); continue; }
    if (PUNCT[c]) { i++; push(PUNCT[c], start); continue; }
    if (c === '"' && src[i + 1] === '"' && src[i + 2] === '"') {
      i += 3;
      while (i < src.length && !(src[i] === '"' && src[i + 1] === '"' && src[i + 2] === '"')) i++;
      if (i >= src.length) err('unterminated text block (""")');
      i += 3;
      push("textblock", start);
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < src.length && src[i] !== c) { if (src[i] === "\\") i++; i++; }
      if (i >= src.length) err("unterminated string");
      i++;
      push("string", start);
      continue;
    }
    if (c === "{") { i++; scanCode(start); continue; }
    if (c === "#") { i++; while (i < src.length && isHex(src[i])) i++; push("hexcolor", start); continue; }
    if (isDigit(c) || (c === "-" && isDigit(src[i + 1]))) {
      if (c === "-") i++;
      if (src[i] === "0" && (src[i + 1] === "x" || src[i + 1] === "X")) { i += 2; while (i < src.length && isHex(src[i])) i++; }
      else {
        while (i < src.length && isDigit(src[i])) i++;
        if (src[i] === "." && isDigit(src[i + 1])) { i++; while (i < src.length && isDigit(src[i])) i++; }
      }
      if (src[i] === "%") { i++; push("percent", start); } else push("number", start);
      continue;
    }
    if (isIdentStart(c)) { while (i < src.length && isIdentPart(src[i])) i++; push("ident", start); continue; }
    err(`unexpected character '${c}'`);
  }
  tokens.push({ kind: "eof", raw: "", start: i, end: i, line, endLine: line });
  return tokens;
}

// ── Structure ───────────────────────────────────────────────────────────────
// A syntax-only walk mirroring runtime/src/parser.ts (comments skipped, like
// the parser's lexer skips them), annotating what emission needs: each `[`/`]`
// pair's ROLE (member body vs list literal vs the `[]` replication marker),
// each colon's role (declaration head vs datapath), and every body's member
// list with kinds — enough to classify leaf vs hanging and line ownership.

function analyze(tokens) {
  const nc = [];
  for (let k = 0; k < tokens.length; k++) {
    const kind = tokens[k].kind;
    if (kind !== "lcomment" && kind !== "bcomment") nc.push(k);
  }
  let p = 0; // cursor into nc
  const bodies = [];

  const tok = (k = 0) => tokens[nc[Math.min(p + k, nc.length - 1)]];
  const idx = (k = 0) => nc[Math.min(p + k, nc.length - 1)];
  const fail = (m) => { throw new FormatError(m, tok().line); };
  const expect = (kind, what) => {
    if (tok().kind !== kind) fail(`expected ${what}, got '${tok().raw || tok().kind}'`);
    return nc[p++];
  };

  function parseLiteral() {
    const t = tok();
    switch (t.kind) {
      case "number": case "percent": case "string": case "textblock": case "hexcolor": case "code":
        return nc[p++];
      case "ident": {
        const at = nc[p++];
        if (tok().kind === "lp") { // value constructor `name(args)`
          p++;
          while (tok().kind !== "rp" && tok().kind !== "eof") {
            parseLiteral();
            if (tok().kind === "comma") p++; else break;
          }
          return expect("rp", "')'");
        }
        return at;
      }
      case "colon": { // datapath `:a.b` / `:arr[]`
        t.colonKind = "path";
        p++;
        let last = tokens[expect("ident", "a field name after ':'")];
        while (tok().kind === "dot") { p++; last = tokens[expect("ident", "a field name after '.'")]; }
        if (tok().kind === "lb" && tok().start === last.end && tok(1).kind === "rb") {
          tok().role = "repl"; p++;
          tok().role = "repl";
          return expect("rb", "']'");
        }
        return nc[p - 1];
      }
      case "lb": { // list literal
        t.role = "list";
        p++;
        while (tok().kind !== "rb" && tok().kind !== "eof") {
          parseLiteral();
          if (tok().kind === "comma") p++; else break;
        }
        tok().role = "list";
        return expect("rb", "']'");
      }
      default:
        return fail(`expected a value, got '${t.raw || t.kind}'`);
    }
  }

  // A `[ … ]` member body; cursor sits ON the `[`. Returns the body record.
  function parseBody(topLevel) {
    tokens[idx()].role = "body";
    const open = expect("lb", "'['");
    const members = [];
    while (tok().kind !== "rb" && tok().kind !== "eof") {
      const start = idx();
      let name = expect("ident", "a member name");
      if ((tokens[name].raw === "prevailing" || tokens[name].raw === "readonly") &&
          tok().kind === "ident" && tok(1).kind === "colon") {
        name = nc[p++];
      }
      let kind;
      let end;
      if (tok().kind === "eq" || tok().kind === "bindtwo") {
        p++;
        end = parseLiteral();
        kind = "attr";
      } else if (tok().kind === "colon") {
        tok().colonKind = "decl";
        p++;
        if (tok().kind === "lb") { // class-keyed entry `Button: [ … ]`
          end = parseBody(false).close;
          kind = "child";
        } else {
          const type = expect("ident", "a type or component name");
          if (tok().kind === "lb") { end = parseBody(false).close; kind = "child"; }
          else if (tok().kind === "code") { end = nc[p++]; kind = "child"; } // `name: Dataset { … }`
          else if (tok().kind === "eq") { p++; end = parseLiteral(); kind = "decl"; }
          else { end = type; kind = "decl"; }
        }
      } else if (tok().kind === "lp") {
        p++;
        while (tok().kind === "ident") { p++; if (tok().kind === "comma") p++; else break; }
        expect("rp", "')'");
        if (tok().kind === "subfrom") { p++; expect("ident", "the event source's name after '<-'"); }
        if (tok().kind !== "code") fail("expected the method body '{ … }'");
        end = nc[p++];
        kind = "method";
      } else { // anonymous child — bare `Name`, `Name [ … ]`, or `Name { … }`
        if (tok().kind === "lb") end = parseBody(false).close;
        else if (tok().kind === "code") end = nc[p++];
        else end = name;
        kind = "child";
      }
      members.push({ kind, start, end });
      if (tok().kind === "comma") p++; else break;
    }
    tokens[idx()].role = "body";
    const close = expect("rb", "']'");
    const body = { open, close, members, topLevel };
    bodies.push(body);
    return body;
  }

  // `include [ "a", … ]` / `use [ A, … ]` — entries are attr-like list items.
  function parseDirective(entry) {
    expect("ident", `'${entry}'`);
    tokens[idx()].role = "body";
    const open = expect("lb", "'['");
    const members = [];
    while (tok().kind !== "rb" && tok().kind !== "eof") {
      if (tok().kind !== "string" && tok().kind !== "ident") fail(`a ${entry} entry`);
      members.push({ kind: "attr", start: idx(), end: idx() });
      p++;
      if (tok().kind === "comma") p++; else break;
    }
    tokens[idx()].role = "body";
    const close = expect("rb", "']'");
    bodies.push({ open, close, members, topLevel: true, directive: true });
    return close;
  }

  function parseElement(topLevel) {
    const at = expect("ident", "a component name");
    if (tok().kind === "lb") return parseBody(topLevel).close;
    if (tok().kind === "code") return nc[p++]; // raw-bodied element
    return at;
  }

  const at = (word, next) => tok().kind === "ident" && tok().raw === word && tok(1).kind === next;

  for (;;) {
    if (at("include", "lb")) parseDirective("include");
    else if (at("use", "lb")) parseDirective("use");
    else if (at("class", "ident")) {
      p++;
      expect("ident", "the class's name");
      if (tok().kind === "ident" && tok().raw === "extends") { p++; expect("ident", "the base component's name"); }
      parseBody(true);
    } else if (at("stylesheet", "ident") || at("style", "ident") || at("font", "ident")) {
      p++;
      expect("ident", "the declaration's name");
      parseBody(true);
    } else break;
  }
  if (tok().kind !== "eof") parseElement(true); // the root instance
  if (tok().kind !== "eof") fail(`expected end of input, got '${tok().raw}'`);

  return { bodies };
}

// ── Decisions ───────────────────────────────────────────────────────────────
// Turns the structure into token-level edits: forced line breaks, forced joins
// (inline closes), the trailing comma a hanging close requires, the comma an
// inline close sheds. Everything else keeps the author's layout.

function decide(tokens, { bodies }) {
  const breakBefore = new Set();
  const joinBefore = new Set();
  const drop = new Set();
  const commaAfter = new Set();

  const prevSolid = (k) => { // nearest non-comment token index before k
    for (let j = k - 1; j >= 0; j--) {
      const kd = tokens[j].kind;
      if (kd !== "lcomment" && kd !== "bcomment") return j;
    }
    return -1;
  };

  for (const b of bodies) {
    const leaf = b.members.every((m) => m.kind === "attr");
    const multiline = tokens[b.close].line > tokens[b.open].line;
    // §2.4: leaf ⇒ inline close; any declaration/method/child ⇒ hanging close.
    // Top-level bodies always hang — except a body the author kept on ONE line
    // (`font Sans [ family = "system-ui" ]`), which stays: §2.4's rationale is
    // the closing line's comma, and a one-liner has no closing line. A close
    // can't join up onto a line that ends in a `//` comment, so a leaf in that
    // one position keeps a hanging close instead of eating its comment.
    const hang = b.topLevel ? (multiline || !leaf) : !leaf;
    b.hang = hang;
    const before = prevSolid(b.close);
    if (hang) {
      breakBefore.add(b.close);
      if (b.members.length > 0 && !b.directive && tokens[before].kind !== "comma") commaAfter.add(before);
    } else if (tokens[b.close - 1]?.kind === "lcomment") {
      breakBefore.add(b.close);
      if (b.members.length > 0 && !b.directive && tokens[before].kind !== "comma") commaAfter.add(before);
    } else {
      joinBefore.add(b.close);
      if (tokens[before].kind === "comma") drop.add(before);
    }
    // Declarations, methods, and children own their lines (§2.2): a non-attr
    // member starts a fresh line (the body's first member may ride the header)
    // and nothing follows it on its line.
    for (let i = 1; i < b.members.length; i++) {
      if (b.members[i].kind !== "attr" || b.members[i - 1].kind !== "attr") breakBefore.add(b.members[i].start);
    }
  }

  // Comment padding (§2.7, ruled 2026-07-13): a standalone comment block is
  // blank-padded above and below; the missing blank is inserted on either
  // side. Exceptions: no blank above a block that opens its body or the file
  // (the first-in-block exception), and no forced blank against a closing
  // bracket (before-close blanks are the author's — the §2.3 ruling).
  // Trailing inline comments are exempt. `forcedBlank[k]` = the output line
  // that starts with token k gets at least one blank line above it.
  const forcedBlank = new Set();
  {
    const header = []; // each enclosing body's `[`: token index + source line
    const standalone = new Set();
    for (let k = 0; k < tokens.length; k++) {
      const t = tokens[k];
      if (t.kind === "lb" && t.role === "body") header.push({ idx: k, line: t.line });
      else if (t.kind === "rb" && t.role === "body") header.pop();
      if (t.kind !== "lcomment" && t.kind !== "bcomment") continue;
      const p = tokens[k - 1];
      if (p && p.endLine === t.line) continue; // trailing inline — exempt
      standalone.add(k);
      // First-in-block: the previous line IS the body's header line — in the
      // OUTPUT, so a forced member break between the `[` and here cancels it.
      const top = header[header.length - 1];
      let firstInBlock = top !== undefined && p !== undefined && p.endLine === top.line;
      if (firstInBlock) {
        for (let j = top.idx + 1; j < k && firstInBlock; j++) if (breakBefore.has(j)) firstInBlock = false;
      }
      // above: glued to the previous line, and neither same-block nor first-in-block
      if (p && p.endLine === t.line - 1 && !standalone.has(k - 1) && !firstInBlock) {
        forcedBlank.add(k);
      }
      // below: glued to the next line (a further comment is the same block)
      const n = tokens[k + 1];
      if (n && n.kind !== "eof" && n.line === t.endLine + 1 &&
          n.kind !== "lcomment" && n.kind !== "bcomment" && n.kind !== "rb") {
        forcedBlank.add(k + 1);
      }
    }
  }
  // The NORMALIZED top-level separator (§2.1, ruled 2026-07-13): after each
  // top-level declaration, the gap to the next item is exact — ONE blank
  // after a one-liner, TWO after a multiline declaration. A top-level body
  // hangs exactly when it renders multiline, so `hang` IS the shape test.
  // The gap lands above whatever opens the next item — a doc comment
  // included, which then keeps its own §2.7 padding against its declaration.
  const topGap = new Map();
  for (const b of bodies) if (b.topLevel) topGap.set(b.close, b.hang ? 2 : 1);

  return { breakBefore, joinBefore, drop, commaAfter, forcedBlank, topGap };
}

// ── Emission ────────────────────────────────────────────────────────────────

// Single-space token spacing (§3). Returns the gap between two adjacent
// tokens on one line. Single space is the machine default; an author's run
// of 2+ spaces between same-line tokens — the aligned LEDGER (§3, ruled
// 2026-07-13: alignment at the author's discretion) — is preserved verbatim
// wherever a space belongs. The formatter never builds a column, never keeps
// one where the grammar glues, and leaves the author's columns alone.
function gap(prev, t) {
  if (t.kind === "comma" || t.kind === "dot" || t.kind === "rp" || t.kind === "lp") return 0;
  // The trailing-comment gap (§2.7, re-ruled 2026-07-13): minimum two
  // spaces, no upper bound — the author's spacing is preserved verbatim
  // above the floor (the same school as the interior rule below).
  if (t.kind === "lcomment") return Math.max(2, t.start - prev.end);
  let d;
  if (prev.kind === "dot" || prev.kind === "lp") d = 0;
  else if (t.kind === "colon") d = t.colonKind === "path" ? 1 : 0;
  else if (prev.kind === "colon") d = prev.colonKind === "path" ? 0 : 1;
  else if (t.kind === "lb") d = t.role === "body" ? 1 : t.role === "repl" ? 0 : prev.kind === "lb" ? 0 : 1;
  else if (prev.kind === "lb") d = prev.role === "body" ? 1 : 0;
  else if (t.kind === "rb") d = t.role === "body" ? 1 : 0;
  else d = 1;
  // The author's interior alignment: where the canon default is one space
  // and the tokens sat together on one source line, a 2+-space run is the
  // author's column — preserved. Below the floor, the default applies
  // (0 normalizes to 1). A comma dropped at an inline close does not
  // bequeath its old gap to the `]`.
  if (d === 1 && t.line === prev.endLine && !(t.kind === "rb" && prev.kind === "comma")) {
    const author = t.start - prev.end;
    if (author >= 2) return author;
  }
  return d;
}

function emit(src, tokens, plan) {
  const { breakBefore, joinBefore, drop, commaAfter, forcedBlank, topGap } = plan;
  const out = [];
  let cur = null;
  let curIndent = 0;
  let depth = 0; // open `[` count (body + list) — line indent is depth * 4
  let last = null;
  let pendingTopGap = null; // exact blanks owed before the next top-level line

  const origIndentAt = (offset) => {
    const ls = src.lastIndexOf("\n", offset - 1) + 1;
    let n = 0;
    while (src[ls + n] === " ") n++;
    return n;
  };
  const flush = () => { if (cur !== null) out.push(cur); cur = null; };

  // A multi-line token (code / block comment / text block): the first line
  // joins the current line; interior lines are emitted per `shift`.
  const emitMulti = (t, shift) => {
    const lines = t.raw.split("\n");
    cur += lines[0];
    if (lines.length === 1) return;
    const openIndent = curIndent;
    const delta = shift ? openIndent - origIndentAt(t.start) : 0;
    let offset = t.start + lines[0].length + 1; // offset of line 2's start
    for (let i = 1; i < lines.length; i++) {
      flush();
      let text = lines[i];
      const inIsland = shift && (t.islands ?? []).some(([s, e]) => offset > s && offset < e);
      if (shift && !inIsland) {
        if (text.trim() === "") text = "";
        else if (i === lines.length - 1 && /^[ \t]*\}$/.test(text)) {
          // the Declare-owned bracket skeleton: a lone closing `}` hangs at body
          // indent (§2.6); everything else in the block only shifts.
          text = " ".repeat(openIndent + 4) + "}";
        } else if (delta !== 0) {
          const lead = /^[ \t]*/.exec(text)[0].length;
          text = " ".repeat(Math.max(0, lead + delta)) + text.slice(lead);
        }
      }
      cur = text;
      offset += lines[i].length + 1;
    }
    curIndent = /^[ ]*/.exec(cur)[0].length;
  };

  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.kind === "eof") break;
    if (drop.has(k)) { last = t; continue; }

    const isComment = t.kind === "lcomment" || t.kind === "bcomment";
    let newline;
    if (last === null) newline = true;
    else if (t.kind === "comma" || joinBefore.has(k)) newline = false;
    else if (breakBefore.has(k)) newline = true;
    else newline = t.line > last.endLine;

    if (newline) {
      let blanks = 0;
      if (last !== null && t.line > last.endLine) {
        blanks = t.line - last.endLine - 1;
        // CLAMP (§4, ruled 2026-07-13): max 2 blanks at top level, max 1
        // inside any bracket body.
        blanks = Math.min(blanks, depth === 0 ? 2 : 1);
      }
      if (last !== null && forcedBlank.has(k)) blanks = Math.max(blanks, 1); // §2.7 comment padding
      if (pendingTopGap !== null && depth === 0 && last !== null) {
        blanks = pendingTopGap; // §2.1 normalized separator — exact, overrides
        pendingTopGap = null;
      }
      flush();
      for (let n = 0; n < blanks; n++) out.push("");
      curIndent = depth * 4;
      cur = " ".repeat(curIndent);
    } else if (last !== null) {
      cur += " ".repeat(gap(last, t));
    }

    if (t.kind === "code") emitMulti(t, true);
    else if (isComment || t.kind === "textblock") emitMulti(t, false);
    else cur += t.raw;
    if (commaAfter.has(k)) cur += ",";

    if (t.kind === "lb") depth++;
    else if (t.kind === "rb") depth--;
    if (topGap.has(k)) pendingTopGap = topGap.get(k);
    last = t;
  }
  flush();
  return out.join("\n") + "\n";
}

// ── Safety (§5.5) — proven on every run, or the run aborts ─────────────────

// The comparable view of a token: code spans are compared line-wise with the
// leading whitespace the formatter owns stripped; everything else byte-exact.
const comparable = (t) =>
  t.kind === "code" ? t.raw.split("\n").map((l, i) => (i ? l.replace(/^[ \t]+/, "") : l)).join("\n") : t.raw;

// Island lines (inside strings/templates in a `{ }` body) are program data:
// they must survive byte-exact, leading whitespace included.
const islandLines = (t) => {
  const lines = t.raw.split("\n");
  const picked = [];
  let offset = t.start + lines[0].length + 1;
  for (let i = 1; i < lines.length; i++) {
    if ((t.islands ?? []).some(([s, e]) => offset > s && offset < e)) picked.push(lines[i]);
    offset += lines[i].length + 1;
  }
  return picked;
};

// Token stream for equality checks: comments out, and the comma a close style
// owns (immediately before `]` / `)`) normalized away on both sides — the one
// token the canon says the formatter adds or sheds (§2.1/§2.4).
export function comparableTokens(src) {
  const tokens = lex(src);
  try { analyze(tokens); } catch { /* roles are cosmetic for comparison */ }
  const solid = tokens.filter((t) => t.kind !== "lcomment" && t.kind !== "bcomment" && t.kind !== "eof");
  const kept = solid.filter((t, i) => !(t.kind === "comma" && (solid[i + 1]?.kind === "rb" || solid[i + 1]?.kind === "rp")));
  return kept;
}

export function commentRaws(src) {
  return lex(src).filter((t) => t.kind === "lcomment" || t.kind === "bcomment").map((t) => t.raw);
}

function verify(input, output) {
  const a = commentRaws(input);
  const b = commentRaws(output);
  if (a.length !== b.length || a.some((r, i) => r !== b[i])) {
    throw new FormatError("SAFETY: comment text changed — refusing the result");
  }
  const ta = comparableTokens(input);
  const tb = comparableTokens(output);
  if (ta.length !== tb.length) throw new FormatError(`SAFETY: token count changed (${ta.length} → ${tb.length})`);
  for (let i = 0; i < ta.length; i++) {
    if (ta[i].kind !== tb[i].kind || comparable(ta[i]) !== comparable(tb[i])) {
      throw new FormatError(`SAFETY: token ${i} changed: ${JSON.stringify(comparable(ta[i]).slice(0, 60))} → ${JSON.stringify(comparable(tb[i]).slice(0, 60))} (line ${ta[i].line})`);
    }
    if (ta[i].kind === "code") {
      const ia = islandLines(ta[i]);
      const ib = islandLines(tb[i]);
      if (ia.length !== ib.length || ia.some((l, j) => l !== ib[j])) {
        throw new FormatError(`SAFETY: a string/template line inside a { } body changed (line ${ta[i].line})`);
      }
    }
  }
}

// ── The formatter ───────────────────────────────────────────────────────────

/** Format Declare source to canon. Throws FormatError on unparsable input or
 *  on any safety violation (§5.5) — never returns a semantically dirty result. */
export function formatSource(src) {
  const tokens = lex(src);
  const structure = analyze(tokens);
  const plan = decide(tokens, structure);
  const output = emit(src, tokens, plan);
  verify(src, output);
  return output;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const check = args.includes("--check");
  const files = args.filter((a) => a !== "--write" && a !== "--check");
  if (files.length === 0 || (write && check)) {
    console.error("usage: node tools/format.mjs <file>            # formatted → stdout");
    console.error("       node tools/format.mjs --write <files…>  # rewrite in place");
    console.error("       node tools/format.mjs --check <files…>  # exit 1 if not canon");
    process.exit(2);
  }
  if (!write && !check && files.length > 1) {
    console.error("format: printing to stdout takes exactly one file (use --write or --check for many)");
    process.exit(2);
  }
  let dirty = 0;
  for (const file of files) {
    let source;
    let formatted;
    try {
      source = readFileSync(file, "utf8");
      formatted = formatSource(source);
    } catch (e) {
      console.error(`format: ${file}: ${e.message}`);
      process.exitCode = 1;
      continue;
    }
    if (check) {
      if (formatted !== source) { console.error(`not canon: ${file}`); dirty++; }
    } else if (write) {
      if (formatted !== source) { writeFileSync(file, formatted); console.error(`formatted: ${file}`); }
    } else {
      process.stdout.write(formatted);
    }
  }
  if (dirty > 0) process.exitCode = 1;
}
