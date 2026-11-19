// The calendar's named visual states — the flagship, so every pixel here is
// load-bearing for the chrome-standardization work.
//
//   bless:   node tools/verify.mjs apps/calendar/calendar.declare --states apps/calendar/tests/states.mjs --bless
//   compare: node tools/verify.mjs apps/calendar/calendar.declare --states apps/calendar/tests/states.mjs
//
// THE CLOCK IS PINNED. The calendar's initial state derives from the day it
// loads (its `Time`), which is correct behaviour and fatal for a baseline: an
// unpinned capture photographs a different month grid every day and rots with
// nobody having touched the source. AUGUST 2026 is deliberate — it is a 6-row
// month, the wider of the two layouts, so the grid is at its most crowded.
//
// Determinism: the focus rectangle is spring-driven, so every route that
// changes view ends in settleMotion().

const CLOCK = "2026-08-12T10:30:00";

const st = (name, extra = {}) => ({ name, clock: CLOCK, ...extra });

// the calendar opens in week view; the month states choose Month (just "M"
// where the tabs shorten to letters)
const toMonth = async ({ drive }) => {
  await drive.click((await drive.read("app.tabsCompact")) ? "app.bar.tabs.M" : "app.bar.tabs.Month");
  await drive.settleMotion();
};

export default [
  // The month grid, the brand, the nav arrows (‹ ›, glyphs today), the Today
  // button, and the bespoke tab strip with its sliding pill.
  st("month", { route: toMonth }),

  // The default surface: one row of the same grid — the focus rectangle
  // collapsed. Carries the hour gutter and the weekday strip, the two things a
  // bad `nr` breaks.
  st("week"),

  // One cell, fully zoomed: time blocks rather than chips.
  st("day", {
    route: async ({ drive }) => {
      await drive.click("app.bar.tabs.Day");
      await drive.settleMotion();
    },
  }),

  // The year view — twelve minis, the month folding into its own slot.
  st("year", {
    route: async ({ drive }) => {
      await drive.click("app.bar.tabs.Year");
      await drive.settleMotion();
    },
  }),

  // Narrow: no brand, and the date shortened to the room between the sides.
  st("month-narrow", { viewport: { width: 560, height: 820 }, route: toMonth }),

  // Narrowest: Today gives way to the date, and the month without its year.
  st("month-phone", { viewport: { width: 390, height: 760 }, route: toMonth }),

  // WIDE, because the appearance switch is gated on `width >= 1030` and would
  // otherwise appear in no baseline at all — the sun/half-disc/moon migrated to
  // drawn icons with nothing watching. Found by making that change.
  st("month-wide", { viewport: { width: 1200, height: 768 }, route: toMonth }),
];
