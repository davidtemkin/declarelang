// test/layout-claims.test.mjs — what a layout's CLAIM does to a value the
// author wrote on the same slot, and how the language says so.
//
// The one-owner-per-slot model is settled: a strategy owns exactly the slots
// its place() boxes carry, per child, and `ignoreLayout = true` is how a child
// takes its whole geometry back. What this file pins is the ANSWER'S SHAPE,
// which turns on one distinction (layout.ts header; DT's ruling, 2026-09-20):
//
//   A LITERAL IS A BASE.   `width = 120` on a claimed slot is the value the
//                          slot holds when nothing arranges it — shadowed while
//                          a regime claims it, restored by unclaim() when that
//                          regime ends. Not a conflict; not reported.
//   A BINDING IS A CLAIM.  `width = { 120 }` / `50%` / `center` on a claimed
//                          slot is a second standing computation — two owners,
//                          no determinate answer. A conflict: refused, reported
//                          once, in words that name the strategy, the slot, the
//                          author's line, and both ways out.
//
// The literal report that stood from 2026-09-19 to 2026-09-20 ("this value is
// discarded") is gone: it was false for any strategy whose claims vary by
// regime (ResponsiveLayout writes y in one tier and not the other), and it was
// decided by whichever width happened to be current at install. The test that
// pins its absence also pins WHY — the base comes back when the claim lifts.
//
// The rest stands as measured on 2026-09-19: a refused SIZE takes the child
// out of the arrangement rather than leaving a hole behind it, and every
// conflict message carries the author's position and names the strategy —
// TweenLayout's included, which until then degraded to "already bound (by
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

/** Run `fn` with both report channels captured — a refused claim speaks on
 *  console.error; console.warn is captured too, so a test can assert that a
 *  shadowed literal says nothing on either. */
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
/** Every layout↔author line is a refused CLAIM — a shadowed literal says
 *  nothing (header). Kept under its old name so the tests below read as before. */
const conflicts = layoutLines;

// ── 1 · A literal on a claimed slot is a BASE: shadowed in silence ──────────

await test("a use-site literal on a claimed slot is a base — shadowed in silence, the arrangement owns it", async () => {
  const { value: app, lines } = await said(() => boot(`App [ width = 400, height = 300,
    col: View [ width = 200, height = 200,
      layout: SimpleLayout [ axis = y, spacing = 4 ],
      a: View [ width = 10, height = 10, y = 40 ],
      b: View [ width = 10, height = 10 ],
    ],
  ]`));
  assert.equal(layoutLines(lines).length, 0, "a literal is the base the claim shadows — nothing to report: " + JSON.stringify(lines));
  assert.equal(app.col.a.y, 0, "the arrangement owns the slot");
  assert.equal(app.col.b.y, 14);
});

await test("the base comes back when the claim lifts — a literal is live in the regime that does not write it", async () => {
  // THE REASON a literal is not a conflict. A row tier writes x and leaves y
  // to the author; a stack tier writes y. So `y = 15` is live at 800 wide,
  // shadowed at 400 (the stack claims y), and live again at 800 — unclaim()
  // hands the base back. The report this replaces called that value
  // "discarded", and was decided by whichever width was current at install:
  // true at neither.
  const { value: app, lines } = await said(async () => {
    const app = await boot(`App [ width = 800, height = 300,
      row: View [ width = { app.width }, height = 100,
        layout: ResponsiveLayout [ plan = { [({ from: 600, flow: "row", gap: 10 }), ({ from: 0, flow: "stack", gap: 4 })] } ],
        a: View [ width = 100, height = 20 ],
        b: View [ width = 100, height = 20, y = 15 ],
      ],
    ]`);
    assert.equal(app.row.b.y, 15, "wide: the row tier writes x only — the author's y is live");
    assert.equal(app.row.b.x, 110, "…and the row placed it");
    app.width = 400; settle();
    assert.notEqual(app.row.b.y, 15, "narrow: the stack tier claims y and shadows the literal");
    assert.ok(app.row.b.y > 0, "…with the stack's own placement");
    app.width = 800; settle();
    assert.equal(app.row.b.y, 15, "wide again: the claim lifted and the base came back — never discarded");
    return app;
  });
  assert.equal(layoutLines(lines).length, 0, "and none of it is reported: " + JSON.stringify(lines));
});

await test("a CLASS-BODY literal is exempt — that is how a class states a default", async () => {
  // `class Spacer extends View [ width = 0, height = 0 ]` is the library's own
  // way to give a class an initial size for an inherited slot; it is written
  // with no knowledge of where an instance will be used, and the same class
  // may sit in five trees of which one has a sizing layout. Reporting it puts
  // a line an author cannot act on into every build. A literal is a base
  // wherever it is written — use site or class body — and neither is reported;
  // this pins the class-body half on its own.
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
  // The sibling's own `width = 50` is a BASE the wide tier shadows — not a
  // conflict, and not reported: the refused binding above is the whole report.
  assert.equal(layoutLines(lines).length, 1, "one line, the binding's: " + JSON.stringify(lines));

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

await test("a TweenLayout shadows a literal in silence, like every other strategy", async () => {
  const { value: app, lines } = await said(async () => {
    const app = await boot(`App [ width = 200, height = 100,
      a: View [ width = 33, height = 10 ],
      b: View [ width = 10, height = 10 ],
    ]`);
    app.layout = new Pair();
    settle();
    return app;
  });
  assert.equal(layoutLines(lines).length, 0, "a literal is a base here too: " + JSON.stringify(lines));
  assert.equal(app.a.width, 40, "the arrangement owns it, as it always did");
});

summarize("layout-claims");
