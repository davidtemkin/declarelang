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

// ── Task 9: setAttribute / getAttribute balanced-scanner rewrite ────────────

await test("rewrites this.path.setAttribute('name', value) to an assignment", () => {
  const r = lzxToDeclare(`<canvas><view><handler name="onclick">this.top.titlebox.setAttribute('fgcolor', 0xFFFFFF)</handler></view></canvas>`);
  if (!/this\.top\.titlebox\.fgcolor = 0xFFFFFF/.test(r.declare)) throw new Error("rewrite: " + r.declare);
});

await test("balances a compound value with nested calls and commas", () => {
  const r = lzxToDeclare(`<canvas><view><handler name="onclick">error.setAttribute('text', "E: " + f(a, b))</handler></view></canvas>`);
  if (!/error\.text = "E: " \+ f\(a, b\)/.test(r.declare)) throw new Error("compound: " + r.declare);
});

await test("leaves a computed-name setAttribute verbatim and records a dynamic-body gap", () => {
  const r = lzxToDeclare(`<canvas><view><handler name="onclick">x.setAttribute(nm, v)</handler></view></canvas>`);
  if (!/x\.setAttribute\(nm, v\)/.test(r.declare)) throw new Error("verbatim: " + r.declare);
  if (!r.gaps.some((g) => g.s13Ref === "dynamic-body")) throw new Error("no dynamic-body gap");
});

await test("rewrites getAttribute to a plain read", () => {
  const r = lzxToDeclare(`<canvas><view><handler name="onclick">var w = this.getAttribute('width')</handler></view></canvas>`);
  if (!/var w = this\.width/.test(r.declare)) throw new Error("getAttribute: " + r.declare);
});

// ── Task 10: datapaths ─────────────────────────────────────────────────────

await test("maps a trivial datapath to a :path", () => {
  const r = lzxToDeclare(`<canvas><view datapath="item/@code"/></canvas>`);
  if (!/datapath = :item\.code/.test(r.declare)) throw new Error("datapath: " + r.declare);
});

await test("records datapath-xpath gap for an indexed/predicate path", () => {
  const r = lzxToDeclare(`<canvas><view datapath="item[1]/condition/@code"/></canvas>`);
  if (!r.gaps.some((g) => g.s13Ref === "datapath-xpath")) throw new Error("no gap; gaps=" + JSON.stringify(r.gaps));
  if (/datapath = :/.test(r.declare)) throw new Error("should not emit an xpath datapath: " + r.declare);
});

// ── Task 11: <state> → state-form gap (real translation deferred) ───────────

await test("<state> records a state-form gap and is not emitted", () => {
  const r = lzxToDeclare(`<canvas><view><state name="big" applied="\${x}"><animatorgroup><animator attribute="width" to="400"/></animatorgroup></state></view></canvas>`);
  if (!r.gaps.some((g) => g.s13Ref === "state-form")) throw new Error("no state-form gap");
  if (!r.gaps.some((g) => g.s13Ref === "animation-choreography")) throw new Error("no animation gap");
  if (/state|State/.test(r.declare)) throw new Error("state should not be emitted: " + r.declare);
});

// ── Task 12: on<attribute> change handlers + canvas knobs ───────────────────

await test("on<attribute> change handler is a gap, not an onX method", () => {
  const r = lzxToDeclare(`<canvas><view onwidth="doLayout()"/></canvas>`);
  if (!r.gaps.some((g) => g.s13Ref === "attr-change-handler")) throw new Error("no attr-change-handler gap");
  if (/onWidth/.test(r.declare)) throw new Error("must not emit onWidth: " + r.declare);
});

await test("canvas knobs are dropped with an info gap", () => {
  const r = lzxToDeclare(`<canvas debug="true" width="100"/>`);
  if (/debug/.test(r.declare)) throw new Error("debug should be dropped: " + r.declare);
  if (!/width = 100/.test(r.declare)) throw new Error("width should survive");
});

// ── Task 13: weather.lzx oracle fixture ────────────────────────────────────

await test("weather.lzx transpiles (skeleton) and reports its known gap families", () => {
  const r = lzxToDeclare(readFileSync("/Users/maxcarlsonold/openlaszlo-5.0/examples/weather/weather.lzx", "utf8"));
  const refs = new Set(r.gaps.map((g) => g.s13Ref));
  // weather.lzx uses resources with sprite frames, XPath datapaths, and a
  // <datapointer> — but no <state> (it animates via standalone animatorgroups).
  for (const expected of ["resources-and-fonts", "datapath-xpath", "imperative-data-mutation"]) {
    if (!refs.has(expected)) throw new Error("missing gap family: " + expected + "; got " + [...refs]);
  }
});

// ── Library mapping Task 2: naming ─────────────────────────────────────────

await test("hasSchema true for a schema tag, false for a library class", () => {
  const { naming } = buildNaming([]);
  if (!naming.hasSchema("TextInput")) throw new Error("TextInput should be schema-backed");
  if (naming.hasSchema("Button")) throw new Error("Button is a library class, not a schema");
});
await test("declaresEvent walks the base chain", () => {
  const { naming } = buildNaming([]);
  if (!naming.declaresEvent("Image", "onClick")) throw new Error("Image should inherit View's click");
  if (naming.declaresEvent("Image", "onFrobnicate")) throw new Error("no such event");
  if (!naming.declaresEvent("Animator", "onStop")) throw new Error("Animator declares stop");
});
await test("image source aliases (src/resource/url) map to source", () => {
  const { naming } = buildNaming([]);
  for (const a of ["src", "resource", "url"]) if (naming.attrFor(a) !== "source") throw new Error(a + "→" + naming.attrFor(a));
});
await test("component tags map to schema-backed Declare tags", () => {
  const { naming } = buildNaming([]);
  if (naming.tagFor("edittext") !== "TextInput") throw new Error("edittext");
  if (naming.tagFor("image") !== "Image") throw new Error("image");
  if (naming.tagFor("animatorgroup") !== "AnimatorGroup") throw new Error("animatorgroup");
  if (naming.tagFor("node") !== null) throw new Error("node must NOT be mapped (empty schema)");
});
await test("every TAG_TABLE value is a schema key or a library class (two-sided anchoring)", () => {
  const keys = new Set(Object.keys(_schemas));
  const libClasses = new Set(["Button","Checkbox","Radio","RadioGroup","Slider","Switch","Field","ProgressBar","Bar","FocusRing","Control"]);
  const { naming } = buildNaming([]);
  for (const lzx of ["canvas","view","text","button","simplelayout","dataset","edittext","inputtext","image","animator","animatorgroup","wrappinglayout"]) {
    const t = naming.tagFor(lzx);
    if (t && !keys.has(t) && !libClasses.has(t)) throw new Error(`${lzx}→${t} not anchored`);
  }
});

// ── Library mapping Task 3: routeSpecial ───────────────────────────────────

await test("<doc> is skipped (not emitted, children not walked) with a documentation gap", () => {
  const r = lzxToDeclare(`<canvas><view><doc><p>hi</p><classname>Foo</classname></doc></view></canvas>`);
  if (r.gaps.some((g) => g.kind.includes("<p>") || g.kind.includes("classname"))) throw new Error("walked into doc: " + JSON.stringify(r.gaps));
  if (!r.gaps.some((g) => g.s13Ref === "documentation")) throw new Error("no documentation gap");
});
await test("language constructs route to their categories", () => {
  const cases = [["include", "modules"], ["event", "event-decl"], ["setter", "custom-setter"], ["remotecall", "rpc"], ["param", "rpc"], ["stylesheet", "styling"], ["script", "script-block"]];
  for (const [tag, ref] of cases) {
    const r = lzxToDeclare(`<canvas><view><${tag}/></view></canvas>`);
    if (!r.gaps.some((g) => g.s13Ref === ref)) throw new Error(`<${tag}> should → ${ref}; got ${JSON.stringify(r.gaps.map((g) => g.s13Ref))}`);
  }
});
await test("<library> ROOT routes to modules and its classes are still walked (not dropped)", () => {
  const r = lzxToDeclare(`<library><class name="myThing" extends="view"/></library>`);
  if (!r.gaps.some((g) => g.s13Ref === "modules")) throw new Error("no modules gap for library root");
  if (r.gaps.some((g) => g.s13Ref === "unknown-tag" && g.kind.includes("library"))) throw new Error("library should not be unknown-tag");
});
await test("a <param> inside <doc> is documentation, not rpc (ordering)", () => {
  const r = lzxToDeclare(`<canvas><view><doc><param>x</param></doc></view></canvas>`);
  if (r.gaps.some((g) => g.s13Ref === "rpc")) throw new Error("doc param leaked to rpc");
  if (!r.gaps.some((g) => g.s13Ref === "documentation")) throw new Error("no documentation gap");
});

// ── Library mapping Task 4: dataset suppression ────────────────────────────

await test("<dataset> maps to Dataset; its data children are NOT walked", () => {
  const r = lzxToDeclare(`<canvas><dataset name="d"><item><day>Mon</day></item></dataset></canvas>`);
  if (r.gaps.some((g) => g.kind.includes("item") || g.kind.includes("day"))) throw new Error("walked dataset data: " + JSON.stringify(r.gaps));
  if (!r.gaps.some((g) => g.s13Ref === "dataset-body")) throw new Error("no dataset-body gap");
  if (!/Dataset/.test(r.declare ?? "")) throw new Error("Dataset not emitted: " + r.declare);
});

summarize("lzx");
