// island-each.assert — per tenant kind: the island (and its tenant) built and
// discarded; growth per cycle says which kind of tenant is never given back.
//   node tools/verify.mjs test/soak/island-each.declare --assert test/soak/island-each.assert.mjs
import { meter, soak } from "./browser-lib.mjs";
export default async ({ drive, page }) => {
  const m = await meter(page);
  for (const kind of ["plain", "button", "shortcuts", "popover", "keys"]) {
    await drive.set("app", "which", kind); await drive.wait(1000);
    const mounted = await page.evaluate(() => { const i = window.__declare.find("app.box").childViews[0]; return !!(i && i.$tenant); });
    await soak(`tenant '${kind}' (mounted: ${mounted}) built and discarded`, m, async () => {
      await drive.set("app", "which", ""); await drive.wait(150);
      await drive.set("app", "which", kind); await drive.wait(700);
    }, { warm: 3, n: 10 });
    await drive.set("app", "which", ""); await drive.wait(200);
  }
};
