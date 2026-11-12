export default async ({ drive, expect, page }) => {
  await drive.selectAll("app.field");
  await drive.type("  Quarterly review  ");
  await drive.key("Enter");
  await drive.key("Tab");
  await drive.settleMotion();
  expect.equal(await page.evaluate(() => window.__declare.find("app").title), "Quarterly review");
};
