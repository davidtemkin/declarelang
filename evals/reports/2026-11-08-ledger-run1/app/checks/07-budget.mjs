// Flow 7: set a $30 monthly budget for Software; Budgets says in words where it stands.
export const device = { width: 1440, height: 900, touch: false };
const API = "http://127.0.0.1:8370";

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("link", { name: "Budgets" }).click();
  await drive.settleData();
  const field = page.getByLabel("Monthly budget for Software");
  if (await field.count() == 0) {
    await page.getByRole("button", { name: "Add a budget" }).click();
    await drive.settleMotion();
    await page.getByText("Software", { exact: true }).click();
    await drive.settleMotion();
    await drive.settleData();
  }
  // a budget already at $30 (an earlier run) is set away first, so this run sets it
  await field.fill("35");
  await drive.key("Enter");
  await drive.settleData();
  await field.fill("30");
  await drive.key("Enter");
  await drive.settleData();
  await expect.request("PUT", /\/api\/budgets\/\d{4}-\d\d\/software/, { body: { amount: 3000 } });
  const today = (await (await fetch(API + "/api/today")).json()).today;
  const b = (await (await fetch(`${API}/api/budgets?month=${today.slice(0, 7)}`)).json()).budgets.find((x) => x.categoryId == "software");
  const fmt = (c) => "$" + (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
  const words = b.spent > b.amount ? "Over by " + fmt(b.spent - b.amount) : null;
  if (words != null) await expect(page.getByText(words, { exact: true })).toBeVisible();
  else await expect(page.getByText(/^(On track|.* over pace)/).first()).toBeVisible();
};
