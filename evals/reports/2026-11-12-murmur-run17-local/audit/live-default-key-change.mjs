export default async ({ drive, expect, page }) => {
  await expect.text("app.box.label", "a n=1");
  await page.evaluate(() => { window.__declare.find("app.box").tid = "b"; });
  await drive.settleData();
  const e = await page.evaluate(() => ({ t: window.__declare.find("app.box").t?.id, n: window.__declare.find("app.box").n, explain: window.__declare.explain("app.box", "n").constraint }));
  console.log(JSON.stringify(e));
  await expect.text("app.box.label", "b n=2");
};
