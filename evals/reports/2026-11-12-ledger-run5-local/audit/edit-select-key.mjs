// Same cell, edit begun from the keyboard (Tab to the cell, Return) rather than a click
export default async ({ drive, expect, page }) => {
  await drive.set("app", "mode", 1);
  await drive.key("Tab");
  await drive.key("Enter");
  await drive.settleMotion();
  await drive.type("Typed");
  await drive.key("Tab");
  await drive.settleMotion();
  const saved = await drive.page.evaluate(() => window.__declare.find("app.cell").saved);
  await expect.equal(saved, "Typed");
};
