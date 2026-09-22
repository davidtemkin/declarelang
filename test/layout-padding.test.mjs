// test/layout-padding.test.mjs — padding on the VIEW, per-side borders, and the
// two library surfaces built on them (Card, Divider).
//
// THE CONTENT BOX BELONGS TO THE VIEW (ruled 2026-09-19, moving `padding` off
// the `Layout` base it shipped on that morning). A view with padding has an
// *inside*; a layout merely arranges within it; and `x = 0` / `y = 0` mean the
// content origin for EVERY child — laid, self-placing, or `ignoreLayout` —
// with no CSS-style split where an absolutely-positioned child ignores the
// inset. So the claims pinned below are, in order:
//
//   - the ORIGIN SHIFT is uniform (laid, self-placing, ignoreLayout alike) and
//     lives in the parent's own coordinate space, so it scales and rotates
//     with the parent through the same walks transforms already ride;
//   - a PERCENT resolves against the content box, while `{ parent.width }`
//     keeps meaning the parent's literal box — the deliberate escape hatch a
//     child pairs with a negative `x` to reach the edge;
//   - AUTO-EXTENT counts both insets, on both axes, and so does a SCROLLER's
//     content extent — a padded scroller must stop the full bottom inset after
//     its last child, which is the thing CSS got wrong for a decade;
//   - the LIBRARY's three strategies obey it without naming it, exercised
//     through their public behavior (where children land, where a flow wraps,
//     what a share divides) rather than through the accessor;
//   - and padding `0` is byte-identical to no padding, which is what lets all
//     of this land in a corpus that asked for none of it.
//
// The other half of the file is the per-side `stroke`. It is painted in two
// different vocabularies — four `inset` box-shadows on the DOM, four clipped
// evenodd fills on the canvas — for the same geometry, so both are pinned here
// side by side: a side's band is the box MINUS a copy of itself shifted in from
// that edge, which is what makes a rounded card's top rule taper into the
// corner on both backends instead of butting a straight line into the arc.

import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate } from "../runtime/dist/instantiate.js";
import { HeadlessBackend, provideMeasurer, settle } from "../runtime/dist/index.js";
import { approximateMeasurer } from "../compiler/dist/headless.js";

provideMeasurer(approximateMeasurer());

async function boot(src) {
  const b = await compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  const app = instantiate(b.program);
  settle();
  return app;
}

/** Every laid child's box, as the geometry a padding claim is about. */
const geom = (v) => v.children.filter((c) => c.width !== undefined && c.x !== undefined)
  .map((c) => ({ x: c.x, y: c.y, w: c.width, h: c.height, vis: c.visible }));
// ── The view: one number, four numbers, and which side is which ────────────

await test("padding: one number insets all four sides, and x = 0 means the inside", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    col: View [ x = 10, y = 10, width = 200, height = 200, padding = 16,
      layout: SimpleLayout [ axis = y, spacing = 6 ],
      a: View [ width = 60, height = 20 ],
      b: View [ width = 40, height = 30 ],
    ],
  ]`);
  // The SLOTS are content coordinates: the run starts at the content origin,
  // which IS zero. Nothing in the kernel offsets a box any more.
  assert.deepEqual([app.col.a.x, app.col.a.y], [0, 0], "the first child is at the content origin — and that is 0");
  assert.deepEqual([app.col.b.x, app.col.b.y], [0, 26], "…and the run continues from there (20 + 6)");
  // …and the content origin is where the inset puts it, through the same walk
  // every transform rides (rootOrigin → interaction.ts rootTransform).
  assert.deepEqual(app.col.a.rootOrigin(), { x: 10 + 16, y: 10 + 16 }, "…which sits a full inset inside the view");
  assert.deepEqual(app.col.b.rootOrigin(), { x: 10 + 16, y: 10 + 16 + 26 });
  assert.equal(app.col.contentWidth, 16 + 60 + 16, "the content extent counts both insets");
  assert.equal(app.col.contentHeight, 16 + 20 + 6 + 30 + 16);
});

await test("padding: four numbers are [top, right, bottom, left], clockwise from the top", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    col: View [ width = 200, height = 200, padding = [ 8, 12, 16, 20 ],
      layout: SimpleLayout [ axis = y, spacing = 0 ],
      a: View [ width = 50, height = 30 ],
    ],
  ]`);
  assert.deepEqual(app.col.a.rootOrigin(), { x: 20, y: 8 }, "left and top — the leading pair");
  assert.equal(app.col.contentWidth, 20 + 50 + 12, "right — visible in what the container needs");
  assert.equal(app.col.contentHeight, 8 + 30 + 16, "bottom — likewise");
  assert.equal(app.col.contentBox("width"), 200 - 20 - 12, "and the room between them is the content box");
  assert.equal(app.col.contentBox("height"), 200 - 8 - 16);
});

await test("padding is reactive: writing it moves the inside, not the slots", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    col: View [ width = 200, height = 200, padding = 4,
      layout: SimpleLayout [ axis = y, spacing = 0 ],
      a: View [ width = 50, height = 30 ],
    ],
  ]`);
  assert.deepEqual(app.col.a.rootOrigin(), { x: 4, y: 4 });
  app.col.padding = [12, 0, 0, 24];
  settle();
  assert.deepEqual([app.col.a.x, app.col.a.y], [0, 0], "the child never moved — it is at the content origin, as it always was");
  assert.deepEqual(app.col.a.rootOrigin(), { x: 24, y: 12 }, "…and the content origin moved");
  app.col.padding = 0;
  settle();
  assert.deepEqual(app.col.a.rootOrigin(), { x: 0, y: 0 }, "and back to nothing");
});

await test("padding 0 places exactly as no padding does — the default-0 claim", async () => {
  const TREE = (pad) => `App [ width = 400, height = 300,
    col: View [ width = 220, height = 200${pad},
      layout: SimpleLayout [ axis = y, spacing = 7, align = center ],
      a: View [ width = 60, height = 20 ],
      b: View [ width = 100, height = 24 ],
      c: View [ width = 40, height = 12, visible = false ],
      d: View [ width = 80, height = 18 ],
    ],
  ]`;
  const origins = (col) => col.children.filter((c) => c.rootOrigin !== undefined).map((c) => c.rootOrigin());
  const bareApp = await boot(TREE(""));
  const bare = geom(bareApp.col);
  const bareO = origins(bareApp.col);
  for (const pad of [", padding = 0", ", padding = [ 0, 0, 0, 0 ]"]) {
    const app = await boot(TREE(pad));
    assert.deepEqual(geom(app.col), bare, `${pad} is the tree that never mentioned it`);
    assert.deepEqual(origins(app.col), bareO, "…realized in exactly the same places");
    assert.equal(app.col.a.positionLead("x"), 0, "…and the seam is handed the very same number");
    assert.equal(app.col.a.positionLead("y"), 0);
  }
});

await test("padding 0 is identity even on a degenerate box — the content box does not sanitize", async () => {
  // Found by diffing the corpus: a collapsed, invisible row can carry a
  // NEGATIVE width, and `x = center` under it resolves against that number.
  // `contentBox` therefore floors only when an inset is actually taken — the
  // floor guards the inset, not the author — so an unpadded view answers with
  // its extent exactly as written and nothing in a padding-free tree moves.
  const app = await boot(`App [ width = 400, height = 300,
    gone: View [ width = -100, height = -40, visible = false,
      m: View [ x = center, y = center, width = 0, height = 0 ],
    ],
    pad: View [ width = -100, height = -40, padding = 10, visible = false,
      n: View [ x = center, width = 0, height = 0 ],
    ],
  ]`);
  assert.equal(app.gone.m.x, -50, "unpadded: the arithmetic the author wrote, sign and all");
  assert.equal(app.gone.contentBox("width"), -100);
  assert.equal(app.pad.contentBox("width"), 0, "…and an inset deeper than the box floors at 0");
  assert.equal(app.pad.n.x, 0);
});

// ── Every child shifts: laid, self-placing, ignoreLayout ───────────────────

await test("padding: an ignoreLayout child's origin is the content origin too", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    box: View [ x = 5, y = 5, width = 200, height = 200, padding = 12,
      layout: SimpleLayout [ axis = y, spacing = 0 ],
      laid: View [ width = 10, height = 10 ],
      free: View [ ignoreLayout = true, x = 0, y = 0, width = 10, height = 10 ],
      self: View [ ignoreLayout = true, x = 30, y = 40, width = 10, height = 10 ],
    ],
  ]`);
  assert.deepEqual(app.box.free.rootOrigin(), app.box.laid.rootOrigin(),
    "no CSS-style split: the opted-out child starts where the laid one does");
  assert.deepEqual(app.box.free.rootOrigin(), { x: 5 + 12, y: 5 + 12 });
  assert.deepEqual(app.box.self.rootOrigin(), { x: 5 + 12 + 30, y: 5 + 12 + 40 },
    "…and a child that places itself is placed IN the content box");
});

await test("padding: the hit walk descends into the content box", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    box: View [ x = 0, y = 0, width = 200, height = 200, padding = 20, fill = #EEEEEE,
      a: View [ x = 0, y = 0, width = 40, height = 40, fill = #FF0000 ],
    ],
  ]`);
  assert.equal(app.viewAt(25, 25), app.box.a, "a point a little past the inset is the child");
  assert.equal(app.viewAt(10, 10), app.box, "…and a point inside the inset is the parent itself");
  assert.equal(app.viewAt(62, 62), app.box, "…as is one past the child's far edge");
});

// ── The transform: the inset is geometry in the parent's own space ─────────

await test("padding under scale: the inset scales with the parent", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    box: View [ x = 30, y = 40, width = 100, height = 100, padding = 16,
      scale = 2, pivotX = 0, pivotY = 0, fill = #EEEEEE,
      a: View [ x = 0, y = 0, width = 10, height = 10, fill = #FF0000 ],
    ],
  ]`);
  assert.deepEqual(app.box.a.rootOrigin(), { x: 30 + 32, y: 40 + 32 },
    "the 16 lives in the parent's coordinates, so at scale 2 it reads 32 on screen");
  assert.equal(app.viewAt(30 + 33, 40 + 33), app.box.a, "and the hit walk agrees with the paint");
  assert.equal(app.viewAt(30 + 20, 40 + 20), app.box, "…the inset itself is still the parent");
});

await test("padding under rotation: the inset turns with the parent", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    box: View [ x = 100, y = 100, width = 100, height = 100, padding = 16,
      rotation = 90, pivotX = 0, pivotY = 0, fill = #EEEEEE,
      a: View [ x = 0, y = 0, width = 10, height = 10, fill = #FF0000 ],
    ],
  ]`);
  // (16, 16) turned a quarter turn clockwise about the origin is (-16, 16)
  const o = app.box.a.rootOrigin();
  assert.ok(Math.abs(o.x - (100 - 16)) < 1e-9 && Math.abs(o.y - (100 + 16)) < 1e-9,
    `the content origin rode the rotation, got ${JSON.stringify(o)}`);
  assert.equal(app.viewAt(100 - 18, 100 + 18), app.box.a, "and the hit walk inverts the same composition");
});

// ── Percent resolves against the content box; { parent.width } does not ────

await test("percent: 100% is the CONTENT box, and so is every other percent", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    card: View [ x = 10, y = 20, width = 200, height = 120, padding = [ 0, 30, 0, 10 ],
      full: View [ width = 100%, height = 10 ],
      half: View [ width = 50%, height = 10 ],
      tall: View [ height = 100%, width = 10 ],
    ],
  ]`);
  assert.equal(app.card.full.width, 160, "200 − 10 − 30 — the room the child is given");
  assert.equal(app.card.half.width, 80, "…and a half of it");
  assert.equal(app.card.tall.height, 120, "an unpadded axis is unchanged");
});

await test("{ parent.width } keeps meaning the parent's literal box — the escape hatch", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    card: View [ x = 10, y = 20, width = 200, height = 120, padding = 16,
      band: View [ x = -16, width = { parent.width }, height = 10 ],
      inner: View [ width = 100%, height = 10 ],
    ],
  ]`);
  assert.equal(app.card.band.width, 200, "the parent's own width, padding and all");
  assert.equal(app.card.inner.width, 200 - 32, "…where the percent answers the other question");
  assert.equal(app.card.band.rootOrigin().x, 10, "and the negative x reaches the view's own edge");
});

// ── The cross axis: the alignment band is the content box ──────────────────

await test("SimpleLayout: align = center bands inside the padding, not the view", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    col: View [ width = 200, height = 200, padding = [ 10, 30, 10, 20 ],
      layout: SimpleLayout [ axis = y, spacing = 0, align = center ],
      a: View [ width = 50, height = 30 ],
    ],
  ]`);
  // band = 200 − 20 − 30 = 150; centred 50 → 50 into the content box
  assert.equal(app.col.a.x, 50);
  assert.deepEqual(app.col.a.rootOrigin(), { x: 20 + 50, y: 10 }, "…which is 70 from the view's own edge");
});

await test("SimpleLayout: align = end lands on the content box's far edge", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    col: View [ width = 200, height = 200, padding = 16,
      layout: SimpleLayout [ axis = y, spacing = 0, align = end ],
      a: View [ width = 50, height = 30 ],
    ],
  ]`);
  assert.equal(app.col.a.x, 200 - 32 - 50, "the far edge of the room, in content coordinates");
  assert.equal(app.col.a.rootOrigin().x, 16 + (200 - 32 - 50), "…the inset in from the view's edge");
});

await test("SimpleLayout: align = none leaves the slot alone — and the inset still lands", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    col: View [ width = 200, height = 200, padding = 16,
      layout: SimpleLayout [ axis = y, spacing = 0 ],
      a: View [ width = 50, height = 30 ],
    ],
  ]`);
  // The old `Layout.padding` needed `align = start` for the horizontal half to
  // reach a child at all. It is the VIEW's now, so a layout that owns no cross
  // axis changes nothing about where the inside begins — which is why Card's
  // `align = start` could go.
  assert.equal(app.col.a.x, 0, "the layout never touched x");
  assert.equal(app.col.a.rootOrigin().x, 16, "…and the child is inset anyway");
});

await test("SimpleLayout: a Spacer divides the content box, not the view", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    row: View [ width = 200, height = 60, padding = [ 0, 20, 0, 10 ],
      layout: SimpleLayout [ axis = x, spacing = 0 ],
      a: View [ width = 40, height = 20 ],
      s: Spacer [ ],
      b: View [ width = 30, height = 20 ],
    ],
  ]`);
  // room = 200 − 30 = 170; slack = 170 − 70 = 100
  assert.equal(app.row.s.width, 100);
  assert.equal(app.row.b.x, 40 + 100, "the run ends on the trailing inset");
  assert.equal(app.row.b.rootOrigin().x, 10 + 140, "…which is 200 − 20 − 30 from the view's edge");
});

// ── WrappingLayout: the wrap width is the content width ────────────────────

await test("WrappingLayout: the flow wraps at the content width", async () => {
  const src = (pad) => `App [ width = 400, height = 300,
    box: View [ width = 200, height = 200${pad},
      layout: WrappingLayout [ spacing = 10, rowSpacing = 10 ],
      a: View [ width = 90, height = 20 ],
      b: View [ width = 90, height = 20 ],
    ],
  ]`;
  const wide = await boot(src(""));
  assert.equal(wide.box.b.y, 0, "90 + 10 + 90 = 190 fits in 200 — one row");
  const padded = await boot(src(", padding = 20"));
  assert.deepEqual(padded.box.a.rootOrigin(), { x: 20, y: 20 }, "the flow starts at the inset");
  assert.equal(padded.box.b.x, 0, "…and 190 no longer fits in 160, so the second wraps");
  assert.equal(padded.box.b.y, 20 + 10, "on the next line, from the content origin");
  assert.equal(padded.box.contentHeight, 20 + 50 + 20, "the container counts both vertical insets");
});

// ── ResponsiveLayout: shares divide the content width ──────────────────────

await test("ResponsiveLayout: a share is a percent of the CONTENT width", async () => {
  const app = await boot(`App [ width = 600, height = 300,
    bar: View [ width = 400, height = 60, padding = [ 0, 40, 0, 60 ],
      layout: ResponsiveLayout [ gap = 0,
        plan = { [ ({ from: 0, flow: "row", share: ({ l: 25, r: 75 }) }) ] } ],
      l: View [ height = 20 ],
      r: View [ height = 20 ],
    ],
  ]`);
  // room = 400 − 60 − 40 = 300
  assert.equal(app.bar.l.width, 75, "25% of the room, not of the view");
  assert.equal(app.bar.r.width, 225);
  assert.equal(app.bar.l.x, 0, "the run starts at the content origin");
  assert.equal(app.bar.l.rootOrigin().x, 60, "…the leading inset in");
  assert.equal(app.bar.r.x, 75);
});

await test("ResponsiveLayout: the plan is selected against the content width", async () => {
  const app = await boot(`App [ width = 600, height = 300,
    bar: View [ width = 400, height = 60, padding = 60,
      layout: ResponsiveLayout [ gap = 0,
        plan = { [ ({ from: 350, flow: "row" }), ({ from: 0, flow: "stack" }) ] } ],
      a: View [ width = 20, height = 20 ],
      b: View [ width = 20, height = 20 ],
    ],
  ]`);
  // 400 would pick the row; 400 − 120 = 280 picks the stack
  assert.equal(app.bar.b.y, 20, "stacked — the tier answered to the room, not the box");
});

// ── A container sizes itself to content PLUS padding, on both axes ─────────

await test("auto-extent: an unset size counts both insets, on both axes", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    box: View [ padding = [ 4, 8, 16, 32 ],
      a: View [ x = 0, y = 0, width = 50, height = 20 ],
    ],
  ]`);
  // contentWidth/contentHeight ARE `extentOf` — the very number an unset size
  // slot derives (the derive itself installs at attach, which a headless boot
  // has none of).
  assert.equal(app.box.contentWidth, 32 + 50 + 8, "left + content + right");
  assert.equal(app.box.contentHeight, 4 + 20 + 16, "top + content + bottom");
});

await test("auto-extent ATTACHED: the derive that runs on a live tree counts the insets", async () => {
  // The facts above are `extentOf` read directly. THE DERIVE is what a real
  // program gets, and it installs at ATTACH — where the kernel may take the
  // rule over (view.ts installKernelExtent). A kernel rule is a max over the
  // children's boxes and cannot carry an inset, so this is the case that
  // catches it: every padded Card in the corpus was an inset short, and no
  // headless assertion could see it (2026-09-19).
  const app = await boot(`App [ width = 400, height = 300,
    box: View [ x = 0, y = 0, width = 120, padding = [ 10, 8, 14, 8 ],
      layout: SimpleLayout [ axis = y, spacing = 6 ],
      a: View [ width = 30, height = 20 ],
      b: View [ width = 30, height = 20 ],
    ],
  ]`);
  app.attach(new HeadlessBackend(), null);
  settle();
  assert.equal(app.box.height, 10 + 20 + 6 + 20 + 14, "top + content + spacing + content + bottom");
  // …and it follows a padding change, whichever side of the kernel it lands on
  app.box.padding = 0;
  settle();
  assert.equal(app.box.height, 20 + 6 + 20, "unpadded: the content alone");
  app.box.padding = 20;
  settle();
  assert.equal(app.box.height, 20 + 20 + 6 + 20 + 20, "padded again: both insets are back");
});

await test("a container auto-sizes to its content plus both insets, through a layout", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    box: View [ width = 120, padding = [ 6, 0, 18, 0 ],
      layout: SimpleLayout [ axis = y, spacing = 4 ],
      a: View [ width = 30, height = 10 ],
      b: View [ width = 30, height = 10 ],
    ],
  ]`);
  assert.equal(app.box.contentHeight, 6 + 10 + 4 + 10 + 18);
  app.box.padding = 0;
  settle();
  assert.equal(app.box.contentHeight, 24, "and shrinks back when the padding goes");
});

// ── A scroller stops a full inset past its last child ──────────────────────

await test("a padded scroller's content extent includes the BOTTOM inset", async () => {
  const src = (pad) => `App [ width = 400, height = 300,
    pane: View [ x = 0, y = 0, width = 200, height = 100, scrolls = y${pad},
      layout: SimpleLayout [ axis = y, spacing = 0 ],
      a: View [ width = 50, height = 120 ],
      b: View [ width = 50, height = 120 ],
    ],
  ]`;
  const bare = await boot(src(""));
  assert.equal(bare.pane.contentHeight, 240, "unpadded: the last child's far edge, as ever");
  const padded = await boot(src(", padding = [ 10, 0, 24, 0 ]"));
  assert.equal(padded.pane.contentHeight, 10 + 240 + 24,
    "the scroll range must hold the full bottom inset AFTER the last child — the thing CSS got wrong");
  assert.equal(padded.pane.a.rootOrigin().y, 10, "…while the top inset is where the content begins");
});

await test("a padded scroller counts the trailing inset on x as well", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    strip: View [ width = 150, height = 60, scrolls = x, padding = [ 0, 18, 0, 6 ],
      layout: SimpleLayout [ axis = x, spacing = 0 ],
      a: View [ width = 200, height = 20 ],
    ],
  ]`);
  assert.equal(app.strip.contentWidth, 6 + 200 + 18);
});

// ── A custom Layout keeps working, padded or not ───────────────────────────

const CUSTOM = (pad) => `App [ width = 400, height = 300,
  grid: View [ width = 200, height = 200${pad},
    layout: Diagonal [ step = 25 ],
    a: View [ width = 10, height = 10 ],
    b: View [ width = 10, height = 10 ],
    c: View [ width = 10, height = 10 ],
  ],
]

class Diagonal extends Layout [
  step: number = 10,
  place() {
    return this.laid().map((c, i) => ({ x: i * this.step, y: i * this.step }))
  }
]`;

await test("a custom Layout returns CONTENT coordinates — its place() is untouched by the inset", async () => {
  const bare = await boot(CUSTOM(""));
  assert.deepEqual(geom(bare.grid).map((g) => [g.x, g.y]), [[0, 0], [25, 25], [50, 50]]);
  const padded = await boot(CUSTOM(", padding = [ 12, 0, 0, 30 ]"));
  assert.deepEqual(geom(padded.grid).map((g) => [g.x, g.y]), [[0, 0], [25, 25], [50, 50]],
    "the very same boxes: `x = 0` already meant the content origin");
  assert.deepEqual(padded.grid.a.rootOrigin(), { x: 30, y: 12 }, "…and the view puts that origin inside its insets");
});

await test("a custom Layout reads contentExtent for the room it has", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    row: View [ width = 200, height = 100, padding = [ 0, 20, 0, 20 ],
      layout: Even [ ],
      a: View [ height = 10 ],
      b: View [ height = 10 ],
    ],
  ]
  class Even extends Layout [
    place() {
      const kids = this.laid()
      const room = (this as any).contentExtent("width") / Math.max(1, kids.length)
      return kids.map((c, i) => ({ x: i * room, w: room }))
    }
  ]`);
  assert.equal(app.row.a.width, 80, "(200 − 40) / 2");
  assert.equal(app.row.a.x, 0, "…placed from the content origin");
  assert.equal(app.row.a.rootOrigin().x, 20);
  assert.equal(app.row.b.x, 80);
});

await test("padding on the Layout is now an error that names the view", async () => {
  const b = await compileProgram(`App [ View [ layout: SimpleLayout [ axis = y, padding = 16 ] ] ]`,
    { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 1);
  assert.match(b.errors[0].message, /padding/);
  assert.match(b.errors[0].message, /VIEW's|view/i);
});

// ── Per-side stroke: the value, the DOM paint, the canvas paint ────────────

await test("stroke: four clockwise from the top, null for a bare side", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    rules: View [ width = 100, height = 40, fill = white,
      stroke = [ stroke(1, #DBE1E9), null, stroke(2, #99A0AA), null ] ],
    ring: View [ width = 100, height = 40, stroke = stroke(1, #DBE1E9) ],
  ]`);
  assert.deepEqual(app.rules.stroke, [{ width: 1, color: 0xdbe1e9 }, null, { width: 2, color: 0x99a0aa }, null]);
  assert.deepEqual(app.ring.stroke, { width: 1, color: 0xdbe1e9 }, "the one-value form is unchanged");
});

await test("stroke: a list that is not four is refused, and says the shape", async () => {
  const b = await compileProgram(`App [ View [ stroke = [ stroke(1, #000000), null ] ] ]`,
    { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 1);
  assert.match(b.errors[0].message, /top, right, bottom, left/);
});

await test("stroke: the DOM paints four inset shadows, one per side", async () => {
  const el = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {} }, appendChild() {} });
  const prior = globalThis.document;
  globalThis.document = { createElement: el, createTextNode: () => ({}) };
  try {
    const { DomSurface } = await import("../runtime/dist/dom-backend.js");
    const s = new DomSurface();
    s.setWidth(100);
    s.setHeight(40);
    s.setStroke({ width: 1, color: 0x336699 });
    assert.equal(s.element.style.boxShadow, "inset 0 0 0 1px #336699", "uniform: one ring, as ever");
    s.setStroke([{ width: 1, color: 0x336699 }, null, { width: 2, color: 0xaa0000 }, null]);
    assert.equal(s.element.style.boxShadow,
      "inset 0 1px 0 0 #336699, inset 0 -2px 0 0 #aa0000",
      "a band per stroked side, and nothing for a null one");
    s.setStroke([{ width: 3, color: 0x112233 }, { width: 3, color: 0x112233 },
      { width: 3, color: 0x112233 }, { width: 3, color: 0x112233 }]);
    assert.equal(s.element.style.boxShadow, "inset 0 0 0 3px #112233",
      "four identical sides collapse back to the one-ring path");
    s.setShadow({ fn: "shadow", dx: 0, dy: 2, blur: 6, color: 0x000000 });
    s.setStroke([null, { width: 1, color: 0x000000 }, null, null]);
    assert.equal(s.element.style.boxShadow, "0px 2px 6px #000000, inset -1px 0 0 0 #000000",
      "the drop shadow stays first; the right side's band comes in from the right");
    s.setStroke(null);
    assert.equal(s.element.style.boxShadow, "0px 2px 6px #000000", "no border at all leaves only the shadow");
  } finally {
    if (prior === undefined) delete globalThis.document; else globalThis.document = prior;
  }
});

await test("stroke: the canvas paints each side as the box minus a shifted copy of itself", async () => {
  const priorPath = globalThis.Path2D;
  globalThis.Path2D = class {
    constructor() { this.ops = []; }
    rect(...a) { this.ops.push(["rect", ...a]); }
    roundRect(...a) { this.ops.push(["roundRect", ...a]); }
    addPath(p, m) { this.ops.push(["shift", m?.e ?? 0, m?.f ?? 0]); }
  };
  try {
    const { paintBox } = await import("../runtime/dist/boxpaint.js");
    const log = [];
    const ctx = {
      fillStyle: null, strokeStyle: null, lineWidth: 0,
      save() { log.push(["save"]); }, restore() { log.push(["restore"]); },
      clip() { log.push(["clip"]); },
      fill(p, rule) { log.push(["fill", this.fillStyle, rule ?? null, (p?.ops ?? []).filter((o) => o[0] === "shift").map((o) => [o[1], o[2]])]); },
      fillRect() { log.push(["fillRect", this.fillStyle]); },
      stroke() { log.push(["stroke", this.strokeStyle, this.lineWidth]); },
      getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
    };
    const base = { width: 100, height: 40, fill: "#ffffff", gradient: null, cornerRadius: 6, stroke: null, shadow: null };

    paintBox(ctx, { ...base, stroke: { width: 1, color: 0x336699 } }, null);
    assert.deepEqual(log.filter((o) => o[0] === "stroke"), [["stroke", "#336699", 2]],
      "uniform: the inside ring is one double-width stroke of the box path");

    log.length = 0;
    paintBox(ctx, { ...base, stroke: [{ width: 1, color: 0x336699 }, null, { width: 2, color: 0xaa0000 }, null] }, null);
    const fills = log.filter((o) => o[0] === "fill" && o[2] === "evenodd");
    assert.equal(log.filter((o) => o[0] === "stroke").length, 0, "no ring — the sides differ");
    assert.deepEqual(fills.map((f) => [f[1], f[3][0]]),
      [["#336699", [0, 1]], ["#aa0000", [0, -2]]],
      "top = the box minus itself shifted DOWN by 1; bottom = minus itself shifted UP by 2");
    assert.equal(log[log.indexOf(fills[0]) - 1][0], "clip", "…both clipped to the box, so a rounded corner cuts the band");

    log.length = 0;
    paintBox(ctx, { ...base, stroke: [null, null, null, null] }, null);
    assert.deepEqual(log.filter((o) => o[0] === "clip"), [], "four bare sides paint no border at all");
  } finally {
    if (priorPath === undefined) delete globalThis.Path2D; else globalThis.Path2D = priorPath;
  }
});

// ── The computed four sides ────────────────────────────────────────────────
//
// The literal list is not the only way to write four sides, and it was never
// the useful one: every hand-drawn border in the corpus takes a THEME token,
// and `stroke(1, provided("theme").line)` is a constraint expression, not a
// literal a list can hold. So the slot's body-facing type is `BoxStroke` —
// one Stroke, four of them, or null (compiler/src/scaffold.ts) — and a `{ }`
// binding may produce the list. These tests pin the three things that makes
// true: the computed value EQUALS the literal one, it paints identically on
// both backends, and it re-pushes when the list changes shape.

await test("stroke: a { } binding computes the four sides — the same value the literal writes", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    lit: View [ width = 100, height = 40,
      stroke = [ stroke(1, #DBE1E9), null, stroke(2, #99A0AA), null ] ],
    calc: View [ width = 100, height = 40,
      stroke = { [ stroke(1, 0xDBE1E9), null, stroke(2, 0x99A0AA), null ] } ],
    one: View [ width = 100, height = 40, stroke = { stroke(1, 0xDBE1E9) } ],
  ]`);
  assert.deepEqual(app.calc.stroke, app.lit.stroke, "the computed list is the literal list");
  assert.deepEqual(app.one.stroke, { width: 1, color: 0xdbe1e9 },
    "and a { } that yields ONE stroke is unchanged — the uniform form still takes the one-ring path");
});

await test("stroke: the themed computed list — the form the corpus actually needs", async () => {
  // This is the case the per-side stroke shipped without: a hairline in a theme
  // token, which no list literal can hold.
  const app = await boot(`theme Brand [ line = #DBE1E9 ]
    App [ width = 400, height = 300, theme = Brand,
      rows: View [ width = 100, height = 40,
        stroke = { [ stroke(1, provided("theme").line), null, stroke(1, provided("theme").line), null ] } ],
    ]`);
  assert.deepEqual(app.rows.stroke,
    [{ width: 1, color: 0xdbe1e9 }, null, { width: 1, color: 0xdbe1e9 }, null],
    "two rules in the theme's line token, top and bottom");
});

await test("stroke: a computed list paints the same sides as a literal one, on BOTH backends", async () => {
  const app = await boot(`App [ width = 400, height = 300,
    lit: View [ width = 100, height = 40,
      stroke = [ stroke(1, #336699), null, stroke(2, #AA0000), null ] ],
    calc: View [ width = 100, height = 40,
      stroke = { [ stroke(1, 0x336699), null, stroke(2, 0xAA0000), null ] } ],
  ]`);
  // DOM: four inset box-shadows, one per stroked side.
  const el = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {} }, appendChild() {} });
  const prior = globalThis.document;
  globalThis.document = { createElement: el, createTextNode: () => ({}) };
  let domLit, domCalc;
  try {
    const { DomSurface } = await import("../runtime/dist/dom-backend.js");
    const shadowFor = (v) => { const s = new DomSurface(); s.setWidth(100); s.setHeight(40); s.setStroke(v); return s.element.style.boxShadow; };
    domLit = shadowFor(app.lit.stroke);
    domCalc = shadowFor(app.calc.stroke);
  } finally {
    if (prior === undefined) delete globalThis.document; else globalThis.document = prior;
  }
  assert.equal(domCalc, domLit, "the same two bands");
  assert.equal(domCalc, "inset 0 1px 0 0 #336699, inset 0 -2px 0 0 #aa0000");
  // Canvas: each side as the box minus a copy shifted in from that edge.
  const priorPath = globalThis.Path2D;
  globalThis.Path2D = class {
    constructor() { this.ops = []; }
    rect(...a) { this.ops.push(["rect", ...a]); }
    roundRect(...a) { this.ops.push(["roundRect", ...a]); }
    addPath(p, m) { this.ops.push(["shift", m?.e ?? 0, m?.f ?? 0]); }
  };
  try {
    const { paintBox } = await import("../runtime/dist/boxpaint.js");
    const bands = (strokeValue) => {
      const log = [];
      const ctx = {
        fillStyle: null, strokeStyle: null, lineWidth: 0,
        save() {}, restore() {}, clip() {},
        fill(p, rule) { if (rule === "evenodd") log.push([this.fillStyle, (p?.ops ?? []).filter((o) => o[0] === "shift").map((o) => [o[1], o[2]])[0]]); },
        fillRect() {}, stroke() { log.push(["RING", this.strokeStyle]); },
        getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
      };
      paintBox(ctx, { width: 100, height: 40, fill: "#ffffff", gradient: null, cornerRadius: 6, stroke: strokeValue, shadow: null }, null);
      return log;
    };
    assert.deepEqual(bands(app.calc.stroke), bands(app.lit.stroke), "the same two clipped fills");
    assert.deepEqual(bands(app.calc.stroke), [["#336699", [0, 1]], ["#aa0000", [0, -2]]]);
  } finally {
    if (priorPath === undefined) delete globalThis.Path2D; else globalThis.Path2D = priorPath;
  }
});

await test("stroke: a computed list that CHANGES repaints — two sides, then one, then none", async () => {
  const log = [];
  const app = await boot(`App [ width = 400, height = 300, rules: number = 2,
    v: View [ width = 100, height = 40,
      stroke = { app.rules === 2 ? [ stroke(1, 0x336699), null, stroke(1, 0x336699), null ]
               : app.rules === 1 ? [ stroke(1, 0x336699), null, null, null ]
               : null } ] ]`);
  const methods = ["setX", "setY", "setWidth", "setHeight", "setFill", "setCornerRadius", "setStroke",
    "setShadow", "setVisible", "setOpacity", "setClip", "setBoxClip", "setDrawing", "setText",
    "setTextStyle", "setImage", "setImageStretch", "setInput", "setEditable", "activateEditable",
    "insertChild", "destroy"];
  app.attach({ createSurface: () => Object.fromEntries(methods.map((m) => [m, (...a) => log.push([m, ...a])])), attachRoot: () => {} }, null);
  const pushed = () => log.filter(([m]) => m === "setStroke").map(([, v]) => v);
  assert.deepEqual(pushed().at(-1), [{ width: 1, color: 0x336699 }, null, { width: 1, color: 0x336699 }, null],
    "the first flush carries the two-sided list");

  log.length = 0;
  app.rules = 1;
  settle();
  assert.deepEqual(pushed(), [[{ width: 1, color: 0x336699 }, null, null, null]],
    "a list of a different SHAPE pushes once");

  log.length = 0;
  app.rules = 0;
  settle();
  assert.deepEqual(pushed(), [null], "…and so does dropping the border entirely");

  log.length = 0;
  app.rules = 2;
  settle();
  assert.equal(pushed().length, 1, "back to two sides: one push");
});

await test("stroke: a re-derived list that is EQUAL never reaches the surface", async () => {
  // A `{ }` builds a FRESH array every time it runs, so without structural
  // equality (value.ts strokeEqual, deferring to stroke-sides.ts sidesEqual)
  // every write to anything the body reads would repaint the border. `wide`
  // changes; the list it computes does not.
  const log = [];
  globalThis.__strokeRuns = 0;
  const app = await boot(`App [ width = 400, height = 300, wide: number = 400,
    v: View [ width = 100, height = 40,
      stroke = { globalThis.__strokeRuns++, [ stroke(1, app.wide > 100 ? 0x336699 : 0xFF0000), null, null, null ] } ] ]`);
  const methods = ["setX", "setY", "setWidth", "setHeight", "setFill", "setCornerRadius", "setStroke",
    "setShadow", "setVisible", "setOpacity", "setClip", "setBoxClip", "setDrawing", "setText",
    "setTextStyle", "setImage", "setImageStretch", "setInput", "setEditable", "activateEditable",
    "insertChild", "destroy"];
  app.attach({ createSurface: () => Object.fromEntries(methods.map((m) => [m, (...a) => log.push([m, ...a])])), attachRoot: () => {} }, null);
  const pushed = () => log.filter(([m]) => m === "setStroke").map(([, v]) => v);
  assert.equal(pushed().length, 1, "the first flush carries it once");
  const first = app.v.stroke;
  const runs = globalThis.__strokeRuns;

  log.length = 0;
  app.wide = 500;                       // the body re-runs…
  settle();
  assert.ok(globalThis.__strokeRuns > runs, "…the body really did re-run and build a fresh array");
  assert.deepEqual(pushed(), [], "…but an equal list is not a repaint");
  assert.equal(app.v.stroke, first, "…and the slot keeps the array it already had");

  log.length = 0;
  app.wide = 50;                        // now the colour genuinely changes
  settle();
  assert.deepEqual(pushed(), [[{ width: 1, color: 0xff0000 }, null, null, null]], "a real change does push");
  delete globalThis.__strokeRuns;
});

await test("stroke: a malformed COMPUTED list is refused, and says the shape", async () => {
  const b = await compileProgram(`App [ View [ stroke = { [ stroke(1, 0x000000), null ] } ] ]`,
    { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 1, b.errors.map((e) => e.message).join("; "));
  // The same sentence the LITERAL form's coercion says (runtime/src/errors.ts
  // strokeShapeMessage) — a mistake made inside a { } is told in the language's
  // words, not as the scaffold's `BoxStroke` type name.
  assert.match(b.errors[0].message, /the \{ \} body of 'stroke'/);
  assert.match(b.errors[0].message, /\[top, right, bottom, left\] clockwise from the top/);
  assert.doesNotMatch(b.errors[0].message, /yield a BoxStroke/);
});

// ── The two library surfaces ───────────────────────────────────────────────

await test("Card: theme surface, theme radius, a hairline edge, and its own content inset", async () => {
  const app = await boot(`App [ width = 600, height = 400,
    c: Card [ x = 20, y = 20, width = 280,
      a: View [ width = 100, height = 24 ],
      b: View [ width = 80, height = 20 ],
    ],
  ]`);
  const c = app.c;
  assert.equal(c.fill, 0xffffff, "the theme's surface");
  assert.equal(c.cornerRadius, 7, "the theme's controlRadius");
  assert.deepEqual(c.stroke, { width: 1, color: 0xdbe1e9 }, "a hairline in the theme's line token");
  assert.equal(c.padding, 16, "the inset is the CARD's, not its layout's");
  assert.equal(c.layout.align, "none", "…which is why the default stack needs no `align = start` any more");
  assert.deepEqual([c.a.x, c.a.y], [0, 0], "children start at the content origin, both axes");
  assert.deepEqual([c.b.x, c.b.y], [0, 32], "…8 apart");
  assert.deepEqual(c.a.rootOrigin(), { x: 36, y: 36 }, "…and the content origin is 16 inside the card");
  assert.equal(c.contentHeight, 16 + 24 + 8 + 20 + 16, "and the card sizes itself to all of it");
});

await test("Card: replacing the layout does NOT replace the padding", async () => {
  const app = await boot(`App [ width = 600, height = 400,
    c: Card [ x = 0, y = 0, width = 280,
      layout: WrappingLayout [ spacing = 4, rowSpacing = 4 ],
      a: View [ width = 100, height = 24 ],
    ],
  ]`);
  assert.equal(app.c.padding, 16, "the inset was never the arrangement's, so naming one keeps it");
  assert.deepEqual(app.c.a.rootOrigin(), { x: 16, y: 16 });
});

await test("Card: a use site replaces the layout, and any other default, by naming it", async () => {
  const app = await boot(`App [ width = 600, height = 400,
    c: Card [ x = 20, y = 20, width = 280, stroke = null, fill = #101820,
      padding = 0, layout: SimpleLayout [ axis = x, spacing = 4 ],
      a: View [ width = 100, height = 24 ],
      b: View [ width = 80, height = 20 ],
    ],
  ]`);
  assert.equal(app.c.stroke, null, "member precedence — the edge is gone");
  assert.equal(app.c.fill, 0x101820);
  assert.deepEqual([app.c.b.x, app.c.b.y], [104, 0], "and the named layout replaced the default whole");
  assert.deepEqual(app.c.a.rootOrigin(), { x: 20, y: 20 }, "…with `padding = 0` written out, the inside is the box");
});

await test("Divider: spans the parent's CONTENT, insets from the leading edge, stands on end", async () => {
  const app = await boot(`App [ width = 600, height = 400,
    c: Card [ x = 20, y = 20, width = 280,
      a: View [ width = 100, height = 24 ],
      d: Divider [ ],
      e: Divider [ inset = 40 ],
    ],
    row: View [ x = 320, y = 20, width = 200, height = 120, padding = 10,
      layout: SimpleLayout [ axis = x, spacing = 8 ],
      p: View [ width = 20, height = 20 ],
      q: Divider [ axis = y, thickness = 2, inset = 4 ],
    ],
  ]`);
  const d = app.c.d;
  assert.equal(d.height, 1, "a hairline is one logical pixel");
  assert.equal(d.width, 280 - 32, "the card's content width — the padding is not the divider's arithmetic");
  assert.equal(d.x, 0, "at the content origin — the card's inset is not in the slot");
  assert.equal(d.rootOrigin().x, 20 + 16, "…and lands on the card's content edge");
  assert.equal(app.c.e.rule.x, 40, "inset moves the rule's leading edge…");
  assert.equal(app.c.e.rule.width, 280 - 32 - 40, "…and shortens it by the same amount");
  const q = app.row.q;
  assert.equal(q.width, 2, "a vertical rule is `thickness` wide");
  assert.equal(q.height, 120 - 20, "and spans the row's content height");
  assert.deepEqual([q.rule.y, q.rule.height], [4, 120 - 20 - 4]);
});

await test("Divider: the rule takes the theme's line, and a colour of its own when given one", async () => {
  const app = await boot(`App [ width = 400, height = 200,
    a: Divider [ width = 100 ],
    b: Divider [ width = 100, color = #FF0000 ],
  ]`);
  assert.equal(app.a.rule.fill, 0xdbe1e9);
  assert.equal(app.b.rule.fill, 0xff0000);
});

summarize("layout-padding");
