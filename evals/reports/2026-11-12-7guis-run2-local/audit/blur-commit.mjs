export default async ({ drive, expect, page }) => {
  await drive.click("app.bar.tabs.Cells");
  const grid = "app.pages.cells.grid";
  await drive.dblclick(grid, 44 + 20, 24 + 12);           // A0
  await drive.type("5");
  await drive.click(grid, 44 + 92 + 20, 24 + 24 + 12);     // click B1: leaves the field
  await drive.settleMotion();
  const a0 = await page.evaluate(() => window.__declare.find("app.pages.cells").sheet.cell("A0"));
  console.log("after click-away A0 =", JSON.stringify(a0));
  await drive.dblclick(grid, 44 + 20, 24 + 48 + 12);       // A2
  await drive.type("7");
  await drive.key("Tab");
  await drive.settleMotion();
  console.log("after Tab A2 =", JSON.stringify(await page.evaluate(() => window.__declare.find("app.pages.cells").sheet.cell("A2"))));
  await drive.dblclick(grid, 44 + 20, 24 + 72 + 12);       // A3
  await drive.type("9");
  await drive.key("Escape");
  await drive.settleMotion();
  console.log("after Escape A3 =", JSON.stringify(await page.evaluate(() => window.__declare.find("app.pages.cells").sheet.cell("A3"))));
  await expect.equal(1, 1);
};
