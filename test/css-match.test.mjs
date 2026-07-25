import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { matches, matched, containsPointerPseudo, buildRuleSet } from "../plugins/css/dist/css-match.js";
import { parseSelectorText } from "../plugins/css/dist/css-parse.js";

// A plain MatchView (the matcher is view-free — it reads only this shape).
function mk(o) {
  return {
    tagChain: o.tagChain ?? [],
    id: o.id ?? "",
    styleclass: o.styleclass ?? "",
    attr: o.attr ?? (() => undefined),
    pseudo: o.pseudo ?? (() => false),
    parent: o.parent ?? null,
  };
}

await test("matches: type selector is subclass-aware via tagChain", () => {
  const v = mk({ tagChain: ["Button", "Control", "View"] });
  assert.equal(matches(v, parseSelectorText("Button")), true);
  assert.equal(matches(v, parseSelectorText("Control")), true);
  assert.equal(matches(v, parseSelectorText("View")), true);
  assert.equal(matches(v, parseSelectorText("Slider")), false);
});

await test("matches: descendant combinator walks ancestors", () => {
  const a = mk({ tagChain: ["A", "View"] });
  const b = mk({ tagChain: ["B", "View"], parent: a });
  assert.equal(matches(b, parseSelectorText("A B")), true);
  assert.equal(matches(mk({ tagChain: ["B", "View"] }), parseSelectorText("A B")), false);
});

await test("matches: id/class match when present, never under the empty type-scope default", () => {
  assert.equal(matches(mk({ tagChain: ["A"], id: "main" }), parseSelectorText("#main")), true);
  assert.equal(matches(mk({ tagChain: ["A"], styleclass: "card big" }), parseSelectorText(".card")), true);
  assert.equal(matches(mk({ tagChain: ["A"] }), parseSelectorText("#main")), false);
  assert.equal(matches(mk({ tagChain: ["A"] }), parseSelectorText(".card")), false);
});

await test("matches: pseudo reads MatchView.pseudo; forcePointer satisfies hover/active but not focus", () => {
  const hot = mk({ tagChain: ["Card"], pseudo: (n) => n === "hover" });
  const cold = mk({ tagChain: ["Card"], pseudo: () => false });
  assert.equal(matches(hot, parseSelectorText("Card:hover")), true);
  assert.equal(matches(cold, parseSelectorText("Card:hover")), false);
  assert.equal(matches(cold, parseSelectorText("Card:hover"), true), true, "forcePointer satisfies :hover");
  assert.equal(matches(cold, parseSelectorText("Card:focus"), true), false, "forcePointer still requires real :focus");
});

await test("matched: cascade folds by (specificity, sourceIndex); higher specificity wins", () => {
  const rs = buildRuleSet("A { color: red; width: 8px } #main { color: blue }");
  const v = mk({ tagChain: ["A", "View"], id: "main" });
  const decls = matched(v, rs);
  assert.equal(decls.get("color"), "blue", "#main (spec 100) beats A (spec 1)");
  assert.equal(decls.get("width"), "8px", "A's other property still folds in");
});

await test("containsPointerPseudo: true for :hover/:active, false for :focus/plain", () => {
  assert.equal(containsPointerPseudo(parseSelectorText("A:hover")), true);
  assert.equal(containsPointerPseudo(parseSelectorText("A:active")), true);
  assert.equal(containsPointerPseudo(parseSelectorText("A:focus")), false);
  assert.equal(containsPointerPseudo(parseSelectorText("A")), false);
});

summarize("css-match");
