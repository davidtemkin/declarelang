// Every screen and sheet a person reaches on a phone (390×844, touch): each stop gets
// the layout checks — a finger's 44-point targets among them — and a picture.
import { settle } from "./lib.mjs";
export const device = { width: 390, height: 844, touch: true };
const dir = process.env.SHOTS ?? "/tmp/ledger-shots";
export default async ({ drive, expect, page }) => {
  const shot = async (n) => { await settle(drive); await page.screenshot({ path: dir + "/phone-" + n + ".png" }); };
  await shot("01-overview");
  await drive.reveal("app.main.page.col.overview.grid"); await shot("02-overview-lower");
  await drive.reveal("app.main.page.col.overview.recent"); await shot("03-overview-recent");
  await drive.click("app.main.bar.tools.filtersBtn"); await shot("04-filters");
  await drive.set("app", "filtersOpen", false);
  await settle(drive);
  await drive.click("app.main.bar.tools.1.range"); await shot("05-range");
  await drive.key("Escape");
  await settle(drive);
  await drive.click("app.main.tabBar.4"); await shot("06-transactions");
  await page.getByRole("button", { name: /^Adobe/ }).first().tap(); await shot("07-detail");
  await drive.set("app", "phoneDetail", false);
  await drive.set("app", "peekId", "");
  await settle(drive);
  await drive.click("app.main.tabBar.add"); await shot("08-expense");
  await page.getByLabel("Amount", { exact: true }).fill("50");
  await page.getByRole("button", { name: "Split" }).tap(); await shot("09-split");
  await page.getByRole("radio", { name: "Sale" }).tap();
  await page.getByRole("button", { name: /^Add Speckled mug/ }).tap(); await shot("10-sale");
  await drive.set("app", "recording", false);
  await drive.set("app", "themeMode", "dark"); await drive.set("app", "location", "overview"); await shot("11-dark");
  await expect.attr("app", "screen", "overview");
};
