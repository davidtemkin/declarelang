// test/seam.test.mjs — the render seam's CONFORMANCE TABLE.
//
// Seven of `Surface`'s members are OPTIONAL (`setIgnoreScroll?(…)`), and every
// call site invokes them through `?.` — so a backend that never implements one
// type-checks perfectly and does nothing at runtime, forever, in silence. That
// optionality is what lets the seam grow without breaking four backends at
// once; it is also how `ignoreScroll` — a language attribute with a schema
// entry, a guide section, gesture pins and a bug hunt across two devices —
// came to not exist AT ALL on the native Mac backend, unnoticed for as long as
// it has existed. No pixel comparison can see an absence: `gate.mjs` shoots
// the desktop at scroll 0, where fixed chrome and ordinary chrome sit in
// exactly the same place, and reports a pass.
//
// So the seam's gaps are DECLARED below, each with a reason, and this test
// fails when the table and reality disagree IN EITHER DIRECTION:
//
//   - a new gap appears  → write it down, with why (or fill it)
//   - a gap gets filled  → strike it out, so the table stays true
//
// The point is not that every backend must implement everything. A no-pixel
// backend legitimately ignores scroll realization. The point is that the
// difference between "deliberately not applicable" and "nobody ever wrote it"
// must be written down rather than inferred from silence.
//
// Source text, not runtime probing: three of the four backends cannot be
// instantiated without a DOM, and the declaration is the thing under review.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize } from "./harness.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = (f) => readFileSync(path.join(root, "runtime/src", f), "utf8");

const BACKENDS = ["dom", "canvas", "mac", "headless"];

// ── the table ───────────────────────────────────────────────────────────────
// `true` = implemented. A string = deliberately absent, and the reason why.
// Anything absent WITHOUT a reason is a defect this test exists to surface.

const NOT_APPLICABLE = "headless renders nothing: scroll and clip realization have no surface to act on, and an absent optional member is already exactly the no-op this backend wants (its own header's claim that tsc keeps it complete holds for the 31 REQUIRED members — optionality is precisely the hole)";

const TABLE = {
  setIgnoreClip: {
    dom: true, canvas: true, mac: true,
    headless: NOT_APPLICABLE,
  },
  setScroll:  { dom: true, canvas: true, mac: true, headless: true },
  setScrollX: { dom: true, canvas: true, mac: true, headless: true },

  // FILLED 2026-08-05. The realization is the `ignoresClip` shape one property
  // over: a pinned child hosts on the scroller's OWN layer instead of the content
  // layer that translates. gate.mjs measured the close — `ignorescroll` went
  // 1.18% → 0.01% differing, 1.17% → 0% structural, i.e. exactly the hole the
  // baseline note had sized. v1 pins against the DIRECT parent's scroll, which is
  // every use in the corpus; a pinned node nested deeper still rides the
  // intervening boxes (the DOM walks to the nearest scrolling ancestor).
  setIgnoreScroll: {
    dom: true, canvas: true, mac: true,
    headless: NOT_APPLICABLE,
  },
  setPageExtent: {
    dom: true, canvas: true,
    mac: "GAP (found 2026-07-31, not yet fixed) — same family as setIgnoreScroll: the App-is-the-page scroll realization. Without it the host cannot publish the document extent, so an app taller than its window has no scroll range to give the platform",
    headless: NOT_APPLICABLE,
  },

  // ── the windowed-collection seam (added with materialization) ────────────

  setRowCount: {
    dom: true,
    canvas: "GAP — the canvas backend paints; it publishes no accessibility tree at all, so there is no object to carry a windowed collection's LOGICAL row count. Assistive technology over a canvas app is its own unbuilt story; this member is one symptom, not the disease",
    mac: "GAP (not yet built) — AppKit has the row semantics (NSAccessibility rowCount / rowIndexRange), so the native host CAN say it; nothing is wired yet. Until it is, a windowed list there announces the size of its WINDOW rather than of the collection",
    headless: NOT_APPLICABLE,
  },
  setRowIndex: {
    dom: true,
    canvas: "GAP — same absence as setRowCount: no accessibility tree, so a row cannot report its logical position within the collection",
    mac: "GAP (not yet built) — the twin of setRowCount; both land together or neither is useful",
    headless: NOT_APPLICABLE,
  },
  // FILLED 2026-08-05. The native extent is COMPUTED (contentExtent walks the
  // children) rather than measured off a layout box, so the logical extent lands
  // as a floor on that computation — the same statement the DOM's strut makes,
  // without inventing a child to carry it. Setting it also pushes a fresh
  // SCROLLPOS at the owning scroller, because the extent only crosses the bridge
  // on a scroll and a windowed list may be dragged by the bar before it is ever
  // scrolled.
  setVirtualExtent: {
    dom: true, canvas: true, mac: true,
    headless: NOT_APPLICABLE,
  },
  setSelectableRegion: {
    dom: true,
    canvas: "native text selection is a DOM affordance — the canvas walk has no selection to anchor (selection phase 2, 2026-08-06)",
    mac: "the host's selection story rides its native TextEngine; a region surface awaits that design (native-host.md)",
    headless: NOT_APPLICABLE,
  },
  travelWith: {
    dom: true, canvas: true,
    mac: "GAP (not yet built) — surface re-homing: chrome that must ride a scroller's content (the focus ring) or escape one (the DataGrid's header). The callers all check the RETURN value and keep a reactive root-space fallback, so the native host degrades to correct-but-lagging geometry rather than breaking — which is exactly why this absence could go unnoticed without this table",
    headless: NOT_APPLICABLE,
  },
  isTraveling: {
    dom: true, canvas: true,
    mac: "GAP (not yet built) — the read half of travelWith, and absent for the same reason: no re-homing there means nothing is ever away from home, so the optional-call default (undefined, read as false) is the right answer on that backend rather than a silent wrong one",
    headless: NOT_APPLICABLE,
  },
  setRichWidth: {
    dom: true,
    canvas: "deliberate — canvas does not use the native rich-text path at all (its setRichContent returns -1, which is the signal for 'lay the runs out yourself'), so RichText re-flows through its own manual layout on every width change. There is no host box to re-size, and nothing to skip",
    // FILLED 2026-08-05 — `RichOverlay.adoptWidth`. The host already held the
    // laid-out state, so the width-only path carries NO blocks across the bridge:
    // it re-sizes the text container and the rastered band and redraws. The Swift
    // side had the same fast path inside richLayout already (same JSON, new width,
    // nothing wraps); this is that adoption reachable without the JSON.
    mac: true,
    headless: NOT_APPLICABLE,
  },

  // ── the linking seam (location.md §0, 2026-08-05) ────────────────────────

  setLink: {
    dom: true,
    canvas: "deliberate — no elements, so no native <a> to realize: a linked view on canvas still follows (the input walk owns routing), still takes focus and Enter (focus.ts), and still shows the pointer cursor (HitTarget.cursor). What it lacks is the browser-native contract — status-bar preview, ⌘-click, copy-link — which only a real anchor can give; part of canvas's larger unbuilt AT story",
    mac: "GAP (not yet built) — AppKit could carry the link affordances (NSAccessibility link role; the pointing-hand cursor is already native there), but nothing is wired. Routing works; the natives are absent",
    headless: NOT_APPLICABLE,
  },
  scrollToY: {
    dom: true, canvas: true, mac: true,
    headless: NOT_APPLICABLE,
  },
  scrollToX: {
    dom: true,
    canvas: "GAP (found 2026-07-31, not yet fixed) — canvas has setScrollX, so a pane CAN scroll horizontally there, but the programmatic write half is missing: `view.scrollX = n` and scrollIntoView's x arm do nothing. Its scrollToY twin is implemented, which is what makes this look like an oversight rather than a decision",
    mac: true,
    headless: NOT_APPLICABLE,
  },
};

// ── what the sources actually say ───────────────────────────────────────────

/** Every optional member of the Surface interface — the seam's silent-failure
 *  surface, read from the interface itself so the list cannot go stale. */
function optionalSurfaceMembers() {
  const text = src("backend.ts");
  const start = text.indexOf("export interface Surface");
  assert.ok(start > 0, "found the Surface interface");
  const body = text.slice(start, text.indexOf("\n}", start));
  return [...body.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*)\?\(/gm)].map((m) => m[1]);
}

/** Does this backend's source declare a method with that name? */
function implemented(backend, member) {
  return new RegExp(`(^|\\s)${member}\\s*\\(`, "m").test(src(`${backend}-backend.ts`));
}

// ── the gate ────────────────────────────────────────────────────────────────

const members = optionalSurfaceMembers();

await test("the seam's optional members are all accounted for in the table", () => {
  assert.ok(members.length > 0, "parsed the interface");
  const missing = members.filter((m) => TABLE[m] === undefined);
  assert.deepEqual(missing, [],
    `Surface gained optional member(s) with no conformance row. Optional means every\n` +
    `    call site uses \`?.\`, so a backend omitting one fails silently and forever —\n` +
    `    add a row to test/seam.test.mjs saying which backends implement it, and why\n` +
    `    any that do not are deliberate.`);
  const extra = Object.keys(TABLE).filter((m) => !members.includes(m));
  assert.deepEqual(extra, [],
    "the table names members that are no longer optional on Surface — strike them out");
});

for (const member of members) {
  const row = TABLE[member] ?? {};
  await test(`seam: ${member} — the table matches every backend`, () => {
    for (const backend of BACKENDS) {
      const declared = row[backend];
      const real = implemented(backend, member);
      if (declared === true) {
        assert.equal(real, true,
          `${backend}-backend.ts no longer implements ${member}, but the table says it does.\n` +
          `    Either it regressed, or the table is stale.`);
      } else {
        assert.equal(real, false,
          `${backend}-backend.ts now IMPLEMENTS ${member} — the table records it as absent:\n` +
          `      "${String(declared).slice(0, 100)}…"\n` +
          `    Good news; strike the gap out of test/seam.test.mjs.`);
        assert.equal(typeof declared, "string",
          `${backend}-backend.ts does not implement ${member} and the table gives no reason.\n` +
          `    An unexplained absence is exactly the silent failure this file exists to catch:\n` +
          `    say whether it is not applicable or not yet written.`);
      }
    }
  });
}

// The count is load-bearing enough to state out loud: it is the size of the
// seam's silent-failure surface, and it should move deliberately.
//
// 7 → 12 (2026-08-01, the materialization merge): windowed collections added
// five optional members at once — setRowCount / setRowIndex (a windowed row's
// LOGICAL position, for assistive technology), setVirtualExtent (the scroll
// range spans the whole collection, not just what is materialized),
// travelWith (surface re-homing for chrome that rides or escapes a scroller)
// and setRichWidth (adopt a width without re-flowing). Each is optional for
// the same reason the original seven are: a backend without it degrades to a
// defined fallback rather than failing to compile. Each therefore also carries
// its own row above, which is the price of that optionality.
//
// 12 → 13 (2026-08-03): isTraveling, the READ half of travelWith. View.raise()
// was re-seating a traveled surface under its model parent — dragging the focus
// ring out of the scroller it rides while its coordinates still read that
// scroller's content space, so the first Tab of a session painted the ring a
// scroller-origin above its target. Raise now asks before it moves.
// 13 → 14 (2026-08-05, the linking merge — location.md §0): setLink — a
// linked view's REAL <a> overlay, the native affordances; routing never
// depends on it, so a backend without it degrades to follow-only. (The same
// merge added `deferredRichMeasure`, an optional data PROPERTY the method
// scan here does not count: absent = synchronous rich measurement, which is
// what keeps headless reveals first-call while DOM reveals hold for the
// ResizeObserver.)
await test("the size of the silent-failure surface is stated, not drifting", () => {
  const total = [...src("backend.ts").matchAll(/^ {2}[a-zA-Z][a-zA-Z0-9]*\??\(/gm)].length;
  assert.equal(members.length, 15,
    `Surface's optional-member count changed (${members.length} of ~${total}). That is the ` +
    `set of capabilities a backend can omit in total silence — update the number here ` +
    `deliberately, with the row that justifies it.`);
});

summarize("seam");
