// The calendar's named visual states — the flagship, so every pixel here is
// load-bearing for the chrome-standardization work.
//
//   bless:   node tools/verify.mjs apps/calendar/calendar.declare --states apps/calendar/tests/states.mjs --bless
//   compare: node tools/verify.mjs apps/calendar/calendar.declare --states apps/calendar/tests/states.mjs
//
// THE CLOCK IS PINNED. The calendar's initial state derives from the day it
// loads (CAL_BOOT), which is correct behaviour and fatal for a baseline: an
// unpinned capture photographs a different month grid every day and rots with
// nobody having touched the source. AUGUST 2026 is deliberate — it is a 6-row
// month, the wider of the two layouts, so the grid is at its most crowded.
//
// Determinism: the focus rectangle is spring-driven, so every route that
// changes view ends in settleMotion().

const CLOCK = "2026-08-12T10:30:00";

const st = (name, extra = {}) => ({ name, clock: CLOCK, ...extra });

export default [
  // The default surface: the month grid, the brand, the nav arrows (‹ ›, glyphs
  // today), the Today button, and the bespoke tab strip with its sliding pill.
  st("month"),

  // One row of the same grid — the focus rectangle collapsed. Carries the hour
  // gutter and the weekday strip, the two things a bad `nr` breaks.
  st("week", {
    route: async ({ drive }) => {
      await drive.click("app.bar.tabs.4");
      await drive.settleMotion();
    },
  }),

  // One cell, fully zoomed: time blocks rather than chips.
  st("day", {
    route: async ({ drive }) => {
      await drive.click("app.bar.tabs.3");
      await drive.settleMotion();
    },
  }),

  // The year view — twelve minis, the month folding into its own slot.
  st("year", {
    route: async ({ drive }) => {
      await drive.click("app.bar.tabs.6");
      await drive.settleMotion();
    },
  }),

  // Narrow: the bar takes its second row and the nav re-places (`barNarrow`).
  st("month-narrow", { viewport: { width: 560, height: 820 } }),

  // WIDE, because the appearance switch is gated on `width >= 1030` and would
  // otherwise appear in no baseline at all — the sun/half-disc/moon migrated to
  // drawn icons with nothing watching. Found by making that change.
  st("month-wide", { viewport: { width: 1200, height: 768 } }),
];
