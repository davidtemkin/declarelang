// Flow 5: clear the filters; filter to Uncategorised; select all; categorise as Other;
// undo with ⌘Z.
export const device = { width: 1440, height: 900, touch: false };
const API = "http://127.0.0.1:8370";

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  const today = (await (await fetch(API + "/api/today")).json()).today;
  const m = today.slice(0, 7);
  const before = await (await fetch(`${API}/api/summary?category=none&from=${m}-01&to=${today}`)).json();
  if (before.count == 0) throw new Error("nothing uncategorised this month to try this on");

  await page.getByRole("link", { name: "Transactions" }).click();
  await page.getByRole("button", { name: "Category", exact: true }).click();
  await drive.settleMotion();
  await page.getByRole("checkbox", { name: "Uncategorised" }).click();
  await drive.key("Escape");
  await drive.settleMotion();
  await drive.settleData();
  await expect(page.getByRole("option")).toHaveCount(before.count);

  await page.getByText(/^Select all/).click();
  await expect(page.getByText(/transactions matching the filters are selected/)).toBeVisible();
  await page.getByRole("button", { name: "Categorise", exact: true }).click();
  await drive.settleMotion();
  await page.getByText("Other", { exact: true }).click();
  await drive.settleMotion();
  await drive.settleData();
  await expect.request("POST", "/api/transactions/bulk", { body: { action: "categorise", categoryId: "other" } });
  await expect(page.getByText(/^Categorised \d+ transactions?/)).toBeVisible();
  await expect(page.getByText("No transactions match")).toBeVisible();

  await drive.key("Meta+Z");
  await drive.settleData();
  await expect.request("POST", /\/api\/changes\/ch\d+\/undo/);
  await expect(page.getByRole("option")).toHaveCount(before.count);
  const after = await (await fetch(`${API}/api/summary?category=none&from=${m}-01&to=${today}`)).json();
  if (after.count != before.count || after.out != before.out) throw new Error("undo did not put the records back: " + JSON.stringify(after));
};
