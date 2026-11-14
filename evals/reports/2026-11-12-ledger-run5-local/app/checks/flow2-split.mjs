// Record $120 from a new vendor, split $90 stock + $20 shipping: saving
// waits with $10.00 remaining; add $10 packaging; save; it is in the list.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.set("app", "location", "transactions");
  await drive.settleData();
  await page.getByRole("button", { name: "New expense" }).first().click();
  await drive.settleMotion();
  await drive.type("120");
  await drive.key("Tab");                       // to the date: Today
  await page.getByRole("combobox", { name: "Vendor" }).click();
  await drive.type("Printworks");
  await drive.key("Enter");
  await drive.settleData();
  await expect.attr("app.editor", "shown", true);
  await page.getByRole("button", { name: "Split across categories…" }).click();
  await drive.settleMotion();
  await page.getByRole("combobox", { name: "Part 1 category" }).click();
  await drive.type("Stock");
  await drive.key("Enter");
  await page.getByRole("textbox", { name: "Part 1 amount" }).click();
  await drive.type("90");
  await page.getByRole("combobox", { name: "Part 2 category" }).click();
  await drive.type("Shipping");
  await drive.key("Enter");
  await page.getByRole("textbox", { name: "Part 2 amount" }).click();
  await drive.type("20");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await drive.settleData();
  await expect.attr("app.editor", "shown", true);
  await expect.text("app.editor", "Remaining to allocate: $10.00");
  await page.getByRole("button", { name: "Add a part" }).click();
  await drive.settleMotion();
  await page.getByRole("combobox", { name: "Part 3 category" }).click();
  await drive.type("Packaging");
  await drive.key("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "editorOpen", false);
  await expect.request("POST", "/api/transactions", { body: { kind: "expense", amount: 12000 } });
  const top = await drive.page.evaluate(() => window.__declare.find("app").rows.find((r) => r.contactName == "Printworks"));
  await expect.equal(top?.split?.parts, 3);
  await expect.equal(top?.amount, 12000);
};
