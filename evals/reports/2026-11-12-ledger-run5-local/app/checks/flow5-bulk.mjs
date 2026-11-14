// Clear the filters; filter to Uncategorised; select all; categorise as
// Other; undo with ⌘Z.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.set("app", "location", "transactions");
  await drive.set("app", "fQ", "something");
  await drive.settleData();
  await page.getByRole("button", { name: "Clear all" }).click();
  await drive.settleData();
  await expect.attr("app", "fQ", "");
  await expect.attr("app", "fPreset", "this-month");
  await drive.click("app.shell.main.bar.filters.controls.catBtn");
  await drive.settleData();
  await drive.settleMotion();
  await page.getByRole("checkbox", { name: "Uncategorised" }).click();
  await drive.key("Escape");
  await drive.settleData();
  await expect.attr("app", "fCats", ["none"]);
  const n = await drive.page.evaluate(() => window.__declare.find("app").rows.length);
  await expect.equal(n > 0, true);
  await page.getByRole("button", { name: /^Select all/ }).click();
  await expect.attr("app", "allMatching", true);
  await expect.text("app.shell.main.pages.transactions.sumRow", "All " + n + " transaction");
  await page.getByRole("button", { name: "Categorise…" }).click();
  await drive.settleMotion();
  await drive.type("Other");
  await drive.key("Enter");
  await drive.settleData();
  await expect.request("POST", "/api/transactions/bulk", { body: { action: "categorise", categoryId: "other" } });
  await expect.attr("app", "rows", []);
  await expect.text("app.toast", "Categorised " + n);
  await drive.key("Mod+Z");
  await drive.settleData();
  await expect.request("POST", /\/api\/changes\/.*\/undo/);
  const back = await drive.page.evaluate(() => window.__declare.find("app").rows.length);
  await expect.equal(back, n);
};
