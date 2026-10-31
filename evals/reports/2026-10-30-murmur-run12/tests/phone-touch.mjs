// A phone, by finger: hold a message to react, see someone composing, look
// at a photograph and put it away.
export const device = { width: 390, height: 844, touch: true };

const rowOf = async (page, list, id) => list + "." + await page.evaluate((l, m) =>
  window.__declare.find(l).childViews.findIndex((v) => v.msgId == m), list, id);

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.click('app.inbox."Kestrel Street"');
  await drive.settleMotion();
  const list = "app.stage.threads.0.pane.col.list";
  const row = await rowOf(page, list, "m0043");
  await drive.hold(row + ".line.slot.bubble", 700);
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/touch-1.png" });
  await drive.click('app.picker."React ❤️"');
  await drive.settleMotion();
  await expect.text(row + ".marksRow", "❤️");

  await page.evaluate(() => window.__declare.find("app").chats.setComposing("t1", "p5", true));
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/touch-2.png" });
  await expect.visible("app.stage.threads.0.pane.col.typing");

  await drive.click(await rowOf(page, list, "m0042") + ".line.slot.photo");
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/touch-3.png" });
  await drive.click("app.lightbox.stage.dismiss");
  await drive.settleMotion();
  await expect.attr("app", "viewing", null);
};
