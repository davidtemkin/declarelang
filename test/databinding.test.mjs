// Two-way data binding (`<->`) + the editor session (language §9, the
// leaf-input exception). The dataset owns the committed value; the editor owns
// the edit session (draft / valid / error / dirty / commit). These tests drive
// the MODEL directly (no backend) — the native-element edit path is exercised by
// the browser perceptual pass; here we prove the binding semantics.
import assert from "node:assert";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate, settle } from "../runtime/dist/index.js";
import { edited } from "../runtime/dist/editor.js"; // simulate a native edit (what onNativeInput calls)

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("  ok —", name); }
  catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); }
}
function build(src) {
  const r = compileProgram(src, { stripPos: false });
  assert.equal(r.errors.length, 0, "compile errors: " + r.errors.map((e) => e.message).join("; "));
  const app = instantiate(r.program);
  settle();
  return app;
}

console.log("two-way data binding (<->)");

const BASIC = `
App [
  store: Dataset { { "rec": { "name": "Alice" } } },
  form: View [ datapath = { app.store.value.rec },
    field: TextInput [ text <-> :name ],
  ],
]`;

test("seeds the draft from the datapath", () => {
  const app = build(BASIC);
  assert.equal(app.form.field.text, "Alice");
});

test("commit writes the draft back into the dataset", () => {
  const app = build(BASIC);
  app.form.field.text = "Bob";
  app.form.field.commit();
  settle();
  assert.equal(app.store.value.rec.name, "Bob");
});

test("an external dataset change reseeds the field", () => {
  const app = build(BASIC);
  app.form.field.text = "edited"; // uncommitted draft
  app.store.set(["rec", "name"], "Carol"); // a new value underneath
  settle();
  assert.equal(app.form.field.text, "Carol", "cursor/value change resets the session");
});

test("moving the cursor to a new record reseeds (no remount)", () => {
  const app = build(`
    App [
      store: Dataset { { "a": { "name": "Ann" }, "b": { "name": "Bea" } } },
      which: string = "a",
      form: View [ datapath = { app.store.value[app.which] },
        field: TextInput [ text <-> :name ],
      ],
    ]`);
  assert.equal(app.form.field.text, "Ann");
  app.which = "b";
  settle();
  assert.equal(app.form.field.text, "Bea", "the same field follows the cursor to record b");
});

test("commitOn=input commits live on each edit", () => {
  const app = build(BASIC); // default commitOn is "input"
  app.form.field.text = "Dan";
  edited(app.form.field, "text", app.form.field.commitOn); // what a native keystroke triggers
  settle();
  assert.equal(app.store.value.rec.name, "Dan");
});

test("commitOn=manual holds the draft until commit()", () => {
  const app = build(`
    App [
      store: Dataset { { "rec": { "name": "Alice" } } },
      form: View [ datapath = { app.store.value.rec },
        field: TextInput [ text <-> :name, commitOn = "manual" ],
      ],
    ]`);
  app.form.field.text = "Zed";
  edited(app.form.field, "text", app.form.field.commitOn);
  settle();
  assert.equal(app.store.value.rec.name, "Alice", "manual: not written yet");
  assert.equal(app.form.field.dirty, true, "draft differs from committed → dirty");
  app.form.field.commit();
  settle();
  assert.equal(app.store.value.rec.name, "Zed", "now committed");
  assert.equal(app.form.field.dirty, false, "clean after commit");
});

test("validate: an invalid draft is not committed and surfaces an error", () => {
  const app = build(`
    App [
      store: Dataset { { "rec": { "zip": "94110" } } },
      form: View [ datapath = { app.store.value.rec },
        field: TextInput [ text <-> :zip, commitOn = "manual",
                           validate(v: object) { return /^[0-9]{5}$/.test(v) ? null : "5 digits" } ],
      ],
    ]`);
  const f = app.form.field;
  f.text = "12ab";
  edited(f, "text", "input"); // try to commit live
  settle();
  assert.equal(app.store.value.rec.zip, "94110", "invalid draft never reaches the dataset");
  assert.equal(f.valid, false);
  assert.equal(f.error, "5 digits");
  // a valid value does commit
  f.text = "60614";
  edited(f, "text", "input");
  settle();
  assert.equal(app.store.value.rec.zip, "60614");
  assert.equal(f.valid, true);
  assert.equal(f.error, "");
});

test("revert discards the draft back to the committed value", () => {
  const app = build(`
    App [
      store: Dataset { { "rec": { "name": "Alice" } } },
      form: View [ datapath = { app.store.value.rec },
        field: TextInput [ text <-> :name, commitOn = "manual" ],
      ],
    ]`);
  app.form.field.text = "scratch";
  app.form.field.revert();
  settle();
  assert.equal(app.form.field.text, "Alice");
  assert.equal(app.form.field.dirty, false);
});

test("dynamic `<-> { expr }` binds a runtime-named field (generic editor)", () => {
  const app = build(`
    class Field extends View [ which: string = "",
      input: TextInput [ text <-> { classroot.which } ] ]
    App [
      store: Dataset { { "rec": { "notes": "N0", "location": "L0" } } },
      form: View [ datapath = { app.store.value.rec },
        a: Field [ which = "notes" ],
        b: Field [ which = "location" ],
      ],
    ]`);
  assert.equal(app.form.a.input.text, "N0");
  assert.equal(app.form.b.input.text, "L0");
  app.form.a.input.text = "N1"; app.form.a.input.commit(); settle();
  assert.equal(app.store.value.rec.notes, "N1");
  assert.equal(app.store.value.rec.location, "L0", "editing one field leaves the sibling untouched");
});

function rejects(src) {
  const r = compileProgram(src);
  return r.errors.length > 0;
}
const errorsOf = (src) => compileProgram(src).errors.map((e) => e.message).join("\n");
test("check rejects `<->` misuse (non-editor, literal, many-path)", () => {
  assert.ok(rejects(`App [ box: View [ width <-> :w ] ]`), "<-> on a non-editor");
  assert.ok(rejects(`App [ f: TextInput [ text <-> "hi" ] ]`), "<-> to a literal");
  assert.ok(rejects(`App [ s: Dataset { {"a":[]} }, form: View [ datapath = { app.s.value }, f: TextInput [ text <-> :a[] ] ] ]`), "<-> to a many-path");
  // and a valid one still compiles
  assert.ok(!rejects(`App [ s: Dataset { {"r":{"n":"x"}} }, form: View [ datapath = { app.s.value.r }, f: TextInput [ text <-> :n ] ] ]`));
});

// ── a `<->` with NOTHING TO EDIT (findings A2, 2026-08-03) ──────────────────
// The arrow's right-hand side names a place in DATA — a static `:field`, or a
// `{ }` yielding the field's name at runtime — and both resolve against the
// nearest enclosing `datapath`. With no datapath above it there is no place to
// write, and the binding was inert SILENTLY: clean through all six rungs of
// verify, doing nothing in either direction.
//
// The likeliest way to write one is `text <-> { app.note }`, which reads as if
// it two-way binds an ordinary slot. It does not: the `{ }` is evaluated for a
// field NAME, so this binds to a dataset field literally called "start" (the
// slot's value), finds nothing, and moves nothing. `declare.md` carries that
// line as an example, which is how it reached the report.
test("a `<->` with no enclosing datapath is refused, not silently inert", () => {
  assert.ok(rejects(`App [ f: TextInput [ text <-> :name ] ]`),
    "a static path with no datapath above it");
  assert.ok(rejects(`App [ note: string = "s", f: TextInput [ text <-> { app.note } ] ]`),
    "the { } form — the shape declare.md's example invites");
  const msg = errorsOf(`App [ note: string = "s", f: TextInput [ text <-> { app.note } ] ]`);
  assert.match(msg, /has no data to edit/);
  assert.match(msg, /datapath = \{ … \}/, "it names the fix that makes the arrow work");
  assert.match(msg, /input\(v: …\)/, "and the value pattern, for driving an ordinary slot");
});

test("a datapath ABOVE the editor still passes — the check is scope, not shape", () => {
  assert.ok(!rejects(`App [ s: Dataset { {"r":{"n":"x"}} },
      form: View [ datapath = { app.s.value.r }, f: TextInput [ text <-> :n ] ] ]`));
  assert.ok(!rejects(`App [ s: Dataset { {"r":{"n":"x"}} }, w: string = "n",
      form: View [ datapath = { app.s.value.r }, f: TextInput [ text <-> { app.w } ] ] ]`),
    "the generic-editor form is untouched");
});

test("a CLASS BODY is exempt — its cursor arrives from the use site", () => {
  // a component written to be dropped into a datapath'd context has no
  // datapath of its own and is entirely correct; the use site is not visible
  // from inside the class, so only the main tree can say nothing supplies one
  assert.ok(!rejects(`class Row extends View [ TextInput [ text <-> :name ] ]
    App [ d: Dataset { {"rows":[{"name":"a"}]} },
      View [ datapath = :rows[], Row [ ] ] ]`));
  assert.ok(!rejects(`class Row extends View [ TextInput [ text <-> :name ] ]
    App [ Row [ ] ]`), "still exempt even when the use site supplies nothing — unknowable, so never guessed");
});

console.log(`\ndatabinding: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
