// Flow 4: filter to this year, search "adobe", and move the amount slider to $20–$100 with
// the keyboard alone. The chips read as set; the summary's count and total match the rows;
// Insights → Breakdown shows only those, with the same total; Overview says it is filtered.
export const device = { width: 1440, height: 900, touch: false };
const API = "http://127.0.0.1:8370";

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  const today = (await (await fetch(API + "/api/today")).json()).today;
  const year = today.slice(0, 4);
  const truth = await (await fetch(`${API}/api/summary?from=${year}-01-01&to=${year}-12-31&q=adobe&min=2000&max=10000`)).json();
  const fmt = (c) => "$" + (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });

  // the date range: open its menu, choose This year
  await page.getByRole("button", { name: /^Date range/ }).click();
  await drive.settleMotion();
  await page.getByText("This year", { exact: true }).click();
  await drive.settleMotion();
  await drive.settleData();
  await expect(page.getByRole("button", { name: /^Date range, This year/ })).toBeVisible();

  // search: "/" goes to the field
  await page.locator("body").focus();
  await drive.key("/");
  await drive.type("adobe");
  await drive.wait(400);
  await drive.settleData();

  // the amount: open the panel from the keyboard, then the handles
  await page.getByRole("button", { name: "Amount" }).focus();
  await drive.key("Enter");
  await drive.settleMotion();
  const lo = page.getByRole("slider", { name: "Minimum amount" });
  const hi = page.getByRole("slider", { name: "Maximum amount" });
  await lo.focus();
  for (let i = 0; i < 3; i++) await drive.key("PageUp");          // $5, $10, $20
  await expect(lo).toHaveAttribute("aria-valuetext", "$20.00");
  await hi.focus();
  for (let i = 0; i < 10; i++) await drive.key("PageDown");       // $3,000 … $100
  await expect(hi).toHaveAttribute("aria-valuetext", "$100.00");
  await drive.key("Escape");
  await drive.wait(300);
  await drive.settleData();

  // the chips read as set, and the summary is the service's own figure for this filter
  await expect(page.getByRole("button", { name: "Remove filter “adobe”" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove filter Amount $20.00 – $100.00" })).toBeVisible();
  await page.getByRole("link", { name: "Transactions" }).click();
  await drive.settleData();
  const n = truth.count;
  await expect(page.getByText(new RegExp("^" + n + " transactions? · In"))).toContainText("Out " + fmt(truth.out));
  await expect(page.getByRole("option")).toHaveCount(n);

  // Insights → Breakdown: the same records, the same total
  await page.getByRole("link", { name: "Insights" }).click();
  await page.getByRole("tab", { name: "Breakdown" }).click();
  await drive.settleData();
  await expect.text("app.main.screens.insights.0.breakdown.total", fmt(truth.out));

  // Overview says the figures are filtered
  await page.getByRole("link", { name: "Overview" }).click();
  await drive.settleData();
  await expect(page.getByText("Filtered:")).toBeVisible();
};
