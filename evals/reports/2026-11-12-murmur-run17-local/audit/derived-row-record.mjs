export default async ({ drive, expect, page }) => {
  await expect.text("app.list.0.0", "t1 n=1 u=0");
  await page.evaluate(() => window.__declare.find("app").add());
  await drive.settleData();
  const direct = await page.evaluate(() => window.__declare.find("app").count(window.__declare.find("app").s.value.threads[0]));
  console.log("direct count", direct);
  await expect.text("app.list.0.0", "t1 n=2 u=1");
};
