import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { ancestorChain, chainDiff, makeInteractionTracker } from "../plugins/css/dist/css-interaction.js";
import { build, Pointer } from "../runtime/dist/index.js";
import { Focus } from "../runtime/dist/focus.js";

await test("ancestorChain + chainDiff are pure", () => {
  const A = { parent: null }, B = { parent: A }, C = { parent: B };
  assert.deepEqual(ancestorChain(C), [C, B, A]);
  assert.deepEqual(chainDiff([C, B, A], [B, A]), { clear: [C], set: [] });
});

await test("tracker: hover chains, focus is leaf; pseudo names are hover/active/focus", () => {
  Pointer.reset(); Focus.reset();
  const app = build(`App [ width = 10, height = 10, a: View [ b: View [ focusable = true ] ] ]`);
  const A = app.a, B = app.a.b;
  const tr = makeInteractionTracker(Pointer, Focus);
  try {
    const sinkB = () => {}; Pointer.register(sinkB, B);
    Pointer.hover(sinkB);
    assert.equal(tr.pseudo(B, "hover"), true);
    assert.equal(tr.pseudo(A, "hover"), true, "hover chains to ancestor");
    Pointer.hover(null);
    assert.equal(tr.pseudo(B, "hover"), false);
    Pointer.press(sinkB);
    assert.equal(tr.pseudo(A, "active"), true, "press chains (pseudo name 'active')");
    Pointer.press(null);
    Focus.setRoot(app); Focus.focus(B);
    assert.equal(tr.pseudo(B, "focus"), true);
    assert.equal(tr.pseudo(A, "focus"), false, "focus is leaf-only");
  } finally { tr.dispose(); }
});

summarize("css-interaction");
