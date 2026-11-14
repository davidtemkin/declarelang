// Set a $30 monthly budget for Software; Budgets says in words where it stands.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.set("app", "location", "budgets");
  await drive.settleData();
  const has = await drive.page.evaluate(() => window.__declare.find("app.shell.main.pages.budgets").list.some((b) => b.categoryId == "software"));
  if (!has) {
    await page.getByRole("combobox", { name: "Category to budget" }).click();
    await drive.type("Software");
    await drive.key("Enter");
    await page.getByRole("textbox", { name: "Monthly amount" }).click();
    await drive.type("30");
    await page.getByRole("button", { name: "Add budget" }).click();
  } else {
    await page.getByRole("textbox", { name: "Software monthly budget" }).fill("30");
    await drive.key("Enter");
  }
  await drive.settleData();
  const b = await drive.page.evaluate(() => window.__declare.find("app.shell.main.pages.budgets").list.find((b) => b.categoryId == "software"));
  await expect.equal(b?.amount, 3000);
  const words = b.spent > 3000 ? "Over by" : "On track";
  await expect.text("app.shell.main.pages.budgets.col.rows", words);
};
