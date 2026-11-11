// Brief §12.3: a sale at the Market, two mugs and a print; then refund one mug, and the
// sale shows what was refunded. §12.7: a $30 monthly budget for Software says where it stands.
export default async ({ drive, expect, page }) => {
  await drive.set("app.books", "api", "http://127.0.0.1:8371");
  await drive.set("app", "location", "transactions");
  await drive.waitReal(1500);
  await drive.click("app.head.newSale");
  await drive.settleMotion();
  const f = "app.recordSheet.body.sale";
  await drive.click(f + '."Market"');
  await drive.click(f + '.palette."Speckled mug"');
  await drive.click(f + '.palette."Speckled mug"');
  await drive.click(f + '.palette."Art print A4"');
  await drive.settleMotion();
  await expect.text(f + ".foot", "Total $88.00");
  await drive.click(f + ".foot.row.save");
  await drive.waitReal(1500);
  await expect.request("POST", "/api/transactions", { body: { kind: "sale", channel: "market",
    lines: [{ productId: "speckled-mug", quantity: 2 }, { productId: "print-a4", quantity: 1 }] } });
  await expect.attr("app", "recording", "");
  const sale = await page.evaluate(() => window.__declare.find("app").openId);
  await expect.visible("app.main.transactions.desk.side");
  await expect.text("app.main.transactions.desk.side", "Margin");
  // refund one mug from the detail
  await drive.click('app.main.transactions.desk.side.body.actions."Refund…"');
  await drive.settleMotion();
  await drive.waitReal(800);
  const r = "app.recordSheet.body.refund";
  await expect.text(r + ".chosen", "2 sold at $32.00");
  await page.evaluate(() => {
    const rf = window.__declare.find("app.recordSheet.body.refund");
    rf.setQty(rf.tx.lines[0].id, 1);
  });
  await drive.settleMotion();
  await expect.text(r + ".foot", "Refund $32.00");
  await drive.click(r + ".foot.row.save");
  await drive.waitReal(1500);
  await expect.request("POST", "/api/transactions", { body: { kind: "refund", refundOf: sale } });
  await page.evaluate((id) => window.__declare.find("app").openTransaction(id), sale);
  await drive.waitReal(1200);
  await expect.text("app.main.transactions.desk.side", "REFUNDED $32.00");
  await expect.text("app.main.transactions.desk.side", "1 refunded");

  // a $30 budget for Software
  await drive.set("app", "location", "budgets");
  await drive.waitReal(1500);
  const rows = await page.evaluate(() => window.__declare.find("app.main.budgets").rows.value.rows.map((r) => r.id));
  const i = rows.indexOf("software");
  const field = "app.main.budgets.list.form." + i + ".top.amount";
  await drive.selectAll(field);
  await drive.type("30");
  await drive.key("Enter");
  await drive.waitReal(1500);
  await expect.request("PUT", "/api/budgets/2026-11/software", { body: { amount: 3000 } });
  const now = await page.evaluate(() => window.__declare.find("app.main.budgets").rows.value.rows.map((r) => r.id).indexOf("software"));
  await expect.text("app.main.budgets.list.form." + now, "Over by");
};
