// desktop-why.assert — what keeps a closed desktop window's program alive:
// tag the birds window's tenant App, close the window, cycle twice more, then
// the retaining path from a page heap snapshot.
//   node tools/verify.mjs apps/desktop/desktop.declare --assert test/soak/desktop-why.assert.mjs
import { meter, pageSnapshot } from "./browser-lib.mjs";
import { retainingPaths } from "./retainers.mjs";
export default async ({ drive, page }) => {
  await drive.wait(200); await drive.settleMotion();
  const m = await meter(page);
  const dockIcon = async (appId) => "app.dock.row." + await page.evaluate((id) => window.__declare.find("app.dock.row").children.findIndex((c) => c.appId == id), appId);
  const cycle = async (tag) => {
    await drive.click(await dockIcon("birds"));
    await drive.wait(1500); await drive.settleMotion();
    const n = await page.evaluate(() => window.__app.wins.childViews.length);
    if (tag) console.log("tagged:", await page.evaluate((k) => { const w = window.__declare.find(`app.wins.${k}`); const t = w.island.$tenant; if (t) t.__soakDead = {}; w.island.__soakDead = {}; return !!t; }, n - 1));
    await drive.click(`app.wins.${n - 1}.bar.lights.close`);
    await drive.wait(800); await drive.settleMotion();
  };
  await cycle(false); await cycle(true); await cycle(false); await cycle(false);
  for (let i = 0; i < 3; i++) await m.cdp.send("HeapProfiler.collectGarbage");
  const snap = await pageSnapshot(m.cdp);
  const { targets, paths, mode } = retainingPaths({ snap, mark: "__soakDead", max: 2 });
  console.log(`closed window's island/tenant alive: ${targets} ${mode ?? ""}`);
  for (const p of paths) console.log(p.split("\n").slice(-18).join("\n"), "\n");
};
