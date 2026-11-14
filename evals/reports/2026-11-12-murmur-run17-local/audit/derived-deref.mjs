export default async ({ drive, expect, page }) => {
  await expect.text("app.direct", "direct 1");
  await expect.text("app.list.0", "derived 1");
  await page.evaluate(() => window.__declare.find("app").add());
  await drive.settleData();
  await expect.text("app.direct", "direct 2");
  await expect.text("app.list.0", "derived 2");
};
