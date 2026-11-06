// Two-way binding (`<->`) and editing a value (docs/system-design/editing-values.md).
// `value <-> place` is shorthand for `value = { place }` plus a `commit` that writes
// the place, on any value control. The control shows the place; a person's change is
// put to `admit`, shown, and handed to `commit`; while an edit is open the control
// shows the person's change, and any other change to the place ends the edit. These
// tests drive the MODEL directly (no backend): a person's change is what the native
// element reports to the field (`_typed`), or a control's own `edit(v)` — the
// native-element path itself is the browser suite's (field.assert.mjs, the sampler).
import assert from "node:assert";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate, settle, provideMeasurer } from "../runtime/dist/index.js";
import { approximateMeasurer } from "../compiler/dist/headless.js";

provideMeasurer(approximateMeasurer());   // a checkbox's label is measured text

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log("  ok —", name); }
  catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); }
}
async function build(src) {
  const r = await compileProgram(src, { stripPos: false });
  assert.equal(r.errors.length, 0, "compile errors: " + r.errors.map((e) => e.message).join("; "));
  const app = instantiate(r.program);
  settle();
  return app;
}
/** What the native element reports when the person types `t` into a field. */
const type = (field, t) => { field._typed(t); settle(); };

console.log("two-way binding (<->) and editing a value");

const BASIC = `
App [
  store: Dataset { { "rec": { "name": "Alice" } } },
  form: View [ datapath = { app.store.value.rec },
    field: TextInput [ accessibilityLabel = "Name", value <-> :name ],
  ],
]`;

await test("shows the place it is bound to", async () => {
  const app = await build(BASIC);
  assert.equal(app.form.field.value, "Alice");
  assert.equal(app.form.field.text, "Alice");
});

await test("a person's change is committed to the place", async () => {
  const app = await build(BASIC);
  type(app.form.field, "Bob");
  assert.equal(app.store.value.rec.name, "Bob");
});

await test("a change to the place shows when nobody is editing, and ends an edit that is open", async () => {
  const app = await build(BASIC);
  const f = app.form.field;
  f.beginEdit(); f.edit("Al"); settle();
  assert.equal(f.editing, true);
  app.store.set(["rec", "name"], "Carol"); settle();
  assert.equal(f.editing, false, "a change from elsewhere ends the edit");
  assert.equal(f.text, "Carol", "and shows");
});

await test("moving the cursor to a new record shows that record (no remount)", async () => {
  const app = await build(`
    App [
      store: Dataset { { "a": { "name": "Ann" }, "b": { "name": "Bea" } } },
      which: string = "a",
      form: View [ datapath = { app.store.value[app.which] },
        field: TextInput [ accessibilityLabel = "Name", value <-> :name ],
      ],
    ]`);
  assert.equal(app.form.field.text, "Ann");
  app.which = "b"; settle();
  assert.equal(app.form.field.text, "Bea");
});

await test("while an edit is open the field shows the person's text, whatever commit does to the value", async () => {
  const app = await build(`App [ size: number = 32,
      f: TextInput [ accessibilityLabel = "Size", value = { String(app.size) },
        commit(t: string) { if (t != "") app.size = Math.max(8, Number(t)) } ] ]`);
  const f = app.f;
  f.beginEdit(); f.edit("4"); settle();
  assert.equal(app.size, 8, "commit clamped");
  assert.equal(f.text, "4", "the person's 4 stays on screen");
  f.edit("48"); settle();
  assert.equal(app.size, 48);
  f.endEdit(); settle();
  assert.equal(f.text, "48", "the edit over, the field shows the value");
});

await test("admit refuses a change before it is shown, or tidies it", async () => {
  const app = await build(`App [ code: string = "",
      f: TextInput [ accessibilityLabel = "Code", value <-> app.code,
        admit(t: string) -> string | null { return /^[0-9 ]*$/.test(t) ? t.replace(/ /g, "") : null } ] ]`);
  const f = app.f;
  f.beginEdit(); f.edit("12a"); settle();
  assert.equal(app.code, "", "refused: nothing shown, nothing committed");
  f.edit("12 34"); settle();
  assert.equal(app.code, "1234", "tidied");
  assert.equal(f.text, "1234");
});

await test("commitOn = \"end\" commits once, when the edit ends; cancelEdit commits nothing", async () => {
  const app = await build(`
    App [
      store: Dataset { { "rec": { "name": "Alice" } } },
      form: View [ datapath = { app.store.value.rec },
        field: TextInput [ accessibilityLabel = "Name", value <-> :name, commitOn = "end" ],
      ],
    ]`);
  const f = app.form.field;
  f.beginEdit(); f.edit("Zed"); settle();
  assert.equal(app.store.value.rec.name, "Alice", "not written while the edit is open");
  assert.equal(f.text, "Zed");
  f.endEdit(); settle();
  assert.equal(app.store.value.rec.name, "Zed", "written when it ends");
  f.beginEdit(); f.edit("scratch"); settle();
  f.cancelEdit(); settle();
  assert.equal(app.store.value.rec.name, "Zed", "a cancelled edit commits nothing");
  assert.equal(f.text, "Zed", "and the field shows the value again");
});

await test("validate only judges: every change is committed, and the field says what is wrong once judged", async () => {
  const app = await build(`
    App [
      store: Dataset { { "rec": { "zip": "94110" } } },
      form: View [ datapath = { app.store.value.rec },
        field: TextInput [ accessibilityLabel = "Zip", value <-> :zip,
          validate(v: string) -> string { return /^[0-9]{5}$/.test(v) ? "" : "5 digits" } ],
      ],
    ]`);
  const f = app.form.field;
  type(f, "12ab");
  assert.equal(app.store.value.rec.zip, "12ab", "validate holds nothing back");
  assert.equal(f.valid, false);
  assert.equal(f.problem, "5 digits");
  assert.equal(f.error, "", "said once the field is judged — left, submitted, or judge()d");
  f.judge(); settle();
  assert.equal(f.error, "5 digits");
  type(f, "60614");
  assert.equal(f.valid, true);
  assert.equal(f.error, "");
});

await test("a field chosen by name: `value <-> { :@[(name)] }`", async () => {
  const app = await build(`
    class Entry extends View [ which: string = "",
      input: TextInput [ accessibilityLabel = "Entry", value <-> { :@[(classroot.which)] } ] ]
    App [
      store: Dataset { { "rec": { "notes": "N0", "location": "L0" } } },
      form: View [ datapath = { app.store.value.rec },
        a: Entry [ which = "notes" ],
        b: Entry [ which = "location" ],
      ],
    ]`);
  assert.equal(app.form.a.input.text, "N0");
  assert.equal(app.form.b.input.text, "L0");
  type(app.form.a.input, "N1");
  assert.equal(app.store.value.rec.notes, "N1");
  assert.equal(app.store.value.rec.location, "L0", "editing one field leaves the sibling untouched");
});

await test("on any value control: a checkbox and a slider bind both ways", async () => {
  const app = await build(`App [ muted: boolean = false, volume: number = 10,
      c: Checkbox [ label = "Mute", checked <-> app.muted ],
      s: Slider [ accessibilityLabel = "Volume", value <-> app.volume ] ]`);
  app.c.edit(true); settle();
  assert.equal(app.muted, true);
  app.s.edit(40); settle();
  assert.equal(app.volume, 40);
  app.volume = 5; settle();
  assert.equal(app.s.value, 5, "and the place drives the control");
});

const errorsOf = async (src) => (await compileProgram(src)).errors.map((e) => e.message).join("\n");
await test("misuse is refused, each naming what works", async () => {
  assert.match(await errorsOf(`App [ d: Dataset { { "w": 3 } }, View [ datapath = { app.d.value }, width <-> :w ] ]`), /is not a value control/);
  assert.match(await errorsOf(`App [ p: string = "", TextInput [ accessibilityLabel = "x", placeholder <-> app.p ] ]`), /TextInput's value is 'value'/);
  assert.match(await errorsOf(`App [ f: TextInput [ accessibilityLabel = "x", value <-> "hi" ] ]`), /binds a PLACE/);
  assert.match(await errorsOf(`App [ s: Dataset { {"a":[]} }, form: View [ datapath = { app.s.value }, f: TextInput [ accessibilityLabel = "x", value <-> :a[] ] ] ]`), /not a many-path/);
  assert.match(await errorsOf(`App [ s: string = "", TextInput [ accessibilityLabel = "x", value <-> app.s, commit(v: string) { app.s = v } ] ]`), /already says where the person's change goes/);
  assert.equal(await errorsOf(`App [ s: Dataset { {"r":{"n":"x"}} }, form: View [ datapath = { app.s.value.r }, f: TextInput [ accessibilityLabel = "x", value <-> :n ] ] ]`), "", "a valid one compiles");
});

// ── a `<->` with NOTHING TO EDIT (findings A2, 2026-08-03): a datapath place
// resolves against the nearest enclosing `datapath`; with none above it the
// binding would do nothing in either direction, clean through every rung.
await test("a datapath place with no enclosing datapath is refused, not silently inert", async () => {
  const msg = await errorsOf(`App [ f: TextInput [ accessibilityLabel = "x", value <-> :name ] ]`);
  assert.match(msg, /has no data to edit/);
  assert.match(msg, /datapath = \{ … \}/, "it names the fix that makes the arrow work");
  assert.match(msg, /value <-> app\.value/, "and the attribute form, for binding your own state");
});

await test("a CLASS BODY is exempt — its cursor arrives from the use site", async () => {
  assert.equal(await errorsOf(`class Row extends View [ TextInput [ accessibilityLabel = "x", value <-> :name ] ]
    App [ d: Dataset { {"rows":[{"name":"a"}]} }, View [ datapath = :rows[], Row [ ] ] ]`), "");
  assert.equal(await errorsOf(`class Row extends View [ TextInput [ accessibilityLabel = "x", value <-> :name ] ]
    App [ Row [ ] ]`), "", "still exempt when the use site supplies nothing — unknowable, so never guessed");
});

// ── the CONTROLLED field (report of 2026-08-03): a field whose value the program
// owns must still deliver the person's change, and the program must be able to
// drive it — clear it, above all.
await test("a CONTROLLED field delivers the change through commit, and the program can clear it", async () => {
  const app = await build(`App [ who: string = "seeded",
      f: TextInput [ accessibilityLabel = "Who", value = { app.who }, commit(v: string) { app.who = v } ] ]`);
  assert.equal(app.f.text, "seeded");
  type(app.f, "Ada");
  assert.equal(app.who, "Ada", "the change reached the program");
  app.who = ""; settle();
  assert.equal(app.f.text, "", "and the program can clear the field");
});

await test("a constrained value with nowhere for the change to go is refused, naming commit and <->", async () => {
  const dead = await errorsOf(`App [ note: string = "", f: TextInput [ accessibilityLabel = "x", value = { app.note } ] ]`);
  assert.match(dead, /value is constrained here/);
  assert.match(dead, /value <-> app\.note/, "naming the place the constraint reads");
  assert.match(dead, /commit\(/);
  for (const ok of [
    `App [ note: string = "", f: TextInput [ accessibilityLabel = "x", value = { app.note }, commit(v: string) { app.note = v } ] ]`,
    `App [ note: string = "", f: TextInput [ accessibilityLabel = "x", value <-> app.note ] ]`,
  ]) assert.equal(await errorsOf(ok), "", ok);
});

// Re-anchoring: a `:path` island inside `datapath = { }` resolves against the
// cursor the slot EXTENDS, never the one it defines. Before the
// withCursorDefining fix, the compute read its own half-written cursor on
// re-run and oscillated (null ↔ cursor) until "constraint cycle: …
// re-evaluated 100 times" — triggered by the first Dataset mutation, with or
// without a replication beneath (the field repro's PaneB).
await test("datapath = { :detail } re-anchor + nested replication survives settle and mutation", async () => {
  const app = await build(`
    App [
      db: Dataset { { "v": { "detail": { "details": [
        { "label": "Colour", "value": "Black" }, { "label": "Size", "value": "L" } ] } } } },
      host: View [ datapath = { app.db.value.v },
        det: View [ datapath = { :detail },
          Text [ datapath = :details[], key = :label, width = 220,
            text = { (:label || "") + ": " + (:value || "") } ],
        ],
      ],
    ]`); // the first settle threw the cycle before the fix
  const texts = app.host.det.children.filter((c) => c.text !== undefined).map((c) => c.text);
  assert.deepEqual(texts, ["Colour: Black", "Size: L"], "the re-anchored replication built");
  app.db.set(["v", "detail", "details", "2"], { label: "Fit", value: "Slim" });
  settle(); // and every mutation threw it again
  const after = app.host.det.children.filter((c) => c.text !== undefined).map((c) => c.text);
  assert.deepEqual(after, ["Colour: Black", "Size: L", "Fit: Slim"], "mutation reconciles, no cycle");
});

await test("datapath = { :detail } re-anchor cycles even WITHOUT a replication beneath (fixed)", async () => {
  const app = await build(`
    App [
      db: Dataset { { "v": { "detail": { "name": "Ada" } } } },
      host: View [ datapath = { app.db.value.v },
        det: View [ datapath = { :detail }, t: Text [ text = { "" + (:name || "") } ] ],
      ],
    ]`);
  assert.equal(app.host.det.t.text, "Ada", "the island anchored at the INHERITED cursor");
  app.db.set(["v", "detail", "name"], "Grace");
  settle();
  assert.equal(app.host.det.t.text, "Grace", "leaf mutation flows through the re-anchor");
});

await test("set([], v) replaces the WHOLE document — the guide's draft-lands spelling — and wakes readers", async () => {
  // field report 2026-08-21: this threw "assign .value to replace it", which
  // the typechecker refuses (value is read-only) — a dead-end loop. The empty
  // path now IS the whole-document replace, one reactive write.
  const app = await build(BASIC);
  app.store.set([], { rec: { name: "Dora" } });
  settle();
  assert.equal(app.store.value.rec.name, "Dora", "the document was replaced");
  assert.equal(app.form.field.text, "Dora", "readers woke — arrival semantics");
});

// ── THE SCHEMA (typed data): `<->` converts nothing, so a field bound to a typed
// field must hold that type — a text field and a number are a compile error that
// names the long form, which parses in its commit.
await test("schema: a text field bound to a number field is a type error naming the conversion", async () => {
  const msg = await errorsOf(`
schema Task [ id: string, born: number ]
App [ width=1, height=1,
  d: Dataset [ schema = [ tasks[]: Task ] ] { { "tasks": [ { "id": "t1", "born": 5 } ] } },
  l: View [ datapath = { d.value }, row: View [ datapath = :tasks[0],
    f: TextInput [ accessibilityLabel = "Born", value <-> :born ] ] ],
]`);
  assert.match(msg, /the shorthand converts nothing/);
});

await test("schema: the long form shows a number converted and parses it back", async () => {
  const app = await build(`
schema Task [ id: string, born: number ]
App [ width=1, height=1,
  d: Dataset [ schema = [ tasks[]: Task ] ] { { "tasks": [ { "id": "t1", "born": 5 } ] } },
  l: View [ datapath = { d.value }, row: View [ datapath = :tasks[0],
    f: TextInput [ accessibilityLabel = "Born", value = { String(:born) },
      commit(t: string) { const n = Number(t); if (t != "" && !isNaN(n)) { :born = n } } ] ] ],
]`);
  const f = app.l.row.f;
  assert.equal(f.text, "5");
  type(f, "42");
  assert.strictEqual(app.d.read(["tasks", 0, "born"]), 42, "committed as the NUMBER");
  type(f, "abc");
  assert.strictEqual(app.d.read(["tasks", 0, "born"]), 42, "text that isn't a number never reaches the data");
});

// A LONE VIEW'S CURSOR NAMES A PLACE. Its reads stood only on the field of the record
// they first found, so an insert, removal or move ahead of it left the view showing a
// record that had moved away (Cadence run 24: a "last session" card kept an old id, and
// its flow deleted that session from the service). A replicated row still follows its
// record: its replicator moves it.
const PLACE = `schema Item [ id: string, name: string ]
App [ width = 400, height = 300,
  d: Dataset [ schema = [ rows[]: Item ] ] { { "rows": [ { "id": "a", "name": "first" }, { "id": "z", "name": "last" } ] } },
  latest: Item? = { app.d.value?.rows[0] ?? null },
  box: View [ datapath = { app.d.value }, card: View [ datapath = :rows[0], t: Text [ text = { :name ?? "none" } ] ] ],
  lone: View [ datapath = { app.latest }, t: Text [ text = { :name ?? "none" } ] ],
  list: View [ datapath = { app.d.value }, View [ datapath = :rows[], Text [ text = { :name ?? "" } ] ] ]
]`;
const shown = (app) => [app.box.card.t.text, app.lone.t.text];
await test("a lone view on :rows[0] or { a record } shows what is there after an insert ahead of it", async () => {
  const app = await build(PLACE);
  assert.deepEqual(shown(app), ["first", "first"]);
  app.d.insert(["rows"], 0, { id: "b", name: "second" }); settle();
  assert.deepEqual(shown(app), ["second", "second"], "the new record at the place");
  app.d.set(["rows", 0, "name"], "renamed"); settle();
  assert.deepEqual(shown(app), ["renamed", "renamed"], "and it hears the new record's own changes");
});
await test("…and after a removal and a move", async () => {
  const app = await build(PLACE);
  app.d.removeAt(["rows"], 0); settle();
  assert.deepEqual(shown(app), ["last", "last"], "removed: the next record is at the place");
  app.d.insert(["rows"], 1, { id: "c", name: "third" }); settle();
  app.d.move(["rows"], 1, 0); settle();
  assert.deepEqual(shown(app), ["third", "third"], "moved to the front: it is what is there");
});
await test("a replicated row still presents its own record through an insert", async () => {
  const app = await build(PLACE);
  const rows = () => app.list.children.filter((c) => c.datapath != null).map((c) => c.children[0].text);
  assert.deepEqual(rows(), ["first", "last"]);
  app.d.insert(["rows"], 0, { id: "b", name: "second" }); settle();
  assert.deepEqual(rows(), ["second", "first", "last"]);
});

console.log(`\ndatabinding: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
