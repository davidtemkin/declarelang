// Overlays (planes.md §3, §8, §9, §11): what a press or a scroll aimed past an open
// overlay does, by kind; the layer an overlay opens in — a Window's own, else the
// App's; a window's modality and keyboard claim kept to that window; a menu kept on
// the App through a turned window; one Esc per overlay. Headless: the library
// compiled, instantiated in Node, pressed through the router's own outside walk.

import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate } from "../runtime/dist/instantiate.js";
import { settle, provideMeasurer, Focus, Keys, deliverKeys } from "../runtime/dist/index.js";
import { pressOutside, scrollOutside } from "../runtime/dist/outside.js";
import { approximateMeasurer } from "../compiler/dist/headless.js";
import { linkIslandTenant } from "../runtime/dist/island.js";
import { hostValuesFor } from "../runtime/dist/boundary.js";
import { Clock, setClock } from "../runtime/dist/animate.js";

provideMeasurer(approximateMeasurer());

// views compared by identity: a failing assert.equal on a live view prints its
// whole graph, which on a linked program is too large to finish printing
const same = (a, b, msg) => assert.ok(a === b, msg);
const differ = (a, b, msg) => assert.ok(a !== b, msg);

const KEY = (key) => ({ key, shift: false, ctrl: false, alt: false, meta: false, repeat: false, code: key });

async function boot(src) {
  const b = await compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  Focus.reset();
  const app = instantiate(b.program);
  settle();
  Focus.setRoot(app);
  return app;
}

const KINDS = `App [ width = 600, height = 400,
    heard: string = "",
    target: Button [ x = 500, y = 350, label = "Elsewhere", onClick() { app.heard = "pressed" } ],
    opener1: Button [ x = 20, y = 20, label = "Anchor" ],
    pop: Popover [ anchorTo = { app.opener1 }, Text [ text = "a popover" ] ],
    dlg: Dialog [ title = "A dialog" ],
    sheet: Sheet [ Text [ text = "a sheet" ] ],
    toast: Toast [ ],
    menu: Menu [ items = { [ ({ id: "a", label: "A" }) ] } ]
    ]`;

await test("a press outside: a popover closes and the press goes on; a dialog holds it; a menu closes and swallows it; a toast lets it by", async () => {
  const app = await boot(KINDS);
  app.pop.showFor(app.opener1); settle();
  assert.equal(pressOutside(app, 520, 360), false, "a popover lets the press go on");
  settle();
  assert.equal(app.pop.shown, false, "…and closes");

  app.dlg.notice("Saved", "It is saved."); settle();
  assert.equal(pressOutside(app, 520, 360), true, "a dialog holds the press back");
  settle();
  assert.equal(app.dlg.shown, true, "…and stays open");
  app.dlg.close(); settle();

  app.menu.openFor(app.opener1); settle();
  assert.equal(pressOutside(app, 520, 360), true, "a menu swallows the press — the Mac rule");
  settle();
  assert.equal(app.menu.shown, false, "…and closes");

  app.toast.say("Copied", null); settle();
  assert.equal(pressOutside(app, 520, 360), false, "a toast is not in the way");
  assert.equal(app.toast.shown, true, "…and stays");
  app.toast.close(); settle();
});

await test("an overlay's open and close work is its own: a use site's trackChanges, onChange and onInit, written for its own ends, leave it opening, closing, and open from the start", async () => {
  const app = await boot(`App [ width = 600, height = 400, seen: number = 0, inits: number = 0, startOpen: boolean = true,
    opener1: Button [ x = 20, y = 20, label = "Anchor" ],
    pop: Popover [ anchorTo = { app.opener1 }, note: string = "",
        trackChanges = ["note"], onChange() { app.seen = app.seen + 1 }, onInit() { app.inits = app.inits + 1 },
        Text [ text = "a popover" ] ],
    early: Sheet [ shown = { app.startOpen }, input(open: boolean) { app.startOpen = open }, onInit() { app.inits = app.inits + 1 }, Text [ text = "open at start" ] ]
    ]`);
  await new Promise((r) => setTimeout(r, 0)); settle();
  assert.equal(app.inits, 2, "the use sites' own onInit ran");
  assert.equal(app.early.present, true, "an overlay shown from the start opened, its own onInit notwithstanding");
  app.pop.showFor(app.opener1); settle();
  assert.equal(app.pop.present, true, "show() opens it, its own trackChanges and onChange notwithstanding");
  app.pop.note = "x"; settle();
  assert.equal(app.seen, 1, "the use site's onChange hears its own attribute");
  app.pop.close(); settle();
  assert.equal(app.pop.shown, false, "close() closes it");
  app.early.close(); settle();
  assert.equal(app.early.shown, false, "and the one open from the start closes through its state");
  await new Promise((r) => setTimeout(r, 50)); settle();
});

await test("a scroll outside: a sheet holds it back; a popover lets it by", async () => {
  const app = await boot(KINDS);
  app.sheet.show(); settle();
  assert.equal(scrollOutside(app, 10, 10), true, "nothing behind a sheet scrolls");
  app.sheet.close(); settle();
  app.pop.showFor(app.opener1); settle();
  assert.equal(scrollOutside(app, 520, 360), false, "a popover leaves scrolling alone");
  app.pop.close(); settle();
});

// The router hands the walk the press where the browser reports it — the window
// point — with the root point beside it. A root point read as the window
// point, on a scrolled page, fell past the window's foot: a press low in a
// drawer dismissed the drawer (iPhone, 2026-10-25).
await test("on a scrolled page, a press inside an open drawer is inside it, however far the page has scrolled", async () => {
  let cb = null, last = 0;
  const sched = { now: () => last, request(fn) { cb = fn; return 1; }, cancel() { cb = null; } };
  const frames = (n) => { for (let i = 0; i < n; i++) { const fn = cb; cb = null; last = last + 16; if (fn) fn(last); settle(); } };
  setClock(new Clock(sched));
  try {
    const app = await boot(`App [ width = 390, height = 800, scrolls = y,
    View [ width = 100%, height = 3000 ],
    nav: Sheet [ edge = "start", Text [ text = "a drawer" ] ]
    ]`);
    app.hostWidth = 390; app.hostHeight = 800; settle();
    app.nav.show(); settle(); frames(120);
    app.scrollY = 1500; settle();
    assert.equal(pressOutside(app, 100, 600, 100, 1500 + 600), false, "a press low in the drawer is the drawer's");
    settle();
    assert.equal(app.nav.shown, true, "…and leaves it open");
    assert.equal(pressOutside(app, 360, 600, 360, 1500 + 600), true, "past its edge, a press is outside it");
    settle();
    assert.equal(app.nav.shown, false, "…and dismisses it");
  } finally {
    setClock(new Clock());
  }
});

await test("one Esc closes the top overlay and reaches no Keys member of the program; the next reaches it", async () => {
  const app = await boot(`App [ width = 600, height = 400,
    escs: number = 0,
    keys: Keys [ onKeyDown(e: KeyEvent) { if (e.key == "Escape") app.escs = app.escs + 1 } ],
    opener1: Button [ x = 20, y = 20, label = "Anchor" ],
    dlg: Dialog [ title = "Outer", Button [ label = "Inner" ] ],
    pop: Popover [ anchorTo = { app.opener1 }, Button [ label = "In the popover" ] ]
    ]`);
  app.dlg.show(); settle();
  app.pop.showFor(app.opener1); settle();
  Keys.keyDown(KEY("Escape")); Keys.keyUp(KEY("Escape")); settle();
  assert.equal(app.pop.shown, false, "the popover, opened last, closes");
  assert.equal(app.dlg.shown, true, "the dialog under it stays");
  assert.equal(app.escs, 0, "the program's own Esc does not run");
  Keys.keyDown(KEY("Escape")); Keys.keyUp(KEY("Escape")); settle();
  assert.equal(app.dlg.shown, false, "the next Esc closes the dialog");
  assert.equal(app.escs, 0);
  Keys.keyDown(KEY("Escape")); Keys.keyUp(KEY("Escape")); settle();
  assert.equal(app.escs, 1, "with nothing open, Esc is the program's");
});

const WINDOWS = `App [ width = 800, height = 500,
    note: Toast [ ],
    a: Window [ frame = false, x = 20, y = 20, width = 300, height = 240,
        dlg: Dialog [ title = "In A" ],
        menu: Menu [ items = { [ ({ id: "x", label: "Something" }) ] } ],
        local: Toast [ ],
        fa: View [ x = 10, y = 10, width = 120, height = 24, focusable = true ]
        ],
    b: Window [ frame = false, x = 400, y = 20, width = 300, height = 240,
        fb: View [ x = 10, y = 10, width = 120, height = 24, focusable = true ]
        ]
    ]`;

await test("a Window: what opens inside it paints in its own layer; a toast paints in the App's", async () => {
  const app = await boot(WINDOWS);
  app.a.menu.openFor(app.a.fa); settle();
  same(app.a.menu.paintsIn, app.a.layer, "a menu declared in the window opens in the window's layer");
  app.a.menu.close(); settle();
  app.a.local.say("hello", null); settle();
  differ(app.a.local.paintsIn, app.a.layer, "a toast is the program's, not the window's");
  app.note.say("hi", null); settle();
  same(app.a.local.paintsIn, app.note.paintsIn, "…the App's notice layer");
  app.a.local.close(); app.note.close(); settle();
});

await test("a dialog open in a window holds back presses in that window only", async () => {
  const app = await boot(WINDOWS);
  app.a.dlg.notice("In A", ""); settle();
  assert.equal(pressOutside(app, 30, 230), true, "a press elsewhere in window A is held");
  assert.equal(pressOutside(app, 420, 230), false, "a press in window B goes on");
  assert.equal(pressOutside(app, 780, 480), false, "a press behind both goes on");
  assert.equal(scrollOutside(app, 420, 230), false, "and a scroll in window B");
  app.a.dlg.close(); settle();
});

await test("an overlay's keyboard claim holds while focus is in its window, and not while it is in another", async () => {
  const app = await boot(WINDOWS);
  Focus.focus(app.a.fa); settle();
  app.a.dlg.notice("In A", ""); settle();
  same(Keys._claimant(), app.a.dlg, "focus in A: the dialog has the keys");
  Focus.focus(app.b.fb); settle();
  same(Keys._claimant(), null, "focus in B: it does not");
  assert.equal(app.a.dlg.isTop(), false, "…nor is it what Esc closes");
  app.a.dlg.close(); settle();
});

await test("a menu in a turned window opens at its anchor in the window's frame and stays on the App", async () => {
  const app = await boot(`App [ width = 600, height = 400,
    w: Window [ frame = false, x = 380, y = 40, width = 300, height = 200, rotation = 20,
        menu: Menu [ items = { [ ({ id: "a", label: "A long first command" }), ({ id: "b", label: "B" }) ] } ],
        btn: Button [ x = 20, y = 20, label = "Open" ],
        far: Button [ x = 240, y = 150, label = "Edge" ]
        ]
    ]`);
  app.w.menu.openFor(app.w.btn); settle();
  const m = app.w.menu, b = app.w.btn;
  assert.ok(Math.abs(m.x - b.x) < 0.5 && Math.abs(m.y - (b.y + b.height + 4)) < 0.5,
    `below the button, in the window's own frame (menu ${m.x},${m.y}; button ${b.x},${b.y + b.height + 4})`);
  m.close(); settle();
  app.w.menu.openFor(app.w.far); settle();
  const r = app.w.menu.rootBounds();
  assert.ok(r.x + r.width <= 600 - 3.5 && r.x >= 3.5 && r.y + r.height <= 400 - 3.5 && r.y >= 3.5,
    `kept on the App: ${JSON.stringify(r)}`);
  app.w.menu.close(); settle();
});

await test("defaultPlacement carries a subclass's views; its members with no view stay on the instance", async () => {
  const app = await boot(`class Frame [ defaultPlacement = body,
    t: number = 0,
    body: View [ width = 100, height = 100 ]
    ]
class Moving extends Frame [
    s: Spring [ attribute = t, to = 1 ],
    v: View [ width = 10, height = 10 ]
    ]
App [ width = 200, height = 200, m: Moving [ ] ]`);
  same(app.m.v.parent, app.m.body, "the view goes into the placement");
  same(app.m.s.parent, app.m, "the spring stays on the instance it drives");
});

// A program hosted in a window (planes.md §12): its overlays open in the window's
// layer when the island provides it, are placed across the island, hold back only
// that window, and go when the program does.
async function hosted() {
  const host = await boot(`App [ width = 800, height = 500,
    w: Window [ frame = false, x = 100, y = 50, width = 300, height = 200,
        isl: AppIsland [ width = 100%, height = 100% ] ],
    other: Window [ frame = false, x = 450, y = 50, width = 300, height = 200,
        f: View [ x = 10, y = 10, width = 50, height = 20, focusable = true ] ]
    ]`);
  const b = await compileProgram(`App [ width = 300, height = 200,
    btn: Button [ x = 20, y = 150, label = "Sort" ],
    menu: Menu [ items = { [ ({ id: "a", label: "A" }), ({ id: "b", label: "B" }), ({ id: "c", label: "C" }) ] } ],
    dlg: Dialog [ title = "Hosted" ]
    ]`, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  const tenant = instantiate(b.program);
  tenant.$hostValues = hostValuesFor({});
  const unlink = linkIslandTenant(host.w.isl, tenant);
  settle();
  return { host, tenant, unlink };
}

await test("a hosted program's menu opens in its window's layer, at its anchor, and may hang past the window", async () => {
  const { host, tenant, unlink } = await hosted();
  tenant.menu.openFor(tenant.btn); settle();
  same(tenant.menu.paintsIn, host.w.layer, "the window's layer, through the island's provides");
  assert.ok(Math.abs(tenant.menu.x - 20) < 0.5 && Math.abs(tenant.menu.y - (150 + tenant.btn.height + 4)) < 0.5,
    `below the button, in the layer's frame (${tenant.menu.x},${tenant.menu.y})`);
  const t = tenant.menu.transformTo(host);
  assert.ok(t.y + tenant.menu.height > 50 + 200, "it hangs past the window's bottom edge");
  tenant.menu.close(); settle();
  unlink();
});

await test("a hosted program's dialog holds back presses in its own window only, and its keyboard claim with them", async () => {
  const { host, tenant, unlink } = await hosted();
  tenant.dlg.notice("Hosted", ""); settle();
  assert.equal(pressOutside(host, 120, 240), true, "a press elsewhere in its window is held");
  assert.equal(pressOutside(host, 600, 200), false, "a press in the other window goes on");
  Focus.focus(host.other.f); settle();
  same(Keys._claimant(), null, "focus in the other window: the dialog does not have the keys");
  tenant.dlg.close(); settle();
  unlink();
});

await test("a hosted program's open menu leaves the host's layer when the program goes", async () => {
  const { host, tenant, unlink } = await hosted();
  tenant.menu.openFor(tenant.btn); settle();
  same(host.w.layer.$paintGuests.length, 1, "listed in the layer while open");
  unlink();
  tenant.discard(); settle();
  same(host.w.layer.$paintGuests.length, 0, "withdrawn when the program is torn down");
  same(Keys._claimant(), null, "and its keyboard claim with it");
});

async function hostedIn(islandSrc) {
  const host = await boot(`App [ width = 800, height = 500,
    w: Window [ frame = false, x = 100, y = 50, width = 300, height = 200, ${islandSrc} ] ]`);
  const b = await compileProgram(`App [ width = 300, height = 200,
    btn: Button [ x = 20, y = 20, label = "Sort" ],
    menu: Menu [ items = { [ ({ id: "a", label: "A" }) ] } ]
    ]`, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  const tenant = instantiate(b.program);
  tenant.$hostValues = hostValuesFor({});
  return { host, tenant };
}

await test("a program shown scaled in a window opens its menu at its own scale, in the window's layer", async () => {
  const { host, tenant } = await hostedIn(`box: View [ x = 20, y = 20, width = 150, height = 100, scale = 0.5,
        isl: AppIsland [ width = 300, height = 200 ] ]`);
  const unlink = linkIslandTenant(host.w.box.isl, tenant); settle();
  tenant.menu.openFor(tenant.btn); settle();
  same(tenant.menu.paintsIn, host.w.layer, "the window's layer, past the box's clip");
  assert.ok(Math.abs(tenant.menu.scale - 0.5) < 1e-6, `at the program's scale (${tenant.menu.scale})`);
  const b = tenant.btn.transformTo(host.w.layer);
  assert.ok(Math.abs(tenant.menu.x - b.x) < 0.5 && Math.abs(tenant.menu.y - (b.y + (tenant.btn.height + 4) * 0.5)) < 0.5,
    `under the button as shown (${tenant.menu.x},${tenant.menu.y} vs ${b.x},${b.y})`);
  tenant.menu.close(); settle();
  unlink();
});

await test("containOverlays keeps a hosted program's menu inside its own program", async () => {
  const { host, tenant } = await hostedIn(`isl: AppIsland [ width = 100%, height = 100%, containOverlays = true ]`);
  const unlink = linkIslandTenant(host.w.isl, tenant); settle();
  tenant.menu.openFor(tenant.btn); settle();
  assert.ok(tenant.menu.paintsIn !== host.w.layer, "not the window's layer");
  let n = tenant.menu.paintsIn; while (n.parent != null) n = n.parent;
  same(n, tenant, "a layer of the program's own");
  assert.equal(tenant.menu.scale, 1);
  tenant.menu.close(); settle();
  unlink();
});

await test("a hosted program's dialog in its window keeps Tab inside it; Esc gives focus back in the program", async () => {
  const host = await boot(`App [ width = 800, height = 500,
    w: Window [ frame = false, x = 100, y = 50, width = 400, height = 300,
        isl: AppIsland [ width = 100%, height = 100% ] ],
    after: View [ x = 600, y = 400, width = 40, height = 20, focusable = true ] ]`);
  const b = await compileProgram(`App [ width = 400, height = 300,
    field: View [ x = 10, y = 10, width = 80, height = 20, focusable = true ],
    dlg: Dialog [ title = "Hosted", content: View [ width = 200, height = 40,
        one: View [ width = 60, height = 20, focusable = true ],
        two: View [ x = 80, width = 60, height = 20, focusable = true ] ] ]
    ]`, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  const tenant = instantiate(b.program);
  tenant.$hostValues = hostValuesFor({});
  const unlink = linkIslandTenant(host.w.isl, tenant); settle();
  Focus.focus(tenant.field); settle();
  tenant.dlg.show(); settle();
  tenant.dlg.focusFirst(); settle();
  same(tenant.dlg.paintsIn, host.w.layer, "the dialog opens in the window's layer");
  const seen = new Set();
  for (let i = 0; i < 8; i++) { Focus.next(); settle(); seen.add(Focus.getFocus()); }
  for (const f of seen) {
    let n = f; while (n != null && n !== tenant.dlg) n = n.parent;
    assert.ok(n === tenant.dlg, "every Tab stays inside the dialog");
  }
  Keys.keyDown(KEY("Escape")); Keys.keyUp(KEY("Escape")); settle();
  // the hand-back runs a frame later, on timers: wait for it rather than a fixed time,
  // which a loaded run outlasts
  for (let i = 0; i < 50 && Focus.getFocus() !== tenant.field; i++) { await new Promise((r) => setTimeout(r, 10)); settle(); }
  assert.equal(tenant.dlg.shown, false, "Esc closes it");
  same(Focus.getFocus(), tenant.field, "and focus is back where it was in the program");
  unlink();
});

// Keys inside an open overlay: the overlay owns the navigation keys only against
// what lies outside it — a control focused inside it keeps them.

const press = (k, mods = {}) => { const e = { ...KEY(k), ...mods }; Keys.keyDown(e); settle(); Keys.keyUp(e); settle(); };
const turns = async (n = 3) => { for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); settle(); } };

await test("a control inside an open popover keeps its keys: the arrows move its slider", async () => {
  const app = await boot(`App [ width = 400, height = 300, size: number = 14,
    b: Button [ x = 20, y = 20, label = "Size" ],
    pop: Popover [ sl: Slider [ width = 180, min = 10, max = 32, value = { app.size }, input(v: number) { app.size = Math.round(v) } ] ] ]`);
  deliverKeys(Keys, Focus);
  app.pop.showFor(app.b); settle(); await turns();
  Focus.focus(app.pop.sl); settle();
  press("ArrowRight");
  assert.equal(app.size, 15, "ArrowRight reached the slider inside the popover");
  app.pop.close(); settle();
});

await test("in a dialog, Return on a focused button presses that button, not the default", async () => {
  const app = await boot(`App [ width = 500, height = 300, said: string = "",
    dlg: Dialog [ ] ]`);
  deliverKeys(Keys, Focus);
  app.dlg.ask("Delete?", "", (id) => { app.said = id }); settle(); await turns();
  same(Focus.getFocus()?.label, "Yes", "the alert opens on its default button");
  for (let i = 0; i < 6 && Focus.getFocus()?.label !== "Cancel"; i++) { Focus.prev(); settle(); }
  assert.equal(Focus.getFocus()?.label, "Cancel", "Shift-Tab reaches Cancel");
  press("Enter");
  await turns();
  assert.equal(app.said, "cancel", `Return on Cancel picked "${app.said}"`);
  if (app.dlg.shown) { app.dlg.close(); settle(); }
});

await test("in a dialog, Return in a multi-line field does not pick the default", async () => {
  // a focusable stand-in for the field: headless, a TextInput takes no native focus
  const app = await boot(`App [ width = 500, height = 300, said: string = "",
    dlg: Dialog [ buttons = { [ ({ id: "ok", label: "OK", default: true }) ] },
        picked(id: string) { app.said = id },
        notes: View [ width = 200, height = 60, focusable = true, multiline: boolean = true ],
        plain: View [ width = 200, height = 24, focusable = true ] ] ]`);
  deliverKeys(Keys, Focus);
  app.dlg.show(); settle(); await turns();
  Focus.focus(app.dlg.notes); settle();
  press("Enter");
  await turns();
  assert.equal(app.said, "", "Return stayed with the multi-line field");
  Focus.focus(app.dlg.plain); settle();
  press("Enter");
  await turns();
  assert.equal(app.said, "ok", "on a view that does not take Return, Return picks the default");
  if (app.dlg.shown) { app.dlg.close(); settle(); }
});

await test("an open menu keeps the arrows from the control it was opened from", async () => {
  const app = await boot(`App [ width = 500, height = 300, sel: string = "a",
    seg: Segmented [ x = 20, y = 20, value = { app.sel }, input(v: any) { app.sel = v },
        choices = { [ ({ id: "a", label: "A" }), ({ id: "b", label: "B" }) ] } ],
    m: Menu [ items = { [ ({ id: "x", label: "X" }), ({ id: "y", label: "Y" }) ] } ] ]`);
  deliverKeys(Keys, Focus);
  const s0 = app.seg.segs()[0];
  Focus.focus(s0); settle();
  app.m.openFor(s0); settle(); await turns();
  press("ArrowRight");
  same(Focus.getFocus(), app.m, "the open menu holds the focus, naming its rows");
  assert.equal(app.sel, "a", "the segment under the open menu did not rove");
  app.m.close(); settle();
});

await test("a sheet modal to one window stays open, and lets by, a press in another window", async () => {
  const app = await boot(`App [ width = 800, height = 500,
    a: Window [ frame = false, x = 20, y = 20, width = 300, height = 240,
        sh: Sheet [ Text [ text = "in A" ] ] ],
    b: Window [ frame = false, x = 400, y = 20, width = 300, height = 240,
        fb: View [ x = 10, y = 10, width = 120, height = 24, focusable = true ] ] ]`);
  app.a.sh.show(); settle(); await turns();
  assert.equal(pressOutside(app, 420, 230), false, "a press in window B goes on");
  settle();
  assert.equal(app.a.sh.shown, true, "and the sheet in A stays");
  app.a.sh.close(); settle();
});

await test("an overlay's shown can be state: it opens when the state does, and Esc writes the state back", async () => {
  const app = await boot(`App [ width = 600, height = 400, editing: boolean = false,
    sh: Sheet [ shown = { app.editing }, input(open: boolean) { app.editing = open },
        f: Button [ label = "Inside" ] ] ]`);
  deliverKeys(Keys, Focus);
  assert.equal(app.sh.present, false, "closed while the state is false");
  app.editing = true; settle(); await turns();
  assert.ok(app.sh.shown && app.sh.present, "the state opened it");
  same(Keys._claimant(), app.sh, "and it holds the keyboard as an opened sheet does");
  assert.ok(Focus.holds(app.sh), "and took focus inside");
  press("Escape"); await turns();
  assert.equal(app.editing, false, "Esc delivered the close to the state");
  assert.equal(app.sh.shown, false, "and it closed");
  same(Keys._claimant(), null, "its keyboard claim went with it");
  app.sh.show(); settle(); await turns();
  assert.equal(app.editing, true, "show() delivers through input too");
  app.sh.close(); settle(); await turns();
  assert.equal(app.editing, false);
});

await test("an overlay whose state is true at start opens with the program", async () => {
  const app = await boot(`App [ width = 600, height = 400, editing: boolean = true,
    sh: Sheet [ shown = { app.editing }, input(open: boolean) { app.editing = open }, Text [ text = "hi" ] ] ]`);
  await turns();
  assert.ok(app.sh.present, "open from the first frames");
  app.sh.close(); settle(); await turns();
  assert.equal(app.editing, false);
});

await test("a constrained shown without an input override is a compile error that names the fix; with one it compiles", async () => {
  const bad = await compileProgram(`App [ width = 400, height = 300, editing: boolean = false,
    sh: Sheet [ shown = { app.editing } ] ]`, { originDir: process.cwd() + "/library", stripPos: false });
  assert.ok(bad.errors.some((e) => /Sheet\.shown is constrained here/.test(e.message) && /input\(/.test(e.message)), bad.errors.map((e) => e.message).join("; "));
  const slider = await compileProgram(`App [ width = 400, height = 300, v: number = 3,
    Slider [ value = { app.v } ] ]`, { originDir: process.cwd() + "/library", stripPos: false });
  assert.ok(slider.errors.some((e) => /Slider\.value is constrained here/.test(e.message)), "the same rule for a control's value");
  const good = await compileProgram(`App [ width = 400, height = 300, editing: boolean = false,
    sh: Sheet [ shown = { app.editing }, input(open: boolean) { app.editing = open } ] ]`, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(good.errors.length, 0, good.errors.map((e) => e.message).join("; "));
});

await test("typing letters in an open menu moves its highlight: a prefix, then the same letter cycles; disabled rows are skipped", async () => {
  const app = await boot(`App [ width = 500, height = 400,
    b: Button [ x = 20, y = 20, label = "File" ],
    m: Menu [ items = { [ ({ id: "save", label: "Save" }), ({ id: "saveas", label: "Save As…" }),
        ({ divider: true }), ({ id: "share", label: "Share", enabled: false }),
        ({ id: "export", label: "Export" }), ({ id: "print", label: "Print" }) ] } ] ]`);
  deliverKeys(Keys, Focus);
  Focus.focus(app.b); settle();
  app.m.openFor(app.b); settle(); await turns();
  const at = () => app.m.activeRow?.label;
  press("e");
  assert.equal(at(), "Export", "e lands on Export");
  app.m._typedAt = 0;
  press("s");
  assert.equal(at(), "Save", "after a pause, s starts over and lands on Save");
  press("s");
  assert.equal(at(), "Save As…", "s again goes on to the next row starting with s — not the disabled Share");
  app.m._typedAt = 0;
  press("p"); press("r");
  assert.equal(at(), "Print", "a typed prefix");
  same(Focus.getFocus(), app.m, "the menu holds the focus; its highlight moved");
  assert.equal(app.m.shown, true, "nothing was picked");
  app.m.close(); settle();
});

await test("Tab with a menu open closes the menu and moves on; it never goes behind a menu left open", async () => {
  const app = await boot(`App [ width = 500, height = 300,
    b: Button [ x = 20, y = 20, label = "Menu" ], c: Button [ x = 120, y = 20, label = "Next" ],
    m: Menu [ items = { [ ({ id: "x", label: "X" }) ] } ] ]`);
  deliverKeys(Keys, Focus);
  Focus.focus(app.b); settle();
  app.m.openFor(app.b); settle(); await turns();
  press("Tab");
  await turns();
  assert.equal(app.m.shown, false, "the menu closed");
  same(Focus.getFocus(), app.c, "and focus moved on");
});

await test("an overlay holding nothing focusable takes focus itself, so Tab cannot reach what is behind it", async () => {
  const app = await boot(`App [ width = 500, height = 300,
    b: Button [ x = 20, y = 20, label = "Open" ], behind: Button [ x = 120, y = 20, label = "Behind" ],
    pic: Dialog [ presentation = "full", View [ width = 100, height = 100, fill = #333333 ] ] ]`);
  deliverKeys(Keys, Focus);
  Focus.focus(app.b); settle();
  app.pic.show(); settle(); await turns();
  assert.ok(Focus.holds(app.pic), "focus is in the dialog");
  press("Tab"); press("Tab"); await turns();
  assert.ok(Focus.holds(app.pic), "Tab does not leave it");
  press("Escape"); await turns(); await turns();
  same(Focus.getFocus(), app.b, "Esc closes it and focus goes back");
});

await test("a dialog whose opener is gone by its close gives focus to the next Tab stop after the opener's place", async () => {
  const src = `App [ width = 500, height = 300,
    showB: boolean = true,
    a: Button [ x = 20, y = 20, label = "Before" ],
    b: Button [ x = 120, y = 20, label = "Delete", visible = { app.showB } ],
    c: Button [ x = 220, y = 20, label = "After" ],
    dlg: Dialog [ title = "Delete it?", Button [ label = "OK" ] ] ]`;
  // hidden while the dialog was open
  let app = await boot(src);
  deliverKeys(Keys, Focus);
  Focus.focus(app.b); settle();
  app.dlg.show(); settle(); await turns();
  assert.ok(Focus.holds(app.dlg), "focus is in the dialog");
  app.showB = false; app.dlg.close(); settle(); await turns();
  same(Focus.getFocus(), app.c, "focus goes to the stop after the hidden opener");
  // discarded while the dialog was open
  app = await boot(src);
  deliverKeys(Keys, Focus);
  Focus.focus(app.b); settle();
  app.dlg.show(); settle(); await turns();
  app.b.discard(); app.dlg.close(); settle(); await turns();
  same(Focus.getFocus(), app.c, "focus goes to the stop after the discarded opener's place");
  // still there: focus goes back to it, as before
  app = await boot(src);
  deliverKeys(Keys, Focus);
  Focus.focus(app.b); settle();
  app.dlg.show(); settle(); await turns();
  app.dlg.close(); settle(); await turns();
  same(Focus.getFocus(), app.b, "an opener still there gets focus back");
});

await test("a combobox is one Tab stop: its entry", async () => {
  const app = await boot(`App [ width = 500, height = 300,
    a: Button [ x = 20, y = 20, label = "A" ],
    c: Combobox [ x = 20, y = 80, items = { ["One", "Two"] } ],
    z: Button [ x = 20, y = 160, label = "Z" ] ]`);
  Focus.focus(app.a); settle();
  Focus.next(); settle();
  same(Focus.getFocus(), app.c.entry, "Tab from A lands in the entry");
  Focus.next(); settle();
  same(Focus.getFocus(), app.z, "and the next Tab leaves the combobox");
});

// A sheet at the start edge is a drawer at every width: it slides in from the start
// edge, full height, leaving some of its context showing to press; a swipe back on
// its trailing edge follows the finger, and one past a quarter of its width puts it away.

await test("a start sheet is a drawer at every width, and a swipe back past a quarter of it puts it away", async () => {
  let cb = null, last = 0;
  const sched = { now: () => last, request(fn) { cb = fn; return 1; }, cancel() { cb = null; } };
  const frames = (n) => { for (let i = 0; i < n; i++) { const fn = cb; cb = null; last = last + 16; if (fn) fn(last); settle(); } };
  setClock(new Clock(sched));
  try {
    const app = await boot(`App [ width = 390, height = 700, open: boolean = false,
    nav: Sheet [ edge = "start", shown = { app.open }, input(v: boolean) { app.open = v },
        Text [ text = "Contents" ] ],
    card: Sheet [ Text [ text = "a sheet" ] ] ]`);
    app.hostWidth = 390; app.hostHeight = 700; settle();
    assert.equal(app.nav.presentation, "start", "a drawer on a phone, where a bottom sheet rises");
    assert.equal(app.card.presentation, "bottom");
    app.open = true; settle(); frames(120);
    assert.equal(app.nav.grip.visible, true, "a drawer has a grip; a bottom sheet has its handle instead");
    assert.equal(app.nav.width, 320, "its own width, with the context still showing beside it");
    assert.equal(app.nav.height, 700, "the full height");
    assert.equal(Math.round(app.nav.x), 0, "slid in to the start edge");
    app.nav.grip.onPointerMove({ x: 0, y: 0, deltaX: -60, deltaY: 4 }); settle();
    assert.equal(Math.round(app.nav.x), -60, "it follows a swipe back");
    app.nav.grip.onPointerUp({ x: 0, y: 0, deltaX: -60, deltaY: 4, canceled: false }); settle();
    assert.equal(app.nav._dragX, 0, "a short swipe lets it spring back");
    assert.equal(app.open, true);
    app.nav.grip.onPointerMove({ x: 0, y: 0, deltaX: -120, deltaY: 0 }); settle();
    app.nav.grip.onPointerUp({ x: 0, y: 0, deltaX: -120, deltaY: 0, canceled: false }); settle();
    assert.equal(app.open, false, "past a quarter of its width it closes, through input");
    frames(120);
    assert.equal(app.nav._dragX, 0, "and starts clean next time");
    assert.ok(app.nav.x <= -app.nav.width, "off past the start edge");
    app.hostWidth = 1200; app.hostHeight = 800; settle();
    assert.equal(app.nav.presentation, "start", "still a drawer on a wide screen");
    assert.equal(app.nav.width, 320);
    assert.equal(app.card.presentation, "center", "where a bottom sheet floats as a card");
  } finally {
    setClock(new Clock());
  }
});

summarize("overlays");
