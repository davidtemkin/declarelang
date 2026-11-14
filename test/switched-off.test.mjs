// Switching a part of the interface off reaches everything inside it.
//
// `pointerEvents = "none"` switches a view and its whole subtree off for the
// pointer, a control's insides included, and a view below it that says "auto"
// switches its own part back on. `disabled` on a container (or on a control)
// disables every control inside it, unless one says otherwise itself.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate } from "../runtime/dist/instantiate.js";
import { settle, provideMeasurer, HeadlessBackend } from "../runtime/dist/index.js";
import { pressAt } from "../runtime/dist/interaction.js";

provideMeasurer({
  font: "16px sans-serif", letterSpacing: "0px",
  measureText(s) {
    return { width: [...String(s)].length * 8, fontBoundingBoxAscent: 12, fontBoundingBoxDescent: 4,
      actualBoundingBoxAscent: 11, actualBoundingBoxDescent: 0 };
  },
});

async function boot(src) {
  const b = await compileProgram(src, { originDir: process.cwd() + "/library" });
  assert.deepEqual(b.errors.map((e) => e.message), [], "compiles");
  const app = instantiate(b.program);
  app.$attach(new HeadlessBackend(), null);
  settle();
  return app;
}

const SRC = `App [ width = 500, height = 300, busy: boolean = true,
    glass: View [ x = 0, y = 0, width = 400, height = 200, pointerEvents = "none",
        d: View [ x = 0, y = 0, width = 100, height = 40, onClick() { } ],
        e: View [ x = 0, y = 50, width = 100, height = 40, pointerEvents = "auto",
            inner: View [ x = 10, y = 10, width = 20, height = 20, onClick() { } ] ],
        f: TextInput [ x = 0, y = 100, width = 160, accessibilityLabel = "Field" ] ],
    off: View [ x = 0, y = 210, width = 400, height = 80, disabled = { app.busy },
        a: Button [ label = "A" ],
        b: Button [ x = 100, label = "B", disabled = false ],
        c: Combobox [ x = 200, width = 160, accessibilityLabel = "Who", items = { ["Ada", "Alan"] } ] ]
    ]`;

await test("pointerEvents = none switches the subtree off; an 'auto' below switches its part back on", async () => {
  const app = await boot(SRC);
  assert.notEqual(pressAt(app, 20, 20), app.glass.d, "a child with a handler inside a 'none' takes no press");
  assert.equal(pressAt(app, 15, 65), app.glass.e.inner, "inside an 'auto' below it, presses land again");
  const field = pressAt(app, 40, 110);
  assert.ok(field == null || (field !== app.glass.f && !app.glass.f.childViews.includes(field)),
    "a control's own insides (a field's native text) are switched off too");
});

await test("disabled on a container disables every control inside it, unless one says otherwise", async () => {
  const app = await boot(SRC);
  assert.equal(app.off.a.disabled, true, "a control in a disabled container is disabled");
  assert.equal(app.off.b.disabled, false, "one that says disabled = false keeps itself on");
  assert.equal(app.off.c.disabled, true, "a Combobox is disabled…");
  const inner = [];
  const walk = (v) => { for (const k of v.childViews ?? []) { if (typeof k.disabled === "boolean") inner.push(k); walk(k); } };
  walk(app.off.c);
  assert.ok(inner.length > 0 && inner.every((k) => k.disabled), "…and so is every control it is made of");
  app.busy = false;
  settle();
  assert.equal(app.off.a.disabled, false, "switching the container back on reaches them again");
});

summarize("switched-off");
