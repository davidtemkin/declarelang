// Materialization (B5, materialization.md — D5 RULED 2026-07-30): invisible
// windowing behind the `virtualize` policy slot. The tiers here are the design
// doc's own verification order: the windowed match + extent model, the
// membership-anchored lifecycle, divergence retention (keep-alive), the
// childViews refusal, navigate-to-logical-record — and the SEMANTIC DIFFER
// (§8 item 4): the same program and interaction script with windowing on and
// off must produce identical observable state. That differ is the
// invisibility claim made executable.

import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { build, settle } from "../runtime/dist/index.js";
import { blocksOf, materializationInfo } from "../runtime/dist/replicate.js";

const rows = (n) => Array.from({ length: n }, (_, i) => ({ n: i, label: "row " + i }));

/** Compile + build the standard fixture: a scroller over a windowed block.
 *  `policy` is the virtualize attr's value; rows arrive imperatively so one
 *  fixture serves every tier. */
function makeApp(policy, n = 1000) {
  const src = `App [ width = 400, height = 400,
    counter: number = 0,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width = 300, height = 300,
      content: View [ width = 300, datapath = { d.value },
        View [ datapath = :rows[], virtualize = ${policy}, width = 300, height = 30,
          flag: boolean = false,
          onInit() { app.counter = app.counter + 1 },
          t: Text [ text = :label ],
        ],
      ],
    ],
  ]`;
  const r = compile(src);
  assert.deepEqual(r.errors.map((e) => e.message), [], "fixture compiles");
  const app = build(r.source);
  app.d.value = { rows: rows(n) };
  settle();
  return app;
}

const block = (app) => blocksOf(app.sc.content)[0];
const texts = (app) => block(app).realized().map((w) => ({ index: w.index, text: w.view.t.text }));

await test("windowed: only the window materializes; the parent extent reads N × unit", () => {
  const app = makeApp("true", 1000);
  const info = materializationInfo(app.sc.content);
  assert.equal(info.windowed, true, "policy true engages");
  assert.equal(info.logical, 1000);
  assert.ok(info.materialized < 50, `a 300px viewport over 30px rows materializes a window, not 1000 (got ${info.materialized})`);
  assert.ok(info.materialized >= 10, "the viewport plus buffers is materialized");
  assert.equal(info.extent, "measured", "the first real row corrected the estimate");
  assert.equal(app.sc.content.height, 1000 * 30, "the scroll range reads the LOGICAL extent");
  // Rows sit at their logical places.
  for (const { index, text } of texts(app)) {
    assert.equal(text, "row " + index, "each instance shows its logical record");
  }
});

await test("windowed: scrolling moves the window; instances land at logical y", () => {
  const app = makeApp("true", 1000);
  app.sc.scrollY = 15000; // row 500's neighborhood
  settle();
  const w = block(app).realized();
  assert.ok(w.some(({ index }) => index === 500), "row 500 materialized");
  assert.ok(!w.some(({ index }) => index < 480), "the top of the list is dematerialized");
  for (const { view, index } of w) {
    assert.equal(view.y, index * 30, "logical placement");
    assert.equal(view.t.text, "row " + index);
  }
});

await test("membership-anchored onInit (D5): once per membership, never per reconstruction", () => {
  const app = makeApp("true", 1000);
  const afterBoot = app.counter;
  // Init fires once per member EVER materialized: the estimate-then-correct
  // boot may briefly materialize a few beyond the corrected window, so the
  // counter is ≥ the settled window and still window-scale, never N-scale.
  assert.ok(afterBoot >= materializationInfo(app.sc.content).materialized, "every materialized member fired once");
  assert.ok(afterBoot < 60, `boot init is window-scale, not dataset-scale (got ${afterBoot})`);
  app.sc.scrollY = 15000;
  settle();
  const afterJump = app.counter;
  assert.ok(afterJump > afterBoot, "new members fire on first materialization");
  // A full round trip may still meet a few first-timers (the velocity
  // overscan widens the window in the direction of travel) — the INVARIANT
  // is that a REPEATED identical trip fires nothing: every member met on
  // the first cycle is recorded, and reconstruction is not membership.
  app.sc.scrollY = 0;
  settle();
  app.sc.scrollY = 15000;
  settle();
  const afterCycle = app.counter;
  app.sc.scrollY = 0;
  settle();
  app.sc.scrollY = 15000;
  settle();
  assert.equal(app.counter, afterCycle, "the second identical round trip refires NOTHING");
});

await test("divergence retention + RECYCLING (D5 + the scrub bench): touched rows retain; clean leavers RE-POINT", () => {
  const app = makeApp("true", 1000);
  const w = block(app).realized();
  const touched = w.find(({ index }) => index === 3).view;
  const neighbor = w.find(({ index }) => index === 4).view;
  touched.flag = true; // a direct write on an armed instance — the divergence bit
  app.sc.scrollY = 15000;
  settle();
  assert.ok(app.sc.content.children.includes(touched), "the touched instance is RETAINED alive off-window");
  // RECYCLING: a clean leaver is not discarded — it re-points at an
  // arriving record (cursor setBound; everything downstream re-derives),
  // so a scrollbar scrub costs derives, not construction.
  assert.ok(app.sc.content.children.includes(neighbor), "the clean neighbor was RECYCLED, not discarded");
  const servedIdx = block(app).realized().find(({ view }) => view === neighbor)?.index;
  assert.ok(servedIdx !== undefined && servedIdx > 100, `…and now serves a far-window record (idx ${servedIdx})`);
  assert.equal(neighbor.t.text, "row " + servedIdx, "its bindings re-derived to the new record");
  assert.equal(neighbor.flag, false, "declaration-identical — no state leaked across records");
  const midInfo = materializationInfo(app.sc.content);
  assert.equal(midInfo.retained, 1, "the retained set is exactly the touched set");
  app.sc.scrollY = 0;
  settle();
  const back = block(app).realized();
  assert.equal(back.find(({ index }) => index === 3).view, touched, "the SAME touched instance returns");
  assert.equal(touched.flag, true, "its divergent state rode along");
  assert.equal(back.find(({ index }) => index === 4).view.flag, false, "a clean slot presents declaration state");
  assert.equal(back.find(({ index }) => index === 4).view.t.text, "row 4", "…bound to its record");
  assert.equal(materializationInfo(app.sc.content).retained, 0, "back in the window, nothing is retained");
});

// TRANSPARENT, not abstracted (RULED 2026-08-02, superseding D5's refusal).
// childViews used to throw on a windowed block, because a partial answer was
// indistinguishable from a whole one. Virtualization is explicit at the source
// now, and `virtualized` makes it legible at runtime — so the subset is a
// readable fact rather than a trap, and the read answers.
await test("childViews is transparent on a virtualized block, and `virtualized` says so", () => {
  const app = makeApp("true", 1000);
  const kids = app.sc.content.childViews;
  assert.ok(Array.isArray(kids), "it answers rather than throwing");
  assert.ok(kids.length > 0 && kids.length < 100,
    `the instances that exist — a window, not 1000 (got ${kids.length})`);
  assert.equal(app.sc.content.virtualized, true, "and the flag makes the subset legible");

  const small = makeApp("false", 20);
  assert.equal(small.sc.content.childViews.length, 20, "a full block answers with everything");
  assert.equal(small.sc.content.virtualized, false, "…and reports itself unvirtualized");
});

await test("`virtualized` is TRACKED: a constraint on it follows engage/disengage", () => {
  const src = `App [ width = 400, height = 400,
    big: boolean = false,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width = 300, height = 300,
      content: View [ width = 300, datapath = { d.value },
        View [ datapath = :rows[], virtualize = { app.big }, width = 300, height = 30 ] ] ],
    flag: boolean = { app.sc.content.virtualized } ]`;
  const r = compile(src);
  assert.deepEqual(r.errors.map((e) => e.message), []);
  const app = build(r.source);
  app.d.value = { rows: rows(400) };
  settle();
  assert.equal(app.flag, false, "a constraint reads it before engaging");
  app.big = true; settle();
  assert.equal(app.flag, true, "…and re-runs when the block engages");
  app.big = false; settle();
  assert.equal(app.flag, false, "…and again when it disengages");
});

await test("navigate-to-logical-record (§3.5): the destination materializes on arrival", () => {
  const app = makeApp("true", 1000);
  block(app).navigateTo(800);
  settle();
  const w = block(app).realized();
  assert.ok(w.some(({ index, view }) => index === 800 && view.t.text === "row 800"), "row 800 landed materialized");
  assert.ok(Math.abs(app.sc.scrollY - 800 * 30) <= 30 * 6, "the scroll box moved to the record's place");
});

// A `{ }` policy is read inside the replication match, so it is TRACKED: the
// block engages and disengages as the answer changes, without rebuilding the
// program. This is why the slot is a boolean rather than an enum — every other
// boolean in the language takes a constraint, and this one had to as well or
// it would be a boolean that lies about being one.
await test("the policy is REACTIVE: `virtualize = { … }` engages and disengages", () => {
  const src = `App [ width = 400, height = 400,
    big: boolean = false,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width = 300, height = 300,
      content: View [ width = 300, datapath = { d.value },
        View [ datapath = :rows[], virtualize = { app.big }, width = 300, height = 30,
          t: Text [ text = :label ] ] ] ] ]`;
  const r = compile(src);
  assert.deepEqual(r.errors.map((e) => e.message), [], "a { } policy compiles");
  const app = build(r.source);
  app.d.value = { rows: rows(400) };
  settle();
  assert.equal(materializationInfo(app.sc.content).windowed, false, "starts full — the constraint reads false");
  assert.equal(app.sc.content.childViews.length, 400, "…every record constructed");

  app.big = true; settle();
  const on = materializationInfo(app.sc.content);
  assert.equal(on.windowed, true, "flipping the dependency ENGAGES windowing — no rebuild, no reload");
  assert.ok(on.materialized < 50, `a window, not 400 (got ${on.materialized})`);

  app.big = false; settle();
  assert.equal(materializationInfo(app.sc.content).windowed, false, "and DISENGAGES back to full materialization");
  assert.equal(app.sc.content.childViews.length, 400, "every record is present again");
});

await test("the policy slot: a boolean, and honest fallbacks", () => {
  const off = makeApp("false", 2000);
  assert.equal(materializationInfo(off.sc.content).windowed, false, "the default is full materialization at any size");
  assert.equal(off.sc.content.childViews.length, 2000, "…and semantically untouched");
  const on = makeApp("true", 50);
  assert.equal(materializationInfo(on.sc.content).windowed, true, "true virtualizes regardless of count — no threshold");
  // A VERTICAL SimpleLayout COMPOSES (the layout-aware window's first case):
  // the pass suspends, its spacing folds into the unit, rows sit at logical
  // positions. Any other arrangement still falls back with the reason named.
  const src = `App [ width = 400, height = 400,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width = 300, height = 300,
      content: View [ width = 300, datapath = { d.value },
        layout: SimpleLayout [ axis = y, spacing = 10 ],
        View [ datapath = :rows[], virtualize = true, width = 300, height = 30, t: Text [ text = :label ] ],
      ],
    ],
  ]`;
  const r = compile(src);
  assert.deepEqual(r.errors, []);
  const app = build(r.source);
  app.d.value = { rows: rows(1500) };
  settle();
  const info = materializationInfo(app.sc.content);
  assert.equal(info.windowed, true, "a vertical stack windows WITH its layout");
  assert.ok(info.materialized < 60, "windowed under SimpleLayout");
  assert.equal(app.sc.content.height, 1500 * 40, "extent folds the spacing into the unit");
  const w = blocksOf(app.sc.content)[0].realized();
  for (const { view, index } of w) assert.equal(view.y, index * 40, "logical placement includes the gap");
  const xsrc = `App [ width = 400, height = 400,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width = 300, height = 300,
      content: View [ width = 300, datapath = { d.value },
        layout: SimpleLayout [ axis = x ],
        View [ datapath = :rows[], virtualize = true, width = 30, height = 30, t: Text [ text = :label ] ],
      ],
    ],
  ]`;
  const xr = compile(xsrc);
  assert.deepEqual(xr.errors, []);
  const xapp = build(xr.source);
  xapp.d.value = { rows: rows(1500) };
  settle();
  const xinfo = materializationInfo(xapp.sc.content);
  assert.equal(xinfo.windowed, false, "an unpredictable arrangement still falls back to full");
  assert.match(xinfo.fallback, /windowing cannot predict/);
});

await test("membership init also governs keyed re-derivation (the ruling is general, not windowing-only)", () => {
  const src = `App [ width = 200, height = 200,
    counter: number = 0,
    raw: Dataset { { "rows": [ { "id": "a" }, { "id": "b" } ] } },
    derived: Dataset [ contents = { ({ rows: (app.raw.read(["rows"]) ?? []).map(r => ({ id: r.id })) }) } ],
    list: View [ datapath = { derived.value },
      View [ datapath = :rows[], key = :id, height = 10,
        onInit() { app.counter = app.counter + 1 },
      ],
    ],
  ]`;
  const r = compile(src);
  assert.deepEqual(r.errors.map((e) => e.message), []);
  const app = build(r.source);
  settle();
  assert.equal(app.counter, 2, "two members, two inits");
  app.raw.set(["rows", 0, "id"], "a"); // an equal write — nothing should move
  settle();
  assert.equal(app.counter, 2);
  app.raw.set("/rows/-", { id: "c" }); // membership grows by one
  settle();
  assert.equal(app.counter, 3, "the new member fires once; re-derived members stay silent");
  app.raw.removeAt(["rows"], 2); // c leaves…
  settle();
  app.raw.set("/rows/-", { id: "c" }); // …and returns: a NEW membership
  settle();
  assert.equal(app.counter, 4, "leave-and-return is a fresh membership");
});

// ── The semantic differ (§8 item 4): virtualization on vs off, one script,
//    identical observable state ────────────────────────────────────────────

await test("THE DIFFER: the same interaction script, windowed vs full, projects identically", () => {
  const N = 1200;
  const probes = [0, 3, 250, 599, 600, 601, 1199];
  /** The observable projection: the data itself, plus each probed record's
   *  rendered row text (navigating there first — which is how a REAL
   *  observer reaches a distant row in either mode). */
  const project = (app) => {
    const b = block(app);
    const out = { data: JSON.stringify(app.d.value), rows: {} };
    for (const i of probes.filter((p) => p < b.logicalCount())) {
      b.navigateTo(i);
      settle();
      const hit = b.realized().find((w) => w.index === i);
      out.rows[i] = hit === undefined ? null : hit.view.t.text;
    }
    return out;
  };
  const script = (app) => {
    app.sc.scrollY = 9000; settle();
    app.d.set(["rows", 600, "label"], "EDITED offscreen"); settle(); // edit far from wherever we are
    app.d.insert(["rows"], 0, { n: -1, label: "INSERTED at top" }); settle();
    app.d.removeAt(["rows"], 5); settle();
    app.d.set("/rows/-", { n: N, label: "APPENDED" }); settle();
    app.sc.scrollY = 0; settle();
  };
  const windowed = makeApp("true", N);
  const full = makeApp("false", N);
  script(windowed);
  script(full);
  const pw = project(windowed);
  const pf = project(full);
  assert.equal(pw.data, pf.data, "the data is identical");
  assert.deepEqual(pw.rows, pf.rows, "every probed row renders identically");
  // And the windowed run stayed windowed: the invisibility was not bought by
  // materializing everything.
  const info = materializationInfo(windowed.sc.content);
  assert.equal(info.windowed, true);
  assert.ok(info.materialized < 60, `windowed run held its window (${info.materialized})`);
  assert.equal(full.sc.content.children.filter((c) => c.t).length, full.d.value.rows.length, "the full run really materialized all");
});

await test("structural-equality fallback (B6 early): a keyless derived recompute reuses unchanged rows", async () => {
  const src = `App [ width = 200, height = 200,
    counter: number = 0,
    raw: Dataset { { "rows": [ { "t": "alpha" }, { "t": "beta" } ] } },
    derived: Dataset [ contents = { ({ rows: (app.raw.read(["rows"]) ?? []).map(r => ({ t: r.t })) }) } ],
    list: View [ datapath = { derived.value },
      View [ datapath = :rows[], height = 10,
        onInit() { app.counter = app.counter + 1 },
        t: Text [ text = :t ],
      ],
    ],
  ]`;
  const r = compile(src);
  assert.deepEqual(r.errors.map((e) => e.message), []);
  const app = build(r.source);
  settle();
  const before = app.list.children.filter((c) => c.t);
  assert.equal(before.length, 2);
  assert.equal(app.counter, 2);
  // A recompute manufactures FRESH record objects; identity misses across
  // the board — the content match catches the unchanged row.
  app.raw.set(["rows", 1, "t"], "BETA");
  settle();
  const after = app.list.children.filter((c) => c.t);
  assert.equal(after[0], before[0], "the unchanged row kept its instance (content match)");
  assert.notEqual(after[1], before[1], "the edited row rebuilt — cost proportional to records actually edited");
  assert.equal(after[1].t.text, "BETA");
  assert.equal(app.counter, 3, "only the genuinely-changed record re-fired construct-side work");
});

await test("onRetire (D5 semantics, D8 name): departure fires it; window eviction never does", () => {
  const src = compile(`App [ width = 400, height = 400,
    retired: number = 0,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width = 300, height = 300,
      content: View [ width = 300, datapath = { d.value },
        View [ datapath = :rows[], virtualize = true, width = 300, height = 30,
          flag: boolean = false,
          onRetire() { app.retired = app.retired + 1 },
          t: Text [ text = :label ],
        ],
      ],
    ],
  ]`);
  assert.deepEqual(src.errors.map((e) => e.message), []);
  const app = build(src.source);
  app.d.value = { rows: rows(1000) };
  settle();
  assert.equal(app.retired, 0);
  // Window evictions are NOT departures: scroll far and back — silence.
  app.sc.scrollY = 15000; settle();
  app.sc.scrollY = 0; settle();
  assert.equal(app.retired, 0, "eviction/reconstruction round trips never fire the departure hook");
  // A true departure — the record leaves the data — fires exactly once,
  // through the materialized instance.
  app.d.removeAt(["rows"], 0); settle();
  assert.equal(app.retired, 1, "a removed record's instance retires once");
  // A RETAINED (touched) row departing fires too — keep-alive is presence,
  // and its end is a departure like any other.
  const w = blocksOf(app.sc.content)[0].realized();
  const touched = w.find(({ index }) => index === 2).view;
  touched.flag = true;
  app.sc.scrollY = 15000; settle();
  assert.equal(app.retired, 1, "retention is not departure");
  // The touched row was selected AFTER the first removal, so its record sits
  // at index 2 now. Its departure fires through the kept-alive instance.
  app.d.removeAt(["rows"], 2); settle();
  assert.equal(app.retired, 2, "the retained row's departure fires through the kept-alive instance");
  // An UNMATERIALIZED member departing fires nothing — lazy retire, the
  // exact symmetric of lazy init (handlers live on instances). Index 900 is
  // far outside the ~row-500 window this scroll position materializes.
  app.d.removeAt(["rows"], 900); settle();
  assert.equal(app.retired, 2);
});

await test("VARIABLE extents (the measured ladder): per-row heights place exactly; the extent converges", () => {
  // heights cycle 20/35/50/65/80 (mean 50) — the Tracker's mixed-height shape
  const src = `App [ width = 400, height = 400,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width = 300, height = 300,
      content: View [ width = 300, datapath = { d.value },
        View [ datapath = :rows[], virtualize = true, width = 300,
          height = { :h },
          t: Text [ text = :label ],
        ],
      ],
    ],
  ]`;
  const r = compile(src);
  assert.deepEqual(r.errors.map((e) => e.message), [], "fixture compiles");
  const app = build(r.source);
  const hs = Array.from({ length: 1000 }, (_, i) => 20 + (i % 5) * 15);
  app.d.value = { rows: hs.map((h, i) => ({ id: i, h, label: "row " + i })) };
  settle();
  settle(); // one convergence wave: window rows measured, offsets corrected
  const total = hs.reduce((a, b) => a + b, 0); // 50,000
  const win = blocksOf(app.sc.content)[0].realized();
  assert.ok(win.length < 60, "windowed");
  // exactness where it is promised: measured neighbors sit EXACTLY their
  // heights apart (unmeasured territory is estimate-elastic by design)
  for (let i = 0; i + 1 < win.length; i++) {
    const a = win[i], b = win[i + 1];
    if (b.index === a.index + 1) {
      assert.equal(Math.round(b.view.y - a.view.y), hs[a.index], `row ${a.index} spans its true height`);
    }
  }
  assert.ok(Math.abs(app.sc.content.height - total) < total * 0.15,
    `the extent is estimate-honest (got ${app.sc.content.height} vs true ${total})`);
  // jump deep: rows measure on arrival and place exactly among themselves
  app.sc.scrollY = 30000;
  settle();
  settle();
  const deep = blocksOf(app.sc.content)[0].realized().filter((w) => w.view.visible);
  assert.ok(deep.some(({ index }) => index > 500), "a deep window materialized");
  for (let i = 0; i + 1 < deep.length; i++) {
    const a = deep[i], b = deep[i + 1];
    if (b.index === a.index + 1) {
      assert.equal(Math.round(b.view.y - a.view.y), hs[a.index], "deep rows span true heights");
    }
  }
});

await test("PREPEND anchoring (criterion 2): inserts above the window never yank the viewport", () => {
  const app = makeApp("true", 1000);
  app.sc.scrollY = 15000;
  settle();
  const win = blocksOf(app.sc.content)[0].realized().filter((w) => w.view.visible);
  const anchor = win.find((w) => w.view.y >= app.sc.scrollY);
  const before = { label: anchor.view.t.text, screenY: anchor.view.y - app.sc.scrollY };
  // 50 issues arrive at the TOP while we read row ~500
  for (let i = 0; i < 50; i++) app.d.insert(["rows"], 0, { n: -1 - i, label: "new " + i });
  settle();
  const after = blocksOf(app.sc.content)[0].realized().find((w) => w.view.t.text === before.label);
  assert.ok(after !== undefined, "the row we were reading is still materialized");
  assert.equal(Math.round(after.view.y - app.sc.scrollY), Math.round(before.screenY),
    "…at the SAME place on screen — the scroll compensated for the inserted extent");
  assert.ok(app.sc.scrollY > 15000, "the scroll moved by the inserted rows' extent");
});

summarize("materialization");
