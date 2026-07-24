import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { parseCss, parseSelectorText, specificityOf, CssUnsupported } from "../plugins/css/dist/css-parse.js";
import { coerceColor, coerceLength, coerceNumber, coerceString, coerceWeight } from "../plugins/css/dist/css-coerce.js";
import { CSS_COLORS } from "../runtime/dist/css-colors.js";

await test("parseCss: a type rule → selector conditions + decls Map", () => {
  const rules = parseCss("Card { color: red; width: 8px }");
  assert.equal(rules.length, 1);
  const r = rules[0];
  assert.deepEqual(r.selector, [{ conditions: [{ kind: "tag", name: "Card" }] }]);
  assert.ok(r.decls instanceof Map, "decls is a Map");
  assert.equal(r.decls.get("color"), "red");
  assert.equal(r.decls.get("width"), "8px");
});

await test("parseSelectorText: type / class / id / descendant / pseudo", () => {
  assert.deepEqual(parseSelectorText("Card"), [{ conditions: [{ kind: "tag", name: "Card" }] }]);
  assert.deepEqual(parseSelectorText(".card"), [{ conditions: [{ kind: "class", name: "card" }] }]);
  assert.deepEqual(parseSelectorText("#main"), [{ conditions: [{ kind: "id", name: "main" }] }]);
  assert.equal(parseSelectorText("A B").length, 2, "descendant → two simple selectors");
  assert.deepEqual(parseSelectorText("Card:hover"),
    [{ conditions: [{ kind: "tag", name: "Card" }, { kind: "pseudo", name: "hover" }] }]);
});

await test("specificityOf: id > class > type", () => {
  const id = specificityOf(parseSelectorText("#main"));
  const cls = specificityOf(parseSelectorText(".card"));
  const tag = specificityOf(parseSelectorText("Card"));
  assert.ok(id > cls && cls > tag, `expected ${id} > ${cls} > ${tag}`);
});

await test("parseCss: multiple rules keep source order", () => {
  const rules = parseCss("A { color: red } B { color: blue }");
  assert.equal(rules.length, 2);
  assert.ok(rules[1].sourceIndex > rules[0].sourceIndex);
});

await test("parseCss: an unsupported construct throws CssUnsupported", () => {
  // a child combinator is explicitly unsupported (css-parse.ts guards /[>+~]/)
  assert.throws(() => parseCss("A > B { color: red }"), CssUnsupported);
});

await test("coerce: color / length / number / string / weight", () => {
  assert.equal(coerceColor("red"), CSS_COLORS.red);
  assert.equal(coerceColor("#1e3a49"), 0x1e3a49);
  assert.equal(coerceColor("nope"), undefined);
  assert.equal(coerceLength("8px"), 8);
  assert.equal(coerceLength("12"), 12);
  assert.equal(coerceLength("bad"), undefined);
  assert.equal(coerceNumber("0.5"), 0.5);
  assert.equal(coerceNumber("x"), undefined);
  assert.equal(coerceString("hello"), "hello");
  assert.equal(coerceString("   "), undefined);
  assert.equal(coerceWeight("bold"), "bold");
  assert.equal(coerceWeight("700"), "bold");
  assert.equal(coerceWeight("400"), "normal");
  assert.equal(coerceWeight("x"), undefined);
});

summarize("css-parse");
