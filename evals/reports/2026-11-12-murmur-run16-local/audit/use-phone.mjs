// The audit's own use on a phone with a finger: open, swipe back through
// history, leave and return, send, open a photo, react, go back.
export const device = { width: 390, height: 844, touch: true };
const D = "~/Code/Declare/evals/reports/2026-11-12-murmur-run16-local/audit/";
export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate((p, a) => window.__declare.find(p)[a], p, a);
  await page.screenshot({ path: D + "use-phone-list.png" });
  await drive.click('app.stage.side.list.rows."Book club"');
  await drive.settleMotion();
  let p;
  for (let i = 0; i < 6; i++) if ((await read(`app.stage.main.panes.${i}`, "threadId")) === "t6") p = `app.stage.main.panes.${i}`;
  const s = p + ".scroller";
  await page.screenshot({ path: D + "use-phone-open.png" });
  for (let i = 0; i < 4; i++) await drive.drag(s, 0, 500);
  await drive.waitReal(800);
  const back = await read(s + ".feed", "firstVisibleRow");
  console.log("after 4 swipes, first row", back, "of", await read(p, "count"));
  await page.screenshot({ path: D + "use-phone-back.png" });
  await drive.click(p + ".head.back");
  await drive.settleMotion();
  await drive.click('app.stage.side.list.rows."Dana Ruiz"');
  await drive.settleMotion();
  let d;
  for (let i = 0; i < 6; i++) if ((await read(`app.stage.main.panes.${i}`, "threadId")) === "t3") d = `app.stage.main.panes.${i}`;
  await drive.click(d + ".head.back");
  await drive.settleMotion();
  await drive.click('app.stage.side.list.rows."Book club"');
  await drive.settleMotion();
  console.log("returned, first row", await read(s + ".feed", "firstVisibleRow"), "(was", back + ")");
  await drive.click(p + ".composer.bar.field");
  await drive.type("on my way");
  await drive.click(p + ".composer.bar.sendIt");
  await drive.settleMotion();
  await page.screenshot({ path: D + "use-phone-sent.png" });
  await expect.text(s + ".feed", "on my way");
};
