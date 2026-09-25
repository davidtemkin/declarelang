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
// They know INTENT; edit distance only knows letters. A hinted name that is
// ALSO a real Declare name answers as itself (the collision is supported —
// surfaces.mjs — and `padding` on a View IS the attribute, not a hint); the
// hint still catches the same instinct arriving at the wrong door — which for
// `padding` is the layout, the one place a CSS reader expects the inset to sit.
await test("an exact CSS name gets the concept, not a spelling", async () => {
  await says(`App [ View [ layout: SimpleLayout [ axis = y, padding = 4 ] ] ]`, "padding is the view's, not the layout's");
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
// The checker loads no DOM lib, so the prelude declares the host chores a body
// may use (URL, console, the URI escapes) by hand. The host's fetch and timers
// are declared too — a script block shares the prelude — but a body is
// answered with DataSource / afterDelay / Time instead.
await test("a handler may build a URL and escape a component; fetch is answered with DataSource", async () => {
  const src = `App [ Text [ text = "x", onClick() {
    const u = new URL("/x?a=1", "http://h"); u.searchParams.set("b", "2");
    console.log(u.toString(), encodeURIComponent("x y"));
  } ] ]`;
  const text = await errText(src);
  assert.equal(text, "", `expected a clean compile, got:\n  ${text}`);
  await says(`App [ Text [ text = "x", onClick() { fetch("/x") } ] ]`, "A request is a DataSource member");
});

await test("an unknown bare name names what a global IS, instead of offering 'a global' as the answer", async () => {
  await says(`App [ Text [ text = "x", onClick() { bogus(1) } ] ]`, "one of the globals a body may use (Math, JSON, Date, URL, console, …)");
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
  await says(`App [ Text [ text = "x", onClick() { const r = await Promise.resolve(1); console.log(r) } ] ]`, "a { } body is synchronous — there is no 'await'");
  await silent(`App [ Text [ text = "x", onClick() { const r = await Promise.resolve(1); console.log(r) } ] ]`, "async functions");
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
await test("a bare object literal inside { } names the real mistake; the double-brace form compiles; the paren idiom is rejected; other errors keep their fragment", async () => {
  const r = await compile('App [ width = 100, height = 100, cfg: object = { a: "one", b: "two" } ]', { originDir: process.cwd() });
  assert.ok(r.errors.length > 0, "still an error");
  assert.ok(r.errors[0].message.includes("its own braces"), r.errors[0].message);
  // The fix is the paren-FREE double-brace form; the runtime's own return(…) supplies
  // the disambiguating parens, so nesting the object in its own braces is enough.
  const ok = await compile('App [ width = 100, height = 100, cfg: object = { { a: "one", b: "two" } } ]', { originDir: process.cwd() });
  assert.deepEqual(ok.errors.map((e) => e.message), []);
  // The once-idiomatic parenthesized form is now REJECTED as redundant parentheses —
  // the { } already delimits the expression (DT ruling, 2026-09-08).
  const paren = await compile('App [ width = 100, height = 100, cfg: object = { ({ a: "one", b: "two" }) } ]', { originDir: process.cwd() });
  assert.ok(paren.errors.some((e) => e.message.includes("redundant parentheses")), paren.errors.map((e) => e.message).join("; "));
  const other = await compile('App [ width = 100, height = 100, n: number = { foo bar } ]', { originDir: process.cwd() });
  assert.ok(other.errors.length > 0 && !other.errors[0].message.includes("its own braces"), other.errors[0]?.message);
});

await test("no 'shows' matches the initial location — the silently-invisible app is a warning (field report 2026-09-04)", async () => {
  // The report: `location = ""` with `shows = "home"` rendered display:none,
  // silently, forever — every screen's own `visible` evaluated correctly, and
  // `shows` gates presence independently. Now named at compile, with the
  // working names listed.
  const r = await compile(`App [ width=1, height=1, location = "",
      home: View [ shows = "home", Text [ text = "hi" ] ],
      browse: View [ shows = "browse", Text [ text = "b" ] ] ]`, { originDir: process.cwd() });
  const w = (r.warnings ?? []).filter((x) => /shows =/.test(x.message));
  assert.ok(w.length > 0, "warns");
  assert.match(w[0].message, /initial location is empty/);
  assert.match(w[0].message, /"home" \| "browse"/, "names the locations that would work");
  assert.equal(w[0].code, "DECLARE4008");
  // the correct spelling is quiet
  const ok = await compile(`App [ width=1, height=1, location = "home",
      home: View [ shows = "home", Text [ text = "hi" ] ] ]`, { originDir: process.cwd() });
  assert.equal((ok.warnings ?? []).filter((x) => /shows =/.test(x.message)).length, 0, "quiet when it matches");
  // …and so is an app whose default screen is simply UNGATED (birds' shelf IS
  // the empty address) — the bug is "nothing visible", not "something gated"
  const shelf = await compile(`App [ width=1, height=1, location = "",
      shelf: View [ Text [ text = "shelf" ] ],
      quiz: View [ shows = "quiz", Text [ text = "q" ] ] ]`, { originDir: process.cwd() });
  assert.equal((shelf.warnings ?? []).filter((x) => /shows =/.test(x.message)).length, 0, "an ungated default screen is correct");
  // …but only a VIEW counts as that screen. A Dataset or Time at root is a
  // child Element too, and counting one as "the visible screen" silenced this
  // warning on exactly the report's shape — every real app keeps data at root.
  // Caught in review (2026-09-04): the diagnostic built for their bug would
  // not have fired on their bug.
  const withData = await compile(`App [ width=1, height=1, location = "",
      d: Dataset { { "a": 1 } },
      clock: Time [ tick = second ],
      home: View [ shows = "home", Text [ text = "hi" ] ] ]`, { originDir: process.cwd() });
  assert.ok((withData.warnings ?? []).some((x) => /shows =/.test(x.message)), "data at root is not a screen — still warns");
});

await test("4005 for an authored union names ONLY the quoted spelling — there is no bare slot form to point at", async () => {
  const r = await compile(`class Fetcher extends View [ phase: "idle" | "loading" = "idle" ]
    App [ width=1, height=1, busy: boolean = false, f: Fetcher [ phase = { app.busy ? loading : idle } ] ]`, { originDir: process.cwd() });
  const e = r.errors.find((x) => x.code === "DECLARE4005");
  assert.ok(e, "4005 fires on the bare token in a body");
  assert.match(e.message, /written in quotes, in a slot as in \{ \}: "loading"/);
  assert.doesNotMatch(e.message, /phase = loading/, "must not recommend the bare slot spelling the ruling forbids");
  // the built-in message is unchanged (the diagnostic's own documented case —
  // NOT axis, whose tokens x/y are also every View's attribute names and so
  // resolve as member references, never as bare tokens)
  const b = await compile(`App [ width=1, height=1, strong: boolean = true, t: Text [ text = "a", fontWeight = { app.strong ? semibold : regular } ] ]`, { originDir: process.cwd() });
  const be = b.errors.find((x) => x.code === "DECLARE4005");
  assert.ok(be, "4005 fires for a built-in too");
  assert.match(be.message, /bare only as the whole slot \(fontWeight = semibold\)/);
});

await test("a class named like a whitelisted rich-text tag warns ONCE, and only where there is rich text", async () => {
  // Inside `Markdown`/`HTMLText` content a tag is resolved against the program's
  // own classes before the HTML whitelist, so a class literally called `code`
  // takes `<code>` over for every document the app renders. Legal, defined, and
  // invisible — a warning, at the class declaration.
  const r = await compile(`class code extends View [ width = 10, height = 10, fill = navy ]
    App [ width = 400, height = 100, HTMLText [ width = 380, html = "<p>a <code>b</code></p>" ] ]`, { originDir: process.cwd() });
  const w = (r.warnings ?? []).filter((x) => x.code === "DECLARE4010");
  assert.equal(w.length, 1, "one class, one warning: " + (r.warnings ?? []).map((x) => x.message).join(" | "));
  assert.match(w[0].message, /class code hides the rich-text tag <code>/);
  assert.match(w[0].message, /builds one code view, not the tag/, "names what happens");
  assert.match(w[0].message, /Rename the class/, "names the fix");

  // A subclass of a rich-text format is rich text too (the test is the schema
  // chain, never the tag's spelling).
  const sub = await compile(`class code extends View [ width = 10, height = 10, fill = navy ]
    class Note extends Markdown [ width = 380 ]
    App [ width = 400, height = 100, Note [ text = "hi" ] ]`, { originDir: process.cwd() });
  assert.equal((sub.warnings ?? []).filter((x) => x.code === "DECLARE4010").length, 1, "a Markdown subclass counts as rich text");

  // No flow in the program → the name collides with nothing, and a warning here
  // would be noise on a working app.
  const quiet = await compile(`class code extends View [ width = 10, height = 10, fill = navy ]
    App [ width = 400, height = 100, c: code [ ], Text [ text = "no documents here" ] ]`, { originDir: process.cwd() });
  assert.equal((quiet.warnings ?? []).filter((x) => x.code === "DECLARE4010").length, 0, "no rich text, no warning");

  // …and a class whose name is not in the whitelist never warns, rich text or not.
  const unrelated = await compile(`class Issue extends View [ width = 60, height = 20, fill = navy ]
    App [ width = 400, height = 100, HTMLText [ width = 380, html = "see <Issue/>" ] ]`, { originDir: process.cwd() });
  assert.equal((unrelated.warnings ?? []).filter((x) => x.code === "DECLARE4010").length, 0, "Issue shadows no tag");
});

// ── the idiom passes: a hint and two warnings that name the word ────────────
// Each is decided STRUCTURALLY — an AST shape, a schema chain — so the negative
// cases below are the whole test: an idiom diagnostic that fires on a program
// doing something legitimate is worse than one that never fires at all.

const idiom = async (src) => {
  const r = await compile(src, { originDir: process.cwd() });
  assert.equal(r.errors.length, 0, r.errors.map((e) => e.message).join("\n"));
  return r;
};
const codes = (r, code) => (r.diagnostics ?? []).filter((d) => d.code === code);

await test("DECLARE4011: a hand-written centering is a HINT naming x = center — every spelling of it, and nothing looser", async () => {
  const box = (attrs) => `App [ width = 400, height = 300, View [ width = 50, height = 20, ${attrs} ] ]`;
  const one = async (attrs) => {
    const r = await idiom(box(attrs));
    const h = codes(r, "DECLARE4011");
    assert.equal(h.length, 1, `expected one hint for ${attrs}, got ` + JSON.stringify((r.diagnostics ?? []).map((d) => d.rendered)));
    return h[0];
  };
  // the canonical shape, and the exact code / phase / severity it carries
  const d = await one(`x = { (parent.width - this.width) / 2 }`);
  assert.equal(d.code, "DECLARE4011");
  assert.equal(d.phase, "name");
  assert.equal(d.severity, "hint", "style is a hint — the author may have a reason, so it never blocks");
  assert.match(d.message, /this is x = center/, "the fix is the message");
  assert.match(d.message, /re-resolves when either width changes/, "…and why the word beats the arithmetic");
  assert.ok(d.rendered.startsWith("hint: "), "a hint renders marked, like a warning: " + d.rendered);
  // the variants
  assert.match((await one(`y = { (parent.height - this.height) / 2 }`)).message, /this is y = center/);
  await one(`x = { (parent.width - this.width) * 0.5 }`);
  await one(`x = { 0.5 * (parent.width - this.width) }`);          // the operands commuted
  await one(`x = { ((parent.width - this.width)) / 2 }`);          // an extra pair of parentheses
  await one(`x = { ((parent.width) - (this.width)) / 2 }`);
  await one(`x = { (parent.width - width) / 2 }`);                 // the bare name that resolves to this.width
  await one(`x = { parent.width / 2 - this.width / 2 }`);          // the distributed spelling

  // `classroot` counts as the parent exactly where it IS the parent
  const asParent = await idiom(`class Card extends View [ width = 200, height = 100,
      dot: View [ width = 10, height = 10, x = { (classroot.width - this.width) / 2 } ] ]
    App [ width = 400, height = 300, Card [ ] ]`);
  assert.equal(codes(asParent, "DECLARE4011").length, 1, "classroot IS the parent one level down");
  const notParent = await idiom(`class Card extends View [ width = 200, height = 100,
      row: View [ width = 100, height = 50,
        dot: View [ width = 10, height = 10, x = { (classroot.width - this.width) / 2 } ] ] ]
    App [ width = 400, height = 300, Card [ ] ]`);
  assert.equal(codes(notParent, "DECLARE4011").length, 0, "two levels down, classroot is not the parent — that is not a centering");

  // …and a hint never enters `warnings`, so a caller counting warnings counts
  // only what might be wrong
  const r = await idiom(box(`x = { (parent.width - this.width) / 2 }`));
  assert.deepEqual(r.warnings, [], "a hint is not a warning");
  assert.equal(r.hints.length, 1);
  assert.match(r.report, /1 hint/, "the report counts hints on their own line");
});

await test("DECLARE4011: the near misses stay silent — the same arithmetic in another slot, a literal slack, a margin", async () => {
  const box = (attrs) => `App [ width = 400, height = 300, View [ width = 50, height = 20, ${attrs} ] ]`;
  const quiet = async (attrs, why) => {
    const r = await idiom(box(attrs));
    assert.equal(codes(r, "DECLARE4011").length, 0, why + ": " + JSON.stringify((r.diagnostics ?? []).map((d) => d.rendered)));
  };
  // A HALF-GAP: the identical expression, in a slot that is not a position.
  // Only x/y are judged, because only x/y have `center` to offer.
  await quiet(`cornerRadius = { (parent.width - this.width) / 2 }`, "a half-gap is arithmetic");
  await quiet(`x = { (parent.width - 18) / 2 }`, "a literal slack is not provably this box");
  await quiet(`x = { (parent.width - this.width) / 2 + 10 }`, "a term added to it is a margin");
  await quiet(`x = { (parent.width - this.width) / 3 }`, "a third is not a half");
  await quiet(`x = { (this.width - parent.width) / 2 }`, "the subtraction the other way round is not a centering");
  await quiet(`x = { (parent.width - this.height) / 2 }`, "the cross axis is a different measurement");
  await quiet(`x = { (parent.width + this.width) / 2 }`, "a sum is not the slack");
});

await test("DECLARE4012: an Animator nothing can start warns; the legitimate never-started shapes do not", async () => {
  const anim = (extra, method = "") => `App [ width = 400, height = 300,
    View [ width = 100, height = 100${method},
      pulse: Animator [ attribute = opacity, to = 0.2, duration = 200${extra} ] ] ]`;

  const dead = await idiom(anim(""));
  const w = codes(dead, "DECLARE4012");
  assert.equal(w.length, 1, JSON.stringify((dead.diagnostics ?? []).map((d) => d.rendered)));
  assert.equal(w[0].code, "DECLARE4012");
  assert.equal(w[0].phase, "name");
  assert.equal(w[0].severity, "warning");
  assert.match(w[0].message, /nothing starts this Animator/);
  assert.match(w[0].message, /no body calls pulse\.start\(\)/, "names what it looked for");
  assert.match(w[0].message, /started = true/, "names the fix");
  assert.match(w[0].message, /A Spring needs neither/, "names the one shape that is exempt");

  const silent = async (src, why) => {
    const r = await idiom(src);
    assert.equal(codes(r, "DECLARE4012").length, 0, why + ": " + JSON.stringify((r.diagnostics ?? []).map((d) => d.rendered)));
  };
  await silent(anim(", started = true"), "started = true is the request");
  await silent(anim(", started = false"), "an explicit started = false is a decision, not an oversight");
  await silent(`App [ width = 400, height = 300, open: boolean = false,
    View [ width = 100, height = 100,
      pulse: Animator [ attribute = opacity, to = 0.2, duration = 200, started = { app.open } ] ] ]`,
    "a bound started is driven by the fact it reads");
  await silent(anim("", `, onClick() { this.pulse.start() }`), "a handler starts it by name");
  await silent(`class Card extends View [ width = 100, height = 100,
      onInit() { classroot.pulse.start() },
      pulse: Animator [ attribute = opacity, to = 0.2, duration = 200 ] ]
    App [ width = 400, height = 300, Card [ ] ]`, "…through any path that names it");
  // A SPRING is never start()-triggered — it wakes on its reactive `to`, so
  // "never started" is its normal life and warning there would be wrong.
  await silent(`App [ width = 400, height = 300, open: boolean = false,
    View [ width = 100, height = 100,
      slide: Spring [ attribute = height, to = { app.open ? 200 : 100 }, stiffness = 220, damping = 26 ] ] ]`,
    "a Spring follows its to");
  // A GROUP drives its members: a member's own `started` is ignored, so the
  // members must not be judged on it.
  await silent(`App [ width = 400, height = 300,
    View [ width = 100, height = 100,
      g: AnimatorGroup [ attribute = opacity, started = true, process = sequential,
        Animator [ to = 1, duration = 100 ],
        Animator [ to = 0, duration = 100 ] ] ] ]`, "a grouped member is driven by its group");
  // The class BODY is a definition; the use site is where `started` is set.
  await silent(`class Pulse extends Animator [ attribute = opacity, to = 0.2, duration = 200 ]
    App [ width = 400, height = 300, View [ width = 100, height = 100, p: Pulse [ started = true ] ] ]`,
    "a class body declares the motion; the use site requests it");
  await silent(`class Pulse extends Animator [ attribute = opacity, to = 0.2, duration = 200, started = true ]
    App [ width = 400, height = 300, View [ width = 100, height = 100, p: Pulse [ ] ] ]`,
    "…and a started inherited from the class counts");
  // An unattributable start() call silences the pass program-wide: under-
  // reporting is the right way to be wrong about a warning like this.
  await silent(`App [ width = 400, height = 300,
    View [ width = 100, height = 100,
      onClick() { (this.parent as any).start() },
      pulse: Animator [ attribute = opacity, to = 0.2, duration = 200 ] ] ]`,
    "a start() this pass cannot attribute keeps it quiet");
  // …and a group nobody starts is the same miss, named for what it is
  const group = await idiom(`App [ width = 400, height = 300,
    View [ width = 100, height = 100,
      g: AnimatorGroup [ attribute = opacity, process = sequential,
        Animator [ to = 1, duration = 100 ] ] ] ]`);
  const gw = codes(group, "DECLARE4012");
  assert.equal(gw.length, 1, "the group itself is the one nothing starts");
  assert.match(gw[0].message, /nothing starts this AnimatorGroup/);
});

await test("DECLARE4013: a press() override on a Button warns and names onClick; the same override on a Control is correct and silent", async () => {
  const r = await idiom(`App [ width = 400, height = 300, n: number = 0,
    Button [ label = "Go", press() { app.n = app.n + 1 } ] ]`);
  const w = codes(r, "DECLARE4013");
  assert.equal(w.length, 1, JSON.stringify((r.diagnostics ?? []).map((d) => d.rendered)));
  assert.equal(w[0].code, "DECLARE4013");
  assert.equal(w[0].phase, "name");
  assert.equal(w[0].severity, "warning");
  assert.match(w[0].message, /press\(\) on Button replaces Button's activation path/);
  assert.match(w[0].message, /answers Space and Enter/, "names the behaviour the author gets");
  assert.match(w[0].message, /Put the action in onClick\(\)/, "names the fix");

  // The test is the SCHEMA CHAIN, never the tag's spelling — a subclass of
  // Button inherits the inversion and the trap with it.
  const sub = await idiom(`class Fancy extends Button [ cornerRadius = 4 ]
    App [ width = 400, height = 300, n: number = 0, Fancy [ label = "Go", press() { app.n = app.n + 1 } ] ]`);
  assert.equal(codes(sub, "DECLARE4013").length, 1, "a Button subclass is a Button");
  const inClass = await idiom(`class Fancy extends Button [ press() { classroot.label = "x" } ]
    App [ width = 400, height = 300, Fancy [ label = "Go" ] ]`);
  assert.equal(codes(inClass, "DECLARE4013").length, 1, "…and a class body that overrides it is judged by its base");
  assert.match(codes(inClass, "DECLARE4013")[0].message, /press\(\) on Fancy/);

  // Chapter 11 teaches press() overriding on a Control, and it is correct
  // there: every other control routes the pointer through press().
  const control = await idiom(`App [ width = 400, height = 300, n: number = 0,
    Control [ width = 80, height = 30, press() { app.n = app.n + 1 }, onClick() { if (!this.disabled) this.press() } ] ]`);
  assert.equal(codes(control, "DECLARE4013").length, 0, "press() on a Control is the documented shape");
  const ownClass = await idiom(`class Tab extends Control [ width = 80, height = 30, press() { classroot.parent.width = 10 } ]
    App [ width = 400, height = 300, Tab [ ] ]`);
  assert.equal(codes(ownClass, "DECLARE4013").length, 0, "a Control subclass is still a Control");
  // …and the library's own Button, which DECLARES press() rather than
  // overriding it, is never the author's mistake
  const plain = await idiom(`App [ width = 400, height = 300, n: number = 0,
    Button [ label = "Go", onClick() { app.n = app.n + 1 } ] ]`);
  assert.equal(codes(plain, "DECLARE4013").length, 0, "the library's Button.press() is the definition, not an override");
});
// A subclass re-declaring an inherited child compiled clean and died at boot
// ("already a member of the running B"). It is refused at compile, naming the
// base that owns the child; `layout:` is the attribute form and stays legal.
await test("a subclass cannot re-declare an inherited child — said at compile, naming the owner", async () => {
  await says(`class A extends View [ width = 100, height = 40, inner: View [ width = 10, height = 10 ] ]
    class B extends A [ inner: View [ width = 20, height = 20 ] ]
    App [ B [ ] ]`, "'inner' is a child B inherits from A");
  await says(`class MyButton extends Button [ run: Text [ text = "x" ] ]
    App [ MyButton [ label = "hi" ] ]`, "'run' is a child MyButton inherits from Button");
  await silent(`class A extends View [ width = 100, height = 40, layout: SimpleLayout [ axis = y ] ]
    class B extends A [ layout: SimpleLayout [ axis = x ] ]
    App [ B [ ] ]`, "inherits from");
});

summarize("diagnostics-hints");
