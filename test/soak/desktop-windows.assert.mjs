// desktop-windows.assert — the corpus desktop: open 50 Birds from the dock and
// close it with the red light, over and over. Each window is an AppIsland
// running the birds program; closing it discards the island.
//   node tools/verify.mjs apps/desktop/desktop.declare --assert test/soak/desktop-windows.assert.mjs
import { meter, soak } from "./browser-lib.mjs";
export default async ({ drive, page }) => {
  await drive.wait(200); await drive.settleMotion();
  const m = await meter(page);
  const dockIcon = async (appId) => "app.dock.row." + await page.evaluate((id) => window.__declare.find("app.dock.row").children.findIndex((c) => c.appId == id), appId);
  const WINS = () => ({ windows: window.__app.wins.childViews.length, attachedDom: document.querySelectorAll("*").length, islandBoxes: document.querySelectorAll("[data-declare-slot]").length });
  await soak("desktop: open 50 Birds from the dock, close it", m, async () => {
    await drive.click(await dockIcon("birds"));
    await drive.wait(1500); await drive.settleMotion();
    const n = await page.evaluate(() => window.__app.wins.childViews.length);
    await drive.click(`app.wins.${n - 1}.bar.lights.close`);
    await drive.wait(800); await drive.settleMotion();
  }, { warm: 3, n: 8, extra: WINS });
};
