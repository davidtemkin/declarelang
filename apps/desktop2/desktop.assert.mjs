// The desktop's WINDOW-MANAGEMENT contract — verify rung 5.
// Run: node tools/verify.mjs apps/desktop2/desktop.declare --assert apps/desktop2/desktop.assert.mjs
//
// Written as the refactor gate for the Node ("faceless logic") restructuring:
// every fact and verb here must answer identically before and after the window
// manager and launcher move off the App instance. Asserts at the language's
// altitude — real clicks on the dock and the traffic lights, facts read back
// through the app — so it holds whichever object OWNS the facts.
export default async ({ drive, expect, page }) => {
  const facts = () => page.evaluate(() => {
    const m = window.__app.wm ?? window.__app;          // the WM node, or the pre-refactor App
    return {
      activeApp: m.activeApp,
      miniCount: m.miniCount,
      front: m.frontWin ? (m.frontWin.appTitle ?? m.frontWin.title) : null,
      birdsRunning: window.__app.brdRunning,
      windows: window.__app.wins.children.length,
    };
  });
  const eq = (got, want, what) => {
    if (JSON.stringify(got) !== JSON.stringify(want))
      expect.fail(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  };

  // the desk as it boots: the welcome jot (plain) and the Documentation browser
  await drive.wait(200);
  await drive.settleMotion();
  eq(await facts(), { activeApp: "files", miniCount: 0, front: "Documentation", birdsRunning: false, windows: 2 },
    "boot state");

  // LAUNCH from the dock (icon 5 = 50 Birds): a real click, the launch gate
  // opens a window, focus and the active app follow
  await drive.click("app.dock.row.5");
  await drive.wait(1500);
  await drive.settleMotion();
  eq(await facts(), { activeApp: "birds", miniCount: 0, front: "50 Birds", birdsRunning: true, windows: 3 },
    "after dock launch");

  // MINIMIZE via the yellow light: the window parks, focus falls back
  await drive.click("app.wins.2.bar.lights.mini");
  await drive.wait(600);
  await drive.settleMotion();
  eq(await facts(), { activeApp: "files", miniCount: 1, front: null, birdsRunning: true, windows: 3 },
    "after minimize");

  // RESTORE from the dock's parked strip: back on stage, focused again
  await page.evaluate(() => (window.__app.wm ?? window.__app).restoreMiniAt(0));
  await drive.wait(600);
  await drive.settleMotion();
  eq(await facts(), { activeApp: "birds", miniCount: 0, front: "50 Birds", birdsRunning: true, windows: 3 },
    "after restore");

  // CLOSE via the red light: the window goes; the APP stays running (closing
  // is not quitting — the dock dot survives until Quit)
  await drive.click("app.wins.2.bar.lights.close");
  await drive.wait(600);
  await drive.settleMotion();
  eq(await facts(), { activeApp: "files", miniCount: 0, front: null, birdsRunning: true, windows: 2 },
    "after close");

  // FOCUS: clicking a window's bar raises it and names its app active
  await drive.click("app.wins.1.bar");
  await drive.wait(300);
  await drive.settleMotion();
  eq(await facts(), { activeApp: "files", miniCount: 0, front: "Documentation", birdsRunning: true, windows: 2 },
    "after refocus click");
};
