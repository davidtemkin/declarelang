// The desktop's WINDOW-MANAGEMENT contract — verify rung 5.
// Run: node tools/verify.mjs apps/desktop/desktop.declare --assert apps/desktop/tests/assert.mjs
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
      // instances era: activeApp is the application NODE — normalize to its id
      activeApp: m.activeApp && m.activeApp.id != null ? m.activeApp.id : m.activeApp,
      miniCount: m.miniCount,
      front: m.frontWin ? (m.frontWin.appTitle ?? m.frontWin.title) : null,
      birdsRunning: (() => {                            // flag era → records era → instances era
        const L = window.__app.launcher ?? window.__app;
        if (L.birds) return !!L.birds.running;
        return L.rec ? !!(L.rec("birds") ?? {}).running : !!L.brdRunning;
      })(),
      windows: window.__app.wins.children.filter((c) => c.recId === undefined || c.win != null).length,
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
  await drive.click("app.wins.2.0.bar.lights.mini");   // windows-as-data: wins.N is the slot, .0 its window
  await drive.wait(600);
  await drive.settleMotion();
  eq(await facts(), { activeApp: "files", miniCount: 1, front: null, birdsRunning: true, windows: 3 },
    "after minimize");
  // the dock FITS the parked window (the WM hands raw facts; dock.tiles does
  // the pixel math): birds' 880×560 window at thumbEdge 64 → 64×41
  const tile = await page.evaluate(() => {
    const t = (window.__app.dock.tiles ?? [])[0] ?? null;
    return t && { ix: t.ix, label: t.label, w: t.w, h: t.h };
  });
  // (the tile carries geometry + label only; the app identity rides
  // miniRecs.appId in the instances era)
  eq(tile, { ix: 0, label: "50 Birds", w: 64, h: 41 }, "the fitted tile");

  // RESTORE from the dock's parked strip: back on stage, focused again
  await page.evaluate(() => (window.__app.wm ?? window.__app).restoreMiniAt(0));
  await drive.wait(600);
  await drive.settleMotion();
  eq(await facts(), { activeApp: "birds", miniCount: 0, front: "50 Birds", birdsRunning: true, windows: 3 },
    "after restore");

  // CLOSE via the red light: the window goes; the APP stays running (closing
  // is not quitting — the dock dot survives until Quit)
  await drive.click("app.wins.2.0.bar.lights.close");
  await drive.wait(600);
  await drive.settleMotion();
  eq(await facts(), { activeApp: "files", miniCount: 0, front: null, birdsRunning: true, windows: 2 },
    "after close");

  // FOCUS: clicking a window's bar raises it and names its app active
  await drive.click("app.wins.1.0.bar");
  await drive.wait(300);
  await drive.settleMotion();
  eq(await facts(), { activeApp: "files", miniCount: 0, front: "Documentation", birdsRunning: true, windows: 2 },
    "after refocus click");

  // THE ALERT owns its state now (the repatriation): an inert dock icon
  // (Write, past the five replicated launchables) raises it; OK dismisses
  await drive.click("app.dock.row.6");
  await drive.wait(300);
  await drive.settleMotion();
  const shown = await page.evaluate(() => ({ vis: window.__app.alert.visible,
    name: window.__app.alert.subject ? window.__app.alert.subject.title : (window.__app.alert.name ?? "") }));
  eq(shown, { vis: true, name: "Write" }, "the inert icon raised the alert");
  await drive.click("app.alert.panel.ok");
  await drive.wait(200);
  await drive.settleMotion();
  const gone = await page.evaluate(() => ({ vis: window.__app.alert.visible,
    name: window.__app.alert.subject ? window.__app.alert.subject.title : (window.__app.alert.name ?? "") }));
  eq(gone, { vis: false, name: "" }, "OK dismissed it");
};
