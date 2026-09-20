// test/responsive-share.test.mjs — what a ResponsiveLayout `share` divides, and
// the two values it refuses.
//
// The claim under test is one sentence of the component's own prose: *"A child
// a plan does not name is left alone: natural width, the flow just places it"*
// — and, with it, *"shares fill; naturals align."* That promise used to be
// false. The shares were cut from the whole run, the naturals were never taken
// out of the denominator first, and so a row 880 wide carrying
// `share: { logo: 20, nav: 80 }` plus an unnamed `self: View [ width = 200 ]`
// put `self` at **x = 880 in an 880-wide bar** — entirely off the end, with no
// error, clean through R4. The fix is arithmetic, not ownership: the widths the
// plan does NOT allocate come out of the run before the percentages are cut, so
// "20%" means 20% of what is left.
//
// Two neighbours of the same hole are pinned here too, because both were silent
// and both produce a wrong picture rather than a stopped program: shares that
// add to more than 100 used to overflow the view, and a share that is not a
// number used to arrive as `width = NaN` on that child and `x = NaN` on its
// neighbour. Both are now refused where the plan is read, by name and with the
// total.
//
// And `"auto"` — the word for "keep this child at its natural size, divide the
// rest" — is held to the strictest form of its definition: *identical* geometry
// to leaving the child out of the share entirely. It buys legibility (the plan
// states the whole row, and a misspelled name is caught by the existing loud
// check) and no capability. It is not `share: 0`, which drops the child.
//
// Every number below is arithmetic done by hand in the comment beside it. The
// synthetic measurer is only needed because a row may hold text; the cases use
// explicit widths so the metrics never enter the answer.

import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate } from "../runtime/dist/instantiate.js";
import { settle, provideMeasurer } from "../runtime/dist/index.js";
import { approximateMeasurer } from "../compiler/dist/headless.js";

provideMeasurer(approximateMeasurer());

async function boot(src) {
  const b = await compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  const app = instantiate(b.program);
  settle();
  return app;
}

/** Boot expecting a refusal; answer the message. */
async function refusal(src) {
  try {
    await boot(src);
  } catch (e) {
    return String(e?.message ?? e);
  }
  throw new Error("expected the plan to be refused, but it laid out");
}

/** A row 880 wide with `gap = 10`, whose plan is whatever is passed in. */
const bar = (plan, kids) => `App [ width = 960, height = 300,
  bar: View [ width = 880, height = 60,
    layout: ResponsiveLayout [ gap = 10, plan = { [ ({ from: 0, flow: "row"${plan} }) ] } ],
    ${kids}
  ],
]`;

// ── the mixed row: shares beside a child the plan does not name ────────────

await test("row: the naturals come out of the run before the shares are cut", async () => {
  // The report's own case. 880 wide, three visible children → two gaps of 10,
  // so the run is 860. `self` keeps its natural 200, leaving 660 for the
  // shares: logo 20% = 132, nav 80% = 528.
  const app = await boot(bar(`, share: ({ logo: 20, nav: 80 })`, `
    logo: View [ height = 20 ],
    nav: View [ height = 20 ],
    self: View [ width = 200, height = 20 ],`));
  assert.equal(app.bar.logo.width, 132, "20% of what is LEFT (660), not of the whole run");
  assert.equal(app.bar.nav.width, 528, "80% of 660");
  assert.equal(app.bar.logo.x, 0);
  assert.equal(app.bar.nav.x, 132 + 10);
  assert.equal(app.bar.self.x, 132 + 10 + 528 + 10, "670 — and 670 + 200 = 880, flush with the bar");
  assert.equal(app.bar.self.width, 200, "the plan never touched it");
  assert.ok(app.bar.self.x + app.bar.self.width <= 880, "nothing runs off the end");
});

await test("row: the natural may lead, and the shares still divide what is left", async () => {
  // Same arithmetic, different order — the run is a sum, not a sequence.
  const app = await boot(bar(`, share: ({ nav: 25, actions: 75 })`, `
    logo: View [ width = 260, height = 20 ],
    nav: View [ height = 20 ],
    actions: View [ height = 20 ],`));
  assert.equal(app.bar.logo.x, 0);
  assert.equal(app.bar.logo.width, 260);
  assert.equal(app.bar.nav.width, 150, "25% of 860 − 260 = 600");
  assert.equal(app.bar.actions.width, 450, "75% of 600");
  assert.equal(app.bar.nav.x, 270);
  assert.equal(app.bar.actions.x, 270 + 150 + 10);
  assert.equal(app.bar.actions.x + app.bar.actions.width, 880);
});

await test("row: shares that do not fill leave slack, and the naturals keep their size", async () => {
  // 20 + 50 = 70 of 660 → 132 + 330; the remaining 198 is slack at the end,
  // exactly as a row of naturals with no Spacer leaves slack.
  const app = await boot(bar(`, share: ({ logo: 20, nav: 50 })`, `
    logo: View [ height = 20 ],
    nav: View [ height = 20 ],
    self: View [ width = 200, height = 20 ],`));
  assert.equal(app.bar.logo.width, 132);
  assert.equal(app.bar.nav.width, 330);
  assert.equal(app.bar.self.width, 200);
  assert.equal(app.bar.self.x, 132 + 10 + 330 + 10);
  assert.equal(app.bar.self.x + app.bar.self.width, 682, "198 of slack — the run does not fill");
});

// ── "auto" — the word for what omission does ──────────────────────────────

await test('"auto" is geometrically identical to leaving the child out', async () => {
  const kids = `
    logo: View [ width = 200, height = 20 ],
    nav: View [ height = 20 ],
    actions: View [ height = 20 ],`;
  const omitted = await boot(bar(`, share: ({ nav: 60, actions: 40 })`, kids));
  const named = await boot(bar(`, share: ({ logo: "auto", nav: 60, actions: 40 })`, kids));
  for (const n of ["logo", "nav", "actions"]) {
    assert.equal(named.bar[n].x, omitted.bar[n].x, `${n}.x`);
    assert.equal(named.bar[n].width, omitted.bar[n].width, `${n}.width`);
  }
  assert.equal(named.bar.logo.width, 200, "its own width, untouched");
  assert.equal(named.bar.nav.width, 396, "60% of 860 − 200 = 660");
  assert.equal(named.bar.actions.width, 264, "40% of 660");
});

await test('"auto" is not share: 0 — it keeps the child, 0 drops it', async () => {
  const kids = `
    logo: View [ width = 200, height = 20 ],
    nav: View [ height = 20 ],`;
  const auto = await boot(bar(`, share: ({ logo: "auto", nav: 100 })`, kids));
  assert.equal(auto.bar.logo.visible, true, '"auto" keeps the child in the flow');
  assert.equal(auto.bar.logo.width, 200);
  assert.equal(auto.bar.nav.width, 670, "100% of 870 − 200 — the gap is still spent");

  const dropped = await boot(bar(`, share: ({ logo: 0, nav: 100 })`, kids));
  assert.equal(dropped.bar.logo.visible, false, "a share of 0 still drops the child");
  assert.equal(dropped.bar.nav.x, 0, "…and reclaims its space, gap included");
  assert.equal(dropped.bar.nav.width, 880, "the only visible child: no gaps, the whole width");
});

await test('"auto" is accepted in a stack, where it changes nothing', async () => {
  // In stack flow the flow axis is height and a share is a plain percent of
  // the view's width, so naturals never compete for it: "auto" there is
  // exactly omission, and the omitted child keeps its own width.
  const app = await boot(`App [ width = 960, height = 400,
    bar: View [ width = 880, height = 300,
      layout: ResponsiveLayout [ gap = 10, plan = { [ ({ from: 0, flow: "stack", share: ({ logo: "auto", nav: 50 }) }) ] } ],
      logo: View [ width = 200, height = 40 ],
      nav: View [ height = 40 ],
    ],
  ]`);
  assert.equal(app.bar.logo.width, 200, "its own");
  assert.equal(app.bar.logo.y, 0);
  assert.equal(app.bar.nav.width, 440, "50% of the view's width, not of a remainder");
  assert.equal(app.bar.nav.y, 40 + 10, "heights are the children's, as always");
});

// ── the two refusals ──────────────────────────────────────────────────────

await test("a ROW whose shares add to more than 100 is refused, with the plan and the total", async () => {
  const msg = await refusal(bar(`, share: ({ a: 60, b: 70 })`, `
    a: View [ height = 20 ],
    b: View [ height = 20 ],`));
  assert.match(msg, /add up to 130%/, "the total, said out loud");
  assert.match(msg, /the plan from 0/, "which plan");
  assert.match(msg, /"auto"/, "and the way to keep a child at its natural size");
});

await test("a STACK's shares do not compete, so 100 / 100 (full-bleed bands) is allowed", async () => {
  // The component's own prose names this idiom, and the corpus writes it four
  // times: in a stack a share is an independent percent of the view's width,
  // not a slice of one run, so there is no budget to blow.
  const app = await boot(`App [ width = 960, height = 400,
    bar: View [ width = 880, height = 300,
      layout: ResponsiveLayout [ gap = 10, plan = { [ ({ from: 0, flow: "stack", share: ({ a: 100, b: 100 }) }) ] } ],
      a: View [ height = 40 ],
      b: View [ height = 40 ],
    ],
  ]`);
  assert.equal(app.bar.a.width, 880);
  assert.equal(app.bar.b.width, 880);
  assert.equal(app.bar.b.y, 50);
});

await test("a single share above 100 is refused in either flow — it is an overflow, not an idiom", async () => {
  const row = await refusal(bar(`, share: ({ a: 150 })`, `a: View [ height = 20 ],`));
  assert.match(row, /the share for 'a' is 150/);
  const stack = await refusal(`App [ width = 960, height = 400,
    bar: View [ width = 880, height = 300,
      layout: ResponsiveLayout [ plan = { [ ({ from: 0, flow: "stack", share: ({ a: 150 }) }) ] } ],
      a: View [ height = 40 ],
    ],
  ]`);
  assert.match(stack, /the share for 'a' is 150/);
});

await test("a share that is not a number and not \"auto\" is refused, not turned into NaN", async () => {
  const msg = await refusal(bar(`, share: ({ a: "half", b: 70 })`, `
    a: View [ height = 20 ],
    b: View [ height = 20 ],`));
  assert.match(msg, /the share for 'a'/, "which child");
  assert.match(msg, /"half"/, "and what it said");
  assert.match(msg, /0 to 100/);
  assert.match(msg, /"auto"/);
});

await test("a negative share is refused too", async () => {
  const msg = await refusal(bar(`, share: ({ a: -10, b: 70 })`, `
    a: View [ height = 20 ],
    b: View [ height = 20 ],`));
  assert.match(msg, /the share for 'a' is -10/);
});

await test("a share naming no child is still the loud error it was", async () => {
  const msg = await refusal(bar(`, share: ({ zzz: 70 })`, `
    a: View [ height = 20 ],`));
  assert.match(msg, /the plan names 'zzz'/);
});

await test("shares that add to exactly 100 are fine", async () => {
  const app = await boot(bar(`, share: ({ a: 33.34, b: 33.33, c: 33.33 })`, `
    a: View [ height = 20 ],
    b: View [ height = 20 ],
    c: View [ height = 20 ],`));
  assert.ok(Math.abs(app.bar.a.width + app.bar.b.width + app.bar.c.width - 860) < 0.001,
    "three thirds of the run, float noise and all");
});

// ── what must not move ────────────────────────────────────────────────────

await test("a plan of shares only is unchanged: the whole run is divided", async () => {
  const app = await boot(bar(`, share: ({ logo: 15, nav: 55, actions: 30 })`, `
    logo: View [ height = 20 ],
    nav: View [ height = 20 ],
    actions: View [ height = 20 ],`));
  // no naturals → the base IS the run (880 − 2 gaps = 860), exactly as before
  assert.equal(app.bar.logo.width, 129);
  assert.equal(app.bar.nav.width, 473);
  assert.equal(app.bar.actions.width, 258);
  assert.equal(app.bar.actions.x + app.bar.actions.width, 880, "flush, no slack: shares fill");
});

await test("a Spacer beside naturals is unchanged — it absorbs the slack", async () => {
  // The path that already worked (no shares at all) must not regress:
  // 880 − 2 gaps = 860, less 150 and 100 of naturals → the Spacer takes 610.
  const app = await boot(bar(``, `
    fixed: View [ width = 150, height = 20 ],
    sp: Spacer [ ],
    tail: View [ width = 100, height = 20 ],`));
  assert.equal(app.bar.fixed.width, 150);
  assert.equal(app.bar.sp.width, 610);
  assert.equal(app.bar.tail.width, 100);
  assert.equal(app.bar.tail.x, 150 + 10 + 610 + 10);
});

await test("a Spacer beside shares takes what the shares leave", async () => {
  // 880 − 2 gaps = 860; `fixed` keeps 150, so the shares divide 710 and take
  // 60% of it (426); the Spacer absorbs the remaining 284.
  const app = await boot(bar(`, share: ({ nav: 60 })`, `
    fixed: View [ width = 150, height = 20 ],
    nav: View [ height = 20 ],
    sp: Spacer [ ],`));
  assert.equal(app.bar.fixed.width, 150);
  assert.equal(app.bar.nav.width, 426);
  assert.equal(app.bar.sp.width, 284, "the slack the shares did not claim");
  assert.equal(app.bar.sp.x + app.bar.sp.width, 880);
});

await test("stack flow is untouched: a share is a percent of the view's width", async () => {
  const app = await boot(`App [ width = 960, height = 400,
    bar: View [ width = 880, height = 300,
      layout: ResponsiveLayout [ gap = 10, plan = { [ ({ from: 0, flow: "stack", share: ({ a: 100, b: 50 }) }) ] } ],
      a: View [ height = 40 ],
      b: View [ height = 40 ],
    ],
  ]`);
  assert.equal(app.bar.a.width, 880);
  assert.equal(app.bar.b.width, 440);
  assert.equal(app.bar.b.y, 50);
});

await test("the mixed row holds in the OTHER flow too — a stack of naturals and shares", async () => {
  // In a stack the shares set widths and the heights are the children's, so a
  // natural sits at its own width and the run down the page is unaffected.
  const app = await boot(`App [ width = 960, height = 500,
    bar: View [ width = 880, height = 400,
      layout: ResponsiveLayout [ gap = 12, plan = { [ ({ from: 0, flow: "stack", share: ({ nav: 40 }) }) ] } ],
      logo: View [ width = 200, height = 30 ],
      nav: View [ height = 50 ],
      foot: View [ width = 310, height = 20 ],
    ],
  ]`);
  assert.equal(app.bar.logo.width, 200);
  assert.equal(app.bar.nav.width, 352, "40% of 880");
  assert.equal(app.bar.foot.width, 310);
  assert.equal(app.bar.logo.y, 0);
  assert.equal(app.bar.nav.y, 30 + 12);
  assert.equal(app.bar.foot.y, 30 + 12 + 50 + 12);
});

await test("the tier flip carries its own share base", async () => {
  // Two tiers, the wide one mixing a natural with shares and the narrow one
  // stacking: the same children, two different answers, no author arithmetic.
  const src = (w) => `App [ width = ${w + 80}, height = 300,
    bar: View [ width = ${w}, height = 60,
      layout: ResponsiveLayout [ gap = 10, plan = { [
        ({ from: 600, flow: "row", share: ({ nav: 100 }) }),
        ({ from: 0, flow: "stack" }) ] } ],
      logo: View [ width = 200, height = 20 ],
      nav: View [ height = 20 ],
    ],
  ]`;
  const wide = await boot(src(880));
  assert.equal(wide.bar.logo.width, 200);
  assert.equal(wide.bar.nav.width, 670, "100% of 870 − 200");
  assert.equal(wide.bar.nav.x, 210);

  const narrow = await boot(src(400));
  assert.equal(narrow.bar.logo.y, 0, "the narrow tier names no share at all");
  assert.equal(narrow.bar.nav.y, 30, "stacked, both at their own sizes");
  assert.equal(narrow.bar.logo.width, 200);
});

summarize("responsive-share");
