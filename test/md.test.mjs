// md parser — tree-shape assertions across the supported subset.
import assert from "node:assert";
import { parse, parseInline } from "../runtime/dist/md.js";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("  ok —", name); }
  catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); }
}
const types = (arr) => arr.map((n) => n.t);

// ── blocks ───────────────────────────────────────────────────────────────────

test("heading: level + inline", () => {
  const b = parse("## Hello **world**");
  assert.equal(b.length, 1);
  assert.equal(b[0].t, "heading");
  assert.equal(b[0].level, 2);
  assert.deepEqual(types(b[0].inline), ["text", "strong"]);
  assert.equal(b[0].inline[1].inline[0].value, "world");
});

test("paragraphs split on blank lines", () => {
  const b = parse("one\n\ntwo");
  assert.deepEqual(types(b), ["paragraph", "paragraph"]);
  assert.equal(b[0].inline[0].value, "one");
});

test("paragraph: soft break becomes a space", () => {
  const b = parse("a\nb");
  assert.equal(b.length, 1);
  assert.equal(b[0].inline.map((n) => n.value ?? "").join(""), "a b");
});

test("thematic break", () => {
  assert.deepEqual(types(parse("---")), ["rule"]);
  assert.deepEqual(types(parse("***")), ["rule"]);
});

test("fenced code keeps text verbatim + lang", () => {
  const b = parse("```ts\nlet x = 1\n**not bold**\n```");
  assert.equal(b[0].t, "code");
  assert.equal(b[0].lang, "ts");
  assert.equal(b[0].text, "let x = 1\n**not bold**");
});

test("indented code block", () => {
  const b = parse("    code line\n    line two");
  assert.equal(b[0].t, "code");
  assert.equal(b[0].text, "code line\nline two");
});

test("unordered list, tight", () => {
  const b = parse("- one\n- two\n- three");
  assert.equal(b[0].t, "list");
  assert.equal(b[0].ordered, false);
  assert.equal(b[0].items.length, 3);
  assert.equal(b[0].items[0].blocks[0].t, "paragraph");
});

test("ordered list keeps start number", () => {
  const b = parse("3. c\n4. d");
  assert.equal(b[0].ordered, true);
  assert.equal(b[0].start, 3);
  assert.equal(b[0].items.length, 2);
});

test("nested list", () => {
  const b = parse("- outer\n  - inner a\n  - inner b\n- outer2");
  assert.equal(b[0].items.length, 2);
  const nested = b[0].items[0].blocks.find((x) => x.t === "list");
  assert.ok(nested, "first item has a nested list");
  assert.equal(nested.items.length, 2);
});

test("task list", () => {
  const b = parse("- [x] done\n- [ ] todo");
  assert.equal(b[0].items[0].task, true);
  assert.equal(b[0].items[1].task, false);
});

test("content after a list is its own block, not swallowed", () => {
  // Regression: lazy continuation must not absorb a blank-separated paragraph
  // or heading into the last list item (that dropped everything after a list).
  const para = parse("- a\n- b\n\nAfter the list.");
  assert.deepEqual(types(para), ["list", "paragraph"]);
  assert.equal(para[0].items.length, 2);
  const head = parse("- a\n- b\n\n## Next\n\nBody.");
  assert.deepEqual(types(head), ["list", "heading", "paragraph"]);
});

test("a marker-type switch starts a new list (bullet ↛ ordered)", () => {
  // Regression: an ordered list right after a bullet list was absorbed into it
  // (one list, ordered=false), so its "1." rendered as "•".
  const b = parse("- a\n- b\n\n1. one\n2. two");
  assert.deepEqual(types(b), ["list", "list"]);
  assert.equal(b[0].ordered, false); assert.equal(b[0].items.length, 2);
  assert.equal(b[1].ordered, true); assert.equal(b[1].items.length, 2);
  // …and the other direction.
  const c = parse("1. one\n2. two\n- a\n- b");
  assert.deepEqual(types(c), ["list", "list"]);
  assert.equal(c[0].ordered, true); assert.equal(c[1].ordered, false);
});

test("an indented continuation still stays in its item", () => {
  const b = parse("- item one\n\n  continued paragraph\n- item two");
  assert.equal(b[0].t, "list");
  assert.equal(b[0].items.length, 2);
  assert.deepEqual(types(b[0].items[0].blocks), ["paragraph", "paragraph"]);
});

test("blockquote with nested block", () => {
  const b = parse("> quoted\n> more");
  assert.equal(b[0].t, "blockquote");
  assert.equal(b[0].blocks[0].t, "paragraph");
});

test("GFM table: header, alignment, rows", () => {
  const b = parse("| A | B |\n| :-- | --: |\n| 1 | 2 |\n| 3 | 4 |");
  assert.equal(b[0].t, "table");
  assert.deepEqual(b[0].align, ["left", "right"]);
  assert.equal(b[0].header.length, 2);
  assert.equal(b[0].rows.length, 2);
  assert.equal(b[0].rows[1][0][0].value, "3");
});

// ── inline ─────────────────────────────────────────────────────────────────

test("strong vs em, both markers", () => {
  assert.equal(parseInline("**a**")[0].t, "strong");
  assert.equal(parseInline("__a__")[0].t, "strong");
  assert.equal(parseInline("*a*")[0].t, "em");
  assert.equal(parseInline("_a_")[0].t, "em");
});

test("strikethrough", () => {
  assert.equal(parseInline("~~gone~~")[0].t, "strike");
});

test("inline code is literal", () => {
  const n = parseInline("use `**x**` here");
  assert.equal(n[1].t, "code");
  assert.equal(n[1].value, "**x**");
});

test("link: text + href", () => {
  const n = parseInline("see [the docs](https://x.dev/y)");
  const link = n.find((x) => x.t === "link");
  assert.equal(link.href, "https://x.dev/y");
  assert.equal(link.inline[0].value, "the docs");
});

test("autolink", () => {
  const n = parseInline("<https://neo.dev>");
  assert.equal(n[0].t, "link");
  assert.equal(n[0].href, "https://neo.dev");
});

test("backslash escape", () => {
  const n = parseInline("\\*not em\\*");
  assert.equal(n.length, 1);
  assert.equal(n[0].value, "*not em*");
});

test("raw HTML stays literal (the ruling)", () => {
  const n = parseInline("a <b>bold?</b> c");
  const joined = n.map((x) => x.value ?? "").join("");
  assert.ok(joined.includes("<b>"), "the <b> tag is literal text, not interpreted");
});

test("entities decode (characters, not markup)", () => {
  assert.equal(parseInline("&copy; &mdash; &#8212; &#x2014;")[0].value, "© — — —");
});

test("hard break on trailing double space", () => {
  const n = parseInline("a  \nb");
  assert.deepEqual(n.map((x) => x.t), ["text", "br", "text"]);
});

test("nested emphasis inside strong", () => {
  const n = parseInline("**bold _and italic_**");
  assert.equal(n[0].t, "strong");
  assert.ok(n[0].inline.some((x) => x.t === "em"));
});

console.log(`\nmd: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
