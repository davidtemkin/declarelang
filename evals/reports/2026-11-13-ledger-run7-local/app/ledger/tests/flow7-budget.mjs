// Done 7: set a $30 monthly budget for Software; Budgets says in words where it stands.
import { read, settle } from "./lib.mjs";

export default async ({ drive, expect, page }) => {
  await drive.set("app", "location", "budgets");
  await settle(drive);
  const has = (await read(page, "app", "budgetRows")).some((b) => b.id == "software");
  if (!has) {
    const cat = page.getByRole("combobox", { name: "Add a budget" });
    await cat.fill("Software");
    await cat.press("Enter");
    await page.getByLabel("Monthly amount").fill("30");
    await page.getByRole("button", { name: "Add budget" }).click();
  } else {
    const f = page.getByLabel("Software monthly budget, in dollars");
    await f.fill("30");
    await f.press("Enter");
  }
  await settle(drive);
  const rows = await read(page, "app", "budgetRows");
  const sw = rows.find((b) => b.id == "software");
  if (!sw) throw new Error("no Software budget");
  console.log("Software: budget " + sw.amount + ", spent " + sw.spent + " — " + sw.state);
  expect.equal(sw.amount, 3000);
  if (!/^(On track|.+ over pace|Over by .+)$/.test(sw.state)) throw new Error("state words: " + sw.state);
  await expect(page.getByText(sw.state, { exact: true }).first()).toBeVisible();
};
