// Forms (library form.declare, valuecontrol.declare, field.declare,
// textinput.declare): what a field says is wrong and when, how a form gathers its
// fields, judges them on submit, sends, and lays a service's refusal back on
// the fields it names.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate } from "../runtime/dist/instantiate.js";
import { settle, provideMeasurer } from "../runtime/dist/index.js";
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
const field = (form, name) => form._members.find((m) => m.name === name);

// ── the shared vocabulary ────────────────────────────────────────────────────

await test("TextInput is a ValueControl: the form vocabulary is defined once", async () => {
  const vc = readFileSync(new URL("../library/valuecontrol.declare", import.meta.url), "utf8");
  const field = readFileSync(new URL("../library/textinput.declare", import.meta.url), "utf8");
  for (const [name, type] of Object.entries({ name: "string", judged: "boolean", refused: "string", problem: "string", error: "string", valid: "boolean" })) {
    assert.match(vc, new RegExp(`^\\s*${name}: ${type} = `, "m"), `ValueControl declares ${name}: ${type}`);
  }
  assert.match(vc, /^\s*required: boolean \| string = false,/m);
  for (const m of ["refuse(message: string)", "judge()", "validate(v: any)"]) assert.ok(vc.includes(m), `ValueControl has ${m}`);
  assert.match(field, /^class TextInput extends ValueControl \[/m, "and a field has it by being one");
});

// ── one field: what is wrong, and when it says so ────────────────────────────

await test("a TextInput: problem is now, error waits for judging (the field is left, or judged)", async () => {
  const app = await boot(`App [ width = 300, height = 100,
    t: TextInput [ width = 200, required = "Enter a name." ] ]`);
  assert.equal(app.t.problem, "Enter a name.");
  assert.equal(app.t.valid, false);
  assert.equal(app.t.error, "", "not judged yet: nothing said");
  assert.equal(app.t.accessibilityRequired, true);
  app.t.judge(); settle();
  assert.equal(app.t.error, "Enter a name.");
  app.t.value = "Ada"; settle();
  assert.equal(app.t.error, "", "once judged it follows each change");
  assert.equal(app.t.valid, true);
  app.t.judged = false; app.t.value = ""; settle();
  assert.equal(app.t.error, "", "un-judged by the program: quiet until left again");
});

await test("a TextInput: validate is reactive over what it reads", async () => {
  const app = await boot(`App [ width = 300, height = 100,
    country: string = "US",
    zip: TextInput [ width = 100, value = "1234", judged = true,
      validate(v: string) -> string { return app.country == "US" && v.length != 5 ? "Enter a 5-digit ZIP code." : "" } ] ]`);
  assert.equal(app.zip.error, "Enter a 5-digit ZIP code.");
  app.country = "GB"; settle();
  assert.equal(app.zip.error, "", "the rule judged again when the country changed");
});

await test("a refusal on a field refusedWith empties is still said: the program's reaction runs first, then the refusal is laid", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    code: string = "123",
    f: Form [
        refusedWith(body: any) { app.code = ""; this.c.judged = false },
        c: TextInput [ name = "cvc", value <-> app.code ] ] ]`);
  app.f.c.judged = true; settle();
  app.f._refused({ field: "cvc", message: "The security code doesn't match this card." }); settle();
  assert.equal(app.f.c.text, "", "emptied by the program's reaction");
  assert.equal(app.f.c.error, "The security code doesn't match this card.", "and still says why");
});

await test("a TextInput: a refusal counts while the text is the one refused", async () => {
  const app = await boot(`App [ width = 300, height = 100,
    t: TextInput [ width = 200, value = "taken@x.io", judged = true ] ]`);
  app.t.refuse("That address already has an account."); settle();
  assert.equal(app.t.problem, "That address already has an account.");
  assert.equal(app.t.valid, false);
  app.t.value = "new@x.io"; settle();
  assert.equal(app.t.problem, "", "changed: the refusal stops counting");
  app.t.value = "taken@x.io"; settle();
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
      value <-> app.email ] ],
    Field [ label = "Terms", Checkbox [ name = "agree", required = "Accept the terms.", label = "I agree",
      checked <-> app.agree ] ],
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
  const names = app.f._members.map((m) => m.name).sort();
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

await test("a step a handler defers with afterSettle belongs to its node: discarded first, the node drops it (a form leaving the screen in its own refusal handler)", async () => {
  const app = await boot(`App [ width = 300, height = 100, n: number = 0, show: boolean = true,
    box: View [ exists = { app.show }, go() { afterSettle(() => { app.n = app.n + 1 }); app.show = false } ],
    keep: View [ go() { afterSettle(() => { app.n = app.n + 10 }) } ] ]`);
  app.box.go(); settle();
  assert.equal(app.n, 0, "the discarded node's step did not run");
  app.keep.go(); settle();
  assert.equal(app.n, 10, "a node that stays runs its step at the settle's close");
});

await test("two submits in one turn send once: the second, before the first has sent, does nothing", async () => {
  const app = await boot(`App [ width = 300, height = 200,
    pay: DataSource [ url = "http://127.0.0.1:9/pay", method = "POST" ],
    f: Form [ source = { app.pay }, TextInput [ width = 200, name = "a", value = "x" ] ] ]`);
  let n = 0; const real = app.pay.fetch.bind(app.pay); app.pay.fetch = (...a) => { n++; return real(...a); };
  app.f.submit(); app.f.submit(); settle();
  assert.equal(n, 1, "one request, not two");
});

await test("a node its handler has already discarded asks for no step: a fetch settled the write before it (a refusal handler that leaves the screen, then fetches)", async () => {
  const app = await boot(`App [ width = 300, height = 100, n: number = 0, m: number = 0, show: boolean = true,
    d: DataSource [ url = "http://127.0.0.1:9/x" ],
    box: View [ exists = { app.show },
      go() { const a = app; a.show = false; a.d.fetch(); afterSettle(() => { a.n = 1 }) } ] ]`);
  app.box.go(); app.m = 1; settle();
  assert.ok(app.box == null, "gone");
  assert.equal(app.n, 0, "the step did not run on the node that was gone");
});

await test("every value control in a Field is named by its caption, unless it says its own", async () => {
  const src = `App [ width = 300, height = 300,
    Field [ label = "Seats", n: Stepper [ value = 2, min = 1, max = 9 ] ],
    Field [ label = "Delivery", g: RadioGroup [ value = "m",
        Radio [ choice = "m", label = "Mail" ], Radio [ choice = "e", label = "Email" ] ] ],
    Field [ label = "Copies", own: Stepper [ value = 1, accessibilityLabel = "Number of copies" ] ],
    loose: Stepper [ value = 1 ] ]`;
  const app = await boot(src);
  const at = (i, k) => app.children.filter((c) => c.constructor.name === "Field")[i][k];
  assert.equal(at(0, "n").accessibilityLabel, "Seats");
  assert.equal(at(1, "g").accessibilityLabel, "Delivery");
  assert.equal(at(2, "own").accessibilityLabel, "Number of copies", "its own name wins");
  assert.equal(app.loose.accessibilityLabel, "", "outside a Field: no caption to take");
});

await test("a ValueControl with no form: its rules, facts and judging stand alone", async () => {
  const app = await boot(`App [ width = 300, height = 100, agree: boolean = false,
    c: Checkbox [ label = "I agree", required = "Accept the terms.", checked <-> app.agree ] ]`);
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

await test("a Form with a source: the service's refusal reaches it, though submit sends from inside a settle", async () => {
  // submit() sends after a settle, and a request asked for inside one starts only
  // once it is over: read off the source's flags in between, the send looked
  // finished before it began, and the 401 that came after was dropped (Codex
  // Venue 3, 2026-11-02)
  const { provideTransport } = await import("../runtime/dist/data.js");
  let sent = 0;
  const prev = provideTransport(async () => {
    sent++;
    return { ok: false, status: 401, headers: new Headers({ "content-type": "application/json" }), text: async () => "{\"error\":\"bad_credentials\",\"message\":\"That email and password don't match.\"}" };
  });
  try {
    const app = await boot(`App [ width = 400, height = 300,
      session: DataSource [ url = "/api/session", method = "POST", body = { { password: app.f.pw } } ],
      f: Form [ source = { app.session }, pw: string = "wrong" ] ]`);
    app.f.submit(); settle();
    for (let i = 0; i < 10 && app.f.error === ""; i++) { await new Promise((r) => setTimeout(r, 5)); settle(); }
    assert.equal(sent, 1, "one request");
    assert.equal(app.f.error, "That email and password don't match.", "the refusal is the form's error");
    assert.equal(app.f.pending, false, "and the send is over");
  } finally { provideTransport(prev); }
});

summarize("forms");
// an attached app keeps its timers (the focus ring's, a tooltip's): end here
process.exit(process.exitCode ?? 0);
