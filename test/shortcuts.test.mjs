// Shortcuts as declared data (planes.md §9): records { id, key, label } on any
// view, resolved from the focused view outward — through an island into its
// host — the nearest declaration of a key taking it. Headless: the library
// compiled and instantiated in Node, keys fed to the Keys service directly.

import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate } from "../runtime/dist/instantiate.js";
import { settle, provideMeasurer, Focus, Keys } from "../runtime/dist/index.js";
import { approximateMeasurer } from "../compiler/dist/headless.js";
import { linkIslandTenant } from "../runtime/dist/island.js";
import { hostValuesFor } from "../runtime/dist/boundary.js";
import { comboOf, normalizeCombo } from "../runtime/dist/keys.js";

provideMeasurer(approximateMeasurer());

const press = (key, mods = {}) => {
  const e = { key, code: key.length === 1 ? "Key" + key.toUpperCase() : key, shift: false, ctrl: false, alt: false, meta: false, repeat: false, ...mods };
  const took = Keys.keyDown(e);
  Keys.keyUp(e);
  settle();
  return took;
};

async function build(src) {
  const b = await compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  const app = instantiate(b.program);
  settle();
  return app;
}

async function boot(src) {
  Focus.reset();
  const app = await build(src);
  Focus.setRoot(app);
  return app;
}

await test("a key's spelling: glyphs or words, any order, one form", () => {
  assert.equal(normalizeCombo("⌘⇧Z"), "⇧⌘Z");
  assert.equal(normalizeCombo("Cmd+Shift+z"), "⇧⌘Z");
  assert.equal(normalizeCombo("⌥⌘←"), "⌥⌘←");
  assert.equal(comboOf({ key: "z", code: "KeyZ", shift: true, meta: true, ctrl: false, alt: false, repeat: false }), "⇧⌘Z");
});

await test("the nearest declaration of a key takes it; the press goes no further", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    got: string = "",
    outer: Shortcuts [ items = { [ ({ id: "app-save", key: "⌘S", label: "Save" }), ({ id: "app-new", key: "⌘N", label: "New" }) ] },
        picked(id: string) { app.got = id } ],
    pane: View [ width = 200, height = 200,
        mine: Shortcuts [ items = { [ ({ id: "pane-save", key: "⌘S", label: "Save Pane" }) ] },
            picked(id: string) { app.got = id } ],
        f: View [ width = 50, height = 20, focusable = true ] ],
    other: View [ x = 250, width = 50, height = 20, focusable = true ],
    heard: number = 0,
    keys: Keys [ onKeyDown(e: KeyEvent) { if (e.meta) app.heard = app.heard + 1 } ]
    ]`);
  Focus.focus(app.pane.f); settle();
  assert.equal(press("s", { meta: true }), true, "a declared chord is taken");
  assert.equal(app.got, "pane-save", "focus in the pane: the pane's own ⌘S");
  assert.equal(app.heard, 0, "and no Keys member also hears it");
  press("n", { meta: true });
  assert.equal(app.got, "app-new", "a key the pane does not declare: the App's");
  Focus.focus(app.other); settle();
  press("s", { meta: true });
  assert.equal(app.got, "app-save", "focus outside the pane: the App's ⌘S");
  assert.equal(press("q", { meta: true }), false, "an undeclared chord is not taken");
  assert.equal(app.heard, 1, "…and reaches the Keys members as ever");
});

await test("a plain key does not fire in a text field, a command chord does; a disabled one shows but does not fire", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    got: string = "",
    sc: Shortcuts [ items = { [ ({ id: "help", key: "?", label: "Help" }), ({ id: "find", key: "⌘F", label: "Find" }), ({ id: "off", key: "⌘D", label: "Off", enabled: false }) ] },
        picked(id: string) { app.got = app.got + id + ";" } ],
    field: TextInput [ width = 100 ],
    b: View [ x = 200, width = 50, height = 20, focusable = true ]
    ]`);
  app.field.focusable = true; Focus.focus(app.field); settle();
  press("?", { shift: true });
  assert.equal(app.got, "", "typing ? in a field is the field's");
  press("f", { meta: true });
  assert.equal(app.got, "find;", "⌘F works from a field");
  Focus.focus(app.b); settle();
  press("?", { shift: true });
  assert.equal(app.got, "find;help;", "outside a field, ? is the shortcut");
  assert.equal(press("d", { meta: true }), false, "a disabled shortcut does not take the key");
  assert.equal(app.got, "find;help;");
  const listed = Keys.shortcutsInForce().map((r) => r.id + (r.enabled ? "" : "(off)"));
  assert.deepEqual(listed, ["help", "find", "off(off)"], "the panel lists them all, the disabled one marked");
});

await test("a text field keeps its own editing chords: ⌘A, ⌘C/X/V, ⌘Z go to the field, not to a shortcut", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    got: string = "",
    sc: Shortcuts [ items = { [ ({ id: "all", key: "⌘A", label: "Select all rows" }), ({ id: "undo", key: "⌘Z", label: "Undo" }), ({ id: "save", key: "⌘S", label: "Save" }) ] },
        picked(id: string) { app.got = app.got + id + ";" } ],
    field: TextInput [ width = 100 ],
    b: View [ x = 200, width = 50, height = 20, focusable = true ]
    ]`);
  app.field.focusable = true; Focus.focus(app.field); settle();
  assert.equal(press("a", { meta: true }), false, "⌘A in a field is the field's select-all");
  assert.equal(press("z", { meta: true }), false, "⌘Z in a field is the field's undo");
  assert.equal(app.got, "", "neither fired the program's shortcut");
  press("s", { meta: true });
  assert.equal(app.got, "save;", "⌘S, which a field does not use, still fires");
  Focus.focus(app.b); settle();
  press("a", { meta: true }); press("z", { meta: true });
  assert.equal(app.got, "save;all;undo;", "outside a field, ⌘A and ⌘Z are the program's");
});

await test("an open overlay's own shortcuts fire while it holds the keyboard; the page's behind it do not", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    got: string = "",
    open: boolean = false,
    sc: Shortcuts [ items = { [ ({ id: "page-new", key: "N", label: "New" }), ({ id: "page-save", key: "⌘S", label: "Save" }) ] },
        picked(id: string) { app.got = app.got + id + ";" } ],
    sheet: Sheet [ shown = { app.open }, input(v: boolean) { app.open = v },
        entry: View [ width = 200, height = 100,
            keys: Shortcuts [ items = { [ ({ id: "run", key: "R", label: "Run" }), ({ id: "save", key: "⌘↩", label: "Save" }) ] },
                picked(id: string) { app.got = app.got + id + ";" } ],
            field: TextInput [ width = 100, accessibilityLabel = "Note" ],
            b: View [ y = 40, width = 50, height = 20, focusable = true ] ] ]
    ]`);
  app.open = true; settle();
  Focus.focus(app.sheet.entry.b); settle();
  press("r");
  press("Enter", { meta: true, code: "Enter" });
  assert.equal(app.got, "run;save;", "the sheet's own keys are in force inside it");
  press("n"); press("s", { meta: true });
  assert.equal(app.got, "run;save;", "the page's keys behind the sheet stand down");
  assert.deepEqual(Keys.shortcutsInForce().map((r) => r.id), ["run", "save"], "and the panel lists only the sheet's");
  app.sheet.entry.field.focusable = true; Focus.focus(app.sheet.entry.field); settle();
  press("r");
  assert.equal(app.got, "run;save;", "a plain key typed in the sheet's field is the field's");
  app.open = false; settle();
  Focus.focus(app.sc.parent); settle();
  press("n");
  assert.equal(app.got, "run;save;page-new;", "closed, the page's keys are back");
});

await test("nothing on the page fires while an open overlay holds the keyboard", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    got: string = "",
    sc: Shortcuts [ items = { [ ({ id: "save", key: "⌘S", label: "Save" }) ] }, picked(id: string) { app.got = id } ],
    opener: Button [ label = "Open" ],
    menu: Menu [ items = { [ ({ id: "a", label: "A" }) ] } ]
    ]`);
  app.menu.openFor(app.opener); settle();
  press("s", { meta: true });
  assert.equal(app.got, "", "the menu's keys are its own");
  app.menu.close(); settle();
  press("s", { meta: true });
  assert.equal(app.got, "save");
});

await test("a MenuBar's item keys are the program's shortcuts, from anywhere in it", async () => {
  const app = await boot(`App [ width = 600, height = 300,
    got: string = "",
    bar: MenuBar [ menus = { [ ({ id: "file", label: "File", items: [ ({ id: "new", label: "New", key: "⌘N" }), ({ id: "close", label: "Close", key: "⌘W" }) ] }) ] },
        picked(id: string) { app.got = id } ],
    deep: View [ y = 100, inner: View [ f: View [ width = 40, height = 20, focusable = true ] ] ]
    ]`);
  Focus.focus(app.deep.inner.f); settle();
  press("n", { meta: true });
  assert.equal(app.got, "new", "the bar's ⌘N, with focus far from the bar");
  const listed = Keys.shortcutsInForce();
  assert.deepEqual(listed.map((r) => `${r.group}:${r.key}`), ["File:⌘N", "File:⌘W"], "grouped by their menu");
});

await test("a hosted program's focus reaches its host's shortcuts across the island; its own come first", async () => {
  const host = await boot(`App [ width = 800, height = 500,
    got: string = "",
    bar: MenuBar [ menus = { [ ({ id: "file", label: "File", items: [ ({ id: "new", label: "New", key: "⌘N" }), ({ id: "find", label: "Find", key: "⌘F" }) ] }) ] },
        picked(id: string) { app.got = "host:" + id } ],
    w: Window [ x = 100, y = 50, width = 300, height = 200,
        isl: AppIsland [ width = 100%, height = 100% ] ] ]`);
  const tenant = await build(`App [ width = 300, height = 200,
    got: string = "",
    sc: Shortcuts [ title = "Tenant", items = { [ ({ id: "find", key: "⌘F", label: "Find in Tenant" }) ] }, picked(id: string) { app.got = id } ],
    f: View [ width = 40, height = 20, focusable = true ] ]`);
  tenant.$hostValues = hostValuesFor({});
  const unlink = linkIslandTenant(host.w.isl, tenant); settle();
  Focus.focus(tenant.f); settle();
  press("f", { meta: true });
  assert.equal(tenant.got, "find", "the tenant's own ⌘F");
  assert.equal(host.got, "", "…not the host's");
  press("n", { meta: true });
  assert.equal(host.got, "host:new", "⌘N, which the tenant does not declare, is the host's");
  assert.deepEqual(Keys.shortcutsInForce().map((r) => r.label), ["Find in Tenant", "New"], "the panel: the tenant's first, then the host's it does not shadow");
  unlink();
});

summarize("shortcuts");
