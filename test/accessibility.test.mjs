// test/accessibility.test.mjs — what a program is to assistive technology
// (docs/system-design/accessibility.md): the vocabulary, the role contracts the
// compiler checks, and the semantic tree every platform is given.
//
// The two requirements the design answers are held here directly: an author's
// view is accessible by exactly the means the library's are (the contract is
// checked by name and type, and the tree's code names no library class), and
// none of it costs anything on a view that leaves it unset.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate, createViewIn } from "../runtime/dist/instantiate.js";
import { settle, provideMeasurer, HeadlessBackend } from "../runtime/dist/index.js";
import { approximateMeasurer } from "../compiler/dist/headless.js";
import { semanticTree, formatSemantics, NAMED_BY_CONTENT, PRESSED, STEPPED } from "../runtime/dist/semantics.js";
import { slotIndex } from "../runtime/dist/attributes.js";
import { View } from "../runtime/dist/view.js";
import { A11Y_MEMBERS, ROLES, ROLE_CONTRACTS } from "../runtime/dist/a11y-roles.js";

provideMeasurer(approximateMeasurer());

const compile = (src) => compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
const a11y = (xs) => xs.filter((e) => /accessibility|DECLARE20(06|07)|DECLARE401[678]/.test(`${e.code} ${e.message}`));
const codes = (xs) => a11y(xs).map((e) => e.code);
async function boot(src) {
  const b = await compile(src);
  assert.deepEqual(b.errors.map((e) => e.message), []);
  const app = instantiate(b.program);
  settle();
  return app;
}
const tree = (app) => formatSemantics(semanticTree(app));

const WAVE = `class Wave extends View [ position: number = 12, duration: number = 65,
  accessibilityRole = slider, accessibilityLabel = "Voice message",
  accessibilityMin = 0, accessibilityMax = { duration }, accessibilityValue = { position },
  accessibilityValueText = { position + "s of " + duration + "s" },
  accessibilityIncrement() { position = position + 5 }, accessibilityDecrement() { position = position - 5 } ]`;

// ── the contract ──────────────────────────────────────────────────────────────

await test("an author's view meets a role's contract the way any class does, and compiles clean", async () => {
  const b = await compile(`${WAVE}\nApp [ Wave [ ] ]`);
  assert.deepEqual(a11y(b.errors), []);
  assert.deepEqual(a11y(b.warnings), []);
});

await test("a role whose contract is not met is an error naming every missing member", async () => {
  const b = await compile(`class Wave extends View [ accessibilityRole = slider, accessibilityLabel = "Voice", accessibilityMin = 0 ]\nApp [ Wave [ ] ]`);
  assert.deepEqual(codes(b.errors), ["DECLARE2006"]);
  const m = b.errors[0].message;
  for (const missing of ["accessibilityValue", "accessibilityMax", "accessibilityIncrement()", "accessibilityDecrement()"]) assert.match(m, new RegExp(missing.replace(/[()]/g, "\\$&")));
  assert.doesNotMatch(m, /no accessibilityMin/);
});

await test("a subclass inherits the contract its base met, and a use site may meet it too", async () => {
  const b = await compile(`${WAVE}\nclass LongWave extends Wave [ duration = 600 ]
class Bare extends View [ press() { } ]
App [ LongWave [ ], Bare [ accessibilityRole = button, accessibilityLabel = "Go" ] ]`);
  assert.deepEqual(a11y(b.errors), []);
});

await test("a role is a word: a { } role is an error", async () => {
  const b = await compile(`App [ on: boolean = true, View [ accessibilityRole = { app.on ? "button" : "none" } ] ]`);
  assert.deepEqual(codes(b.errors), ["DECLARE2007"]);
});

await test("a role is fixed for the view's life: written after the view is built, it throws", async () => {
  const app = await boot(`App [ v: View [ accessibilityRole = group ] ]`);
  assert.equal(app.v.accessibilityRole, "group");
  assert.throws(() => { app.v.accessibilityRole = "button"; }, /fixed for the view's life/);
});

await test("a role given to createView is checked as it is created, in the compiler's words", async () => {
  // a class created by name is kept with `use`, in every mode
  const app = await boot(`use [ View ]\nApp [ ]`);
  assert.throws(() => createViewIn(app, "View", app, { accessibilityRole: "slider", accessibilityLabel: "Volume" }),
    /declares accessibilityRole = slider[\s\S]*no accessibilityValue/);
  const ok = createViewIn(app, "View", app, { accessibilityRole: "group", accessibilityLabel: "Tools" });
  assert.equal(ok.accessibilityRole, "group");
});

// ── the warnings ──────────────────────────────────────────────────────────────

await test("a Control is a button; a role that needs a name with none is a warning — words, a tip or a named mark are names", async () => {
  const b = await compile(`class Chip extends Control [ ]
class B extends View [ accessibilityRole = button, press() { } ]
App [ Chip [ ], Chip [ accessibilityLabel = "Tag" ], Chip [ tooltipLabel = "Tag" ], Chip [ CloseIcon [ ] ],
    B [ ], B [ Text [ text = "Send" ] ], B [ accessibilityLabel = "Close" ] ]`);
  assert.deepEqual(a11y(b.errors), []);
  assert.deepEqual(codes(b.warnings).sort(), ["DECLARE4017", "DECLARE4017"]);
});

await test("a wordless control is named by its tip, else by the mark it shows; words win", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    layout: SimpleLayout [ axis = y ],
    Control [ width = 20, height = 20, CloseIcon [ ] ],
    Control [ width = 20, height = 20, tooltipLabel = "Dismiss", CloseIcon [ ] ],
    Control [ width = 80, height = 20, PlusIcon [ ], Text [ x = 20, text = "New" ] ]
    ]`);
  assert.equal(tree(app), `application\n  button "Close" {press}\n  button "Dismiss" {press}\n  button "New" {press}`);
});

await test("a drawn view that takes the focus and says nothing is a warning", async () => {
  const b = await compile(`class Dial extends View [ focusable = true, draw(d: DrawContext) { } ]\nApp [ Dial [ ] ]`);
  assert.deepEqual(codes(b.warnings), ["DECLARE4018"]);
});

await test("accessibility = false silences the warnings, not the errors", async () => {
  const off = await compile(`defaultFlags [ accessibility = false ]\nclass Chip extends Control [ ]\nApp [ Chip [ ] ]`);
  assert.deepEqual(a11y(off.warnings), []);
  const broken = await compile(`defaultFlags [ accessibility = false ]\nApp [ View [ accessibilityRole = slider ] ]`);
  assert.deepEqual(codes(broken.errors), ["DECLARE2006"]);
});

/** The lines (1-based) a source's warnings of one code sit on. */
const warnedLines = (b, code) => b.warnings.filter((w) => w.code === code).map((w) => w.pos.line).sort((x, y) => x - y);

await test("a control whose label is left empty has no name, wherever its class shows the label; the warning names both fixes", async () => {
  const b = await compile(`App [ width = 400, height = 400, layout: SimpleLayout [ axis = y ],
    d: Dataset { { "rows": [ { "title": "Water the plants", "done": false } ] } },
    View [ datapath = { app.d.value.rows[0] }, Checkbox [ checked = :done ], Text [ text = :title ] ],
    Button [ ],
    Radio [ ],
    ToolButton [ ],
    Gauge [ ],
    Combobox [ ],
    TextInput [ ],
    View [ datapath = { app.d.value.rows[0] }, Checkbox [ checked = :done, accessibilityLabel = :title ], Text [ text = :title ] ],
    Checkbox [ label = "Mute" ], Button [ label = "Go" ], Button [ Text [ text = "Go" ] ], Radio [ label = { "Large" } ],
    ToolButton [ icon = "PlusIcon", label = "Add" ], Gauge [ label = "Disk" ], Combobox [ placeholder = "City" ],
    TextInput [ placeholder = "Search" ], Field [ label = "Name", TextInput [ ] ], Field [ label = "Muted", Checkbox [ ] ],
    Button [ iconLeft = "CloseIcon" ], CloseIcon [ ] ]`);
  assert.deepEqual(warnedLines(b, "DECLARE4017"), [3, 4, 5, 6, 7, 8, 9]);
  const box = b.warnings.find((w) => w.code === "DECLARE4017" && w.pos.line === 3).message;
  assert.match(box, /Checkbox is a checkbox with no name/);
  assert.match(box, /Give it a label \("Mute"\), or, where the words that name it are shown apart from it .*accessibilityLabel/);
  assert.match(b.warnings.find((w) => w.code === "DECLARE4017" && w.pos.line === 9).message, /TextInput is a textField with no name/);
});

await test("a label a method writes, or a state sets, may say something, and is not warned of", async () => {
  const b = await compile(`class Named extends Control [ label: string = "", Text [ text = { label } ], onInit() { label = "Ready" } ]
App [ width = 200, height = 200, Named [ ], Dialog [ ], Checkbox [ State [ applied = { app.width > 1 }, label = "On" ] ] ]`);
  assert.deepEqual(warnedLines(b, "DECLARE4017"), []);
});

await test("a control inside a control is a warning naming both, written there or brought in by a class", async () => {
  const b = await compile(`class Row [ Checkbox [ label = "Done" ] ]
class PlanCard extends Control [ width = 200, height = 60, Text [ text = "Plan" ],
    open: Button [ label = "Open" ] ]
App [ width = 400, height = 400, layout: SimpleLayout [ axis = y ],
    Button [ label = "Save", Checkbox [ label = "Also close" ] ],
    Control [ width = 100, height = 30, Text [ text = "Pick" ], Row [ ] ],
    PlanCard [ ],
    View [ Button [ label = "Save" ], Checkbox [ label = "Also close" ] ],
    Control [ width = 100, height = 30, accessibilityRole = group, Button [ label = "Inside a group" ] ] ]`);
  assert.deepEqual(warnedLines(b, "DECLARE4020"), [3, 5, 6]);
  const m = b.warnings.find((w) => w.code === "DECLARE4020" && w.pos.line === 5).message;
  assert.match(m, /Checkbox \(a checkbox\) is inside Button \(a button\)/);
  assert.match(m, /Make them siblings in a plain View/);
  assert.match(b.warnings.find((w) => w.code === "DECLARE4020" && w.pos.line === 6).message, /Checkbox in Row/);
});

await test("a control showing it is the one chosen, with no state reported, is warned of; one that reports it, or opens a menu, is not", async () => {
  const b = await compile(`class Choice extends Control [ width = 60, height = 44, on: boolean = false, label: string = "",
    TextLabel [ text = { classroot.label } ] ]
class Told extends Control [ width = 60, height = 44, on: boolean = false, accessibilityPressed = { on }, label: string = "",
    TextLabel [ text = { classroot.label } ] ]
class Opener extends Control [ width = 60, height = 44, on: boolean = false, label: string = "",
    TextLabel [ text = { classroot.label } ] ]
App [ width = 400, height = 300, pick: string = "a", layout: SimpleLayout [ axis = x ],
    Choice [ label = "A", on = { app.pick == "a" }, press() { app.pick = "a" } ],
    Told [ label = "B", on = { app.pick == "b" }, press() { app.pick = "b" } ],
    Opener [ label = "Sort", menu = { app.m } ],
    m: Menu [ items = { [ ({ id: "x", label: "X" }) ] } ] ]`);
  assert.deepEqual(warnedLines(b, "DECLARE4022"), [1]);
  const m = b.warnings.find((w) => w.code === "DECLARE4022").message;
  assert.match(m, /Choice shows whether it is the one chosen \('on'\)/);
  assert.match(m, /use Segmented/);
  assert.match(m, /accessibilityPressed = \{ on \}/);
});

await test("a list's row may hold an editor: no warning, and the row is named by its own words, each control reached apart", async () => {
  const src = `class Item extends View [ accessibilityRole = option, accessibilitySelected = false, height = 90, press() { },
    layout: SimpleLayout [ axis = y ],
    Text [ text = "Fix login" ],
    TextInput [ width = 160, accessibilityLabel = "Title", text = "Fix login", onInput(v: string) { } ],
    Button [ label = "Save" ] ]
App [ width = 400, height = 300, View [ accessibilityRole = listbox, accessibilityLabel = "Issues", width = 400, height = 200, Item [ width = 400 ] ] ]`;
  assert.deepEqual(warnedLines(await compile(src), "DECLARE4020"), []);
  const t = tree(await boot(src));
  assert.match(t, /option "Fix login"/, t);
  assert.doesNotMatch(t, /option "[^"]*(Save|Fix login Fix login)/, t);
  assert.match(t, /textField "Title"/, t);
  assert.match(t, /button "Save"/, t);
});

await test("a view that clips what it holds to a size of 0, with no visible, is warned of; one that says visible is not", async () => {
  const b = await compile(`class Drawer [ open: boolean = false, clip = true, width = 200, height = { open ? 120 : 0 }, Text [ text = "Notes" ] ]
App [ width = 400, height = 400, layout: SimpleLayout [ axis = y ],
    Drawer [ ],
    View [ clip = true, width = 0, height = 40, Text [ text = "Hidden" ] ],
    View [ clip = true, height = 0, visible = { this.height > 0 }, Text [ text = "Hidden" ] ],
    View [ height = 0, Text [ text = "Overhangs, and is seen" ] ],
    View [ clip = true, width = 0, height = 0 ],
    View [ clip = true, height = { app.width > 500 ? 80 : 0 }, Text [ visible = { app.width > 500 }, text = "Shown when open" ] ] ]`);
  assert.deepEqual(warnedLines(b, "DECLARE4021"), [1, 4]);
  assert.match(b.warnings.find((w) => w.code === "DECLARE4021").message, /Add visible = \{ this\.height > 0 \}/);
});

await test("the warnings cover a program's own included files, and leave the class library out", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { nodeIncludeHost } = await import("../compiler/dist/include-node.js");
  const dir = mkdtempSync(tmpdir() + "/a11y-");
  writeFileSync(`${dir}/part.declare`, `class Part [ Checkbox [ ] ]\n`);
  const b = await compileProgram(`include [ "part.declare" ]\nApp [ width = 200, height = 200, Part [ ] ]`,
    { originDir: dir, stripPos: false, host: nodeIncludeHost(process.cwd() + "/library") });
  const w = b.warnings.filter((x) => x.code === "DECLARE4017");
  assert.equal(w.length, 1);
  assert.match(w[0].pos.file ?? "", /part\.declare$/);
});

// ── the semantic tree ─────────────────────────────────────────────────────────

await test("the tree: an author's slider reads as a slider, with its value, range and actions", async () => {
  const app = await boot(`${WAVE}\nApp [ width = 400, height = 300, w: Wave [ width = 200, height = 30 ] ]`);
  app.w.accessibilityIncrement(); settle();
  assert.equal(tree(app), `application\n  slider "Voice message" = "17s of 65s" 17 (0–65) {increment, decrement}`);
});

await test("the tree: views with no role are transparent, hidden and faded-out views are pruned, text is content", async () => {
  const app = await boot(`class B extends View [ accessibilityRole = button, press() { } ]
App [ width = 400, height = 300, layout: SimpleLayout [ axis = y ],
  View [ View [ Text [ text = "Inbox" ] ] ],
  B [ width = 80, height = 30, Text [ text = "Send" ] ],
  B [ width = 30, height = 30, accessibilityLabel = "Close", accessibilityHint = "Closes the conversation" ],
  View [ visible = false, B [ accessibilityLabel = "Hidden" ] ],
  View [ opacity = 0, Text [ text = "Faded" ] ],
  B [ width = 80, height = 30, Text [ text = "Archive" ], Text [ opacity = 0, text = "Undo" ] ] ]`);
  assert.equal(tree(app), [
    "application",
    `  text "Inbox"`,
    `  button "Send" {press}`,
    `  button "Close" hint "Closes the conversation" {press}`,
    `  button "Archive" {press}`,
  ].join("\n"), "a faded view is not read, nor does it name the control it sits in");
});

await test("the tree: a long list reports every row it holds, and builds nodes only for the rows on screen", async () => {
  const app = await boot(`class Row extends View [ accessibilityRole = listItem, height = 20, width = 200, Text [ text = { "Item " + :n } ] ]
App [ width = 400, height = 100, d: Dataset { { "rows": [] } },
  onInit() { const rows = []; for (let i = 0; i < 30500; i++) rows.push({ n: i }); d.set([], { rows }) },
  list: View [ width = 400, height = 100, scrolls = y, accessibilityRole = list, accessibilityLabel = "Messages", datapath = { d.value },
    layout: SimpleLayout [ axis = y ], Row [ datapath = :rows[], virtualize = true ] ] ]`);
  const list = semanticTree(app).children[0];
  assert.equal(list.role, "list");
  assert.equal(list.rowCount, 30500);
  assert.ok(list.children.length > 0 && list.children.length < 100, `${list.children.length} rows built`);
  assert.deepEqual(list.children.slice(0, 2).map((r) => [r.name, r.rowIndex]), [["Item 0", 1], ["Item 1", 2]]);
});

await test("the tree: behind an open modal, everything is inert", async () => {
  const app = await boot(`App [ width = 400, height = 300, View [ accessibilityRole = button, accessibilityLabel = "Behind", press() { } ],
  dlg: View [ focusScope = modal, accessibilityRole = dialog, accessibilityLabel = "Confirm",
    View [ accessibilityRole = button, accessibilityLabel = "OK", press() { } ] ] ]`);
  assert.equal(tree(app), `application\n  dialog "Confirm" [modal]\n    button "OK" {press}`);
  app.dlg.visible = false; settle();
  assert.equal(tree(app), `application\n  button "Behind" {press}`);
});

await test("the tree: a rich document reads as headings, paragraphs, lists and links", async () => {
  const app = await boot(`App [ width = 500, height = 400, Markdown [ width = 500, text = "# Title\\n\\nSee [the guide](#guide).\\n\\n- one\\n- two" ] ]`);
  assert.equal(tree(app), [
    "application",
    `  heading "Title" level 1`,
    `  text "See the guide."`,
    `    link "the guide" {press}`,
    `  list 2 rows`,
    `    listItem "one" row 1`,
    `    listItem "two" row 2`,
  ].join("\n"));
});

await test("the tree: a field is a textField named by its placeholder; an unnamed picture is decoration", async () => {
  const app = await boot(`App [ width = 400, height = 300, layout: SimpleLayout [ axis = y ],
  TextInput [ width = 200, placeholder = "Search", text = "birds" ],
  Image [ width = 20, height = 20 ], Image [ width = 20, height = 20, accessibilityLabel = "Avatar" ] ]`);
  assert.equal(tree(app), `application\n  textField "Search" = "birds"\n  image "Avatar"`);
});

await test("accessibilityHidden: seen, not read — pruned from the tree with all it holds, and it names nothing", async () => {
  const app = await boot(`App [ width = 400, height = 300, layout: SimpleLayout [ axis = y ],
  Text [ text = "Inbox" ], Text [ text = "★", accessibilityHidden = true ],
  View [ accessibilityHidden = true, Text [ text = "decor" ] ],
  Button [ width = 80, height = 30, View [ Text [ text = "Save" ] ], View [ accessibilityHidden = true, Text [ text = "⌘S" ] ] ] ]`);
  assert.equal(tree(app), `application\n  text "Inbox"\n  button "Save" {press}`);
});

await test("accessibilityHidden on a control, or on a view that holds one, is a warning (4027); on decoration it is quiet", async () => {
  const b = await compile(`App [ layout: SimpleLayout [ axis = y ],
    Button [ label = "Go", accessibilityHidden = true ],
    View [ accessibilityHidden = true, Button [ label = "Stop" ] ],
    View [ accessibilityHidden = { 1 > 0 }, Text [ text = "x" ] ],
    Button [ label = "Shown", accessibilityHidden = false ] ]`);
  assert.deepEqual(codes(b.warnings), ["DECLARE4027", "DECLARE4027"]);
  assert.match(b.warnings.find((w) => w.code === "DECLARE4027").message, /Tab still reaches it/);
});

await test("expanded: a menu button and an accordion header say whether what they open is open", async () => {
  const app = await boot(`App [ width = 400, height = 400, layout: SimpleLayout [ axis = y ],
    opts: Button [ label = "Options", menu = { app.m } ],
    m: Menu [ items = { [ ({ id: "a", label: "Copy" }) ] } ],
    Accordion [ width = 300, AccordionPane [ label = "First", initiallyOpen = true, Text [ text = "inside" ] ], AccordionPane [ label = "Second" ] ] ]`);
  const line = (name) => tree(app).split("\n").find((l) => l.includes(`"${name}"`)) ?? "";
  assert.match(line("Options"), /\[collapsed\]/);
  assert.match(tree(app), /button "First" \[expanded\]/);
  assert.match(tree(app), /button "Second" \[collapsed\]/);
  app.opts.openMenu(); settle();
  assert.match(line("Options"), /\[expanded\]/);
});

await test("the wider vocabulary: a search field, a radio group, landmarks, a separator", async () => {
  const app = await boot(`App [ width = 400, height = 400, layout: SimpleLayout [ axis = y ],
    nav: View [ accessibilityRole = navigation, accessibilityLabel = "Sections",
      Segmented [ value = { "a" }, input(v: object) { }, choices = { [ ({ id: "a", label: "All" }), ({ id: "b", label: "Mine" }) ] } ] ],
    View [ accessibilityRole = main, find: SearchField [ width = 200, placeholder = "Search messages" ] ],
    m: Menu [ items = { [ ({ id: "a", label: "Copy" }), ({ divider: true }), ({ id: "b", label: "Paste" }) ] } ] ]`);
  const t = tree(app);
  assert.match(t, /navigation "Sections"\n    radioGroup\n      radio "All" row 1 \[checked\]/);
  assert.match(t, /main\n    searchBox "Search messages"/);
  const b = await compile(`App [ SearchField [ ], SearchField [ placeholder = "Find" ] ]`);
  assert.deepEqual(codes(b.warnings), [], "a placeholder names a search field");
});

await test("Accessibility.announce: a handler says something with no view to say it from", async () => {
  const { Accessibility } = await import("../runtime/dist/accessibility-service.js");
  const app = await boot(`App [ n: number = 0, send() { n = n + 1; Accessibility.announce("Message sent") },
    alarm() { Accessibility.announce("Connection lost", "assertive") } ]`);
  app.send(); app.alarm();
  assert.deepEqual(Accessibility.announced().slice(-2), [{ text: "Message sent", politeness: "polite" }, { text: "Connection lost", politeness: "assertive" }]);
});

await test("a scroller holding nothing focusable is a Tab stop, and its keys scroll it; one holding a control is not", async () => {
  const { Focus } = await import("../runtime/dist/index.js");
  // lines of a fixed height (headless, a Text has no height until a renderer measures it)
  const lines = Array.from({ length: 60 }, () => `View [ width = 280, height = 20 ]`).join(", ");
  const app = await boot(`App [ width = 400, height = 400, layout: SimpleLayout [ axis = y ],
    a: Button [ label = "Before" ],
    prose: View [ width = 300, height = 100, scrolls = y, layout: SimpleLayout [ axis = y ], ${lines} ],
    withButton: View [ width = 300, height = 100, scrolls = y, layout: SimpleLayout [ axis = y ], ${lines}, inner: Button [ label = "Inside" ] ],
    b: Button [ label = "After" ] ]`);
  const order = [];
  Focus.focus(app.a); settle();
  for (let i = 0; i < 4; i++) { Focus.next(); settle(); order.push(Focus.getFocus()); }
  assert.deepEqual(order.slice(0, 3), [app.prose, app.withButton.inner, app.b], "the bare pane is a stop; the other is entered");
  Focus.focus(app.prose); settle();
  const key = (k, extra = {}) => { app.prose.onKeyDown({ key: k, shift: false, ctrl: false, alt: false, meta: false, repeat: false, ...extra }); settle(); };
  key("ArrowDown"); assert.equal(app.prose.scrollY, 40);
  key("PageDown"); assert.equal(app.prose.scrollY, 130);
  key("End"); assert.ok(app.prose.scrollY > 500, `End reached the end (${app.prose.scrollY})`);
  key("Home"); assert.equal(app.prose.scrollY, 0);
});

// ── the two requirements, held ────────────────────────────────────────────────

await test("authoring parity: the tree and the contracts name no library class", () => {
  const libraryClasses = new Set();
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}/${e.name}`);
      else if (e.name.endsWith(".declare")) for (const m of readFileSync(`${dir}/${e.name}`, "utf8").matchAll(/^\s*class (\w+) extends/gm)) libraryClasses.add(m[1]);
    }
  };
  walk("library");
  assert.ok(libraryClasses.has("Slider") && libraryClasses.has("Button"), "the library's classes were read");
  for (const f of ["runtime/src/semantics.ts", "runtime/src/a11y-roles.ts", "compiler/src/a11y-check.ts"]) {
    const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/`[^`]*`|"[^"\n]*"/g, "\"\"");
    const named = [...libraryClasses].filter((c) => new RegExp(`\\b${c}\\b`).test(code));
    assert.deepEqual(named, [], `${f} names a library class`);
  }
});

await test("pay-per-use: no accessibility attribute takes a slot in a view's kernel block", () => {
  for (const name of ["accessibilityRole", "accessibilityLabel", "accessibilityHint", "accessibilityHidden", "accessibilityLive", ...A11Y_MEMBERS]) {
    assert.equal(slotIndex(View, name), -1, `${name} is a block slot`);
  }
});

await test("the vocabulary: every role token parses as a literal, `switch` and `none` included", async () => {
  for (const role of ROLES) {
    const b = await compile(`App [ View [ accessibilityRole = ${role}, accessibilityLabel = "x", accessibilityValue = 1, accessibilityMin = 0, accessibilityMax = 2,
      accessibilityChecked = false, accessibilityPressed = false, accessibilitySelected = false,
      press() { }, accessibilityIncrement() { }, accessibilityDecrement() { } ] ]`);
    assert.deepEqual(b.errors.map((e) => e.message), [], role);
  }
});

await test("accessibility = false: the build carries none of the layer — no attribute, no contract, no binding", async () => {
  const { buildProduction } = await import("../tools/declarec.mjs");
  const src = (flag) => `${flag ? "defaultFlags [ accessibility = false ]\n" : ""}App [ Slider [ accessibilityLabel = "Volume" ], Checkbox [ label = "Mute" ], Button [ label = "Go" ] ]`;
  const js = async (s) => (await buildProduction(s, { name: "a11y" })).files.filter((f) => f.name.endsWith(".js")).map((f) => f.contents).join("");
  const off = await js(src(true)), on = await js(src(false));
  // no attribute, no binding, no contract: what remains is Control's key handler,
  // whose slider branch reads a role nothing set and so never runs
  for (const word of ["accessibilityValue", "accessibilityChecked", "accessibilityLabel", "accessibilityMin", "alertDialog", "nameFromContent", "fixed for the view"]) {
    assert.ok(!off.includes(word), `the layer-off build carries ${word}`);
  }
  assert.ok(on.includes("accessibilityRole") && on.includes("accessibilityIncrement"), "the layer-on build carries it");
});

await test("the semantic tree's role sets agree with the contracts it no longer ships", () => {
  for (const [role, k] of Object.entries(ROLE_CONTRACTS)) {
    assert.equal(NAMED_BY_CONTENT.has(role), k.nameFromContent === true, `${role}: named by its content`);
    const methods = [...k.methods, ...(k.mayMethods ?? [])];
    if (methods.includes("press")) assert.ok(PRESSED.has(role), `${role}: pressed`);
    assert.equal(STEPPED.has(role), methods.includes("accessibilityIncrement"), `${role}: stepped`);
  }
});

await test("a button given an empty label has no name, and is warned of", async () => {
  const warned = async (src) => (await compile(src)).warnings.filter((w) => /DECLARE4017/.test(w.code ?? "") || /with no name/.test(w.message)).length;
  assert.equal(await warned(`App [ width = 100, height = 100, Button [ label = "" ] ]`), 1);
  assert.equal(await warned(`App [ width = 100, height = 100, Button [ label = "", tooltipLabel = "Refresh" ] ]`), 0, "a tip names it");
  assert.equal(await warned(`App [ width = 100, height = 100, Button [ label = "Go" ] ]`), 0);
});

await test("the item a composite names as the one the keys are on is marked active, wherever it sits", async () => {
  const app = await boot(`App [ width = 300, height = 200, on: number = 1,
    list: View [ accessibilityRole = listbox, accessibilityLabel = "Fruit",
        accessibilityActiveItem = { app.on == 1 ? this.b : this.a },
        a: View [ accessibilityRole = option, accessibilityLabel = "Apple", press() { } ],
        b: View [ accessibilityRole = option, accessibilityLabel = "Banana", press() { } ] ] ]`);
  assert.match(tree(app), /option "Banana" \[active\]/);
  assert.doesNotMatch(tree(app), /option "Apple" \[active\]/);
  app.on = 0; settle();
  assert.match(tree(app), /option "Apple" \[active\]/);
});

// A field says what is wrong with its value, and that it needs one: its own
// `error` is passed to `accessibilityError`, and with `judgeOn = leave` the
// message waits until the field has been left (or judge() asked) while `valid`
// is true to the draft throughout.
await test("an invalid field says what is wrong, once judged, and that it is required", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    d: Dataset { { "name": "" } },
    name: TextInput [ width = 240, accessibilityLabel = "Display name", accessibilityRequired = true,
        text <-> :name, datapath = { app.d.value }, judgeOn = leave,
        validate(v: string) -> string { return v.trim().length < 3 ? "Use at least three letters." : "" } ] ]`);
  app.$attach(new HeadlessBackend(), null);
  settle();
  const f = app.name;
  f.$onNativeInput("ab");
  settle();
  assert.equal(f.valid, false, "valid is true to the draft at once");
  assert.equal(f.error, "", "the message waits for the field to be left");
  assert.match(tree(app), /textField "Display name" = "ab" \[required\]/);
  f.judge();
  settle();
  assert.equal(f.error, "Use at least three letters.");
  assert.equal(f.accessibilityError, "Use at least three letters.", "the field passes its error on");
  assert.match(tree(app), /textField "Display name" = "ab" error "Use at least three letters\." \[required, invalid\]/);
  f.$onNativeInput("Ada Lovelace");
  settle();
  assert.equal(f.error, "", "judged once, it follows each edit");
  assert.doesNotMatch(tree(app), /invalid/);
});

summarize("accessibility");
