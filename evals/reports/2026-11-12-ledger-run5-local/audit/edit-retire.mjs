export default async ({ drive, expect, page }) => {
  await drive.set("app", "mode", Number(process.env.MODE ?? 0));
  await page.getByRole("button", { name: "Edit me" }).click();
  await drive.settleMotion();
  await drive.type("Typed");
  const shown = await drive.page.evaluate(() => window.__declare.find("app.cell.field")?.shown ?? null);
  await drive.key("Tab");
  await drive.settleMotion();
  const saved = await drive.page.evaluate(() => window.__declare.find("app.cell").saved);
  console.log("MODE", process.env.MODE, "shown before Tab:", JSON.stringify(shown), "saved after Tab:", JSON.stringify(saved));
  await expect.equal(saved, "Typed");
};
