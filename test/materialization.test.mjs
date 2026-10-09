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
import { buildProgram, settle, HeadlessBackend, provideMeasurer } from "../runtime/dist/index.js";
import { approximateMeasurer } from "../compiler/dist/headless.js";
import { blocksOf, materializationInfo } from "../runtime/dist/replicate.js";

const rows = (n) => Array.from({ length: n }, (_, i) => ({ n: i, label: "row " + i }));

/** Compile + build the standard fixture: a scroller over a windowed block.
 *  `policy` is the virtualize attr's value; rows arrive imperatively so one
 *  fixture serves every tier. */
async function makeApp(policy, n = 1000) {
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
  const r = await compile(src);
  assert.deepEqual(r.errors.map((e) => e.message), [], "fixture compiles");
  const app = buildProgram(r.program);
  app.d.value = { rows: rows(n) };
  settle();
  return app;
}

const block = (app) => blocksOf(app.sc.content)[0];
const texts = (app) => block(app).realized().map((w) => ({ index: w.index, text: w.view.t.text }));

await test("windowed: only the window materializes; the parent extent reads N × unit", async () => {
  const app = await makeApp("true", 1000);
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

await test("windowed: scrolling moves the window; instances land at logical y", async () => {
  const app = await makeApp("true", 1000);
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

await test("membership-anchored onInit (D5): once per membership, never per reconstruction", async () => {
  const app = await makeApp("true", 1000);
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

await test("divergence retention + RECYCLING (D5 + the scrub bench): touched rows retain; clean leavers RE-POINT", async () => {
  const app = await makeApp("true", 1000);
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
await test("childViews is transparent on a virtualized block, and `virtualized` says so", async () => {
  const app = await makeApp("true", 1000);
  const kids = app.sc.content.childViews;
  assert.ok(Array.isArray(kids), "it answers rather than throwing");
  assert.ok(kids.length > 0 && kids.length < 100,
    `the instances that exist — a window, not 1000 (got ${kids.length})`);
  assert.equal(app.sc.content.virtualized, true, "and the flag makes the subset legible");

  const small = await makeApp("false", 20);
  assert.equal(small.sc.content.childViews.length, 20, "a full block answers with everything");
  assert.equal(small.sc.content.virtualized, false, "…and reports itself unvirtualized");
});

await test("`virtualized` is TRACKED: a constraint on it follows engage/disengage", async () => {
  const src = `App [ width = 400, height = 400,
    big: boolean = false,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width = 300, height = 300,
      content: View [ width = 300, datapath = { d.value },
        View [ datapath = :rows[], virtualize = { app.big }, width = 300, height = 30 ] ] ],
    flag: boolean = { app.sc.content.virtualized } ]`;
  const r = await compile(src);
  assert.deepEqual(r.errors.map((e) => e.message), []);
  const app = buildProgram(r.program);
  app.d.value = { rows: rows(400) };
  settle();
  assert.equal(app.flag, false, "a constraint reads it before engaging");
  app.big = true; settle();
  assert.equal(app.flag, true, "…and re-runs when the block engages");
  app.big = false; settle();
  assert.equal(app.flag, false, "…and again when it disengages");
});

await test("navigate-to-logical-record (§3.5): the destination materializes on arrival", async () => {
  const app = await makeApp("true", 1000);
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
await test("the policy is REACTIVE: `virtualize = { … }` engages and disengages", async () => {
  const src = `App [ width = 400, height = 400,
    big: boolean = false,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width = 300, height = 300,
      content: View [ width = 300, datapath = { d.value },
        View [ datapath = :rows[], virtualize = { app.big }, width = 300, height = 30,
          t: Text [ text = :label ] ] ] ] ]`;
  const r = await compile(src);
  assert.deepEqual(r.errors.map((e) => e.message), [], "a { } policy compiles");
  const app = buildProgram(r.program);
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

await test("the policy slot: a boolean, and honest fallbacks", async () => {
  const off = await makeApp("false", 2000);
  assert.equal(materializationInfo(off.sc.content).windowed, false, "the default is full materialization at any size");
  assert.equal(off.sc.content.childViews.length, 2000, "…and semantically untouched");
  const on = await makeApp("true", 50);
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
  const r = await compile(src);
  assert.deepEqual(r.errors, []);
  const app = buildProgram(r.program);
  app.d.value = { rows: rows(1500) };
  settle();
  const info = materializationInfo(app.sc.content);
  assert.equal(info.windowed, true, "a vertical stack windows WITH its layout");
  assert.ok(info.materialized < 60, "windowed under SimpleLayout");
  assert.equal(app.sc.content.height, 1500 * 30 + 1499 * 10, "the extent is the full stack's: spacing between rows, none after the last");
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
  const xr = await compile(xsrc);
  assert.deepEqual(xr.errors, []);
  const xapp = buildProgram(xr.program);
  xapp.d.value = { rows: rows(1500) };
  settle();
  const xinfo = materializationInfo(xapp.sc.content);
  assert.equal(xinfo.windowed, false, "an unpredictable arrangement still falls back to full");
  assert.match(xinfo.fallback, /windowing cannot predict/);
});

await test("membership init also governs keyed re-derivation (the ruling is general, not windowing-only)", async () => {
  const src = `App [ width = 200, height = 200,
    counter: number = 0,
    raw: Dataset { { "rows": [ { "id": "a" }, { "id": "b" } ] } },
    derived: Dataset [ contents = { { rows: (app.raw.read(["rows"]) ?? []).map(r => ({ id: r.id })) } } ],
    list: View [ datapath = { derived.value },
      View [ datapath = :rows[], key = :id, height = 10,
        onInit() { app.counter = app.counter + 1 },
      ],
    ],
  ]`;
  const r = await compile(src);
  assert.deepEqual(r.errors.map((e) => e.message), []);
  const app = buildProgram(r.program);
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

await test("THE DIFFER: the same interaction script, windowed vs full, projects identically", async () => {
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
  const windowed = await makeApp("true", N);
  const full = await makeApp("false", N);
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
    derived: Dataset [ contents = { { rows: (app.raw.read(["rows"]) ?? []).map(r => ({ t: r.t })) } } ],
    list: View [ datapath = { derived.value },
      View [ datapath = :rows[], height = 10,
        onInit() { app.counter = app.counter + 1 },
        t: Text [ text = :t ],
      ],
    ],
  ]`;
  const r = await compile(src);
  assert.deepEqual(r.errors.map((e) => e.message), []);
  const app = buildProgram(r.program);
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

await test("onRetire (D5 semantics, D8 name): departure fires it; window eviction never does", async () => {
  const src = await compile(`App [ width = 400, height = 400,
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
  const app = buildProgram(src.program);
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

await test("VARIABLE extents (the measured ladder): per-row heights place exactly; the extent converges", async () => {
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
  const r = await compile(src);
  assert.deepEqual(r.errors.map((e) => e.message), [], "fixture compiles");
  const app = buildProgram(r.program);
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

await test("PREPEND anchoring (criterion 2): inserts above the window never yank the viewport", async () => {
  const app = await makeApp("true", 1000);
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

// ── LATE-CREATED INSTANCES (field report 2026-09-01, findings 1–2) ─────────
// A node replicating over `:rows[]` gains a record AFTER boot. The bug family:
// reconcile attached fresh instances before binding their cursors, so a
// draw()'s first recording read every :path as null — and the throw aborted
// the REST of reconcile, leaving the new instance half-built and (on an
// insert-at-front) every shifted sibling holding its pre-insert cursor: any
// member that re-evaluated read its predecessor's record, forever. These pins
// attach (headless), because attach is where the draw build lives.

const LATE = `
script {
    function shout(id: string): number { return id.length }
}
class Row extends View [ height = 20, width = 200,
    n: number = { shout(:id) },
    ph: number = 0,
    warm: Spring [ attribute = ph, to = { classroot.n }, stiffness = 60, damping = 10 ],
    draw(d: Draw) {
        const k = shout(:id)
        d.fillStyle = "#446688"
        d.fillRect(0, 0, 10 + k * 4, 12)
        },
    t: Text [ x = 60, text = :id ]
    ]
App [
    d: Dataset { { "rows": [ { "id": "alpha" }, { "id": "beta" } ] } },
    list: View [ x = 20, y = 20, datapath = { d.value },
        layout: SimpleLayout [ axis = y, spacing = 4 ],
        Row [ datapath = :rows[] ]
        ]
    ]`;

async function makeLate(src = LATE) {
  provideMeasurer(approximateMeasurer());
  const r = await compile(src);
  assert.deepEqual(r.errors.map((e) => e.message), [], "fixture compiles");
  const app = buildProgram(r.program);
  app.$attach(new HeadlessBackend(), null);
  settle();
  return app;
}
const lateRows = (app) => app.list.children.filter((c) => c.constructor.name === "Row");

await test("a late APPENDED instance builds cursored: draw, computed default, and spring all see the record", async () => {
  const app = await makeLate();
  app.d.set("/rows/-", { id: "gamma" });
  settle();
  const rows = lateRows(app);
  assert.equal(rows.length, 3);
  const g = rows[2];
  assert.equal(g.t.text, "gamma", "direct bind evaluated");
  assert.equal(g.n, 5, "computed default reads the bound cursor (draw's first build did not wedge it)");
  assert.ok(g.ph > 0, "the sibling spring evaluated too — the instance is whole");
});

await test("insert-at-0 re-points every shifted sibling's cursor — computed defaults re-read their OWN record", async () => {
  const app = await makeLate();
  app.d.insert(["rows"], 0, { id: "gamma" });
  settle();
  const rows = lateRows(app);
  assert.deepEqual(rows.map((r) => r.t.text), ["gamma", "alpha", "beta"], "data order");
  for (const r of rows) {
    assert.equal(r.$data(["id"]), r.t.text, "the instance's cursor points at the record it presents");
    assert.equal(r.n, r.t.text.length, "a computed default over the datapath reads the same record — not a captured pre-insert cursor");
  }
});

await test("a genuinely throwing member costs exactly its own instance — reported with the node's path, siblings unharmed", async () => {
  // the defect trips only on the LATE record (boot rows never call bad(1)):
  // a boot-time throw stays loud and fatal, as every { } does — containment
  // is reconcile's, for the blast radius one bad row must not have
  const BAD = LATE
    .replace("function shout", 'function bad(x: number): number { if (x > 0) throw new Error("bad row"); return 0 }\n    function shout')
    .replace("const k = shout(:id)", 'const k = shout(:id) + bad(:id == "gamma" ? 1 : 0)');
  const app = await makeLate(BAD);
  const errors = [];
  const orig = console.error;
  console.error = (...a) => errors.push(a.join(" "));
  try {
    app.d.insert(["rows"], 0, { id: "gamma" });
    settle();
  } finally {
    console.error = orig;
  }
  const rows = lateRows(app);
  assert.deepEqual(rows.map((r) => r.t.text), ["gamma", "alpha", "beta"], "reconcile completed: order, cursors, finishes all landed");
  for (const r of rows) assert.equal(r.$data(["id"]), r.t.text, "every sibling re-pointed despite the throw");
  assert.ok(errors.some((e) => e.includes("Row") && e.includes("app.list")), "the throw surfaced once, with the node's path: " + errors.join(" | "));
});

// ── classFor: a class per record ────────────────────────────────────────────
// One replicated block whose records are different things: each record is
// built as the class `classFor` names from it — the written class is the base —
// so a note builds no picture, and a record whose kind changes is rebuilt as
// its new class in place.
const KINDS = `class Entry extends View [ width = 300, height = 30, t: Text [ text = :text ] ]
class Note extends Entry [ ]
class Photo extends Entry [ height = 90, pic: View [ y = 30, width = 120, height = 60 ] ]
class Heading extends Entry [ height = 40, rule: View [ y = 38, width = 300, height = 1 ] ]`;
const kindOf = (v) => v.pic !== undefined ? "photo" : v.rule !== undefined ? "heading" : "note";

await test("windowed rows directly in the scroller: its contentHeight reads the LOGICAL extent", async () => {
  const r = await compile(`App [ width = 400, height = 400,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width = 300, height = 300, datapath = { d.value },
      layout: SimpleLayout [ axis = y ],
      View [ datapath = :rows[], virtualize = true, width = 300, height = 30 ] ] ]`);
  assert.deepEqual(r.errors.map((e) => e.message), [], "compiles");
  const app = buildProgram(r.program);
  app.d.value = { rows: rows(1000) }; settle();
  assert.equal(materializationInfo(app.sc).windowed, true);
  assert.equal(app.sc.contentHeight, 1000 * 30, "the window's rows alone would read a few hundred px");
  app.d.value = { rows: rows(400) }; settle();
  assert.equal(app.sc.contentHeight, 400 * 30, "a shrink follows");
});

async function kindsApp(n, virtualize) {
  const r = await compile(`${KINDS}
App [ width = 400, height = 400,
  d: Dataset { { "rows": [] } },
  sc: View [ scrolls = y, width = 300, height = 300,
    content: View [ width = 300, datapath = { d.value },
      layout: SimpleLayout [ axis = y ],
      Entry [ datapath = :rows[], virtualize = ${virtualize},
        classFor = { :kind == "photo" ? Photo : :kind == "heading" ? Heading : Note } ] ] ] ]`);
  assert.deepEqual(r.errors.map((e) => e.message), [], "compiles");
  const app = buildProgram(r.program);
  const kinds = ["heading", "note", "photo", "note"];
  app.d.value = { rows: Array.from({ length: n }, (_, i) => ({ id: i, kind: kinds[i % 4], text: "r" + i })) };
  settle();
  return app;
}

await test("classFor: each record is built as its own class, and only its parts exist", async () => {
  const app = await kindsApp(8, false);
  const views = app.sc.content.childViews;
  assert.deepEqual(views.map(kindOf), ["heading", "note", "photo", "note", "heading", "note", "photo", "note"]);
  assert.deepEqual(views.map((v) => v.t.text), ["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7"], "the base's parts are in every class");
  assert.deepEqual(views.map((v) => v.height), [40, 30, 90, 30, 40, 30, 90, 30], "each class's own attributes");
});

await test("classFor: a record whose kind changes is rebuilt as its new class; the others keep their instances", async () => {
  const app = await kindsApp(4, false);
  const before = app.sc.content.childViews;
  app.d.set(["rows", 1, "kind"], "photo"); settle();
  const after = app.sc.content.childViews;
  assert.deepEqual(after.map(kindOf), ["heading", "photo", "photo", "note"]);
  assert.notEqual(after[1], before[1], "the changed record has a new instance");
  for (const i of [0, 2, 3]) assert.equal(after[i], before[i], `record ${i} kept its instance`);
});

await test("classFor: a virtualized block builds each window row as its record's class, scrolled or not", async () => {
  const app = await kindsApp(400, true);
  assert.equal(materializationInfo(app.sc.content).windowed, true);
  const check = () => {
    for (const w of block(app).realized()) {
      const rec = app.d.value.rows[w.index];
      assert.equal(kindOf(w.view), rec.kind, `row ${w.index} is a ${rec.kind}`);
      assert.equal(w.view.t.text, rec.text);
    }
  };
  check();
  app.sc.scrollTo(9000); settle();
  check();
  app.sc.scrollTo(4000); settle();
  check();
});

await test("check: classFor names the class or its subclasses, reads only the record, and belongs on a template", async () => {
  const errs = async (body) => (await compile(`${KINDS}
class Other extends View [ ]
App [ width = 100, height = 100, pick: string = "", d: Dataset { { "rows": [] } },
  col: View [ datapath = { d.value }, ${body} ] ]`)).errors.map((e) => e.message).join(" | ");
  assert.match(await errs(`Entry [ datapath = :rows[], classFor = { :kind == "x" ? Other : Note } ]`), /'Other', which does not extend Entry/);
  assert.match(await errs(`Entry [ datapath = :rows[], classFor = { app.pick == "x" ? Photo : Note } ]`), /classFor reads the record and names classes — 'app' is neither/);
  assert.match(await errs(`Entry [ datapath = :rows[], classFor = Photo ]`), /classFor = \{ … \} picks each record's class/);
  assert.match(await errs(`Entry [ classFor = { Photo } ]`), /'classFor' is replication metadata/);
  assert.equal(await errs(`Entry [ datapath = :rows[], classFor = { :kind == "photo" ? Photo : Entry } ]`), "", "the base itself is a legal answer");
});

// ── rowIndex: a row's place in its array ─────────────────────────────────────
// A fact the replicator keeps: the record's index in the array it presents —
// the group's own array for a nested list, the logical index under virtualize,
// -1 on a view no replication made. Constraints reading it follow the record.
await test("rowIndex: each row's index in its array, following inserts, removes and nested groups", async () => {
  const r = await compile(`class Row extends View [ height = 20, label: string = { rowIndex + ":" + :id } ]
App [ width = 300, height = 300, d: Dataset { { "rows": [], "groups": [] } },
  list: View [ datapath = { d.value }, Row [ datapath = :rows[] ] ],
  groups: View [ datapath = { d.value }, View [ datapath = :groups[], Row [ datapath = :items[] ] ] ] ]`);
  assert.deepEqual(r.errors.map((e) => e.message), [], "compiles");
  const app = buildProgram(r.program);
  app.d.value = { rows: [{ id: "a" }, { id: "b" }, { id: "c" }],
    groups: [{ items: [{ id: "x" }, { id: "y" }] }, { items: [{ id: "z" }] }] };
  settle();
  const labels = () => app.list.childViews.map((v) => v.label);
  assert.deepEqual(labels(), ["0:a", "1:b", "2:c"]);
  app.d.insert(["rows"], 0, { id: "n" }); settle();
  assert.deepEqual(labels(), ["0:n", "1:a", "2:b", "3:c"], "every shifted sibling re-reads its place");
  app.d.removeAt(["rows"], 1); settle();
  assert.deepEqual(labels(), ["0:n", "1:b", "2:c"]);
  const nested = app.groups.childViews.map((g) => g.childViews.map((v) => v.label));
  assert.deepEqual(nested, [["0:x", "1:y"], ["0:z"]], "a nested row counts within its group's array");
  assert.deepEqual(app.groups.childViews.map((g) => g.rowIndex), [0, 1]);
  assert.equal(app.list.rowIndex, -1, "a written view has no row place");
});

await test("rowIndex: under virtualize it is the logical index, not the window slot", async () => {
  const app = await kindsApp(400, true);
  const check = () => { for (const w of block(app).realized()) assert.equal(w.view.rowIndex, w.index); };
  check();
  app.sc.scrollTo(9000); settle();
  check();
  assert.ok(block(app).realized().every((w) => w.index > 50), "the window moved");
});

await test("check: rowIndex is a fact — never assigned", async () => {
  const r = await compile(`App [ width = 100, height = 100, v: View [ rowIndex = 3 ] ]`);
  assert.ok(r.errors.some((e) => /rowIndex/.test(e.message)), r.errors.map((e) => e.message).join(" | "));
});

// A pane read from the bottom opens at its end and stays there while its rows
// keep changing size. Here the rows the pane reaches grow as they come on
// screen: content moving between the anchor putting the pane at the end and
// its next look at where the reader is. Virtualized, the block's own estimate
// corrections must not compete with the anchor for the offset.
for (const policy of ["false"]) {
await test(`scrollAnchor = end (virtualize = ${policy}): rows that grow as the pane reaches them keep it at its end`, async () => {
  const r = await compile(`App [ width = 400, height = 400,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, scrollAnchor = end, width = 300, height = 300,
      content: View [ width = 300, datapath = { d.value },
        layout: SimpleLayout [ axis = y ],
        View [ datapath = :rows[], virtualize = ${policy}, width = 300, height = { onScreen ? 60 : 30 } ],
      ],
    ],
  ]`);
  assert.deepEqual(r.errors.map((e) => e.message), [], "fixture compiles");
  const app = buildProgram(r.program);
  app.$attach(new HeadlessBackend(), null);
  app.d.value = { rows: rows(200) };
  for (let i = 0; i < 8; i++) settle();
  const max = app.sc.contentHeight - app.sc.height;
  assert.ok(max > 200 * 30 - 300, "the rows on screen grew");
  assert.ok(Math.abs(app.sc.scrollY - max) < 1, `at the end: scrollY ${app.sc.scrollY} of ${max}`);
});
}

// A virtualized list builds the rows near what is on screen, and a list that
// is hidden has nothing on screen: it builds none, and keeps only its place.
// One pane per conversation, the open one shown, is the ordinary way to keep
// each conversation's place and draft; before this, every hidden pane kept
// its whole window built (Murmur 8: about 11,600 elements, none of them seen).
await test("windowed: a list never shown builds no rows; one left keeps its rows, and is shown again where it was", async () => {
  const r = await compile(`
    class Thread [ width = 300, height = 300,
      sc: View [ scrolls = y, width = 300, height = 300,
        content: View [ width = 300,
          layout: SimpleLayout [ axis = y ],
          View [ datapath = :rows[], virtualize = true, width = 300, height = 30, t: Text [ text = :label ] ]
          ]
        ]
      ]
    App [ width = 400, height = 400,
      open: string = "a",
      d: Dataset { { "threads": [] } },
      stage: View [ width = 300, height = 300, datapath = { d.value },
        Thread [ datapath = :threads[], visible = { :id == app.open } ]
        ]
      ]`);
  assert.deepEqual(r.errors.map((e) => e.message), [], "fixture compiles");
  const app = buildProgram(r.program);
  app.$attach(new HeadlessBackend(), null);
  app.d.value = { threads: ["a", "b", "c"].map((id) => ({ id, rows: rows(1000) })) };
  for (let i = 0; i < 6; i++) settle();
  const panes = app.stage.childViews;
  const built = (p) => p.sc.content.children.length;
  assert.equal(panes.length, 3, "a pane per conversation");
  assert.ok(built(panes[0]) > 0 && built(panes[0]) < 200, `the open pane builds a window: ${built(panes[0])} rows`);
  assert.deepEqual([built(panes[1]), built(panes[2])], [0, 0], "the hidden panes build none");
  // read into the middle of the open one, then switch away and back
  panes[0].sc.scrollY = 9000;
  for (let i = 0; i < 6; i++) settle();
  const topRow = () => Math.min(...panes[0].sc.content.children.filter((v) => v.visible && v.y + v.height > panes[0].sc.scrollY).map((v) => v.y));
  const before = topRow();
  const mounted = (p) => p.sc.content.children.filter((v) => v.visible).length;
  const kept = mounted(panes[0]);
  const rowsBefore = new Set(panes[0].sc.content.children.filter((v) => v.visible));
  app.open = "b";
  for (let i = 0; i < 6; i++) settle();
  assert.equal(built(panes[0]), kept, "the pane switched away from keeps the rows it showed, and only those");
  assert.ok(built(panes[1]) > 0, "the pane switched to builds its window");
  assert.equal(built(panes[2]), 0, "the one never shown still has none");
  app.open = "a";
  settle();
  assert.equal(panes[0].sc.scrollY, 9000, "shown again at the same offset");
  assert.equal(topRow(), before, "with the same row at the top, in the same update");
  assert.ok(panes[0].sc.content.children.filter((v) => v.visible).every((v) => rowsBefore.has(v)), "with the very rows it had: nothing rebuilt");
  // the records change while it is hidden: shown again, its rows are the records' own
  app.open = "b";
  for (let i = 0; i < 6; i++) settle();
  const list = app.d.value.threads[0].rows;
  const label = (v) => v.t.text;
  app.d.value = { threads: [{ id: "a", rows: list.filter((_, i) => i % 2 === 0) }, ...app.d.value.threads.slice(1)] };
  for (let i = 0; i < 6; i++) settle();
  app.open = "a";
  for (let i = 0; i < 6; i++) settle();
  const shown = panes[0].sc.content.children.filter((v) => v.visible && v.y + v.height > panes[0].sc.scrollY && v.y < panes[0].sc.scrollY + 300);
  assert.ok(shown.length > 0, "rows on screen");
  const want = new Set(app.d.value.threads[0].rows.map((x) => x.label));
  assert.ok(shown.every((v) => want.has(label(v))), `every row on screen is a record that remains: ${shown.map(label).slice(0, 6)}`);
});

// A row the window lets go is torn down whole, and that includes the bindings
// of the nodes inside it that are not views: a Dataset's `contents`, a Node
// class's computed values. Left standing, each stayed subscribed to what it
// read and ran again, detached, when that changed — a discarded row's dataset
// reading `app` found no App (Murmur 8's reaction chips: "reading 'meId'").
await test("windowed: a row let go takes its datasets' bindings with it", async () => {
  const r = await compile(`
    class Model extends Node [ me: string = "u1", nameOf(p: string) -> string { return "name of " + p } ]
    class Msg [ width = 300, height = 40,
      reacts: array = { :reactions ?? [] },
      chips: View [ exists = { classroot.reacts.length > 0 },
        marks: Dataset [ contents = { { tally: classroot.reacts.map((p) => ({ p: p, mine: p == app.data.me, name: app.data.nameOf("" + p) })) } } ],
        datapath = { this.marks.value },
        Text [ datapath = :tally[], text = { :name } ] ] ]
    App [ width = 400, height = 400,
      data: Model [ ],
      d: Dataset { { "rows": [] } },
      sc: View [ scrolls = y, width = 300, height = 300,
        content: View [ width = 300, datapath = { d.value }, layout: SimpleLayout [ axis = y ],
          Msg [ datapath = :rows[], virtualize = true ] ] ] ]`);
  assert.deepEqual(r.errors.map((e) => e.message), [], "fixture compiles");
  const app = buildProgram(r.program);
  app.$attach(new HeadlessBackend(), null);
  app.d.value = { rows: Array.from({ length: 400 }, (_, i) => ({ id: i, reactions: i % 3 == 0 ? ["u1", "u2"] : [] })) };
  for (let i = 0; i < 6; i++) settle();
  for (const y of [6000, 14000, 0]) { app.sc.scrollY = y; for (let i = 0; i < 6; i++) settle(); }
  app.data.me = "u2";   // what every chips dataset reads
  for (let i = 0; i < 4; i++) settle();
  const names = [];
  const walk = (v) => { if (v.constructor.name === "Text" && v.visible) names.push(v.text); (v.childViews ?? []).forEach(walk); };
  walk(app.sc.content);
  assert.ok(names.length > 0 && names.every((t) => t.startsWith("name of ")), "the rows in reach still read the App");
});

// Keep-place while scrolling: rows measured above the reader (their real
// heights differ from the estimate) must not move what is on screen. Scrolled
// into the middle of a list loaded once — no data change since — every row on
// screen moves exactly as far as the scroll offset did, step after step.
await test("windowed: corrections above the reader never move what is on screen (after the first load)", async () => {
  const r = await compile(`App [ width = 400, height = 400,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width = 300, height = 300,
      content: View [ width = 300, datapath = { d.value },
        layout: SimpleLayout [ axis = y ],
        View [ datapath = :rows[], virtualize = true, width = 300, height = { 24 + (:n % 7) * 13 }, n: number = { :n } ],
      ],
    ],
  ]`);
  assert.deepEqual(r.errors.map((e) => e.message), [], "fixture compiles");
  const app = buildProgram(r.program);
  app.$attach(new HeadlessBackend(), null);
  app.d.value = { rows: rows(2000) };
  for (let i = 0; i < 4; i++) settle();
  app.sc.scrollY = Math.round(app.sc.contentHeight / 2); for (let i = 0; i < 4; i++) settle();
  const onScreen = () => sc().filter((v) => v.y + v.height > app.sc.scrollY && v.y < app.sc.scrollY + 300);
  const sc = () => app.sc.content.childViews.filter((v) => v.visible);
  for (let step = 0; step < 30; step++) {
    // keyed by RECORD: a recycled instance shows another record
    const before = new Map(onScreen().map((v) => [v.n, v.y - app.sc.scrollY]));
    app.sc.scrollY = app.sc.scrollY - 40;
    for (let i = 0; i < 3; i++) settle();
    const now = new Map(sc().map((v) => [v.n, v.y - app.sc.scrollY]));
    let compared = 0;
    for (const [n, at] of before) {
      if (!now.has(n)) continue;
      compared++;
      assert.ok(Math.abs(now.get(n) - (at + 40)) < 1, `step ${step}: row ${n} moved ${Math.round(now.get(n) - at - 40)} px beyond the scroll`);
    }
    assert.ok(compared >= 3, "rows stayed on screen to compare");
  }
});

// Rows sized by their children have no height until they are attached (at
// boot the app is not sized yet): the window must settle anyway, and take
// the real unit when heights land — not re-run itself while nothing can change.
await test("windowed: rows sized by their content settle before they have a height", async () => {
  const r = await compile(`App [ width = 400, height = 400,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width = 300, height = 300,
      content: View [ width = 300, datapath = { d.value },
        layout: SimpleLayout [ axis = y ],
        View [ datapath = :rows[], virtualize = true, width = 300, View [ width = 50, height = 20 ] ],
      ],
    ],
  ]`);
  assert.deepEqual(r.errors.map((e) => e.message), [], "fixture compiles");
  const app = buildProgram(r.program);
  app.d.value = { rows: rows(500) };
  settle();                                   // unattached: no row has a height yet
  app.$attach(new HeadlessBackend(), null);
  for (let i = 0; i < 4; i++) settle();
  const info = materializationInfo(app.sc.content);
  assert.equal(info.windowed, true, "windowing engaged");
  assert.ok(info.materialized < 60, `a window, not every row (${info.materialized})`);
});

// Windowing turned off (a bound policy flipping): the block gives the parent's
// height back, and the auto-extent sizes it over every row from then on.
await test("windowed → full: the parent's height returns to its auto-extent", async () => {
  const r = await compile(`App [ width = 400, height = 400,
    virt: boolean = true,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width = 300, height = 300,
      content: View [ width = 300, datapath = { d.value },
        layout: SimpleLayout [ axis = y ],
        View [ datapath = :rows[], virtualize = { app.virt }, width = 300, height = 30 ],
      ],
    ],
  ]`);
  assert.deepEqual(r.errors.map((e) => e.message), [], "fixture compiles");
  const app = buildProgram(r.program);
  app.$attach(new HeadlessBackend(), null);
  app.d.value = { rows: rows(300) };
  for (let i = 0; i < 4; i++) settle();
  assert.equal(materializationInfo(app.sc.content).windowed, true, "windowing engaged");
  app.virt = false;
  for (let i = 0; i < 4; i++) settle();
  assert.equal(materializationInfo(app.sc.content).windowed, false, "windowing disengaged");
  assert.equal(app.sc.content.height, 300 * 30, "every row counts in the parent's height");
  app.d.value = { rows: rows(310) };
  for (let i = 0; i < 4; i++) settle();
  assert.equal(app.sc.content.height, 310 * 30, "and it follows the rows from then on");
});

// Rows that are the SCROLLER's own children (a Table's shape): a row above the
// reader opening is compensated once — by the block — not again by the
// scroller's content anchor.
await test("windowed rows directly in the scroller: a row opening above the reader moves nothing on screen", async () => {
  const r = await compile(`App [ width = 400, height = 400,
    openN: number = -1,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width = 300, height = 300, datapath = { d.value },
      layout: SimpleLayout [ axis = y ],
      View [ datapath = :rows[], virtualize = true, width = 300, n: number = { :n }, height = { n == app.openN ? 330 : 30 } ],
    ],
  ]`);
  assert.deepEqual(r.errors.map((e) => e.message), [], "fixture compiles");
  const app = buildProgram(r.program);
  app.$attach(new HeadlessBackend(), null);
  app.d.value = { rows: rows(1000) };
  for (let i = 0; i < 4; i++) settle();
  app.sc.scrollY = 9000; for (let i = 0; i < 4; i++) settle();
  const rowsNow = () => app.sc.childViews.filter((v) => v.visible && v.rowIndex >= 0);
  const above = rowsNow().filter((v) => v.y + v.height <= app.sc.scrollY).sort((a, b) => b.y - a.y)[0];
  assert.ok(above !== undefined, "a built row above the reader");
  const before = new Map(rowsNow().filter((v) => v.y >= app.sc.scrollY && v.y < app.sc.scrollY + 300).map((v) => [v.n, v.y - app.sc.scrollY]));
  app.openN = above.n;
  for (let i = 0; i < 4; i++) settle();
  let compared = 0;
  for (const v of rowsNow()) {
    if (!before.has(v.n)) continue;
    compared++;
    assert.ok(Math.abs(v.y - app.sc.scrollY - before.get(v.n)) < 1, `row ${v.n} moved ${Math.round(v.y - app.sc.scrollY - before.get(v.n))} px on screen`);
  }
  assert.ok(compared >= 5, "rows stayed on screen to compare");
});

// A row re-pointed at another record re-derives its size from its new content:
// a part that exists only for some records (a sender's name over the first
// message of a run) is counted the moment it appears.
await test("windowed: a re-pointed row takes the size of its new record's content", async () => {
  const r = await compile(`App [ width = 400, height = 400,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width = 300, height = 300,
      content: View [ width = 300, datapath = { d.value },
        layout: SimpleLayout [ axis = y ],
        View [ datapath = :rows[], virtualize = true, width = 300,
          layout: SimpleLayout [ axis = y, spacing = 3 ],
          padding = { [:n % 3 == 0 ? 10 : 1, 0, 1, 0] },
          who: Text [ exists = { :n % 3 == 0 }, fontSize = 12, text = { "row " + :n } ],
          body: View [ width = 200, height = { 20 + (:n % 4) * 10 } ] ],
      ],
    ],
  ]`);
  assert.deepEqual(r.errors.map((e) => e.message), [], "fixture compiles");
  const app = buildProgram(r.program);
  app.$attach(new HeadlessBackend(), null);
  app.d.value = { rows: rows(3000) };
  for (let i = 0; i < 4; i++) settle();
  const whoH = app.sc.content.children.find((c) => c.rowIndex >= 0 && c.who)?.who.height ?? 15;
  const want = (n) => (n % 3 == 0 ? 10 + whoH + 3 : 1) + 20 + (n % 4) * 10 + 1;
  for (const y of [20000, 40000, 5000, 60000, 30000]) {
    app.sc.scrollY = y;
    for (let i = 0; i < 4; i++) settle();
    for (const { view, index } of block(app).realized()) {
      if (!view.visible) continue;
      assert.equal(view.height, want(index), `row ${index} at scroll ${y}: ${view.height} for content of ${want(index)}`);
    }
  }
});

// Engaging in the SAME update as new data (records without ids: identity is
// the record object): the full block's rows are keyed by the records it last
// built, so each must find its record's new place or retire — never stay
// mounted at its old index beside a fresh row for the same record.
await test("engaging with new data in the same update: no record is shown twice", async () => {
  const r = await compile(`App [ width = 400, height = 400,
    big: boolean = false,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width = 300, height = 300,
      content: View [ width = 300, datapath = { d.value },
        layout: SimpleLayout [ axis = y ],
        View [ datapath = :rows[], virtualize = { app.big }, width = 300, height = 30 ] ] ] ]`);
  assert.deepEqual(r.errors.map((e) => e.message), [], "fixture compiles");
  const app = buildProgram(r.program);
  app.$attach(new HeadlessBackend(), null);
  app.d.value = { rows: rows(400) };
  for (let i = 0; i < 3; i++) settle();
  app.d.value = { rows: rows(400) };   // equal records, new objects
  app.big = true;
  for (let i = 0; i < 4; i++) settle();
  const seen = new Map();
  for (const c of app.sc.content.children) if (c.visible && c.rowIndex >= 0) seen.set(c.rowIndex, (seen.get(c.rowIndex) ?? 0) + 1);
  const twice = [...seen].filter(([, k]) => k > 1).map(([i]) => i);
  assert.deepEqual(twice.slice(0, 5), [], `records shown by two rows: ${twice.length}`);
  assert.ok(seen.size < 60, `a window, not the full block (${seen.size} rows shown)`);
});

// A parked row presents no record: whatever asks rows for their place (a
// table walking to its active row) must not find it there.
await test("windowed: a parked row has no index", async () => {
  const app = await makeApp("true", 1000);
  app.$attach(new HeadlessBackend(), null);
  // a jump re-points leavers straight into the new range; a viewport that
  // shrinks after it needs fewer rows, and the rest park
  app.sc.scrollY = 9000;
  for (let i = 0; i < 4; i++) settle();
  app.sc.height = 60;
  for (let i = 0; i < 4; i++) settle();
  const parked = app.sc.content.children.filter((c) => c.visible === false);
  assert.ok(parked.length > 0, "the smaller viewport parked some rows");
  assert.deepEqual([...new Set(parked.map((c) => c.rowIndex))], [-1], "every parked row reads rowIndex -1");
});

// An end pane taken to its end (scrollTo(Infinity)) and then sent elsewhere
// by the program stays where it was sent: the request to the end arrived, so
// rows landing at the new place are not growth at the end to follow.
for (const policy of ["false", "true"]) {
await test(`scrollAnchor = end (virtualize = ${policy}): a program scroll away from the end stays away`, async () => {
  const r = await compile(`App [ width = 400, height = 400,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, scrollAnchor = end, width = 300, height = 300,
      content: View [ width = 300, datapath = { d.value },
        layout: SimpleLayout [ axis = y ],
        View [ datapath = :rows[], virtualize = ${policy}, width = 300, height = { 20 + (:n % 5) * 9 } ] ] ] ]`);
  assert.deepEqual(r.errors.map((e) => e.message), [], "fixture compiles");
  const app = buildProgram(r.program);
  app.$attach(new HeadlessBackend(), null);
  app.d.value = { rows: rows(2000) };
  for (let i = 0; i < 6; i++) settle();
  app.sc.scrollTo(Infinity);
  for (let i = 0; i < 6; i++) settle();
  assert.ok(Math.abs(app.sc.scrollY - (app.sc.contentHeight - app.sc.height)) < 1, "at the end");
  app.sc.scrollTo(20000);
  for (let i = 0; i < 6; i++) settle();
  // (windowed, the landing pays estimate corrections above the reader into the
  // offset without moving what is on screen: near, not exact)
  const max = app.sc.contentHeight - app.sc.height;
  assert.ok(Math.abs(app.sc.scrollY - 20000) < 100 && app.sc.scrollY < max - 1000, `stayed where it was sent: scrollY ${app.sc.scrollY} of ${max}`);
});
}

// An end pane opens at its end, and its reader stays there while the rows
// measure: rows far taller than the list's first estimate grow its extent
// several times over, and the offset the pane held a moment ago then points
// into the middle of the records. The window reads where the reader is — the
// end — so no row away from it is ever built (each one built was work thrown
// away before it was seen).
await test("scrollAnchor = end (virtualize = true): a long pane opens at its end, building no row away from it", async () => {
  const r = await compile(`script {
  function seen(i: number): number { const g = globalThis as any; g.__built = Math.min(g.__built ?? Infinity, i); return 0 }
}
App [ width = 400, height = 400,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, scrollAnchor = end, width = 300, height = 300,
      content: View [ width = 300, datapath = { d.value },
        layout: SimpleLayout [ axis = y ],
        View [ datapath = :rows[], virtualize = true, width = 300, height = { 80 + seen(:n) } ] ] ] ]`);
  assert.deepEqual(r.errors.map((e) => e.message), [], "fixture compiles");
  const app = buildProgram(r.program);
  app.$attach(new HeadlessBackend(), null);
  globalThis.__built = Infinity;
  app.d.value = { rows: rows(20000) };
  for (let i = 0; i < 8; i++) settle();
  const max = app.sc.contentHeight - app.sc.height;
  assert.ok(Math.abs(app.sc.scrollY - max) < 1, `at the end: scrollY ${app.sc.scrollY} of ${max}`);
  assert.ok(globalThis.__built >= 20000 - 40, `the first row built is near the end: ${globalThis.__built}`);
  delete globalThis.__built;
});

// The full build's place: the top edge running through a row's bottom padding
// (nothing inside it reaches past the edge) — the row below is what is read,
// so the row above growing grows upward, out of view, and moves nothing.
await test("scrollAnchor = content: an edge in a row's padding keeps the row below still", async () => {
  const r = await compile(`App [ width = 400, height = 400,
    big: number = -1,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width = 300, height = 300,
      content: View [ width = 300, datapath = { d.value },
        layout: SimpleLayout [ axis = y, spacing = 4 ],
        View [ datapath = :rows[], width = 300, padding = [4, 0, 10, 0],
          layout: SimpleLayout [ axis = y ],
          body: View [ width = 200, height = { :n == app.big ? 90 : 30 } ] ] ] ] ]`);
  assert.deepEqual(r.errors.map((e) => e.message), [], "fixture compiles");
  const app = buildProgram(r.program);
  app.$attach(new HeadlessBackend(), null);
  app.d.value = { rows: rows(200) };
  for (let i = 0; i < 4; i++) settle();
  const rowsOf = () => app.sc.content.children.filter((c) => c.rowIndex >= 0);
  const lead = (c) => c.y + c.$positionLead("y");
  // the edge 4 px into row 50's 10 px bottom padding
  const r50 = rowsOf()[50];
  app.sc.scrollY = lead(r50) + r50.height - 6;
  for (let i = 0; i < 4; i++) settle();
  const r51 = rowsOf()[51], before = lead(r51) - app.sc.scrollY, h50 = r50.height;
  app.big = 50;
  for (let i = 0; i < 4; i++) settle();
  assert.equal(r50.height, h50 + 60, "row 50 grew by 60");
  assert.ok(Math.abs(lead(r51) - app.sc.scrollY - before) < 0.5, `row 51 stayed at ${before} (now ${lead(r51) - app.sc.scrollY})`);
});

// What the parent stacks after a windowed block sits after its last row, and
// counts in the range.
await test("windowed: a view after the rows sits after the last row and counts in the range", async () => {
  const r = await compile(`App [ width = 400, height = 400,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width = 300, height = 300,
      content: View [ width = 300, datapath = { d.value },
        layout: SimpleLayout [ axis = y, spacing = 5 ],
        View [ datapath = :rows[], virtualize = true, width = 300, height = 30 ],
        after: View [ width = 300, height = 40 ] ] ] ]`);
  assert.deepEqual(r.errors.map((e) => e.message), [], "fixture compiles");
  const app = buildProgram(r.program);
  app.$attach(new HeadlessBackend(), null);
  app.d.value = { rows: rows(500) };
  for (let i = 0; i < 4; i++) settle();
  const rowsEnd = 500 * 30 + 499 * 5;
  assert.equal(app.sc.content.after.y, rowsEnd + 5, "after the last row and the stack's spacing");
  assert.equal(app.sc.content.height, rowsEnd + 5 + 40, "the range includes it");
});

// The end is held like the start: a reader taken to the end, rows near it
// measuring other than their estimate as they arrive, stays exactly at the end.
await test("windowed: a reader at the end stays exactly at the end as the rows there measure", async () => {
  const r = await compile(`App [ width = 400, height = 400,
    d: Dataset { { "rows": [] } },
    sc: View [ scrolls = y, width = 300, height = 300,
      content: View [ width = 300, datapath = { d.value },
        layout: SimpleLayout [ axis = y ],
        View [ datapath = :rows[], virtualize = true, width = 300, height = { 20 + (:n % 7) * 13 } ] ] ] ]`);
  assert.deepEqual(r.errors.map((e) => e.message), [], "fixture compiles");
  const app = buildProgram(r.program);
  app.$attach(new HeadlessBackend(), null);
  app.d.value = { rows: rows(3000) };
  for (let i = 0; i < 4; i++) settle();
  app.sc.scrollTo(app.sc.contentHeight - app.sc.height);   // the end as estimated
  for (let i = 0; i < 8; i++) settle();
  const max = app.sc.contentHeight - app.sc.height;
  assert.ok(Math.abs(app.sc.scrollY - max) < 1, `at the end: scrollY ${app.sc.scrollY} of ${max}`);
  const last = app.sc.content.children.filter((c) => c.visible && c.rowIndex === 2999)[0];
  assert.ok(last !== undefined && Math.abs(last.y + last.height - app.sc.content.height) < 1, "the last record ends the range");
});

await test("a view built later builds exactly as one declared in source — replicated, virtualized, by a State, or by createView", async () => {
  const src = `
class Probe [ width = 200, height = 30,
    textColor = { provided("theme").text },
    density: number = 3,
    layout: SimpleLayout [ axis = x, spacing = 4 ],
    k: number = { app.k },
    pw: number = { parent.width },
    inner: Dataset [ contents = { { v: app.twice(app.k) } } ],
    changes: number = 0,
    trackChanges = ["k"],
    onChange(e: ChangeEvent) { changes = changes + 1 },
    seen: number = 0,
    onInit() { seen = app.k },
    mark: View [ width = 10, height = 10,
        draw(d: Draw) { d.fillStyle = provided("theme").accent == 0 ? "#000" : "#c00"; d.fillRect(0, 0, 10, 10) } ],
    t: Text [ text = { "" + (:label ?? "static") } ],
    dens: Text [ text = { "" + provided("density") } ],
    cr: Text [ text = { "" + classroot.k } ],
    ex: View [ exists = { app.k > 5 }, width = 4, height = 4 ]
    ]

App [ width = 400, height = 400, theme = { SanFrancisco },
    k: number = 7,
    twice(n: number) -> number { return n * 2 },
    on: boolean = false,
    d: Dataset { { "rows": [] } },
    boot: Dataset { { "rows": [ { "label": "b" } ] } },
    declared: Probe [ ],
    early: View [ width = 300, datapath = { app.boot.value }, Probe [ datapath = :rows[] ] ],
    late: View [ width = 300, datapath = { app.d.value }, Probe [ datapath = :rows[] ] ],
    sc: View [ scrolls = y, width = 300, height = 300,
        content: View [ width = 300, datapath = { app.d.value },
            Probe [ datapath = :rows[], virtualize = true ] ] ],
    holder: View [ width = 300,
        State [ applied = { app.on }, viaState: Probe [ ] ] ],
    made: View [ width = 300 ]
    ]`;
  const r = await compile(src);
  assert.deepEqual(r.errors.map((e) => e.message), [], "fixture compiles");
  const errs = [], orig = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(" ")); };
  let app;
  try {
    app = buildProgram(r.program);
    settle();
    app.d.value = { rows: [{ label: "x" }, { label: "y" }] };
    app.on = true;
    settle();
    app.made.createView("Probe");
    settle();
    app.k = 8;
    settle();
  } finally {
    console.error = orig;
  }
  assert.deepEqual(errs, [], "no instance throws while it is built");
  const fp = (p) => ({ ink: p.t.textColor, k: p.k, inner: p.inner.value?.v, seen: p.seen, changes: p.changes,
    dens: p.dens.text, cr: p.cr.text, ex: p.ex != null, placed: p.cr.x > 0 });
  const want = fp(app.declared);
  assert.equal(typeof want.ink, "number", "the declared row reads the provided theme");
  const built = {
    "replicated at boot": app.early.childViews[0],
    "replicated late": app.late.childViews[0],
    "virtualized late": app.sc.content.childViews[0],
    "built by a State": app.holder.childViews.find((v) => v.constructor.name === "Probe"),
    "createView": app.made.childViews[0],
  };
  for (const [how, p] of Object.entries(built)) {
    assert.ok(p !== undefined, how + ": built");
    assert.deepEqual(fp(p), want, how + ": the same as declared");
    assert.equal(p.pw, 300, how + ": reads its own parent");
  }
});

summarize("materialization");
