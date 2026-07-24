import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { build, Pointer, settle } from "../runtime/dist/index.js";
import { cssPlugin } from "../plugins/css/dist/css-plugin.js";

function mockBackend() {
  const surface = () => {
    const self = { __sink: undefined };
    return new Proxy(self, { get(t, p) {
      if (p === "__sink") return t.__sink;
      if (p === "setInput") return (s) => { t.__sink = s; };
      return () => {};
    }});
  };
  return { createSurface: surface, attachRoot: () => {} };
}

await test("a css block styles the running app", () => {
  Pointer.reset();
  let app;
  try {
    app = build(`css Sky { View { background-color: #1e3a49 } }\nApp [ width = 10, height = 10, a: View [ ] ]`, { plugins: [cssPlugin] });
    app.attach(mockBackend(), null);
    assert.equal(app.a.fill, 0x1e3a49, "CSS provided the fill");
  } finally { app?.discard(); }
});

await test("a css :hover rule applies on hover through the block", () => {
  Pointer.reset();
  let app;
  try {
    app = build(`css H { View:hover { background-color: #1e3a49 } }\nApp [ width = 10, height = 10, a: View [ ] ]`, { plugins: [cssPlugin] });
    app.attach(mockBackend(), null);
    const A = app.a;
    assert.notEqual(A.fill, 0x1e3a49, "no hover offer initially");
    assert.equal(typeof A.surface.__sink, "function", "force-sinked");
    Pointer.register(A.surface.__sink, A);
    Pointer.hover(A.surface.__sink); settle();
    assert.equal(A.fill, 0x1e3a49, "hover offer applied");
  } finally { app?.discard(); }
});

await test("an unknown CSS property is a positioned compile error", () => {
  let err;
  try { build(`css Bad { View { colr: red } }\nApp [ ]`, { plugins: [cssPlugin] }); }
  catch (e) { err = e; }
  assert.ok(err, "build threw");
  assert.match(err.message, /unknown CSS property 'colr'/);
  assert.match(err.message, /line \d+, col \d+/, "positioned");
});

await test("an uncoercible value is a positioned compile error", () => {
  assert.throws(
    () => build(`css Bad { View { color: notacolor } }\nApp [ ]`, { plugins: [cssPlugin] }),
    /not a valid value for CSS 'color'/
  );
});

await test("unsupported CSS (a combinator) is a positioned compile error", () => {
  assert.throws(
    () => build(`css Bad { A > B { color: red } }\nApp [ ]`, { plugins: [cssPlugin] }),
    /unsupported/i
  );
});

await test("without the plugin, `css` stays an ordinary identifier (inert seam)", () => {
  assert.throws(() => build(`css Sky { color: red }\nApp [ ]`));
});

summarize("css-plugin");
