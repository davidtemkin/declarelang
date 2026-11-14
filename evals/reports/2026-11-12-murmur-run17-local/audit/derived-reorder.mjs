export default async ({ drive, expect, page }) => {
  const rows = () => page.evaluate(() => window.__declare.find("app.list").childViews.slice().sort((p, q) => p.y - q.y).map((r) => r.label.text));
  console.log("start ", JSON.stringify(await rows()));
  await page.evaluate(() => window.__declare.find("app").bump(2, 10));   // c moves to the top
  await drive.settleData();
  console.log("bump c", JSON.stringify(await rows()));
  await page.evaluate(() => window.__declare.find("app").bump(1, 11));   // b moves to the top
  await drive.settleData();
  const r = await rows();
  console.log("bump b", JSON.stringify(r));
  expect.equal(r.join(" | "), "b n=3 u=3 | c n=4 u=4 | a n=1 u=1");
};
