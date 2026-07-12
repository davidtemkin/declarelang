// highlight — the compiler's preprocessed form for the code viewer. Asserts the
// SEGMENT shape: /* */ comments become prose (Markdown, dedented), everything
// else becomes syntax-highlighted <pre> code, and the language's lexical islands
// (strings, { } bodies, datapaths, comments) are classified — and never let a
// brace or quote inside a body corrupt the scan.
import assert from "node:assert";
import { highlight } from "../compiler/dist/highlight.js";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("  ok —", name); }
  catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); }
}
const kinds = (segs) => segs.map((s) => s.kind);
// the concatenated class names appearing in a code segment's html, in order
const roles = (html) => Array.from(html.matchAll(/class="(\w+)"/g)).map((m) => m[1]);
const codeHtml = (segs) => segs.filter((s) => s.kind === "code").map((s) => s.html).join("\n");

// ── segmentation: prose vs code ────────────────────────────────────────────────

test("a /* */ comment becomes a prose segment; code around it stays code", () => {
  const segs = highlight('App [ ]\n/* # Title\nsome **markdown** */\nText [ ]');
  assert.deepEqual(kinds(segs), ["code", "prose", "code"]);
  assert.equal(segs[1].md, "# Title\nsome **markdown**");
});

test("prose dedents and strips a jsdoc * gutter", () => {
  const segs = highlight("/*\n * # Doc\n * a line\n */\nApp [ ]");
  assert.equal(segs[0].kind, "prose");
  assert.equal(segs[0].md, "# Doc\na line");
});

test("prose dedents a plain (gutterless) block by common indent", () => {
  const segs = highlight("/*\n    # Doc\n    indented body\n*/\nApp [ ]");
  assert.equal(segs[0].md, "# Doc\nindented body");
});

test("blank lines between a comment and code don't open an empty code segment", () => {
  const segs = highlight("App [ ]\n\n/* note */\n\nText [ ]");
  assert.deepEqual(kinds(segs), ["code", "prose", "code"]);
  // neither code <pre> is just whitespace
  for (const s of segs) if (s.kind === "code") assert.ok(s.html.replace(/<\/?pre>/g, "").trim() !== "");
});

test("a file with no comments is a single code segment", () => {
  const segs = highlight("App [ width = 40 ]");
  assert.deepEqual(kinds(segs), ["code"]);
});

// ── token roles ────────────────────────────────────────────────────────────────

test("Uppercase idents are types; attribute names (before =) are attrs", () => {
  const segs = highlight("App [ width = 40 ]");
  const html = segs[0].html;
  assert.ok(/<span class="t">App<\/span>/.test(html), html);
  assert.ok(/<span class="a">width<\/span>/.test(html), html);
});

test("strings, numbers, hex colours, datapaths, keywords each get a role", () => {
  const segs = highlight('class Box [ readonly n = 42, tint = #ff0, label = "hi", at = :rec.name ]');
  const r = new Set(roles(segs[0].html));
  for (const want of ["t", "a", "n", "h", "s", "p", "k"]) assert.ok(r.has(want), "missing role " + want + " in " + [...r]);
});

test("a { } expression body is ONE span, blind to braces/quotes/comments inside", () => {
  // The body holds a string containing braces and a simple regex — the common
  // cases that corrupt a naive brace-match. It must stay one <b> span and NOT
  // leak a second code construct or split the segment. (This matches the
  // compiler's own skipBraces exactly: a `}` inside a regex char class would
  // truncate BOTH, so such a body can't compile and never reaches a viewer.)
  const segs = highlight('X [ v = { const s = "a{b}c"; return /\\d+/.test(s) ? 1 : 2 } ]');
  assert.deepEqual(kinds(segs), ["code"]);
  const bodies = Array.from(segs[0].html.matchAll(/<span class="b">([\s\S]*?)<\/span>/g));
  assert.equal(bodies.length, 1, "expected exactly one body span");
  assert.ok(bodies[0][1].includes("a{b}c"), "body content truncated");
});

test("a /* */ INSIDE a { } body is not mistaken for a prose comment", () => {
  const segs = highlight("X [ v = { /* inner */ return 1 } ]");
  assert.deepEqual(kinds(segs), ["code"]); // no prose segment carved out of the body
});

test("line comments stay in code as a comment role; block comments do not", () => {
  const segs = highlight("App [ ] // trailing\nText [ ]");
  assert.deepEqual(kinds(segs), ["code"]);
  assert.ok(roles(segs[0].html).includes("c"));
});

test("html is escaped inside code spans", () => {
  const segs = highlight('X [ v = { return a < b && c > d } ]');
  assert.ok(codeHtml(segs).includes("&lt;") && codeHtml(segs).includes("&gt;") && codeHtml(segs).includes("&amp;"));
  assert.ok(!/<[^sp/]/.test(codeHtml(segs).replace(/<\/?(pre|span)[^>]*>/g, "")), "unescaped markup leaked");
});

test("whitespace and indentation are preserved verbatim in code", () => {
  const segs = highlight("App [\n    width = 40,\n]");
  assert.ok(segs[0].html.includes("\n    "), "indentation lost");
});

test("triple-quoted text block is one string span, contents intact", () => {
  const segs = highlight('Markdown [ text = """\n# Hi\n- a\n""" ]');
  const strs = Array.from(segs[0].html.matchAll(/<span class="s">([\s\S]*?)<\/span>/g));
  assert.ok(strs.some((m) => m[1].includes("# Hi") && m[1].includes("- a")), "triple-quote body not captured");
});

console.log(`\nhighlight: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
