// The longest conversation, read back to its first message by dragging the
// scroll thumb, and returned to after visiting another conversation.
export const device = { width: 1440, height: 900 };

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.set("app", "location", "t4");
  await drive.settleMotion();
  const pane = "app.stage.threads.3.pane";
  const box = await page.evaluate((p) => { const v = window.__declare.find(p); const o = v.rootOrigin(); return { x: o.x, y: o.y, w: v.width, h: v.height }; }, pane);

  // the thumb sits at the bottom of the pane's right edge; drag it to the top
  const x = box.x + box.w - 6;
  await page.mouse.move(x, box.y + box.h - 12);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(x, box.y + box.h - 12 - (box.h * i) / 20);
  await drive.waitReal(400);
  await page.screenshot({ path: "/tmp/hist-1.png" });
  await page.mouse.up();
  await drive.waitReal(600);
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/hist-2.png" });
  await expect.text(pane + ".col.intro", "Since");
  await expect.text(pane + ".col.list", "got the permits back");

  // somewhere in the middle, then away and back
  await drive.wheel(pane, 1600);
  await drive.waitReal(500);
  const before = await page.evaluate((p) => window.__declare.find(p).scrollY, pane);
  await drive.set("app", "location", "t1");
  await drive.settleMotion();
  await drive.set("app", "location", "t4");
  await drive.settleMotion();
  const after = await page.evaluate((p) => window.__declare.find(p).scrollY, pane);
  await page.screenshot({ path: "/tmp/hist-3.png" });
  await expect.equal(Math.round(after), Math.round(before));
};
