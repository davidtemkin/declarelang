// Brief §12.2: an expense of $120 from a new vendor, split $90 Stock & materials and
// $20 Shipping & postage. Saving waits with $10.00 remaining; add $10 Packaging; save;
// it appears in the list at once. Runs against a test copy of the service (port 8371).
export default async ({ drive, expect, page }) => {
  const vendor = "Test Vendor " + Date.now().toString(36);
  await drive.set("app.books", "api", "http://127.0.0.1:8371");
  await drive.waitReal(1200);
  await drive.click("app.head.newExpense");
  await drive.settleMotion();
  const f = "app.recordSheet.body.expense";
  await drive.type("120");
  await drive.click(f + ".two.whoCol.vendorBox.entry");
  await drive.type(vendor);
  await drive.key("Escape");
  await drive.tab();
  await drive.click(f + ".catBlock.pick.split");
  await drive.settleMotion();
  // part 1: Stock & materials $90, part 2: Shipping & postage $20
  await page.evaluate(() => {
    const e = window.__declare.find("app.recordSheet.body.expense");
    e.parts.set(["rows"], [
      { key: "p0", categoryId: "stock", amountText: "90" },
      { key: "p1", categoryId: "shipping", amountText: "20" }]);
  });
  await drive.settleMotion();
  await expect.text(f + ".splitBlock", "Remaining to allocate: $10.00");
  await drive.click(f + ".foot.row.save");
  await drive.waitReal(600);
  await expect.attr("app", "recording", "expense");         // saving waited
  await drive.click(f + ".splitBlock.tally.addPart");          // add a part (prefilled with what remains)
  await page.evaluate(() => {
    const e = window.__declare.find("app.recordSheet.body.expense");
    e.parts.set(["rows", 2, "categoryId"], "packaging");
  });
  await drive.settleMotion();
  await expect.text(f + ".splitBlock", "Fully allocated");
  await drive.click(f + ".foot.row.save");
  await drive.waitReal(1500);
  await expect.attr("app", "recording", "");
  await expect.request("POST", "/api/contacts", { body: { name: vendor, type: "vendor" } });
  await expect.request("POST", "/api/transactions", { body: { kind: "expense", amount: 12000 } });
  await drive.set("app", "location", "transactions");
  await drive.waitReal(1200);
  const top = await page.evaluate(() => window.__declare.find("app").rows[0]);
  await expect.equal(top.contactName, vendor);
  await expect.equal(top.split?.parts, 3);
  // and Undo takes it back
  await drive.key("Mod+Z");
  await drive.waitReal(1200);
  const after = await page.evaluate(() => window.__declare.find("app").rows[0]);
  await expect.equal(after.contactName == vendor, false);
};
