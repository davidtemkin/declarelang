export default async ({ drive, page }) => {
  const t0 = Date.now();
  const log = await page.evaluate(() => { window.__frames = []; const W = window.WebSocket; return typeof W; });
  await drive.wait(6000);
  console.log("real ms", Date.now() - t0, "page now", await page.evaluate(() => Date.now()));
  console.log("last", await page.evaluate(() => String(window.__declare.find("app.live").last)));
  console.log("status", await page.evaluate(() => String(window.__declare.find("app.live").status)));
};
