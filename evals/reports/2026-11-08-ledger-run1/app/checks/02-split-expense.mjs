// Flow 2: an expense of $120 from "Printworks" (new the first time this runs), split $90
// Stock & materials and $20 Shipping & postage: saving waits, showing $10.00 remaining; add
// $10 Packaging; save. It appears in the list at once.
export const device = { width: 1440, height: 900, touch: false };

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: "New expense" }).click();
  await drive.settleMotion();

  await page.getByLabel("Amount").fill("120");
  const vendor = page.getByRole("combobox", { name: "Vendor" });
  await vendor.click();
  await drive.type("Printworks");
  await drive.key("Enter");
  await drive.settleData();

  await page.getByRole("button", { name: "Split" }).click();
  const cats = page.getByRole("combobox", { name: "Part category" });
  const amounts = page.getByLabel("Part amount");
  await amounts.nth(0).fill("90");
  await cats.nth(0).click(); await drive.type("Stock"); await drive.key("Enter");
  await cats.nth(1).click(); await drive.type("Shipping"); await drive.key("Enter");
  await amounts.nth(1).fill("20");
  await drive.key("Tab");
  await expect(page.getByText("Remaining to allocate: $10.00")).toBeVisible();

  // saving waits while anything remains
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await drive.settleData();
  await expect(page.getByText("Allocate the remaining $10.00 before saving")).toBeVisible();
  await expect.attr("app", "editorOpen", true);

  await page.getByRole("button", { name: "Add a part" }).click();
  await cats.nth(2).click(); await drive.type("Packaging"); await drive.key("Enter");
  await expect(page.getByText("Fully allocated")).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await drive.settleData();
  await drive.settleMotion();

  await expect.attr("app", "editorOpen", false);
  await expect.request("POST", "/api/transactions", { body: { kind: "expense", amount: 12000 } });
  await page.getByRole("link", { name: "Transactions" }).click();
  await drive.settleData();
  await expect(page.getByRole("option").filter({ hasText: "Printworks" }).first()).toContainText("Split (3)");
};
