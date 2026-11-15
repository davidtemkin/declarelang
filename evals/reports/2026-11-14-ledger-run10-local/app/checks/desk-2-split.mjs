// Brief §12, desk 2: record an expense of $120 from "Printworks" (a new vendor),
// split $90 Stock & materials and $20 Shipping & postage: saving waits, showing
// $10.00 remaining; add $10 Packaging; save. It appears in the list at once.
//
// (A live service remembers: after the first run Printworks exists, and picking
// it is the path taken. Either way the vendor ends up on the expense.)

export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate(([p, a]) => window.__declare.find(p)[a], [p, a]);
  await drive.click("app.side.Transactions");
  await drive.settleData();
  const before = await read("app", "total");

  await drive.key("n");                                    // the key for a new expense
  await drive.settleMotion();
  const sheet = page.getByRole("dialog", { name: "Record a transaction" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("textbox", { name: "Amount" })).toBeFocused();
  await drive.type("120");

  // the vendor: typed, and made on the spot when new
  const vendor = sheet.getByRole("combobox", { name: "Vendor" });
  await vendor.click();
  await drive.type("Printworks");
  await drive.settleData();
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect(vendor).toHaveValue("Printworks");

  // split: two parts that leave $10.00 to allocate
  await sheet.getByRole("button", { name: "Split across categories" }).click();
  await drive.settleMotion();
  const cat1 = sheet.getByRole("combobox", { name: "Category of part 1" });
  await cat1.click();
  await drive.type("Stock");
  await drive.key("Enter");
  const amt1 = sheet.getByRole("textbox", { name: "Amount of part 1" });
  await amt1.fill("90");
  const cat2 = sheet.getByRole("combobox", { name: "Category of part 2" });
  await cat2.click();
  await drive.type("Shipping");
  await drive.key("Enter");
  await sheet.getByRole("textbox", { name: "Amount of part 2" }).fill("20");
  await drive.settleMotion();
  await expect(sheet).toContainText("Remaining to allocate: $10.00");

  // saving waits
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await drive.settleData();
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Remaining to allocate: $10.00");

  // a third part: Packaging, $10
  await sheet.getByRole("button", { name: "Add part" }).click();
  await drive.settleMotion();
  const cat3 = sheet.getByRole("combobox", { name: "Category of part 3" });
  await cat3.click();
  await drive.type("Packag");
  await drive.key("Enter");
  await expect(sheet.getByRole("textbox", { name: "Amount of part 3" })).toHaveValue("10.00");
  await expect(sheet).toContainText("All allocated");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await drive.settleData();
  await drive.settleMotion();

  // saved: the sheet has gone, the service holds it, and the list shows it at once
  await expect(sheet).toBeHidden();
  await expect.request("POST", "/api/transactions", { body: { kind: "expense", amount: 12000 } });
  await drive.settleData();
  expect(await read("app", "total")).toBe(before + 1);
  const rows = await read("app", "rows");
  const mine = rows.find((r) => r.contactName == "Printworks" && r.amount == 12000 && r.split != null);
  expect(mine != null).toBe(true);
  expect(mine.split.parts).toBe(3);
  await expect.text("app.main.page.transactions.body.list.grid", "Printworks");
  await expect.text("app.main.page.transactions.body.list.grid", "Split (3)");
  // it is open beside the list
  expect(await read("app", "openId")).toBe(mine.id);
  await expect.text("app.main.page.transactions.body.pane", "SPLIT");
};
