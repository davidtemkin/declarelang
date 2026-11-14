// What getByLabel("City") is, where it is, and where a locator click presses.
export default async ({ drive, expect, page }) => {
  const log = [];
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 13 Nov, 7:30pm/ }).click();
  await drive.settleData();
  await page.getByRole("checkbox", { name: "Orchestra, row A, seat 4", exact: true }).click();
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await drive.settleMotion();
  const city = page.getByLabel("City");
  log.push({ count: await city.count(), box: await city.boundingBox(), tag: await city.evaluate((e) => e.tagName + " " + (e.getAttribute("aria-label") ?? "") + " " + e.className) });
  log.push({ postalBox: await page.getByLabel("Postal code").boundingBox() });
  await city.click({ timeout: 2000 });
  log.push({ afterClickFocused: await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName), box: await city.boundingBox() });
  throw new Error("FINDINGS " + JSON.stringify(log));
};
