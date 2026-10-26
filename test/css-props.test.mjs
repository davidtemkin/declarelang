import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { PROP_MAP, coerceDecls } from "../plugins/css/dist/css-props.js";
import { CSS_COLORS } from "../runtime/dist/css-colors.js";

await test("PROP_MAP maps css props to existing View attrs", () => {
  assert.equal(PROP_MAP["background-color"].attr, "fill");
  assert.equal(PROP_MAP["color"].attr, "textColor");
  assert.equal(PROP_MAP["border-radius"].attr, "cornerRadius");
  assert.equal(PROP_MAP["font-size"].attr, "fontSize");
});

await test("coerceDecls maps + coerces, skipping unmapped and malformed", () => {
  const decls = new Map([
    ["color", "red"],
    ["width", "8px"],
    ["opacity", "0.5"],
    ["font-weight", "700"],
    ["unknown-prop", "x"],
  ]);
  const out = coerceDecls(decls);
  assert.equal(out.get("textColor"), CSS_COLORS.red);
  assert.equal(out.get("width"), 8);
  assert.equal(out.get("opacity"), 0.5);
  assert.equal(out.get("fontWeight"), "bold");
  assert.equal(out.has("unknown-prop"), false);
});

await test("coerceDecls drops a malformed value", () => {
  const out = coerceDecls(new Map([["width", "bad"], ["color", "red"]]));
  assert.equal(out.has("width"), false, "malformed length dropped");
  assert.equal(out.get("textColor"), CSS_COLORS.red);
});

summarize("css-props");
