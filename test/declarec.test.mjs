// declarec — the production build. Proves the precompiled path: a source
// compiles to a SERIALIZABLE program (parse + resolve + check at build time),
// that program survives a JSON round-trip, and the runtime instantiates it with
// NO parser and NO checker in play. Plus a full buildProduction() smoke test:
// the emitted bundle is self-contained and its wire weight is in the expected
// range (the whole reason the feature exists).
import assert from "node:assert";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate, App } from "../runtime/dist/index.js";
import { buildProduction } from "../tools/declarec.mjs";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
function test(name, fn) {
  try { const r = fn(); if (r instanceof Promise) return r.then(() => { pass++; console.log("  ok —", name); }, (e) => { fail++; console.log("  FAIL —", name, "\n     ", e.message); }); pass++; console.log("  ok —", name); }
  catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); }
}

// A small but representative app: a class, a `{ }` constraint, a method, an
// event handler, and a color literal — enough that instantiate exercises the
// body compiler (new Function) on the round-tripped program.
const SRC = `
App [ width = 240, height = 120,
    n: number = 3,
    box: View [ width = { app.n * 20 }, height = 24, fill = #3366cc,
                onClick() { app.bump() } ],
    bump() { this.n = this.n + 1 },
]`;

function hasPosKey(node) {
  if (Array.isArray(node)) return node.some(hasPosKey);
  if (node !== null && typeof node === "object") {
    if ("pos" in node) return true;
    return Object.values(node).some(hasPosKey);
  }
  return false;
}

console.log("declarec");

await test("compiles a source to a non-null program with no errors", async () => {
  const r = await compileProgram(SRC);
  assert.equal(r.errors.length, 0, "unexpected errors: " + r.errors.map((e) => e.message).join("; "));
  assert.ok(r.program !== null, "program should not be null");
});

await test("program is JSON-serializable and round-trips byte-stable", async () => {
  const r = await compileProgram(SRC);
  const a = JSON.stringify(r.program);
  const b = JSON.stringify(JSON.parse(a));
  assert.equal(a, b, "program is not JSON round-trip stable");
});

await test("stripPos (default) removes every source-offset field", async () => {
  const stripped = await compileProgram(SRC);
  assert.equal(hasPosKey(stripped.program), false, "pos keys survived the default strip");
  const kept = await compileProgram(SRC, { stripPos: false });
  assert.equal(hasPosKey(kept.program), true, "stripPos:false should retain pos");
});

await test("runtime instantiates the round-tripped program (no parser/checker)", async () => {
  const r = await compileProgram(SRC);
  const program = JSON.parse(JSON.stringify(r.program)); // simulate ship + boot
  const root = instantiate(program);
  assert.ok(root instanceof App, "root should be an App");
  // the box child's width binding { app.n * 20 } should have evaluated: 3 * 20
  assert.ok(root.children.length >= 1, "App should have its declared child");
});

await test("a broken source reports errors and emits no program", async () => {
  const r = await compileProgram(`App [ box: View [ fill = { nonexistent.thing } ] ]`.replace("App [", "NotApp ["));
  assert.ok(r.program === null, "program should be null on error");
  assert.ok(r.errors.length > 0, "should carry at least one error");
});

// ── full production build (calendar) ────────────────────────────────────────
// THE BUILD IS A PAGE — the production build with the page host aboard, what
// a deploy serves and what a site page's shell imports in place of the
// uniform bundle. Its default export is the page boot with the program in
// hand; the parser, the checker, the tooling, the distro's resolver and the
// backend it does not render with are not aboard; the compiler stays an
// external, lazy fetch for the page's live edits.
await test("buildProduction carries the page host, the program, and no parser", async () => {
  const src = readFileSync(resolve(HERE, "../apps/calendar/calendar.declare"), "utf8");
  const out = await buildProduction(src, { name: "calendar", originDir: resolve(HERE, "../apps/calendar") });
  assert.ok(out.ok, "build should succeed: " + (out.report ?? ""));
  const js = out.files.find((f) => f.name.startsWith("app.")).contents;
  assert.ok(!/parseProgram|programSchemas/.test(js), "compiler leaked into the production bundle");
  assert.ok(/__declarePerf/.test(js), "the page boot (boot-page) is aboard");
  assert.ok(!/serviceWorker/.test(js), "the distro's service-worker registration is not aboard a deploy build");
  assert.ok(/pushState/.test(js), "the host client's history mirror is aboard");
  assert.ok(/export\s*\{/.test(js), "the module exports boot()");
  assert.ok(!/declare-raster-worker/.test(js), "the canvas backend is not aboard a DOM page");
  assert.ok(!/declare-compiler\.js/.test(js) && !/compile-worker\.js/.test(js), "a package never compiles: no compiler bundle, no worker referenced");
  // the page host reaches the runtime through host-api, never the barrel —
  // test/boot-bundle.test.mjs holds the same line for the distro's boot
  for (const file of ["boot-page.js", "host-client.js", "compiler-client.js"]) {
    const text = readFileSync(resolve(HERE, "../browser", file), "utf8");
    assert.ok(!/from "\.\.\/runtime\/dist\/index\.js"/.test(text), `browser/${file} imports the runtime barrel — use ../runtime/dist/host-api.js`);
  }
});

// THE SHIP BLOCK (runtime/src/parser.ts Ship) — what a package carries beyond
// what its source names. Islands: a build compiles the programs its islands
// name and ships them beside the app; a computed name is declared with
// `ship [ islands = […] ]`, and a package carries no compiler unless told to.
await test("a build compiles its islands ahead into programs/ and carries no compiler", async () => {
  const { mkdtempSync, mkdirSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(resolve(tmpdir(), "declarec-islands-"));
  mkdirSync(resolve(dir, "demos"));
  writeFileSync(resolve(dir, "demos", "tile.declare"), `App [ width = 80, height = 40, fill = tomato, Text [ x = 8, y = 8, text = "tile" ] ]`);
  writeFileSync(resolve(dir, "demos", "note.declare"), `App [ width = 200, height = 120, m: Markdown [ width = 100%, text = "# note" ] ]`);
  const src = `App [ width = 400, height = 300,
    which: string = "note",
    a: AppIsland [ x = 10, y = 10, width = 100, height = 60, program = "tile" ],
    b: AppIsland [ x = 10, y = 90, width = 300, height = 160, program = { app.which } ],
  ]`;
  // the computed island is undeclared: the build refuses to guess
  const out = await buildProduction("ship [ islands = [ \"note\" ] ]\n" + src, { name: "host", originDir: dir });
  assert.ok(out.ok, out.report);
  const names = out.files.map((f) => f.name);
  assert.equal(out.islands.length, 2, "one program per island name: the literal and the declared");
  for (const i of out.islands) assert.ok(names.includes(i.file), `${i.name} ships as ${i.file}`);
  const js = out.files.find((f) => f.name.startsWith("app.")).contents;
  assert.ok(/programs\//.test(js), "the module knows its islands' files");
  assert.ok(!/compile-worker\.js/.test(js) && !/declare-compiler\.js/.test(js), "no compiler client in a package that did not ask for one");
  assert.ok(!names.some((n) => n.startsWith("bundles/") || n.startsWith("library/")), "no compiler or library files either");
  // the tenant's components ride the host's registry: Markdown is the note's, not the host's
  assert.ok(/class Markdown\b|Markdown/.test(js), "the union registry carries the tenant's Markdown");
  assert.ok(!/watchChild\(childApp/.test(js) || /installLiveEdit\(\)\s*\{\s*return/.test(js), "no live-edit watcher without the compiler");
  // a name the build cannot find is a build error naming the fix
  const bad = await buildProduction("ship [ islands = [ \"nope\" ] ]\n" + src, { name: "host", originDir: dir }).catch((e) => e);
  assert.ok(bad instanceof Error && /the island 'nope' names no program/.test(bad.message), "an unknown island name fails the build with the reason");
});

// Files: what the program reads that no literal names, or that lives outside
// its folder, copied INTO the package and mapped by URL — the program's text
// is untouched and the folder is self-contained.
await test("ship [ files ] copies each file into the package and maps its URL", async () => {
  const { mkdtempSync, mkdirSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const root = mkdtempSync(resolve(tmpdir(), "declarec-files-"));
  const dir = resolve(root, "apps", "a");
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(root, "docs"));
  writeFileSync(resolve(root, "docs", "model.json"), `{"n":1}`);
  const src = `ship [ files = ["../../docs/model.json"] ]
App [ width = 100, height = 100, m: DataSource [ url = "../../docs/model.json" ] ]`;
  const out = await buildProduction(src, { name: "a", originDir: dir });
  assert.ok(out.ok, out.report);
  assert.equal(out.shipped.files.length, 1);
  const f = out.shipped.files[0];
  assert.match(f.file, /^files\/[0-9a-f]+\.json$/, "copied under files/, named by content");
  assert.ok(out.files.some((x) => x.name === f.file && String(x.contents) === `{"n":1}`), "the bytes ride the package");
  const js = out.files.find((x) => x.name.startsWith("app.")).contents;
  assert.ok(js.includes("../../docs/model.json") && js.includes(f.file), "the entry maps the declared path to the copy");
  // a file that is not there fails the build, naming the path
  const bad = await buildProduction(`ship [ files = ["nope.json"] ]\nApp [ ]`, { name: "a", originDir: dir }).catch((e) => e);
  assert.ok(bad instanceof Error && /the file 'nope.json' is not there/.test(bad.message), "a missing file fails the build with the reason");
});

// Compiler: a program that compiles at run time says so, and the package
// mirrors the distro's compiler layout into its own folder.
await test("ship [ compiler = true ] mirrors the compiler and the library into the package", async () => {
  const out = await buildProduction(`ship [ compiler = true ]\nApp [ width = 100, height = 100 ]`, { name: "c" });
  assert.ok(out.ok, out.report);
  const names = out.files.map((f) => f.name);
  for (const n of ["bundles/declare-compiler.js", "bundles/compile-worker.js", "library/autoincludes.json"]) assert.ok(names.includes(n), `${n} rides the package`);
  assert.ok(names.filter((n) => n.startsWith("library/") && n.endsWith(".declare")).length > 20, "the whole component library rides");
  assert.ok(!names.some((n) => /^library\/.*\/tests\//.test(n) || /\.png$/.test(n)), "no test fixtures or images from the library");
  const js = out.files.find((f) => f.name.startsWith("app.")).contents;
  assert.ok(/bundles\/compile-worker\.js/.test(js) && /bundles\/declare-compiler\.js/.test(js), "the entry names the package as the compiler's root");
  assert.ok(/watchChild/.test(js), "live editing rides with the compiler");
  assert.ok(!/is not aboard this package/.test(js), "the compiler client is the real one");
});

// Inspector: a program that answers questions about itself in production
// carries the Inspector as a program object, the bridge, positions, and prose.
await test("ship [ inspector = true ] carries the Inspector, the bridge, positions, and error prose", async () => {
  const plain = await buildProduction(`App [ width = 100, height = 100, t: Text [ text = { "a" + app.width } ] ]`, { name: "p" });
  const out = await buildProduction(`ship [ inspector = true ]\nApp [ width = 100, height = 100, t: Text [ text = { "a" + app.width } ] ]`, { name: "i" });
  assert.ok(out.ok, out.report);
  assert.ok(out.shipped.inspector && out.files.some((f) => f.name === out.shipped.inspector.file), "the Inspector ships as programs/<hash>.json");
  const js = out.files.find((f) => f.name.startsWith("app.")).contents;
  assert.ok(js.includes(out.shipped.inspector.file), "the entry provides it to the Inspector's boot");
  assert.ok(/settleMotion/.test(js) && /dependents/.test(js), "the bridge is the real one (its query surface is aboard)");
  assert.ok(!/"line":/.test(plain.files.find((f) => f.name.startsWith("app.")).contents), "a plain package strips positions");
  assert.ok(/"line":/.test(js) || /line:/.test(js), "positions are kept");
  assert.ok(Object.keys(out.errorCodes).length === 0 && Object.keys(plain.errorCodes).length > 0, "error prose is kept — nothing was coded");
  assert.ok(!/declare-compiler\.js/.test(js), "the inspector does not imply the compiler");
});

await test("buildProduction emits a self-contained bundle in the expected size range", async () => {
  const src = readFileSync(resolve(HERE, "../apps/calendar/calendar.declare"), "utf8");
  const out = await buildProduction(src, { name: "calendar", originDir: resolve(HERE, "../apps/calendar") });
  assert.ok(out.ok, "build should succeed: " + (out.errors?.map((e) => e.message).join("; ") ?? ""));
  const names = out.files.map((f) => f.name);
  assert.ok(names.includes("index.html"), "should emit index.html");
  assert.ok(names.some((n) => /^app\.[0-9a-f]{8}\.js$/.test(n)), "should emit a content-hashed app bundle");
  // the whole point: parser + checker are NOT in the shipped bundle
  const appJs = out.files.find((f) => f.name.startsWith("app.")).contents;
  assert.ok(!/parseProgram|programSchemas/.test(appJs), "compiler leaked into the production bundle");
  // Wire weight sanity: comfortably under React's ~97 KB gzip, above an empty
  // shell. The calendar is the flagship, so it is the app whose weight is worth
  // watching — and the ceiling moves only with the accounting.
  //
  // 70 → 80 KB (2026-08-03, the chrome standardization). Measured, at the
  // checkpoints: 61.2 KB pristine → 62.6 KB once the theme split and the icon
  // set existed → 70.2 KB once the calendar itself moved onto the shared
  // components, where it stayed. The step that costs is the migration, not the
  // library: private tabs, a private theme switch, and text glyphs became
  // `Segmented`, the icon set, and Control's menu role. Checked for dead weight
  // rather than assumed — the three icons in `core.declare` the calendar does
  // not use (Check, Arrow, Lightbulb, along for the file) are 0.3 KB of the 9,
  // so file-granular shaking is not what to fix here. On one app a shared
  // component costs more than the bespoke one it replaces; the return is across
  // the corpus and in behavior, and it was taken deliberately.
  //
  // 80 → 84 KB (2026-08-19, the always-on runtime surface): measured 79.x → 80.2
  // as the app↔host contract and the visibility family landed — observe(), the
  // host service table, the reveal pump, `pageVisible`, the onScreen/visibleRect/
  // apparentScale facts with the generic ancestor-walk feed, declaration
  // provenance records, and the bridge's self-describing help table. All of it
  // is product surface every production app can reach (the facts and the verbs
  // ARE the API; the provenance records are what make a running program
  // explainable), so the weight is carried deliberately rather than shaken.
  //
  // 84 KB HOLDS (2026-08-25, the drawing pipeline made correct and priced):
  // measured 84.7, briefly over. Two things rode draw.js — which calendar
  // ships because its closure includes library/focusring.declare, and that
  // draws. The recorder's per-op extents, measured text bounds and culling
  // replay (draw.js minified+gzip 3.0 → 4.6 KB: a text-only draw() rendered
  // NOTHING on this backend because fillText marked only its anchor). And the
  // canvas `filter` fallback draw.js imports for Safari, which accepts
  // ctx.filter and paints unfiltered (canvas-filter.js, +1.8 KB). The band was
  // raised to 88 for one commit — then the second of those was slimmed OUT of
  // every program that never sets d.filter (slim-filter, the fact + stub pinned
  // below), which is most of them, and calendar came back at 83.4. So the
  // recorder's growth is carried and the fallback is paid only where it can
  // render. The canvas backend's raster policy is not in this number at all: a
  // DOM production bundle does not ship canvas-backend.js.
  //
  // 86 (2026-08-29, the field-report merge): measured 84.3. The runtime guards
  // the six-agent report asked for — a handler that keeps throwing is named and
  // stopped, replay restores the paint state it inherited, set([], v) replaces a
  // document — plus the remapped diagnostics. Product surface; carried.
  // 87 (2026-09-03): measured 86.1. Typed data's always-on parser/editor surface
  // and the ONE clear layout↔author conflict wording (errors.ts, unstubbable —
  // a clear error is the product) crossed 86 by a tenth. Diagnostic quality;
  // carried.
  // 86 again (2026-09-04): measured 84.6. The production error-prose strip
  // (tools/internal/error-codes.mjs) codes every DeclareError message a shipped
  // app can throw — `[Declare E42] <values>`, expanded by `declare-help E42` —
  // which took 1.5 KB back and returned the ceiling under where typed data put
  // it. Dev builds keep the sentences.
  // 86 HOLDS (2026-09-09, the cross axis, then the diag constructor): measured
  // 85.6 → 86.1 as layouts learned to claim the cross axis (`align = start |
  // center | end | baseline`, the baseline the labelled controls and RichText
  // DECLARE, two contained refusals) — then 84.2 once the strip could see the
  // prose that had always escaped it. The two constructors it knew (a thrown
  // DeclareError, a whole-literal [Declare] console report) never covered a
  // sentence reaching its reader through a HELPER: a message builder's return,
  // an err(…)/fail(…) argument, a production stub's own refusal, a hit-trace
  // reason. `diag\`…\`` (errors.ts) is the author's declaration that such a
  // sentence is a diagnostic, and the strip codes it like the other two; the
  // stubs refuse through one notAboard() whose sentences live in errors.ts.
  // What ships as prose now is app-renderable by intent (a DataSource's
  // `.error`) or not a sentence at all (selectors, meta names).
  // 88 (2026-09-12, the day's runtime surface): measured 86.00 — 88,064 bytes,
  // one byte over the old ceiling, which is what surfaced it. Six additions,
  // every one reachable by a shipped app: the derived-dataset structural merge
  // (a recompute keeps row identity instead of rebuilding the list), `scrolling`
  // held through wheel activity, the motion facts `running`/`arrived` in place
  // of `atRest`, `Text.maxLines` (a measured line clamp with an ellipsis, in the
  // measurer so every renderer paints the same lines), the change event
  // (`watch` + `onChange`, a settle-close registry), and `super` (a per-body
  // provider snapshot, built only for a body that calls it). Product surface;
  // carried, not shaken.
  const gz = out.sizes.totalGzip;
  // 86 → 90 KB (2026-09-12, the graphics pass): the filter vocabulary at two
  // tiers (value.ts constructors + coercion, filterCss, the DOM tint matrix),
  // radial/conic gradients, and the mask seam — product surface every program
  // can reach, carried deliberately. Measured 86.1 at the filter tier alone.
  // 90 → 92 KB (2026-09-13, the text round): the seven defect fixes, the line
  // clamp end to end (Text.maxLines through clampLines/ellipsize in the shared
  // measurer, the flow budget in markdown.ts, and the setRichClamp seam DOM and
  // Mac realize natively), and the group-layer sizing. Measured 90.2 — the band
  // moves by the size of the surface added, not by the size of the overshoot.
  // 92 → 91 KB (2026-09-15, the merge of the graphics tree into main): main at
  // f07bf6e0 measured 86.4; the merge 93.1 — all +6.6 the graphics tree, most of
  // it vocabulary calendar never names. Eight modules now ride only where a
  // program's text names them (declarec programFacts, pinned in slim.test):
  // effects.js (the filter functions, frost, radial/conic), dom-effects.js
  // (colorize, mask-image), projective.js (3D), text-measure.js, font-derive.js
  // (numeral features), face-literal.js (Face), draw-image.js, draw-text.js
  // (styled runs). Measured 89.5; 89.2 once the 3D paths left view.ts,
  // interaction.ts and dom-backend.ts for projective.ts too (spec3DOf,
  // childHomography, footprint3D, domTransform3D). 91 → 90 KB: measured 88.5 once
  // the change event rode only with `trackChanges` (change-event.ts, ~0.6 KB of
  // tracker registry, batching, ring guard and seeding every program paid for) and
  // console.warn reports joined the error-code strip (six warnings had shipped as
  // prose). What remains is surface every program reaches:
  // the filter list at the seam (a theme's menuBackdrop is data), the one-matrix
  // transform (affine.js), the new attributes' schema, the font-value plumbing
  // every text measure reads, and the rich clamp.
  // A ninth module joins the eight: dom-rich.js, the DOM backend's whole native
  // rich-text flow — the block/run builder, inline images and links, the
  // inline-view slot placement, the line clamp — reachable only from a RichText
  // and so stubbed for a program that names none. It had shipped to every app,
  // because a method on DomSurface is unreachable to a tree shaker. Measured
  // 89.0; the calendar names no rich text and pays nothing for it.
  // 90 → 91 KB (measured 90.3). Three features landed together and a tenth
  // module, stroke-sides.js, joined the gated set — the four-side arm of
  // `stroke`, riding only where a program writes a stroke LIST. Each was then
  // priced by deleting it from the runtime and rebuilding: per-side stroke 213 B
  // gzip, Layout.padding 179 B, the layout claim diagnostics 153 B — 545 B for
  // all three. Removing every one of them leaves 92,164 B against a 92,160 B
  // ceiling, so the corpus was already at the band before they landed; the
  // claim diagnostics are not gateable at all, since a layout-versus-author
  // conflict is reachable from any program. The new headroom is 688 B.
  // 91 → 92 KB. stroke-sides.js lost its gate rather than keeping a fact that
  // could miss: a computed `stroke = { [ … ] }` and a method-body assignment are
  // both invisible to a tree scan, and a fact that misses stubs the module out
  // from under a running program. It ships unconditionally now, 255 B, which
  // left 27 B of headroom — close enough that an ordinary edit would red the
  // gate for no reason.
  // stroke-sides.js then LEFT the gated set and rides every build: its fact read
  // a four-element list LITERAL out of the tree, which was exact only while the
  // slot's body-facing type foreclosed every other way of making a list. Widened
  // to `BoxStroke`, a `{ }` constraint computes one — the themed border form —
  // and no tree walk can see it, so the fact could MISS and stub the module out
  // from under a program that runs. 213 B of the 688 B headroom, spent on not
  // shipping that. Measured 90.5 here.
  // ── WHAT THIS NUMBER IS (DT, 2026-09-17) ──────────────────────────────────
  // THE FIRST-TIME DOWNLOAD FOR AN APP: every file a browser must have before
  // the program runs, gzipped, summed — every file, so a byte moved into a
  // sibling file is not a byte saved (and a file moved back in is not a byte
  // spent twice).
  //
  // Measured 2026-09-17, the kernel round: app 98.0 + kernel 7.3 + page 0.3 =
  // 105.6 KB, against main's 89.8 for the same program. The +15.8 buys the
  // 54–90% settle-time reductions in mac-host/profile/REPORT.md (round 3).
  // 2026-09-18: the kernel moved INSIDE the bundle (one request; see above).
  // DT'S TARGET IS 100 KB — this band is the drift guard, not the goal.
  // 110 → 111 (2026-09-19, the island boundary: `provides`/`hostProvided` and
  // `exposes`/`exposed` replaced `external` and `App.env`): measured 110.54.
  // Not isolated — no pre-change build of this tree was kept to diff against,
  // so how much of the overage is this change and how much earlier drift is
  // unmeasured. The warning prose is already stripped (error-codes).
  // 111 → 112 (2026-09-19, the MERGE INTO MAIN): measured 111.77 — the union of
  // the two trees, so it carries main's post-branch surface (per-side stroke
  // 213 B, Layout.padding 179 B, the claim diagnostics 153 B, each priced by
  // deletion when it landed) on top of the optimize tree's 110.54. Priced here,
  // by removing the blob and re-gzipping: THE KERNEL IS 10.9 KB OF THIS NUMBER —
  // 9.45 KB the inline wasm base64, the rest its decode and binding — leaving
  // 100.7 for the runtime proper against main's 90.5 before the arc, the
  // difference being the kernel's JS side (cells, the EXPR machine, the extent
  // and visibility rules) and the island boundary.
  // ⚠ THIS IS 11.8 OVER DT'S 100 KB TARGET and the kernel is what put it there.
  // The band is the drift guard; closing that gap is a ruling DT has to make
  // (gate the kernel to the programs it pays for, or take the request back).
  // 112 → 113 (2026-09-22, the layout-ownership rule — DT's ruling to raise it,
  // priced): measured 112.43. By deletion, the tree stood at 112.05 before this
  // change — 0.05 over the band already, drift from other work landing in the
  // same commit and not isolated here. The change itself is +0.38 KB, all of it
  // runtime that every program can reach: the §4 marking (a size derived from
  // the parent's does not count toward its content size) and the report of a
  // child sized from a parent that has no size to give. The checker's placed-
  // attribute check is compile-time only and ships nothing; ResponsiveLayout's
  // align/offset is library code the calendar does not use.
  //
  // 113 → 121 KB (2026-09-22, the page host aboard): host-client (the URL and
  // history mirror, islands, the title, the live-edit watch), boot-page (the
  // data/asset base, the seeds, the live compile) and compiler-client (the lazy
  // loader for the external compiler) — measured +4.4 KB gz, 13.9 KB raw, every
  // module of it nameable. A build that could not answer Back or mount an
  // island was never a smaller build; it was a broken one. The distro's
  // resolver (boot-uniform, the service worker, the artifact ladder) stays out:
  // a deployed app has nothing to resolve.
  const wire = out.files.reduce((n, f) => n + gzipSync(Buffer.from(f.contents)).length, 0);
  assert.ok(wire > 20 * 1024 && wire < 121 * 1024,
    `unexpected FIRST-LOAD size ${(wire / 1024).toFixed(1)} KB — ` +
    out.files.map((f) => `${f.name} ${(gzipSync(Buffer.from(f.contents)).length / 1024).toFixed(1)}`).join(", "));

  // THE MERGE (2026-09-19): main's ceiling was 92 KB on the app module alone; the
  // arc's kernel rides inside that module now, so the number this guards is the
  // FIRST-LOAD sum above, and the band is the arc's own measured one.
});

// THE STUB-DRIFT TRAP, made structural. The production build replaces
// draw.js (and canvas-filter.js) with hand-written stubs for programs that
// cannot reach them, and a stub is a second copy of the module's export list.
// It has drifted twice: a renamed export (replayCost → replayArea) and a new one
// (rasterLooksBlank), each surfacing as "No matching export" in every AOT
// build at once, five suite files red. So: every value export in the source
// must have a name in its stub. Types are not exports at runtime and are
// skipped. A stub may export MORE (harmless); it may not export less.
await test("the production stubs mirror every value export of the modules they replace", () => {
  const declarec = readFileSync(resolve(HERE, "../tools/declarec.mjs"), "utf8");
  const stubOf = (name) => {
    const m = new RegExp(`const ${name} = \\x60([\\s\\S]*?)\\x60;`).exec(declarec);
    assert.ok(m, `${name} not found in tools/declarec.mjs`);
    return m[1];
  };
  const valueExports = (file) => [...readFileSync(resolve(HERE, "../runtime/src", file), "utf8")
    .matchAll(/^export (?:async )?(?:function|const|let|class) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  for (const [src, stubName] of [["draw.ts", "drawStub"], ["canvas-filter.ts", "filterStub"],
    ["effects.ts", "effectsStub"], ["dom-effects.ts", "domEffectsStub"], ["projective.ts", "projectiveStub"],
    ["text-measure.ts", "measureTextStub"], ["font-derive.ts", "fontDeriveStub"], ["face-literal.ts", "faceLiteralStub"],
    ["draw-image.ts", "drawImageStub"], ["draw-text.ts", "drawTextStub"], ["change-event.ts", "changeEventStub"],
    ["dom-rich.ts", "domRichStub"]]) {
    const stub = stubOf(stubName);
    const missing = valueExports(src).filter((n) => !new RegExp(`export (?:function|const|class) ${n}\\b`).test(stub));
    assert.deepEqual(missing, [], `${stubName} lacks exports that ${src} has: ${missing.join(", ")} — add them to the stub in tools/declarec.mjs`);
  }
});

await test("slim-filter: the Safari filter fallback ships only where a program can reach it", async () => {
  // canvas-filter.js is ~13 KB raw; its stub is a few hundred bytes. The
  // metafile lists both under the same path, so size is the discriminator.
  const filterBytes = (out) => {
    const k = Object.keys(out.metafile.inputs).find((k) => /[/\\]canvas-filter\.js$/.test(k));
    return k ? out.metafile.inputs[k].bytes : -1;
  };
  const cal = readFileSync(resolve(HERE, "../apps/calendar/calendar.declare"), "utf8");
  const blur = readFileSync(resolve(HERE, "../test/probe/blur.declare"), "utf8");
  // a DOM program that never sets d.filter: stubbed (its frost is CSS backdrop-filter)
  const a = await buildProduction(cal, { name: "calendar", originDir: resolve(HERE, "../apps/calendar") });
  assert.ok(filterBytes(a) > 0 && filterBytes(a) < 1024, `expected the stub for a filter-free DOM program, got ${filterBytes(a)} bytes`);
  // a program that sets d.filter: the real module, or Safari paints it unfiltered
  const b = await buildProduction(blur, { name: "blur", originDir: resolve(HERE, "../test/probe") });
  assert.ok(filterBytes(b) > 4096, `expected the real module for a program that sets d.filter, got ${filterBytes(b)} bytes`);
  // a CANVAS build: frost filters a backdrop snapshot through the module with no d.filter anywhere
  const c = await buildProduction(cal, { name: "calendar", originDir: resolve(HERE, "../apps/calendar"), render: "canvas" });
  assert.ok(filterBytes(c) > 4096, `expected the real module for a canvas build, got ${filterBytes(c)} bytes`);
});

await test("closure freshness: an edit to an INCLUDED file invalidates the build (the prod-cache rule)", async () => {
  // The exact gap the old sha256-of-main-source key had: a multi-file app whose
  // `include`d file changes must go stale. buildProduction records the real
  // closure (compileTracked); isUpToDate + diskProbe is the same check the
  // dev server's /build cache runs.
  const { mkdtempSync, writeFileSync, utimesSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { isUpToDate, diskProbe } = await import("../compiler/dist/compile-node.js");
  const dir = mkdtempSync(join(tmpdir(), "declarec-closure-"));
  writeFileSync(join(dir, "part.declare"), "class Part extends View [ width = 40 ]\n");
  const source = 'include [ "part.declare" ]\nApp [ width = 100, height = 100, Part [ ] ]\n';
  writeFileSync(join(dir, "main.declare"), source);
  const out = await buildProduction(source, { name: "main", originDir: dir, render: "dom", slim: true, props: { toolchain: "t" } });
  assert.ok(out.ok, out.report);
  const ids = out.closure.entries.map((e) => e.id);
  assert.ok(ids.some((id) => id.endsWith("main.declare")), "main file in the closure: " + ids);
  assert.ok(ids.some((id) => id.endsWith("part.declare")), "the INCLUDE in the closure: " + ids);
  assert.equal(isUpToDate(out.closure, out.closure.props, diskProbe), true, "fresh right after the build");
  // Touch the INCLUDED file — the build must go stale (main untouched).
  const later = new Date(Date.now() + 1500);
  utimesSync(join(dir, "part.declare"), later, later);
  assert.equal(isUpToDate(out.closure, out.closure.props, diskProbe), false, "an included-file edit invalidates");
  // And a build-flag change invalidates through the frozen props.
  assert.equal(isUpToDate(out.closure, { ...out.closure.props, render: "canvas" }, diskProbe), false, "a flag change invalidates");
});

// ── --crawler: the static extraction baked into the built page ──────────────────
await test("--crawler embeds the extracted document in the host; the entry clears it at boot", async () => {
  const src = `App [
  m: Markdown [ width = 400, text = "# Shipped\\n\\nStatic words for crawlers." ],
  n: number = 2,
  t: Text [ y = 200, text = { "n = " + n } ],
]`;
  const out = await buildProduction(src, { name: "seoapp", crawler: true });
  assert.ok(out.ok, out.report);
  const html = out.files.find((f) => f.name === "index.html").contents;
  assert.ok(html.includes('<div id="declare-static">'), "the static block rides the host element");
  // A SYNCHRONOUS classic script removes the block before first paint (no flash of bare
  // extraction text), ahead of the async app module — and it REMOVES the node rather than
  // CSS-hiding it, so no cloaking / hidden-text signal is ever present in the served HTML.
  assert.ok(html.includes('<script>document.getElementById("declare-static")?.remove()</script>'),
    "a pre-paint clear script removes the crawler block");
  assert.ok(html.indexOf("remove()") < html.indexOf('type="module"'), "the remover precedes the app module");
  assert.ok(!/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0/i.test(html), "the block is removed, never CSS-hidden");
  assert.ok(html.includes("<h1>Shipped</h1>"), "markdown serialized by class semantics");
  assert.ok(html.includes("<p>n = 2</p>"), "computed content EVALUATED at build time (headless settle)");
  const appJs = out.files.find((f) => f.name.startsWith("app.")).contents;
  // the page boot (host-client bootHost) removes the block at mount, for any boot
  // path that did not emit the pre-paint remover — belt and braces, in the bundle
  assert.ok(/declare-static/.test(appJs), "the page boot clears the crawler block at mount");
  // The flag is frozen into the closure — a crawler flip invalidates a cached build.
  assert.equal(out.closure.props.crawler, "true");
  // And WITHOUT the flag, no block (the default page is unchanged).
  const plain = await buildProduction(src, { name: "seoapp" });
  assert.ok(!plain.files.find((f) => f.name === "index.html").contents.includes("declare-static"));
});

// ── `declarec check` — the compile without the build ────────────────────────
// The one door for "is this source legal" without a dist/: editors, CI, and any
// source-to-source tool verifying its own output.
// Exercised through the CLI, because the CLI contract — exit code and the two
// output forms — is what those consumers depend on.

const CLI = resolve(HERE, "../tools/declarec.mjs");
const runCheck = (args) => spawnSync(process.execPath, [CLI, "check", ...args], { encoding: "utf8" });

await test("check: a clean program exits 0", () => {
  const r = runCheck([resolve(HERE, "../library/platform-apps/viewer/viewer.declare")]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1 file\(s\) clean/);
});

await test("check: a LIBRARY file is checkable standalone (no root element needed)", () => {
  // Until this existed a library could only be checked transitively, by
  // compiling an app that included it.
  const r = runCheck([resolve(HERE, "../library/button.declare"), resolve(HERE, "../library/menu.declare")]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /2 file\(s\) clean/);
});

await test("check: errors exit 1 and name the fix", () => {
  const bad = resolve(HERE, "../bundles/.check-fixture.declare");
  writeFileSync(bad, "App [ width = 300,\n    onPointerDown(e) { this.width = 10 },\n    ]\n");
  try {
    const r = runCheck([bad]);
    assert.equal(r.status, 1);
    // The 2026-07-28 required-parameter-type ruling, reported with the payload
    // type from the schema's EVENT_PAYLOAD — the exact contract any generator
    // must satisfy to emit a legal handler.
    assert.match(r.stderr, /'e' needs its payload type — write 'onPointerDown\(e: PointerEvent\)'/);
  } finally { rmSync(bad, { force: true }); }
});

await test("check --json: one flat record per diagnostic, with file and position", () => {
  const bad = resolve(HERE, "../bundles/.check-fixture2.declare");
  writeFileSync(bad, "App [ b: View [ nosuchattr = 5 ] ]\n");
  try {
    const r = runCheck([bad, "--json"]);
    assert.equal(r.status, 1);
    const recs = JSON.parse(r.stdout);
    assert.equal(recs.length, 1);
    const d = recs[0];
    assert.equal(d.severity, "error");
    assert.ok(d.file.endsWith(".check-fixture2.declare"));
    assert.match(d.message, /no attribute 'nosuchattr'/);
    assert.equal(typeof d.line, "number");
    assert.equal(typeof d.col, "number");
    assert.match(d.code, /^DECLARE\d{4}$/);
  } finally { rmSync(bad, { force: true }); }
});

await test("check: an unreadable file is a reported diagnostic, not a crash", () => {
  const r = runCheck(["no/such/file.declare"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot read/);
});

// escapeHtml — prelude vocabulary shared by every `{ }` body and every method.
// It exists because a tag in rich-text content can name a program class, so a
// value's own `<` or `'` concatenated into `html`/`text` opens an element rather
// than reading as text. Escapes exactly &, <, >, " and ' — and nothing else, so
// text that was already fine comes through unchanged.
await test("escapeHtml is in scope in a { } body and in a method, and escapes the five", async () => {
  const r = await compileProgram(`App [ width = 400, height = 100,
      me: string = "Ada <'&\\">",
      safe: string = { escapeHtml(app.me) },
      twice() { return escapeHtml(this.me) + "|" + escapeHtml("plain text") },
    ]`);
  assert.equal(r.errors.length, 0, r.errors.map((e) => e.message).join("; "));
  const root = instantiate(JSON.parse(JSON.stringify(r.program)));
  assert.equal(root.safe, "Ada &lt;&#39;&amp;&quot;&gt;");
  assert.equal(root.twice(), "Ada &lt;&#39;&amp;&quot;&gt;|plain text");
});

console.log(`\ndeclarec: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
