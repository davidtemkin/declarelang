// On a phone: open Overview, then record an expense with the thumb.
export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await expect(page.getByRole("button", { name: /^Revenue, / })).toBeVisible();
  await page.getByRole("button", { name: "Record" }).click();
  await drive.settleMotion();
  await page.getByRole("menuitem", { name: /^Expense/ }).click();
  await drive.settleMotion();
  await page.getByLabel("Amount").fill("14.50");
  const vendor = page.getByRole("combobox", { name: "Vendor" });
  await vendor.click();
  await drive.type("Pirate");
  await drive.key("Enter");
  await drive.settleData();
  await expect(page.getByRole("combobox", { name: "Category" })).toHaveValue("Shipping & postage");   // the vendor's usual category
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "editorOpen", false);
  await expect.request("POST", "/api/transactions", { body: { kind: "expense", amount: 1450, categoryId: "shipping" } });
};
