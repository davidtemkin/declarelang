export default async ({ drive, expect, page }) => {
  await drive.set("app", "open", true);
  await drive.wait(100);
  await drive.settleData();
  await drive.settleMotion();
  expect.equal(await page.evaluate(() => window.__declare.find("app.home").visible), false);
};
