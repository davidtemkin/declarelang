// After Tab has walked the form: where getByLabel("City") is, and what a click on it presses.
export default async ({ drive, expect, page }) => {
  const log = [];
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 13 Nov, 7:30pm/ }).click();
  await drive.settleData();
  await page.getByRole("checkbox", { name: "Orchestra, row A, seat 4", exact: true }).click();
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await drive.settleMotion();
  await page.getByLabel("Email").click();
  for (let i = 0; i < 9; i++) await drive.tab();
  await drive.settleMotion();
  const city = page.getByLabel("City");
  log.push({ count: await city.count(), box: await city.boundingBox(), what: await city.evaluate((e) => e.tagName + "|" + e.getAttribute("aria-label")) });
  log.push({ at433_781: await page.evaluate(() => { const t = document.elementFromPoint(433, 781); return t?.tagName + "|" + (t?.getAttribute("aria-label") ?? t?.textContent?.slice(0, 40)); }) });
  await city.click({ timeout: 2000 });
  log.push({ focused: await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), box: await city.boundingBox() });
  throw new Error("FINDINGS " + JSON.stringify(log));
};
