// Brief §12, on a phone: open Overview, then record an expense with the thumb.
// A touch device the size of a phone held upright; every press is a finger.

export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate(([p, a]) => window.__declare.find(p)[a], [p, a]);
  expect(await read("app", "phone")).toBe(true);
  expect(await read("app", "screen")).toBe("overview");
  await expect.visible("app.main.page.overview.col.figures.revenue");
  await expect.text("app.main.page.overview.col.figures.expenses", "Expenses");
  await drive.reveal("app.main.page.overview.col.flow");
  await expect.visible("app.main.page.overview.col.flow.chart");

  // a tap on a chart shows what the mark is; a second tap on it opens its records
  const chart = "app.main.page.overview.col.flow.chart";
  const geo = await page.evaluate((p) => {
    const c = window.__declare.find(p);
    const i = c.count - 2;
    const bw = Math.max(2, (c.slot * 0.7) / 2);
    return { x: c.padL + c.slot * i + c.slot * 0.15 + bw * 1 + bw / 2, y: c.yOf(c.series[1].points[i].value / 2), v: c.series[1].points[i].value };
  }, chart);
  await drive.clickAt(chart, geo.x, geo.y);
  await drive.settleMotion();
  await expect.visible(chart + ".tip");
  await expect.text(chart + ".tip", "Expenses");
  expect(await read("app", "screen")).toBe("overview");
  await drive.clickAt(chart, geo.x, geo.y);
  await drive.settleData();
  expect(await read("app", "screen")).toBe("transactions");
  expect((await read("app", "summary")).out).toBe(geo.v);
  await drive.click("app.main.chipRow.backBtn");
  await drive.settleData();

  // record an expense: the + at the foot, in reach of a thumb
  const before = (await read("app.main.page.overview.col.figures.expenses", "value"));
  await drive.click("app.main.phoneBar.expense");
  await drive.settleMotion();
  const sheet = page.getByRole("dialog", { name: "Record a transaction" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("textbox", { name: "Amount" }).tap();
  await drive.type("18.75");
  await sheet.getByRole("combobox", { name: "Vendor" }).tap();
  await drive.type("USPS");
  await drive.settleMotion();
  await page.getByRole("option", { name: "USPS" }).tap();
  await drive.settleMotion();
  // choosing a vendor fills in its usual category
  await expect(sheet.getByRole("combobox", { name: "Category" })).toHaveValue("Shipping & postage");
  await sheet.getByRole("textbox", { name: "Date" }).fill("yesterday");
  await expect(sheet).toContainText("Fri 13 Nov 2026");
  await sheet.getByRole("button", { name: "Save", exact: true }).tap();
  await drive.settleData();
  await drive.settleMotion();
  await expect(sheet).toBeHidden();
  await expect.request("POST", "/api/transactions", { body: { kind: "expense", amount: 1875, date: "2026-11-13", categoryId: "shipping" } });
  await drive.settleData();
  // the figures follow at once
  expect(await read("app.main.page.overview.col.figures.expenses", "value")).toBe(before + 1875);
  await expect(page.getByText("Saved expense · $18.75")).toBeVisible();
};
