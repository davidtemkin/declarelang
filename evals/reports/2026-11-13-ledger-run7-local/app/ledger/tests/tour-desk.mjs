// Every screen and layer a person reaches on a desk, at 1280×800: each stop gets the
// layout checks, and a picture to look at.
import { settle } from "./lib.mjs";
const dir = process.env.SHOTS ?? "/tmp/ledger-shots";
export default async ({ drive, expect, page }) => {
  const shot = async (n) => { await settle(drive); await page.screenshot({ path: dir + "/desk-" + n + ".png" }); };
  await shot("01-overview");
  await page.getByRole("button", { name: /^Date range/ }).click(); await shot("02-range");
  await drive.key("Escape");
  await page.getByRole("button", { name: "Amount" }).click(); await shot("03-amount");
  await drive.key("Escape");
  await page.getByRole("button", { name: "Category" }).click(); await shot("04-category");
  await drive.key("Escape");
  await page.getByRole("button", { name: "Contact" }).click(); await shot("05-contact");
  await drive.key("Escape");
  await drive.set("app", "location", "transactions"); await shot("06-transactions");
  await drive.click("app.main.txScreen.body.grid", );
  await drive.key("ArrowDown"); await drive.key("ArrowDown"); await shot("07-detail");
  await drive.key("Escape");
  await drive.set("app", "location", "insights/ive"); await shot("08-ive");
  await drive.set("app", "location", "insights/breakdown"); await shot("09-breakdown");
  await drive.set("app", "location", "insights/products"); await shot("10-products");
  await drive.set("app", "location", "budgets"); await shot("11-budgets");
  await drive.click("app.side.newBtn"); await shot("12-expense");
  await page.getByRole("radio", { name: "Sale" }).click();
  await page.getByRole("button", { name: /^Add Tall mug/ }).click();
  await shot("13-sale");
  await page.getByRole("radio", { name: "Refund" }).click(); await shot("14-refund");
  await drive.key("Escape");
  await drive.set("app", "themeMode", "dark");
  await drive.set("app", "location", "overview"); await shot("15-dark-overview");
  await drive.set("app", "location", "transactions"); await shot("16-dark-transactions");
  await expect.attr("app", "isDark", true);
};
