// On a phone: open Overview, then record an expense with the thumb.
export const device = { width: 390, height: 844, touch: true };
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await expect.attr("app", "page", "overview");
  await expect.visible("app.shell.main.tabs");
  await page.getByRole("button", { name: "Record an expense or a sale" }).click();
  await drive.settleMotion();
  await page.getByText("New expense", { exact: true }).click();
  await drive.settleMotion();
  await expect.attr("app.editor", "shown", true);
  await page.getByRole("textbox", { name: "Amount" }).click();
  await drive.type("14.50");
  await page.getByRole("combobox", { name: "Vendor" }).click();
  await drive.type("USPS");
  await drive.key("Enter");
  await drive.settleData();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "editorOpen", false);
  await expect.request("POST", "/api/transactions", { body: { kind: "expense", amount: 1450, categoryId: "shipping" } });
};
