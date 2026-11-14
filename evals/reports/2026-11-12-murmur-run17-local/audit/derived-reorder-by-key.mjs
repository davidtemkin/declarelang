export default async ({ drive, expect, page }) => {
  await page.evaluate(() => { window.__declare.find("app.list").childViews.forEach((v, i) => { v.__tag = "view" + i; }); });
  const rows = () => page.evaluate(() => window.__declare.find("app.list").childViews.map((r) => r.__tag + "@y" + r.y + ":" + r.tid + " n=" + r.n + " direct=" + window.__declare.find("app").thread(r.tid)?.msgs.length));
  console.log("start ", JSON.stringify(await rows()));
  await page.evaluate(() => window.__declare.find("app").bump(2, 10));
  console.log("sync  ", JSON.stringify(await rows()));
  await drive.settleData();
  console.log("settled", JSON.stringify(await rows()));
};
