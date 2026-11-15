// Brief §12, desk 7: set a $30 monthly budget for Software; Budgets says in words
// where it stands. (A live service remembers: on a later run Software already has
// a budget, and its amount is edited in place instead.)

export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate(([p, a]) => window.__declare.find(p)[a], [p, a]);
  await drive.click("app.side.Budgets");
  await drive.settleData();
  const had = (await read("app.budgetSrc", "value")).budgets.some((b) => b.categoryId == "software");

  if (!had) {
    const pick = page.getByRole("combobox", { name: "Category to budget" });
    await pick.click();
    await drive.type("Softw");
    await drive.key("Enter");
    await page.getByRole("textbox", { name: "Monthly amount" }).fill("30");
    await page.getByRole("button", { name: "Add", exact: true }).click();
  } else {
    const field = page.getByRole("textbox", { name: "Monthly budget for Software" });
    await field.click();
    await field.fill("35");
    await drive.key("Enter");                              // saves, and moves down the list
    await drive.settleData();
    await field.click();
    await field.fill("30");
    await drive.key("Enter");
  }
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("PUT", "/api/budgets/2026-11/software", { body: { amount: 3000 } });

  const b = (await read("app.budgetSrc", "value")).budgets.find((x) => x.categoryId == "software");
  expect(b.amount).toBe(3000);
  const words = b.spent > b.amount ? "Over by $" + ((b.spent - b.amount) / 100).toFixed(2) : null;
  const group = page.getByRole("group", { name: /^Software: / });
  await expect(group).toBeVisible();
  if (words != null) await expect(group).toContainText(words);
  await expect(page.getByRole("textbox", { name: "Monthly budget for Software" })).toHaveValue("30.00");
  await expect(page.getByText("Software budget set to $30.00 a month")).toBeVisible();

  // amounts are edited in place, moving down the list by keyboard: Enter goes to the next one
  const fields = page.getByRole("textbox", { name: /^Monthly budget for / });
  const names = await fields.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(names.length).toBeGreaterThan(1);
  await fields.first().click();
  await drive.key("Enter");
  await drive.settleMotion();
  const now = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
  expect(now).toBe(names[1]);
};
