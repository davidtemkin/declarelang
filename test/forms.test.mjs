// Forms (library form.declare, valuecontrol.declare, field.declare; runtime
// text-input.ts): what a field says is wrong and when, how a form gathers its
// fields, judges them on submit, sends, and lays a service's refusal back on
// the fields it names.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate } from "../runtime/dist/instantiate.js";
import { settle, provideMeasurer } from "../runtime/dist/index.js";
import { SCHEMAS } from "../runtime/dist/schema.js";
import { approximateMeasurer } from "../compiler/dist/headless.js";

provideMeasurer(approximateMeasurer());

// a backend whose surfaces answer any call: these tests read the model, not pixels
function mockBackend() {
  const surface = () => new Proxy({}, { get: () => () => {} });
  return { createSurface: surface, attachRoot: () => {} };
}

async function boot(src) {
  const b = await compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  const app = instantiate(b.program);
  app.$attach(mockBackend(), null);
  settle();
  return app;
}

// a field of the form by its name
const field = (form, name) => form.members.find((m) => m.name === name);

// ── the shared vocabulary ────────────────────────────────────────────────────

await test("TextInput and ValueControl share the form vocabulary", async () => {
  const vc = readFileSync(new URL("../library/valuecontrol.declare", import.meta.url), "utf8");
  const SHARED = { name: "string", judged: "boolean", refused: "string", problem: "string", error: "string", valid: "boolean" };
  for (const [name, type] of Object.entries(SHARED)) {
    assert.match(vc, new RegExp(`^\\s*${name}: ${type} = `, "m"), `ValueControl declares ${name}: ${type}`);
    assert.equal(SCHEMAS.TextInput.attrs[name]?.kind, type, `TextInput's schema declares ${name} as ${type}`);
  }
  assert.match(vc, /^\s*judgeOn: JudgeOn = leave,/m, "ValueControl judges on leave by default");
  assert.match(vc, /^\s*required: boolean \| string = false,/m);
  assert.equal(SCHEMAS.TextInput.attrs.required?.written, "boolean | string");
  for (const m of ["refuse(message: string)", "judge()", "validate(v: any)"]) assert.ok(vc.includes(m), `ValueControl has ${m}`);
});

// ── one field: what is wrong, and when it says so ────────────────────────────

await test("a TextInput: problem is now, error waits for judging (judgeOn = leave by default)", async () => {
  const app = await boot(`App [ width = 300, height = 100,
    t: TextInput [ width = 200, required = "Enter a name." ] ]`);
  assert.equal(app.t.judgeOn, "leave");
  assert.equal(app.t.problem, "Enter a name.");
  assert.equal(app.t.valid, false);
  assert.equal(app.t.error, "", "not judged yet: nothing said");
  assert.equal(app.t.accessibilityRequired, true);
  app.t.judge(); settle();
  assert.equal(app.t.error, "Enter a name.");
  app.t.text = "Ada"; settle();
  assert.equal(app.t.error, "", "once judged it follows each edit");
  assert.equal(app.t.valid, true);
  app.t.judged = false; app.t.text = ""; settle();
  assert.equal(app.t.error, "", "un-judged by the program: quiet until left again");
});

await test("a TextInput: validate is reactive over what it reads", async () => {
  const app = await boot(`App [ width = 300, height = 100,
    country: string = "US",
    zip: TextInput [ width = 100, text = "1234", judgeOn = edit,
      validate(v: string) -> string { return app.country == "US" && v.length != 5 ? "Enter a 5-digit ZIP code." : "" } ] ]`);
  assert.equal(app.zip.error, "Enter a 5-digit ZIP code.");
  app.country = "GB"; settle();
  assert.equal(app.zip.error, "", "the rule judged again when the country changed");
});

await test("a TextInput: a refusal counts while the text is the one refused", async () => {
  const app = await boot(`App [ width = 300, height = 100,
    t: TextInput [ width = 200, text = "taken@x.io", judgeOn = edit ] ]`);
  app.t.refuse("That address already has an account."); settle();
  assert.equal(app.t.problem, "That address already has an account.");
  assert.equal(app.t.valid, false);
  app.t.text = "new@x.io"; settle();
  assert.equal(app.t.problem, "", "changed: the refusal stops counting");
  app.t.text = "taken@x.io"; settle();
  assert.equal(app.t.problem, "That address already has an account.", "the refused value is refused again");
  app.t.refuse(""); settle();
  assert.equal(app.t.problem, "", "withdrawn");
});

// ── a form ───────────────────────────────────────────────────────────────────

const FORM = `App [ width = 500, height = 600,
  email: string = "",
  agree: boolean = false,
  hide: boolean = true,
  sends: number = 0,
  f: Form [ x = 0, y = 0, width = 480,
    layout: SimpleLayout [ axis = y, spacing = 8 ],
    Field [ label = "Email", TextInput [ width = 200, name = "email", required = "Enter your email address.",
      text = { app.email }, onInput(v: string) { app.email = v } ] ],
    Field [ label = "Terms", Checkbox [ name = "agree", required = "Accept the terms.", label = "I agree",
      checked = { app.agree }, input(v: boolean) { app.agree = v } ] ],
    Field [ label = "Country", Combobox [ name = "country", items = ["France", "Japan"] ] ],
    Field [ label = "Off", TextInput [ width = 200, name = "off", required = true, disabled = true ] ],
    View [ visible = { !app.hide }, TextInput [ width = 200, name = "hidden", required = true ] ],
    Sheet [ accessibilityLabel = "Extra", TextInput [ width = 200, name = "insheet", required = true ] ],
    send() { app.sends = app.sends + 1 }
    ],
  outside: TextInput [ x = 0, y = 560, width = 200, name = "outside", form = { app.f } ]
  ]`;

await test("a Form gathers what is inside it: not a control's parts, not an overlay's fields", async () => {
  const app = await boot(FORM);
  const names = app.f.members.map((m) => m.name).sort();
  assert.deepEqual(names, ["agree", "country", "email", "hidden", "off", "outside"],
    "the combobox's entry is part of the combobox, the sheet's field belongs to no form here, and a field elsewhere joins by naming the form");
  assert.equal(app.f._counts(field(app.f, "off")), false, "a disabled field does not count");
  assert.equal(app.f._counts(field(app.f, "hidden")), false, "a field not shown does not count");
  app.hide = false; settle();
  assert.equal(app.f._counts(field(app.f, "hidden")), true, "shown, it counts");
});

await test("a Form: submit judges every counted field at once, and sends only when nothing is wrong", async () => {
  const app = await boot(FORM);
  assert.deepEqual(app.f.problems.map((p) => p.name), ["email", "agree"], "problems are known before anything is judged, in reading order");
  assert.equal(field(app.f, "email").error, "", "but nothing is said yet");
  app.f.submit(); settle();
  assert.equal(app.sends, 0, "something is wrong: nothing sent");
  assert.equal(field(app.f, "email").error, "Enter your email address.");
  assert.equal(field(app.f, "agree").error, "Accept the terms.");
  assert.equal(field(app.f, "off").error, "", "a field that does not count is not judged");
  const fields = app.f.childViews.filter((c) => "message" in c);
  assert.deepEqual(fields.map((f) => f.message).slice(0, 2), ["Enter your email address.", "Accept the terms."],
    "each Field shows its control's message");
  app.email = "ada@x.io"; app.agree = true; settle();
  app.f.submit(); settle();
  assert.equal(app.sends, 1, "nothing wrong: send()");
  assert.equal(field(app.f, "email").judged, false, "a send that refused nothing leaves the fields judged afresh");
});

await test("a Form reads a service's refusal onto the fields it names", async () => {
  const app = await boot(FORM);
  const r = (body) => app.f.refusal(body);
  assert.deepEqual(r({ error: "invalid", field: "email", message: "Taken." }), [{ name: "email", message: "Taken." }]);
  assert.deepEqual(r({ errors: [{ field: "email", message: "A" }, { path: "billing.city", message: "B" }] }),
    [{ name: "email", message: "A" }, { name: "billing.city", message: "B" }]);
  assert.deepEqual(r({ title: "Invalid", errors: [{ pointer: "#/billing/postalCode", detail: "C" }] }),
    [{ name: "billing.postalCode", message: "C" }], "RFC 9457: a pointer is a dotted name");
  assert.deepEqual(r({ errors: [{ source: { pointer: "/data/attributes/email" }, detail: "D" }] }),
    [{ name: "email", message: "D" }], "JSON:API");
  assert.deepEqual(r({ error: "card_declined", message: "Declined." }), [{ name: "", message: "Declined." }], "no field: the form's");
  assert.deepEqual(r(null), [{ name: "", message: app.f.failedMessage }], "nothing readable: the plain sentence");
  app.email = "taken@x.io"; settle();
  app.f.refuse([{ name: "email", message: "Taken." }, { name: "nobody", message: "Lost." }, { name: "off", message: "Disabled." }]); settle();
  assert.equal(field(app.f, "email").refused, "Taken.");
  assert.equal(app.f.error, "Lost. Disabled.", "a name no counted field has goes to the form's error, never a near match");
});

await test("a ValueControl with no form: its rules, facts and judging stand alone", async () => {
  const app = await boot(`App [ width = 300, height = 100, agree: boolean = false,
    c: Checkbox [ label = "I agree", required = "Accept the terms.", checked = { app.agree }, input(v: boolean) { app.agree = v } ] ]`);
  assert.equal(app.c.form, null, "no form above, and none needed");
  assert.equal(app.c.problem, "Accept the terms.");
  assert.equal(app.c.valid, false);
  assert.equal(app.c.error, "", "not judged yet");
  app.c.judge(); settle();
  assert.equal(app.c.error, "Accept the terms.");
  assert.equal(app.c.accessibilityError, "Accept the terms.");
  app.agree = true; settle();
  assert.equal(app.c.error, "");
  app.c.refuse("Not now."); settle();
  assert.equal(app.c.problem, "Not now.", "an outside message on a control of its own");
});

await test("a Form: next() walks the counted fields in reading order and submits from the last; enterMoves routes Return", async () => {
  const app = await boot(`App [ width = 400, height = 400, sends: number = 0,
    f: Form [ x = 0, y = 0, width = 380, enterMoves = true,
      layout: SimpleLayout [ axis = y, spacing = 8 ],
      TextInput [ width = 200, name = "a" ],
      TextInput [ width = 200, name = "b", disabled = true ],
      TextInput [ width = 200, name = "c" ],
      send() { app.sends = app.sends + 1 } ] ]`);
  const [a, , c] = app.f.childViews;
  assert.equal(app.f._enterHint(a), "next");
  assert.equal(app.f._enterHint(c), "go", "the last field's Return says go");
  app.f.next(a); settle();
  assert.equal(c.focused, true, "the disabled field is passed over");
  app.f._enter(c); settle();
  assert.equal(app.sends, 1, "Return in the last field submits");
  app.f.enterMoves = false; settle();
  app.f._enter(a); settle();
  assert.equal(app.sends, 2, "without enterMoves, Return submits from any field");
});

await test("Sheet says how it presents as `presentation`, leaving `form` to forms", async () => {
  const src = readFileSync(new URL("../library/sheet.declare", import.meta.url), "utf8");
  assert.match(src, /^\s*presentation: string = /m);
  assert.doesNotMatch(src, /^\s*form: string = /m);
});

summarize("forms");
// an attached app keeps its timers (the focus ring's, a tooltip's): end here
process.exit(process.exitCode ?? 0);
