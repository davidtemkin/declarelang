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
import { compileProgram, usedClassNames } from "../compiler/dist/declarec.js";
import { buildProduction } from "../tools/declarec.mjs";
import { parseFlags, parseArgvFlags, DEFAULT_FLAGS, FLAG_SPECS, flagWords } from "../compiler/dist/flags.js";
import { inlineAppPage } from "./harness.mjs";
import { launchChrome } from "../tools/internal/chrome.mjs";
import { settled } from "./settle.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { const r = fn(); if (r instanceof Promise) return r.then(() => { pass++; console.log("  ok —", name); }, (e) => { fail++; console.log("  FAIL —", name, "\n     ", e.message); }); pass++; console.log("  ok —", name); }
  catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); }
}
const used = async (src) => { const b = await compileProgram(src, { stripPos: false }); assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; ")); return new Set(b.usedClasses); };

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
  assert.match(errs[0].message, /unknown class 'Nope'/);
});
test("use of an abstract base (RichText/Layout) is rejected", () => {
  assert.equal(check(parseProgram(`use [ RichText ]\nApp [ width = 10 ]`)).length, 1);
  assert.equal(check(parseProgram(`use [ Layout ]\nApp [ width = 10 ]`)).length, 1);
});
test("a non-identifier use entry is a parse error", () => {
  assert.throws(() => parseProgram(`use [ "x" ]\nApp [ width = 10 ]`), /a use entry is a class name/);
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
test("URL modifiers: ?render=canvas and ?crawler=true", () => {
  const f = parseFlags(P({ render: "canvas", crawler: "true" }), DEFAULT_FLAGS);
  assert.equal(f.render, "canvas"); assert.equal(f.crawler, true);
});
test("URL modifiers: a boolean is the word true or false, nothing else", () => {
  for (const w of ["", "1", "yes", "on"]) assert.equal(parseFlags(P({ crawler: w }), DEFAULT_FLAGS).crawler, false, `?crawler=${w}`);
  assert.equal(parseFlags(P({ crawler: "0" }), { ...DEFAULT_FLAGS, crawler: true }).crawler, true, "?crawler=0 is not false");
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
test("argv modifiers: --render=canvas --crawler=true, input left in rest", () => {
  const { flags, rest } = parseArgvFlags(["--render=canvas", "--crawler=true", "app.declare"], DEFAULT_FLAGS);
  assert.equal(flags.render, "canvas"); assert.equal(flags.crawler, true);
  assert.deepEqual(rest, ["app.declare"]);
});
test("argv modifiers: a modifier is --name=value, and any other spelling of it is an error naming that form", () => {
  for (const a of [["--render", "canvas"], ["--crawler"], ["--crawler=1"], ["--render=wat"]]) {
    assert.throws(() => parseArgvFlags(a, DEFAULT_FLAGS), /write --(render|crawler)=/, a.join(" "));
  }
});
test("argv modifiers: switches that are not modifiers pass through to rest", () => {
  const { flags, rest } = parseArgvFlags(["--debug", "--canvas", "--render=canvas"], DEFAULT_FLAGS);
  assert.equal(flags.render, "canvas");
  assert.deepEqual(rest, ["--debug", "--canvas"]);
});
test("one registry, three surfaces: every modifier's every word reads the same in a URL, to declarec, and in defaultFlags", () => {
  for (const spec of FLAG_SPECS) {
    for (const w of flagWords(spec)) {
      const url = parseFlags(P({ [spec.name]: w }), DEFAULT_FLAGS)[spec.name];
      const cli = parseArgvFlags([`--${spec.name}=${w}`], DEFAULT_FLAGS).flags[spec.name];
      assert.deepEqual(cli, url, `--${spec.name}=${w} vs ?${spec.name}=${w}`);
      const program = parseProgram(`defaultFlags [ ${spec.name} = ${w} ]\nApp [ ]`).flags[spec.name];
      assert.deepEqual(program, url, `defaultFlags [ ${spec.name} = ${w} ] vs ?${spec.name}=${w}`);
    }
  }
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
  assert.ok(!out.usedClasses.includes("Image") && !out.usedClasses.includes("TextInput"),
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
// One Chrome for the file, a fresh page per bundle: a page shares nothing with
// the next, and a launch per render cost more than the render.
let chrome = null;
const browser = () => (chrome ??= launchChrome({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] }));

/** Load a built bundle in a fresh page and let it render and come to rest. */
async function mount(b) {
  const page = await (await browser()).newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.setContent(inlineAppPage(b), { waitUntil: "load" });
  await page.waitForFunction(() => (document.getElementById("host")?.querySelectorAll("*").length ?? 0) > 1, { timeout: 15000 }).catch(() => {});
  await settled(page);
  return { page, errs };
}

async function renders(src) {
  const b = await buildProduction(src, {});
  assert.ok(b.ok, "build failed: " + (b.errors || []).map((e) => e.message).join("; "));
  const { page, errs } = await mount(b);
  try {
    const n = await page.evaluate(() => document.getElementById("host")?.querySelectorAll("*").length ?? -1);
    assert.equal(errs.length, 0, "page errors: " + errs.slice(0, 2).join(" | "));
    assert.ok(n > 1, "host has no rendered content");
    return { used: b.usedClasses, gz: b.sizes.appGzip };
  } finally { await page.close(); }
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

  // A view becomes focusable through a member (`focusable`, set from data or by a
  // name code builds, app-slimming.md §1), so the keyboard ships in every build.
  await test("focus + keys ship in every build, even an app with nothing focusable", async () => {
    const b = await buildProduction(`App [ width = 200, Text [ text = "static" ] ]`, {});
    const m = modsOf(b);
    assert.ok(m["focus.js"] > STUBBED, `focus.js should ride, was ${m["focus.js"]}`);
    assert.ok(m["keys.js"] > STUBBED, `keys.js should ride, was ${m["keys.js"]}`);
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

  await test("the tip service ships in every build (tooltipLabel is a member)", async () => {
    const without = await buildProduction(`App [ width = 200, Text [ text = "x" ] ]`, {});
    assert.ok(modsOf(without)["tooltips.js"] > STUBBED, "no tips in the source, and the tip service still rides");
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

  await test("the selector evaluator ships with data in every build (a datapath can arrive as a member)", async () => {
    const without = await buildProduction(`App [ width = 200,
      d: Dataset { { "label": "x" } },
      v: View [ datapath = { d.value }, Text [ text = { "" + :label } ] ],
    ]`, {});
    assert.ok(modsOf(without)["select.js"] > STUBBED, `a name-only program carries select.js too, was ${modsOf(without)["select.js"]}`);
    const src = `App [ width = 200, fill = white,
      d: Dataset { { "rows": ["a", "b", "c", "d"] } },
      v: View [ datapath = { d.value }, Text [ x = 10, y = 10, text = { (:rows[1:3]).join("+") } ] ],
    ]`;
    await renders(src); // and a slice evaluates in the production build
  });

  await test("the shape validator ships in every build (a dataset's schema is a member)", async () => {
    const without = await buildProduction(`App [ width = 200, d: Dataset { { "x": 1 } }, Text [ text = "n" ] ]`, {});
    assert.ok(modsOf(without)["data-schema.js"] > STUBBED, `no schema in the source, and data-schema.js still rides, was ${modsOf(without)["data-schema.js"]}`);
  });

  await test("the effects constructors ride only where a program names one; what a member reaches ships always", async () => {
    // a member can carry each of these (a filter or mask from data, a 3D turn, a
    // line clamp, a drawing), so they ride every build…
    // (face-literal.js is FontFace's own: the class carries it)
    const ALWAYS = ["dom-effects.js", "projective.js", "text-measure.js", "font-derive.js", "draw-image.js", "draw-text.js", "change-event.js"];
    const none = modsOf(await buildProduction(`App [ width = 200, Text [ text = "plain" ] ]`, {}));
    for (const f of ALWAYS) assert.ok(none[f] > STUBBED, `${f} should ride every build, was ${none[f]}`);
    // …and the constructors are globals, reached only by name
    assert.ok((none["effects.js"] ?? 0) < STUBBED, `effects.js should be stubbed for a program naming no constructor, was ${none["effects.js"]}`);
    const src = `App [ width = 200, fill = white,
      a: View [ width = 40, height = 40, fill = radialGradient(0.5, 0.5, 1, red, blue), filter = [blur(2), colorize(navy)], rotateY = 20,
        trackChanges = ["opacity"], onChange(e: ChangeEvent) { } ],
      b: View [ y = 50, width = 40, height = 40, fill = red, mask = gradient(#000000, #00000000) ],
      c: Text [ y = 100, text = "12", numerals = lining, width = { measureText("12", { fontSize: 13 }).width + 4 } ],
      e: View [ y = 130, width = 60, height = 20, draw(d: Draw) { d.fillText("hi", 2, 14, { fontSize: 12 }) } ],
      k: any = { blur },
    ]`;
    assert.ok(modsOf(await buildProduction(src, {}))["effects.js"] > STUBBED, "a program naming a constructor keeps effects.js");
    await renders(src);
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

  // ── the 2026-09-26 gates (docs/system-design/slimming-gates.md) ─────────────
  // Each pins one exclusion added with the rich-text document flow, so a change
  // to the slimming framework that loses one fails here instead of silently
  // shipping the code again.

  await test("the Text line clamp ships in every build (maxLines is a member)", async () => {
    const none = modsOf(await buildProduction(`App [ width = 200, Text [ text = "plain" ] ]`, {}));
    assert.ok(none["text-clamp.js"] > STUBBED, `text-clamp.js should ride, was ${none["text-clamp.js"]}`);
  });

  await test("the rich-text view path rides with any rich text (its clamp is a member); the document path never rides canvas", async () => {
    const md = `App [ width = 200, Markdown [ width = 180, text = "hi" ] ]`;
    const dom = modsOf(await buildProduction(md, {}));
    assert.ok(dom["rich-views.js"] > STUBBED, `a DOM Markdown carries rich-views.js, was ${dom["rich-views.js"]}`);
    assert.ok(dom["rich-doc.js"] > STUBBED, "the DOM lays documents out: rich-doc.js rides");
    const plain = modsOf(await buildProduction(`App [ width = 200, Text [ width = 100, maxLines = 1, text = "a label" ] ]`, {}));
    assert.ok((plain["rich-views.js"] ?? 0) < STUBBED, `no rich text, no rich-views.js, was ${plain["rich-views.js"]}`);
    const canvas = modsOf(await buildProduction(md, { render: "canvas" }));
    assert.ok(canvas["rich-views.js"] > STUBBED, "canvas lays documents out from views: rich-views.js rides");
    assert.ok((canvas["rich-doc.js"] ?? 0) < STUBBED, `canvas never builds a document flow: rich-doc.js should be stubbed, was ${canvas["rich-doc.js"]}`);
    await renders(md);
    await renders(`App [ width = 200, fill = white, Markdown [ width = 180, maxLines = 1, text = "one two three four five six seven eight nine ten eleven twelve" ] ]`);
  });

  await test("each rich-text component carries only its own reader (md.js / html.js)", async () => {
    const md = modsOf(await buildProduction(`App [ width = 200, Markdown [ width = 180, text = "hi" ] ]`, {}));
    const ht = modsOf(await buildProduction(`App [ width = 200, HTMLText [ width = 180, html = "<p>hi</p>" ] ]`, {}));
    assert.ok((md["html.js"] ?? 0) === 0, `a Markdown-only build carries no HTML reader, had ${md["html.js"]}`);
    assert.ok(ht["html.js"] > STUBBED, "an HTMLText keeps its reader");
    // html.js shares md.js's entity decoder and view-tag scanner, never its parser
    assert.ok((ht["md.js"] ?? 0) < md["md.js"] / 3, `an HTMLText-only build carries md.js's shared helpers, not its parser (${ht["md.js"]} vs ${md["md.js"]})`);
  });

  await test("a theme preset named as a literal ships as its record; the table keeps only the default and what is named", async () => {
    const jsOf = (b) => b.files.find((f) => f.name.startsWith("app.")).contents;
    // the default preset is the runtime's own answer to a theme read with none
    // set (attributes.ts provided), so it is the one record every build keeps
    // (a record is known by its own values: the names are the body scope's keys)
    const { Cupertino, MountainView } = await import("../runtime/dist/themes-data.js");
    const none = jsOf(await buildProduction(`App [ width = 200, Text [ text = "plain" ] ]`, {}));
    assert.ok(!none.includes(String(Cupertino.background)) && !none.includes(String(MountainView.background)), "a program naming no preset carries only the default record");
    // `theme = SanFranciscoDark` resolves at compile time (lower-literals.ts
    // lowerThemeNames): the program carries the one record, the table no more
    const lit = `App [ width = 200, fill = black, View [ width = 200, height = 60, theme = SanFranciscoDark, HTMLText [ width = 180, html = "<p>hi</p>" ] ] ]`;
    const js = jsOf(await buildProduction(lit, {}));
    assert.ok(js.includes(String(0x4C8DFF)), "the dark preset's accent rides in the program");
    assert.ok(!js.includes(String(Cupertino.background)), "no preset the program does not name rides");
    await renders(lit);
  });

  await test("the font-availability probe and demand ride only with a declared Font", async () => {
    const PROBE = "mmmmmmmmmmlli1WwQ@";   // the probe string, in font.ts
    const js = (b) => b.files.find((f) => f.name.startsWith("app.")).contents;
    const plain = await buildProduction(`App [ width = 200, Text [ text = "plain" ] ]`, {});
    assert.ok(!js(plain).includes(PROBE), "a program declaring no Font carries no family probe");
    const font = await buildProduction(`App [ width = 200, f: Font [ FontFace [ src = "f.woff2" ] ], Text [ text = "x", fontFamily = { [app.f, "serif"] } ] ]`, {});
    assert.ok(font.ok, "build failed: " + (font.errors || []).map((e) => e.message).join("; "));
    assert.ok(js(font).includes(PROBE), "a declared Font carries the probe");
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
  await test("a filter, fill or mask that arrives at RUN TIME paints in every build (app-slimming.md §1: it is a member)", async () => {
    // the spelling of a filter and a gradient is core, and the DOM's tint and
    // mask ship always, so a value from data needs no constructor's module
    for (const src of [
      `App [ width = 200, fill = white, f: any = { JSON.parse('[{"fn":"blur","radius":4}]') }, v: View [ width = 40, height = 40, fill = red, filter = { app.f } ] ]`,
      `App [ width = 200, fill = white, d: DataSource [ url = "look.json" ], v: View [ width = 40, height = 40, fill = { d.value.paint } ] ]`,
    ]) await renders(src);
    const mask = modsOf(await buildProduction(`App [ width = 200, fill = white, d: DataSource [ url = "look.json" ], v: View [ width = 40, height = 40, fill = red, mask = { d.value.m } ] ]`, {}));
    assert.ok(mask["dom-effects.js"] > STUBBED, "the DOM's mask rides");
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
    const { page, errs } = await mount(b);
    try {
      assert.equal(errs.length, 0, "page errors: " + errs.slice(0, 2).join(" | "));
      const text = await page.evaluate(() => document.getElementById("host")?.textContent ?? "");
      assert.ok(text.includes("Ada &lt;&#39;&amp;&quot;&gt;"),
        `the slimmed bundle should have escaped &, <, >, " and ' — got ${JSON.stringify(text)}`);
    } finally { await page.close(); }
  });
}

if (chrome !== null) await (await chrome).close();
console.log(`\nslim: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
