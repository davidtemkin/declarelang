// The desktop's named visual states.
//
//   bless:   node tools/verify.mjs apps/desktop/desktop.declare --states apps/desktop/tests/states.mjs --bless
//   compare: node tools/verify.mjs apps/desktop/desktop.declare --states apps/desktop/tests/states.mjs
//
// The desktop is the last app to get an instrument, and it needs one before its
// menu icons migrate (chrome-divergences D11 puts WindowIcon and CodeIcon here).
// Most of its drawn marks are window chrome — wallpaper, dock plate, grip, zoom
// triangle — and stay app-local; these states exist to prove that work does not
// disturb them, not to redesign them.
//
// THE CLOCK IS PINNED: the menubar carries a live clock on a 15s tick. So is the
// colour scheme, by the harness default — see verify-behave's openApp.
//
// These states settle MOTION rather than waiting a fixed span, which they could
// not do until 2026-08-03: six `magSpring`s in the dock's minimized-window badges
// chased a NaN target forever (chrome-divergences F1), so `settleMotion` could
// never return and a fixed window was the only honest option. With the gate fixed
// the desktop comes to rest, and a state that waits for rest is deterministic by
// construction instead of by three lucky compares.
//
// Boot is deferred by design — `onInit` opens the welcome note and Files one tick
// later, because their geometry reads `app.width`, wired after construction — so
// each route steps past that before settling.

const CLOCK = "2026-08-12T10:30:00";
const rest = async (drive) => { await drive.wait(120); await drive.settleMotion(); };

export default [
  // The desk as it opens: wallpaper, menubar, dock, and the two boot windows.
  { name: "desk", clock: CLOCK, route: async ({ drive }) => { await rest(drive); } },

  // The brand menu open — the icon column D11 migrates ("[ ]", "◐", "‹›").
  {
    name: "brand-menu",
    clock: CLOCK,
    route: async ({ drive }) => {
      await rest(drive);
      await drive.click("app.bar.mb.row.0");
      await drive.settleMotion();
    },
  },

  // THE MAGNIFICATION WAVE, at rest mid-swell. The dock's springs are the most
  // iterated motion in the corpus and nothing photographed them; they were also
  // uncapturable while F1 stood, because the wave settles and the badge springs
  // never did. Pointer parked over the fourth icon (Calendar): its neighbours must swell
  // and displace, and the whole row must be STILL when the shutter opens.
  {
    name: "dock-magnified",
    clock: CLOCK,
    route: async ({ drive, page }) => {
      await rest(drive);
      // by INDEX: a DockIcon's `name` is its label pill's text, an attribute,
      // not a member name, so the row's children are addressed positionally
      const n = await page.evaluate(() => window.__declare.inspect("app.dock.row.3"));
      await page.mouse.move(n.rootX + n.width / 2, n.rootY + n.height / 2);
      await drive.settleMotion();
    },
  },
];
