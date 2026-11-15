// Brief §12, desk 3: record a sale at the Market: two mugs and a print. Then
// refund one mug; the sale shows what was refunded.

export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate(([p, a]) => window.__declare.find(p)[a], [p, a]);
  await drive.click("app.side.Transactions");
  await drive.settleData();

  await drive.click("app.side.\"New sale\"");
  await drive.settleMotion();
  const sheet = page.getByRole("dialog", { name: "Record a transaction" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("radio", { name: "Market" }).click();
  // a product pressed again adds one more
  await sheet.getByRole("button", { name: "Add Speckled mug, $32.00" }).click();
  await sheet.getByRole("button", { name: "Add Speckled mug, $32.00" }).click();
  await sheet.getByRole("button", { name: "Add Art print A4, $24.00" }).click();
  await drive.settleMotion();
  await expect(sheet.getByRole("textbox", { name: "Quantity" }).first()).toHaveValue("2");
  await expect(sheet).toContainText("$88.00");                 // the total, always visible
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(sheet).toBeHidden();
  await expect.request("POST", "/api/transactions", { body: { kind: "sale", channel: "market" } });
  await drive.settleData();

  // the new sale is open beside the list
  const saleId = await read("app", "openId");
  const sale = (await read("app", "rows")).find((r) => r.id == saleId);
  expect(sale.kind).toBe("sale");
  expect(sale.amount).toBe(8800);
  expect(sale.channel).toBe("market");
  const pane = "app.main.page.transactions.body.pane";
  await expect.text(pane, "2 × Speckled mug");
  await expect.text(pane, "1 × Art print A4");
  await expect.text(pane, "Margin");

  // refund one mug, starting from the sale
  await page.getByRole("button", { name: "Refund…" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("radio", { name: "Refund" })).toBeChecked();
  await expect(sheet).toContainText("2 left to refund");
  await sheet.getByRole("textbox", { name: "How many Speckled mug to refund" }).fill("1");
  await expect(sheet).toContainText("−$32.00");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(sheet).toBeHidden();
  await expect.request("POST", "/api/transactions", { body: { kind: "refund", refundOf: saleId } });
  await drive.settleData();

  // the refund opens, linked to its sale; following the link shows the sale and what was refunded
  await expect.text(pane, "REFUND OF");
  await page.getByRole("button", { name: /^Open Sale/ }).click();
  await drive.settleData();
  expect(await read("app", "openId")).toBe(saleId);
  await expect.text(pane, "REFUNDED $32.00");
  await expect.text(pane, "$56.00 LEFT");
  await expect.text(pane, "refunded 1 · $32.00");

  // refunding more than is left is refused where it was asked, and nothing typed is lost
  await page.getByRole("button", { name: "Refund…" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await sheet.getByRole("textbox", { name: "How many Speckled mug to refund" }).fill("3");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await drive.settleData();
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Only 1 left to refund.");
  await expect(sheet.getByRole("textbox", { name: "How many Speckled mug to refund" })).toHaveValue("3");

  // The service's own refusal: the last mug is refunded elsewhere while the editor
  // still thinks one is left. Saving is refused, the message lands on that line's
  // field, and what was typed stays.
  await sheet.getByRole("textbox", { name: "How many Speckled mug to refund" }).fill("1");
  const lineId = await page.evaluate(async (id) => {
    const d = await (await fetch("http://127.0.0.1:8370/api/transactions/" + id)).json();
    const l = d.lines.find((x) => x.productId == "speckled-mug");
    await fetch("http://127.0.0.1:8370/api/transactions", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "refund", date: d.date, refundOf: id, lines: [{ saleLineId: l.id, quantity: 1 }] }) });
    return l.id;
  }, saleId);
  expect(lineId).toContain(saleId);
  await sheet.getByRole("textbox", { name: "Description (optional)" }).fill("Chipped in transit");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Refund exceeds the original sale");
  await expect(sheet.getByRole("textbox", { name: "How many Speckled mug to refund" })).toHaveValue("1");
  await expect(sheet.getByRole("textbox", { name: "Description (optional)" })).toHaveValue("Chipped in transit");
  await drive.key("Escape");
  await drive.settleMotion();
};
