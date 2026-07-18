// CSS engine tests: parser, matcher, coercers, mapping, applier, wiring.
// Runs against the built runtime/dist — `npm test` builds first.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { settle } from "../runtime/dist/reactive.js";
import { View } from "../runtime/dist/view.js";

// ── M1: the pure engine (parser + matcher) ──────────────────────────────────
const { specificityOf, parseSelectorText, parseCss } = await import("../runtime/dist/css-parse.js");

await test("specificityOf sums conditions across simple selectors", () => {
  assert.equal(specificityOf([{ conditions: [{ kind: "class", name: "red" }] }]), 10);
  assert.equal(specificityOf([{ conditions: [{ kind: "class", name: "red" }, { kind: "class", name: "green" }] }]), 20);
  assert.equal(specificityOf([{ conditions: [{ kind: "tag", name: "view" }, { kind: "class", name: "red" }] }]), 11);
  assert.equal(specificityOf([{ conditions: [{ kind: "id", name: "x" }] }]), 100);
  assert.equal(specificityOf([]), 0);
  assert.equal(specificityOf([
    { conditions: [{ kind: "tag", name: "view" }] },
    { conditions: [{ kind: "tag", name: "button" }, { kind: "class", name: "active" }] },
  ]), 12);
});

await test("parseSelectorText: single conditions", () => {
  assert.deepEqual(parseSelectorText(".red"), [{ conditions: [{ kind: "class", name: "red" }] }]);
  assert.deepEqual(parseSelectorText("#x"), [{ conditions: [{ kind: "id", name: "x" }] }]);
  assert.deepEqual(parseSelectorText("view"), [{ conditions: [{ kind: "tag", name: "view" }] }]);
  assert.deepEqual(parseSelectorText("*"), [{ conditions: [] }]);
});

await test("parseSelectorText: compound + attribute ops", () => {
  assert.deepEqual(parseSelectorText(".red.green"), [{ conditions: [
    { kind: "class", name: "red" }, { kind: "class", name: "green" }] }]);
  assert.deepEqual(parseSelectorText("view.red"), [{ conditions: [
    { kind: "tag", name: "view" }, { kind: "class", name: "red" }] }]);
  assert.deepEqual(parseSelectorText("[sel]"), [{ conditions: [{ kind: "attr", name: "sel" }] }]);
  assert.deepEqual(parseSelectorText("[k=v]"), [{ conditions: [{ kind: "attr", name: "k", op: "=", value: "v" }] }]);
  assert.deepEqual(parseSelectorText("[k~=v]"), [{ conditions: [{ kind: "attr", name: "k", op: "~=", value: "v" }] }]);
  assert.deepEqual(parseSelectorText("[k|=v]"), [{ conditions: [{ kind: "attr", name: "k", op: "|=", value: "v" }] }]);
});

await test("parseSelectorText: descendant combinator", () => {
  assert.deepEqual(parseSelectorText("view button.active"), [
    { conditions: [{ kind: "tag", name: "view" }] },
    { conditions: [{ kind: "tag", name: "button" }, { kind: "class", name: "active" }] },
  ]);
});

await test("parseSelectorText: rejects unsupported combinators", () => {
  assert.throws(() => parseSelectorText("a > b"), /unsupported/i);
});

await test("parseSelectorText: pseudo-classes :hover/:active/:focus", () => {
  assert.deepEqual(parseSelectorText(".card:hover"), [{ conditions: [
    { kind: "class", name: "card" }, { kind: "pseudo", name: "hover" }] }]);
  assert.deepEqual(parseSelectorText("Button:active"), [{ conditions: [
    { kind: "tag", name: "Button" }, { kind: "pseudo", name: "active" }] }]);
  assert.deepEqual(parseSelectorText("#f:focus"), [{ conditions: [
    { kind: "id", name: "f" }, { kind: "pseudo", name: "focus" }] }]);
  assert.equal(parseSelectorText(".a:hover:focus")[0].conditions.filter((c) => c.kind === "pseudo").length, 2);
  assert.throws(() => parseSelectorText(".a:bogus"), /unsupported/i);
});

await test("specificityOf: a pseudo adds 10", () => {
  assert.equal(specificityOf(parseSelectorText(".card:hover")), 20);
  assert.equal(specificityOf(parseSelectorText("view:hover")), 11);
});

await test("parseCss: rules, decls (raw strings), specificity, sourceIndex", () => {
  const rules = parseCss(`
    /* c */
    .red { background-color: #2d7; color: white }
    view.red { font-size: 14px }
  `);
  assert.equal(rules.length, 2);
  assert.equal(rules[0].specificity, 10);
  assert.equal(rules[0].sourceIndex, 0);
  assert.equal(rules[0].decls.get("background-color"), "#2d7");
  assert.equal(rules[0].decls.get("color"), "white");
  assert.equal(rules[1].specificity, 11);
  assert.equal(rules[1].sourceIndex, 1);
  assert.equal(rules[1].decls.get("font-size"), "14px");
});

await test("parseCss: comma-grouped selectors expand to one rule each", () => {
  const rules = parseCss(`.a, .b { color: red }`);
  assert.equal(rules.length, 2);
  assert.equal(rules[0].sourceIndex, 0);
  assert.equal(rules[1].sourceIndex, 1);
  assert.equal(rules[1].decls.get("color"), "red");
});

await test("parseCss: rejects !important cleanly", () => {
  assert.throws(() => parseCss(`.a { color: red !important }`), /unsupported|important/i);
});

const { buildRuleSet, matches, matched, containsPointerPseudo } = await import("../runtime/dist/css-match.js");

function fakeView(over = {}, parent = null) {
  return {
    tagChain: over.tagChain ?? [],
    id: over.id ?? "",
    styleclass: over.styleclass ?? "",
    attr: (n) => (over.attrs ?? {})[n],
    pseudo: (n) => (over.pseudo ?? {})[n],
    parent,
  };
}

await test("matches: class membership is whitespace-tokenized (~=)", () => {
  const v = fakeView({ styleclass: "red bold" });
  assert.equal(matches(v, parseSelectorText(".red")), true);
  assert.equal(matches(v, parseSelectorText(".bold")), true);
  assert.equal(matches(v, parseSelectorText(".re")), false);
  assert.equal(matches(v, parseSelectorText(".red.bold")), true);
  assert.equal(matches(v, parseSelectorText(".red.green")), false);
});

await test("matches: subclass-aware tag via tagChain, id, universal", () => {
  const v = fakeView({ tagChain: ["Button", "View", "Node"], id: "ok" });
  assert.equal(matches(v, parseSelectorText("View")), true);
  assert.equal(matches(v, parseSelectorText("Button")), true);
  assert.equal(matches(v, parseSelectorText("Text")), false);
  assert.equal(matches(v, parseSelectorText("#ok")), true);
  assert.equal(matches(v, parseSelectorText("*")), true);
});

await test("matches: attribute ops = ~= |=", () => {
  const v = fakeView({ attrs: { sel: true, cls: "a b", lang: "en-US" } });
  assert.equal(matches(v, parseSelectorText("[sel]")), true);
  assert.equal(matches(v, parseSelectorText("[missing]")), false);
  assert.equal(matches(v, parseSelectorText("[cls~=b]")), true);
  assert.equal(matches(v, parseSelectorText("[cls~=c]")), false);
  assert.equal(matches(v, parseSelectorText("[lang|=en]")), true);
  assert.equal(matches(v, parseSelectorText("[lang|=fr]")), false);
});

await test("matches: descendant combinator walks the parent chain", () => {
  const root = fakeView({ tagChain: ["View"] });
  const child = fakeView({ tagChain: ["Button", "View"], styleclass: "active" }, root);
  assert.equal(matches(child, parseSelectorText("View Button.active")), true);
  assert.equal(matches(child, parseSelectorText("Text Button.active")), false);
  // rightmost must match THIS node: `View Text` fails (child is not a Text)
  assert.equal(matches(child, parseSelectorText("View Text")), false);
});

await test("buildRuleSet parses text into rules", () => {
  const rs = buildRuleSet(".a { color: red }");
  assert.equal(rs.rules.length, 1);
  assert.equal(rs.rules[0].decls.get("color"), "red");
});

await test("matches: pseudo reads MatchView.pseudo", () => {
  assert.equal(matches(fakeView({ styleclass: "card", pseudo: { hover: true } }), parseSelectorText(".card:hover")), true);
  assert.equal(matches(fakeView({ styleclass: "card" }), parseSelectorText(".card:hover")), false);
});

await test("matches forcePointer + containsPointerPseudo", () => {
  const v = fakeView({ styleclass: "card" }); // hover NOT set
  assert.equal(matches(v, parseSelectorText(".card:hover")), false);
  assert.equal(matches(v, parseSelectorText(".card:hover"), true), true);   // forced
  assert.equal(matches(v, parseSelectorText(".card:focus"), true), false);  // focus not forced
  assert.equal(containsPointerPseudo(parseSelectorText(".card:hover")), true);
  assert.equal(containsPointerPseudo(parseSelectorText(".card:active")), true);
  assert.equal(containsPointerPseudo(parseSelectorText(".card:focus")), false);
  assert.equal(containsPointerPseudo(parseSelectorText(".card")), false);
});

await test("matched: specificity then source order; per-property last wins", () => {
  const rs = buildRuleSet(`
    .red { color: red; font-size: 10px }
    .red.green { color: yellow }
    #id { color: blue }
  `);
  let m = matched(fakeView({ styleclass: "red" }), rs);
  assert.equal(m.get("color"), "red");
  assert.equal(m.get("font-size"), "10px");
  m = matched(fakeView({ styleclass: "red green" }), rs);
  assert.equal(m.get("color"), "yellow"); // spec 20 > 10
  assert.equal(m.get("font-size"), "10px");
  m = matched(fakeView({ styleclass: "red green", id: "id" }), rs);
  assert.equal(m.get("color"), "blue"); // spec 100 > 20
});

await test("matched: equal specificity resolves by source order (last wins)", () => {
  const rs = buildRuleSet(`.a { color: red } .a { color: green }`);
  const m = matched(fakeView({ styleclass: "a" }), rs);
  assert.equal(m.get("color"), "green");
});

// ── M2: value coercers + attribute mapping ──────────────────────────────────
const { coerceColor, coerceLength, coerceNumber, coerceString, coerceWeight } =
  await import("../runtime/dist/css-coerce.js");

await test("coerceColor: hex, named, rgb() → int; malformed → undefined", () => {
  assert.equal(coerceColor("#2d7"), 0x22dd77);
  assert.equal(coerceColor("#22dd77"), 0x22dd77);
  assert.equal(coerceColor("white"), 0xffffff);
  assert.equal(coerceColor("WHITE"), 0xffffff);
  assert.equal(coerceColor("rgb(34, 221, 119)"), 0x22dd77);
  assert.equal(coerceColor("rgb(300, 0, 0)"), 0xff0000);
  assert.equal(coerceColor("notacolor"), undefined);
  assert.equal(coerceColor("#12"), undefined);
});

await test("coerceLength: px + unitless; malformed → undefined", () => {
  assert.equal(coerceLength("10px"), 10);
  assert.equal(coerceLength("10"), 10);
  assert.equal(coerceLength("2.5px"), 2.5);
  assert.equal(coerceLength("banana"), undefined);
});

await test("coerceNumber / coerceString / coerceWeight", () => {
  assert.equal(coerceNumber("0.5"), 0.5);
  assert.equal(coerceNumber("x"), undefined);
  assert.equal(coerceString("sans-serif"), "sans-serif");
  assert.equal(coerceWeight("bold"), "bold");
  assert.equal(coerceWeight("normal"), "normal");
  assert.equal(coerceWeight("700"), "bold");
  assert.equal(coerceWeight("400"), "normal");
  assert.equal(coerceWeight("maybe"), undefined);
});

const { defineAttributes, cssMap } = await import("../runtime/dist/attributes.js");

await test("cssMap builds cssProp → {attr, coerce} from css:/coerce specs", () => {
  class Widget {}
  defineAttributes(Widget, {
    fill: { def: null, css: "background-color", coerce: (raw) => (raw === "#2d7" ? 0x22dd77 : undefined) },
    plain: { def: 0 },
  });
  const map = cssMap(Widget);
  assert.equal(map["background-color"].attr, "fill");
  assert.equal(map["background-color"].coerce("#2d7"), 0x22dd77);
  assert.equal(map["plain"], undefined);

  class Bare {}
  defineAttributes(Bare, { x: { def: 0 } });
  assert.equal(Object.keys(cssMap(Bare)).length, 0); // no css specs → empty map
});

await test("cssMap(View): W3C properties map onto View attributes with coercers", () => {
  const map = cssMap(View);
  assert.equal(map["background-color"].attr, "fill");
  assert.equal(map["color"].attr, "textColor");
  assert.equal(map["font-size"].attr, "fontSize");
  assert.equal(map["border-radius"].attr, "cornerRadius");
  assert.equal(map["left"].attr, "x");
  assert.equal(map["background-color"].coerce("#2d7"), 0x22dd77);
  assert.equal(map["font-size"].coerce("14px"), 14);
});

// ── M3: runtime wiring ──────────────────────────────────────────────────────
const { cssWrite, cssClear, cssMarks, stylesheetWrite, stylesheetClear, bindDerived } =
  await import("../runtime/dist/attributes.js");

await test("cssWrite marks + provides; cssClear restores the fallback", () => {
  const v = new View();
  cssWrite(v, "fill", 0x111111);
  assert.equal(v.fill, 0x111111);
  assert.equal(cssMarks(v)?.has("fill"), true);
  cssClear(v, "fill");
  assert.equal(v.fill, null); // View's fill default
  assert.equal(cssMarks(v)?.has("fill") ?? false, false);
});

await test("class-dict eviction: stylesheetWrite over a CSS-marked slot wins and evicts the CSS mark", () => {
  const v = new View();
  cssWrite(v, "fill", 0x111111);
  stylesheetWrite(v, "fill", 0x222222);
  assert.equal(v.fill, 0x222222);
  assert.equal(cssMarks(v)?.has("fill") ?? false, false); // class-dict (rank-2) evicts CSS (rank-2b)
});

await test("CSS end-to-end: a .class rule sets fill; author $set outranks it", () => {
  const root = new View();
  const child = new View();
  child.styleclass = "box";
  root.appendChild(child);                 // links child.parent = root
  root.cssRules = buildRuleSet(`.box { background-color: #2d7 }`); // pusher walks subtree → appliers
  settle();
  assert.equal(child.fill, 0x22dd77);

  const authored = new View();
  authored.styleclass = "box";
  authored.fill = 0x0000ff;                // author $set
  root.appendChild(authored);
  settle();
  assert.equal(authored.fill, 0x0000ff);   // author provision outranks CSS
});

await test("class-dict outranks CSS: value is the class-dict's after both channels apply", () => {
  const v = new View();
  v.styleclass = "a";
  v.cssRules = buildRuleSet(`.a { background-color: #2d7 }`);
  settle();
  assert.equal(v.fill, 0x22dd77);          // CSS offered
  stylesheetWrite(v, "fill", 0x0000ff);    // class-dict claims it (evicts CSS mark)
  settle();
  assert.equal(v.fill, 0x0000ff);          // class-dict wins
});

await test("reactive marks: class-dict RELEASE re-offers the CSS value (probe wakes the applier)", () => {
  const v = new View();
  v.styleclass = "a";
  v.cssRules = buildRuleSet(`.a { background-color: #2d7 }`);
  settle();
  stylesheetWrite(v, "fill", 0x0000ff);
  settle();
  assert.equal(v.fill, 0x0000ff);
  stylesheetClear(v, "fill");              // class-dict withdraws
  settle();
  assert.equal(v.fill, 0x22dd77);          // CSS re-offers via the tracked provision probe
});

await test("CSS on a prevailing slot inherits to descendants via follow (no CSS parent-cache)", () => {
  const root = new View();
  root.id = "root";
  const child = new View();
  root.appendChild(child);
  root.cssRules = buildRuleSet(`#root { color: red }`);
  settle();
  assert.equal(root.textColor, 0xff0000);
  assert.equal(child.textColor, 0xff0000); // inherited by prevailing-follow
});

await test("pseudo state re-cascades; reverts to base; author outranks", () => {
  const v = new View();
  v.styleclass = "card";
  v.cssRules = buildRuleSet(`.card { background-color: #111111 } .card:hover { background-color: #222222 }`);
  settle();
  assert.equal(v.fill, 0x111111);
  v.setPseudoState("hover", true); settle();
  assert.equal(v.fill, 0x222222);          // :hover (spec 20) wins
  v.setPseudoState("hover", false); settle();
  assert.equal(v.fill, 0x111111);          // reverts to base .card, not default
  v.fill = 0x0000ff;                         // author $set
  v.setPseudoState("hover", true); settle();
  assert.equal(v.fill, 0x0000ff);          // author outranks :hover
});

await test(":active and :focus states re-cascade", () => {
  const v = new View();
  v.styleclass = "b";
  v.cssRules = buildRuleSet(`.b { background-color: #111111 } .b:active { background-color: #333333 } .b:focus { background-color: #444444 }`);
  settle();
  v.setPseudoState("active", true); settle(); assert.equal(v.fill, 0x333333);
  v.setPseudoState("active", false); v.setPseudoState("focus", true); settle(); assert.equal(v.fill, 0x444444);
  v.setPseudoState("focus", false); settle(); assert.equal(v.fill, 0x111111);
});

await test("an owning binding outranks CSS (ownerOf gate)", () => {
  const v = new View();
  v.styleclass = "a";
  bindDerived(v, "fill", () => 0x0000ff); // an owning { } constraint on fill
  v.cssRules = buildRuleSet(`.a { background-color: #2d7 }`);
  settle();
  assert.equal(v.fill, 0x0000ff); // the binding owns the slot; CSS yields
});

await test("no-thrash: a stable cascade settles without exceeding the cycle guard", () => {
  const root = new View();
  const v = new View();
  v.styleclass = "a";
  root.appendChild(v);
  root.cssRules = buildRuleSet(`.a { background-color: #2d7 }`);
  assert.doesNotThrow(() => settle()); // bounded fixpoint (=== gate + cycle guard)
  assert.equal(v.fill, 0x22dd77);
});

summarize("css");
