// test/layout-claims.test.mjs — what a layout's CLAIM does to a value the
// author wrote on the same slot, and how the language says so.
//
// The one-owner-per-slot model is settled: a strategy owns exactly the slots
// its place() boxes carry, per child, and `ignoreLayout = true` is how a child
// takes its whole geometry back. What was not settled was the ANSWER'S SHAPE.
// Measured before this file existed (layout-ownership study, 2026-09-19), one
// intent got three answers depending only on how the value was spelled:
//
//   width = { 120 } / 50% / center  on a claimed slot → a thrown boot failure
//   width = 120                     on a claimed slot → SILENTLY discarded,
//                                                       clean through R4
//   a claim refused on a REARM      (a tier flip)     → one console line, and
//                                                       then the arrangement
//                                                       kept advancing by the
//                                                       width it never wrote —
//                                                       a live 116px hole, R4
//                                                       and R5 both green
//
// This file pins the three answers as they now are: the literal is reported in
// the same words as the throw, a refused SIZE takes the child out of the
// arrangement rather than leaving a hole behind it, and every message carries
// the author's position and names the strategy that claimed the slot —
// TweenLayout's included, which until now degraded to "already bound (by
// Grid[0].width)" and named neither the layout nor an escape.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate } from "../runtime/dist/instantiate.js";
import { settle, provideMeasurer } from "../runtime/dist/index.js";
import { Layout, TweenLayout } from "../runtime/dist/layout.js";
import { approximateMeasurer } from "../compiler/dist/headless.js";

provideMeasurer(approximateMeasurer());

async function boot(src) {
  const b = await compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  const app = instantiate(b.program);
  settle();
  return app;
}

/** Run `fn` with both report channels captured — the layout↔author family
 *  speaks on console.warn (a value that can never take effect) and
 *  console.error (a claim it could not install), and a test about the family
 *  wants both. */
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

const layoutLines = (lines) => lines.filter((l) => /cannot also own its/.test(l));
/** The two halves of the family: a CLAIM the strategy could not install, and a
 *  VALUE the strategy overwrote. They share every other word. */
const conflicts = (lines) => layoutLines(lines).filter((l) => !/is discarded/.test(l));
const discards = (lines) => layoutLines(lines).filter((l) => /is discarded/.test(l));

// ── 1 · A literal on a claimed slot is reported, in the thrown case's words ──

await test("a use-site literal on a claimed slot is REPORTED, not silently discarded", async () => {
  const { value: app, lines } = await said(() => boot(`App [ width = 400, height = 300,
    col: View [ width = 200, height = 200,
      layout: SimpleLayout [ axis = y, spacing = 4 ],
      a: View [ width = 10, height = 10, y = 40 ],
      b: View [ width = 10, height = 10 ],
    ],
  ]`));
  const said1 = layoutLines(lines);
  assert.equal(said1.length, 1, "exactly one report: " + JSON.stringify(said1));
  const m = said1[0];
  // WHAT the value was, WHO claimed the slot, WHICH slot, and BOTH ways out —
  // the same four things the thrown case has always carried.
  assert.match(m, /View\.y = 40/, "names the slot and the value being dropped");
  assert.match(m, /App's SimpleLayout|col's SimpleLayout|View's SimpleLayout/, "names the strategy that claimed it");
  assert.match(m, /positions its children/);
  assert.match(m, /this value is discarded/);
  assert.match(m, /drop the child's own y/, "the first way out");
  assert.match(m, /ignoreLayout = true/, "the second way out");
  assert.match(m, /\(line \d+, col \d+\)/, "points at a line");
  // …and the picture is exactly what it was: the arrangement still owns the slot.
  assert.equal(app.col.a.y, 0, "the layout's value stands — only the silence went away");
  assert.equal(app.col.b.y, 14);
});

await test("the report is once per (class, slot) — one line, not one per instance", async () => {
  // A replicated block builds one authored line thirty times. Deduping per
  // CHILD (which is what a conflict does — a conflict is about that child's
  // standing binding) would print it thirty times, and there is one line to
  // fix. So this half of the family dedupes by class and slot.
  const { lines } = await said(() => boot(`App [ width = 400, height = 300,
    col: View [ width = 200, height = 200,
      layout: SimpleLayout [ axis = y ],
      Row [ y = 40 ], Row [ y = 40 ], Row [ y = 40 ], Row [ y = 40 ],
    ],
  ]
  class Row extends View [ width = 10, height = 10 ]`));
  const said1 = layoutLines(lines);
  assert.equal(said1.length, 1, "four instances, one line: " + JSON.stringify(said1));
  assert.match(said1[0], /Row\.y = 40/);
});

await test("a CLASS-BODY literal is exempt — that is how a class states a default", async () => {
  // `class Spacer extends View [ width = 0, height = 0 ]` is the library's own
  // way to give a class an initial size for an inherited slot; it is written
  // with no knowledge of where an instance will be used, and the same class
  // may sit in five trees of which one has a sizing layout. Reporting it puts
  // a line an author cannot act on into every build. The use site is the line
  // that is a statement about THIS arrangement, and only it is reported.
  const { value: app, lines } = await said(() => boot(`App [ width = 400, height = 300,
    col: View [ width = 200, height = 200,
      layout: SimpleLayout [ axis = y ],
      Pinned [ ], Pinned [ ],
    ],
  ]
  class Pinned extends View [ width = 10, height = 10, y = 40 ]`));
  assert.equal(layoutLines(lines).length, 0, "the class body says nothing: " + JSON.stringify(lines));
  assert.equal(app.col.children[1].y, 10, "…and the arrangement still owns the slot");
});

await test("ignoreLayout = true silences everything — the documented escape", async () => {
  const { value: app, lines } = await said(() => boot(`App [ width = 400, height = 300,
    col: View [ width = 200, height = 200,
      layout: SimpleLayout [ axis = y ],
      a: View [ width = 10, height = 10, y = 40, ignoreLayout = true ],
      b: View [ width = 10, height = 10, y = { 70 }, ignoreLayout = true ],
    ],
  ]`));
  assert.deepEqual(lines, [], "not a word: " + JSON.stringify(lines));
  assert.equal(app.col.a.y, 40, "the literal stands — the child is out of the arrangement");
  assert.equal(app.col.b.y, 70, "and so does the binding, which would otherwise throw");
});

// ── 2 · The bound spelling still refuses — now with a position ───────────────

await test("a formula on a claimed slot is still a hard refusal, and now names the line", async () => {
  for (const bound of ["y = { parent.height - 10 }", "y = 50%", "y = center"]) {
    await assert.rejects(
      () => boot(`App [ width = 400, height = 300,
        layout: SimpleLayout [ axis = y ],
        View [ width = 10, height = 10, ${bound} ],
      ]`),
      (e) => {
        assert.match(e.message, /View\.y/, bound);
        assert.match(e.message, /App's SimpleLayout positions its children/, bound);
        assert.match(e.message, /ignoreLayout = true/, bound);
        assert.match(e.message, /\(line \d+, col \d+\)/, `${bound}: carries the author's position`);
        return true;
      },
      bound
    );
  }
});

// ── 3 · A refused SIZE claim: the child leaves, the run does not lie ─────────

/** A two-tier plan in miniature: narrow, it only places (no size claim at all);
 *  wide, it allocates 40/60 of the run — the shape the tier flip changes, and
 *  the one the shape watcher rearms on. Shares are keyed by TREE index, so a
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

await test("a tier flip that cannot claim a width leaves NO HOLE, and reports", async () => {
  const { value: app, lines } = await said(async () => {
    const app = await boot(`App [ width = 400, height = 100,
      logo: View [ width = { parent.width / 4 }, height = 20 ],
      nav: View [ width = 50, height = 20 ],
    ]`);
    app.layout = new Tiers();
    settle();
    // Narrow: the plan claims no size, so the author's width is uncontested
    // and the run is honest — clean, exactly as it was before this change.
    assert.equal(app.logo.width, 100, "narrow: the child's own width");
    assert.equal(app.nav.x, 110, "…and the run advanced over it");
    // The flip: the wide tier wants to allocate logo's width, and cannot.
    app.width = 800;
    settle();
    settle(); // a second wave must not re-report
    return app;
  });

  const refused = conflicts(lines);
  assert.equal(refused.length, 1, "reported once across two waves, not a storm: " + JSON.stringify(lines));
  assert.match(refused[0], /View\.width/, "names the slot");
  assert.match(refused[0], /App's Tiers sizes its children/, "names the strategy that claimed it");
  assert.match(refused[0], /ignoreLayout = true/, "and the way out");
  assert.match(refused[0], /\(line \d+, col \d+\)/, "and the author's line");
  // The sibling's own `width = 50` is the OTHER half of the family — a literal
  // the wide tier overwrites — and it is reported in the same words.
  assert.equal(discards(lines).length, 1, "and the sibling's literal, once");

  // THE GEOMETRY. The author owns logo.width, so the arrangement does not size
  // it — and therefore must not lay its neighbour from a width it never wrote.
  // Before: nav sat at 0.4·800 + 10 = 330 while logo ended at 200, a 130px hole
  // nothing reported and no rung could see. Now logo is out of the arrangement
  // altogether (the resolution the message names), and nav starts the run.
  assert.equal(app.logo.width, 200, "the author keeps the slot — one owner, unchanged");
  assert.equal(app.nav.x, 0, "the run does not advance over a child it does not lay");
  assert.equal(app.nav.width, 480, "…and the child it DOES lay gets its share of the wide tier");
});

await test("a refused POSITION claim leaves the child in the arrangement", async () => {
  // Only a SIZE feeds the next child's position, so a position the author owns
  // costs its siblings nothing: that child sits where its author put it and
  // the rest of the run is untouched. (Dropping it instead would collapse the
  // run over a child that is still on screen.)
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
  assert.equal(app.a.y, 40, "the author keeps the slot");
  assert.equal(app.b.y, 12, "…and the run still counts the child's place (10 + 2)");
  assert.equal(app.c.y, 24);
});

// ── 4 · TweenLayout names itself ────────────────────────────────────────────

class Pair extends TweenLayout {
  place() {
    return this.laid().map((c, i) => ({ x: i * 50, y: 0, w: 40, h: 20, vis: true }));
  }
}

await test("a TweenLayout conflict names the strategy and offers the escape", async () => {
  // It claims x/y/width/height/visible on every laid child, unconditionally —
  // the one strategy where a child genuinely cannot own its own size — and its
  // message used to be the generic "View.width is already bound (by
  // Grid[0].width)": no layout named, no `ignoreLayout` offered.
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
      assert.match(e.message, /App's Pair sizes its children/, "names the strategy");
      assert.match(e.message, /ignoreLayout = true/, "offers the escape");
      return true;
    }
  );
});

await test("a TweenLayout reports a discarded literal like every other strategy", async () => {
  const { value: app, lines } = await said(async () => {
    const app = await boot(`App [ width = 200, height = 100,
      a: View [ width = 33, height = 10 ],
      b: View [ width = 10, height = 10 ],
    ]`);
    app.layout = new Pair();
    settle();
    return app;
  });
  const said1 = layoutLines(lines);
  assert.ok(said1.some((l) => /View\.width = 33/.test(l)), "the literal is named: " + JSON.stringify(said1));
  assert.ok(said1.every((l) => /App's Pair/.test(l)), "every line names the strategy");
  assert.equal(app.a.width, 40, "the arrangement owns it, as it always did");
});

summarize("layout-claims");
