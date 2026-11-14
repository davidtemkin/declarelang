// Done 2: record $120 from "Printworks" (a new vendor), split $90 Stock & materials
// and $20 Shipping & postage: saving waits, showing $10.00 remaining; add $10
// Packaging; save. It appears in the list at once.
import { read, settle } from "./lib.mjs";

export default async ({ drive, expect, page }) => {
  await drive.click("app.side.newBtn");
  await settle(drive);
  const sheet = page.getByRole("dialog", { name: "Record a transaction" });
  await sheet.getByLabel("Amount", { exact: true }).fill("120");
  const vendor = sheet.getByRole("combobox", { name: "Vendor" });
  await vendor.fill("Printworks");
  await vendor.press("Enter");
  await settle(drive);
  const vid = await read(page, "app.recSheet.form", "vendorId");
  if (!vid) throw new Error("no vendor chosen or created");
  console.log("vendor id " + vid);
  await sheet.getByRole("button", { name: "Split" }).click();
  await settle(drive);
  await sheet.getByLabel("Part 1 amount").fill("90");
  const c1 = sheet.getByRole("combobox", { name: "Part 1 category" });
  await c1.fill("Stock");
  await c1.press("Enter");
  const c2 = sheet.getByRole("combobox", { name: "Part 2 category" });
  await c2.fill("Shipping");
  await c2.press("Enter");
  await sheet.getByLabel("Part 2 amount").fill("20");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await settle(drive);
  // saving waits, and says what remains
  await expect.attr("app", "recording", true);
  await expect(sheet.getByText("Remaining to allocate: $10.00").first()).toBeVisible();
  await sheet.getByRole("button", { name: "Add a part" }).click();
  await settle(drive);
  expect.equal(await sheet.getByLabel("Part 3 amount").inputValue(), "10.00");
  const c3 = sheet.getByRole("combobox", { name: "Part 3 category" });
  await c3.fill("Packaging");
  await c3.press("Enter");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await settle(drive);
  await expect.attr("app", "recording", false);
  await drive.set("app", "location", "transactions");
  await settle(drive);
  const rows = await read(page, "app", "listRows");
  const mine = rows.find((r) => r.contactName == "Printworks" && r.amount == 12000 && r.split && r.split.parts == 3);
  if (!mine) throw new Error("the split expense is not in the list");
  const sel = await read(page, "app", "selRows");
  console.log("saved " + mine.id + ", selected " + sel.map((r) => r.id).join(","));
  await expect.text("app.main.txScreen.body.detailPane", "Split across 3 categories");
};
