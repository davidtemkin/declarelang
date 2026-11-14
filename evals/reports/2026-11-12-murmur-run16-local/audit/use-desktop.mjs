// The audit's own use of the delivered app at 1440 × 900: the long history
// read back by dragging the scroll thumb, a viewer, a send.
export const device = { width: 1440, height: 900, touch: false };
const D = "~/Code/Declare/evals/reports/2026-11-12-murmur-run16-local/audit/";
export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate((p, a) => window.__declare.find(p)[a], p, a);
  await page.screenshot({ path: D + "use-desk-list.png" });
  await drive.click('app.stage.side.list.rows."Trail crew"');
  await drive.settleMotion();
  let p;
  for (let i = 0; i < 6; i++) if ((await read(`app.stage.main.panes.${i}`, "threadId")) === "t4") p = `app.stage.main.panes.${i}`;
  const s = p + ".scroller";
  console.log("w,h", await read(s, "width"), await read(s, "height"), "first", await read(s + ".feed", "firstVisibleRow"));
  await page.screenshot({ path: D + "use-desk-trail.png" });
  // the thumb sits at the foot of the track at the pane's right edge
  for (const y of [830, 836, 840]) {
    await page.mouse.move(1432, y); await page.mouse.down();
    await page.mouse.move(1432, 400, { steps: 8 }); await page.mouse.move(1432, 62, { steps: 8 });
    await page.mouse.up();
    await drive.waitReal(700);
    const f = await read(s + ".feed", "firstVisibleRow");
    console.log("thumb from", y, "→ first row", f);
    if (f < 100) break;
  }
  await page.screenshot({ path: D + "use-desk-top.png" });
  await page.mouse.move(1432, 70); await page.mouse.down();
  await page.mouse.move(1432, 450, { steps: 10 }); await page.mouse.up();
  await drive.waitReal(700);
  console.log("middle → first row", await read(s + ".feed", "firstVisibleRow"));
  await page.screenshot({ path: D + "use-desk-middle.png" });
};
