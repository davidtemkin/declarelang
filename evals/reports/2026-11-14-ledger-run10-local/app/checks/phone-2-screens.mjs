// On a phone, every screen reached from Overview and recording: Transactions grouped
// by day, a transaction's detail, the filters (a sheet), search, the date menu, a
// sale recorded with the thumb. The layout checks run wherever this settles.

export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate(([p, a]) => window.__declare.find(p)[a], [p, a]);

  // Transactions, grouped by day: a heading, then rows with description, contact, amount and category
  await drive.click("app.main.phoneBar.1");
  await drive.settleData();
  await drive.settleMotion();
  expect(await read("app", "screen")).toBe("transactions");
  const list = "app.main.page.transactions.body.list.phoneList";
  const first = (await read("app.dayData", "value")).rows[0];
  expect(first.head).toBe(true);
  await expect.text(list, first.label);
  await expect.text("app.main.page.transactions.top.summary", "transactions · In $");

  // a row opens its detail as a sheet
  await page.getByRole("option").nth(1).tap();
  await drive.settleData();
  await drive.settleMotion();
  const detail = page.getByRole("dialog", { name: "Transaction" });
  await expect(detail).toBeVisible();
  const open = await read("app", "openId");
  expect(open).not.toBe("");
  await drive.key("Escape");
  await drive.settleMotion();
  await expect(detail).toBeHidden();

  // the filters, as a sheet: Expenses only
  await page.getByRole("button", { name: "Filters" }).tap();
  await drive.settleMotion();
  const filters = page.getByRole("dialog", { name: "Filters" });
  await expect(filters).toBeVisible();
  await filters.getByRole("button", { name: "Expenses", exact: true }).tap();
  await drive.settleData();
  await drive.key("Escape");
  await drive.settleMotion();
  expect((await read("app", "f")).kinds).toEqual(["expense"]);
  await expect.text("app.main.chipRow", "Expenses");
  expect((await read("app", "rows")).every((r) => r.kind == "expense")).toBe(true);

  // search
  await page.getByRole("button", { name: "Search" }).tap();
  await drive.settleMotion();
  await drive.type("postage");
  await drive.wait(400);
  await drive.settleData();
  expect((await read("app", "rows")).length).toBeGreaterThan(0);
  await expect.text("app.main.chipRow", "“postage”");

  // the date menu: last month
  await page.getByRole("button", { name: /^Date range/ }).tap();
  await drive.settleMotion();
  await page.getByRole("menuitemradio", { name: "Last month" }).tap();
  await drive.settleData();
  await drive.settleMotion();
  expect(await read("app", "rangeText")).toBe("Oct 2026");

  // clear them all, from the chip row
  await page.getByRole("button", { name: "Clear all filters" }).tap();
  await drive.settleData();
  expect(await read("app", "narrowed")).toBe(false);

  // a sale, with the thumb
  await drive.click("app.main.phoneBar.sale");
  await drive.settleMotion();
  const sheet = page.getByRole("dialog", { name: "Record a transaction" });
  await expect(sheet.getByRole("radio", { name: "Sale", exact: true })).toBeChecked();
  await sheet.getByRole("radio", { name: "Market" }).tap();
  await sheet.getByRole("button", { name: "Add Greeting card, $5.00" }).tap();
  await sheet.getByRole("button", { name: "Add Greeting card, $5.00" }).tap();
  await sheet.getByRole("button", { name: "Add Greeting card, $5.00" }).tap();
  await drive.settleMotion();
  await expect(sheet).toContainText("$15.00");
  await sheet.getByRole("button", { name: "Save", exact: true }).tap();
  await drive.settleData();
  await drive.settleMotion();
  await expect(sheet).toBeHidden();
  await expect.request("POST", "/api/transactions", { body: { kind: "sale", channel: "market" } });
};
