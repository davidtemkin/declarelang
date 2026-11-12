// test/key-matrix.test.mjs — the keyboard model as a matrix (key-bindings.md).
//
// Every kind of focused view, every key that means something, a binding for that
// key on the container around it: does the key reach the container's binding, or
// does the focused view answer it itself? The expectation for each cell is what
// the docs promise (guide 09 § Keyboard events; the reference's keyBindings
// sections), written down before the runtime was asked. A cell that disagrees is
// a defect in the runtime or in the docs — never a test to loosen.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate } from "../runtime/dist/instantiate.js";
import { settle, provideMeasurer, Focus, Keys, deliverKeys } from "../runtime/dist/index.js";
import { approximateMeasurer } from "../compiler/dist/headless.js";

provideMeasurer(approximateMeasurer());
deliverKeys(Keys, Focus);

const KEYS = {
  Enter: { key: "Enter", code: "Enter" },
  Escape: { key: "Escape", code: "Escape" },
  Space: { key: " ", code: "Space" },
  Tab: { key: "Tab", code: "Tab" },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown" },
  ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft" },
  "Ctrl+S": { key: "s", code: "KeyS", meta: true },
  A: { key: "a", code: "KeyA" },
};

// The focused view, written inside the container `box` as `f`; `focus` names
// what holds the keyboard (a combobox's field, not the combobox).
const KINDS = {
  view: { src: `f: View [ width = 40, height = 20, focusable = true ]`, focus: (b) => b.f },
  button: { src: `f: Button [ label = "Go" ]`, focus: (b) => b.f },
  checkbox: { src: `f: Checkbox [ label = "On" ]`, focus: (b) => b.f },
  field: { src: `f: TextInput [ width = 100, accessibilityLabel = "Name" ]`, focus: (b) => b.f },
  multiline: { src: `f: TextInput [ width = 100, height = 60, multiline = true, accessibilityLabel = "Note" ]`, focus: (b) => b.f },
  stepper: { src: `f: Stepper [ accessibilityLabel = "Copies" ]`, focus: (b) => b.f },
  slider: { src: `f: Slider [ accessibilityLabel = "Volume" ]`, focus: (b) => b.f },
  combobox: { src: `f: Combobox [ width = 150, accessibilityLabel = "City", items = ["Bern", "Berlin"] ]`, focus: (b) => b.f.entry },
};

// What the docs promise: true — the container's binding hears the key; false —
// the focused view answers it itself.
const OWN = false, ON = true;
const EXPECT = {
  // a plain focusable view answers nothing itself
  view: { Enter: ON, Escape: ON, Space: ON, Tab: ON, ArrowDown: ON, ArrowLeft: ON, "Ctrl+S": ON, A: ON },
  // a Control's own keys: Space and Enter press it (Control § keyBindings)
  button: { Enter: OWN, Escape: ON, Space: OWN, Tab: ON, ArrowDown: ON, ArrowLeft: ON, "Ctrl+S": ON, A: ON },
  checkbox: { Enter: OWN, Escape: ON, Space: OWN, Tab: ON, ArrowDown: ON, ArrowLeft: ON, "Ctrl+S": ON, A: ON },
  // a field: typing and its editing keys are its editor's; Return goes on to
  // what holds it (after onEnter), Escape goes on when nothing is uncommitted,
  // Tab goes on, a command chord goes on (TextInput § keyBindings)
  field: { Enter: ON, Escape: ON, Space: OWN, Tab: ON, ArrowDown: OWN, ArrowLeft: OWN, "Ctrl+S": ON, A: OWN },
  // a multi-line field's Return is a line break
  multiline: { Enter: OWN, Escape: ON, Space: OWN, Tab: ON, ArrowDown: OWN, ArrowLeft: OWN, "Ctrl+S": ON, A: OWN },
  // a spin button: Up and Down step it (Control § keyBindings), Space and Enter
  // are a Control's; Left goes on
  stepper: { Enter: OWN, Escape: ON, Space: OWN, Tab: ON, ArrowDown: OWN, ArrowLeft: ON, "Ctrl+S": ON, A: ON },
  // a slider: every arrow steps it
  slider: { Enter: OWN, Escape: ON, Space: OWN, Tab: ON, ArrowDown: OWN, ArrowLeft: OWN, "Ctrl+S": ON, A: ON },
  // a combobox's field, nothing chosen, list down: Return and Down open the
  // list (Combobox docs: "Enter opens it when nothing is chosen"); typing is the
  // field's
  combobox: { Enter: OWN, Escape: ON, Space: OWN, Tab: ON, ArrowDown: OWN, ArrowLeft: OWN, "Ctrl+S": ON, A: OWN },
};

const spec = (name) => {
  const k = KEYS[name];
  return name === "Ctrl+S" ? "Ctrl+S" : name === "A" ? "A" : name;
};

async function cell(kind, keyName) {
  Focus.reset();
  const src = `App [ width = 600, height = 400, heard: string = "",
    box: View [ x = 20, y = 20, width = 300, height = 100,
      keyBindings = { [ ({ key: "${spec(keyName)}", command: "hear" }) ] },
      hear() { app.heard = app.heard + "box;" },
      ${KINDS[kind].src} ],
    after: Button [ x = 20, y = 200, label = "After" ] ]`;
  const b = await compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  const app = instantiate(b.program);
  settle();
  Focus.setRoot(app);
  const target = KINDS[kind].focus(app.box);
  Focus.focus(target); settle();
  const e = { shift: false, ctrl: false, alt: false, meta: false, repeat: false, ...KEYS[keyName] };
  // a field's Return reaches its onEnter before the walk, as the platform's own field does
  if (keyName === "Enter" && typeof target.onEnter === "function" && target.$leafRole?.() === "textField" && !target.multiline) target.onEnter();
  Keys.keyDown(e); Keys.keyUp(e); settle();
  const heard = app.heard.includes("box;");
  app.discard();
  return heard;
}

const misses = [];
for (const kind of Object.keys(KINDS)) {
  await test(`matrix: a focused ${kind}, a binding on its container`, async () => {
    const got = {};
    for (const key of Object.keys(KEYS)) {
      const heard = await cell(kind, key);
      got[key] = heard;
      if (heard !== EXPECT[kind][key]) misses.push(`${kind} × ${key}: the docs say ${EXPECT[kind][key] ? "the container hears it" : "the view answers it itself"}; the container ${heard ? "heard it" : "did not hear it"}`);
    }
    const wrong = Object.keys(KEYS).filter((k) => got[k] !== EXPECT[kind][k]);
    assert.deepEqual(wrong, [], `${kind}: ${wrong.join(", ")}`);
  });
}

await test("matrix report", () => {
  if (misses.length > 0) console.log("\n  MATRIX MISSES:\n    " + misses.join("\n    "));
});


// ── a field in its contexts ─────────────────────────────────────────────────
// The same single-line field, focused, in each place a real program puts one;
// each key's documented outcome, read off the program afterwards. An App-level
// binding on every key records what reaches the top.

const CONTEXTS = {
  // a Form: Return submits it (Form § enterMoves, TextInput § onEnter)
  form: {
    src: `ctx: Form [ send() { app.log = app.log + "sent;" }, f: TextInput [ width = 100, accessibilityLabel = "Name", name = "name" ], g: TextInput [ y = 30, width = 100, accessibilityLabel = "Other", name = "other" ] ]`,
    open: () => {}, field: (a) => a.ctx.f,
    expect: { Enter: "sent;", Escape: "app:Escape;", Tab: "focus:g" },
  },
  // a Dialog: Return presses its default button; Escape (nothing uncommitted) closes it
  dialog: {
    src: `ctx: Dialog [ title = "Rename", buttons = { [ { id: "cancel", label: "Cancel", cancel: true }, { id: "ok", label: "Rename", default: true } ] },
        picked(id: string) { app.log = app.log + "picked:" + id + ";" },
        f: TextInput [ width = 100, accessibilityLabel = "Name" ] ]`,
    open: (a) => a.ctx.show(), field: (a) => a.ctx.f,
    expect: { Enter: "picked:ok;", Escape: "picked:cancel;", Tab: "focus:inside" },
  },
  // a Form inside a Dialog: Return submits the form, once; the dialog's default
  // button is not pressed as well
  formInDialog: {
    src: `ctx: Dialog [ title = "New", buttons = { [ { id: "cancel", label: "Cancel", cancel: true }, { id: "ok", label: "Add", default: true } ] },
        picked(id: string) { app.log = app.log + "picked:" + id + ";" },
        form: Form [ send() { app.log = app.log + "sent;" }, f: TextInput [ width = 100, accessibilityLabel = "Name", name = "name" ] ] ]`,
    open: (a) => a.ctx.show(), field: (a) => a.ctx.form.f,
    expect: { Enter: "sent;", Escape: "picked:cancel;", Tab: "focus:inside" },
  },
  // a Sheet: Escape closes it; Return goes on (nothing in a sheet answers it)
  sheet: {
    src: `ctx: Sheet [ accessibilityLabel = "Edit", input(v: boolean) { if (!v) app.log = app.log + "closed;"; this.shown = v },
        f: TextInput [ width = 100, accessibilityLabel = "Name" ] ]`,
    open: (a) => a.ctx.show(), field: (a) => a.ctx.f,
    expect: { Enter: "", Escape: "closed;", Tab: "focus:self" },
  },
  // a Popover: Escape closes it; Tab past its only control closes it and goes on past the opener
  popover: {
    src: `opener: Button [ label = "Open", onClick() { app.ctx.showFor(this) } ],
      ctx: Popover [ closed() { app.log = app.log + "closed;" }, f: TextInput [ width = 100, accessibilityLabel = "Name" ] ]`,
    open: (a) => { Focus.focus(a.opener); settle(); a.ctx.showFor(a.opener); }, field: (a) => a.ctx.f,
    expect: { Enter: "", Escape: "closed;focus:opener", Tab: "closed;focus:after" },
  },
  // a row of a list that is one Tab stop: Escape leaves the row for the list
  row: {
    src: `ctx: View [ width = 300, height = 100, focusScope = stop, focusable = true,
        row: View [ width = 300, height = 40, f: TextInput [ width = 100, accessibilityLabel = "Name" ] ] ]`,
    open: () => {}, field: (a) => a.ctx.row.f,
    expect: { Enter: "app:Enter;", Escape: "focus:ctx", Tab: "focus:self" },
  },
};

const OUTCOME_KEYS = ["Enter", "Escape", "Tab"];

async function contextCell(name, keyName) {
  Focus.reset();
  const c = CONTEXTS[name];
  const src = `App [ width = 800, height = 600, log: string = "",
    keyBindings = { [ ({ key: "Enter", command: "top", args: ["Enter"] }), ({ key: "Escape", command: "top", args: ["Escape"] }) ] },
    top(k: string) { app.log = app.log + "app:" + k + ";" },
    ${c.src},
    after: Button [ x = 20, y = 500, label = "After" ] ]`;
  const b = await compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  const app = instantiate(b.program);
  settle();
  Focus.setRoot(app);
  c.open(app); settle();
  const f = c.field(app);
  Focus.focus(f); settle();
  const e = { shift: false, ctrl: false, alt: false, meta: false, repeat: false, ...KEYS[keyName] };
  if (keyName === "Enter") f.onEnter();
  Keys.keyDown(e); Keys.keyUp(e); settle();
  await new Promise((r) => setTimeout(r, 30)); settle();
  let out = app.log;
  if (keyName === "Tab" || keyName === "Escape") {
    const now = Focus.getFocus();
    const where = now === f ? (keyName === "Tab" ? "focus:self" : "") : now === app.opener ? "focus:opener" : now === app.after ? "focus:after" : now === app.ctx ? "focus:ctx" : now === app.ctx?.g ? "focus:g"
      : now !== null && (function inside(v) { for (let p = v; p; p = p.parent) if (p === app.ctx) return true; return false; })(now) ? "focus:inside" : now === null ? "focus:none" : "focus:other";
    if (keyName === "Tab" || where !== "") out = out + where;
  }
  app.discard();
  return out;
}

const ctxMisses = [];
for (const name of Object.keys(CONTEXTS)) {
  await test(`matrix: a field in a ${name}`, async () => {
    const wrong = [];
    for (const key of OUTCOME_KEYS) {
      const got = await contextCell(name, key);
      const want = CONTEXTS[name].expect[key];
      if (got !== want) { wrong.push(`${key}: want "${want}", got "${got}"`); ctxMisses.push(`${name} × ${key}: want "${want}", got "${got}"`); }
    }
    assert.deepEqual(wrong, []);
  });
}

await test("context matrix report", () => {
  if (ctxMisses.length > 0) console.log("\n  CONTEXT MISSES:\n    " + ctxMisses.join("\n    "));
});


// ── found by adversarial programs ───────────────────────────────────────────
// Each a defect a program written against the docs ran into; each written as
// what the docs promise.

async function boot(src) {
  Focus.reset();
  const b = await compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  const app = instantiate(b.program);
  settle();
  Focus.setRoot(app);
  return app;
}
const tick = async (ms = 30) => { await new Promise((r) => setTimeout(r, ms)); settle(); };
const press = (e) => { e = { shift: false, ctrl: false, alt: false, meta: false, repeat: false, ...e }; Keys.keyDown(e); Keys.keyUp(e); settle(); };

await test("a press on a focusable view focuses it (guide 09: a click moves focus to what was clicked)", async () => {
  const app = await boot(`App [ width = 400, height = 200, n: number = 0,
    counter: View [ width = 200, height = 60, focusable = true,
      keyBindings = { [ ({ key: "ArrowUp", command: "bump" }) ] }, bump() { app.n = app.n + 1 },
      Text [ text = "count" ] ] ]`);
  assert.equal(app.counter.$takesPointer(), true);
  Focus.pressAt(app.counter.children.find((c) => c.text === "count")); await tick(0);
  assert.equal(Focus.getFocus(), app.counter);
  press(KEYS.ArrowDown); press({ key: "ArrowUp", code: "ArrowUp" });
  assert.equal(app.n, 1);
  app.discard();
});

await test("a command button keeps the focus where it was; the command reaches the focused view", async () => {
  const app = await boot(`App [ width = 400, height = 200, on: boolean = false,
    go: Button [ label = "Bold", command = "bold" ],
    ed: View [ y = 50, width = 200, height = 60, focusable = true,
      keyBindings = { [ ({ command: "bold" }) ] }, bold() { app.on = !app.on } ] ]`);
  Focus.pressAt(app.ed); await tick(0);
  assert.equal(Focus.getFocus(), app.ed);
  Focus.pressAt(app.go); app.go.onClick?.(); await tick(0);
  assert.equal(app.on, true);
  assert.equal(Focus.getFocus(), app.ed);
  app.discard();
});

await test("Tab leaves a MenuBar's titles for the next control, and Shift+Tab comes back", async () => {
  const app = await boot(`App [ width = 600, height = 300,
    bar: MenuBar [ width = 600, menus = { [ ({ id: "file", label: "File", items: [ ({ id: "new", label: "New" }) ] }), ({ id: "edit", label: "Edit", items: [ ({ id: "z", label: "Zed" }) ] }) ] } ],
    a: Button [ y = 60, label = "A" ] ]`);
  Focus.focus(app.a); settle();
  press({ key: "Tab", code: "Tab", shift: true });
  const inBar = (v) => { for (let p = v; p; p = p.parent) if (p === app.bar) return true; return false; };
  assert.ok(inBar(Focus.getFocus()), "Shift+Tab from A reaches the menu bar");
  press(KEYS.Tab);
  assert.equal(Focus.getFocus(), app.a, "Tab from the menu bar goes on to A");
  app.discard();
});

await test("a button's menu offers the commands of what the button runs for", async () => {
  const app = await boot(`App [ width = 600, height = 300, log: string = "",
    keyBindings = { [ ({ command: "bold" }) ] }, bold() { app.log = app.log + "bold;" },
    m: Menu [ items = { [ ({ label: "Bold", command: "bold" }), ({ label: "Italic", command: "italic" }) ] } ],
    b: Button [ label = "Format", menu = { app.m } ] ]`);
  Focus.focus(app.b); settle();
  app.m.showFor(app.b); settle(); await tick();
  assert.equal(app.m._commandOn("bold"), true, "Bold is bound above, so its row is live");
  assert.equal(app.m._commandOn("italic"), false, "nothing binds Italic");
  app.m._pickItem("", "bold"); await tick();
  assert.equal(app.log, "bold;");
  app.discard();
});

await test("a focused row removed from its list: the next Tab goes on from where it stood", async () => {
  const app = await boot(`App [ width = 600, height = 400,
    items: Dataset { { "rows": [ { "id": 1, "t": "one" }, { "id": 2, "t": "two" }, { "id": 3, "t": "three" } ] } },
    rows: View [ datapath = { app.items.value }, layout: SimpleLayout [ axis = y ],
      Button [ datapath = :rows[], label = :t ] ],
    after: Button [ x = 300, label = "After" ] ]`);
  const btn = (t) => app.rows.children.find((v) => v.label === t);
  Focus.focus(btn("two")); settle();
  app.items.set(["rows"], app.items.value.rows.filter((r) => r.t !== "two")); settle(); await tick();
  press(KEYS.Tab);
  assert.equal(Focus.getFocus()?.label, "three");
  app.discard();
});

await test("a row deleted from its own confirm dialog: focus lands on the row after it", async () => {
  const app = await boot(`App [ width = 600, height = 400, target: number = 0,
    items: Dataset { { "rows": [ { "id": 1, "t": "one" }, { "id": 2, "t": "two" }, { "id": 3, "t": "three" } ] } },
    rows: View [ datapath = { app.items.value }, layout: SimpleLayout [ axis = y ],
      Button [ datapath = :rows[], label = :t, onClick() { app.target = :id; app.confirm.ask("Delete?", "", (id) => { if (id == "yes") app.items.set(["rows"], app.items.value.rows.filter((r) => r.id != app.target)) }) } ] ],
    confirm: Dialog [ ] ]`);
  const two = app.rows.children.find((v) => v.label === "two");
  Focus.focus(two); settle();
  two.onClick(); settle(); await tick();
  app.confirm.pick("yes"); settle(); await tick(60);
  assert.equal(Focus.getFocus()?.label, "three");
  app.discard();
});

summarize("key-matrix");
