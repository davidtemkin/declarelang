// The focus ring and focus reveal against pinned chrome and turned controls
// (planes.md §14; my-apps/focus-stress is the browser page these came from):
// Tab reveals a control clear of a scroller's pinned bars; the ring over the
// scrolled content stacks beneath them; a turned control's geometry carries its
// turn; a second Tab flies the ring rather than landing it. Headless.

import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate } from "../runtime/dist/instantiate.js";
import { settle, provideMeasurer, Focus, Keys, deliverKeys } from "../runtime/dist/index.js";
import { approximateMeasurer } from "../compiler/dist/headless.js";

provideMeasurer(approximateMeasurer());

async function boot(src) {
  const b = await compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  Focus.reset();
  const app = instantiate(b.program);
  settle();
  Focus.setRoot(app);
  return app;
}

const same = (a, b, msg) => assert.ok(a === b, msg);
const stopAt = (want) => { for (let i = 0; i < 20 && Focus.getFocus() !== want; i++) { Focus.next(); settle(); } };

await test("Tab reveals a control clear of the page's pinned bars, both ways", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    page: View [ width = 400, height = 1600,
        a: Button [ y = 80, label = "A" ],
        b: Button [ y = 700, label = "B" ],
        c: Button [ y = 1400, label = "C" ] ],
    bar: View [ ignoreScroll = true, width = 400, height = 50, fill = white ],
    foot: View [ ignoreScroll = true, y = 260, width = 400, height = 40, fill = white ] ]`);
  for (const v of [app.page.b, app.page.c]) {
    stopAt(v);
    const top = v.y - app.scrollY;
    assert.ok(top + v.height <= 260, `${v.label} lands above the bottom bar (bottom ${top + v.height})`);
    assert.ok(top >= 50, `${v.label} is not under the top bar (top ${top})`);
  }
  Focus.prev(); settle();
  const b = app.page.b, top = b.y - app.scrollY;
  assert.ok(top >= 50 && top + b.height <= 260, `Shift-Tab back to B lands it between the bars (top ${top})`);
});

await test("in a pane, a reveal lands below the pane's pinned header; the header's own control scrolls nothing", async () => {
  const app = await boot(`App [ width = 400, height = 400,
    pane: View [ width = 300, height = 150, scrolls = y,
        body: View [ width = 300, height = 700,
            one: Button [ y = 40, label = "One" ],
            two: Button [ y = 500, label = "Two" ] ],
        head: View [ ignoreScroll = true, width = 300, height = 36, fill = white,
            hb: Button [ label = "Head" ] ] ] ]`);
  stopAt(app.pane.body.two);
  stopAt(app.pane.body.one);
  const top = app.pane.body.one.y - app.pane.scrollY;
  assert.ok(top >= 36, `One is not under the header (top ${top})`);
  stopAt(app.pane.body.two);
  let g = null;
  const off = Focus.onGeometry((x) => { g = x; });
  stopAt(app.pane.head.hb);
  off();
  assert.ok(g !== null && g.view === app.pane.head.hb && g.scroller !== app.pane,
    "the header's button does not ride the pane it is pinned in (its ring would sit in the scrolled content, under the header)");
  assert.ok(Math.abs(g.homeY - g.y) < 1e-6, `it is homed where it is seen (homeY ${g.homeY}, y ${g.y})`);
  const s = app.pane.scrollY;
  Focus.prev(); settle(); Focus.next(); settle();
  assert.equal(app.pane.scrollY, s, "focusing the pinned header's button moves nothing");
});

await test("a turned control's geometry carries its turn and its own size", async () => {
  const app = await boot(`App [ width = 600, height = 400,
    w: Window [ x = 100, y = 60, width = 200, height = 120, rotation = 5, cornerRadius = 8 ] ]`);
  let g = null;
  const off = Focus.onGeometry((x) => { g = x; });
  Focus.focus(app.w); settle();
  off();
  assert.ok(g !== null && Math.abs(g.homeRot - 5) < 1e-6, `homeRot is the window's turn (${g?.homeRot})`);
  assert.ok(Math.abs(g.homeW - 200) < 1e-6 && Math.abs(g.homeH - 120) < 1e-6, "homeW/homeH are its own size, not its upright bounds");
  assert.ok(Math.abs(g.w - 200) > 1, "while w/h stay the root-space bounds");
});

await test("the ring over scrolled content stacks beneath the page's pinned bar, and a second Tab flies", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    page: View [ width = 400, height = 900,
        a: Button [ y = 80, label = "A" ],
        b: Button [ x = 200, y = 80, label = "B" ] ],
    bar: View [ ignoreScroll = true, width = 400, height = 50, fill = white,
        hb: Button [ x = 300, y = 6, label = "Bar" ] ] ]`);
  stopAt(app.page.a);
  const ring = app.childViews.find((c) => "_trad" in c);
  assert.ok(ring, "the ring arrived with the controls");
  const kids = () => app.childViews;
  assert.ok(kids().indexOf(ring) < kids().indexOf(app.bar), "ring for a page control paints beneath the pinned bar");
  Focus.next(); settle();
  assert.ok(Focus.getFocus() === app.page.b);
  assert.ok(Math.abs(ring._tx - ring.x) > 50, `the ring is headed for B, not landed on it (x ${ring.x}, tx ${ring._tx})`);
  stopAt(app.bar.hb);
  assert.ok(kids().indexOf(ring) > kids().indexOf(app.bar), "ring for the bar's own control paints above it");
});

await test("focus moved by an arrow's handler is keyboard focus: the ring stays on, and flies", async () => {
  const app = await boot(`App [ width = 500, height = 200, sel: string = "a",
    seg: Segmented [ x = 20, y = 20, value = { app.sel }, input(v: any) { app.sel = v },
        choices = { [ ({ id: "a", label: "A" }), ({ id: "b", label: "B" }), ({ id: "c", label: "C" }) ] } ],
    after: Button [ x = 20, y = 100, label = "After" ] ]`);
  deliverKeys(Keys, Focus);
  const segs = app.seg.segs();
  stopAt(segs[0]);
  assert.ok(Focus.byKeyboard(), "Tab landed by keyboard");
  const ring = app.childViews.find((c) => "_trad" in c);
  const key = (k) => ({ code: k, key: k, shift: false, ctrl: false, alt: false, meta: false, repeat: false });
  Keys.keyDown(key("ArrowRight")); settle(); Keys.keyUp(key("ArrowRight"));
  assert.equal(Focus.getFocus(), segs[1], "the arrow roved to the next segment");
  assert.ok(Focus.byKeyboard(), "and the move kept keyboard modality");
  assert.ok(ring.shown, "so the ring stays shown");
  assert.ok(Math.abs(ring._tx - ring.x) > 10, `and flies there (x ${ring.x}, tx ${ring._tx})`);
  Keys.keyDown(key("ArrowRight")); settle(); Keys.keyUp(key("ArrowRight"));
  Keys.keyDown(key("ArrowRight")); settle(); Keys.keyUp(key("ArrowRight"));
  assert.equal(Focus.getFocus(), segs[0], "past the last segment the arrow wraps to the first");
  Keys.keyDown(key("ArrowLeft")); settle(); Keys.keyUp(key("ArrowLeft"));
  assert.equal(Focus.getFocus(), segs[2], "and back from the first to the last");
  assert.equal(app.sel, "a", "roving selects nothing");
  Focus.focus(app.after); settle();
  assert.ok(Focus.byKeyboard(), "focus moved by code after keyboard use is keyboard focus (the web's rule)");
  Focus.pressAt(app); settle();
  Focus.focus(app.after); settle();
  assert.ok(!Focus.byKeyboard(), "after a press, focus moved by code is not");
});

await test("F6 moves focus to the next region, and Shift-F6 back", async () => {
  const app = await boot(`App [ width = 600, height = 300,
    w1: View [ focusScope = region, x = 10, y = 10, width = 200, height = 100, a: Button [ label = "A" ] ],
    w2: View [ focusScope = region, x = 260, y = 10, width = 200, height = 100, b: Button [ label = "B" ] ] ]`);
  const key = (k, mods = {}) => ({ code: k, key: k, shift: false, ctrl: false, alt: false, meta: false, repeat: false, ...mods });
  const press = (e) => { Keys.keyDown(e); settle(); Keys.keyUp(e); };
  deliverKeys(Keys, Focus);
  Focus.focus(app.w1.a); settle();
  press(key("F6"));
  assert.ok(Focus.holds(app.w2), "F6 moves to the next region");
  press(key("F6", { shift: true }));
  assert.ok(Focus.holds(app.w1), "Shift-F6 moves back");
});

await test("Esc then Tab leaves a region in either direction; Tab alone, or Esc then another key, stays", async () => {
  const app = await boot(`App [ width = 600, height = 300,
    w1: View [ focusScope = region, x = 10, y = 10, width = 200, height = 100,
        a: Button [ label = "A" ], a2: Button [ y = 50, label = "A2" ] ],
    w2: View [ focusScope = region, x = 260, y = 10, width = 200, height = 100, b: Button [ label = "B" ] ] ]`);
  const key = (k, mods = {}) => ({ code: k, key: k, shift: false, ctrl: false, alt: false, meta: false, repeat: false, ...mods });
  const press = (e) => { Keys.keyDown(e); settle(); Keys.keyUp(e); };
  deliverKeys(Keys, Focus);
  Focus.focus(app.w1.a); settle();
  press(key("Tab"));
  assert.ok(Focus.holds(app.w1), "Tab alone stays in the region (it wraps inside)");
  press(key("Escape")); press(key("Tab"));
  assert.ok(Focus.holds(app.w2), "Esc then Tab moves to the next region");
  press(key("Escape")); press(key("ShiftLeft", { shift: true })); press(key("Tab", { shift: true }));
  assert.ok(Focus.holds(app.w1), "Esc then Shift-Tab moves back (Shift pressed between keeps it armed)");
  press(key("Escape")); press(key("a")); press(key("Tab"));
  assert.ok(Focus.holds(app.w1), "another key in between disarms it");
});

await test("focused is every view's reactive fact, and Focus.getFocus() is a tracked read", async () => {
  const app = await boot(`App [ width = 400, height = 200,
    which: string = { Focus.getFocus() == null ? "none" : "" + Focus.getFocus().tagName },
    a: Button [ tagName: string = "a", label = "A" ],
    v: View [ tagName: string = "v", x = 100, width = 40, height = 20, focusable = true,
        lit: boolean = { focused } ],
    t: TextInput [ x = 200, width = 80, edge: boolean = { focused } ] ]`);
  assert.equal(app.which, "none");
  Focus.focus(app.a); settle();
  assert.equal(app.which, "a", "a constraint over Focus.getFocus() followed focus to the button");
  assert.ok(app.a.focused && !app.v.lit, "the button is focused; the plain view is not");
  Focus.focus(app.v); settle();
  assert.ok(app.v.lit && !app.a.focused, "a plain focusable view's own constraint saw focus arrive");
  assert.equal(app.which, "v");
  Focus.blur(); settle();
  assert.ok(!app.v.lit && app.which === "none", "and leave");
});

await test("a press on content that takes no focus clears focus, and the next Tab starts from the pressed spot", async () => {
  const app = await boot(`App [ width = 600, height = 400,
    a: Button [ x = 10, y = 10, label = "A" ],
    note: View [ x = 10, y = 60, width = 200, height = 40, fill = #EEEEEE ],
    b: Button [ x = 10, y = 120, label = "B" ],
    c: Button [ x = 10, y = 170, label = "C" ] ]`);
  Focus.focus(app.a); settle();
  Focus.pressAt(app.b); settle();
  same(Focus.getFocus(), app.a, "a press on a control leaves focus to the control (it focuses itself)");
  Focus.pressAt(app.note); settle();
  assert.equal(Focus.getFocus(), null, "a press on plain content clears focus");
  Focus.next(); settle();
  same(Focus.getFocus(), app.b, "Tab goes to the first stop after the pressed spot");
  Focus.pressAt(app.note); settle();
  Focus.prev(); settle();
  same(Focus.getFocus(), app.a, "Shift-Tab to the last one before it");
});

await test("inside a dialog, a press on its plain content keeps the next Tab in the dialog", async () => {
  const app = await boot(`App [ width = 600, height = 400,
    out: Button [ x = 10, y = 10, label = "Out" ],
    dlg: Dialog [ title = "T", buttons = { [ ({ id: "ok", label: "OK", default: true }) ] },
        body: View [ width = 200, height = 40 ], f: Button [ label = "In" ] ] ]`);
  app.dlg.show(); settle();
  await new Promise((r) => setTimeout(r, 0)); settle();
  Focus.pressAt(app.dlg.body); settle();
  Focus.next(); settle();
  assert.ok(Focus.holds(app.dlg), `Tab from a spot inside the dialog stays inside it (${Focus.getFocus()?.label})`);
  app.dlg.close(); settle();
});

await test("Tab scrolls a page App taller than its window: the reveal is framed by the window, not the App's own height", async () => {
  const app = await boot(`App [ width = 400, height = 1600,
    page: View [ width = 400, height = 1600,
        a: Button [ y = 40, label = "A" ],
        b: Button [ y = 1200, label = "B" ] ] ]`);
  app.hostWidth = 400; app.hostHeight = 300; settle();
  assert.ok(app.height >= 1600, `the App is as tall as its content (${app.height})`);
  stopAt(app.page.b);
  const top = app.page.b.y - app.scrollY;
  assert.ok(top >= 0 && top + app.page.b.height <= 300, `B is brought inside the window (top ${top}, scrollY ${app.scrollY})`);
});

await test("focus does not stay on what can no longer be reached: hidden, made unfocusable, dropped by tabOrder", async () => {
  const app = await boot(`App [ width = 600, height = 400, open: boolean = true, on: boolean = true, shown: boolean = true,
    a: Button [ x = 10, y = 10, label = "A" ],
    pane: View [ x = 10, y = 60, width = 300, height = 200, visible = { app.shown },
        tabOrder() { return app.open ? this.tabDefault() : [] },
        f: Button [ label = "In pane", focusable = { app.on } ] ],
    z: Button [ x = 10, y = 300, label = "Z" ] ]`);
  const turn = async () => { settle(); await new Promise((r) => setTimeout(r, 0)); settle(); };
  for (const [what, off, on] of [
    ["hidden", () => { app.shown = false }, () => { app.shown = true }],
    ["made unfocusable", () => { app.on = false }, () => { app.on = true }],
    ["dropped by its pane's tabOrder", () => { app.open = false }, () => { app.open = true }]]) {
    Focus.focus(app.pane.f); await turn();
    same(Focus.getFocus(), app.pane.f, `focused in the pane before it is ${what}`);
    off(); await turn();
    assert.equal(Focus.getFocus(), null, `${what}: focus is cleared`);
    Focus.next(); await turn();
    same(Focus.getFocus(), app.z, `${what}: the next Tab goes on from where it was`);
    on(); await turn();
  }
});

await test("in a stop the arrows move among the members by default; a member's own handler keeps the keys it takes", async () => {
  const app = await boot(`App [ width = 600, height = 200, sel: string = "a",
    bar: View [ focusScope = stop, layout: SimpleLayout [ axis = x, spacing = 8 ],
        a: Button [ label = "A" ],
        b: Button [ label = "B", disabled = true ],
        c: View [ width = 30, height = 20, focusable = true ],
        d: Button [ label = "D", hits: number = 0,
            onKeyDown(e: KeyEvent) { if (e.key == "ArrowLeft") this.hits = this.hits + 1; else super.onKeyDown(e) } ] ],
    radios: RadioGroup [ y = 60, value = { app.sel }, input(v: any) { app.sel = v },
        Radio [ choice = "a", label = "A" ], Radio [ choice = "b", label = "B" ], Radio [ choice = "c", label = "C" ] ],
    field: View [ y = 160, focusScope = stop, t: TextInput [ width = 100, focusable = true ], u: Button [ x = 120, label = "U" ] ] ]`);
  const key = (k, mods = {}) => ({ code: k, key: k, shift: false, ctrl: false, alt: false, meta: false, repeat: false, ...mods });
  const press = (e) => { Keys.keyDown(e); settle(); Keys.keyUp(e); };
  deliverKeys(Keys, Focus);
  const { a, c, d } = app.bar;
  Focus.focus(a); settle();
  press(key("ArrowRight"));
  assert.ok(Focus.getFocus() === c, "Right skips the disabled member, and a plain focusable view is a member too");
  assert.ok(Focus.byKeyboard(), "an arrow's move is keyboard focus");
  press(key("ArrowDown"));
  assert.ok(Focus.getFocus() === d, "Down goes forward as well");
  press(key("ArrowRight"));
  assert.ok(Focus.getFocus() === a, "past the last member it wraps");
  press(key("End"));
  assert.ok(Focus.getFocus() === d, "End goes to the last");
  press(key("ArrowLeft"));
  assert.ok(Focus.getFocus() === d && d.hits === 1, "a key the member takes (no super) is its alone");
  press(key("ArrowUp"));
  assert.ok(Focus.getFocus() === c, "the keys it hands on with super move as usual");
  press(key("Home"));
  assert.ok(Focus.getFocus() === a, "Home goes to the first");
  press(key("ArrowRight", { shift: true }));
  assert.ok(Focus.getFocus() === a, "not with a modifier");
  const rs = app.radios._radios();
  stopAt(rs[0]);
  press(key("ArrowDown"));
  assert.ok(Focus.getFocus() === rs[1] && app.sel === "b", "a radio group's arrows move and check");
  press(key("ArrowUp")); press(key("ArrowUp"));
  assert.ok(Focus.getFocus() === rs[2] && app.sel === "c", "and wrap");
  Focus.focus(app.field.t); settle();
  press(key("ArrowRight"));
  assert.ok(Focus.getFocus() === app.field.t, "a text field's arrows stay its own, even as a stop's member");
});

summarize("focus-ring");
