// hidden-pane.assert — see hidden-pane.declare.
//   node tools/verify.mjs test/soak/hidden-pane.declare --assert test/soak/hidden-pane.assert.mjs
import { meter, soak, STRATA } from "./browser-lib.mjs";
export default async ({ drive, page }) => {
  const m = await meter(page);
  await drive.set("app", "paneOn", false); await drive.wait(100);
  await soak("rows rebuilt inside a hidden pane", m, async (i) => { await drive.set("app", "seq", i + 1); await drive.wait(60); }, { warm: 10, n: 40, extra: STRATA });
  await drive.set("app", "paneOn", true); await drive.wait(200);
  const shown = await page.evaluate(() => window.__declare.find("app.pane").childViews.length);
  console.log(`pane shown again: ${shown} rows in it (5 expected)`);
  await soak("Toast said from a row, rows rebuilt while it shows", m, async (i) => {
    await drive.click(`app.list.${i % 5}.say`); await drive.wait(200);
    await drive.set("app", "seq", 100 + i); await drive.wait(200);
  }, { warm: 5, n: 20, extra: STRATA });
  await soak("ContextMenu opened by right-click on a row, rows rebuilt", m, async (i) => {
    const box = await page.evaluate((k) => { const v = window.__declare.find(`app.list.${k}`); const p = window.__declare.rootPoint(v, 20, 10); return p; }, i % 5);
    await page.mouse.click(box.x, box.y, { button: "right" });
    await drive.wait(300);
    await drive.set("app", "seq", 200 + i); await drive.wait(300);
  }, { warm: 5, n: 20, extra: STRATA });
};
