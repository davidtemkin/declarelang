// The desktop's named visual states.
//
//   bless:   node tools/verify.mjs apps/desktop/desktop.declare --states apps/desktop/tests/states.mjs --bless
//   compare: node tools/verify.mjs apps/desktop/desktop.declare --states apps/desktop/tests/states.mjs
//
// Most of the desktop's drawn marks are window chrome — wallpaper, dock plate,
// grip, zoom triangle — and stay app-local; these states exist to prove that
// chrome work does not disturb them, not to redesign them.
//
// The clock is pinned: the menubar carries a live clock (`Time [ tick = minute ]`).
// So is the color scheme, by the harness default — see verify-behave's openApp.
//
// These states settle motion rather than waiting a fixed span: the desktop comes
// to rest, and a state that waits for rest is deterministic by construction.
//
// Boot is deferred by design — `onReady` opens the welcome note and Files once
// the app's geometry is wired — so each route steps past that before settling.

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
