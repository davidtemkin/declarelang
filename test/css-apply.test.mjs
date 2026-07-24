import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { build, Pointer, settle } from "../runtime/dist/index.js";
import { Focus } from "../runtime/dist/focus.js";
import { buildRuleSet } from "../plugins/css/dist/css-match.js";
import { installCss } from "../plugins/css/dist/css-apply.js";

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

// installCss registers an onEachView hook; enter fires during build()'s initTree,
// so it MUST be installed BEFORE build() for the tree's views to be seen.
await test("installCss: a type rule provides a coerced attr below author", () => {
  Pointer.reset(); Focus.reset();
  const off = installCss(buildRuleSet("View { background-color: #1e3a49 }"));
  try {
    const app = build(`App [ width = 50, height = 50, a: View [ ] ]`);
    app.attach(mockBackend(), null);
    assert.equal(app.a.fill, 0x1e3a49, "fill provided from CSS");
  } finally { off(); }
});

await test("installCss: author provision wins over CSS (gate)", () => {
  Pointer.reset(); Focus.reset();
  const off = installCss(buildRuleSet("View { background-color: #1e3a49 }"));
  try {
    const app = build(`App [ width = 50, height = 50, a: View [ fill = #010203 ] ]`);
    app.attach(mockBackend(), null);
    assert.equal(app.a.fill, 0x010203, "author fill stands");
  } finally { off(); }
});

await test("installCss: :hover applies on hover + force-sinks the view", () => {
  Pointer.reset(); Focus.reset();
  const off = installCss(buildRuleSet("View:hover { background-color: #1e3a49 }"));
  try {
    const app = build(`App [ width = 50, height = 50, a: View [ ] ]`);
    app.attach(mockBackend(), null);
    const A = app.a;
    assert.notEqual(A.fill, 0x1e3a49, "no hover offer initially");
    assert.equal(typeof A.surface.__sink, "function", "force-sinked (a :hover rule targets it)");
    Pointer.register(A.surface.__sink, A);
    Pointer.hover(A.surface.__sink);
    settle();
    assert.equal(A.fill, 0x1e3a49, "hover offer applied");
    Pointer.hover(null);
    settle();
    assert.notEqual(A.fill, 0x1e3a49, "withdrawn on hover-out");
  } finally { off(); }
});

summarize("css-apply");
