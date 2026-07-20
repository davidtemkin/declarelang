import { lzxToDeclare } from "../lzx/dist/transpile.js";
import { parseLzx } from "../lzx/dist/parse.js";
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

summarize("lzx");
