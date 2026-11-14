export default async ({ drive, expect, page }) => {
  await page.getByRole("button", { name: "Open" }).click();
  await drive.settleMotion();
  await page.getByLabel("Hex colour").click();
  await drive.type("#123456");
  await drive.key("Enter");
  await drive.key("Escape");
  await drive.settleMotion();
  const shown = await page.evaluate(() => window.__declare.find("app.pop").shown);
  const took = await page.evaluate(() => window.__declare.find("app").appTook);
  console.log("after Enter, Escape: popover shown =", shown, "· App's Escape ran", took, "time(s)");
  await drive.key("Escape");
  await drive.settleMotion();
  console.log("second Escape: popover shown =", await page.evaluate(() => window.__declare.find("app.pop").shown), "· App's Escape ran", await page.evaluate(() => window.__declare.find("app").appTook));
};
