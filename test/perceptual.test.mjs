// R0–R5 perceptual tests: render sample programs through BOTH backends in
// headless Chrome, screenshot, and check actual rendered pixels — a real
// perceptual check, not a DOM/computed-style stand-in (APPROACH §3: the
// invariant is perceptual, never scene-graph identity). R1 adds the seam's
// proof: the DOM and Canvas renders of the same program must agree pixel for
// pixel (within AA tolerance), the Canvas backend must be crisp at dpr=2,
// and its scheduler must coalesce changes and go fully idle between them.
// R2 adds a second program on the typed literal surface — named colors,
// opacity, visible=false — through both backends, cross-checked the same way.
// R3 adds the full leaf/drawing program (Text, Image ×2, a draw method,
// declarative clip, a translucent container with overlapping children) and
// the region-aware comparator it needs — see diffShots for the design.
// R5 drives REAL input (puppeteer mouse) against overlapping / clipped /
// invisible views on both backends: the same view must win the same click
// everywhere, and each handler's mutation cascade must land the same pixels.
// R7 renders two live stacks — auto-size text, an async image whose natural
// size re-flows the column, user-class rows with class-body x-layouts — and
// mutates them post-attach, pinning one-frame settles and cross-backend
// identity of every laid position.
//
// PNGs are decoded by the *browser's* own Image/Canvas decoder (drawImage +
// getImageData), so no PNG-decoding dependency is needed on the Node side.

import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here); // neolang/

const WIDTH = 240;
const HEIGHT = 160;
const BG = [0x1e, 0x3a, 0x49];
const WHITE = [0xff, 0xff, 0xff];

const SOURCE = `App [ width=240, height=160, fill=#1E3A49,
  View [ x=20, y=20, width=80, height=60, fill=#FFFFFF ] ]`;

// The R2 program exercises the typed literal surface visually: named colors
// (the ruled CSS keyword set), a translucent leaf (opacity as a group of one,
// where the backends' R1 semantics already coincide), and visible=false.
const R2_SOURCE = `App [ width=240, height=160, fill=navy,
  View [ x=20, y=20, width=80, height=60, fill=white, opacity=0.5 ],
  View [ x=120, y=20, width=80, height=60, fill=rebeccapurple ],
  View [ x=20, y=100, width=200, height=40, fill=red, visible=false ],
]`;

// The R3 program: everything the rung landed, in one scene —
//   [0] a translucent container whose children overlap it AND each other
//       (the group-opacity discriminator: under the ruled group semantics
//       the overlap shows one child at 50% over the app background; the
//       R1 multiplicative semantics would stack three 50% fills),
//   [1] Text (native metrics, auto-sized),
//   [2] a declarative clip (a triangle — real diagonal edges),
//   [3] an Image at natural size (no width/height given),
//   [4] the same Image stretched ×2 (stretches=both),
//   [5] a plain View given a draw method in the page (runtime API until R5).
// The bitmap is generated in-page (see r3PageHtml) and spliced in for __IMG__.
const R3_SOURCE = `App [ width=240, height=160, fill=#20242C,
  View [ x=10, y=10, width=100, height=60, opacity=0.5, fill=#FF0000,
    View [ x=20, y=10, width=60, height=40, fill=#FFFFFF ],
    View [ x=50, y=25, width=40, height=30, fill=#0000FF ] ],
  Text [ x=10, y=90, text="Neo 72°", textColor=#FFE28A, fontSize=20, fontWeight=bold, fontFamily="Arial" ],
  View [ x=130, y=10, width=80, height=60, fill=#3FA34D, clip="M10 5 L70 5 L40 55 Z" ],
  Image [ x=130, y=90, source="__IMG__" ],
  Image [ x=170, y=90, width=40, height=24, stretches=both, source="__IMG__" ],
  View [ x=10, y=120, width=60, height=30 ] ]`;

// The box-clip program (tabslider-gaps.md gap 1): a container `clip=true`,
// width=100 height=50, holding an OVERSIZED child (0,0,100×120). The box-clip
// derives rect(0,0,width,height) and feeds it to the backend, so only the top
// 50px of the child paints; the rest is clipped away (revealing the app bg).
// __growClip sets the container height to 140 in one write — the box-clip must
// track that reactively (re-derive the rect) so the whole 120-tall child then
// shows: the tab-reveal-by-clip motion, proven on a settled end-state.
// Children: [0] the clipping container · [0].children[0] the oversized child.
const CLIP_SOURCE = `App [ width=240, height=160, fill=#20242C,
  View [ x=40, y=20, width=100, height=50, clip=true,
    View [ x=0, y=0, width=100, height=120, fill=#E76F51 ] ] ]`;

// The R4 program: constraint-driven proportional geometry. A panel whose bar
// tracks its width ({ parent.width - 16 }), a centered 50%-wide child (both
// percent resolution and a this/parent constraint), a Text whose *content* is
// constrained to the panel's width (re-measures on change), a draw view whose
// body reads its own width/height (re-records on change), and a width=0 Text
// (the was-set discriminator: an explicit 0 must stay 0, not auto-size; its
// ink is bg-colored so the pixel comparisons stay geometry-only).
// __mutate() (see r4PageHtml) moves/narrows the panel and widens the draw
// view in one burst — the dynamics half of the rung.
const R4_SOURCE = `App [ width=240, height=160, fill=#20242C,
  View [ x=20, y=16, width=160, height=56, fill=#264653,
    View [ x=8, y=8, width={ parent.width - 16 }, height=16, fill=#3FA34D ],
    View [ x={ (parent.width - this.width) / 2 }, y=32, width=50%, height=16, fill=#E9C46A ] ],
  Text [ x=20, y=88, textColor=#FFE28A, fontSize=16, fontWeight=bold, fontFamily="Arial",
    text={ "width " + this.parent.children[0].width } ],
  View [ x=20, y=116, width=40, height=28 ],
  Text [ x=200, y=120, width=0, textColor=#20242C, text="w0" ] ]`;

// The same program with every member list permuted (children keep their
// order — tree order is paint order, deliberately semantic). Pins the ruled
// R4 invariant: attribute/constraint declaration order is inert — identical
// computed values and identical pixels, before and after mutation.
const R4_PERMUTED = `App [ height=160, fill=#20242C, width=240,
  View [ fill=#264653, height=56, width=160, y=16, x=20,
    View [ height=16, width={ parent.width - 16 }, fill=#3FA34D, y=8, x=8 ],
    View [ width=50%, y=32, x={ (parent.width - this.width) / 2 }, fill=#E9C46A, height=16 ] ],
  Text [ text={ "width " + this.parent.children[0].width }, fontWeight=bold, fontFamily="Arial",
    fontSize=16, textColor=#FFE28A, y=88, x=20 ],
  View [ height=28, width=40, y=116, x=20 ],
  Text [ width=0, text="w0", textColor=#20242C, y=120, x=200 ] ]`;

// The R5 program: methods + events, entirely language surface (no in-page
// hand-assignment — that era ends here). One interactive "button" whose
// onClick grows it and whose draw(d) member paints a width-tracking stripe;
// a sink-less decoration over it (clicks must fall THROUGH to the button —
// the LZX clickable intent, derived from handlers); an interactive rival
// overlapping the button (topmost wins); an under/clip pair sharing one box
// (a click inside the clip triangle hits the clipped view, one in the
// clipped-away corner falls through to the view beneath); invisible and
// opacity-0 interactive ghosts over the button (pruned — their handlers
// would stamp "BUG…" into the ready text); a Text constrained to the button
// width (the click's mutation cascade re-measures it); and onInit stamping
// the ready text before first paint.
// Children: 0 button (child deco) · 1 rival · 2 under · 3 clipTri ·
// 4 ghost(visible=false) · 5 ghost(opacity=0) · 6 status · 7 ready.
const R5_SOURCE = `App [ width=240, height=160, fill=#20242C,
  onInit() { this.children[7].text = "ready" },
  View [ x=20, y=16, width=120, height=48, fill=#264653,
    onClick() { this.width = this.width + 16 },
    draw(d) { d.fillStyle = "#4FC3F7"; d.fillRect(0, this.height - 6, this.width, 6) },
    View [ x=8, y=24, width=104, height=16, fill=#3FA34D ] ],
  View [ x=110, y=16, width=70, height=40, fill=#E9C46A,
    onClick() { this.fill = 0xE76F51 } ],
  View [ x=20, y=96, width=90, height=52, fill=#6D597A,
    onClick() { this.fill = 0x91C499 } ],
  View [ x=20, y=96, width=90, height=52, fill=#3FA34D, clip="M0 0 L90 0 L0 52 Z",
    onClick() { this.fill = 0x4FC3F7 } ],
  View [ x=20, y=16, width=30, height=24, visible=false, onClick() { parent.children[7].text = "BUG-invisible" } ],
  View [ x=50, y=16, width=30, height=24, opacity=0, onClick() { parent.children[7].text = "BUG-ghost" } ],
  Text [ x=20, y=70, textColor=#FFE28A, fontSize=14, fontFamily="Arial",
    text={ "w" + parent.children[0].width } ],
  Text [ x=150, y=70, textColor=#FFE28A, fontSize=14, fontFamily="Arial" ] ]`;

// The R6 program: user components + compile-time scope resolution, exercised
// exactly as the pipeline is designed — compile() runs HERE, on the Node
// side (it needs the TypeScript parser for identifier classification), and
// the browser pages receive the *resolved* source through the unchanged,
// zero-dependency runtime. One class, Tally, instantiated twice with
// different attribute values (b starts at count=3 with its own accent
// Color); every relationship in its body is a bare-name constraint (the
// hit square's color reads `accent`, the bar's width and the readout's text
// read `count`); the hit square's onClick is the counter idiom — a class
// handler mutating classroot state. The App-level sum Text reads both
// instances' declared attributes through named children (`a.count`), so one
// click re-inks three views across two scopes in one settle.
// Geometry (1x): a = 12..122 × 10..74, b = 12..122 × 84..148; each hit
// square 20..44 y+8..32; each bar starts at x 20, width 6 + 12·count, rows
// y 50..58 / 124..132.
const R6_RAW = `class Tally extends View [
  count: number = 0,
  accent: Color = 0xE0B040,
  width = 110, height = 64, fill = 0x264653,
  hit: View [ x = 8, y = 8, width = 24, height = 24, fill = { accent },
    onClick() { count = count + 1 } ],
  bar: View [ x = 8, y = 40, height = 8, fill = 0x3FA34D,
    width = { 6 + count * 12 } ],
  readout: Text [ x = 40, y = 10, textColor = 0xFFE28A, fontSize = 14, fontFamily = "Arial",
    text = { "n" + count } ],
  ]
App [ width = 240, height = 160, fill = #20242C,
  a: Tally [ x = 12, y = 10 ],
  b: Tally [ x = 12, y = 84, count = 3, accent = #C05050 ],
  sum: Text [ x = 136, y = 12, textColor = #FFE28A, fontSize = 14, fontFamily = "Arial",
    text = { "sum " + (a.count + b.count) } ],
  ]`;
const r6Compiled = compile(R6_RAW);
if (r6Compiled.errors.length > 0 || r6Compiled.warnings.length > 0) {
  throw new Error("R6 program did not compile clean:\n" +
    [...r6Compiled.errors, ...r6Compiled.warnings].map((e) => `  ${e.message}`).join("\n"));
}
const R6_SOURCE = r6Compiled.source;

// The R7 program: layout. A column stacking everything the rung must handle —
// user-class rows (each with its OWN class-body x-layout whose second child
// rides the caption's auto-measured text width), an async Image whose natural
// size arrives after attach and re-flows everything beneath it, an auto-sized
// Text IN the stack (its measured height positions the footer), and a plain
// footer strip. A second stack (strip) is the mutation target: hiding its
// middle child must reclaim the space, and a live `spacing` write on the
// strategy itself must re-flow. Geometry (1x, after the image loads; column
// children local y): a 0..22 · b 28..58 · pic 64..76 (20×12 natural) ·
// c 82..104 · tail 110.. (auto height) · foot after it; strip children at
// 0 / 22 / 44. The __mutate burst (see r7PageHtml): b grows to 44 (c/tail/
// foot shift +14, pic to 78), s2 hides, strip spacing 4→12 (s3 lands at 30).
const R7_RAW = `class Row extends View [
  label: string = "row",
  width = 120, height = 22, fill = 0x264653,
  layout: SimpleLayout [ axis = x, spacing = 4 ],
  cap: Text [ y = 3, textColor = 0xFFE28A, fontSize = 12, fontFamily = "Arial", text = { label } ],
  swatch: View [ y = 7, width = 8, height = 8, fill = 0x4FC3F7 ],
  ]
App [ width = 240, height = 160, fill = #20242C,
  column: View [ x = 12, y = 10, width = 120, height = 140,
    layout: SimpleLayout [ axis = y, spacing = 6 ],
    a: Row [ label = "alpha" ],
    b: Row [ label = "beta", height = 30 ],
    pic: Image [ source = "__IMG__" ],
    c: Row [ label = "gamma" ],
    tail: Text [ textColor = #8ECAE6, fontSize = 14, fontFamily = "Arial", text = "tail" ],
    foot: View [ width = 100, height = 10, fill = #3FA34D ],
    ],
  strip: View [ x = 140, y = 10, width = 90, height = 140,
    layout: SimpleLayout [ axis = y, spacing = 4 ],
    s1: View [ width = 80, height = 18, fill = #6D597A ],
    s2: View [ width = 80, height = 18, fill = #E9C46A ],
    s3: View [ width = 80, height = 18, fill = #91C499 ],
    ],
  ]`;
const r7Compiled = compile(R7_RAW);
if (r7Compiled.errors.length > 0 || r7Compiled.warnings.length > 0) {
  throw new Error("R7 program did not compile clean:\n" +
    [...r7Compiled.errors, ...r7Compiled.warnings].map((e) => `  ${e.message}`).join("\n"));
}
const R7_SOURCE = r7Compiled.source;

// The R8 program: data. A DataSource fetched over real HTTP (the harness
// serves the fixture), a replicated user-class Row over `:rows[]` inside a
// laid column (replication + layout re-arm under one roof), every leaf bound
// to data — the swatch color, the bar width, the caption text — and a static
// foot AFTER the block, pinning that the block occupies the template's slot.
// Geometry (1x): column at (10,10); rows h=18 at local y 0/22/44 (spacing 4);
// foot at 66. A swatch spans abs x 12..22, a bar abs x 26..26+w. Fixture
// rows: alpha w=40 red, beta w=70 yellow, gamma w=55 green. The __mutate
// burst (one turn): rename beta, insert delta (w=25 purple), remove alpha —
// rows become BETA/gamma/delta, same count, one frame.
const R8_RAW = `class Row extends View [
  width = 190, height = 18,
  swatch: View [ x = 2, y = 4, width = 10, height = 10, fill = :c ],
  bar:    View [ x = 16, y = 4, width = :w, height = 10, fill = 0x4FC3F7 ],
  cap:    Text [ x = 110, y = 2, fontSize = 12, fontFamily = "Arial", textColor = 0xFFFFFF, text = :label ],
  ]
App [ width = 240, height = 160, fill = #20242C,
  src: DataSource [ url = "/data/r8.json" ],
  onInit() { src.fetch() },
  column: View [ x = 10, y = 10, width = 200, height = 140,
    datapath = { src.value },
    layout: SimpleLayout [ axis = y, spacing = 4 ],
    Row [ datapath = :rows[] ],
    foot: View [ width = 120, height = 6, fill = #3FA34D ],
    ],
  ]`;
const r8Compiled = compile(R8_RAW);
if (r8Compiled.errors.length > 0 || r8Compiled.warnings.length > 0) {
  throw new Error("R8 program did not compile clean:\n" +
    [...r8Compiled.errors, ...r8Compiled.warnings].map((e) => `  ${e.message}`).join("\n"));
}
const R8_SOURCE = r8Compiled.source;

const R8_DATA = {
  rows: [
    { label: "alpha", w: 40, c: 0xe74c3c },
    { label: "beta", w: 70, c: 0xf1c40f },
    { label: "gamma", w: 55, c: 0x2ecc71 },
  ],
};
const R8_DATA_B = { rows: [{ label: "one", w: 100, c: 0x4fc3f7 }] };

// The auto-extent program (the neoweather rung's sub-slice): a never-sized
// box whose extent two literal children define, an `echo` bar CONSUMING the
// derived width/height through ordinary constraints (the weather app's
// labels→fields idiom), and a never-sized stack combining auto-extent with a
// layout AND a percent-width child (excluded from the width derive — the
// ruled cycle guard — so stack.width = 70 and s2 resolves to 35 of it).
// Geometry (1x): box 12..110 × 12..64 (w=98 h=52); echo x = 12+98+20 = 130,
// height = box.height = 52; stack 12..82 × 90..118 (w=70, h=14+4+10=28), s2
// 12..47 × 108..118. All solid fills — the whole scene diffs STRICT.
// __mutate: hide b (box shrinks to 68×28 → echo follows to x=100 h=28) and
// grow s1 to 30 (stack h=44, s2 lands at y=124).
const R9_RAW = `App [ width=240, height=160, fill=#20242C,
  box: View [ x=12, y=12, fill=#264653,
    a: View [ x=8, y=8, width=60, height=20, fill=#3FA34D ],
    b: View [ x=8, y=36, width=90, height=16, fill=#E9C46A ] ],
  echo: View [ x={ box.x + box.width + 20 }, y=12, width=20, height={ box.height }, fill=#4FC3F7 ],
  stack: View [ x=12, y=90, fill=#6D597A,
    layout: SimpleLayout [ axis=y, spacing=4 ],
    s1: View [ width=70, height=14, fill=#91C499 ],
    s2: View [ width=50%, height=10, fill=#C0C0C0 ] ] ]`;
const r9Compiled = compile(R9_RAW);
if (r9Compiled.errors.length > 0 || r9Compiled.warnings.length > 0) {
  throw new Error("R9 program did not compile clean:\n" +
    [...r9Compiled.errors, ...r9Compiled.warnings].map((e) => `  ${e.message}`).join("\n"));
}
const R9_SOURCE = r9Compiled.source;

// The styling program (the styling rung): every channel and every decoration
// value on screen at once, on both backends —
//   prevailing fonts/textColor provided at the App root (label/sub follow),
//   a stylesheet (Base) with a theme record + class-keyed entries: Chip gets
//     a GRADIENT fill + an inside stroke; Chip's class body pins
//     cornerRadius = { theme.radius } (a class-body set outranking the skin —
//     and a theme-token read),
//   a bundle (`ring`, applied styles=[ring] on chip2) whose stroke outranks
//     the Chip entry's (rank 5 > 3),
//   a { theme.accent } instance binding (panel),
//   a translucent drop shadow (#00000044, dx=dy=4, blur 0 — deterministic
//     hard edge) cast by a ROUNDED white box,
//   an #RRGGBBAA translucent fill literal (veil), and a textShadow.
// __restyle() swaps the App's stylesheet to Dark: chips go solid dark with a
// new stroke, the panel re-reads the accent token, the Text entry recolors
// both runs (an entry OUTRANKS the prevailing follow), the shadow box (no
// entry names it) must not move a pixel — all in ONE settle, one frame.
const R10_RAW = `stylesheet Base [
    theme: Theme [ accent = #E9C46A, radius = 6 ],
    Chip:  [ fill = gradient(#F8F8F8, #B8B8B8), stroke = stroke(2, #B0B0B0) ],
  ]
stylesheet Dark [
    theme: Theme [ accent = #4FC3F7, radius = 6 ],
    Chip:  [ fill = #333333, stroke = stroke(2, #777777) ],
    Text:  [ textColor = #CAD0EC ],
  ]
class Chip extends View [ width = 84, height = 32, cornerRadius = { theme.radius } ]
style ring [ stroke = stroke(2, #3FA34D) ]
App [ width=240, height=160, fill=#20242C, stylesheet = Base,
    fontFamily = "Arial", fontSize = 14, fontWeight = bold, textColor = #FFE28A,
    chip1: Chip [ x=16, y=16 ],
    chip2: Chip [ x=16, y=58, styles = [ring],
        tag: View [ x = -6, y = 10, width = 10, height = 8, fill = #FF00FF ] ],
    panel: View [ x=120, y=16, width=90, height=44, fill = { theme.accent } ],
    shadowBox: View [ x=132, y=76, width=56, height=32, fill=#FFFFFF, cornerRadius=8,
                      shadow = shadow(4, 4, 0, #00000044) ],
    veil: View [ x=200, y=124, width=32, height=24, fill=#FF000080 ],
    label: Text [ x=16, y=104, text="Styled", textShadow = shadow(1, 1, 0, #000000) ],
    sub: Text [ x=16, y=130, text="follows the app", fontSize=11, fontWeight=normal ],
  ]`;
const r10Compiled = compile(R10_RAW);
if (r10Compiled.errors.length > 0 || r10Compiled.warnings.length > 0) {
  throw new Error("R10 program did not compile clean:\n" +
    [...r10Compiled.errors, ...r10Compiled.warnings].map((e) => `  ${e.message}`).join("\n"));
}
const R10_SOURCE = r10Compiled.source;

// One page template per backend and program; the only differences are which
// backend class renders and which source. The canvas backend's first paint is
// its scheduled rAF, so readiness is flagged one frame after that (double-rAF
// covers both).
const pageHtml = (backendClass, source) => `<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;padding:0}</style>
<div id="host"></div>
<script type="module">
  import { render, ${backendClass} } from "/dist/index.js";
  window.__app = render(${JSON.stringify(source)}, document.getElementById("host"), new ${backendClass}());
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__rendered = true; }));
</script>`;

function findChrome() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", // macOS
    "/usr/bin/google-chrome", // linux
    "/usr/bin/chromium",
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error(
    "no Chrome found — set PUPPETEER_EXECUTABLE_PATH to a Chrome/Chromium binary"
  );
}

// The R3 page: builds (not renders) so it can hand child [5] its draw method
// before attach, generates the test bitmap in-page (deterministic pixels, no
// asset file, no decoder skew), and flags readiness only after both images
// have loaded — image arrival is asynchronous by design (invalidate-on-load).
const r3PageHtml = (backendClass) => `<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;padding:0}</style>
<div id="host"></div>
<script type="module">
  import { build, ${backendClass} } from "/dist/index.js";

  // 20×12: left half red, right half blue.
  const bmp = document.createElement("canvas");
  bmp.width = 20; bmp.height = 12;
  const bctx = bmp.getContext("2d");
  bctx.fillStyle = "#ff0000"; bctx.fillRect(0, 0, 10, 12);
  bctx.fillStyle = "#0000ff"; bctx.fillRect(10, 0, 10, 12);

  const app = build(${JSON.stringify(R3_SOURCE)}.replaceAll("__IMG__", bmp.toDataURL()));

  // A draw method is runtime API until R5 lands methods in the language:
  // a filled triangle plus a stroked line, recorded once at attach.
  app.children[5].draw = (d) => {
    d.fillStyle = "#4FC3F7";
    d.beginPath(); d.moveTo(0, 30); d.lineTo(30, 0); d.lineTo(60, 30); d.closePath(); d.fill();
    d.strokeStyle = "#FFFFFF"; d.lineWidth = 2;
    d.beginPath(); d.moveTo(5, 25); d.lineTo(55, 25); d.stroke();
  };

  const backend = new ${backendClass}();
  app.attach(backend, null);
  backend.attachRoot(document.getElementById("host"), app.surface);
  window.__app = app;

  const tick = () => {
    if (app.children[3].loaded && app.children[4].loaded) {
      requestAnimationFrame(() => requestAnimationFrame(() => { window.__rendered = true; }));
    } else requestAnimationFrame(tick);
  };
  tick();
</script>`;

// The R4 page: builds, hands the draw view its (attribute-reading) draw
// method, attaches, and exposes __mutate — the post-attach dynamics driver
// (three writes in one turn; the permuted page applies the same writes in a
// different order, extending the order-inertness pin through the cascade).
const r4PageHtml = (backendClass, source, permuted) => `<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;padding:0}</style>
<div id="host"></div>
<script type="module">
  import { build, ${backendClass} } from "/dist/index.js";
  const app = build(${JSON.stringify(source)});

  // Runtime API until R5 lands methods; reads this.width/height, so the
  // recording is stale — and re-records — whenever either changes.
  app.children[2].draw = function (d) {
    d.fillStyle = "#4FC3F7";
    d.fillRect(0, 0, this.width, this.height);
  };

  const backend = new ${backendClass}();
  app.attach(backend, null);
  backend.attachRoot(document.getElementById("host"), app.surface);
  window.__app = app;
  window.__mutate = () => {
    const panel = app.children[0];
    ${permuted
      ? "app.children[2].width = 80; panel.x = 60; panel.width = 100;"
      : "panel.width = 100; panel.x = 60; app.children[2].width = 80;"}
  };
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__rendered = true; }));
</script>`;

// The box-clip page (tabslider-gaps.md gap 1): renders the container+oversized
// child and exposes __growClip — a single post-attach height write on the
// clipping container, so the test can screenshot the clip tracking geometry
// (the reactive box-rect re-derive) exactly as an animating tab height would.
const clipPageHtml = (backendClass) => `<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;padding:0}</style>
<div id="host"></div>
<script type="module">
  import { render, ${backendClass} } from "/dist/index.js";
  const app = render(${JSON.stringify(CLIP_SOURCE)}, document.getElementById("host"), new ${backendClass}());
  window.__app = app;
  window.__growClip = () => { app.children[0].height = 140; };
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__rendered = true; }));
</script>`;

// The R7 page: renders the laid-out program (image generated in-page, as at
// R3), flags readiness only once the Image's natural size has arrived (the
// async re-flow is part of what the initial screenshot must show), and
// exposes the three-write mutation burst — a laid child growing, a laid
// child hiding, and a live spacing write on the strategy itself.
const r7PageHtml = (backendClass) => `<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;padding:0}</style>
<div id="host"></div>
<script type="module">
  import { render, ${backendClass} } from "/dist/index.js";

  // 20×12: left half red, right half blue (deterministic pixels, no asset).
  const bmp = document.createElement("canvas");
  bmp.width = 20; bmp.height = 12;
  const bctx = bmp.getContext("2d");
  bctx.fillStyle = "#ff0000"; bctx.fillRect(0, 0, 10, 12);
  bctx.fillStyle = "#0000ff"; bctx.fillRect(10, 0, 10, 12);

  const app = render(${JSON.stringify(R7_SOURCE)}.replaceAll("__IMG__", bmp.toDataURL()),
    document.getElementById("host"), new ${backendClass}());
  window.__app = app;
  window.__mutate = () => {
    app.column.b.height = 44;
    app.strip.s2.visible = false;
    app.strip.layout.spacing = 12;
  };
  const tick = () => {
    if (app.column.pic.loaded) {
      requestAnimationFrame(() => requestAnimationFrame(() => { window.__rendered = true; }));
    } else requestAnimationFrame(tick);
  };
  tick();
</script>`;

// The R8 page: renders the data program (its DataSource fetches the fixture
// the harness serves — a real HTTP arrival driving replication through the
// ordinary settle), flags readiness once the data has landed AND the block
// has materialized, and exposes the mutation burst (rename + insert + remove
// in one turn) plus __refetch (a whole second arrival, for the
// one-frame-per-arrival pin).
const r8PageHtml = (backendClass) => `<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;padding:0}</style>
<div id="host"></div>
<script type="module">
  import { render, ${backendClass} } from "/dist/index.js";
  const app = render(${JSON.stringify(R8_SOURCE)}, document.getElementById("host"), new ${backendClass}());
  window.__app = app;
  window.__mutate = () => {
    app.src.set("rows.1.label", "BETA");
    app.src.insert("rows", 3, { label: "delta", w: 25, c: 0x9b59b6 });
    app.src.removeAt("rows", 0);
  };
  window.__refetch = async () => {
    app.src.url = "/data/r8b.json";
    const before = window.__rafCalls;
    await app.src.fetch();
    await new Promise((r) => setTimeout(r));
    return window.__rafCalls - before;
  };
  const tick = () => {
    if (app.src.loaded && app.column.children.length === 4) {
      requestAnimationFrame(() => requestAnimationFrame(() => { window.__rendered = true; }));
    } else requestAnimationFrame(tick);
  };
  tick();
</script>`;

// The auto-extent page: renders the compiled R9 program and exposes the
// two-write mutation burst (hide an extent-defining child + grow a laid one).
const r9PageHtml = (backendClass) => `<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;padding:0}</style>
<div id="host"></div>
<script type="module">
  import { render, ${backendClass} } from "/dist/index.js";
  const app = render(${JSON.stringify(R9_SOURCE)}, document.getElementById("host"), new ${backendClass}());
  window.__app = app;
  window.__mutate = () => {
    app.box.b.visible = false;
    app.stack.s1.height = 30;
  };
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__rendered = true; }));
</script>`;

// The styling page: renders the compiled R10 program and exposes __restyle —
// the live re-skin (one write to the App's prevailing stylesheet slot),
// returning how many frames the whole cascade scheduled.
const r10PageHtml = (backendClass) => `<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;padding:0}</style>
<div id="host"></div>
<script type="module">
  import { render, ${backendClass} } from "/dist/index.js";
  const app = render(${JSON.stringify(R10_SOURCE)}, document.getElementById("host"), new ${backendClass}());
  window.__app = app;
  window.__restyle = async () => {
    const before = window.__rafCalls;
    app.stylesheet = app.lookupStylesheet("Dark");
    await Promise.resolve(); // land after the settle microtask
    return window.__rafCalls - before;
  };
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__rendered = true; }));
</script>`;

// The animation program (A1a): an Animator drives box.x from 20 → 140 on the
// real rAF clock, and a sibling `follow` view's x is CONSTRAINED to box.x — so
// if every intermediate frame value propagates through the reactive graph
// (animation.md §2 rule 1, the model-space ruling), the follower slides in
// lockstep, not just the box. started=false: the test drives start() and
// samples the trajectory frame by frame. `{ box.x }` is a bare-name read, so
// the source compiles (like R6–R10) before it reaches the runtime.
const ANIM_RAW = `App [ width=240, height=160, fill=#20242C,
  box: View [ x=20, y=60, width=40, height=40, fill=#4FC3F7,
    slide: Animator [ attribute=x, to=140, duration=600, motion=easeBoth, started=false ] ],
  follow: View [ x={ box.x }, y=112, width=40, height=36, fill=#E9C46A ] ]`;
const animCompiled = compile(ANIM_RAW);
if (animCompiled.errors.length > 0 || animCompiled.warnings.length > 0) {
  throw new Error("animation program did not compile clean:\n" +
    [...animCompiled.errors, ...animCompiled.warnings].map((e) => `  ${e.message}`).join("\n"));
}
const ANIM_SOURCE = animCompiled.source;

// The animation page: renders the (started=false) program, then exposes
// __runAnim — start the animator and collect box.x every frame until it lands
// on `to` (or a frame cap), returning the trajectory plus the follower's final
// x. rAF here is the REAL browser clock (no fake scheduler), so this exercises
// the shared clock end to end; a backgrounded tab throttles rAF, so the caller
// brings the page to front first.
const animPageHtml = (backendClass) => `<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;padding:0}</style>
<div id="host"></div>
<script type="module">
  import { render, ${backendClass} } from "/dist/index.js";
  const app = render(${JSON.stringify(ANIM_SOURCE)}, document.getElementById("host"), new ${backendClass}());
  window.__app = app;
  window.__runAnim = () => new Promise((resolve) => {
    const box = app.box, to = box.slide.to, from = box.x;
    const vals = [];
    box.slide.start();
    let frames = 0;
    const step = () => {
      vals.push(box.x);
      frames++;
      const settled = vals.length >= 2 && box.x === to && vals[vals.length - 2] === to;
      if (settled || frames >= 240) resolve({ vals, from, to, followX: app.follow.x });
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__rendered = true; }));
</script>`;

// The A2 composition program: TWO animators on ONE slot (box.x), both relative,
// so under the additive core (animation.md §4.2) their deltas SUM rather than
// one clobbering the other — a: +80, b: +40, so box.x travels 20 → 140 (the
// composed sum, not 100 or 60 that either alone would give). The exact-landing
// ledger (§4.3) assigns box.x its expected end (140) outright when the last
// animator finishes — no float drift from the summed increments. A sibling
// `follow` view is CONSTRAINED to box.x, so the composed motion propagates
// through the reactive graph frame by frame (model-space, §2.1), and the clock
// must go idle after both land.
const ANIM2_RAW = `App [ width=240, height=160, fill=#20242C,
  box: View [ x=20, y=60, width=40, height=40, fill=#4FC3F7,
    a: Animator [ attribute=x, relative=true, to=80, duration=600, motion=linear, started=false ],
    b: Animator [ attribute=x, relative=true, to=40, duration=600, motion=linear, started=false ] ],
  follow: View [ x={ box.x }, y=112, width=40, height=36, fill=#E9C46A ] ]`;
const anim2Compiled = compile(ANIM2_RAW);
if (anim2Compiled.errors.length > 0 || anim2Compiled.warnings.length > 0) {
  throw new Error("A2 composition program did not compile clean:\n" +
    [...anim2Compiled.errors, ...anim2Compiled.warnings].map((e) => `  ${e.message}`).join("\n"));
}
const ANIM2_SOURCE = anim2Compiled.source;

// Starts BOTH animators together and collects box.x each frame until it lands
// on the composed sum (or a frame cap), on the REAL rAF clock (end to end).
const anim2PageHtml = (backendClass) => `<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;padding:0}</style>
<div id="host"></div>
<script type="module">
  import { render, ${backendClass} } from "/dist/index.js";
  const app = render(${JSON.stringify(ANIM2_SOURCE)}, document.getElementById("host"), new ${backendClass}());
  window.__app = app;
  window.__runAnim2 = () => new Promise((resolve) => {
    const box = app.box, from = box.x, to = 140; // 20 + 80 + 40 (composed)
    const vals = [];
    box.a.start();
    box.b.start();
    let frames = 0;
    const step = () => {
      vals.push(box.x);
      frames++;
      const settled = vals.length >= 2 && box.x === to && vals[vals.length - 2] === to;
      if (settled || frames >= 240) resolve({ vals, from, to, followX: app.follow.x });
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__rendered = true; }));
</script>`;

function serveDist() {
  const fixtures = {
    "/data/r8.json": JSON.stringify(R8_DATA),
    "/data/r8b.json": JSON.stringify(R8_DATA_B),
  };
  const pages = {
    "/dom": pageHtml("DomBackend", SOURCE),
    "/canvas": pageHtml("CanvasBackend", SOURCE),
    "/dom-r2": pageHtml("DomBackend", R2_SOURCE),
    "/canvas-r2": pageHtml("CanvasBackend", R2_SOURCE),
    "/dom-r3": r3PageHtml("DomBackend"),
    "/canvas-r3": r3PageHtml("CanvasBackend"),
    "/dom-clip": clipPageHtml("DomBackend"),
    "/canvas-clip": clipPageHtml("CanvasBackend"),
    "/dom-r4": r4PageHtml("DomBackend", R4_SOURCE, false),
    "/canvas-r4": r4PageHtml("CanvasBackend", R4_SOURCE, false),
    "/dom-r4p": r4PageHtml("DomBackend", R4_PERMUTED, true),
    "/canvas-r4p": r4PageHtml("CanvasBackend", R4_PERMUTED, true),
    "/dom-r5": pageHtml("DomBackend", R5_SOURCE),
    "/canvas-r5": pageHtml("CanvasBackend", R5_SOURCE),
    "/dom-r6": pageHtml("DomBackend", R6_SOURCE),
    "/canvas-r6": pageHtml("CanvasBackend", R6_SOURCE),
    "/dom-r7": r7PageHtml("DomBackend"),
    "/canvas-r7": r7PageHtml("CanvasBackend"),
    "/dom-r8": r8PageHtml("DomBackend"),
    "/canvas-r8": r8PageHtml("CanvasBackend"),
    "/dom-r9": r9PageHtml("DomBackend"),
    "/canvas-r9": r9PageHtml("CanvasBackend"),
    "/dom-r10": r10PageHtml("DomBackend"),
    "/canvas-r10": r10PageHtml("CanvasBackend"),
    "/dom-anim": animPageHtml("DomBackend"),
    "/canvas-anim": animPageHtml("CanvasBackend"),
    "/dom-anim2": anim2PageHtml("DomBackend"),
    "/canvas-anim2": anim2PageHtml("CanvasBackend"),
  };
  const server = http.createServer(async (req, res) => {
    const page = pages[req.url];
    if (page) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(page);
      return;
    }
    const fixture = fixtures[req.url];
    if (fixture) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(fixture);
      return;
    }
    // Only /dist/*.js is ever requested besides the pages (see pageHtml's
    // import). The runtime's built output lives under runtime/dist since the
    // distro restructure, so /dist/* maps there; other paths resolve off root.
    const rel = req.url.startsWith("/dist/") ? path.join("runtime", req.url) : req.url;
    const filePath = path.join(root, rel);
    try {
      const body = await readFile(filePath);
      const type = filePath.endsWith(".js") ? "text/javascript" : "application/octet-stream";
      res.writeHead(200, { "content-type": type });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

/** Read pixels' RGBA from a base64 PNG, decoded via the page's own Image +
 *  canvas (native PNG decode, no Node-side dependency). */
async function samplePixels(page, pngBase64, points) {
  return page.evaluate(async (b64, pts) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return pts.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data));
  }, pngBase64, points);
}

/** The cross-backend comparator (decoded in-page like samplePixels).
 *
 *  Two regimes, chosen per pixel:
 *  - STRICT (the default, and everything outside `soft` rects): per-channel
 *    delta ≤ `tolerance`. This covers every pixel whose value both backends
 *    compute with the *same* mechanism — solid fills, composited group
 *    opacity, unscaled images, and recorded drawings (both replay through
 *    Canvas2D, so even their antialiased edges must agree).
 *  - SOFT (each rect in `soft`, with a label naming why): a region the two
 *    backends rasterize by *different* mechanisms — DOM text vs fillText,
 *    CSS clip-path vs Path2D clip, CSS image resampling vs drawImage. The
 *    geometry is identical but the antialiasing is not, so both images are
 *    box-blurred (radius `blur`) and then compared: AA differences are
 *    high-frequency and near-zero-mean, so blurring integrates them away,
 *    while genuinely different content (a wrong glyph, shifted geometry, a
 *    missing clip) moves local ink mass, which survives the blur. Each rect
 *    reports its max blurred delta and its mean absolute blurred delta; the
 *    caller asserts both (the mean catches diffuse drift, the max catches a
 *    local artifact). Soft rects are still probed pointwise elsewhere, so
 *    softness never exempts a region's *semantics*.
 *
 *  Returns { max, over } for the strict region and per-rect soft results. */
async function diffShots(page, aBase64, bBase64, { tolerance = 4, soft = [], blur = 2 } = {}) {
  return page.evaluate(async (a, b, tol, softRects, radius) => {
    const load = async (b64) => {
      const img = new Image();
      img.src = "data:image/png;base64," + b64;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    };
    const [A, B] = [await load(a), await load(b)];
    if (A.width !== B.width || A.height !== B.height) {
      return { sizeMismatch: `${A.width}x${A.height} vs ${B.width}x${B.height}` };
    }
    const W = A.width;
    const H = A.height;

    const inSoft = new Uint8Array(W * H);
    for (const r of softRects) {
      for (let y = Math.max(0, r.y); y < Math.min(H, r.y + r.h); y++) {
        for (let x = Math.max(0, r.x); x < Math.min(W, r.x + r.w); x++) inSoft[y * W + x] = 1;
      }
    }

    let max = 0;
    let over = 0;
    for (let p = 0; p < W * H; p++) {
      if (inSoft[p] === 1) continue;
      for (let c = 0; c < 4; c++) {
        const d = Math.abs(A.data[p * 4 + c] - B.data[p * 4 + c]);
        if (d > max) max = d;
        if (d > tol) over++;
      }
    }

    const blurAt = (img, x, y, c) => {
      let sum = 0;
      let n = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
          sum += img.data[(yy * W + xx) * 4 + c];
          n++;
        }
      }
      return sum / n;
    };
    const soft = softRects.map((r) => {
      let maxBlur = 0;
      let total = 0;
      let n = 0;
      for (let y = Math.max(0, r.y); y < Math.min(H, r.y + r.h); y++) {
        for (let x = Math.max(0, r.x); x < Math.min(W, r.x + r.w); x++) {
          for (let c = 0; c < 3; c++) {
            const d = Math.abs(blurAt(A, x, y, c) - blurAt(B, x, y, c));
            if (d > maxBlur) maxBlur = d;
            total += d;
            n++;
          }
        }
      }
      return { label: r.label, maxBlur: Math.round(maxBlur * 10) / 10, mean: Math.round((total / n) * 100) / 100 };
    });

    return { max, over, soft };
  }, aBase64, bBase64, tolerance, soft, blur);
}

function assertColorNear(actual, expected, label, tolerance = 4) {
  const [r, g, b, a] = actual;
  const [er, eg, eb] = expected;
  const close = (x, y) => Math.abs(x - y) <= tolerance;
  assert.ok(
    close(r, er) && close(g, eg) && close(b, eb) && a === 255,
    `${label}: expected rgb(${er},${eg},${eb}) opaque, got rgba(${r},${g},${b},${a})`
  );
}

const server = await serveDist();
const port = server.address().port;
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const artifactsDir = path.join(here, "artifacts");
await mkdir(artifactsDir, { recursive: true });

/** Open a page on `route`, wait for the render, screenshot it. Every page
 *  counts requestAnimationFrame calls (window.__rafCalls) so tests can pin
 *  the canvas scheduler's coalescing/idleness. */
async function renderShot(route, deviceScaleFactor, artifact) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.__rafCalls = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => { window.__rafCalls++; return raf(cb); };
  });
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor });
  await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__rendered === true);
  const png = await page.screenshot({ encoding: "base64" });
  await writeFile(path.join(artifactsDir, artifact), Buffer.from(png, "base64"));
  return { page, png };
}

// The same four probes for every 1x render of the sample program.
const PROBES = [
  { at: [5, 5], color: BG, label: "App background (top-left)" },
  { at: [235, 155], color: BG, label: "App background (bottom-right)" },
  { at: [60, 50], color: WHITE, label: "child View interior" },
  { at: [15, 15], color: BG, label: "App background (beside child)" },
];

async function assertProbes(page, png) {
  const actual = await samplePixels(page, png, PROBES.map((p) => p.at));
  PROBES.forEach((p, i) => assertColorNear(actual[i], p.color, p.label));
}

try {
  const dom = await renderShot("/dom", 1, "r0.png");
  const canvas = await renderShot("/canvas", 1, "r1-canvas.png");

  await test("DOM: the App and its child View are positioned elements", async () => {
    const shape = await dom.page.evaluate(() => {
      const host = document.getElementById("host");
      const app = host.firstElementChild;
      return {
        childCount: host.children.length,
        appChildCount: app.children.length,
        appPosition: getComputedStyle(app).position,
      };
    });
    assert.equal(shape.childCount, 1, "host should contain exactly the App element");
    assert.equal(shape.appChildCount, 1, "App should contain exactly the child View");
    assert.equal(shape.appPosition, "absolute", "surfaces are absolutely positioned");
  });

  await test("DOM: the rendered pixels match the expected simple render", async () => {
    await assertProbes(dom.page, dom.png);
  });

  await test("Canvas: one shared <canvas> sized to the root", async () => {
    const shape = await canvas.page.evaluate(() => {
      const host = document.getElementById("host");
      const el = host.firstElementChild;
      return {
        childCount: host.children.length,
        tag: el.tagName,
        backing: [el.width, el.height],
        css: [el.style.width, el.style.height],
      };
    });
    assert.equal(shape.childCount, 1, "host should contain exactly the shared canvas");
    assert.equal(shape.tag, "CANVAS");
    assert.deepEqual(shape.backing, [WIDTH, HEIGHT], "backing store is logical size × dpr(=1)");
    assert.deepEqual(shape.css, [WIDTH + "px", HEIGHT + "px"], "CSS box stays logical");
  });

  await test("Canvas: the rendered pixels match the expected simple render", async () => {
    await assertProbes(canvas.page, canvas.png);
  });

  await test("cross-backend: DOM and Canvas renders agree within AA tolerance", async () => {
    const diff = await diffShots(canvas.page, dom.png, canvas.png);
    assert.ok(!diff.sizeMismatch, `screenshot sizes differ: ${diff.sizeMismatch}`);
    assert.equal(diff.over, 0, `channels beyond tolerance: ${diff.over} (max delta ${diff.max})`);
  });

  await test("Canvas: an idle tree schedules no frames", async () => {
    const before = await canvas.page.evaluate(() => window.__rafCalls);
    await new Promise((r) => setTimeout(r, 150));
    const after = await canvas.page.evaluate(() => window.__rafCalls);
    assert.equal(after, before, "no requestAnimationFrame while nothing changes");
  });

  await test("Canvas: changes coalesce into one frame and repaint", async () => {
    // Two surface changes in one burst → exactly one scheduled frame. (The
    // surface is driven directly: View setters wire up to it at R4.)
    const scheduled = await canvas.page.evaluate(() => {
      const before = window.__rafCalls;
      const surface = window.__app.children[0].surface;
      surface.setFill(0xc03040);
      surface.setX(20); // second change in the same burst
      return window.__rafCalls - before;
    });
    assert.equal(scheduled, 1, "a burst of changes schedules exactly one frame");
    await new Promise((r) => setTimeout(r, 100)); // let the frame paint
    const png = await canvas.page.screenshot({ encoding: "base64" });
    const [inside] = await samplePixels(canvas.page, png, [[60, 50]]);
    assertColorNear(inside, [0xc0, 0x30, 0x40], "child View interior after repaint");
  });

  await test("Canvas at dpr=2: device-sized backing store, crisp edges", async () => {
    const { page, png } = await renderShot("/canvas", 2, "r1-canvas-2x.png");
    const backing = await page.evaluate(() => {
      const el = document.querySelector("#host canvas");
      return [el.width, el.height, window.devicePixelRatio];
    });
    assert.deepEqual(backing, [WIDTH * 2, HEIGHT * 2, 2], "backing store is logical size × dpr");
    // The child's left edge is at logical x=20 → device x=40: the boundary
    // device pixels must be pure, not a resampling blend (which is what a
    // logical-sized backing store scaled up by the browser would produce).
    const [inL, outL, inR, outR] = await samplePixels(page, png, [
      [40, 100], [39, 100], [199, 100], [200, 100],
    ]);
    assertColorNear(inL, WHITE, "first device column inside the child");
    assertColorNear(outL, BG, "last device column left of the child");
    assertColorNear(inR, WHITE, "last device column inside the child");
    assertColorNear(outR, BG, "first device column right of the child");
  });

  // ── R2: the typed literal surface, rendered ──────────────────────────────
  const NAVY = [0x00, 0x00, 0x80];
  const R2_PROBES = [
    { at: [5, 5], color: NAVY, label: "named fill=navy" },
    // white at opacity 0.5 over navy: 0.5·255 + 0.5·(0,0,128) ≈ (128,128,192)
    { at: [60, 50], color: [128, 128, 192], label: "opacity=0.5 white over navy" },
    { at: [160, 50], color: [0x66, 0x33, 0x99], label: "named fill=rebeccapurple" },
    { at: [60, 120], color: NAVY, label: "visible=false view leaves the background" },
  ];

  const domR2 = await renderShot("/dom-r2", 1, "r2-dom.png");
  const canvasR2 = await renderShot("/canvas-r2", 1, "r2-canvas.png");

  for (const [name, shot] of [["DOM", domR2], ["Canvas", canvasR2]]) {
    await test(`${name}: named colors, opacity, and visible=false render correctly`, async () => {
      const actual = await samplePixels(shot.page, shot.png, R2_PROBES.map((p) => p.at));
      R2_PROBES.forEach((p, i) => assertColorNear(actual[i], p.color, `${name} ${p.label}`));
    });
  }

  await test("cross-backend: the R2 program agrees within AA tolerance", async () => {
    const diff = await diffShots(canvasR2.page, domR2.png, canvasR2.png);
    assert.ok(!diff.sizeMismatch, `screenshot sizes differ: ${diff.sizeMismatch}`);
    assert.equal(diff.over, 0, `channels beyond tolerance: ${diff.over} (max delta ${diff.max})`);
  });

  // ── R3: leaves, drawing, clip, group opacity ──────────────────────────────

  const R3_BG = [0x20, 0x24, 0x2c];
  // 50% over the app background — group semantics: the subtree composites
  // opaquely, then fades as one unit over what lies beneath it.
  const half = (r, g, b) => [Math.round((r + 0x20) / 2), Math.round((g + 0x24) / 2), Math.round((b + 0x2c) / 2)];
  const R3_PROBES = [
    { at: [5, 5], color: R3_BG, label: "app background" },
    { at: [15, 40], color: half(255, 0, 0), label: "translucent container, its own red" },
    { at: [35, 25], color: half(255, 255, 255), label: "white child through group opacity" },
    // THE group-semantics discriminator: where the blue child overlaps the
    // white child inside the opacity-0.5 container, the group composite is
    // blue at 50% over the app bg ≈ (16,18,150); the R1 multiplicative
    // semantics would stack three 50% fills to ≈ (99,68,196).
    { at: [70, 40], color: half(0, 0, 255), label: "overlapping children under group opacity" },
    { at: [105, 15], color: half(255, 0, 0), label: "container red beside both children" },
    { at: [170, 20], color: [0x3f, 0xa3, 0x4d], label: "inside the clip triangle" },
    { at: [135, 60], color: R3_BG, label: "clipped away (left of the triangle)" },
    { at: [205, 60], color: R3_BG, label: "clipped away (right of the triangle)" },
    { at: [134, 95], color: [255, 0, 0], label: "natural-size image, red half" },
    { at: [146, 95], color: [0, 0, 255], label: "natural-size image, blue half" },
    { at: [134, 106], color: R3_BG, label: "below the natural-size image (12px tall)" },
    { at: [178, 100], color: [255, 0, 0], label: "stretched image, red half" },
    { at: [202, 100], color: [0, 0, 255], label: "stretched image, blue half" },
    { at: [40, 135], color: [0x4f, 0xc3, 0xf7], label: "draw method: filled triangle" },
    { at: [40, 145], color: [255, 255, 255], label: "draw method: stroked line" },
  ];

  // The regions the two backends rasterize by different mechanisms (see
  // diffShots); each is also probed pointwise above, so softness never
  // exempts semantics. The drawing view is deliberately NOT here: both
  // backends replay recordings through Canvas2D, so even its antialiased
  // diagonals must agree strictly.
  const R3_SOFT = [
    { x: 8, y: 86, w: 112, h: 32, label: "text (DOM text vs fillText AA)" },
    { x: 130, y: 10, w: 80, h: 60, label: "clip edges (clip-path vs Path2D AA)" },
    { x: 170, y: 90, w: 40, h: 24, label: "stretched image (CSS vs drawImage resampling)" },
  ];

  const domR3 = await renderShot("/dom-r3", 1, "r3-dom.png");
  const canvasR3 = await renderShot("/canvas-r3", 1, "r3-canvas.png");

  for (const [name, shot] of [["DOM", domR3], ["Canvas", canvasR3]]) {
    await test(`${name}: R3 probes — group opacity, clip, images, drawing`, async () => {
      const actual = await samplePixels(shot.page, shot.png, R3_PROBES.map((p) => p.at));
      R3_PROBES.forEach((p, i) => assertColorNear(actual[i], p.color, `${name} ${p.label}`));
    });

    await test(`${name}: Text auto-sizes to native metrics and inks its region`, async () => {
      const [w, h, expW, expH] = await shot.page.evaluate(() => {
        const t = window.__app.children[1];
        const c = document.createElement("canvas").getContext("2d");
        c.font = "bold 20px Arial";
        const m = c.measureText("Neo 72°");
        return [t.width, t.height, Math.ceil(m.width), Math.ceil(m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)];
      });
      assert.equal(w, expW, "auto width = ceil(measured advance)");
      assert.equal(h, expH, "auto height = ceil(ascent + descent)");
      const ink = await shot.page.evaluate(async (b64, rect) => {
        const img = new Image();
        img.src = "data:image/png;base64," + b64;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(rect.x, rect.y, rect.w, rect.h).data;
        let inked = 0;
        for (let p = 0; p < data.length; p += 4) {
          if (Math.abs(data[p] - 0x20) > 40 || Math.abs(data[p + 1] - 0x24) > 40 || Math.abs(data[p + 2] - 0x2c) > 40) inked++;
        }
        return inked;
      }, shot.png, { x: 10, y: 88, w: 110, h: 30 });
      assert.ok(ink > 100, `text region should contain glyph ink; found ${ink} inked pixels`);
    });
  }

  await test("Image loads async and adopts its natural size (20×12)", async () => {
    const dims = await domR3.page.evaluate(() => {
      const i = window.__app.children[3];
      return [i.width, i.height, i.loaded];
    });
    assert.deepEqual(dims, [20, 12, true]);
  });

  await test("DOM: a drawing rasterizes into a per-view canvas sized by its bounds", async () => {
    // The recording's bounds are (0,0,60,30) — triangle ∪ stroke-expanded
    // line — so the per-view canvas (dpr=1) must be exactly that box.
    const shape = await domR3.page.evaluate(() => {
      const drawDiv = document.getElementById("host").firstElementChild.children[5];
      const canvas = drawDiv.firstElementChild;
      return [canvas.tagName, canvas.width, canvas.height, canvas.style.left, canvas.style.top];
    });
    assert.deepEqual(shape, ["CANVAS", 60, 30, "0px", "0px"]);
  });

  await test("cross-backend: R3 strict outside soft regions, blur-agree inside", async () => {
    const diff = await diffShots(canvasR3.page, domR3.png, canvasR3.png, { soft: R3_SOFT });
    assert.ok(!diff.sizeMismatch, `screenshot sizes differ: ${diff.sizeMismatch}`);
    console.log(
      `      strict max ${diff.max} | ` +
        diff.soft.map((s) => `${s.label.split(" ")[0]} mean ${s.mean} max ${s.maxBlur}`).join(" | ")
    );
    assert.equal(diff.over, 0, `strict channels beyond tolerance: ${diff.over} (max delta ${diff.max})`);
    for (const s of diff.soft) {
      assert.ok(s.mean <= 3, `${s.label}: mean blurred delta ${s.mean} > 3`);
      assert.ok(s.maxBlur <= 48, `${s.label}: max blurred delta ${s.maxBlur} > 48`);
    }
  });

  await test("soft comparator negative control: altered text is caught", async () => {
    const perturbed = await canvasR3.page.evaluate(async (b64) => {
      const img = new Image();
      img.src = "data:image/png;base64," + b64;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      ctx.fillStyle = "#20242C";
      ctx.fillRect(10, 90, 60, 20); // erase most of the glyph ink
      return c.toDataURL().split(",")[1];
    }, canvasR3.png);
    const diff = await diffShots(canvasR3.page, canvasR3.png, perturbed, { soft: R3_SOFT });
    assert.ok(
      diff.soft[0].mean > 3,
      `erasing the text must push the blurred mean past the limit (got ${diff.soft[0].mean})`
    );
  });

  // ── Box-clip (tabslider-gaps.md gap 1): reveal-by-clip, reactive on height ─

  const CLIP_BG = [0x20, 0x24, 0x2c];
  const CLIP_CHILD = [0xe7, 0x6f, 0x51];
  const domClip = await renderShot("/dom-clip", 1, "clip-dom.png");
  const canvasClip = await renderShot("/canvas-clip", 1, "clip-canvas.png");

  // Initial: container height 50, clip=true → only the top 50px of the
  // 120-tall child paints; below the box is clipped away (app bg shows).
  const CLIP_INITIAL = [
    { at: [80, 40], color: CLIP_CHILD, label: "child shown within the clip box (top 50px)" },
    { at: [80, 100], color: CLIP_BG, label: "clipped away below the box (height 50)" },
    { at: [80, 130], color: CLIP_BG, label: "clipped away, lower still" },
  ];
  for (const [name, shot] of [["DOM", domClip], ["Canvas", canvasClip]]) {
    await test(`${name}: clip=true box-clips the oversized child to the view box`, async () => {
      const actual = await samplePixels(shot.page, shot.png, CLIP_INITIAL.map((p) => p.at));
      CLIP_INITIAL.forEach((p, i) => assertColorNear(actual[i], p.color, `${name} ${p.label}`));
    });
  }

  await test("cross-backend: the box-clip agrees within AA tolerance", async () => {
    const diff = await diffShots(canvasClip.page, domClip.png, canvasClip.png, {
      soft: [{ x: 40, y: 20, w: 100, h: 50, label: "box-clip edges (clip-path vs Path2D AA)" }],
    });
    assert.ok(!diff.sizeMismatch, `screenshot sizes differ: ${diff.sizeMismatch}`);
    assert.equal(diff.over, 0, `channels beyond tolerance: ${diff.over} (max delta ${diff.max})`);
    for (const s of diff.soft) {
      assert.ok(s.mean <= 3, `${s.label}: mean blurred delta ${s.mean} > 3`);
      assert.ok(s.maxBlur <= 48, `${s.label}: max blurred delta ${s.maxBlur} > 48`);
    }
  });

  // The reactive half: one height write (50 → 140) must re-derive the box rect
  // so the whole 120-tall child is revealed — the clip tracks geometry every
  // frame, which is what follows an animating tab height (gap 1's fix).
  const CLIP_GROWN = [
    { at: [80, 40], color: CLIP_CHILD, label: "child top still shown after grow" },
    { at: [80, 100], color: CLIP_CHILD, label: "revealed by the grown clip (height 140)" },
    { at: [80, 130], color: CLIP_CHILD, label: "revealed lower (child is 120 tall)" },
    { at: [80, 150], color: CLIP_BG, label: "below the 120-tall child, inside the 140 box" },
  ];
  for (const [name, shot] of [["DOM", domClip], ["Canvas", canvasClip]]) {
    await test(`${name}: the box-clip re-derives the rect as height grows (reveal by clip)`, async () => {
      await shot.page.evaluate(() => window.__growClip());
      await new Promise((r) => setTimeout(r, 100)); // let the settle + frame land
      const png = await shot.page.screenshot({ encoding: "base64" });
      const actual = await samplePixels(shot.page, png, CLIP_GROWN.map((p) => p.at));
      CLIP_GROWN.forEach((p, i) => assertColorNear(actual[i], p.color, `${name} ${p.label}`));
    });
  }

  // ── R4: constraints, percent, dynamics — both backends ───────────────────

  const R4_BG = [0x20, 0x24, 0x2c];
  const PANEL = [0x26, 0x46, 0x53];
  const BAR = [0x3f, 0xa3, 0x4d];
  const GOLD = [0xe9, 0xc4, 0x6a];
  const DRAWN = [0x4f, 0xc3, 0xf7];

  // Initial geometry: panel 20,16 160×56 → bar 28..172 / 24..40; the 50%
  // child is 80 wide, centered → 60..140 / 48..64; draw view 20,116 40×28.
  const R4_PROBES = [
    { at: [10, 10], color: R4_BG, label: "app background" },
    { at: [25, 20], color: PANEL, label: "panel" },
    { at: [100, 30], color: BAR, label: "bar constrained to parent.width - 16" },
    { at: [50, 56], color: PANEL, label: "panel left of the centered child" },
    { at: [100, 56], color: GOLD, label: "centered 50%-wide child" },
    { at: [30, 130], color: DRAWN, label: "draw method's rect (reads this.width)" },
    { at: [70, 130], color: R4_BG, label: "right of the 40px draw rect" },
  ];

  // After __mutate (panel → x=60, width=100; draw view → width=80): bar
  // 68..152 / 24..40; the 50% child re-resolves to 50, centered → 85..135 /
  // 48..64; the draw rect re-records 80 wide.
  const R4_POST_PROBES = [
    { at: [25, 20], color: R4_BG, label: "old panel position vacated" },
    { at: [70, 20], color: PANEL, label: "panel at its new x" },
    { at: [100, 30], color: BAR, label: "bar re-evaluated against the new width" },
    { at: [156, 30], color: PANEL, label: "panel right of the shorter bar" },
    { at: [75, 56], color: PANEL, label: "panel left of the re-centered child" },
    { at: [110, 56], color: GOLD, label: "50% child re-resolved and re-centered" },
    { at: [95, 130], color: DRAWN, label: "draw rect re-recorded 80 wide" },
    { at: [105, 130], color: R4_BG, label: "right of the re-recorded rect" },
  ];

  // The only cross-backend mechanism-divergent region in the scene (the
  // constrained Text; the w0 Text inks in the background color on purpose).
  const R4_SOFT = [{ x: 18, y: 84, w: 130, h: 28, label: "text (DOM text vs fillText AA)" }];

  const domR4 = await renderShot("/dom-r4", 1, "r4-dom.png");
  const canvasR4 = await renderShot("/canvas-r4", 1, "r4-canvas.png");
  const domR4p = await renderShot("/dom-r4p", 1, "r4-dom-permuted.png");
  const canvasR4p = await renderShot("/canvas-r4p", 1, "r4-canvas-permuted.png");

  // Model-level facts, same on both backends: percent resolution, the
  // constrained Text auto-sizing to its constrained content, and was-set
  // (an explicit width=0 stays 0 — R3's 0-as-unset stand-in is gone).
  const r4Model = (page) =>
    page.evaluate(() => {
      const app = window.__app;
      const c = document.createElement("canvas").getContext("2d");
      c.font = "bold 16px Arial";
      return {
        gold: [app.children[0].children[1].x, app.children[0].children[1].width],
        text: app.children[1].text,
        textWidth: app.children[1].width,
        measured: Math.ceil(c.measureText(app.children[1].text).width),
        w0: app.children[3].width,
        w0height: app.children[3].height,
      };
    });

  for (const [name, shot] of [["DOM", domR4], ["Canvas", canvasR4]]) {
    await test(`${name}: R4 probes — constraint geometry, percent, tracked draw`, async () => {
      const actual = await samplePixels(shot.page, shot.png, R4_PROBES.map((p) => p.at));
      R4_PROBES.forEach((p, i) => assertColorNear(actual[i], p.color, `${name} ${p.label}`));
    });

    await test(`${name}: R4 model — percent, constrained text auto-size, was-set`, async () => {
      const m = await r4Model(shot.page);
      assert.deepEqual(m.gold, [40, 80], "50% of 160, centered at 40");
      assert.equal(m.text, "width 160", "the text constraint saw the panel width");
      assert.equal(m.textWidth, m.measured, "auto width re-measured the constrained content");
      assert.equal(m.w0, 0, "an explicit width=0 stays 0 (was-set, not 0-as-unset)");
      assert.ok(m.w0height > 0, "unset height still auto-sizes");
    });
  }

  await test("cross-backend: the R4 program agrees (strict outside the text)", async () => {
    const diff = await diffShots(canvasR4.page, domR4.png, canvasR4.png, { soft: R4_SOFT });
    assert.ok(!diff.sizeMismatch, `screenshot sizes differ: ${diff.sizeMismatch}`);
    assert.equal(diff.over, 0, `strict channels beyond tolerance: ${diff.over} (max delta ${diff.max})`);
    for (const s of diff.soft) {
      assert.ok(s.mean <= 3 && s.maxBlur <= 48, `${s.label}: mean ${s.mean}, max ${s.maxBlur}`);
    }
  });

  await test("declaration order is inert (ruled): permuted members, identical pixels", async () => {
    // Same backend + same semantics ⇒ the same rasterizer must produce the
    // same bytes: tolerance 0, no soft regions, on both backends.
    for (const [name, straight, permuted] of [
      ["DOM", domR4, domR4p],
      ["Canvas", canvasR4, canvasR4p],
    ]) {
      const diff = await diffShots(straight.page, straight.png, permuted.png, { tolerance: 0 });
      assert.ok(!diff.sizeMismatch, `${name}: sizes differ`);
      assert.equal(diff.over, 0, `${name}: permuted order changed pixels (max delta ${diff.max})`);
    }
  });

  await test("Canvas: an idle constrained tree schedules no frames", async () => {
    const before = await canvasR4.page.evaluate(() => window.__rafCalls);
    await new Promise((r) => setTimeout(r, 150));
    const after = await canvasR4.page.evaluate(() => window.__rafCalls);
    assert.equal(after, before, "constraints poll nothing — idle means zero rAF");
  });

  await test("Canvas: a mutation burst settles into exactly one frame", async () => {
    const scheduled = await canvasR4.page.evaluate(async () => {
      const before = window.__rafCalls;
      window.__mutate(); // three writes: push + settle must coalesce
      await Promise.resolve(); // land after the settle microtask
      return window.__rafCalls - before;
    });
    assert.equal(scheduled, 1, "writes push, dependents settle, one frame paints it all");
  });

  // Mutate the remaining pages (the canvas page mutated in the test above),
  // let a frame paint, and re-shoot everything for the post-state checks.
  const shotAfter = async (shot, artifact) => {
    // A backgrounded tab throttles rAF; re-foreground before waiting a frame.
    await shot.page.bringToFront();
    await shot.page.evaluate(() => new Promise((done) => {
      requestAnimationFrame(() => requestAnimationFrame(done));
    }));
    const png = await shot.page.screenshot({ encoding: "base64" });
    await writeFile(path.join(artifactsDir, artifact), Buffer.from(png, "base64"));
    return png;
  };
  for (const shot of [domR4, domR4p, canvasR4p]) {
    await shot.page.evaluate(() => window.__mutate());
  }
  const domR4Post = await shotAfter(domR4, "r4-dom-post.png");
  const canvasR4Post = await shotAfter(canvasR4, "r4-canvas-post.png");
  const domR4pPost = await shotAfter(domR4p, "r4-dom-permuted-post.png");
  const canvasR4pPost = await shotAfter(canvasR4p, "r4-canvas-permuted-post.png");

  for (const [name, shot, png] of [["DOM", domR4, domR4Post], ["Canvas", canvasR4, canvasR4Post]]) {
    await test(`${name}: post-mutation pixels — the whole cascade landed`, async () => {
      const actual = await samplePixels(shot.page, png, R4_POST_PROBES.map((p) => p.at));
      R4_POST_PROBES.forEach((p, i) => assertColorNear(actual[i], p.color, `${name} ${p.label}`));
      const m = await r4Model(shot.page);
      assert.deepEqual(m.gold, [25, 50], "50% re-resolved to 50, re-centered at 25");
      assert.equal(m.text, "width 100", "the text constraint re-ran");
      assert.equal(m.textWidth, m.measured, "and its auto width re-measured");
    });
  }

  await test("cross-backend: the post-mutation scene agrees", async () => {
    const diff = await diffShots(canvasR4.page, domR4Post, canvasR4Post, { soft: R4_SOFT });
    assert.ok(!diff.sizeMismatch, `screenshot sizes differ: ${diff.sizeMismatch}`);
    assert.equal(diff.over, 0, `strict channels beyond tolerance: ${diff.over} (max delta ${diff.max})`);
  });

  await test("declaration order stays inert through the mutation cascade", async () => {
    for (const [name, page, straight, permuted] of [
      ["DOM", domR4.page, domR4Post, domR4pPost],
      ["Canvas", canvasR4.page, canvasR4Post, canvasR4pPost],
    ]) {
      const diff = await diffShots(page, straight, permuted, { tolerance: 0 });
      assert.ok(!diff.sizeMismatch, `${name}: sizes differ`);
      assert.equal(diff.over, 0, `${name}: permuted write order changed pixels (max delta ${diff.max})`);
    }
  });

  // ── R5: methods + events — REAL input, identical hits on both backends ───

  const R5_BG = [0x20, 0x24, 0x2c];
  const BUTTON = [0x26, 0x46, 0x53];
  const DECO = [0x3f, 0xa3, 0x4d];
  const STRIPE = [0x4f, 0xc3, 0xf7];
  const RIVAL = [0xe9, 0xc4, 0x6a];
  const UNDER = [0x6d, 0x59, 0x7a];

  // Initial geometry: button 20..140 × 16..64 (stripe = its bottom 6px,
  // 58..64); deco 28..132 × 40..56; rival 110..180 × 16..56 (over the
  // button's right); ghosts 20..50 / 50..80 × 16..40; under+clipTri share
  // 20..110 × 96..148, the triangle keeping only the upper-left half.
  const R5_PROBES = [
    { at: [5, 5], color: R5_BG, label: "app background" },
    { at: [60, 34], color: BUTTON, label: "button body" },
    { at: [60, 48], color: DECO, label: "decoration child" },
    { at: [60, 61], color: STRIPE, label: "draw(d) stripe — language-surface draw" },
    { at: [120, 30], color: RIVAL, label: "rival paints over the button (tree order)" },
    { at: [30, 28], color: BUTTON, label: "invisible ghost paints nothing" },
    { at: [65, 28], color: BUTTON, label: "opacity-0 ghost paints nothing" },
    { at: [35, 105], color: DECO, label: "clip triangle interior" },
    { at: [100, 140], color: UNDER, label: "under view through the clip cutout" },
    { at: [170, 61], color: R5_BG, label: "right of the 120-wide stripe" },
  ];

  // After the click sequence: the button took three clicks (through the
  // decoration and both ghosts) → width 168, stripe 20..188; the rival, the
  // triangle, and the under view each took exactly their own click.
  const R5_POST_PROBES = [
    { at: [150, 30], color: [0xe7, 0x6f, 0x51], label: "rival recolored by its own click" },
    { at: [183, 30], color: BUTTON, label: "button grew past the rival (width 168)" },
    { at: [183, 61], color: STRIPE, label: "stripe re-recorded at the grown width" },
    { at: [191, 61], color: R5_BG, label: "right of the grown stripe" },
    { at: [35, 105], color: [0x4f, 0xc3, 0xf7], label: "clip interior took its own click" },
    { at: [100, 140], color: [0x91, 0xc4, 0x99], label: "the clipped-away corner fell through" },
    { at: [60, 34], color: BUTTON, label: "button body unchanged" },
  ];

  // The two Text runs are the only mechanism-divergent regions in the scene.
  const R5_SOFT = [
    { x: 16, y: 66, w: 76, h: 26, label: "status text (DOM text vs fillText AA)" },
    { x: 146, y: 66, w: 66, h: 26, label: "ready text (DOM text vs fillText AA)" },
  ];

  // Every hit-semantics pin in one scripted sequence (identical on both
  // backends; each line names the semantics it drives):
  const R5_CLICKS = [
    [60, 48, "through the decoration → button"],
    [120, 30, "the overlap → topmost rival, never the button"],
    [35, 105, "inside the clip triangle → the clipped view"],
    [100, 140, "the clipped-away corner → falls through to under"],
    [30, 28, "over the invisible ghost → button"],
    [65, 28, "over the opacity-0 ghost → button"],
  ];

  const r5Model = (page) =>
    page.evaluate(() => {
      const c = window.__app.children;
      return {
        width: c[0].width,
        rival: c[1].fill,
        under: c[2].fill,
        tri: c[3].fill,
        status: c[6].text,
        ready: c[7].text,
      };
    });

  const domR5 = await renderShot("/dom-r5", 1, "r5-dom.png");
  const canvasR5 = await renderShot("/canvas-r5", 1, "r5-canvas.png");

  for (const [name, shot] of [["DOM", domR5], ["Canvas", canvasR5]]) {
    await test(`${name}: R5 initial probes + onInit ran before first paint`, async () => {
      const actual = await samplePixels(shot.page, shot.png, R5_PROBES.map((p) => p.at));
      R5_PROBES.forEach((p, i) => assertColorNear(actual[i], p.color, `${name} ${p.label}`));
      const m = await r5Model(shot.page);
      assert.equal(m.ready, "ready", "onInit stamped the ready text");
      assert.equal(m.status, "w120", "the status constraint sees the button width");
    });

    await test(`${name}: press here, release there — no click (the shared rule)`, async () => {
      // Down on the rival, drag, release over the button (via the deco):
      // mouseDown and mouseUp land on different views, so neither clicks.
      await shot.page.bringToFront();
      await shot.page.mouse.move(120, 30);
      await shot.page.mouse.down();
      await shot.page.mouse.move(60, 48);
      await shot.page.mouse.up();
      const m = await r5Model(shot.page);
      assert.equal(m.width, 120, "the button did not click");
      assert.equal(m.rival, 0xe9c46a, "the rival did not click");
    });
  }

  await test("cross-backend: the R5 initial scene agrees", async () => {
    const diff = await diffShots(canvasR5.page, domR5.png, canvasR5.png, { soft: R5_SOFT });
    assert.ok(!diff.sizeMismatch, `screenshot sizes differ: ${diff.sizeMismatch}`);
    assert.equal(diff.over, 0, `strict channels beyond tolerance: ${diff.over} (max delta ${diff.max})`);
    for (const s of diff.soft) {
      assert.ok(s.mean <= 3 && s.maxBlur <= 48, `${s.label}: mean ${s.mean}, max ${s.maxBlur}`);
    }
  });

  await test("Canvas: a click's whole handler cascade settles into one frame", async () => {
    // The first real click (through the decoration): the handler's write
    // fans out — width push, the status constraint re-runs + re-measures,
    // the draw member re-records — and all of it lands in ONE frame.
    await canvasR5.page.bringToFront();
    const before = await canvasR5.page.evaluate(() => window.__rafCalls);
    await canvasR5.page.mouse.click(R5_CLICKS[0][0], R5_CLICKS[0][1]);
    const [width, after] = await canvasR5.page.evaluate(async () => {
      await Promise.resolve(); // land after the settle microtask
      return [window.__app.children[0].width, window.__rafCalls];
    });
    assert.equal(width, 136, "the click landed through the decoration");
    assert.equal(after - before, 1, "one click, one settle, one frame");
  });

  await test("both backends: the click sequence drives the same handlers", async () => {
    await domR5.page.bringToFront();
    for (const [x, y] of R5_CLICKS) await domR5.page.mouse.click(x, y);
    await canvasR5.page.bringToFront();
    for (const [x, y] of R5_CLICKS.slice(1)) await canvasR5.page.mouse.click(x, y); // [0] ran in the frame pin
    const [domM, canvasM] = [await r5Model(domR5.page), await r5Model(canvasR5.page)];
    assert.deepEqual(domM, canvasM, "identical hit resolution → identical mutations");
    assert.deepEqual(domM, {
      width: 168, // three clicks reached the button — deco + both ghost overlays
      rival: 0xe76f51,
      under: 0x91c499,
      tri: 0x4fc3f7,
      status: "w168",
      ready: "ready", // the ghosts' BUG handlers never fired
    });
  });

  const domR5Post = await shotAfter(domR5, "r5-dom-post.png");
  const canvasR5Post = await shotAfter(canvasR5, "r5-canvas-post.png");

  for (const [name, shot, png] of [["DOM", domR5, domR5Post], ["Canvas", canvasR5, canvasR5Post]]) {
    await test(`${name}: post-click pixels — every handler's cascade landed`, async () => {
      const actual = await samplePixels(shot.page, png, R5_POST_PROBES.map((p) => p.at));
      R5_POST_PROBES.forEach((p, i) => assertColorNear(actual[i], p.color, `${name} ${p.label}`));
    });
  }

  await test("cross-backend: the post-click scene agrees", async () => {
    const diff = await diffShots(canvasR5.page, domR5Post, canvasR5Post, { soft: R5_SOFT });
    assert.ok(!diff.sizeMismatch, `screenshot sizes differ: ${diff.sizeMismatch}`);
    assert.equal(diff.over, 0, `strict channels beyond tolerance: ${diff.over} (max delta ${diff.max})`);
    for (const s of diff.soft) {
      assert.ok(s.mean <= 3 && s.maxBlur <= 48, `${s.label}: mean ${s.mean}, max ${s.maxBlur}`);
    }
  });

  await test("Canvas: the input machinery adds no polling — idle is still zero rAF", async () => {
    const before = await canvasR5.page.evaluate(() => window.__rafCalls);
    await new Promise((r) => setTimeout(r, 150));
    const after = await canvasR5.page.evaluate(() => window.__rafCalls);
    assert.equal(after, before);
  });

  // ── R6: user components + compile-time scope, resolved on the Node side ──

  const R6_BG = [0x20, 0x24, 0x2c];
  const TALLY = [0x26, 0x46, 0x53];
  const R6_BAR = [0x3f, 0xa3, 0x4d];
  const ACCENT_A = [0xe0, 0xb0, 0x40];
  const ACCENT_B = [0xc0, 0x50, 0x50];

  const R6_PROBES = [
    { at: [200, 152], color: R6_BG, label: "app background" },
    { at: [110, 30], color: TALLY, label: "a's body (class-body fill)" },
    { at: [30, 28], color: ACCENT_A, label: "a.hit — the class default accent, via a bare-name constraint" },
    { at: [30, 100], color: ACCENT_B, label: "b.hit — the instance's own accent value" },
    { at: [23, 54], color: R6_BAR, label: "a.bar stub (count 0 → width 6)" },
    { at: [40, 54], color: TALLY, label: "right of a.bar — count 0" },
    { at: [50, 128], color: R6_BAR, label: "b.bar (count 3 → width 42)" },
    { at: [70, 128], color: TALLY, label: "right of b.bar" },
  ];

  // After the clicks (a ×2, b ×1): a.bar width 30 (x 20..50), b.bar width 54
  // (x 20..74) — pixels that were body color turn bar green, per instance.
  const R6_POST_PROBES = [
    { at: [45, 54], color: R6_BAR, label: "a.bar grew to its own count (2)" },
    { at: [55, 54], color: TALLY, label: "…and no further" },
    { at: [70, 128], color: R6_BAR, label: "b.bar grew to its own count (4)" },
    { at: [80, 128], color: TALLY, label: "…and no further" },
    { at: [30, 28], color: ACCENT_A, label: "a.hit unchanged" },
  ];

  // The three Text runs are the scene's only mechanism-divergent regions.
  const R6_SOFT = [
    { x: 48, y: 14, w: 62, h: 26, label: "a.readout (DOM text vs fillText AA)" },
    { x: 48, y: 88, w: 62, h: 26, label: "b.readout (DOM text vs fillText AA)" },
    { x: 132, y: 8, w: 80, h: 26, label: "sum text (DOM text vs fillText AA)" },
  ];

  // a.hit twice, b.hit once — each handler must mutate ITS OWN classroot.
  const R6_CLICKS = [[30, 28], [30, 28], [30, 100]];

  // The model reads through named children — themselves R6 surface.
  const r6Model = (page) =>
    page.evaluate(() => {
      const app = window.__app;
      return { a: app.a.count, b: app.b.count, aText: app.a.readout.text, sum: app.sum.text };
    });

  const domR6 = await renderShot("/dom-r6", 1, "r6-dom.png");
  const canvasR6 = await renderShot("/canvas-r6", 1, "r6-canvas.png");

  for (const [name, shot] of [["DOM", domR6], ["Canvas", canvasR6]]) {
    await test(`${name}: R6 initial probes — two instances, two attribute sets, one class`, async () => {
      const actual = await samplePixels(shot.page, shot.png, R6_PROBES.map((p) => p.at));
      R6_PROBES.forEach((p, i) => assertColorNear(actual[i], p.color, `${name} ${p.label}`));
      assert.deepEqual(await r6Model(shot.page), { a: 0, b: 3, aText: "n0", sum: "sum 3" });
    });
  }

  await test("cross-backend: the R6 initial scene agrees", async () => {
    const diff = await diffShots(canvasR6.page, domR6.png, canvasR6.png, { soft: R6_SOFT });
    assert.ok(!diff.sizeMismatch, `screenshot sizes differ: ${diff.sizeMismatch}`);
    assert.equal(diff.over, 0, `strict channels beyond tolerance: ${diff.over} (max delta ${diff.max})`);
    for (const s of diff.soft) {
      assert.ok(s.mean <= 3 && s.maxBlur <= 48, `${s.label}: mean ${s.mean}, max ${s.maxBlur}`);
    }
  });

  await test("Canvas: one click through classroot — bar, readout, and sum land in one frame", async () => {
    await canvasR6.page.bringToFront();
    const before = await canvasR6.page.evaluate(() => window.__rafCalls);
    await canvasR6.page.mouse.click(R6_CLICKS[0][0], R6_CLICKS[0][1]);
    const [count, after] = await canvasR6.page.evaluate(async () => {
      await Promise.resolve(); // land after the settle microtask
      return [window.__app.a.count, window.__rafCalls];
    });
    assert.equal(count, 1, "the class handler mutated its classroot");
    assert.equal(after - before, 1, "one click, one settle, one frame — across two scopes");
  });

  await test("both backends: each handler mutates its OWN classroot", async () => {
    await domR6.page.bringToFront();
    for (const [x, y] of R6_CLICKS) await domR6.page.mouse.click(x, y);
    await canvasR6.page.bringToFront();
    for (const [x, y] of R6_CLICKS.slice(1)) await canvasR6.page.mouse.click(x, y); // [0] ran in the frame pin
    const [domM, canvasM] = [await r6Model(domR6.page), await r6Model(canvasR6.page)];
    assert.deepEqual(domM, canvasM, "identical hits, identical scope mutations");
    assert.deepEqual(domM, { a: 2, b: 4, aText: "n2", sum: "sum 6" });
  });

  const domR6Post = await shotAfter(domR6, "r6-dom-post.png");
  const canvasR6Post = await shotAfter(canvasR6, "r6-canvas-post.png");

  for (const [name, shot, png] of [["DOM", domR6, domR6Post], ["Canvas", canvasR6, canvasR6Post]]) {
    await test(`${name}: post-click pixels — per-instance bare-name constraints landed`, async () => {
      const actual = await samplePixels(shot.page, png, R6_POST_PROBES.map((p) => p.at));
      R6_POST_PROBES.forEach((p, i) => assertColorNear(actual[i], p.color, `${name} ${p.label}`));
    });
  }

  await test("cross-backend: the post-click R6 scene agrees", async () => {
    const diff = await diffShots(canvasR6.page, domR6Post, canvasR6Post, { soft: R6_SOFT });
    assert.ok(!diff.sizeMismatch, `screenshot sizes differ: ${diff.sizeMismatch}`);
    assert.equal(diff.over, 0, `strict channels beyond tolerance: ${diff.over} (max delta ${diff.max})`);
    for (const s of diff.soft) {
      assert.ok(s.mean <= 3 && s.maxBlur <= 48, `${s.label}: mean ${s.mean}, max ${s.maxBlur}`);
    }
  });

  await test("Canvas: user components add no polling — idle is still zero rAF", async () => {
    const before = await canvasR6.page.evaluate(() => window.__rafCalls);
    await new Promise((r) => setTimeout(r, 150));
    const after = await canvasR6.page.evaluate(() => window.__rafCalls);
    assert.equal(after, before);
  });

  // ── R7: layout — stacks over auto-size text, async images, user classes ──

  const R7_BG = [0x20, 0x24, 0x2c];
  const ROW = [0x26, 0x46, 0x53];
  const S1 = [0x6d, 0x59, 0x7a];
  const S2 = [0xe9, 0xc4, 0x6a];
  const S3 = [0x91, 0xc4, 0x99];

  // Positions here are pure layout math over literal sizes (see the program
  // comment); anything downstream of a *measured* size (tail, foot) is
  // asserted at the model level instead, so no probe bakes in font metrics.
  const R7_PROBES = [
    { at: [5, 155], color: R7_BG, label: "app background (left of the column)" },
    { at: [235, 5], color: R7_BG, label: "app background (top right)" },
    { at: [120, 20], color: ROW, label: "row a (stack head at 0)" },
    { at: [120, 35], color: R7_BG, label: "the 6px gap between a and b" },
    { at: [120, 50], color: ROW, label: "row b (a.height + spacing)" },
    { at: [16, 80], color: [255, 0, 0], label: "image left half — natural size arrived, stack re-flowed" },
    { at: [28, 80], color: [0, 0, 255], label: "image right half" },
    { at: [120, 100], color: ROW, label: "row c (below the loaded image)" },
    { at: [180, 20], color: S1, label: "strip s1" },
    { at: [180, 40], color: S2, label: "strip s2" },
    { at: [180, 60], color: S3, label: "strip s3" },
  ];

  // After __mutate (b→44, s2 hidden, strip spacing 4→12): everything under b
  // shifts +14; s3 reclaims s2's slot at the new spacing (18+12=30).
  const R7_POST_PROBES = [
    { at: [120, 70], color: ROW, label: "b grew through what was the gap" },
    { at: [16, 94], color: [255, 0, 0], label: "the image rode the shift (left half)" },
    { at: [28, 94], color: [0, 0, 255], label: "the image rode the shift (right half)" },
    { at: [120, 115], color: ROW, label: "row c shifted +14" },
    { at: [180, 20], color: S1, label: "s1 did not stir" },
    { at: [180, 45], color: S3, label: "s3 moved up into s2's reclaimed space (new spacing)" },
    { at: [180, 63], color: R7_BG, label: "…and s3's old slot is background" },
  ];

  // Mechanism-divergent regions: the caption runs (whose swatches ride the
  // measured text width — identical cross-backend, but inked as text) and
  // the auto-sized tail Text. Everything else — rows, image, strip — is
  // strict, including every laid position.
  const r7Soft = (post) => [
    { x: 12, y: 10, w: 70, h: 22, label: "a caption (DOM text vs fillText AA)" },
    { x: 12, y: 38, w: 70, h: post ? 44 : 30, label: "b caption" },
    { x: 12, y: post ? 106 : 92, w: 70, h: 22, label: "c caption" },
    { x: 12, y: post ? 130 : 116, w: 64, h: 24, label: "tail text" },
  ];

  // Model-level facts (identical on both backends): the image's natural size,
  // the measured-size links in the chain (tail after c, foot after tail), the
  // class-body x-layout riding the caption's auto width, and the strip.
  const r7Model = (page) =>
    page.evaluate(() => {
      const app = window.__app;
      const col = app.column;
      const c2d = document.createElement("canvas").getContext("2d");
      c2d.font = "12px Arial";
      return {
        children: col.children.length,
        pic: [col.pic.width, col.pic.height, col.pic.loaded],
        picY: col.pic.y,
        tailGap: col.tail.y - (col.c.y + col.c.height),
        footGap: col.foot.y - (col.tail.y + col.tail.height),
        tailHeight: col.tail.height,
        capWidth: col.a.cap.width,
        capMeasured: Math.ceil(c2d.measureText("alpha").width),
        swatchX: col.a.swatch.x,
        stripY: [app.strip.s1.y, app.strip.s2.y, app.strip.s3.y],
      };
    });

  const domR7 = await renderShot("/dom-r7", 1, "r7-dom.png");
  const canvasR7 = await renderShot("/canvas-r7", 1, "r7-canvas.png");

  for (const [name, shot] of [["DOM", domR7], ["Canvas", canvasR7]]) {
    await test(`${name}: R7 probes — two stacks, re-flowed around the loaded image`, async () => {
      const actual = await samplePixels(shot.page, shot.png, R7_PROBES.map((p) => p.at));
      R7_PROBES.forEach((p, i) => assertColorNear(actual[i], p.color, `${name} ${p.label}`));
    });

    await test(`${name}: R7 model — auto sizes drive the stack, not the other way round`, async () => {
      const m = await r7Model(shot.page);
      assert.equal(m.children, 6, "the layout member is an attribute, not a child");
      assert.deepEqual(m.pic, [20, 12, true], "natural size adopted");
      assert.equal(m.picY, 64, "the image sits after the literal-sized rows");
      assert.equal(m.tailGap, 6, "the auto-sized Text is IN the flow");
      assert.equal(m.footGap, 6, "…and the footer follows its measured height");
      assert.ok(m.tailHeight > 0, "the tail did auto-size");
      assert.equal(m.capWidth, m.capMeasured, "the caption auto-sized to its text");
      assert.equal(m.swatchX, m.capWidth + 4, "the class-body x-stack rode the measured width");
      assert.deepEqual(m.stripY, [0, 22, 44]);
    });
  }

  await test("cross-backend: the R7 laid-out scene agrees (strict outside the text runs)", async () => {
    const diff = await diffShots(canvasR7.page, domR7.png, canvasR7.png, { soft: r7Soft(false) });
    assert.ok(!diff.sizeMismatch, `screenshot sizes differ: ${diff.sizeMismatch}`);
    assert.equal(diff.over, 0, `strict channels beyond tolerance: ${diff.over} (max delta ${diff.max})`);
    for (const s of diff.soft) {
      assert.ok(s.mean <= 3 && s.maxBlur <= 48, `${s.label}: mean ${s.mean}, max ${s.maxBlur}`);
    }
  });

  await test("Canvas: a re-layout burst — grow, hide, re-space — settles into one frame", async () => {
    await canvasR7.page.bringToFront();
    const scheduled = await canvasR7.page.evaluate(async () => {
      const before = window.__rafCalls;
      window.__mutate();
      await Promise.resolve(); // land after the settle microtask
      return window.__rafCalls - before;
    });
    assert.equal(scheduled, 1, "three writes, one settle wave, one frame");
  });

  await domR7.page.evaluate(() => window.__mutate());
  const domR7Post = await shotAfter(domR7, "r7-dom-post.png");
  const canvasR7Post = await shotAfter(canvasR7, "r7-canvas-post.png");

  for (const [name, shot, png] of [["DOM", domR7, domR7Post], ["Canvas", canvasR7, canvasR7Post]]) {
    await test(`${name}: post-mutation pixels — the stacks re-flowed, space reclaimed`, async () => {
      const actual = await samplePixels(shot.page, png, R7_POST_PROBES.map((p) => p.at));
      R7_POST_PROBES.forEach((p, i) => assertColorNear(actual[i], p.color, `${name} ${p.label}`));
      const m = await r7Model(shot.page);
      assert.equal(m.picY, 78, "everything under the grown row shifted");
      assert.deepEqual(m.stripY, [0, 30, 30],
        "the hidden child's own in-flow slot and its successor's coincide — space reclaimed");
    });
  }

  await test("cross-backend: the post-mutation R7 scene agrees", async () => {
    const diff = await diffShots(canvasR7.page, domR7Post, canvasR7Post, { soft: r7Soft(true) });
    assert.ok(!diff.sizeMismatch, `screenshot sizes differ: ${diff.sizeMismatch}`);
    assert.equal(diff.over, 0, `strict channels beyond tolerance: ${diff.over} (max delta ${diff.max})`);
    for (const s of diff.soft) {
      assert.ok(s.mean <= 3 && s.maxBlur <= 48, `${s.label}: mean ${s.mean}, max ${s.maxBlur}`);
    }
  });

  await test("Canvas: laid-out trees add no polling — idle is still zero rAF", async () => {
    const before = await canvasR7.page.evaluate(() => window.__rafCalls);
    await new Promise((r) => setTimeout(r, 150));
    const after = await canvasR7.page.evaluate(() => window.__rafCalls);
    assert.equal(after, before);
  });

  // ── R8: data — a fetched, replicated, laid list; mutation in one frame ──

  const R8_BG = [0x20, 0x24, 0x2c];
  const R8_BAR = [0x4f, 0xc3, 0xf7];
  const R8_RED = [0xe7, 0x4c, 0x3c];
  const R8_YELLOW = [0xf1, 0xc4, 0x0f];
  const R8_GREEN = [0x2e, 0xcc, 0x71];
  const R8_PURPLE = [0x9b, 0x59, 0xb6];
  const R8_FOOT = [0x3f, 0xa3, 0x4d];

  // Rows at abs y 10/32/54 (h 18, spacing 4), foot at 76; swatches abs x
  // 12..22, bars abs x 26..26+w — all pure layout math over the FETCHED data.
  const R8_PROBES = [
    { at: [5, 5], color: R8_BG, label: "app background (top left)" },
    { at: [235, 155], color: R8_BG, label: "app background (bottom right)" },
    { at: [17, 19], color: R8_RED, label: "alpha's swatch — :c colored it" },
    { at: [30, 19], color: R8_BAR, label: "alpha's bar" },
    { at: [60, 19], color: R8_BAR, label: "alpha's bar interior (w=40 reaches 66)" },
    { at: [75, 19], color: R8_BG, label: "…and ends where :w says" },
    { at: [17, 41], color: R8_YELLOW, label: "beta's swatch" },
    { at: [90, 41], color: R8_BAR, label: "beta's bar (w=70 reaches 96)" },
    { at: [100, 41], color: R8_BG, label: "…and ends" },
    { at: [17, 63], color: R8_GREEN, label: "gamma's swatch" },
    { at: [78, 63], color: R8_BAR, label: "gamma's bar (w=55 reaches 81)" },
    { at: [85, 63], color: R8_BG, label: "…and ends" },
    { at: [60, 79], color: R8_FOOT, label: "the static foot, laid after the block" },
  ];

  // After __mutate (rename beta, insert delta w=25 purple, remove alpha):
  // rows are BETA/gamma/delta — same count, so the foot holds its place.
  const R8_POST_PROBES = [
    { at: [17, 19], color: R8_YELLOW, label: "beta moved up into the removed row's slot" },
    { at: [90, 19], color: R8_BAR, label: "beta's bar came with it" },
    { at: [17, 41], color: R8_GREEN, label: "gamma follows" },
    { at: [78, 41], color: R8_BAR, label: "gamma's bar" },
    { at: [85, 41], color: R8_BG, label: "…ends" },
    { at: [17, 63], color: R8_PURPLE, label: "the inserted delta's swatch" },
    { at: [45, 63], color: R8_BAR, label: "delta's bar (w=25)" },
    { at: [60, 63], color: R8_BG, label: "…ends" },
    { at: [60, 79], color: R8_FOOT, label: "the foot did not stir" },
  ];

  // The caption column is the one mechanism-divergent region (DOM text vs
  // fillText); every replicated position, bar, and swatch stays strict.
  const r8Soft = [{ x: 118, y: 10, w: 84, h: 64, label: "captions (DOM text vs fillText AA)" }];

  const r8Model = (page) =>
    page.evaluate(() => {
      const app = window.__app;
      const col = app.column;
      return {
        status: [app.src.idle, app.src.loading, app.src.loaded, app.src.failed],
        children: col.children.length,
        ys: col.children.map((c) => c.y),
        labels: col.children.slice(0, -1).map((r) => r.cap.text),
        widths: col.children.slice(0, -1).map((r) => r.bar.width),
        footLast: col.children[col.children.length - 1] === col.foot,
      };
    });

  const domR8 = await renderShot("/dom-r8", 1, "r8-dom.png");
  const canvasR8 = await renderShot("/canvas-r8", 1, "r8-canvas.png");

  for (const [name, shot] of [["DOM", domR8], ["Canvas", canvasR8]]) {
    await test(`${name}: R8 probes — the fetched data drew the list`, async () => {
      const actual = await samplePixels(shot.page, shot.png, R8_PROBES.map((p) => p.at));
      R8_PROBES.forEach((p, i) => assertColorNear(actual[i], p.color, `${name} ${p.label}`));
    });

    await test(`${name}: R8 model — lifecycle, replication, data order`, async () => {
      const m = await r8Model(shot.page);
      assert.deepEqual(m.status, [false, false, true, false], "the source is .loaded");
      assert.equal(m.children, 4, "three records + the static foot");
      assert.deepEqual(m.ys, [0, 22, 44, 66], "the arrangement re-armed over the replicated block");
      assert.deepEqual(m.labels, ["alpha", "beta", "gamma"], "instances take the data's order");
      assert.deepEqual(m.widths, [40, 70, 55]);
      assert.ok(m.footLast, "the block occupies the template's slot");
    });
  }

  await test("cross-backend: the R8 data scene agrees (strict outside the captions)", async () => {
    const diff = await diffShots(canvasR8.page, domR8.png, canvasR8.png, { soft: r8Soft });
    assert.ok(!diff.sizeMismatch, `screenshot sizes differ: ${diff.sizeMismatch}`);
    assert.equal(diff.over, 0, `strict channels beyond tolerance: ${diff.over} (max delta ${diff.max})`);
    for (const s of diff.soft) {
      assert.ok(s.mean <= 3 && s.maxBlur <= 48, `${s.label}: mean ${s.mean}, max ${s.maxBlur}`);
    }
  });

  await test("Canvas: a data burst — change, insert, remove — settles into one frame", async () => {
    await canvasR8.page.bringToFront();
    const scheduled = await canvasR8.page.evaluate(async () => {
      const before = window.__rafCalls;
      window.__mutate();
      await Promise.resolve(); // land after the settle microtask
      return window.__rafCalls - before;
    });
    assert.equal(scheduled, 1, "three edits, one reconcile, one frame");
  });

  await domR8.page.evaluate(() => window.__mutate());
  const domR8Post = await shotAfter(domR8, "r8-dom-post.png");
  const canvasR8Post = await shotAfter(canvasR8, "r8-canvas-post.png");

  for (const [name, shot, png] of [["DOM", domR8, domR8Post], ["Canvas", canvasR8, canvasR8Post]]) {
    await test(`${name}: post-mutation pixels — the block reconciled to the new data`, async () => {
      const actual = await samplePixels(shot.page, png, R8_POST_PROBES.map((p) => p.at));
      R8_POST_PROBES.forEach((p, i) => assertColorNear(actual[i], p.color, `${name} ${p.label}`));
      const m = await r8Model(shot.page);
      assert.deepEqual(m.labels, ["BETA", "gamma", "delta"], "rename + insert + remove all landed");
      assert.deepEqual(m.ys, [0, 22, 44, 66], "the stack re-armed");
    });
  }

  await test("cross-backend: the post-mutation R8 scene agrees", async () => {
    const diff = await diffShots(canvasR8.page, domR8Post, canvasR8Post, { soft: r8Soft });
    assert.ok(!diff.sizeMismatch, `screenshot sizes differ: ${diff.sizeMismatch}`);
    assert.equal(diff.over, 0, `strict channels beyond tolerance: ${diff.over} (max delta ${diff.max})`);
    for (const s of diff.soft) {
      assert.ok(s.mean <= 3 && s.maxBlur <= 48, `${s.label}: mean ${s.mean}, max ${s.maxBlur}`);
    }
  });

  await test("Canvas: a whole second ARRIVAL is one frame — and re-replicates", async () => {
    await canvasR8.page.bringToFront();
    const scheduled = await canvasR8.page.evaluate(() => window.__refetch());
    assert.equal(scheduled, 1, "value + status land in one settle, one frame");
    const m = await r8Model(canvasR8.page);
    assert.deepEqual(m.labels, ["one"], "the new payload replaced the block");
    assert.equal(m.children, 2, "one record + the foot");
    assert.deepEqual(m.ys, [0, 22]);
  });

  await test("Canvas: data-bound trees add no polling — idle is still zero rAF", async () => {
    const before = await canvasR8.page.evaluate(() => window.__rafCalls);
    await new Promise((r) => setTimeout(r, 150));
    const after = await canvasR8.page.evaluate(() => window.__rafCalls);
    assert.equal(after, before);
  });

  // ── Auto-extent: never-sized containers size to their children ──────────

  const R9_BG = [0x20, 0x24, 0x2c];
  const BOX = [0x26, 0x46, 0x53];
  const ECHO = [0x4f, 0xc3, 0xf7];
  const STACK = [0x6d, 0x59, 0x7a];

  // Every probe is pure literal math over the derived extents (see the
  // program comment) — nothing here bakes in a measured size.
  const R9_PROBES = [
    { at: [5, 5], color: R9_BG, label: "app background" },
    { at: [30, 30], color: [0x3f, 0xa3, 0x4d], label: "child a" },
    { at: [60, 58], color: [0xe9, 0xc4, 0x6a], label: "child b" },
    { at: [107, 16], color: BOX, label: "box interior reaches its derived right edge (110)" },
    { at: [114, 16], color: R9_BG, label: "…and stops there — width is 98, not more" },
    { at: [15, 61], color: BOX, label: "box interior reaches its derived bottom edge (64)" },
    { at: [15, 68], color: R9_BG, label: "…and stops there — height is 52" },
    { at: [140, 30], color: ECHO, label: "echo consumed the derived width (x = 130)" },
    { at: [140, 61], color: ECHO, label: "echo's height tracks the derived height" },
    { at: [140, 68], color: R9_BG, label: "…and ends with it" },
    { at: [40, 95], color: [0x91, 0xc4, 0x99], label: "laid s1" },
    { at: [30, 112], color: [0xc0, 0xc0, 0xc0], label: "s2 — 50% of the DERIVED stack width" },
    { at: [50, 112], color: STACK, label: "…so it ends at 47 (35px of 70), stack behind" },
    { at: [75, 112], color: STACK, label: "stack width = s1's 70, percent child excluded" },
    { at: [15, 122], color: R9_BG, label: "below the stack (derived height 28)" },
  ];

  // After __mutate (b hidden, s1 grown to 30): box = 68×28 (echo follows to
  // x=100, h=28), stack = 44 tall with s2 at local y 34.
  const R9_POST_PROBES = [
    { at: [60, 58], color: R9_BG, label: "b's old pixels are background — extent reclaimed" },
    { at: [75, 15], color: BOX, label: "box still reaches a's extent (80)" },
    { at: [85, 15], color: R9_BG, label: "…and no further (width 68)" },
    { at: [15, 45], color: R9_BG, label: "box bottom rose to 40" },
    { at: [110, 30], color: ECHO, label: "echo moved with the shrunk width (x = 100)" },
    { at: [110, 45], color: R9_BG, label: "echo's height shrank with the box" },
    { at: [140, 30], color: R9_BG, label: "echo's old slot is background" },
    { at: [40, 115], color: [0x91, 0xc4, 0x99], label: "s1 grew in place" },
    { at: [30, 128], color: [0xc0, 0xc0, 0xc0], label: "s2 rode the re-flow (y = 124)" },
    { at: [60, 128], color: STACK, label: "the stack's derived height followed (44)" },
  ];

  const r9Model = (page) =>
    page.evaluate(() => {
      const app = window.__app;
      return {
        box: [app.box.width, app.box.height],
        echo: [app.echo.x, app.echo.height],
        stack: [app.stack.width, app.stack.height],
        s2: [app.stack.s2.width, app.stack.s2.y],
      };
    });

  const domR9 = await renderShot("/dom-r9", 1, "r9-dom.png");
  const canvasR9 = await renderShot("/canvas-r9", 1, "r9-canvas.png");

  for (const [name, shot] of [["DOM", domR9], ["Canvas", canvasR9]]) {
    await test(`${name}: auto-extent probes — derived boxes, consumers, percent exclusion`, async () => {
      const actual = await samplePixels(shot.page, shot.png, R9_PROBES.map((p) => p.at));
      R9_PROBES.forEach((p, i) => assertColorNear(actual[i], p.color, `${name} ${p.label}`));
    });

    await test(`${name}: auto-extent model — extents, the echo, the excluded percent`, async () => {
      const m = await r9Model(shot.page);
      assert.deepEqual(m.box, [98, 52], "box derived from its children");
      assert.deepEqual(m.echo, [130, 52], "constraints consumed the derived slots");
      assert.deepEqual(m.stack, [70, 28], "stack: laid extent; percent child excluded from width");
      assert.deepEqual(m.s2, [35, 18], "the percent resolved against the derived width");
    });
  }

  await test("cross-backend: the auto-extent scene agrees STRICTLY (no soft regions)", async () => {
    const diff = await diffShots(canvasR9.page, domR9.png, canvasR9.png, {});
    assert.ok(!diff.sizeMismatch, `screenshot sizes differ: ${diff.sizeMismatch}`);
    assert.equal(diff.over, 0, `strict channels beyond tolerance: ${diff.over} (max delta ${diff.max})`);
  });

  await test("Canvas: an extent burst — hide + grow — settles into one frame", async () => {
    await canvasR9.page.bringToFront();
    const scheduled = await canvasR9.page.evaluate(async () => {
      const before = window.__rafCalls;
      window.__mutate();
      await Promise.resolve(); // land after the settle microtask
      return window.__rafCalls - before;
    });
    assert.equal(scheduled, 1, "two writes, one derive wave, one frame");
  });

  await domR9.page.evaluate(() => window.__mutate());
  const domR9Post = await shotAfter(domR9, "r9-dom-post.png");
  const canvasR9Post = await shotAfter(canvasR9, "r9-canvas-post.png");

  for (const [name, shot, png] of [["DOM", domR9, domR9Post], ["Canvas", canvasR9, canvasR9Post]]) {
    await test(`${name}: post-mutation pixels — extents reclaimed and re-grown`, async () => {
      const actual = await samplePixels(shot.page, png, R9_POST_PROBES.map((p) => p.at));
      R9_POST_PROBES.forEach((p, i) => assertColorNear(actual[i], p.color, `${name} ${p.label}`));
      const m = await r9Model(shot.page);
      assert.deepEqual(m.box, [68, 28], "the hidden child stopped counting");
      assert.deepEqual(m.echo, [100, 28], "the echo followed");
      assert.deepEqual(m.stack, [70, 44], "the stack re-derived around the grown child");
      assert.deepEqual(m.s2, [35, 34], "the percent width held; the laid position moved");
    });
  }

  await test("cross-backend: the post-mutation auto-extent scene agrees strictly", async () => {
    const diff = await diffShots(canvasR9.page, domR9Post, canvasR9Post, {});
    assert.ok(!diff.sizeMismatch, `screenshot sizes differ: ${diff.sizeMismatch}`);
    assert.equal(diff.over, 0, `strict channels beyond tolerance: ${diff.over} (max delta ${diff.max})`);
  });

  await test("Canvas: auto-extent adds no polling — idle is still zero rAF", async () => {
    const before = await canvasR9.page.evaluate(() => window.__rafCalls);
    await new Promise((r) => setTimeout(r, 150));
    const after = await canvasR9.page.evaluate(() => window.__rafCalls);
    assert.equal(after, before);
  });

  // ── Styling: prevailing + decoration + the stylesheet swap ───────────────

  const R10_BG = [0x20, 0x24, 0x2c];
  // #00000044 over the bg: 0x44/255 ≈ 0.2667 black over (32,36,44).
  const SHADOW_ON_BG = [23, 26, 32];
  // #FF000080 over the bg: 0x80/255 red over (32,36,44).
  const VEIL_ON_BG = [144, 18, 22];

  const R10_PROBES = [
    { at: [5, 5], color: R10_BG, label: "app background" },
    { at: [58, 32], color: [0xd8, 0xd8, 0xd8], label: "chip1 gradient midpoint (entry fill)" },
    { at: [58, 17], color: [0xb0, 0xb0, 0xb0], label: "chip1 inside stroke (entry)" },
    { at: [16, 16], color: R10_BG, label: "chip1 rounded corner — paint only, bg outside" },
    { at: [58, 59], color: [0x3f, 0xa3, 0x4d], label: "chip2 ring stroke (bundle outranks the entry)" },
    { at: [58, 74], color: [0xd8, 0xd8, 0xd8], label: "chip2 gradient (the entry field fell through)" },
    { at: [13, 71], color: [0xff, 0x00, 0xff], label: "a child OVERFLOWS the rounded box — cornerRadius paints, never clips (the lean)" },
    { at: [160, 30], color: [0xe9, 0xc4, 0x6a], label: "panel = { theme.accent } (Base token)" },
    { at: [160, 92], color: [0xff, 0xff, 0xff], label: "shadow box interior" },
    { at: [190, 95], color: SHADOW_ON_BG, label: "the translucent drop shadow strip" },
    { at: [210, 130], color: VEIL_ON_BG, label: "the #RRGGBBAA translucent fill" },
  ];

  const R10_POST_PROBES = [
    { at: [58, 32], color: [0x33, 0x33, 0x33], label: "chip1 reskinned solid (Dark entry)" },
    { at: [58, 17], color: [0x77, 0x77, 0x77], label: "chip1 stroke reskinned" },
    { at: [58, 59], color: [0x3f, 0xa3, 0x4d], label: "chip2 ring STAYS (bundle still outranks)" },
    { at: [58, 74], color: [0x33, 0x33, 0x33], label: "chip2 fill reskinned" },
    { at: [13, 71], color: [0xff, 0x00, 0xff], label: "the overflowing child still paints (radius never clips)" },
    { at: [160, 30], color: [0x4f, 0xc3, 0xf7], label: "panel re-read the accent token" },
    { at: [160, 92], color: [0xff, 0xff, 0xff], label: "shadow box untouched by the swap" },
    { at: [190, 95], color: SHADOW_ON_BG, label: "…and its shadow untouched" },
    { at: [210, 130], color: VEIL_ON_BG, label: "…and the veil untouched" },
  ];

  // Soft (AA-tolerant, blur-compared) regions. Two sources of legitimate
  // cross-backend AA divergence, both the SAME class — one rasterizer's
  // anti-aliasing vs another's, not different content:
  //   1. the two text runs (native DOM text vs canvas fillText), and
  //   2. rounded-box corners — the DOM backend now paints cornerRadius with CSS
  //      border-radius (a composited div) rather than rasterizing the box into a
  //      per-view canvas. That canvas re-rasterized on every resize, which
  //      capped the zoom's frame rate (GPU command-buffer backpressure); the CSS
  //      div resizes for free. border-radius corner AA differs from the Canvas
  //      backend's path AA by a few pixels per corner (≤~83/255) — invisible,
  //      and interiors/strokes stay pinned by the strict probes above.
  const r10Soft = [
    { x: 14, y: 100, w: 84, h: 26, label: "label (+1px textShadow)" },
    { x: 14, y: 126, w: 116, h: 20, label: "sub caption" },
    { x: 13, y: 13, w: 90, h: 38, label: "chip1 rounded corners (CSS radius vs path AA)" },
    { x: 13, y: 55, w: 90, h: 38, label: "chip2 rounded corners" },
    { x: 129, y: 73, w: 62, h: 38, label: "shadowBox rounded corners" },
  ];

  const domR10 = await renderShot("/dom-r10", 1, "r10-dom.png");
  const canvasR10 = await renderShot("/canvas-r10", 1, "r10-canvas.png");

  for (const [name, shot] of [["DOM", domR10], ["Canvas", canvasR10]]) {
    await test(`${name}: styling probes — entries, bundle, tokens, decoration, alpha`, async () => {
      const actual = await samplePixels(shot.page, shot.png, R10_PROBES.map((p) => p.at));
      R10_PROBES.forEach((p, i) => assertColorNear(actual[i], p.color, `${name} ${p.label}`));
    });
  }

  await test("both backends: prevailing text style + the entry-over-follow rank (model)", async () => {
    for (const shot of [domR10, canvasR10]) {
      const m = await shot.page.evaluate(() => {
        const app = window.__app;
        return {
          labelColor: app.label.textColor,
          labelFamily: app.label.fontFamily,
          subSize: app.sub.fontSize,
          chipRadius: app.chip1.cornerRadius,
        };
      });
      assert.equal(m.labelColor, 0xffe28a, "label follows the App's textColor (no entry names it yet)");
      assert.equal(m.labelFamily, "Arial", "fontFamily follows the App");
      assert.equal(m.subSize, 11, "a local set wins");
      assert.equal(m.chipRadius, 6, "the class-body { theme.radius } read the Base token");
    }
  });

  await test("cross-backend: the styled scene agrees (strict outside the two text runs)", async () => {
    const diff = await diffShots(canvasR10.page, domR10.png, canvasR10.png, { soft: r10Soft });
    assert.ok(!diff.sizeMismatch, `screenshot sizes differ: ${diff.sizeMismatch}`);
    assert.equal(diff.over, 0, `strict channels beyond tolerance: ${diff.over} (max delta ${diff.max})`);
    for (const s of diff.soft) {
      assert.ok(s.mean <= 3 && s.maxBlur <= 48, `${s.label}: mean ${s.mean}, max ${s.maxBlur}`);
    }
  });

  await test("Canvas: the stylesheet swap re-skins in exactly one frame", async () => {
    await canvasR10.page.bringToFront();
    const scheduled = await canvasR10.page.evaluate(() => window.__restyle());
    assert.equal(scheduled, 1, "one write to the prevailing slot, one settle, one frame");
  });

  await domR10.page.evaluate(() => window.__restyle());
  const domR10Post = await shotAfter(domR10, "r10-dom-post.png");
  const canvasR10Post = await shotAfter(canvasR10, "r10-canvas-post.png");

  for (const [name, shot, png] of [["DOM", domR10, domR10Post], ["Canvas", canvasR10, canvasR10Post]]) {
    await test(`${name}: post-swap pixels — reskinned, precedence held, bystanders untouched`, async () => {
      const actual = await samplePixels(shot.page, png, R10_POST_PROBES.map((p) => p.at));
      R10_POST_PROBES.forEach((p, i) => assertColorNear(actual[i], p.color, `${name} ${p.label}`));
      const label = await shot.page.evaluate(() => window.__app.label.textColor);
      assert.equal(label, 0xcad0ec, "the Text entry outranks the prevailing follow (rank 3 > 2)");
    });
  }

  await test("cross-backend: the post-swap scene agrees (strict outside the text runs)", async () => {
    const diff = await diffShots(canvasR10.page, domR10Post, canvasR10Post, { soft: r10Soft });
    assert.ok(!diff.sizeMismatch, `screenshot sizes differ: ${diff.sizeMismatch}`);
    assert.equal(diff.over, 0, `strict channels beyond tolerance: ${diff.over} (max delta ${diff.max})`);
  });

  await test("Canvas: a skinned tree adds no polling — idle is still zero rAF", async () => {
    const before = await canvasR10.page.evaluate(() => window.__rafCalls);
    await new Promise((r) => setTimeout(r, 150));
    const after = await canvasR10.page.evaluate(() => window.__rafCalls);
    assert.equal(after, before);
  });

  // ── Animation v1 (A1a): an Animator drives a view's numeric slot on the
  // real rAF clock, moving every frame and landing exactly on `to`; a
  // downstream constraint follows every intermediate value (model-space); the
  // clock then goes idle (idle-zero). Both backends, cross-checked. ──────────
  const animDom = await renderShot("/dom-anim", 1, "anim-dom.png");
  const animCanvas = await renderShot("/canvas-anim", 1, "anim-canvas.png");

  for (const [name, shot, artifact] of [
    ["DOM", animDom, "anim-dom-final.png"],
    ["Canvas", animCanvas, "anim-canvas-final.png"],
  ]) {
    await test(`${name}: an Animator slides x 20→140 — moving every frame, landing exactly, follower tracking`, async () => {
      await shot.page.bringToFront(); // a backgrounded tab throttles rAF
      const { vals, from, to, followX } = await shot.page.evaluate(() => window.__runAnim());
      assert.equal(from, 20);
      assert.equal(to, 140);
      assert.ok(vals.length >= 8, `a real multi-frame animation (got ${vals.length} frames)`);
      assert.equal(vals[0], from, "the first frame anchors at from (t = 0)");
      assert.equal(vals[vals.length - 1], to, "lands exactly on to");
      for (let i = 1; i < vals.length; i++) {
        assert.ok(vals[i] >= vals[i - 1] - 1e-6, `monotone through the run (frame ${i})`);
      }
      assert.ok(
        vals.some((v) => v > from + 2 && v < to - 2),
        `strictly-intermediate values (moved through, not one jump): ${vals.slice(0, 6).join(", ")}…`
      );
      assert.equal(followX, to, "a downstream constraint tracked the animated slot every frame (model-space §2.1)");

      const png = await shot.page.screenshot({ encoding: "base64" });
      await writeFile(path.join(artifactsDir, artifact), Buffer.from(png, "base64"));
      const [boxEnd, boxStart, followEnd] = await samplePixels(shot.page, png, [
        [150, 80], // inside the box at its landed x=140 (spans 140..180)
        [30, 80], // the box's start position — now background
        [150, 130], // inside the follower, which tracked to x=140
      ]);
      assertColorNear(boxEnd, [0x4f, 0xc3, 0xf7], `${name} box landed at x=140`);
      assertColorNear(boxStart, [0x20, 0x24, 0x2c], `${name} box vacated its start position (now app background)`);
      assertColorNear(followEnd, [0xe9, 0xc4, 0x6a], `${name} follower tracked to x=140`);
    });
  }

  await test("both backends: the clock goes idle after the animation completes (idle-zero)", async () => {
    for (const shot of [animDom, animCanvas]) {
      await shot.page.bringToFront();
      await new Promise((r) => setTimeout(r, 200)); // let the final frame paint and settle
      const before = await shot.page.evaluate(() => window.__rafCalls);
      await new Promise((r) => setTimeout(r, 250));
      const after = await shot.page.evaluate(() => window.__rafCalls);
      assert.equal(after, before, "no requestAnimationFrame once the last animator finished");
    }
  });

  await test("cross-backend: the final animated frame agrees pixel-for-pixel", async () => {
    const domPng = await animDom.page.screenshot({ encoding: "base64" });
    const canvasPng = await animCanvas.page.screenshot({ encoding: "base64" });
    const diff = await diffShots(animCanvas.page, domPng, canvasPng);
    assert.ok(!diff.sizeMismatch, `screenshot sizes differ: ${diff.sizeMismatch}`);
    assert.equal(diff.over, 0, `channels beyond tolerance: ${diff.over} (max delta ${diff.max})`);
  });

  // ── Animation v1 (A2): the additive core + exact-landing ledger — TWO
  // animators compose on ONE real slot (box.x), summing their deltas to land on
  // the composed sum exactly, a downstream constraint tracking every composed
  // frame; the clock goes idle after. Both backends, cross-checked. ──────────
  const anim2Dom = await renderShot("/dom-anim2", 1, "anim2-dom.png");
  const anim2Canvas = await renderShot("/canvas-anim2", 1, "anim2-canvas.png");

  for (const [name, shot, artifact] of [
    ["DOM", anim2Dom, "anim2-dom-final.png"],
    ["Canvas", anim2Canvas, "anim2-canvas-final.png"],
  ]) {
    await test(`${name}: two animators COMPOSE on box.x (20 → 140 = +80 +40), landing exactly, follower tracking`, async () => {
      await shot.page.bringToFront(); // a backgrounded tab throttles rAF
      const { vals, from, to, followX } = await shot.page.evaluate(() => window.__runAnim2());
      assert.equal(from, 20);
      assert.equal(to, 140, "the composed sum of both deltas (+80 and +40), not either alone (100 / 60)");
      assert.ok(vals.length >= 8, `a real multi-frame animation (got ${vals.length} frames)`);
      assert.equal(vals[0], from, "the first frame anchors at from (t = 0)");
      assert.equal(vals[vals.length - 1], to, "lands EXACTLY on the composed sum (the ledger's expected end, no drift)");
      for (let i = 1; i < vals.length; i++) {
        assert.ok(vals[i] >= vals[i - 1] - 1e-6, `monotone through the run (frame ${i})`);
      }
      assert.ok(
        vals.some((v) => v > from + 2 && v < to - 2),
        `strictly-intermediate values (composed motion, not one jump): ${vals.slice(0, 6).join(", ")}…`
      );
      assert.equal(followX, to, "a downstream constraint tracked the composed slot every frame (model-space §2.1)");

      const png = await shot.page.screenshot({ encoding: "base64" });
      await writeFile(path.join(artifactsDir, artifact), Buffer.from(png, "base64"));
      const [boxEnd, boxStart, followEnd] = await samplePixels(shot.page, png, [
        [150, 80], // inside the box at its composed landing x=140 (spans 140..180)
        [30, 80], // the box's start position — now background
        [150, 130], // inside the follower, which tracked to x=140
      ]);
      assertColorNear(boxEnd, [0x4f, 0xc3, 0xf7], `${name} box landed at the composed x=140`);
      assertColorNear(boxStart, [0x20, 0x24, 0x2c], `${name} box vacated its start position (now app background)`);
      assertColorNear(followEnd, [0xe9, 0xc4, 0x6a], `${name} follower tracked to x=140`);
    });
  }

  await test("A2 both backends: the clock goes idle after the composed animation completes (idle-zero)", async () => {
    for (const shot of [anim2Dom, anim2Canvas]) {
      await shot.page.bringToFront();
      await new Promise((r) => setTimeout(r, 200)); // let the final frame paint and settle
      const before = await shot.page.evaluate(() => window.__rafCalls);
      await new Promise((r) => setTimeout(r, 250));
      const after = await shot.page.evaluate(() => window.__rafCalls);
      assert.equal(after, before, "no requestAnimationFrame once both composing animators finished");
    }
  });

  await test("A2 cross-backend: the final composed frame agrees pixel-for-pixel", async () => {
    const domPng = await anim2Dom.page.screenshot({ encoding: "base64" });
    const canvasPng = await anim2Canvas.page.screenshot({ encoding: "base64" });
    const diff = await diffShots(anim2Canvas.page, domPng, canvasPng);
    assert.ok(!diff.sizeMismatch, `screenshot sizes differ: ${diff.sizeMismatch}`);
    assert.equal(diff.over, 0, `channels beyond tolerance: ${diff.over} (max delta ${diff.max})`);
  });
} finally {
  await browser.close();
  server.close();
}

summarize("perceptual");
