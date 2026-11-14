export default async ({ drive, expect, page }) => {
  const keep = process.env.KEEP === "1";
  if (keep) await page.evaluate(() => { window.__declare.find("app.grid").keep = true; });
  await drive.settleMotion();
  await drive.click("app.grid.f");
  await drive.type("5");
  await drive.key("Enter");
  await drive.settleMotion();
  const r = await page.evaluate(() => { const g = window.__declare.find("app.grid"); return { fieldEnters: g.fieldEnters, gridEnters: g.gridEnters, editing: g.editing }; });
  console.log("KEEP=" + (keep ? 1 : 0), JSON.stringify(r));
  await expect.equal(r.gridEnters, 0);
};
