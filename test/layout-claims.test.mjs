// test/layout-claims.test.mjs — a layout places its children, and what it places
// a child does not declare (docs/system-design/layout-ownership.md).
//
// The rule is decided where it can be read: WHAT A LAYOUT PLACES is known from the
// source — the library's own table, read per instance from a layout's literal
// configuration, or the box keys an author's place() returns — so a child that
// declares one of those attributes is refused at COMPILE TIME, at its line, in
// every spelling (a literal, a formula, a percent, `center`). What the source
// cannot tell — a place() that builds its boxes with computed keys, a layout
// assigned at run time — the RUNTIME holds, in the same words: an author
// binding is contained and reported once, a literal is reported once as the same
// error, and a size the arrangement cannot write takes the child out of the run
// rather than leaving a hole behind it.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate } from "../runtime/dist/instantiate.js";
import { settle, provideMeasurer } from "../runtime/dist/index.js";
import { Layout, TweenLayout } from "../runtime/dist/layout.js";
import { approximateMeasurer } from "../compiler/dist/headless.js";
import { compile, settleHeadless } from "../compiler/dist/compile-node.js";

provideMeasurer(approximateMeasurer());

async function compileOnly(src) {
  return compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
}

async function boot(src) {
  const b = await compileOnly(src);
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  const app = instantiate(b.program);
  settle();
  return app;
}

/** The compile-time refusals a program earns — [] when it compiles clean. */
async function refusals(src) {
  return (await compileOnly(src)).errors.map((e) => `${e.message} @${e.pos?.line}`);
}

/** Run `fn` with both console channels captured. */
async function said(fn) {
  const lines = [];
  const warn = console.warn;
  const error = console.error;
  console.warn = (...a) => lines.push(a.join(" "));
  console.error = (...a) => lines.push(a.join(" "));
  try {
    return { value: await fn(), lines };
  } finally {
    console.warn = warn;
    console.error = error;
  }
}

const layoutLines = (lines) => lines.filter((l) => /does not declare its|cannot set its/.test(l));
/** A LITERAL's report shows the value it names (`View.width = 50`); a binding's does not. */
const literalLines = (lines) => layoutLines(lines).filter((l) => /\.\w+ = [-\d.]+/.test(l));
const bindingLines = (lines) => layoutLines(lines).filter((l) => !/\.\w+ = [-\d.]+/.test(l));

// ── 1 · At compile time: every spelling, refused at its line ─────────────────

await test("a declaration on an attribute the layout places is refused at its line — one answer for every spelling", async () => {
  for (const spelled of ["y = 40", "y = { parent.height - 10 }", "y = 50%", "y = center"]) {
    const errs = await refusals(`App [ width = 400, height = 300,
      col: View [ width = 200, height = 200,
        layout: SimpleLayout [ axis = y, spacing = 4 ],
        a: View [ width = 10, height = 10, ${spelled} ],
        b: View [ width = 10, height = 10 ],
      ],
    ]`);
    assert.equal(errs.length, 1, `${spelled}: one refusal: ${JSON.stringify(errs)}`);
    assert.match(errs[0], /View\.y — View's SimpleLayout places its children, so this child does not declare its y/, spelled);
    assert.match(errs[0], /ignoreLayout = true/, `${spelled}: offers the way out`);
    assert.match(errs[0], /@4$/, `${spelled}: at the child's own line`);
  }
});

await test("a replicated child is one declaration — one refusal, however many rows it builds", async () => {
  const errs = await refusals(`App [ width = 400, height = 300,
    rows: Dataset { { "items": [ { "n": 1 }, { "n": 2 }, { "n": 3 } ] } },
    col: View [ width = 200, height = 200, datapath = { app.rows.value },
      layout: SimpleLayout [ axis = y ],
      Row [ datapath = :items[], y = 40 ],
    ],
  ]
  class Row extends View [ width = 10, height = 10 ]`);
  assert.equal(errs.filter((e) => /Row\.y/.test(e)).length, 1, JSON.stringify(errs));
});

await test("a CLASS-BODY value is a default, not a declaration about this arrangement — exempt", async () => {
  // A class is written with no knowledge of where an instance will be used; its
  // body states the class's defaults. The use site is the line that speaks
  // about THIS arrangement, and only it is refused.
  const { value: app, lines } = await said(() => boot(`App [ width = 400, height = 300,
    col: View [ width = 200, height = 200,
      layout: SimpleLayout [ axis = y ],
      Pinned [ ], Pinned [ ],
    ],
  ]
  class Pinned extends View [ width = 10, height = 10, y = 40 ]`));
  assert.equal(layoutLines(lines).length, 0, "not a word: " + JSON.stringify(lines));
  assert.equal(app.col.children[1].y, 10, "the arrangement places the child");
});

await test("ignoreLayout = true takes the child out — its own x and y stand, in every spelling", async () => {
  const { value: app, lines } = await said(() => boot(`App [ width = 400, height = 300,
    col: View [ width = 200, height = 200,
      layout: SimpleLayout [ axis = y ],
      a: View [ width = 10, height = 10, y = 40, ignoreLayout = true ],
      b: View [ width = 10, height = 10, y = { 70 }, ignoreLayout = true ],
    ],
  ]`));
  assert.deepEqual(lines, [], "not a word: " + JSON.stringify(lines));
  assert.equal(app.col.a.y, 40);
  assert.equal(app.col.b.y, 70);
});

// ── 2 · What a layout places is read per instance ───────────────────────────

await test("a row places x; `align` adds y; a computed axis places either", async () => {
  const kids = `a: View [ width = 10, height = 10, y = 3 ], b: View [ width = 10, height = 10 ]`;
  assert.deepEqual(await refusals(`App [ width = 400, height = 100,
    row: View [ width = 300, layout: SimpleLayout [ axis = x, spacing = 4 ], ${kids} ] ]`), [],
    "a plain row leaves the cross axis to the child — the nudge stands");
  const aligned = await refusals(`App [ width = 400, height = 100,
    row: View [ width = 300, layout: SimpleLayout [ axis = x, align = center ], ${kids} ] ]`);
  assert.equal(aligned.length, 1);
  assert.match(aligned[0], /View\.y — .*does not declare its y\. Across the flow, where a child sits is the layout's 'align'/);
  const computed = await refusals(`App [ width = 400, height = 100,
    row: View [ width = 300, layout: SimpleLayout [ axis = { app.width < 300 ? "y" : "x" } ], ${kids} ] ]`);
  assert.equal(computed.length, 1);
  assert.match(computed[0], /its configuration is computed, so it may place either axis/);
});

await test("an author's layout: literal box keys are read at compile time; computed keys are the runtime's", async () => {
  const literal = await refusals(`class Diagonal extends Layout [
    place() { return this.laid().map((c, i) => ({ x: i * 20, y: i * 20 })) } ]
  App [ width = 400, height = 300,
    box: View [ layout: Diagonal [ ], a: View [ width = 10, height = 10, y = 5 ], b: View [ width = 12, height = 10 ] ] ]`);
  assert.equal(literal.length, 1, JSON.stringify(literal));
  assert.match(literal[0], /View\.y — View's Diagonal places its children/);
  // …and what its boxes do NOT carry stays the child's (width above compiled clean)
  const computed = await refusals(`class Axial extends Layout [
    place() { return this.laid().map((c, i) => { const b = ({}) as any; b["x"] = i * 20; b["y"] = 0; return b }) } ]
  App [ width = 400, height = 300,
    box: View [ layout: Axial [ ], a: View [ width = 10, height = 10, y = 5 ] ] ]`);
  assert.deepEqual(computed, [], "computed keys cannot be read — no answer here, the runtime's");
});

// ── 3 · ResponsiveLayout: both axes, align and offset ───────────────────────

await test("a ResponsiveLayout places both axes — a child's own y is refused; align and offset say where", async () => {
  const PLAN = `plan = { [({ from: 300, flow: "row", gap: 18, offset: ({ small: 2 }) }), ({ from: 0, flow: "stack", gap: 8 })] }`;
  const errs = await refusals(`App [ width = 800, height = 300,
    row: View [ width = 100%, height = 46, layout: ResponsiveLayout [ align = center, ${PLAN} ],
      big: View [ width = 240, height = 46 ], small: View [ width = 100, height = 16, y = center ] ] ]`);
  assert.equal(errs.length, 1, JSON.stringify(errs));
  assert.match(errs[0], /View\.y — View's ResponsiveLayout places its children.*a plan entry's 'offset'/);
  const app = await boot(`App [ width = 800, height = 300,
    row: View [ width = 100%, height = 46, layout: ResponsiveLayout [ align = center, ${PLAN} ],
      big: View [ width = 240, height = 46 ], small: View [ width = 100, height = 16 ] ] ]`);
  assert.equal(app.row.small.y, 17, "centred in the 46px row (15), then its tier's offset (+2)");
  assert.equal(app.row.small.x, 258, "…and placed along the row");
  app.width = 280;
  settle();
  // stacked, across is x: the layout's align reaches every tier, centring in the
  // view's own 280 — and the row's offset left with its tier
  assert.equal(app.row.big.x, 20, "(280 − 240) / 2");
  assert.equal(app.row.small.x, 90, "(280 − 100) / 2, no offset");
  assert.equal(app.row.small.y, 54, "below the 46px child and the stack's gap");
});

await test("a plan's share sizes a named child, and share: 0 shows and hides it — neither is the child's to declare", async () => {
  const errs = await refusals(`App [ width = 800, height = 300,
    row: View [ width = 100%, layout: ResponsiveLayout [ plan = { [
        ({ from: 600, flow: "row", share: ({ a: 60, b: "auto" }) }),
        ({ from: 0, flow: "stack", share: ({ c: 0 }) })] } ],
      a: View [ width = 120, height = 10 ],
      b: View [ width = 120, height = 10 ],
      c: View [ height = 10, visible = { app.width > 1 } ] ] ]`);
  assert.equal(errs.length, 2, JSON.stringify(errs));
  assert.ok(errs.some((e) => /View\.width — .*a plan gives it a share of the width/.test(e)), "a's width");
  assert.ok(errs.some((e) => /View\.visible — .*a plan drops it \(share: 0\)/.test(e)), "c's visible");
});

// ── 4 · What only exists at run time: the runtime holds the line ────────────

/** A two-tier plan in miniature, assigned at run time: narrow, it only places;
 *  wide, it allocates 40/60 of the run. Shares are keyed by TREE index, so a
 *  child leaving the arrangement does not shift its sibling's share. */
class Tiers extends Layout {
  place() {
    const kids = this.laid();
    const W = this.contentExtent("width");
    const wide = W >= 500;
    const share = [0.4, 0.6];
    let x = 0;
    return kids.map((c) => {
      if (!wide) {
        const b = { x };
        x += c.width + 10;
        return b;
      }
      const w = share[this.view.children.indexOf(c)] * W;
      const b = { x, w };
      x += w + 10;
      return b;
    });
  }
}

await test("a tier flip that cannot size a child leaves NO HOLE, and reports binding and literal alike", async () => {
  const { value: app, lines } = await said(async () => {
    const app = await boot(`App [ width = 400, height = 100,
      logo: View [ width = { parent.width / 4 }, height = 20 ],
      nav: View [ width = 50, height = 20 ],
    ]`);
    app.layout = new Tiers();
    settle();
    assert.equal(app.logo.width, 100, "narrow: the child's own width");
    assert.equal(app.nav.x, 110, "…and the run advanced over it");
    app.width = 800;
    settle();
    settle(); // a second wave must not re-report
    return app;
  });
  const bound = bindingLines(lines);
  assert.equal(bound.length, 1, "the binding, once across two waves: " + JSON.stringify(lines));
  assert.match(bound[0], /View\.width .*App's Tiers sizes its children, so this child does not declare its width/);
  assert.match(bound[0], /\(line \d+, col \d+\)/, "the author's line");
  const lit = literalLines(lines);
  assert.equal(lit.length, 1, "the sibling's literal, once, in the same words");
  assert.match(lit[0], /View\.width = 50 .*does not declare its width/);
  assert.ok(lines.every((l) => !/^\s*$/.test(l)));
  assert.equal(app.logo.width, 200, "the author keeps the width");
  assert.equal(app.nav.x, 0, "the run does not advance over a child it does not lay");
  assert.equal(app.nav.width, 480, "…and the child it does lay gets its share");
});

await test("a refused POSITION at run time leaves the child in the arrangement", async () => {
  class Stack extends Layout {
    place() {
      let y = 0;
      return this.laid().map((c) => { const b = { y }; y += c.height + 2; return b; });
    }
  }
  const { value: app, lines } = await said(async () => {
    const app = await boot(`App [ width = 100, height = 300,
      a: View [ width = 10, height = 10, y = { 40 } ],
      b: View [ width = 10, height = 10 ],
      c: View [ width = 10, height = 10 ],
    ]`);
    app.layout = new Stack();
    settle();
    return app;
  });
  assert.equal(layoutLines(lines).length, 1, "one report: " + JSON.stringify(lines));
  assert.equal(app.a.y, 40, "the author keeps the position");
  assert.equal(app.b.y, 12, "…and the run still counts the child's place (10 + 2)");
  assert.equal(app.c.y, 24);
});

class Pair extends TweenLayout {
  place() {
    return this.laid().map((c, i) => ({ x: i * 50, y: 0, w: 40, h: 20, vis: true }));
  }
}

await test("a TweenLayout conflict names the strategy and offers the way out", async () => {
  await assert.rejects(
    async () => {
      const app = await boot(`App [ width = 200, height = 100,
        a: View [ width = { 33 }, height = 10 ],
        b: View [ width = 10, height = 10 ],
      ]`);
      app.layout = new Pair();
      settle();
    },
    (e) => {
      assert.match(e.message, /View\.width/);
      assert.match(e.message, /App's Pair sizes its children, so this child does not declare its width/);
      assert.match(e.message, /ignoreLayout = true/);
      return true;
    }
  );
});

await test("a TweenLayout reports a literal it places, in the same words", async () => {
  const { value: app, lines } = await said(async () => {
    const app = await boot(`App [ width = 200, height = 100,
      a: View [ width = 33, height = 10 ],
      b: View [ width = 10, height = 10 ],
    ]`);
    app.layout = new Pair();
    settle();
    return app;
  });
  const lit = literalLines(lines);
  assert.ok(lit.some((l) => /View\.width = 33/.test(l)), "the literal is named: " + JSON.stringify(lines));
  assert.ok(lit.every((l) => /App's Pair/.test(l)), "every line names the strategy");
  assert.equal(app.a.width, 40, "the arrangement places it");
});

// ── 5 · Size and the content size (§4) ───────────────────────────────────

/** A content size is measured once a backend is attached — the way every app
 *  boots — so this section boots through the headless host. */
async function bootAttached(src) {
  const r = await compile(src, {});
  assert.equal(r.errors.length, 0, r.errors.map((e) => e.message).join("; "));
  return settleHeadless(r.source, { deps: r.deps });
}

await test("a child sized from its parent does not count toward the parent's content size — in any spelling", async () => {
  const app = await bootAttached(`App [ width = 600, height = 300,
    p1: View [ a: View [ width = 100, height = 10 ], s: View [ width = 100%, height = 10 ] ],
    p2: View [ y = 40, a: View [ width = 100, height = 10 ], s: View [ width = { parent.width }, height = 10 ] ],
    p3: View [ y = 80, a: View [ width = 100, height = 10 ], s: View [ width = { this.parent.contentWidth + 0 }, height = 10 ] ] ]`);
  assert.deepEqual([app.p1.width, app.p2.width, app.p3.width], [100, 100, 100], "each parent sizes from its other child");
  assert.deepEqual([app.p1.s.width, app.p2.s.width, app.p3.s.width], [100, 100, 100], "…and the derived child follows it");
});

await test("a backdrop matching its siblings' width is exactly as wide as the rest of the content", async () => {
  const app = await bootAttached(`App [ width = 600, height = 300,
    card: View [ a: View [ width = 120, height = 20 ], b: View [ y = 30, width = 200, height = 20 ],
      bg: View [ width = { parent.contentWidth }, height = 4 ] ] ]`);
  assert.equal(app.card.width, 200);
  assert.equal(app.card.bg.width, 200);
});

await test("each axis is its own question — width flows down to a wrapping Text, its height comes back up", async () => {
  const app = await bootAttached(`App [ width = 600, height = 400,
    card: View [ width = 320, padding = 20,
      body: Text [ width = 100%, wrap = true, text = "a paragraph that wraps over more than one line in a narrow card of a fixed width" ] ] ]`);
  assert.equal(app.card.body.width, 280, "the card's width, less its padding, handed down");
  assert.ok(app.card.body.height > 20, "the text wrapped");
  assert.equal(app.card.height, app.card.body.height + 40, "…and its height sized the card, padding included");
});

await test("a child that is its parent's only content and is sized from it has nothing to follow — reported, naming both", async () => {
  const { value: app, lines } = await said(() => bootAttached(`App [ width = 600, height = 300,
    card: View [ fill = gray, body: View [ width = { parent.contentWidth - 40 }, height = 20 ] ] ]`));
  assert.equal(app.card.width, 0, "the parent has no width to give");
  assert.equal(app.card.body.width, -40, "…so the arithmetic lands below zero, deterministically — no walk");
  const neg = lines.filter((l) => /is -40/.test(l));
  assert.equal(neg.length, 1, JSON.stringify(lines));
  assert.match(neg[0], /View\.width is -40 \(line \d+, col \d+\) — it is sized from its parent \(View\), which takes its width from its content, and this child is the only content it has/);
  assert.match(neg[0], /Give View a width, or use its padding/);
});

await test("ordinary arithmetic below zero is not a mistake — a closed section's field says nothing", async () => {
  // The accordion idiom: a field sized from its section's GIVEN height, the
  // section closed to less than the field's offset. The field is below zero
  // exactly while it is meant to be hidden, and a negative size draws nothing.
  const { value: app, lines } = await said(() => bootAttached(`App [ width = 600, height = 300,
    section: View [ width = 300, height = 46, clip = true,
      field: View [ y = 50, width = 280, height = { parent.height - 60 } ] ] ]`));
  assert.equal(app.section.field.height, -14);
  assert.deepEqual(lines.filter((l) => /is -\d/.test(l)), [], JSON.stringify(lines));
});

summarize("layout-claims");
