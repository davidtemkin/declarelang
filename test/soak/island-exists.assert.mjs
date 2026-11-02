// island-exists.assert — the island view discarded with its tenant inside, every
// cycle: the tenant program (controls, Shortcuts, Keys, a Time, a State, an open
// Popover) must be given back whole.
//   node tools/verify.mjs test/soak/island-exists.declare --assert test/soak/island-exists.assert.mjs
import { meter, soak } from "./browser-lib.mjs";
export default async ({ drive, page }) => {
  const m = await meter(page);
  await drive.wait(800);
  const mounted = await page.evaluate(() => { const i = window.__declare.find("app.box").childViews[0]; return !!(i && i.$tenant); });
  console.log("tenant mounted at start:", mounted);
  await soak("AppIsland (with a tenant) built and discarded", m, async () => {
    await drive.set("app", "on", false); await drive.wait(200);
    await drive.set("app", "on", true); await drive.wait(800);
  }, { warm: 4, n: 15 });
};
