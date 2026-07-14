// format — the canon formatter's gates (design/formatting.md §5.6), proven on
// the whole corpus, not spot-checked:
//
//   1. IDEMPOTENCE — format(format(x)) === format(x), byte-equal, for every
//      corpus file (examples/**/[a-z]*.declare + library/src/*.declare).
//   2. EXEMPLAR — examples/codeviewer/codeviewer.declare is the canon's
//      exemplar: formatting it must be a PERFECT no-op (its alignment slip,
//      glued comment blocks, and 3-space trailing gaps were fixed in-file as
//      canon fixes under the 2026-07-13 rulings).
//   3. SEMANTIC EQUALITY — for every corpus file, the original and the
//      formatted text mean the same program. Method (documented choice):
//      programs are compiled twice (compiler/dist/compile-node.js, offline,
//      typecheck off — bodies are copied verbatim, so type-correctness cannot
//      change) and the two emitted sources are compared TOKEN-wise, comments
//      and whitespace aside, with `{ }` bodies compared per-line modulo the
//      leading whitespace the formatter owns; extracted constraint deps must
//      be deep-equal. Library files (library/src — no root, not compilable
//      alone) are parsed with the runtime's parseLibrary and compared as
//      position-stripped ASTs. Trailing commas immediately before `]`/`)` are
//      normalized on both sides — the one token the close style adds or sheds.
//   4. COMMENT FIDELITY — every `//` and `/* … */` raw survives byte-exact,
//      in order, on every corpus file (the source viewer renders them; code
//      appearance is product surface).
//
// Plus synthetic cases for each rule the corpus exercises only incidentally:
// literate-block interiors, trailing comments, blank-line CLAMP, close-style
// conversion, opaque `{ }` bodies, `"""` blocks, literal spellings.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, basename } from "node:path";
import { formatSource, comparableTokens, commentRaws } from "../tools/format.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { parseLibrary } from "../runtime/dist/parser.js";
import { test, summarize } from "./harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

// ── corpus: examples/**/[a-z]*.declare + library/src/*.declare ─────────────

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".declare") && /^[a-z]/.test(e.name)) out.push(p);
  }
  return out;
}
const corpus = [
  ...walk(resolve(ROOT, "examples")),
  ...readdirSync(resolve(ROOT, "library/src"))
    .filter((n) => n.endsWith(".declare"))
    .map((n) => resolve(ROOT, "library/src", n)),
].sort();

await test("corpus discovered", () => {
  if (corpus.length < 50) throw new Error(`only ${corpus.length} corpus files found — glob or tree changed`);
});

// ── 1+4: idempotence and comment fidelity, every corpus file ───────────────

const formattedOf = new Map();
for (const file of corpus) {
  const rel = file.slice(ROOT.length + 1);
  await test(`idempotent + comments byte-exact: ${rel}`, () => {
    const src = readFileSync(file, "utf8");
    const once = formatSource(src); // formatSource self-verifies §5.5 or throws
    const twice = formatSource(once);
    if (once !== twice) {
      const a = once.split("\n");
      const b = twice.split("\n");
      const at = a.findIndex((l, i) => l !== b[i]);
      throw new Error(`format(format(x)) !== format(x) at output line ${at + 1}:\n      1st: ${JSON.stringify(a[at])}\n      2nd: ${JSON.stringify(b[at])}`);
    }
    const ca = commentRaws(src);
    const cb = commentRaws(once);
    if (ca.length !== cb.length || ca.some((r, i) => r !== cb[i])) throw new Error("comment raws changed");
    formattedOf.set(file, once);
  });
}

// ── 2: the exemplar is a PERFECT no-op ──────────────────────────────────────
//
// Ruled 2026-07-13: the exemplar's divergences from canon were fixed in the
// FILE, not excused in the tool — the `dirName()  {` alignment slip (§3), the
// comment blocks missing their mandated blank padding (§2.7), and the 3-space
// trailing-comment gaps below the ruled 4-space minimum. Canon and exemplar
// now agree byte-for-byte; any regression in either fails here.

await test("exemplar: codeviewer.declare formats to itself, byte-exact", () => {
  const file = resolve(ROOT, "examples/codeviewer/codeviewer.declare");
  const src = readFileSync(file, "utf8");
  const out = formatSource(src);
  if (out !== src) {
    const a = src.split("\n");
    const b = out.split("\n");
    const diffs = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) diffs.push(i + 1);
    throw new Error(`exemplar is not a no-op — first diffs at lines [${diffs.slice(0, 8)}]`);
  }
});

// ── 3: semantic equality, every corpus file ────────────────────────────────

const codeCmp = (t) =>
  t.kind === "code" ? t.raw.split("\n").map((l, i) => (i ? l.replace(/^[ \t]+/, "") : l)).join("\n") : t.raw;

function assertTokensEqual(a, b, what) {
  const ta = comparableTokens(a);
  const tb = comparableTokens(b);
  if (ta.length !== tb.length) throw new Error(`${what}: token count ${ta.length} → ${tb.length}`);
  for (let i = 0; i < ta.length; i++) {
    if (ta[i].kind !== tb[i].kind || codeCmp(ta[i]) !== codeCmp(tb[i])) {
      throw new Error(`${what}: token ${i} (line ${ta[i].line}) ${JSON.stringify(codeCmp(ta[i]).slice(0, 50))} → ${JSON.stringify(codeCmp(tb[i]).slice(0, 50))}`);
    }
  }
}

// Positions (and the whitespace inside verbatim-copied bodies) are the only
// things formatting may move; strip them, compare everything else.
const stripAst = (o) => JSON.parse(JSON.stringify(o, (k, v) => {
  if (["pos", "typePos", "bodyPos", "sourcePos", "basePos", "includeSpans"].includes(k)) return undefined;
  if ((k === "body" || k === "src") && typeof v === "string") return v.replace(/\n[ \t]*/g, "\n").trim();
  return v;
}));

for (const file of corpus) {
  const rel = file.slice(ROOT.length + 1);
  const isLibrary = rel.startsWith("library/");
  await test(`compiles to the same program: ${rel}`, () => {
    const src = readFileSync(file, "utf8");
    const out = formattedOf.get(file) ?? formatSource(src);
    if (isLibrary) {
      const a = JSON.stringify(stripAst(parseLibrary(src)));
      const b = JSON.stringify(stripAst(parseLibrary(out)));
      if (a !== b) throw new Error("parseLibrary ASTs differ");
      return;
    }
    const opts = { originDir: dirname(file), typecheck: false };
    const a = compile(src, opts);
    const b = compile(out, opts);
    if (a.errors.length) throw new Error(`original does not compile: ${a.errors[0].message}`);
    if (b.errors.length) throw new Error(`FORMATTED does not compile: ${b.errors[0].message}`);
    assertTokensEqual(a.source, b.source, "emitted source");
    if (JSON.stringify(a.deps) !== JSON.stringify(b.deps)) throw new Error("extracted constraint deps differ");
  });
}

// ── synthetic rule cases ────────────────────────────────────────────────────

const fmt = (s) => formatSource(s);

await test("literate /* */ block: byte-exact, interior never re-indented", () => {
  const literate = "/*\n# Title\n\nProse with a fence:\n\n    indented code line\n\n- a *list*\n*/";
  const src = `${literate}\nclass A extends View [\nx = 1,\n]\nApp [ A [ y = 2 ] ]\n`;
  const out = fmt(src);
  if (!out.includes(literate)) throw new Error("literate block was rewritten");
  const again = fmt(out);
  if (out !== again) throw new Error("not idempotent");
});

await test("trailing // gap (re-ruled 2026-07-13): min 2, no maximum — alignment is the author's", () => {
  const src = "App [\n    x = 1,// glued\n    yy = 2, // one space\n    z = 3,        // author's column, preserved\n    w = 4,                        // very wide — still the author's\n    ]\n";
  const out = fmt(src);
  if (!out.includes("x = 1,  // glued")) throw new Error("0-gap not widened to 2:\n" + out);
  if (!out.includes("yy = 2,  // one space")) throw new Error("1-gap not widened to 2:\n" + out);
  if (!out.includes("z = 3,        // author's column, preserved")) throw new Error("author gap not preserved:\n" + out);
  if (!out.includes("w = 4,                        // very wide — still the author's")) throw new Error("wide gap was clamped:\n" + out);
});

await test("comment padding (ruled 2026-07-13): blanks inserted above AND below a standalone block", () => {
  const src = "App [\n    w = 0,\n    // glued both sides — one block\n    // with a second line\n    x = 1,\n    ]\n";
  const out = fmt(src);
  const want = "App [\n    w = 0,\n\n    // glued both sides — one block\n    // with a second line\n\n    x = 1,\n    ]\n";
  if (out !== want) throw new Error(`comment padding wrong:\n${out}`);
});

await test("comment padding: first-in-block needs no blank above; none forced against a close", () => {
  const src = "App [\n    // first thing in the body\n    x = 1,\n    // sits against the close\n    ]\n";
  const out = fmt(src);
  const want = "App [\n    // first thing in the body\n\n    x = 1,\n\n    // sits against the close\n    ]\n";
  if (out !== want) throw new Error(`exception handling wrong:\n${out}`);
});

await test("comment above a member keeps its line and level", () => {
  const src = "App [\n\n        // sits above x, over-indented\n\n    x = 1,\n    ]\n";
  const out = fmt(src);
  if (!out.includes("\n    // sits above x, over-indented\n\n    x = 1,")) throw new Error("comment line mishandled:\n" + out);
});

await test("a leaf close never joins up over a trailing comment", () => {
  const src = "App [\n    b: View [ x = 1,    // note on the last attr\n        ],\n    ]\n";
  const out = fmt(src);
  if (!out.includes("x = 1,    // note on the last attr\n        ],")) throw new Error("close joined over a // comment:\n" + out);
});

await test("blank-line CLAMP: max 1 blank inside a body, author's choice below the cap", () => {
  const src = "App [\n    x = 1,\n\n\n    y = 2,\n\n    z = 3,\n    w = 4,\n    ]\n";
  const out = fmt(src);
  const want = "App [\n    x = 1,\n\n    y = 2,\n\n    z = 3,\n    w = 4,\n    ]\n";
  if (out !== want) throw new Error(`in-body blank handling wrong:\n${out}`);
});

await test("top-level separator (ruled 2026-07-13): exactly 2 after multiline, exactly 1 after one-line", () => {
  // widen 1 → 2 after a multiline class; narrow 4 → 2; exactly 1 after a one-liner (narrow 3 → 1)
  const src = "class A extends View [ x = 1,\n    ]\nclass B extends View [ y = 2,\n    ]\n\n\n\n\nfont Sans [ family = \"ui\" ]\n\n\n\nApp [ w = 3 ]\n";
  const out = fmt(src);
  const want = "class A extends View [ x = 1,\n    ]\n\n\nclass B extends View [ y = 2,\n    ]\n\n\nfont Sans [ family = \"ui\" ]\n\nApp [ w = 3 ]\n";
  if (out !== want) throw new Error(`top-level separator wrong:\n${out}`);
});

await test("top-level separator: a doc comment belongs to the next item — gap above it, §2.7 blank below", () => {
  const src = "class A extends View [ x = 1,\n    ]\n// documents B\nclass B extends View [ y = 2,\n    ]\n\nApp [ w = 3 ]\n";
  const out = fmt(src);
  const want = "class A extends View [ x = 1,\n    ]\n\n\n// documents B\n\nclass B extends View [ y = 2,\n    ]\n\n\nApp [ w = 3 ]\n";
  if (out !== want) throw new Error(`doc-comment attachment wrong:\n${out}`);
});

await test("trailing comma appears before a hanging close; an inline close sheds it", () => {
  const src = "App [\n    child: View [ x = 1 ],\n    m() { go() }\n    ]\n";
  const out = fmt(src);
  if (!out.includes("m() { go() },\n    ]")) throw new Error("trailing comma not added before hanging close:\n" + out);
  const src2 = "App [\n    child: View [ x = 1, ],\n    ]\n";
  if (!fmt(src2).includes("x = 1 ],")) throw new Error("inline close kept the interior comma");
});

await test("close style follows member kind: leaf inline, method/child hanging", () => {
  // a leaf written hanging joins up …
  const out1 = fmt("App [\n    a: View [ x = 1,\n        ],\n    ]\n");
  if (!out1.includes("a: View [ x = 1 ],")) throw new Error("leaf close not inlined:\n" + out1);
  // … and a method-bearing body written inline hangs (with the trailing comma)
  const out2 = fmt("App [\n    b: View [ x = 1, m() { go() } ],\n    ]\n");
  if (!out2.includes("m() { go() },\n        ],")) throw new Error("non-leaf close not hung:\n" + out2);
});

await test("declarations, methods, and children take their own lines; attrs pack", () => {
  const src = "App [ w = 1, h = 2, n: number = 3, m() { go() }, c: View [ x = 1 ], k = 4 ]\n";
  const out = fmt(src);
  const want = "App [ w = 1, h = 2,\n    n: number = 3,\n    m() { go() },\n    c: View [ x = 1 ],\n    k = 4,\n    ]\n";
  if (out !== want) throw new Error(`member line ownership wrong:\n${out}`);
});

await test("spacing: single-space machine default — 0-gaps normalize, glue stays glued, indent is 4-per-level", () => {
  const src = "App [\n  name=\"x\",\n  wide : View[ x =1,\n                   y = 2 ],\n  ]\n";
  const out = fmt(src);
  const want = "App [\n    name = \"x\",\n    wide: View [ x = 1,\n        y = 2 ],\n    ]\n";
  if (out !== want) throw new Error(`spacing/indent wrong:\n${out}`);
});

await test("the aligned ledger (ruled 2026-07-13): an author's 2+-space interior runs survive verbatim", () => {
  // slider.declare's declaration ledger and focusring.declare's Spring block
  const ledger = "    value: number = 0,\n    min:   number = 0,\n    max:   number = 100,\n    step:  number = 1,";
  const springs = "    Spring [ attribute = x,      to = { tx }, stiffness = 220, damping = 16 ],\n" +
                  "    Spring [ attribute = width,  to = { tw }, stiffness = 220, damping = 18 ],";
  const src = `App [\n${ledger}\n${springs}\n    ]\n`;
  const out = fmt(src);
  if (!out.includes(ledger)) throw new Error(`declaration ledger flattened:\n${out}`);
  if (!out.includes(springs)) throw new Error(`Spring ledger flattened:\n${out}`);
  if (fmt(out) !== out) throw new Error("ledger preservation not idempotent");
});

await test("the ledger discretion never applies where the grammar glues, or across a dropped comma", () => {
  const src = "App [\n    a: View [ x = 1,   ],\n    t: Text [ text = :person  .  name ],\n    ]\n";
  const out = fmt(src);
  if (!out.includes("a: View [ x = 1 ],")) throw new Error("dropped comma bequeathed its gap to the close:\n" + out);
  if (!out.includes("text = :person.name ],")) throw new Error("glue positions must stay glued, author spaces or not:\n" + out);
});

await test("{ } bodies are opaque: interior spacing, quotes, and spellings verbatim", () => {
  const body = "{ const a =  1;   return {x:'}'}, 0xCAD0EC }";
  const src = `App [\n    m() ${body},\n    fill = #CAD0EC, n = 0xFF, pct = 50%,\n    ]\n`;
  const out = fmt(src);
  for (const piece of [body, "#CAD0EC", "0xFF", "50%"]) {
    if (!out.includes(piece)) throw new Error(`retokenized: ${piece}\n${out}`);
  }
});

await test("a multi-line { } body shifts as a block; template-literal lines never shift", () => {
  const src = "App [\n  m() {\n    const s = `line one\n  raw template line`\n    return s\n    },\n  ]\n";
  const out = fmt(src);
  if (!out.includes("\n  raw template line`")) throw new Error("template interior line was shifted:\n" + out);
  if (!out.includes("\n      const s = `line one")) throw new Error("code line not shifted with the block:\n" + out);
  if (!out.includes("\n        },")) throw new Error("closing } not at body indent:\n" + out);
});

await test('""" text blocks survive byte-exact', () => {
  const block = '"""\n# Head\n\n  indented md\nlast\n"""';
  const src = `App [\n    Markdown [ x = 1, text = ${block} ],\n    ]\n`;
  const out = fmt(src);
  if (!out.includes(block)) throw new Error("text block changed:\n" + out);
});

await test("datapaths, two-way binds, subscriptions, lists keep canon spacing", () => {
  const src = "App [\n    t: TextInput [ text <-> :person.name, fontFamily = [Sans, \"ui\"] ],\n    row: View [ datapath = :items[] ],\n    onKeyUp(e) <- Keys { go(e) },\n    ]\n";
  const out = fmt(src);
  for (const piece of ["text <-> :person.name", "[Sans, \"ui\"]", "datapath = :items[]", "onKeyUp(e) <- Keys { go(e) },"]) {
    if (!out.includes(piece)) throw new Error(`spacing broke: ${piece}\n${out}`);
  }
});

await test("a one-line top-level declaration stays one line", () => {
  const src = 'font Sans [ family = "system-ui" ]\n\nApp [ w = 1 ]\n';
  if (fmt(src) !== src) throw new Error("one-line top-level rewritten:\n" + fmt(src));
});

summarize("format");
