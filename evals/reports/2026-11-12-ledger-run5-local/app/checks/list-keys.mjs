// A click picks a row and opens its detail; the arrows move the detail with
// them; End jumps to the last of every transaction at once.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.set("app", "location", "transactions");
  await drive.set("app", "fPreset", "all");
  await drive.settleData();
  const rows = await drive.page.evaluate(() => window.__declare.find("app").rows.map((r) => r.id));
  await page.getByRole("button", { name: /^Date, / }).nth(2).click();
  await drive.wait(400);
  await drive.settleData();
  await expect.attr("app", "detailOpen", true);
  await expect.equal(await drive.page.evaluate(() => window.__declare.find("app").openId), rows[2]);
  await drive.key("ArrowDown");
  await drive.settleData();
  await expect.equal(await drive.page.evaluate(() => window.__declare.find("app").openId), rows[3]);
  await drive.key("End");
  await drive.settleData();
  await drive.settleMotion();
  await expect.equal(await drive.page.evaluate(() => window.__declare.find("app").openId), rows[rows.length - 1]);
  await expect.text("app.shell.main.pages.transactions.body.detail", "·");
  await drive.key("Escape");
  await expect.attr("app", "detailOpen", false);
};
