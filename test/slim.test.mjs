// Registry slimming + the `use [ … ]` keep-list. A production build ships only
// the component classes an app can instantiate — the static tree references
// (tags, class bases), any `{ }`-body `new X()`, and the explicit `use` list —
// dropping the rest (the rich-text engine, etc.). These tests prove: the `use`
// directive parses/validates, the used-set is computed correctly, the slim
// manifest can't drift from the real tables, and a slimmed bundle still renders.
import assert from "node:assert";
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";
import { parseProgram } from "../runtime/dist/parser.js";
import { check } from "../runtime/dist/check.js";
import {
  REGISTRY_MANIFEST, REGISTRY_NAMES,
  TAGS, LAYOUTS, LAYOUT_BASES, DATA, ANIMATORS, ANIMATOR_GROUPS, STATES,
} from "../runtime/dist/registry.js";
import { compileProgram, usedComponentNames } from "../compiler/dist/declarec.js";
import { buildProduction } from "../tools/declarec.mjs";
import { parseFlags, parseArgvFlags, DEFAULT_FLAGS } from "../compiler/dist/flags.js";
import { inlineAppPage } from "./harness.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { const r = fn(); if (r instanceof Promise) return r.then(() => { pass++; console.log("  ok —", name); }, (e) => { fail++; console.log("  FAIL —", name, "\n     ", e.message); }); pass++; console.log("  ok —", name); }
  catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); }
}
const used = async (src) => { const b = await compileProgram(src, { stripPos: false }); assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; ")); return new Set(b.usedComponents); };

// ── the `use` directive ──────────────────────────────────────────────────────
test("use [ … ] parses into program.uses", () => {
  assert.deepEqual(parseProgram(`use [ Markdown, HTMLText ]\nApp [ width = 10 ]`).uses, ["Markdown", "HTMLText"]);
});
test("use of a built-in / declared class passes check", () => {
  assert.equal(check(parseProgram(`use [ Markdown ]\nApp [ width = 10 ]`)).length, 0);
  assert.equal(check(parseProgram(`class Card extends View [ ]\nuse [ Card ]\nApp [ width = 10 ]`)).length, 0);
});
test("use of an unknown name is a checker error", () => {
  const errs = check(parseProgram(`use [ Nope ]\nApp [ width = 10 ]`));
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /unknown component 'Nope'/);
});
test("use of an abstract base (RichText/Layout) is rejected", () => {
  assert.equal(check(parseProgram(`use [ RichText ]\nApp [ width = 10 ]`)).length, 1);
  assert.equal(check(parseProgram(`use [ Layout ]\nApp [ width = 10 ]`)).length, 1);
});
test("a non-identifier use entry is a parse error", () => {
  assert.throws(() => parseProgram(`use [ "x" ]\nApp [ width = 10 ]`), /a use entry is a component name/);
});

// ── the used-set ─────────────────────────────────────────────────────────────
test("used-set: a static tag is detected", async () => assert.ok((await used(`App [ Markdown [ text = "x" ] ]`)).has("Markdown")));
test("used-set: a class base is detected", async () => assert.ok((await used(`class C extends HTMLText [ ]\nApp [ C [ html = "<p>x</p>" ] ]`)).has("HTMLText")));
test("used-set: the root's own tag (App) is always present", async () => assert.ok((await used(`App [ Text [ text = "x" ] ]`)).has("App")));
test("used-set: a component-valued member (layout/data/animator) is detected", async () => {
  const u = await used(`App [ layout: SimpleLayout [ axis = y ], ds: DataSource [ url = "x" ], Text [ text = "x" ] ]`);
  assert.ok(u.has("SimpleLayout") && u.has("DataSource"));
});
test("used-set: a no-prose app does NOT include rich text", async () => {
  const u = await used(`App [ Text [ text = "x" ] ]`);
  assert.ok(!u.has("Markdown") && !u.has("HTMLText"));
});
test("used-set: use[] adds a name with no static reference", async () => assert.ok((await used(`use [ Markdown ]\nApp [ Text [ text = "x" ] ]`)).has("Markdown")));
// ── the used-set sees a class named in LITERAL rich-text content ────────────
// An inline view is written as a TAG inside `HTMLText.html` / `Markdown.text`, so
// the content string is a reference site. Miss it and the build has the worst
// shape of bug it can have: dev ships the registry whole and the tag renders as a
// real view, production drops the class and the same tag renders as plain text.
test("used-set: a class named ONLY by a tag in a literal html string is kept", async () => {
  const u = await used(`class Issue extends View [ width = 60, height = 20 ]
    App [ width = 400, HTMLText [ width = 380, html = "Fixed by <Issue id='142'/> today." ] ]`);
  assert.ok(u.has("Issue"), "the tag in the literal is the only reference — it must keep the class");
});
test("used-set: the same tag in a literal Markdown `text` is kept", async () => {
  const u = await used(`class Issue extends View [ width = 60, height = 20 ]
    App [ width = 400, Markdown [ width = 380, text = "Fixed by <Issue id='142'/>." ] ]`);
  assert.ok(u.has("Issue"));
});
test("used-set: the content slot is found by SCHEMA CHAIN, so a subclass carries it too", async () => {
  const u = await used(`class Issue extends View [ width = 60, height = 20 ]
    class Note extends HTMLText [ width = 380 ]
    App [ width = 400, Note [ html = "see <Issue/>" ] ]`);
  assert.ok(u.has("Issue"));
});
test("used-set: a COMPUTED document keeps nothing — `use` is the author's tool there", async () => {
  const src = (uses) => `${uses}class Issue extends View [ width = 60, height = 20 ]
    App [ width = 400, who: string = "x",
      HTMLText [ width = 380, html = { "Fixed by <Issue/> by " + app.who } ] ]`;
  assert.ok(!(await used(src(""))).has("Issue"), "a { }-built string is not scanned (nor is a fetched one)");
  assert.ok((await used(src("use [ Issue ]\n"))).has("Issue"), "…and `use` is what keeps it");
});
test("used-set: a whitelisted tag keeps nothing — the scan is intersected with the program's classes", async () => {
  const u = await used(`class Issue extends View [ width = 60, height = 20 ]
    App [ width = 400, HTMLText [ width = 380, html = "<b>bold</b> <span class='x'>y</span> <br/>" ] ]`);
  assert.ok(!u.has("Issue"), "nothing in this document names Issue");
});
test("used-set: a non-rich-text `text` slot is not content — Text is not scanned", async () => {
  const u = await used(`class Issue extends View [ width = 60, height = 20 ]
    App [ width = 400, Text [ text = "not a document: <Issue/>" ] ]`);
  assert.ok(!u.has("Issue"), "Text descends from neither Markdown nor HTMLText");
});

test("used-set: a declared stream member is detected", async () => {
  const u = await used(`App [ feed: EventStream [ url = "x" ], Text [ text = "y" ] ]`);
  assert.ok(u.has("EventStream") && !u.has("Socket"));
});
test("used-set: a stream-free app ships no stream classes (streams.md §4 slim discipline)", async () => {
  const u = await used(`App [ Text [ text = "x" ] ]`);
  assert.ok(!u.has("EventStream") && !u.has("Socket"));
});

// ── the slim manifest can't drift from the real tables ───────────────────────
test("REGISTRY_MANIFEST matches the runtime tables exactly (no drift)", () => {
  const tables = { TAGS, LAYOUTS, LAYOUT_BASES, DATA, ANIMATORS, ANIMATOR_GROUPS, STATES };
  for (const [name, table] of Object.entries(tables)) {
    const manifestNames = new Set(REGISTRY_MANIFEST.filter((e) => e.table === name).map((e) => e.name));
    const tableNames = new Set(Object.keys(table));
    assert.deepEqual([...manifestNames].sort(), [...tableNames].sort(), `table ${name} drifted from the manifest`);
  }
  // Every manifest name is a known registry name and vice versa.
  assert.deepEqual([...new Set(REGISTRY_MANIFEST.map((e) => e.name))].sort(), [...new Set(REGISTRY_NAMES)].sort());
});

// ── compile MODIFIERS: two of them (render, crawler), one model, three surfaces ───
// (slim/stripPos/typecheck/prod are NOT flags — docs/system-design/requests.md §"Removed knobs".)
const P = (obj) => ({ has: (k) => k in obj, get: (k) => (k in obj ? String(obj[k]) : null) });
test("URL modifiers: defaults when absent", () => {
  const f = parseFlags(P({}), DEFAULT_FLAGS);
  assert.equal(f.render, "dom"); assert.equal(f.crawler, false);
});
test("URL modifiers: ?render=canvas and ?crawler", () => {
  const f = parseFlags(P({ render: "canvas", crawler: "" }), DEFAULT_FLAGS);
  assert.equal(f.render, "canvas"); assert.equal(f.crawler, true);
});
test("URL modifiers: a malformed enum / boolean falls back to the base", () => {
  assert.equal(parseFlags(P({ render: "wat" }), DEFAULT_FLAGS).render, "dom");
  assert.equal(parseFlags(P({ crawler: "maybe" }), DEFAULT_FLAGS).crawler, false);
});
test("URL modifiers: the removed knobs are ignored (not flags anymore)", () => {
  const f = parseFlags(P({ slim: "0", stripPos: "0", typecheck: "0", prod: "" }), DEFAULT_FLAGS);
  assert.equal(f.slim, undefined); assert.equal(f.stripPos, undefined);
  assert.equal(f.typecheck, undefined); assert.equal(f.prod, undefined);
});
test("argv modifiers: --canvas + --crawler, input left in rest", () => {
  const { flags, rest } = parseArgvFlags(["--canvas", "--crawler", "app.declare"], DEFAULT_FLAGS);
  assert.equal(flags.render, "canvas"); assert.equal(flags.crawler, true);
  assert.deepEqual(rest, ["app.declare"]);
});
test("argv modifiers: removed/CLI-owned switches pass through to rest", () => {
  const { flags, rest } = parseArgvFlags(["--no-slim", "--debug", "--render", "canvas"], DEFAULT_FLAGS);
  assert.equal(flags.render, "canvas");
  assert.ok(rest.includes("--no-slim")); assert.ok(rest.includes("--debug"));
});

// ── the registry's exclusion is not undone by a second door ──────────────────
// The production entry once imported index.js — the barrel — for the nine lines
// that inject the `{ }`-body services. esbuild can only drop a re-export when
// the module behind it is side-effect-free, and most of this runtime is not
// (top-level `defineAttributes`), so the barrel PINNED modules the program
// could never reach: `image.js` and `text-input.js` shipped in a hello-world
// whose used-set correctly excluded Image and TextInput. The registry did its
// job; a second door undid it. The entry imports services.js now, and this test
// pins that — the failure mode is invisible, a correct bundle that is merely
// bigger, with every other test still green.
await test("registry exclusion holds through the entry (no barrel import)", async () => {
  const out = await buildProduction(`App [ width = 200, Text [ text = "a" ] ]`, {});
  assert.ok(out.ok, "build failed");
  const modules = Object.keys(Object.values(out.metafile.outputs)[0].inputs).map((p) => p.split(/[/\\]/).pop());
  assert.ok(!out.usedComponents.includes("Image") && !out.usedComponents.includes("TextInput"),
    "fixture must use neither Image nor TextInput for this test to mean anything");
  assert.ok(!modules.includes("image.js"),
    "image.js is bundled though Image is unused — something in the entry is pinning it (a barrel import?)");
  assert.ok(!modules.includes("text-input.js"),
    "text-input.js is bundled though TextInput is unused — something in the entry is pinning it (a barrel import?)");
  assert.ok(!modules.includes("index.js"),
    "index.js (the barrel) reached the production bundle — the entry should import services.js");
});

// ── a slimmed bundle renders ─────────────────────────────────────────────────
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find((p) => existsSync(p));
async function renders(src) {
  const b = await buildProduction(src, {});
  assert.ok(b.ok, "build failed: " + (b.errors || []).map((e) => e.message).join("; "));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.setContent(inlineAppPage(b), { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 350));
    const n = await page.evaluate(() => document.getElementById("host")?.querySelectorAll("*").length ?? -1);
    assert.equal(errs.length, 0, "page errors: " + errs.slice(0, 2).join(" | "));
    assert.ok(n > 1, "host has no rendered content");
    return { used: b.usedComponents, gz: b.sizes.appGzip };
  } finally { await browser.close(); }
}

if (!CHROME) {
  console.log("  (skipping render tests — no Chrome found)");
} else {
  await test("slimmed no-prose bundle renders (rich text dropped)", async () => {
    const r = await renders(`App [ width = 200, layout: SimpleLayout [ axis = y ], Text [ text = "a" ], Text [ text = "b" ] ]`);
    assert.ok(!r.used.includes("Markdown"));
  });
  await test("slimmed prose bundle renders (Markdown kept)", async () => {
    const r = await renders(`App [ width = 200, Markdown [ width = 180, text = "# Hi" ] ]`);
    assert.ok(r.used.includes("Markdown"));
  });
  await test("slimming saves > 5KB gzip vs the full runtime on a no-prose app", async () => {
    const src = `App [ width = 200, Text [ text = "a" ] ]`;
    const full = await buildProduction(src, { slim: false });
    const lean = await buildProduction(src, {});
    const saved = (full.sizes.appGzip - lean.sizes.appGzip) / 1024;
    assert.ok(saved > 5, `only saved ${saved.toFixed(1)}KB`);
  });

  // ── the SERVICE gates: focus/keys and tip are wired for every app by
  // boot.ts and view.ts, so an app with nothing focusable and no tips has no
  // use for them. Each case asserts BOTH halves — dropped when unused, and
  // present when the program's own facts say otherwise — because a gate that
  // only ever drops is indistinguishable from one that is simply broken.
  const modsOf = (b) => {
    const out = b.metafile.outputs[Object.keys(b.metafile.outputs)[0]].inputs;
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k.split("/").pop(), v.bytesInOutput]));
  };
  const STUBBED = 400;   // a stub compiles to a few hundred bytes; the real modules are thousands

  await test("focus + keys drop from an app with nothing focusable", async () => {
    const b = await buildProduction(`App [ width = 200, Text [ text = "static" ] ]`, {});
    const m = modsOf(b);
    assert.ok((m["focus.js"] ?? 0) < STUBBED, `focus.js should be stubbed, was ${m["focus.js"]}`);
    assert.ok((m["keys.js"] ?? 0) < STUBBED, `keys.js should be stubbed, was ${m["keys.js"]}`);
  });

  await test("…and STAY for a TextInput, whose runtime class makes itself a tab stop", async () => {
    const b = await buildProduction(`App [ width = 200, TextInput [ width = 100, text = "x" ] ]`, {});
    const m = modsOf(b);
    assert.ok(m["focus.js"] > STUBBED, "a text field needs the real focus service");
    assert.ok(m["keys.js"] > STUBBED, "…and the keyboard that drives Tab");
  });

  await test("…and STAY for a view that only DECLARES itself focusable", async () => {
    const b = await buildProduction(`App [ width = 200, View [ width = 10, height = 10, focusable = true ] ]`, {});
    assert.ok(modsOf(b)["focus.js"] > STUBBED, "focusable = true is the fact, wherever it is written");
  });

  await test("…and STAY for a body that CALLS the service", async () => {
    const b = await buildProduction(`App [ width = 200, onClick() { Focus.blur() }, Text [ text = "x" ] ]`, {});
    assert.ok(modsOf(b)["focus.js"] > STUBBED, "an imperative call is a use");
  });

  await test("…and STAY for a Keys member", async () => {
    const b = await buildProduction(`App [ width = 200, k: Keys [ onKeyUp(e: KeyEvent) { } ], Text [ text = "x" ] ]`, {});
    assert.ok(modsOf(b)["keys.js"] > STUBBED, "the source component is a use");
  });

  await test("the tip service drops without tips, and stays with one", async () => {
    const without = await buildProduction(`App [ width = 200, Text [ text = "x" ] ]`, {});
    assert.ok((modsOf(without)["tip.js"] ?? 0) < STUBBED, "no tips → no tip service");
    const with_ = await buildProduction(`App [ width = 200, Text [ text = "x", tip = "hello" ] ]`, {});
    assert.ok(modsOf(with_)["tip.js"] > STUBBED, "one tip attribute keeps it");
  });

  await test("the datapath island scanner drops from EVERY production build (data-paths.md §5)", async () => {
    // Even an app that USES datapaths ships without the scanner: compile()
    // lowered each `:path` island to `this.$data([…])` at emission, so the
    // runtime rewrite is the identity and only splitPath (the attribute-path
    // currency, kept real in the stub) remains live. The render proves the
    // emitted plans carry the reads end to end under the stub.
    const src = `App [ width = 200, fill = white,
      d: Dataset { { "label": "hi from a plan" } },
      v: View [ datapath = { d.value }, Text [ x = 10, y = 10, text = { "" + :label } ] ],
    ]`;
    const b = await buildProduction(src, {});
    const m = modsOf(b);
    assert.ok(m["datapath.js"] < STUBBED, `datapath.js should be stubbed, was ${m["datapath.js"]}`);
    const appJs = b.files.find((f) => f.name.startsWith("app.")).contents;
    // The program rides app.js as a serialized string, so the plan's quotes
    // arrive escaped (`$data([\\"label\\"])`) — match through any escaping.
    assert.ok(/\$data\(\[[\\"]*label/.test(appJs), "the embedded program carries the pre-parsed plan");
    await renders(src);
  });

  await test("the selector evaluator rides only with selectors aboard (data-paths.md §7 — pay-for-what-you-write)", async () => {
    const without = await buildProduction(`App [ width = 200,
      d: Dataset { { "label": "x" } },
      v: View [ datapath = { d.value }, Text [ text = { "" + :label } ] ],
    ]`, {});
    assert.ok((modsOf(without)["select.js"] ?? 0) < STUBBED, `a name-only program stubs select.js, was ${modsOf(without)["select.js"]}`);
    const src = `App [ width = 200, fill = white,
      d: Dataset { { "rows": ["a", "b", "c", "d"] } },
      v: View [ datapath = { d.value }, Text [ x = 10, y = 10, text = { (:rows[1:3]).join("+") } ] ],
    ]`;
    const with_ = await buildProduction(src, {});
    assert.ok(modsOf(with_)["select.js"] > STUBBED, "a slice keeps the evaluator");
    await renders(src); // and it evaluates under the production stubs
  });

  await test("the shape validator rides only with a schema aboard (B4 — pay-per-use)", async () => {
    const without = await buildProduction(`App [ width = 200, d: Dataset { { "x": 1 } }, Text [ text = "n" ] ]`, {});
    assert.ok((modsOf(without)["data-schema.js"] ?? 0) < STUBBED, `no schema → data-schema.js stubbed, was ${modsOf(without)["data-schema.js"]}`);
    const with_ = await buildProduction(`App [ width = 200,
      d: Dataset [ schema = [ rows[]: [ id: string ] ] ] { { "rows": [] } },
      Text [ text = "n" ] ]`, {});
    assert.ok(modsOf(with_)["data-schema.js"] > STUBBED, "a declared schema keeps the validator");
  });

  await test("the named vocabulary — effects, 3D, measureText, drawn text and images, features, Face, the change event — rides only where a program names it", async () => {
    const MODS = ["effects.js", "dom-effects.js", "projective.js", "text-measure.js", "font-derive.js", "face-literal.js", "draw-image.js", "draw-text.js", "change-event.js"];
    const none = modsOf(await buildProduction(`App [ width = 200, Text [ text = "plain" ] ]`, {}));
    for (const f of MODS) assert.ok((none[f] ?? 0) < STUBBED, `${f} should be stubbed for a program naming none of it, was ${none[f]}`);
    // every word named, and it RENDERS on the real modules (effects.js and value.js import each other)
    const src = `App [ width = 200, fill = white,
      a: View [ width = 40, height = 40, fill = radialGradient(0.5, 0.5, 1, red, blue), filter = [blur(2), colorize(navy)], rotateY = 20,
        trackChanges = ["opacity"], onChange(e: ChangeEvent) { } ],
      b: View [ y = 50, width = 40, height = 40, fill = red, mask = gradient(#000000, #00000000) ],
      c: Text [ y = 100, text = "12", numerals = lining, width = { measureText("12", { fontSize: 13 }).width + 4 } ],
      e: View [ y = 130, width = 60, height = 20, draw(d: Draw) { d.fillText("hi", 2, 14, { fontSize: 12 }) } ],
    ]`;
    const kept = modsOf(await buildProduction(src, {}));
    for (const f of MODS.filter((m) => m !== "face-literal.js" && m !== "draw-image.js")) assert.ok(kept[f] > STUBBED, `${f} should ride for a program that names it, was ${kept[f]}`);
    await renders(src);
    const faced = await buildProduction(`App [ width = 200, img: Image [ width = 10, height = 10 ],
      f: Font [ Face [ src = "f.woff2" ] ],
      View [ width = 10, height = 10, draw(d: Draw) { d.drawImage(app.img, 0, 0) } ] ]`, {});
    assert.ok(faced.ok, "build failed: " + (faced.errors || []).map((e) => e.message).join("; "));
    assert.ok(modsOf(faced)["face-literal.js"] > STUBBED && modsOf(faced)["draw-image.js"] > STUBBED, "a Face and a drawImage call keep their modules");
  });

  // The DOM backend's native rich-text flow (dom-rich.js) is reachable from one
  // place only — a RichText pushing its parsed blocks at the surface beneath it
  // — so an app that names no rich-text component pays nothing for it, inline
  // views included. The fact reads the USED-SET, which carries every class's
  // `extends` base: a subclass (at any depth) keeps the module as surely as the
  // built-in tag does.
  await test("the DOM rich-text flow rides only with rich text — a subclass keeps it too", async () => {
    const none = modsOf(await buildProduction(`App [ width = 200, Text [ text = "plain" ] ]`, {}));
    assert.ok((none["dom-rich.js"] ?? 0) < STUBBED, `dom-rich.js should be stubbed for a prose-free app, was ${none["dom-rich.js"]}`);
    const tag = `App [ width = 200, fill = white, Markdown [ width = 180, text = "# hi\\n\\nsome *prose*" ] ]`;
    assert.ok(modsOf(await buildProduction(tag, {}))["dom-rich.js"] > STUBBED, "a Markdown keeps the flow");
    await renders(tag);
    // …and through a base chain the tag never names: Deep → Note → HTMLText
    const sub = `class Note extends HTMLText [ width = 180 ]
class Deep extends Note [ ]
App [ width = 200, fill = white, Deep [ html = "<p>prose</p>" ] ]`;
    assert.ok(modsOf(await buildProduction(sub, {}))["dom-rich.js"] > STUBBED,
      "a class whose base chain reaches HTMLText keeps the flow");
    await renders(sub);
  });

  // The PER-SIDE stroke (stroke-sides.js — the split, the uniform test, the
  // list's equality and coercion, and both painters) is NOT gated, and this is
  // the test that says why it may not be. It rode behind a fact that read a
  // four-element list LITERAL out of the parse tree, which was exact only while
  // `stroke`'s body-facing type was `Stroke | null` — a type that foreclosed
  // every other way of producing a list. The type is `BoxStroke` now, so a
  // `{ }` constraint computes the four sides (the themed-border form, which is
  // how a real app writes one) and a method body may assign them. Neither is a
  // literal; neither is visible to a tree walk. A fact that can MISS would stub
  // the module out from under a program that runs, so the module ships to every
  // build — 213 B gzipped, priced in declarec.test.mjs's band comment.
  //
  // The COMPUTED case is the one to hold onto: it is the form the fact could
  // not have seen, so it is the proof that nothing is gating this any more.
  await test("the per-side stroke is aboard every build — including the computed form no fact could see", async () => {
    const uniform = `App [ width = 200, fill = white,
      a: View [ width = 40, height = 40, stroke = stroke(1, #DBE1E9) ],
      b: View [ y = 50, width = 40, height = 40, stroke = { stroke(1, 0xDBE1E9) } ] ]`;
    assert.ok(modsOf(await buildProduction(uniform, {}))["stroke-sides.js"] > STUBBED,
      "no stroke list anywhere — the module rides anyway, because a fact could not prove it unreachable");
    await renders(uniform);
    const sides = `App [ width = 200, fill = white,
      rules: View [ width = 100, height = 40, fill = white,
        stroke = [ stroke(1, #DBE1E9), null, stroke(2, #99A0AA), null ] ] ]`;
    assert.ok(modsOf(await buildProduction(sides, {}))["stroke-sides.js"] > STUBBED,
      "the literal four-element form");
    await renders(sides);
    // The case the retired fact would have MISSED, end to end: a themed border
    // whose only per-side stroke is computed in a `{ }`. It must build, the
    // module must be aboard, and it must paint — under the stub this threw
    // `notAboard` at the first paint.
    const computed = `theme Brand [ line = #DBE1E9 ]
      App [ width = 200, fill = white, theme = Brand,
        card: View [ width = 100, height = 40, fill = white,
          stroke = { [ stroke(1, provided("theme").line), null, stroke(1, provided("theme").line), null ] } ] ]`;
    assert.ok(modsOf(await buildProduction(computed, {}))["stroke-sides.js"] > STUBBED,
      "a computed four-side stroke keeps the module — the whole reason the gate is gone");
    await renders(computed);
  });

  // THE FAILURE THE WORD MATCH HAD. A slimming decision may only drop a module
  // the program CANNOT reach. A filter or a paint that arrives from a remote
  // `DataSource` is named nowhere in the source, so a match over the program's
  // text saw nothing, dropped the module, and the production build threw on a
  // program that ran fine in development. The decision reads the parse tree now:
  // a carrying slot whose value is not a literal keeps its module.
  await test("a value that can only arrive at RUN TIME keeps its module (the word match dropped it)", async () => {
    const dynFilter = `App [ width = 200, fill = white,
      d: DataSource [ url = "look.json" ],
      v: View [ width = 40, height = 40, fill = red, filter = { d.value.f } ] ]`;
    assert.ok(modsOf(await buildProduction(dynFilter, {}))["effects.js"] > STUBBED,
      "a filter whose value comes from data must keep effects.js — nothing in the source names blur()");
    const dynPaint = `App [ width = 200, fill = white,
      d: DataSource [ url = "look.json" ],
      v: View [ width = 40, height = 40, fill = { d.value.paint } ] ]`;
    assert.ok(modsOf(await buildProduction(dynPaint, {}))["effects.js"] > STUBBED,
      "a computed fill can yield a gradient, so effects.js must ride");
    // …and the DOM half, for a mask or a colorize arriving the same way
    const dynMask = `App [ width = 200, fill = white,
      d: DataSource [ url = "look.json" ],
      v: View [ width = 40, height = 40, fill = red, mask = { d.value.m } ] ]`;
    assert.ok(modsOf(await buildProduction(dynMask, {}))["dom-effects.js"] > STUBBED,
      "a mask set from data must keep dom-effects.js");
    // the floor still holds: a program with no carrying slot at all stays slim
    const plain = modsOf(await buildProduction(`App [ width = 200, fill = navy, Text [ text = "hi" ] ]`, {}));
    assert.ok((plain["effects.js"] ?? 0) < STUBBED && (plain["dom-effects.js"] ?? 0) < STUBBED,
      "a program that sets no filter, mask or computed fill is still slimmed");
  });

  await test("a service-free app still RENDERS (the stubs satisfy boot's wiring)", async () => {
    await renders(`App [ width = 200, fill = white, Text [ x = 10, y = 10, text = "no services" ] ]`);
  });

  // escapeHtml is prelude vocabulary with no slimming fact of its own: it lives
  // in services.js, which the production entry imports unconditionally. A
  // prelude name that typechecks but is absent from body scope fails as a boot
  // ReferenceError and nothing else — which is why this asks the SLIMMED bundle
  // for the value, not the compiler for the signature.
  await test("escapeHtml resolves in a slimmed production build (no fact gates it)", async () => {
    const src = `App [ width = 200, fill = white,
      me: string = "Ada <'&\\">",
      safe: string = { escapeHtml(app.me) },
      t: Text [ x = 4, y = 4, text = { app.safe } ] ]`;
    const b = await buildProduction(src, {});
    assert.ok(b.ok, "build failed: " + (b.errors || []).map((e) => e.message).join("; "));
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(e.message));
      await page.setContent(inlineAppPage(b), { waitUntil: "networkidle0" });
      await new Promise((r) => setTimeout(r, 350));
      assert.equal(errs.length, 0, "page errors: " + errs.slice(0, 2).join(" | "));
      const text = await page.evaluate(() => document.getElementById("host")?.textContent ?? "");
      assert.ok(text.includes("Ada &lt;&#39;&amp;&quot;&gt;"),
        `the slimmed bundle should have escaped &, <, >, " and ' — got ${JSON.stringify(text)}`);
    } finally { await browser.close(); }
  });
}

console.log(`\nslim: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
