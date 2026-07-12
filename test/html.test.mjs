// html parser — tree-shape assertions across the whitelisted subset, plus the
// unsupported-tag policy (strip = unwrap / error = throw). Produces the SAME
// Block[] tree as md.ts, so a passing tree renders through the one flow engine.
import assert from "node:assert";
import { parseHtml, SUPPORTED_TAGS } from "../runtime/dist/html.js";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("  ok —", name); }
  catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); }
}
const types = (arr) => arr.map((n) => n.t);
const flat = (inl) => inl.map((n) => n.value ?? (n.inline ? flat(n.inline) : "")).join("");

// ── blocks ───────────────────────────────────────────────────────────────────

test("paragraph + inline styles", () => {
  const b = parseHtml("<p>Hello <b>bold</b> and <i>it</i> and <code>c</code>.</p>");
  assert.equal(b.length, 1);
  assert.equal(b[0].t, "paragraph");
  assert.deepEqual(types(b[0].inline), ["text", "strong", "text", "em", "text", "code", "text"]);
});

test("heading level from hN", () => {
  const b = parseHtml("<h3>Title</h3>");
  assert.equal(b[0].t, "heading");
  assert.equal(b[0].level, 3);
  assert.equal(flat(b[0].inline), "Title");
});

test("aliases collapse: strong/b, em/i, del/s/strike", () => {
  assert.equal(parseHtml("<p><b>x</b></p>")[0].inline[0].t, "strong");
  assert.equal(parseHtml("<p><em>x</em></p>")[0].inline[0].t, "em");
  assert.equal(parseHtml("<p><del>x</del></p>")[0].inline[0].t, "strike");
  assert.equal(parseHtml("<p><strike>x</strike></p>")[0].inline[0].t, "strike");
});

test("link reads href, drops other attrs", () => {
  const n = parseHtml('<p>see <a href="/x" class="z" onclick="evil()">L</a></p>')[0].inline;
  const link = n.find((x) => x.t === "link");
  assert.equal(link.href, "/x");
  assert.equal(flat(link.inline), "L");
});

test("bare inline content becomes an implicit paragraph", () => {
  const b = parseHtml("just <em>text</em> here");
  assert.deepEqual(types(b), ["paragraph"]);
  assert.equal(flat(b[0].inline), "just text here");
});

test("unordered + ordered lists, li → item blocks", () => {
  const ul = parseHtml("<ul><li>one</li><li><b>two</b></li></ul>")[0];
  assert.equal(ul.t, "list");
  assert.equal(ul.ordered, false);
  assert.equal(ul.items.length, 2);
  assert.equal(ul.items[1].blocks[0].inline[0].t, "strong");
  const ol = parseHtml('<ol start="3"><li>a</li></ol>')[0];
  assert.equal(ol.ordered, true);
  assert.equal(ol.start, 3);
});

test("blockquote recurses to blocks", () => {
  const b = parseHtml("<blockquote><p>q</p></blockquote>")[0];
  assert.equal(b.t, "blockquote");
  assert.equal(b.blocks[0].t, "paragraph");
});

test("pre preserves whitespace as a code block", () => {
  const b = parseHtml("<pre><code>line1\n  line2</code></pre>")[0];
  assert.equal(b.t, "code");
  assert.equal(b.text, "line1\n  line2");
});

test("hr → rule, br → inline break", () => {
  assert.equal(parseHtml("<hr>")[0].t, "rule");
  assert.deepEqual(types(parseHtml("<p>x<br>y</p>")[0].inline), ["text", "br", "text"]);
});

test("div is a transparent block container", () => {
  const b = parseHtml("<div><p>a</p><p>b</p></div>");
  assert.deepEqual(types(b), ["paragraph", "paragraph"]);
});

test("non-pre whitespace collapses; inter-block whitespace dropped", () => {
  const b = parseHtml("<p>a\n   b\n   c</p>");
  assert.equal(flat(b[0].inline), "a b c");
  assert.deepEqual(types(parseHtml("<p>x</p>\n\n  <p>y</p>")), ["paragraph", "paragraph"]);
});

test("entities decode", () => {
  assert.equal(flat(parseHtml("<p>a &amp; b &lt;c&gt; &#169;</p>")[0].inline), "a & b <c> ©");
});

// ── the unsupported-tag policy ─────────────────────────────────────────────────

test("strip (default): unknown tag is UNWRAPPED, text kept", () => {
  const b = parseHtml("<p>a <marquee>b</marquee> c</p>");
  assert.equal(flat(b[0].inline), "a b c");
});

test("strip: <script>/<style> dropped whole (content too)", () => {
  const b = parseHtml("<p>ok</p><script>alert(1)</script><style>.x{}</style><p>after</p>");
  assert.deepEqual(types(b), ["paragraph", "paragraph"]);
  assert.equal(flat(b[0].inline), "ok");
  assert.equal(flat(b[1].inline), "after");
});

test("error: an unsupported tag throws, naming it", () => {
  assert.throws(() => parseHtml("<p>a <marquee>b</marquee></p>", "error"), /unsupported tag <marquee>/);
  assert.throws(() => parseHtml("<script>x</script>", "error"), /unsupported tag <script>/);
});

test("error: a fully-supported document does NOT throw", () => {
  assert.doesNotThrow(() => parseHtml("<h1>ok</h1><p>fine <b>here</b></p><ul><li>x</li></ul>", "error"));
});

// ── malformed input degrades, does not throw (under strip) ─────────────────────

test("stray '<', unclosed + mismatched tags degrade to defined output", () => {
  assert.doesNotThrow(() => parseHtml("a < b <p>open <b>bold</p> stray</i> end"));
  assert.equal(parseHtml("5 < 6 and 7 > 4")[0].t, "paragraph");   // bare '<' is literal text
});

test("SUPPORTED_TAGS is the whitelist, sorted + deduped", () => {
  assert.ok(SUPPORTED_TAGS.includes("p") && SUPPORTED_TAGS.includes("a") && SUPPORTED_TAGS.includes("code"));
  assert.ok(!SUPPORTED_TAGS.includes("script") && !SUPPORTED_TAGS.includes("marquee"));
  assert.deepEqual([...SUPPORTED_TAGS], [...SUPPORTED_TAGS].sort());
});

console.log(`\nhtml: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
