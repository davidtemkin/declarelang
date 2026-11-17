// Key bindings (docs/system-design/key-bindings.md): a key walks once from the
// focused view outward, each view's `keyBindings` read layer by layer — use
// site, class, superclasses — then the standard table. Headless: the library
// compiled and instantiated in Node, the focus layer wired as the browser
// wires it, keys fed to the Keys service directly.

import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate } from "../runtime/dist/instantiate.js";
import { settle, provideMeasurer, Focus, Keys, deliverKeys } from "../runtime/dist/index.js";
import { explainKey } from "../runtime/dist/inspect.js";
import { approximateMeasurer } from "../compiler/dist/headless.js";
import { linkIslandTenant } from "../runtime/dist/island.js";
import { hostValuesFor } from "../runtime/dist/boundary.js";

provideMeasurer(approximateMeasurer());
deliverKeys(Keys, Focus);

const press = (key, mods = {}) => {
  const code = key.length === 1 ? (/[a-z]/i.test(key) ? "Key" + key.toUpperCase() : key) : key;
  const e = { key, code, shift: false, ctrl: false, alt: false, meta: false, repeat: false, ...mods };
  const took = Keys.keyDown(e);
  Keys.keyUp(e);
  settle();
  return took;
};

async function compile(src) {
  return compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
}

async function boot(src) {
  Focus.reset();
  const b = await compile(src);
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  const app = instantiate(b.program);
  settle();
  Focus.setRoot(app);
  return app;
}

await test("a class's bindings and a use site's add up: the use site's first, the class's still there", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    got: string = "",
    b: Button [ label = "Go", press() { app.got = app.got + "press;" },
        keyBindings = { [ ({ key: "M", command: "mark" }) ] },
        mark() { app.got = app.got + "mark;" } ] ]`);
  Focus.focus(app.b); settle();
  press("m");
  press(" ", { code: "Space" });
  press("Enter", { code: "Enter" });
  assert.equal(app.got, "mark;press;press;", "the use site's M, and Control's Space and Enter");
});

await test("a nearer layer replaces an inherited key; command: null removes it and the key walks on", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    got: string = "",
    keyBindings = { [ ({ key: "Space", command: "outer" }) ] },
    outer() { app.got = app.got + "outer;" },
    a: Button [ label = "A", press() { app.got = app.got + "press;" },
        keyBindings = { [ ({ key: "Space", command: "mine" }) ] },
        mine() { app.got = app.got + "mine;" } ],
    b: Button [ y = 40, label = "B", press() { app.got = app.got + "pressB;" },
        keyBindings = { [ ({ key: "Space", command: null }) ] } ] ]`);
  Focus.focus(app.a); settle();
  press(" ", { code: "Space" });
  assert.equal(app.got, "mine;", "the use site's Space, not Control's press");
  Focus.focus(app.b); settle();
  press(" ", { code: "Space" });
  assert.equal(app.got, "mine;outer;", "removed here, the key walks on to the App's binding");
});

await test("presentify-3: a focused Slider's arrows are nearer than the App's arrow shortcut", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    got: string = "",
    v: number = 50,
    sc: Shortcuts [ items = { [ ({ id: "next", key: "→", label: "Next slide" }) ] }, picked(id: string) { app.got = app.got + id + ";" } ],
    s: Slider [ width = 200, value = { app.v }, min = 0, max = 100, step = 1, commit(x: number) { app.v = x } ],
    other: View [ y = 60, width = 40, height = 20, focusable = true ] ]`);
  Focus.focus(app.s); settle();
  press("ArrowRight");
  assert.equal(app.v, 51, "the slider steps");
  assert.equal(app.got, "", "the App's arrow doesn't also fire");
  Focus.focus(app.other); settle();
  press("ArrowRight");
  assert.equal(app.got, "next;", "focus elsewhere: the App's arrow");
});

await test("ledger-1: a field that binds Tab gets it; one that doesn't hands Tab on to the next field", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    got: string = "",
    col: View [ layout: SimpleLayout [ axis = y, spacing = 8 ],
        cell: TextInput [ width = 100, accessibilityLabel = "Cell",
            keyBindings = { [ ({ key: "Tab", command: "saveAndNext" }) ] },
            saveAndNext() { app.got = app.got + "saved;"; this.focusNextView() },
            focusNextView() { Focus.next() } ],
        plain: TextInput [ width = 100, accessibilityLabel = "Plain" ],
        last: TextInput [ width = 100, accessibilityLabel = "Last" ] ] ]`);
  Focus.focus(app.col.cell); settle();
  press("Tab", { code: "Tab" });
  assert.equal(app.got, "saved;", "the cell's own Tab ran");
  assert.equal(Focus.getFocus(), app.col.plain, "…and moved on itself");
  press("Tab", { code: "Tab" });
  assert.equal(Focus.getFocus(), app.col.last, "a field that binds nothing: Tab moves on");
});

await test("a field's onKeyDown that hands the rest to super keeps Tab and typing", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    q: string = "x",
    col: View [ layout: SimpleLayout [ axis = y, spacing = 8 ],
        search: TextInput [ width = 100, accessibilityLabel = "Search",
            onKeyDown(e: KeyEvent) {
                if (e.key == "Escape") app.q = ""
                else super.onKeyDown(e)
                } ],
        next: TextInput [ width = 100, accessibilityLabel = "Next" ] ] ]`);
  Focus.focus(app.col.search); settle();
  assert.equal(press("a"), false, "a typed letter is the field's own, not prevented");
  press("Escape", { code: "Escape" });
  assert.equal(app.q, "", "its own Escape");
  press("Tab", { code: "Tab" });
  assert.equal(Focus.getFocus(), app.col.next, "Tab moves on");
});

await test("return false passes the key on; args come before the event; when makes a binding absent", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    got: string = "",
    keyBindings = { [ ({ key: "Escape", command: "closeAll" }) ] },
    closeAll() { app.got = app.got + "close;" },
    p: View [ width = 200, height = 100,
        on: boolean = false,
        keyBindings = { [ ({ key: "Escape", command: "clearAndPass" }),
            ({ key: "ArrowUp", command: "step", args: [-1] }), ({ key: "ArrowDown", command: "step", args: [1] }),
            ({ key: "K", command: "kick", when: "isOn" }) ] },
        clearAndPass() { app.got = app.got + "clear;"; return false },
        step(d: number, e: KeyEvent) { app.got = app.got + "step" + d + e.key + ";" },
        kick() { app.got = app.got + "kick;" },
        isOn() -> boolean { return on },
        f: View [ width = 40, height = 20, focusable = true ] ] ]`);
  Focus.focus(app.p.f); settle();
  press("Escape", { code: "Escape" });
  assert.equal(app.got, "clear;close;", "its own part, then the App's");
  press("ArrowDown");
  assert.equal(app.got, "clear;close;step1ArrowDown;", "args, then the event");
  press("k");
  assert.equal(app.got, "clear;close;step1ArrowDown;", "absent while its when is false");
  app.p.on = true; settle();
  press("k");
  assert.equal(app.got, "clear;close;step1ArrowDown;kick;", "present once it holds");
});

await test("enabled: false stops the key; repeat: false takes a repeat without running", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    got: string = "",
    keyBindings = { [ ({ key: "Ctrl+S", command: "outer" }) ] },
    outer() { app.got = app.got + "outer;" },
    p: View [ width = 200, height = 100,
        keyBindings = { [ ({ key: "Ctrl+S", command: "save", enabled: false }), ({ key: "R", command: "run", repeat: false }) ] },
        save() { app.got = app.got + "save;" },
        run() { app.got = app.got + "run;" },
        f: View [ width = 40, height = 20, focusable = true ] ] ]`);
  Focus.focus(app.p.f); settle();
  assert.equal(press("s", { meta: true }), true, "a disabled binding takes the key, prevented");
  assert.equal(app.got, "", "…and runs nothing, not even the App's");
  press("r");
  press("r", { repeat: true });
  assert.equal(app.got, "run;", "the repeat is taken, not run");
});

await test("Windows spelling: Ctrl is the command key; Mac glyphs mean the same", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    got: string = "",
    keyBindings = { [ ({ key: "Ctrl+Shift+Z", command: "redo" }), ({ key: "⌘K", command: "find" }) ] },
    redo() { app.got = app.got + "redo;" },
    find() { app.got = app.got + "find;" },
    f: View [ width = 40, height = 20, focusable = true ] ]`);
  Focus.focus(app.f); settle();
  press("z", { meta: true, shift: true });
  press("k", { meta: true });
  assert.equal(app.got, "redo;find;");
});

await test("a code binding matches the physical key whatever the layout", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    got: string = "",
    keyBindings = { [ ({ code: "KeyW", command: "forward" }) ] },
    forward() { app.got = app.got + "w;" },
    f: View [ width = 40, height = 20, focusable = true ] ]`);
  Focus.focus(app.f); settle();
  Keys.keyDown({ key: "z", code: "KeyW", shift: false, ctrl: false, alt: false, meta: false, repeat: false }); settle();
  assert.equal(app.got, "w;", "AZERTY's Z sits where QWERTY's W does");
});

await test("past a modal's edge only the App's everywhere bindings are read", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    got: string = "",
    open: boolean = false,
    keyBindings = { [ ({ key: "Ctrl+S", command: "save" }), ({ key: "Ctrl+Q", command: "quit", everywhere: true }) ] },
    save() { app.got = app.got + "save;" },
    quit() { app.got = app.got + "quit;" },
    sheet: Sheet [ shown = { app.open }, commit(v: boolean) { app.open = v },
        b: View [ width = 50, height = 20, focusable = true ] ],
    f: View [ y = 200, width = 40, height = 20, focusable = true ] ]`);
  app.open = true; settle();
  Focus.focus(app.sheet.b); settle();
  press("s", { meta: true });
  press("q", { meta: true });
  assert.equal(app.got, "quit;", "the page's Ctrl+S doesn't save behind the sheet; an everywhere binding does reach");
  app.open = false; settle();
  Focus.focus(app.f); settle();
  press("s", { meta: true });
  assert.equal(app.got, "quit;save;", "closed, the page's own");
});

await test("Escape then Tab: a view that binds the sequence takes it", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    got: string = "",
    term: View [ width = 200, height = 100, focusable = true,
        keyBindings = { [ ({ key: "Escape Tab", command: "literal" }) ] },
        literal() { app.got = app.got + "literal;" } ],
    other: View [ y = 150, width = 40, height = 20, focusable = true ] ]`);
  Focus.focus(app.term); settle();
  press("Escape", { code: "Escape" });
  press("Tab", { code: "Tab" });
  assert.equal(app.got, "literal;", "the terminal's own sequence");
  assert.equal(Focus.getFocus(), app.term, "focus stays");
  press("Tab", { code: "Tab" });
  assert.equal(Focus.getFocus(), app.other, "a plain Tab still moves on");
});

await test("ledger-2: in an editor entered inside a stop, what the row holds binds Escape before the row is left", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    got: string = "",
    list: View [ width = 300, height = 200, focusScope = stop, focusable = true,
        row1: View [ width = 300, height = 40,
            editor: View [ width = 200, height = 30,
                keyBindings = { [ ({ key: "Escape", command: "cancel" }) ] },
                cancel() { app.got = app.got + "cancel;" },
                f: View [ width = 100, height = 20, focusable = true ] ] ],
        row2: View [ y = 50, width = 300, height = 40,
            g: View [ width = 100, height = 20, focusable = true ] ] ] ]`);
  Focus.focus(app.list.row1.editor.f); settle();
  press("Escape", { code: "Escape" });
  assert.equal(app.got, "cancel;", "the editor's own Escape");
  assert.equal(Focus.getFocus(), app.list.row1.editor.f, "it didn't also leave the row");
  Focus.focus(app.list.row2.g); settle();
  press("Escape", { code: "Escape" });
  assert.equal(Focus.getFocus(), app.list, "nothing in the row binds it: Escape leaves the row for the list");
});

await test("ledger-3: the stop's own Escape binding comes before leaving the row; a Control doesn't press for a key from inside it", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    got: string = "",
    list: View [ width = 300, height = 200, focusScope = stop, focusable = true,
        keyBindings = { [ ({ key: "Escape", command: "cancel" }) ] },
        cancel() { app.got = app.got + "cancel;" },
        row1: Control [ width = 300, height = 40, press() { app.got = app.got + "press;" },
            f: TextInput [ width = 100, accessibilityLabel = "Cell" ] ] ] ]`);
  Focus.focus(app.list.row1.f); settle();
  press("Enter", { code: "Enter" });
  assert.equal(app.got, "", "Enter from the field doesn't press the row around it");
  press("Escape", { code: "Escape" });
  assert.equal(app.got, "cancel;", "the list's own Escape");
});

await test("ledger-5: a Table or DataGrid with the focus hands on the keys it doesn't use — Escape reaches the grid's own binding and the App's", async () => {
  const app = await boot(`App [ width = 400, height = 400, got: string = "",
    keyBindings = { [ ({ key: "Escape", command: "outer" }) ] },
    outer() { app.got = app.got + "app;" },
    data: Dataset { { "rows": [ { "id": "a", "t": "Alpha" }, { "id": "b", "t": "Beta" } ] } },
    t: Table [ width = 300, height = 100, accessibilityLabel = "Things", datapath = { app.data.value },
        TableRow [ datapath = :rows[], height = 30, Text [ text = { :t } ] ] ],
    g: DataGrid [ y = 120, width = 300, height = 200, accessibilityLabel = "Grid",
        items = { app.data.value.rows },
        columns = { [ { id: "t", title: "T", width: 200 } ] },
        keyBindings = { [ ({ key: "Escape", command: "close" }) ] },
        close() { app.got = app.got + "grid;" } ] ]`);
  Focus.focus(app.t); settle();
  press("ArrowDown", { code: "ArrowDown" });
  assert.equal(app.t.activeIndex, 0, "the table keeps its own arrows");
  press("Escape", { code: "Escape" });
  assert.equal(app.got, "app;", "the Table hands Escape on to the App's binding");
  Focus.focus(app.g); settle();
  press("ArrowDown", { code: "ArrowDown" });
  press("Escape", { code: "Escape" });
  assert.equal(app.got, "app;grid;", "the DataGrid's own binding hears Escape, nearest first");
  app.g.inHeader = true; settle();
  press("Escape", { code: "Escape" });
  assert.equal(app.got, "app;grid;grid;", "from its header too");
});

await test("ledger-4: a Combobox's Return that picks goes no further; with a choice made it goes on to the row", async () => {
  const app = await boot(`App [ width = 500, height = 300, saved: number = 0, cat: string = "",
    row: View [ width = 400, height = 40,
        keyBindings = { [ ({ key: "Enter", command: "save" }) ] },
        save() { app.saved = app.saved + 1 },
        c: Combobox [ width = 200, accessibilityLabel = "Category", items = ["Other", "Shipping"],
            value = { app.cat == "" ? null : app.cat }, commit(v: object) { app.cat = "" + v } ] ] ]`);
  const c = app.row.c;
  Focus.focus(c.entry); settle();
  c.open(); c.query = "Ship"; c.filtering = true; c.syncList(); settle();
  c.entry.onEnter(); press("Enter", { code: "Enter" });
  assert.equal(app.cat, "Shipping", "Return picked");
  assert.equal(app.saved, 0, "and went no further");
  c.entry.onEnter(); press("Enter", { code: "Enter" });
  assert.equal(app.saved, 1, "chosen, list down: Return goes on to the row");
});

await test("ledger-4: a Popover is not modal — Tab past its last control closes it and goes on past its opener", async () => {
  const app = await boot(`App [ width = 900, height = 500,
    opener: Button [ x = 120, y = 20, label = "Category", onClick() { app.pop.showFor(this) } ],
    after: Button [ x = 260, y = 20, label = "After" ],
    pop: Popover [ col: View [ layout: SimpleLayout [ axis = y ], a: Button [ label = "One" ] ] ] ]`);
  assert.notEqual(app.pop.focusScope, "modal", "never a modal scope");
  Focus.focus(app.opener); settle();
  app.pop.showFor(app.opener); settle();
  Focus.focus(app.pop.col.a); settle();
  press("Tab", { code: "Tab" });
  await new Promise((r) => setTimeout(r, 20)); settle();
  assert.equal(app.pop.shown, false, "Tab out closed it");
  assert.ok(Focus.getFocus() === app.after, "and went on past the opener");
});

await test("a one-line field's Enter in a Dialog presses the default; a focused button presses itself", async () => {
  const app = await boot(`App [ width = 500, height = 400,
    got: string = "",
    dlg: Dialog [ title = "Rename", buttons = { [ ({ id: "cancel", label: "Cancel", cancel: true }), ({ id: "ok", label: "OK", default: true }) ] },
        picked(id: string) { app.got = app.got + id + ";" },
        name: TextInput [ width = 200, accessibilityLabel = "Name" ] ] ]`);
  app.dlg.show(); settle();
  Focus.focus(app.dlg.name); settle();
  app.dlg.name.onEnter();   // the platform's field calls it on Return, before the walk
  press("Enter", { code: "Enter" });
  await new Promise((r) => setTimeout(r, 30)); settle();
  assert.equal(app.got, "ok;", "the field's Enter reaches the Dialog's default");
});

await test("7guis-2: a field's onEnter that moves focus to the view around it — Return is one action, not the grid's too", async () => {
  const app = await boot(`App [ width = 400, height = 200,
    grid: View [ width = 300, height = 120, focusable = true,
        gridEnters: number = 0, fieldEnters: number = 0,
        startEdit() { gridEnters = gridEnters + 1 },
        keyBindings = { [ ({ key: "Enter", command: "startEdit" }) ] },
        f: TextInput [ width = 200, accessibilityLabel = "Formula", value = "", commit(v: string) { },
            onEnter() { parent.fieldEnters = parent.fieldEnters + 1; afterSettle(() => Focus.focus(parent)) } ] ] ]`);
  const g = app.grid;
  Focus.focus(g.f); settle();
  // the platform's field handles Return (onEnter) before the key reaches the
  // walk, and the settle between moves focus: the key arrived at the field
  const at = Focus.getFocus();
  g.f.onEnter(); settle();
  assert.ok(Focus.getFocus() === g, "onEnter moved focus to the grid");
  const e = { key: "Enter", code: "Enter", shift: false, ctrl: false, alt: false, meta: false, repeat: false };
  Keys.keyDown(e, at); Keys.keyUp(e); settle();
  assert.equal(g.fieldEnters, 1, "the field's onEnter ran");
  assert.equal(g.gridEnters, 0, "and Return went no further: the grid's Enter didn't run");
  press("Enter", { code: "Enter" });
  assert.equal(g.gridEnters, 1, "the next Return, arriving at the grid, is the grid's");
});

await test("7guis-3: a key a handler answers is consumed — it doesn't also type into the field focus moved to", async () => {
  const app = await boot(`App [ width = 400, height = 200, editing: boolean = false, draft: string = "",
    grid: View [ width = 300, height = 60, focusable = true,
        onKeyDown(e: KeyEvent) {
            if (e.key.length == 1) { app.draft = e.key; app.editing = true }
            else super.onKeyDown(e)
            },
        editor: TextInput [ exists = { app.editing }, width = 200, accessibilityLabel = "Cell", value <-> app.draft,
            onInit() { afterSettle(() => Focus.focus(this)) } ] ],
    a: TextInput [ y = 100, width = 120, accessibilityLabel = "A",
        onKeyDown(e: KeyEvent) { if (e.key == ",") Focus.focus(app.b); else super.onKeyDown(e) } ],
    b: TextInput [ y = 140, width = 120, accessibilityLabel = "B" ] ]`);
  Focus.focus(app.grid); settle();
  assert.equal(press("5", { code: "Digit5" }), true, "the grid's handler answered 5: its default (typing where focus went) is prevented");
  assert.equal(app.draft, "5", "and the handler passed it on itself");
  assert.ok(Focus.getFocus() === app.grid.editor, "the editor took focus");
  assert.equal(press("6", { code: "Digit6" }), false, "in the editor, a key is typing again");
  // a field's handler: its own typing stays, but only in that field
  Focus.focus(app.a); settle();
  const e = { key: ",", code: "Comma", shift: false, ctrl: false, alt: false, meta: false, repeat: false };
  assert.equal(Keys.keyDown(e), false, "a field's answered key isn't prevented outright");
  assert.ok(Keys.typesOnlyIn === app.a, "its text may land only in the field that answered it");
  Keys.keyUp(e); settle();
  assert.ok(Focus.getFocus() === app.b, "focus went on to B");
  const y = { ...e, key: "y", code: "KeyY" };
  Keys.keyDown(y); Keys.keyUp(y);
  assert.equal(Keys.typesOnlyIn, null, "a key handed on (super) types wherever focus is");
});

await test("a menu row's command walks from where the person was working, not from the menu", async () => {
  const app = await boot(`App [ width = 500, height = 400,
    got: string = "",
    opener: Button [ x = 300, label = "Edit" ],
    menu: Menu [ items = { [ ({ id: "b", label: "Bold", command: "bold" }), ({ id: "x", label: "Nothing", command: "nobody" }), ({ id: "p", label: "Plain" }) ] },
        picked(id: string) { app.got = app.got + "picked:" + id + ";" } ],
    doc: View [ y = 100, width = 200, height = 100, focusable = true,
        keyBindings = { [ ({ key: "Ctrl+B", command: "bold" }) ] },
        bold() { app.got = app.got + "bold;" } ] ]`);
  Focus.focus(app.doc); settle();
  app.menu.showFor(app.opener); settle();
  const rows = app.menu._panel.body.childViews;
  assert.equal(rows[0].enabled, true, "Bold: the document answers it");
  assert.equal(rows[1].enabled, false, "a command no view answers is greyed");
  rows[0].pickSelf(); settle();
  assert.equal(app.got, "bold;", "the document's bold ran");
  assert.equal(app.menu.shown, false, "the menu closed");
  app.menu.showFor(app.opener); settle();
  app.menu._panel.body.childViews[2].pickSelf();
  await new Promise((r) => setTimeout(r, 20)); settle();
  assert.equal(app.got, "bold;picked:p;", "a row with no command is picked(id), as ever");
});

await test("a MenuBar item's key runs its command from the focus; Copy's key stays the platform's", async () => {
  const app = await boot(`App [ width = 600, height = 300,
    got: string = "",
    bar: MenuBar [ menus = { [ ({ id: "fmt", label: "Format", items: [ ({ id: "b", label: "Bold", key: "Ctrl+B", command: "bold" }),
        ({ id: "c", label: "Copy", key: "Ctrl+C", command: "copy" }) ] }) ] } ],
    doc: View [ y = 100, width = 200, height = 100, focusable = true,
        keyBindings = { [ ({ command: "bold" }) ] },
        bold() { app.got = app.got + "bold;" } ] ]`);
  Focus.focus(app.doc); settle();
  assert.equal(press("b", { meta: true }), true, "taken");
  assert.equal(app.got, "bold;", "the document's keyless bold answers the bar's key");
  assert.equal(press("c", { meta: true }), false, "Ctrl+C is left to the platform, so its copy event fires");
});

await test("a command button runs its command on the focus it doesn't take", async () => {
  const app = await boot(`App [ width = 500, height = 300,
    got: string = "",
    doc: View [ width = 200, height = 100, focusable = true,
        keyBindings = { [ ({ command: "bold" }) ] },
        bold() { app.got = app.got + "bold;" } ],
    b: Button [ y = 150, label = "B", command = "bold" ] ]`);
  Focus.focus(app.doc); settle();
  app.b.onPointerDown({ x: 2, y: 2 }); app.b.onClick(); settle();
  assert.equal(app.got, "bold;");
  assert.equal(Focus.getFocus(), app.doc, "the document keeps the focus");
});

await test("a context menu's command acts on the view it was opened on", async () => {
  const app = await boot(`App [ width = 500, height = 300,
    got: string = "",
    rowMenu: Menu [ items = { [ ({ id: "d", label: "Delete", command: "remove" }) ] } ],
    a: View [ width = 100, height = 30, focusable = true, keyBindings = { [ ({ command: "remove" }) ] }, remove() { app.got = app.got + "a;" } ],
    b: View [ y = 50, width = 100, height = 30, focusable = true, keyBindings = { [ ({ command: "remove" }) ] }, remove() { app.got = app.got + "b;" } ] ]`);
  Focus.focus(app.a); settle();
  app.rowMenu.showAt(app.b, { x: 5, y: 5 }); settle();
  app.rowMenu._panel.body.childViews[0].pickSelf(); settle();
  assert.equal(app.got, "b;", "the row it was opened on, not the focus");
});

await test("a menu's Copy reaches onClipboardCopy from the view the person was in", async () => {
  const app = await boot(`App [ width = 500, height = 300,
    got: string = "",
    opener: Button [ x = 300, label = "Edit" ],
    menu: Menu [ items = { [ ({ id: "c", label: "Copy", command: "copy" }) ] } ],
    canvas: View [ y = 100, width = 200, height = 100, focusable = true,
        onClipboardCopy(e: ClipboardEvent) { e.put("shape"); app.got = app.got + "copied;" } ] ]`);
  Focus.focus(app.canvas); settle();
  app.menu.showFor(app.opener); settle();
  assert.equal(app.menu._panel.body.childViews[0].enabled, true, "Copy is there");
  app.menu._panel.body.childViews[0].pickSelf(); settle();
  assert.equal(app.got, "copied;");
});

await test("the compiler reads a written key table: a command with no method, an unmatchable key, the clipboard's keys, a standard key on the App", async () => {
  const codes = async (src) => (await compile(src)).warnings.map((w) => String(w.code ?? "").replace("DECLARE", "")).filter((c) => /^40(3[7-9]|40)$/.test(c));
  assert.deepEqual(await codes(`App [ v: View [ keyBindings = { [ ({ key: "Ctrl+S", command: "sav" }) ] }, save() { } ] ]`), ["4037"], "a misspelled command");
  assert.deepEqual(await codes(`App [ v: View [ keyBindings = { [ ({ key: "Ctrl+Shift+]", command: "go" }) ] }, go() { } ] ]`), ["4038"], "a symbol spelled with Shift");
  assert.deepEqual(await codes(`App [ v: View [ keyBindings = { [ ({ key: "Ctrl+K Ctrl+S", command: "go" }) ] }, go() { } ] ]`), ["4038"], "a sequence that doesn't start with Escape");
  assert.deepEqual(await codes(`App [ v: View [ keyBindings = { [ ({ key: "Ctrl+C", command: "dup" }) ] }, dup() { } ] ]`), ["4039"], "the clipboard's key taken");
  assert.deepEqual(await codes(`App [ keyBindings = { [ ({ key: "Tab", command: "go" }) ] }, go() { } ]`), ["4040"], "Tab on the App without everywhere");
  assert.deepEqual(await codes(`App [ keyBindings = { [ ({ key: "Tab", command: "go", everywhere: true }), ({ key: "Ctrl+Shift+Z", command: "go" }), ({ key: "Escape Tab", command: "go" }) ] }, go() { } ]`), [], "and none for what is right");
});

await test("the hold panel lists labelled bindings with the shortcuts, nearest first", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    keyBindings = { [ ({ key: "Ctrl+S", command: "save", label: "Save" }), ({ key: "Ctrl+P", command: "print", label: "Print" }) ] },
    save() { }, print() { },
    pane: View [ width = 200, height = 100,
        keyBindings = { [ ({ key: "Ctrl+S", command: "keep", label: "Keep draft", group: "Editor" }), ({ key: "Space", command: "keep" }) ] },
        keep() { },
        f: View [ width = 40, height = 20, focusable = true ] ] ]`);
  Focus.focus(app.pane.f); settle();
  assert.deepEqual(Keys.shortcutsInForce().map((r) => `${r.group}:${r.label}`), ["Editor:Keep draft", ":Print"], "the pane's Ctrl+S hides the App's; an unlabelled binding isn't listed");
});

await test("from a program in an island, a chord reaches the host's bindings; a plain key stays the program's", async () => {
  const host = await boot(`App [ width = 800, height = 500,
    got: string = "",
    keyBindings = { [ ({ key: "Ctrl+W", command: "closeWin" }), ({ key: "ArrowRight", command: "nextIcon" }) ] },
    closeWin() { app.got = app.got + "close;" },
    nextIcon() { app.got = app.got + "icon;" },
    w: Window [ x = 100, y = 50, width = 300, height = 200,
        isl: AppIsland [ width = 100%, height = 100% ] ] ]`);
  const b = await compile(`App [ width = 300, height = 200, f: View [ width = 40, height = 20, focusable = true ] ]`);
  const tenant = instantiate(b.program); settle();
  tenant.$hostValues = hostValuesFor({});
  const unlink = linkIslandTenant(host.w.isl, tenant); settle();
  Focus.focus(tenant.f); settle();
  press("w", { meta: true });
  press("ArrowRight");
  assert.equal(host.got, "close;", "the host's Ctrl+W, not its arrow");
  unlink();
});

await test("DECLARE4031 covers every view\'s onKeyDown that hands nothing on; takesAllKeys says it means to", async () => {
  const warned = async (src) => (await compile(src)).warnings.filter((w) => /4031/.test(w.code ?? w.message)).length;
  assert.equal(await warned(`App [ g: View [ focusable = true, onKeyDown(e: KeyEvent) { if (e.key == "x") app.width = 1 } ] ]`), 1, "a plain view that swallows Tab");
  assert.equal(await warned(`App [ g: View [ focusable = true, onKeyDown(e: KeyEvent) { if (e.key == "x") app.width = 1; else super.onKeyDown(e) } ] ]`), 0, "handing the rest on");
  assert.equal(await warned(`App [ g: View [ focusable = true, takesAllKeys = true, onKeyDown(e: KeyEvent) { if (e.key == "x") app.width = 1 } ] ]`), 0, "a game that means every key");
});

// ── DataGrid: select first, then type ─────────────────────────────────────
// The active cell of a text column holds the keyboard in its field, its text
// selected, so typed text — a letter, an accent, an input method's word —
// arrives natively and opens the edit. Keys an input method is composing are
// the method's; a chord is never text.
const GRID = `App [ width = 500, height = 300,
    data: Dataset { { "rows": [ { "id": "a", "t": "One" }, { "id": "b", "t": "Two" } ] } },
    g: DataGrid [ width = 400, height = 200, accessibilityLabel = "Grid",
        items = { app.data.value.rows },
        columns = { [ { id: "t", title: "Title", width: 240, edit: true } ] } ] ]`;
const later = async () => { for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 20)); settle(); } };
const gridOn = async () => {
  const app = await boot(GRID);
  Focus.focus(app.g); settle();
  press("ArrowDown", { code: "ArrowDown" });
  await later();
  assert.equal(app.g.activeIndex, 0, "the first row is active");
  assert.equal(Focus.getFocus()?.accessibilityLabel, "Title", "the active cell's field holds the keyboard");
  assert.equal(app.g.editing, false, "selected, not editing");
  return app;
};

await test("DataGrid: a selected text cell's field holds the keyboard; composing keys and chords open nothing", async () => {
  const app = await gridOn();
  press("n", { code: "KeyN", isComposing: true });
  press("é", { code: "KeyE", keyCode: 229 });
  press("s", { code: "KeyS", meta: true });
  press("s", { code: "KeyS", ctrl: true });
  await later();
  assert.equal(app.data.value.rows[0].t, "One", "nothing written");
  assert.equal(app.g.editing, false, "no edit opened");
});

await test("DataGrid: text arriving in the selected cell opens the edit with it", async () => {
  const app = await gridOn();
  Focus.getFocus()._typed("å");   // what the native field reports when text lands
  await later();
  assert.equal(app.data.value.rows[0].t, "å", "the text replaced the cell's");
  assert.equal(app.g.editing, true, "and the edit is open");
});

await test("DataGrid: arrows move the selection from a selected cell; Enter enters it", async () => {
  const app = await gridOn();
  press("ArrowDown", { code: "ArrowDown" });
  await later();
  assert.equal(app.g.activeIndex, 1, "ArrowDown moved to the next row");
  assert.equal(Focus.getFocus()?.accessibilityLabel, "Title", "whose field holds the keyboard");
  press("Enter", { code: "Enter" });
  await later();
  assert.equal(app.g.editing, true, "Enter entered the cell");
});

await test("DataGrid: the Return that commits an input method's composition stays in the field", async () => {
  const app = await gridOn();
  press("F2", { code: "F2" });
  await later();
  const ed = Focus.getFocus();
  assert.equal(app.g.editing, true, "F2 entered the cell");
  press("Enter", { code: "Enter", isComposing: true });
  await later();
  assert.ok(Focus.getFocus() === ed && app.g.editing, "a composing Return moves nothing");
  press("Enter", { code: "Enter" });
  await later();
  assert.equal(app.g.editing, false, "a plain Return ends the edit");
  assert.equal(app.g.activeIndex, 1, "…and moves a row down");
});

await test("DataGrid: Tab leaves an open edit a cell along — the grid's own editor and one of your own", async () => {
  const app = await boot(`
  class NoteEdit extends View [ width = 100%, height = 100%,
    f: TextInput [ width = 100%, accessibilityLabel = "Note edit", value = { "" + :n }, commit(v: string) { :n = v } ] ]
  App [ width = 600, height = 300,
    data: Dataset { { "rows": [ { "id": "a", "t": "One", "n": "x" }, { "id": "b", "t": "Two", "n": "y" } ] } },
    g: DataGrid [ width = 500, height = 200, accessibilityLabel = "Grid",
        items = { app.data.value.rows },
        columns = { [ { id: "t", title: "Title", width: 200, edit: true },
                      { id: "n", title: "Note", width: 200, editor: "NoteEdit" } ] } ] ]`);
  Focus.focus(app.g); settle();
  press("ArrowDown", { code: "ArrowDown" });
  await later();
  press("F2", { code: "F2" });
  await later();
  assert.equal(app.g.editing, true, "F2 entered the text cell");
  press("Tab", { code: "Tab" });
  await later();
  assert.deepEqual([app.g.activeIndex, app.g.activeCol, app.g.editing], [0, 1, false], "Tab: the next cell, the edit ended");
  press("Enter", { code: "Enter" });
  await later();
  assert.equal(app.g.editing, true, "Enter entered the cell of your own editor");
  assert.equal(Focus.getFocus()?.accessibilityLabel, "Note edit", "its first control holds the keyboard");
  press("Tab", { code: "Tab" });
  await later();
  assert.deepEqual([app.g.activeIndex, app.g.activeCol, app.g.editing], [1, 0, false], "Tab past the last column: the next row's first cell");
  press("Enter", { code: "Enter" });
  await later();
  press("Tab", { code: "Tab", shift: true });
  await later();
  assert.deepEqual([app.g.activeIndex, app.g.activeCol, app.g.editing], [0, 1, false], "Shift-Tab: back across the rows");
});

await test("explainKey says, before the press, who would take a key: a scroller around the focused view takes Space from the App's binding, until the view binds it (the Pagemap upgrade)", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    got: string = "",
    keyBindings = { [ ({ key: "Space", command: "read" }) ] },
    read() { app.got = "read" },
    map: View [ width = 400, height = 200, scrolls = y,
        sheet: View [ width = 400, height = 1000,
            tile: View [ width = 100, height = 60, focusable = true, accessibilityLabel = "Page",
                own: boolean = false,
                keyBindings = { [ ({ key: "Space", command: "here", when: "mine" }) ] },
                mine() -> boolean { return own },
                here() { app.got = "here" } ] ] ] ]`);
  Focus.focus(app.map.sheet.tile); settle();
  let r = explainKey("Space");
  assert.equal(r.focus, "app.map.sheet.tile");
  assert.equal(r.takenBy, "app.map", JSON.stringify(r, null, 1));
  assert.ok(r.steps.some((s) => s.path === "app.map.sheet.tile" && /when is false/.test(s.says)), "the tile's own binding, absent now, is named");
  assert.ok(r.steps.some((s) => s.path === "app.map" && /scroller/.test(s.says) && s.takes === "yes"));
  assert.equal(app.got, "", "explaining ran nothing");
  assert.equal(app.map.scrollY, 0, "…and scrolled nothing");
  press(" ", { code: "Space" });
  assert.ok(app.map.scrollY > 0 && app.got === "", "the press does what was said: the map scrolls");
  // at the scroller's end it passes Space on, to the App's binding
  app.map.scrollTo(800); settle();
  r = explainKey("Space");
  assert.ok(r.steps.some((s) => s.path === "app.map" && /edge/.test(s.says)));
  assert.ok(r.steps.some((s) => s.path === "app" && /read\(\)/.test(s.says) && s.takes === "maybe"), JSON.stringify(r.steps));
  // the tile binds Space itself: it is the tile's
  app.map.sheet.tile.own = true; settle();
  r = explainKey("Space");
  assert.ok(r.steps[0].path === "app.map.sheet.tile" && /here\(\)/.test(r.steps[0].says), JSON.stringify(r.steps));
  assert.match(explainKey("").error, /not a key/);
  assert.match(explainKey("⌘S").key, /S$/);
});

summarize("key-bindings");
