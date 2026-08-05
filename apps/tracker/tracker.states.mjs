// The tracker's named visual states.
//
//   bless:   node tools/verify.mjs apps/tracker/tracker.declare --states apps/tracker/tracker.states.mjs --bless
//   compare: node tools/verify.mjs apps/tracker/tracker.declare --states apps/tracker/tracker.states.mjs
//
// The tracker carries more glyph-as-icon sites than any other app — the four
// filter/sort buttons wear `▾` inside their LABEL STRINGS, the group headers use
// `▶`/`▼`, and the sort-direction control uses `↑`/`↓`. All of them sit in the
// default state, which is why one screenshot does most of the work here.
//
// THE CLOCK IS PINNED so the row list's dates don't drift.
//
// THE PERF READOUT IS MASKED. The status strip renders `loadMs`/`adoptMs` —
// `performance.now()` deltas — so it differs on every run by construction.
// Settling does not help (it is not motion) and pinning the clock cannot help
// either: the animation clock IS performance.now, so freezing it would stop
// motion rather than steady the number. Measured drift with no mask: 153
// channels at Δ74. The mask says the honest thing — this rectangle measures the
// machine, not the design — instead of raising the global tolerance and going
// blind to the 1px shifts a chrome change actually produces.

const CLOCK = "2026-08-12T10:30:00";

// bottom-right status strip; padded well past the measured box (923..989 ×
// 748..756 at 1024×768) because the readout's width moves with its digits
const perfMask = (w, h) => [{ x: w - 200, y: h - 34, w: 200, h: 34 }];

const rest = async (drive) => { await drive.settleMotion(); };

export default [
  // The list: the toolbar's four glyph-bearing buttons, the group headers, the
  // sort-direction toggle, and the rows.
  {
    name: "list",
    clock: CLOCK,
    mask: perfMask(1024, 768),
    route: async ({ drive }) => rest(drive),
  },

  // A menu over the list — its drawn check against the app's own glyphs.
  {
    name: "sort-menu",
    clock: CLOCK,
    mask: perfMask(1024, 768),
    route: async ({ drive }) => {
      await drive.click("app.tools.acts.sortBtn");
      await drive.settleMotion();
      await drive.wait(1400);           // past the focus ring's idle fade
      await drive.settleMotion();
    },
  },

  // Compact: the chip row scrolls sideways instead of spilling.
  {
    name: "list-narrow",
    clock: CLOCK,
    viewport: { width: 560, height: 900 },
    mask: perfMask(560, 900),
    route: async ({ drive }) => rest(drive),
  },

  // BOTH SIDES OF THE WRAP THRESHOLD. The toolbar's two clusters need 1064px to
  // sit side by side, so 1024 wraps to two rows and 1100 does not. `list` above
  // captures the wrapped case; this captures the flat one, which is the state
  // that used to paint the Grouped checkbox over the Label button's chevron.
  {
    name: "list-wide",
    clock: CLOCK,
    viewport: { width: 1100, height: 768 },
    mask: perfMask(1100, 768),
    route: async ({ drive }) => rest(drive),
  },
];
