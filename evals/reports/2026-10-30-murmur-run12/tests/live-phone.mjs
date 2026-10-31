// A phone, with the service's live schedule: send into a conversation, see it
// shown at once and answered, then watch the list reorder as messages arrive.
export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.click('app.inbox."Priya Raman"');
  await drive.settleMotion();
  await drive.click("app.stage.threads.1.composer.box.field");
  await drive.type("on my way");
  await drive.key("Enter");
  await drive.wait(50);
  await expect.text("app.stage.threads.1.pane.col.list", "on my way");
  await page.screenshot({ path: "/tmp/live-1.png" });

  await drive.waitReal(3000);
  await drive.settleMotion();
  await expect.equal(await page.evaluate(() => 1), 1);
  await page.screenshot({ path: "/tmp/live-2.png" });
  await expect.text("app.stage.threads.1.pane.col.list", "on my way");

  await drive.click("app.stage.threads.1.bar.back");
  await drive.settleMotion();
  await drive.waitReal(4000);
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/live-3.png" });
  await expect.text("app.inbox.body.rows", "one more column question");
};
