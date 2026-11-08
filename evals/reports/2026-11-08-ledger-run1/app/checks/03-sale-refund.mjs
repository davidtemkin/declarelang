// Flow 3: record a sale at the Market — two mugs and a print. Then refund one mug; the
// sale shows what was refunded.
export const device = { width: 1440, height: 900, touch: false };

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: "New sale" }).click();
  await drive.settleMotion();
  await page.getByRole("radio", { name: "Market" }).click();
  await page.getByRole("button", { name: /^Add Speckled mug/ }).click();
  await page.getByRole("button", { name: /^Add Speckled mug/ }).click();
  await page.getByRole("button", { name: /^Add Art print A4/ }).click();
  await expect(page.getByRole("button", { name: /^Add Speckled mug, \$32\.00, 2 in the sale/ })).toBeVisible();
  await page.getByLabel("Description (optional)").fill("Saturday market");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "editorOpen", false);
  await expect.request("POST", "/api/transactions", { body: { kind: "sale", channel: "market" } });

  // open it in the list, then refund one mug from its detail
  await page.getByRole("link", { name: "Transactions" }).click();
  await drive.settleData();
  await page.getByRole("option").filter({ hasText: "Saturday market" }).filter({ hasText: "$88.00" }).first().click();
  await drive.settleData();
  await expect(page.getByText("Cost $23.50 · Margin $64.50 (73%)")).toBeVisible();
  await page.getByRole("button", { name: "Refund…" }).click();
  await drive.settleData();
  await drive.settleMotion();
  const mugs = page.getByRole("spinbutton", { name: "Refund how many Speckled mug" });
  await mugs.focus();
  await drive.key("ArrowUp");
  await expect(page.getByText("$32.00").first()).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "editorOpen", false);
  await expect.request("POST", "/api/transactions", { body: { kind: "refund" } });
  await expect(page.getByText("Refunded $32.00 of $88.00")).toBeVisible();
};
