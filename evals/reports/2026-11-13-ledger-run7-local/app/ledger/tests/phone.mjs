// On a phone: open Overview, then record an expense with the thumb.
import { read, settle } from "./lib.mjs";
export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect, page }) => {
  await expect.attr("app", "screen", "overview");
  await expect.text("app.main.page.col.overview.figures", "Revenue");
  await drive.reveal("app.main.page.col.overview.recent");
  await settle(drive);
  // the record button sits in the thumb's reach, at the foot
  await drive.click("app.main.tabBar.add");
  await settle(drive);
  await expect.attr("app", "recording", true);
  const sheet = page.getByRole("dialog", { name: "Record a transaction" });
  await sheet.getByLabel("Amount", { exact: true }).fill("14.50");
  const vendor = sheet.getByRole("combobox", { name: "Vendor" });
  await vendor.fill("Adobe");
  await vendor.press("Enter");
  await settle(drive);
  await expect.attr("app", "recording", true);
  // the vendor's usual category fills itself in
  expect.equal(await page.evaluate(() => window.__declare.find("app").recForm.catId), "software");
  await sheet.getByRole("button", { name: "Save", exact: true }).tap();
  await settle(drive);
  await expect.attr("app", "recording", false);
  const sent = (await drive.requests()).filter((r) => r.method == "POST" && r.path == "/api/transactions").pop();
  console.log("sent " + JSON.stringify(sent.body) + " → " + sent.status);
  expect.equal(sent.body.amount, 1450);
  expect.equal(sent.body.categoryId, "software");
  await expect(page.getByText(/^Saved expense \$14\.50/).first()).toBeVisible();

  // and the list, grouped by day, shows it
  await drive.click("app.main.tabBar.4");
  await settle(drive);
  await expect.attr("app", "screen", "transactions");
  await expect.text("app.main.txScreen.body.phoneList", "Today");
};
