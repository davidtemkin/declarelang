// Flow 1: Overview shows this month's figures against last month; choosing this month's
// expense bar opens Transactions filtered to exactly those expenses, and the summary's
// total equals the bar's value to the cent.
const API = "http://127.0.0.1:8370";

export const device = { width: 1440, height: 900, touch: false };

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  const today = (await (await fetch(API + "/api/today")).json()).today;
  const month = today.slice(0, 7);
  const p = await (await fetch(`${API}/api/aggregates/periods?from=${month}-01&to=${today}&by=month`)).json();
  const expenses = p.total.expenses.amount;
  const fmt = (c) => "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });

  // the headline figures, with their change against last month
  await expect(page.getByRole("button", { name: /^Expenses, / })).toContainText(fmt(expenses));
  await expect(page.getByRole("button", { name: /^Revenue, .* vs Oct/ })).toBeVisible();

  // this month's period in the income vs expenses chart: its right half is the expense bar
  const slot = page.getByRole("button", { name: /^November 2026 \(so far\), Revenue/ });
  const box = await slot.boundingBox();
  await slot.click({ position: { x: box.width * 0.75, y: box.height / 2 } });
  await drive.settleData();

  await expect.attr("app", "location", "transactions");
  const out = "Out " + fmt(expenses);
  await expect(page.getByText(/transactions · In \$0\.00 · Out/)).toContainText(out);
  await expect(page.getByText(/Showing the records behind Expenses/)).toBeVisible();

  // back returns to the chart as it was
  await page.getByRole("button", { name: "Back to Overview" }).click();
  await drive.settleData();
  await expect.attr("app", "location", "overview");
  await expect(page.getByRole("button", { name: /^Expenses, / })).toContainText(fmt(expenses));
};
