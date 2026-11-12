export const device = { width: 1440, height: 900 };
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  const t0 = Date.now();
  await drive.set("app", "location", "d116");
  await drive.settleData();
  await drive.settleMotion();
  console.log("open ms", Date.now() - t0);
  const p = await drive.profile(async () => {
    await page.evaluate(() => window.__declare.find("app.ed").go(window.__declare.find("app.doc").value.slides[50].id));
    await drive.settleMotion();
    await page.evaluate(() => { const e = window.__declare.find("app.ed"); e.select(["r"]); e.nudge(5, 0); });
    await drive.settleMotion();
  });
  console.log(p.text.split("\n").slice(0, 25).join("\n"));
  await page.evaluate(() => { window.__declare.find("app.history").undo() });
  await drive.wait(1500); await drive.settleData();
  expect.equal(1, 1);
};
