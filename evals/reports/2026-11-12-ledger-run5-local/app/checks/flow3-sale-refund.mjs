// A sale at the Market: two mugs and a print. Then refund one mug; the sale
// shows what was refunded.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.set("app", "location", "transactions");
  await drive.settleData();
  await page.getByRole("button", { name: "New sale" }).first().click();
  await drive.settleMotion();
  await page.getByRole("radio", { name: "Market" }).click();
  await page.getByRole("button", { name: /^Add Speckled mug/ }).click();
  await page.getByRole("button", { name: /^Add Speckled mug/ }).click();
  await page.getByRole("button", { name: /^Add Art print A4/ }).click();
  await expect.text("app.editor", "$88.00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "editorOpen", false);
  await expect.request("POST", "/api/transactions", { body: { kind: "sale", channel: "market" } });
  const sale = await drive.page.evaluate(() => window.__declare.find("app").rows.find((r) => r.kind == "sale" && r.channel == "market" && r.amount == 8800 && r.refunded == 0));
  await expect.equal(!!sale, true);
  // open it, and refund one mug
  await drive.page.evaluate((id) => { const a = window.__declare.find("app"); a.openTxn(a.rows.find((r) => r.id == id)) }, sale.id);
  await drive.settleData();
  await page.getByRole("button", { name: "Refund…" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await page.getByRole("textbox", { name: "Quantity of Speckled mug to refund" }).click();
  await drive.type("1");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "editorOpen", false);
  await expect.request("POST", "/api/transactions", { body: { kind: "refund", refundOf: sale.id } });
  // the sale, opened again, says what was refunded
  await drive.page.evaluate((id) => { const a = window.__declare.find("app"); a.openTxn(a.rows.find((r) => r.id == id)) }, sale.id);
  await drive.settleData();
  await expect.text("app.shell.main.pages.transactions.body.detail", "REFUNDED $32.00");
  await expect.text("app.shell.main.pages.transactions.body.detail", "1 refunded");
};
