// Where the person's place goes when the program changes (docs/system-design/
// focus-place.md). Pins:
//   - `focusable = quiet`: the program can focus it, Tab never lands on it, and
//     Tab goes on from its place; the literal is checked, and a constraint may
//     answer it;
//   - a control disabled while focused keeps focus, and Tab goes on from it;
//   - a view hidden or removed under focus: focus goes to the nearest container's
//     `restoresFocusTo`, or a stop group's entry; else it stays cleared, as before;
//     the program's own move wins;
//   - an overlay's `restoresFocusTo`, read as it closes.
// Headless: the library compiled, instantiated in Node.

import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate } from "../runtime/dist/instantiate.js";
import { settle, provideMeasurer, Focus, Keys, deliverKeys } from "../runtime/dist/index.js";
import { approximateMeasurer } from "../compiler/dist/headless.js";

provideMeasurer(approximateMeasurer());

// views compared by identity: a failing assert.equal on a live view prints its graph
const same = (a, b, msg) => assert.ok(a === b, msg);
const turns = async (n = 3) => { for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); settle(); } };

async function boot(src) {
  const b = await compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  Focus.reset();
  const app = instantiate(b.program);
  settle();
  Focus.setRoot(app);
  deliverKeys(Keys, Focus);
  return app;
}

await test("a quiet view takes focus from the program, is never a Tab stop, and Tab goes on from its place", async () => {
  const app = await boot(`App [ width = 500, height = 300,
    a: Button [ x = 20, y = 20, label = "Before" ],
    h: Text [ y = 60, text = "Your tickets", focusable = quiet ],
    b: Button [ x = 20, y = 100, label = "After" ] ]`);
  const warned = [];
  const was = console.warn;
  console.warn = (m) => warned.push(String(m));
  try {
    Focus.focus(app.h); settle();
  } finally { console.warn = was; }
  same(Focus.getFocus(), app.h, "the program focused it");
  assert.equal(warned.length, 0, "and was not warned: " + warned.join("; "));
  assert.ok(!Focus.sequenceFor(app.a).includes(app.h), "not among the Tab stops");
  Focus.next(); settle();
  same(Focus.getFocus(), app.b, "Tab goes to the first stop after it");
  Focus.focus(app.h); settle();
  Focus.prev(); settle();
  same(Focus.getFocus(), app.a, "Shift-Tab to the last stop before it");
  Focus.next(); settle();
  same(Focus.getFocus(), app.b, "and Tab from a stop passes over it");
});

await test("focusable takes true, false or quiet: another word is refused, and a constraint may answer quiet", async () => {
  const bad = await compileProgram(`App [ View [ focusable = maybe ] ]`, { originDir: process.cwd() + "/library", stripPos: false });
  assert.ok(bad.errors.some((e) => /quiet/.test(e.message) && /true \| false/.test(e.message)), bad.errors.map((e) => e.message).join("; "));
  const app = await boot(`App [ width = 500, height = 300, q: boolean = true,
    a: Button [ x = 20, y = 20, label = "A" ],
    h: View [ y = 60, width = 40, height = 20, focusable = { app.q ? "quiet" : true } ] ]`);
  assert.ok(!Focus.sequenceFor(app.a).includes(app.h), "quiet: not a stop");
  app.q = false; settle();
  assert.ok(Focus.sequenceFor(app.a).includes(app.h), "true: a stop");
});

await test("a control disabled while it has focus keeps it, and Tab goes on from it", async () => {
  const app = await boot(`App [ width = 500, height = 300, last: boolean = false,
    a: Button [ x = 20, y = 20, label = "Previous" ],
    b: Button [ x = 120, y = 20, label = "Next", disabled = { app.last } ],
    c: Button [ x = 220, y = 20, label = "Book more" ] ]`);
  Focus.focus(app.b); settle();
  app.last = true; settle(); await turns();
  same(Focus.getFocus(), app.b, "focus stays on the disabled control");
  Focus.next(); settle();
  same(Focus.getFocus(), app.c, "Tab goes on to the next stop");
  assert.ok(!Focus.sequenceFor(app.a).includes(app.b), "and the disabled control is not a stop");
});

await test("a view hidden under focus: focus goes where the nearest container says, else stays cleared", async () => {
  const src = (says) => `App [ width = 500, height = 300, showB: boolean = true,
    home: Button [ x = 20, y = 20, label = "Home" ],
    panel: View [ y = 60, width = 400, height = 100, ${says}
        b: Button [ x = 20, label = "Close", visible = { app.showB } ],
        c: Button [ x = 120, label = "After" ] ] ]`;
  let app = await boot(src(`restoresFocusTo = { app.home },`));
  Focus.focus(app.panel.b); settle();
  app.showB = false; settle(); await turns();
  same(Focus.getFocus(), app.home, "to the panel's restoresFocusTo");
  // the program's own move wins
  app = await boot(src(`restoresFocusTo = { app.home },`));
  Focus.focus(app.panel.b); settle();
  app.showB = false; settle(); Focus.focus(app.panel.c); await turns();
  same(Focus.getFocus(), app.panel.c, "a move the program made since stands");
  // nothing says: cleared, and the next Tab starts from the place, as before
  app = await boot(src(``));
  Focus.focus(app.panel.b); settle();
  app.showB = false; settle(); await turns();
  same(Focus.getFocus(), null, "focus stays cleared");
  Focus.next(); settle();
  same(Focus.getFocus(), app.panel.c, "and Tab goes on from where it was");
});

await test("a view removed under focus inside a stop group: focus goes to the group's entry", async () => {
  const app = await boot(`App [ width = 500, height = 300,
    g: View [ focusScope = stop, width = 400, height = 40,
        one: Button [ x = 0, label = "One" ],
        two: Button [ x = 100, label = "Two" ] ],
    z: Button [ y = 100, label = "Elsewhere" ] ]`);
  Focus.focus(app.g.two); settle();
  app.g.two.discard(); settle(); await turns();
  same(Focus.getFocus(), app.g.one, "the group's entry, so the arrows keep working");
});

await test("an overlay's restoresFocusTo is read as it closes, and null keeps the hand-back", async () => {
  const src = `App [ width = 500, height = 300, deleted: boolean = false,
    h: Text [ y = 60, text = "Tasks", focusable = quiet ],
    b: Button [ x = 20, y = 100, label = "Delete" ],
    dlg: Dialog [ title = "Delete it?", restoresFocusTo = { app.deleted ? app.h : null },
        Button [ label = "OK" ] ] ]`;
  let app = await boot(src);
  Focus.focus(app.b); settle();
  app.dlg.show(); settle(); await turns();
  assert.ok(Focus.holds(app.dlg), "focus is in the dialog");
  app.deleted = true; app.dlg.close(); settle(); await turns();
  same(Focus.getFocus(), app.h, "to where it says");
  app = await boot(src);
  Focus.focus(app.b); settle();
  app.dlg.show(); settle(); await turns();
  app.dlg.close(); settle(); await turns();
  same(Focus.getFocus(), app.b, "null: back to what had focus when it opened");
});

summarize("focus-place");
