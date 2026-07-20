import { lzxToDeclare } from "../lzx/dist/transpile.js";
import { parseLzx } from "../lzx/dist/parse.js";
import { buildNaming } from "../lzx/dist/naming.js";
import { SCHEMAS as _schemas } from "../runtime/dist/schema.js";
import { emitProgram } from "../lzx/dist/emit.js";
import { mapDoc } from "../lzx/dist/map.js";
import { makeSink } from "../lzx/dist/gaps.js";
import { compile } from "../compiler/dist/compile-node.js";
import { readFileSync } from "node:fs";
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

await test("user class names fold case-insensitively and emit PascalCase (internal caps kept)", () => {
  const { naming } = buildNaming(["weatherSummary"]);
  // case-insensitive fold to the declared form, then first-char uppercased
  if (naming.classNameFor("weathersummary") !== "WeatherSummary") throw new Error("ci identity: " + naming.classNameFor("weathersummary"));
  if (naming.classNameFor("weatherSummary") !== "WeatherSummary") throw new Error("exact");
});

await test("reports a collision when two names map to one identifier", () => {
  const { collisions } = buildNaming(["BorderedBox", "borderedbox"]);
  if (collisions.length !== 1 || collisions[0].lzxNames.length !== 2) throw new Error("collision");
});

// ── Task 4: emission IR + serializer ───────────────────────────────────────

await test("emits a minimal App with a literal attribute", () => {
  const out = emitProgram({ classes: [], root: {
    tag: "App", name: null, attrs: [{ name: "width", value: { kind: "literal", text: "240" } }],
    decls: [], methods: [], children: [] } });
  if (!/App \[/.test(out) || !/width = 240/.test(out)) throw new Error("out: " + out);
});

await test("emits a constraint, named child, method, and class base-first", () => {
  const out = emitProgram({
    classes: [{ name: "Foo", base: "View", body: {
      tag: "Foo", name: null, attrs: [{ name: "x", value: { kind: "code", src: "parent.width / 2" } }],
      decls: [], methods: [{ name: "onClick", params: [], body: "count = count + 1" }], children: [] } }],
    root: { tag: "App", name: null, attrs: [], decls: [], methods: [],
      children: [{ tag: "Foo", name: "foo", attrs: [], decls: [], methods: [], children: [] }] } });
  if (!/class Foo extends View \[/.test(out)) throw new Error("class");
  if (!/x = \{ parent\.width \/ 2 \}/.test(out)) throw new Error("constraint: " + out);
  if (!/onClick\(\) \{ count = count \+ 1 \}/.test(out)) throw new Error("method: " + out);
  if (!/foo: Foo/.test(out)) throw new Error("named child");
  if (out.indexOf("class Foo") > out.indexOf("App [")) throw new Error("ordering");
});

// ── Task 5: mapDoc core ────────────────────────────────────────────────────

await test("maps <canvas> to App and round-trips through emit", () => {
  const prog = mapDoc(parseLzx(`<canvas width="240"/>`), buildNaming([]).naming, makeSink());
  const out = emitProgram(prog);
  if (!/App \[/.test(out) || !/width = 240/.test(out)) throw new Error("out: " + out);
});

await test("emits a Color slot as a bare ident, not a string", () => {
  const prog = mapDoc(parseLzx(`<canvas><view bgcolor="red"/></canvas>`), buildNaming([]).naming, makeSink());
  const out = emitProgram(prog);
  if (!/fill = red/.test(out)) throw new Error("expected bare fill = red; got: " + out);
});

await test("maps ${expr} to a code constraint", () => {
  const prog = mapDoc(parseLzx("<canvas width=\"${1 + 2}\"/>"), buildNaming([]).naming, makeSink());
  if (!/width = \{ 1 \+ 2 \}/.test(emitProgram(prog))) throw new Error("constraint");
});

await test("records a constraint-timing gap for $once{}", () => {
  const sink = makeSink();
  mapDoc(parseLzx("<canvas width=\"$once{1}\"/>"), buildNaming([]).naming, sink);
  if (!sink.gaps.some((g) => g.s13Ref === "constraint-timing")) throw new Error("no gap");
});

await test("records an unknown-tag gap for an unmapped child", () => {
  const sink = makeSink();
  mapDoc(parseLzx(`<canvas><frobnicate/></canvas>`), buildNaming([]).naming, sink);
  if (!sink.gaps.some((g) => g.s13Ref === "unknown-tag")) throw new Error("no unknown-tag gap");
});

// ── Task 6: end-to-end lzxToDeclare ────────────────────────────────────────

await test("transpiles a button: inline handler + content→label", () => {
  const r = lzxToDeclare(`<canvas height="30"><button onclick="animate('x', 100, 1000, true)">Move me</button></canvas>`);
  if (r.declare === null) throw new Error("null; gaps=" + JSON.stringify(r.gaps));
  if (!/Button \[/.test(r.declare)) throw new Error("no Button");
  if (!/onClick\(\) \{ animate\('x', 100, 1000, true\) \}/.test(r.declare)) throw new Error("handler: " + r.declare);
  if (!/label = "Move me"/.test(r.declare)) throw new Error("label: " + r.declare);
});

await test("maps <text>Hello</text> content to text", () => {
  const r = lzxToDeclare(`<canvas><text>Hello world!</text></canvas>`);
  if (!/text = "Hello world!"/.test(r.declare)) throw new Error("text: " + r.declare);
});

// ── Task 7: real reference-file goldens (settled must compile clean) ────────

const REF = "/Users/maxcarlsonold/openlaszlo-5.0/docs/reference/programs";
for (const f of ["view-1.lzx", "text-1.lzx"]) {
  await test(`settled reference ${f} transpiles and compiles clean`, () => {
    const r = lzxToDeclare(readFileSync(`${REF}/${f}`, "utf8"));
    if (r.declare === null) throw new Error(`${f}: null declare; gaps=` + JSON.stringify(r.gaps));
    const c = compile(r.declare, { typecheck: false });
    if (c.errors.length) throw new Error(`${f} compile errors:\n${c.report}\n--- emitted ---\n${r.declare}`);
  });
}

// ── Task 8: class / attribute / method / handler ───────────────────────────

await test("maps <class> with <attribute> and <method>, root instantiates it", () => {
  const r = lzxToDeclare(`<canvas><class name="myBox" extends="view"><attribute name="n" type="number" value="3"/><method name="bump" args="d">n = n + d</method></class><myBox/></canvas>`);
  if (r.declare === null) throw new Error("null; gaps=" + JSON.stringify(r.gaps));
  if (!/class MyBox extends View \[/.test(r.declare)) throw new Error("no class: " + r.declare);
  if (!/n: number = 3/.test(r.declare)) throw new Error("no decl: " + r.declare);
  if (!/bump\(d\) \{ n = n \+ d \}/.test(r.declare)) throw new Error("no method: " + r.declare);
  if (!/MyBox \[|MyBox,/.test(r.declare)) throw new Error("root should instantiate MyBox: " + r.declare);
});

await test("maps <handler name> to an on-method and reference to a subscription", () => {
  const r = lzxToDeclare(`<canvas><view><handler name="onclick">doThing()</handler><handler name="onidle" reference="watcher">tick()</handler></view></canvas>`);
  if (!/onClick\(\) \{ doThing\(\) \}/.test(r.declare)) throw new Error("handler: " + r.declare);
  if (!/onIdle\(\) <- watcher \{ tick\(\) \}/.test(r.declare)) throw new Error("subscription: " + r.declare);
});

await test("path-valued reference source is a subscription-source gap, not a <-", () => {
  const r = lzxToDeclare(`<canvas><view><handler name="ontick" reference="classroot.ms">go()</handler></view></canvas>`);
  if (!r.gaps.some((g) => g.s13Ref === "subscription-source")) throw new Error("no gap; gaps=" + JSON.stringify(r.gaps));
  if (/<- classroot\.ms/.test(r.declare)) throw new Error("must not emit path source: " + r.declare);
});

summarize("lzx");
