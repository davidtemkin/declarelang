// test/diagnostics-hints.test.mjs — the miss NAMES THE FIX.
//
// Every case here came from a cold-read round: an agent given the tree and no
// context wrote the wrong name, and the compiler answered with the rule instead
// of the rewrite. `findings-2026-08-03.md` §B collects them. The value of these
// diagnostics is highest for a reader who cannot ask a follow-up question — a
// model mid-generation — so the negatives matter as much as the positives: a
// confident wrong suggestion is worse than none.
import assert from "node:assert/strict";
import { compile } from "../compiler/dist/compile-node.js";
import { test, summarize } from "./harness.mjs";

const errText = async (src) => {
  const r = await compile(src, { originDir: process.cwd() });
  return (r.errors ?? []).map((e) => e.message).join("\n");
};
const says = async (src, needle) => assert.ok((await errText(src)).includes(needle),
  `expected the diagnostic to contain ${JSON.stringify(needle)}, got:\n  ${await errText(src) || "(no error)"}`);
const silent = async (src, needle) => assert.ok(!(await errText(src)).includes(needle),
  `expected NO ${JSON.stringify(needle)}, got:\n  ${await errText(src)}`);

// ── unknown component: the near-miss must see the auto-includable LIBRARY ────
// A misspelled tag never matches the manifest, so it is never pulled and never
// reaches `schemas`. Before this, `Tex` found `Text` (a runtime schema, always
// present) and `Buton` found nothing — and every control lives in the library.
await test("unknown component: a misspelled runtime tag names its fix", async () => {
  await says(`App [ Tex [ text = "x" ] ]`, "did you mean 'Text'?");
});

await test("unknown component: a misspelled LIBRARY tag names its fix", async () => {
  await says(`App [ Buton [ label = "x" ] ]`, "did you mean 'Button'?");
  await says(`App [ Slidr [ value = 1 ] ]`, "did you mean 'Slider'?");
  await says(`App [ Checkbo [ ] ]`, "did you mean 'Checkbox'?");
});

await test("unknown component: a name that is a typo for nothing gets no guess", async () => {
  await silent(`App [ Zork [ ] ]`, "did you mean");
  await silent(`App [ Widget [ ] ]`, "did you mean");
});

// ── unknown attribute: near-miss, including handlers ─────────────────────────
await test("unknown attribute: a near-miss names the spelling", async () => {
  await says(`App [ Text [ fontsize = 20, text = "x" ] ]`, "did you mean 'fontSize'?");
  await says(`App [ Button [ labl = "x" ] ]`, "did you mean 'label'?");
});

await test("unknown attribute: HANDLERS are in the pool", async () => {
  // handlers are declared as events, not attrs, but are written in the same
  // position and fumbled the same way
  await says(`App [ View [ onclick = 1 ] ]`, "did you mean 'onClick'?");
  await says(`App [ View [ ondblclick = 1 ] ]`, "did you mean 'onDblClick'?");
});

await test("unknown attribute: a typo for nothing gets no guess", async () => {
  await silent(`App [ View [ wibble = 1 ] ]`, "did you mean");
  await silent(`App [ zap = 1 ]`, "did you mean");
});

// ── the hint tables outrank edit distance ────────────────────────────────────
// They know INTENT; edit distance only knows letters. `padding` is not a typo
// for anything — it is a concept that does not exist here.
await test("an exact CSS name gets the concept, not a spelling", async () => {
  await says(`App [ View [ padding = 4 ] ]`, "there is no padding");
  await says(`App [ View [ backgroundColor = red ] ]`, "the paint slot is 'fill'");
  await says(`App [ View [ zIndex = 1 ] ]`, "stacking is source order");
});

await test("a MISSPELLED CSS name still reaches its hint", async () => {
  // `colour` is one edit from `color`; the reader needs "text color is
  // 'textColor'", not "did you mean 'color'?" — which names nothing real
  await says(`App [ Text [ colour = red, text = "x" ] ]`, "text color is 'textColor'");
});

await test("hint-routing does not fire on a short string", async () => {
  // `zap` is one edit from `gap`, and a typo for nothing. Routing to a hint
  // asserts what the author was THINKING — a longer reach than naming a
  // spelling, so it wants more evidence than three characters can carry.
  await silent(`App [ zap = 1 ]`, "spacing rides the layout");
});

// REMOVED: "a retired spelling names its exact rewrite". Suggestions key on
// PRE-EXISTING priors — the CSS and React instincts a newcomer actually arrives
// with — never on our own rolling deprecations. A table of former Declare
// spellings serves a population that does not exist (nothing is written in this
// language yet, and no model has it in training data) while leaking history into
// a surface that should read as one current design. `materialize` now reports
// plainly that View has no such attribute.

await test("rotate/blur/transform point at the real doors, not into a wall", async () => {
  // `rotation` itself GRADUATED (2026-08-06, compositing.md Part II): it is a
  // View attribute now, so `rotation = 45` compiles instead of hinting — the
  // CSS-prior spellings around it still route to their true equivalents.
  await says(`App [ View [ rotate = 45 ] ]`, "rotation = 45");
  await says(`App [ View [ blur = 4 ] ]`, "d.filter");
  await says(`App [ View [ transform = 1 ] ]`, "draw(d: Draw)");
  await says(`App [ View [ mixBlendMode = 1 ] ]`, "blend = multiply");
  await says(`App [ View [ backdropFilter = 1 ] ]`, "frost(radius, saturation)");
});

// ── a CSS percentage inside { } ──────────────────────────────────────────────
await test("a percentage names the arithmetic that replaces it", async () => {
  await says(`App [ View [ width = { 100% } ] ]`, "there are no percentages");
  await says(`App [ View [ width = { 50% } ] ]`, "{ parent.width * 0.5 }");
  // trimmed — 33.3 arrives as 0.33299999999999996 unless it is rounded, and a
  // fix that reads worse than the error is not a fix
  await says(`App [ View [ height = { 33.3% } ] ]`, "{ parent.width * 0.333 }");
});

await test("a real modulo is not mistaken for a percentage", async () => {
  await silent(`App [ n: number = 7, View [ width = { app.n % 2 } ] ]`, "no percentages");
  await silent(`App [ n: number = 7, View [ width = { 100 % app.n } ] ]`, "no percentages");
});

// ── the globals a body may use are IN SCOPE for the checker ──────────────────
// The resolver admits `fetch` (it is in Node's globalThis) but the checker
// loads no DOM lib, so until the prelude declared them by hand, `fetch`, `URL`
// and `AbortController` failed R3 with "nothing in scope is named 'fetch' …
// or a global" — which three agents read as an invitation to
// `(globalThis as any).fetch` (field report 2026-08-21).
await test("a handler may call fetch, build a URL, and cancel with an AbortController", async () => {
  const src = `App [ Text [ text = "x", onClick() {
    const u = new URL("/x?a=1", "http://h"); u.searchParams.set("b", "2");
    const c = new AbortController();
    fetch(u, { method: "POST", body: JSON.stringify({ a: 1 }), headers: { "content-type": "application/json" }, signal: c.signal })
      .then((r) => r.ok ? r.json() : null).then((j) => console.log(j, encodeURIComponent("x y")));
  } ] ]`;
  const text = await errText(src);
  assert.equal(text, "", `expected a clean compile, got:\n  ${text}`);
});

await test("an unknown bare name names what a global IS, instead of offering 'a global' as the answer", async () => {
  await says(`App [ Text [ text = "x", onClick() { bogus(1) } ] ]`, "one of the globals a body may use (fetch, URL, setTimeout, console, Math, JSON, …)");
});

// ── a typecheck error has a COLUMN ──────────────────────────────────────────
// Bodies are emitted verbatim into the check file, so tsc's character is the
// source column — offset by the `{` on a body's first line. Every typecheck
// position used to say col 1 (field report 2026-08-21).
await test("a typecheck error is positioned at its column — first body line, later line, expression body", async () => {
  const at = async (src) => {
    const r = await compile(src, { originDir: process.cwd() });
    assert.equal(r.errors.length, 1, r.errors.map((e) => e.message).join("\n"));
    return { line: r.errors[0].pos.line, col: r.errors[0].pos.col };
  };
  assert.deepEqual(await at(`App [\n  Text [ text = "x", onClick() { const s = "a"; s.nope() } ]\n]`), { line: 2, col: 51 });
  assert.deepEqual(await at(`App [\n  Text [ text = "x", onClick() {\n      const s = "a"\n      s.nope()\n  } ]\n]`), { line: 4, col: 9 });
  assert.deepEqual(await at(`App [\n  Text [ text = { "a".nope() } ]\n]`), { line: 2, col: 23 });
});

// ── a body may not WRITE a script { } variable ──────────────────────────────
// A body receives a const copy of every script binding; writing one threw
// "Assignment to constant variable" once per frame with a stack naming nothing,
// and passed every compile rung (field report 2026-08-21).
await test("a handler that assigns a script { } let is refused at resolution, naming the Declare shape", async () => {
  await says(`script { let counter = 0 }\nApp [ Text [ text = "x", onClick() { counter = counter + 1 } ] ]`, "'counter' is a script { } variable");
  await says(`script { let counter = 0 }\nApp [ Text [ text = "x", onClick() { counter += 1 } ] ]`, "'counter' is a script { } variable");
  {
    const r = await compile(`script { let counter = 0 }\nApp [ Text [ text = "x", onClick() { counter += 1 } ] ]`, { originDir: process.cwd() });
    assert.equal(r.diagnostics[0].code, "DECLARE4003");
  }
  await says(`script { var n = 0 }\nApp [ Text [ text = "x", onClick() { n++ } ] ]`, "'n' is a script { } variable");
  // reading one stays allowed (a body sees the value), and a const is untouched
  await silent(`script { let counter = 0 }\nApp [ Text [ text = "x", onClick() { console.log(counter) } ] ]`, "script { } variable");
  await silent(`script { const LIMIT = 3 }\nApp [ Text [ text = "x", onClick() { console.log(LIMIT) } ] ]`, "script { } variable");
  // a body-local of the same name shadows it and is writable
  await silent(`script { let counter = 0 }\nApp [ Text [ text = "x", onClick() { let counter = 1; counter = 2 } ] ]`, "script { } variable");
});

// ── host globals are refused BY NAME, with the Declare way ──────────────────
// Until 2026-08-23 the resolver admitted `document`/`process` (curated list +
// Node's globalThis) and the checker then refused them with TypeScript's own
// advice ("change lib to dom", "npm i @types/node").
await test("a host global in a body is refused at resolution with the Declare way, never TypeScript's lib advice", async () => {
  await says(`App [ Text [ text = "x", onClick() { console.log(document.title) } ] ]`, "'document' is the host's, not Declare's");
  await says(`App [ Text [ text = "x", onClick() { console.log(document.title) } ] ]`, "the tree IS the program");
  await says(`App [ Text [ text = "x", onClick() { console.log(process.env.HOME) } ] ]`, "'process' is the host's");
  await says(`App [ Text [ text = "x", onClick() { localStorage.setItem("k", "v") } ] ]`, "Persistence is not in the language yet");
  await says(`App [ Text [ text = "x", onClick() { requestAnimationFrame(() => {}) } ] ]`, "Time [ tick = frame, onTick(dt) ]");
  await silent(`App [ Text [ text = "x", onClick() { console.log(document.title) } ] ]`, "lib");
  await silent(`App [ Text [ text = "x", onClick() { console.log(process.env.HOME) } ] ]`, "@types/node");
  // the ES built-ins and the prelude stay in scope
  await silent(`App [ Text [ text = "x", onClick() { console.log(Math.max(1, 2), JSON.stringify({}), new Map(), Date.now(), structuredClone({})) } ] ]`, "host's");
});

await test("await in a body is refused in Declare's words, naming the DataSource and .then() shapes", async () => {
  await says(`App [ Text [ text = "x", onClick() { const r = await fetch("/x"); console.log(r) } ] ]`, "a { } body is synchronous — there is no 'await'");
  await silent(`App [ Text [ text = "x", onClick() { const r = await fetch("/x"); console.log(r) } ] ]`, "async functions");
});

// ── a bare enum token inside { } names its quoted form ──────────────────────
// `fontWeight = { active ? semibold : regular }` read as "cannot resolve
// 'semibold'" — the fix is mechanical and was not in the message (field report
// 2026-08-21).
await test("a bare enum token inside a { } body is answered with the quoted form", async () => {
  await says(`App [ on: boolean = true, Text [ text = "x", fontWeight = { app.on ? semibold : regular } ] ]`, `'semibold' is one of fontWeight's values`);
  await says(`App [ on: boolean = true, Text [ text = "x", fontWeight = { app.on ? semibold : regular } ] ]`, `write it as a string: "semibold"`);
  await says(`App [ on: boolean = true, Text [ text = "x", textAlign = { app.on ? right : left } ] ]`, `"right"`);
  // a token of ANOTHER slot is still simply unresolved
  await silent(`App [ on: boolean = true, Text [ text = { app.on ? semibold : "x" } ] ]`, "is one of");
});

// ── assigning read-only `.value` names the verbs, not TS's bare refusal ─────
// Field report 2026-08-21: guide says set([], v), the runtime's old advice said
// "assign .value", and TS 2540 refused that with no way forward. The remap
// closes the loop: the verbs, with the whole-document replace spelled out.
await test("assigning a Dataset's value is answered with the mutation verbs and set([], v)", async () => {
  const src = `App [ d: Dataset { { "n": 1 } }, Text [ text = "x", onClick() { app.d.value = ({ "n": 2 }) } ] ]`;
  await says(src, "'value' is read-only — data changes through the verbs");
  await says(src, "set([], v) replaces the whole document");
  await silent(src, "Cannot assign to");
});

// ── a per-frame Time that ignores dt is polling — a WARNING naming the reflex ─
// "Nothing waits" (declare.md §1): the per-frame handler that checks state is
// the one imperative habit every field report has shown.
await test("a per-frame Time whose onTick never reads dt warns that it is polling; one that integrates, or a calendar tick, does not", async () => {
  const warnText = async (src) => {
    const r = await compile(src, { originDir: process.cwd() });
    assert.equal(r.errors.length, 0, r.errors.map((e) => e.message).join("\n"));
    return r.warnings.map((w) => w.message).join("\n");
  };
  const polls = await warnText(`App [ ready: boolean = false, data: DataSource [ url = "x.json" ],
    Time [ tick = frame, onTick(dt: number) { if (app.data.loaded) { app.ready = true } } ] ]`);
  assert.ok(polls.includes("never reads 'dt'"), polls);
  assert.ok(polls.includes("Nothing waits"), polls);
  const integrates = await warnText(`App [ x0: number = 0, Time [ tick = frame, onTick(dt: number) { app.x0 = app.x0 + 60 * dt } ] ]`);
  assert.equal(integrates, "");
  // 'dt' inside a string is not a read
  const inString = await warnText(`App [ Time [ tick = frame, onTick(dt: number) { console.log("dt") } ] ]`);
  assert.ok(inString.includes("never reads 'dt'"));
  // a CALENDAR tick is an event, not a poll: ignoring dt there is the normal case
  const minuteTurns = await warnText(`App [ n: number = 0, Time [ tick = minute, onTick(dt: number) { app.n = app.n + 1 } ] ]`);
  assert.equal(minuteTurns, "", "tick = minute: onTick is 'when the minute turns'");
  const defaultTick = await warnText(`App [ n: number = 0, Time [ onTick() { app.n = app.n + 1 } ] ]`);
  assert.equal(defaultTick, "", "the default tick is second — a calendar tier");
});

// ── a { } that reads the ambient clock is a stopped clock — a WARNING (L-25) ──
await test("a { } reading Date.now() / new Date() warns that it evaluates once; a projection of a value, or a handler, does not", async () => {
  const warnText = async (src) => {
    const r = await compile(src, { originDir: process.cwd() });
    assert.equal(r.errors.length, 0, r.errors.map((e) => e.message).join("\n"));
    return r.warnings.map((w) => w.message).join("\n");
  };
  const stopped = await warnText(`App [ Text [ text = { "" + new Date() } ] ]`);
  assert.ok(stopped.includes("reads new Date()") && stopped.includes("once and never again"), stopped);
  assert.ok(stopped.includes("Time member"), "names the member that carries time: " + stopped);
  const dateNow = await warnText(`App [ t: number = { Date.now() } ]`);
  assert.ok(dateNow.includes("reads Date.now()"), dateNow);
  // a value projected through Date is a derivation, not an ambient read
  const projected = await warnText(`App [ clock: Time [ tick = minute ], Text [ text = { new Date(app.clock.now).toLocaleTimeString() } ] ]`);
  assert.equal(projected, "", "new Date(value) is a projection");
  // a handler is a moment, and may read the moment
  const handler = await warnText(`App [ t: number = 0, onClick() { app.t = Date.now() } ]`);
  assert.equal(handler, "");
});

// ── a bare object literal inside { } — the #24 dead end, named (probe-based) ──
await test("a bare object literal inside { } names the real mistake; the parenthesized form compiles; other errors keep their fragment", async () => {
  const r = await compile('App [ width = 100, height = 100, cfg: object = { a: "one", b: "two" } ]', { originDir: process.cwd() });
  assert.ok(r.errors.length > 0, "still an error");
  assert.ok(r.errors[0].message.includes("its own parentheses"), r.errors[0].message);
  const ok = await compile('App [ width = 100, height = 100, cfg: object = { ({ a: "one", b: "two" }) } ]', { originDir: process.cwd() });
  assert.deepEqual(ok.errors.map((e) => e.message), []);
  const other = await compile('App [ width = 100, height = 100, n: number = { foo bar } ]', { originDir: process.cwd() });
  assert.ok(other.errors.length > 0 && !other.errors[0].message.includes("its own parentheses"), other.errors[0]?.message);
});

summarize("diagnostics-hints");
