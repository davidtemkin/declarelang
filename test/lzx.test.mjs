import { lzxToDeclare } from "../lzx/dist/transpile.js";
import { parseLzx } from "../lzx/dist/parse.js";
import { buildNaming } from "../lzx/dist/naming.js";
import { SCHEMAS as _schemas } from "../runtime/dist/schema.js";
import { test, summarize } from "./harness.mjs";

await test("lzxToDeclare exists and returns the result shape", () => {
  const r = lzxToDeclare("<canvas/>");
  if (typeof r !== "object" || !("declare" in r) || !Array.isArray(r.gaps)) {
    throw new Error("unexpected result shape: " + JSON.stringify(r));
  }
});

// ── Task 1: parser structural core ─────────────────────────────────────────

await test("parses a single self-closing tag", () => {
  const doc = parseLzx("<canvas/>");
  if (doc.errors.length) throw new Error("errors: " + JSON.stringify(doc.errors));
  if (doc.root?.tag !== "canvas") throw new Error("tag: " + doc.root?.tag);
});

await test("parses attributes with double and single quotes", () => {
  const doc = parseLzx(`<canvas width="240" title='hi'/>`);
  const a = doc.root.attrs;
  if (a[0].name !== "width" || a[0].value !== "240") throw new Error("attr0: " + JSON.stringify(a[0]));
  if (a[1].name !== "title" || a[1].value !== "hi") throw new Error("attr1: " + JSON.stringify(a[1]));
});

await test("parses nested children and preserves order", () => {
  const doc = parseLzx(`<canvas><view/><text/></canvas>`);
  if (doc.root.children.map((c) => c.tag).join(",") !== "view,text") throw new Error("kids");
});

await test("captures direct text content", () => {
  const doc = parseLzx(`<button>Move me</button>`);
  if (doc.root.text.trim() !== "Move me") throw new Error("text: " + JSON.stringify(doc.root.text));
});

await test("preserves tag case and namespace prefix", () => {
  const doc = parseLzx(`<xsd:element name="x"/>`);
  if (doc.root.tag !== "xsd:element") throw new Error("tag: " + doc.root.tag);
});

await test("records a 1-based line/col Pos on the root", () => {
  const doc = parseLzx(`\n  <canvas/>`);
  if (doc.root.pos.line !== 2 || doc.root.pos.col !== 3) throw new Error("pos: " + JSON.stringify(doc.root.pos));
});

// ── Task 2: CDATA + entities ───────────────────────────────────────────────

await test("decodes the five XML entities in text", () => {
  const doc = parseLzx(`<x>a &lt; b &amp;&amp; c &gt; d &quot;e&quot; &apos;f&apos;</x>`);
  if (doc.root.text.trim() !== `a < b && c > d "e" 'f'`) throw new Error("text: " + JSON.stringify(doc.root.text));
});

await test("decodes entities in attribute values", () => {
  const doc = parseLzx(`<x cond="a &lt; b"/>`);
  if (doc.root.attrs[0].value !== "a < b") throw new Error("val: " + doc.root.attrs[0].value);
});

await test("treats CDATA as opaque raw text", () => {
  const doc = parseLzx(`<method><![CDATA[ if (a < b && c > d) x(); ]]></method>`);
  if (doc.root.text.trim() !== "if (a < b && c > d) x();") throw new Error("cdata: " + JSON.stringify(doc.root.text));
});

await test("skips comments inside content", () => {
  const doc = parseLzx(`<x><!-- note --><view/></x>`);
  if (doc.root.children.length !== 1 || doc.root.children[0].tag !== "view") throw new Error("kids");
});

// ── Task 3: naming ─────────────────────────────────────────────────────────

await test("maps built-in tags case-insensitively", () => {
  const { naming } = buildNaming([]);
  if (naming.tagFor("canvas") !== "App") throw new Error("canvas");
  if (naming.tagFor("VIEW") !== "View") throw new Error("VIEW");
  if (naming.tagFor("simplelayout") !== "SimpleLayout") throw new Error("simplelayout");
  if (naming.tagFor("nosuchtag") !== null) throw new Error("unknown");
});

await test("attribute aliases are schema-anchored (bgcolor→fill)", () => {
  const { naming } = buildNaming([]);
  if (naming.attrFor("bgcolor") !== "fill") throw new Error("bgcolor");
  if (naming.attrFor("minheight") !== "minHeight") throw new Error("minheight");
  if (naming.attrFor("onclick") !== "onClick") throw new Error("onclick");
});

await test("every alias target is a real schema attribute key (anchoring invariant)", () => {
  const keys = new Set();
  for (const s of Object.values(_schemas)) {
    for (let sc = s; sc; sc = sc.base) for (const k of Object.keys(sc.attrs)) keys.add(k);
  }
  const { naming } = buildNaming([]);
  for (const lzx of ["bgcolor", "minheight", "minwidth", "fontsize", "fontweight", "fontfamily", "cornerradius"]) {
    const target = naming.attrFor(lzx);
    if (!keys.has(target)) throw new Error(`alias ${lzx}→${target} not a schema key`);
  }
});

await test("attrTypeFor resolves a Color slot", () => {
  const { naming } = buildNaming([]);
  if (naming.attrTypeFor("View", "fill") !== "color") throw new Error("fill type: " + naming.attrTypeFor("View", "fill"));
  if (naming.attrTypeFor("View", "width") !== "length") throw new Error("width type");
});

await test("contentAttrFor is per-tag", () => {
  const { naming } = buildNaming([]);
  if (naming.contentAttrFor("Button") !== "label") throw new Error("Button content");
  if (naming.contentAttrFor("Text") !== "text") throw new Error("Text content");
});

await test("user class names use case-insensitive identity, preserving declared form", () => {
  const { naming } = buildNaming(["weatherSummary"]);
  if (naming.classNameFor("weathersummary") !== "weatherSummary") throw new Error("ci identity");
});

await test("reports a collision when two names map to one identifier", () => {
  const { collisions } = buildNaming(["BorderedBox", "borderedbox"]);
  if (collisions.length !== 1 || collisions[0].lzxNames.length !== 2) throw new Error("collision");
});

summarize("lzx");
