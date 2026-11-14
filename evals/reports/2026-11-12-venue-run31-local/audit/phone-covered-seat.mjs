// The phone hall: a seat the summary bar covers. The locator refuses it (as in
// the run, #76); the driver's own press scrolls it clear by a swipe, as a person would.
export const device = { width: 390, height: 844, touch: true };
export default async ({ drive, expect, page }) => {
  const log = [];
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 13 Nov, 7:30pm/ }).click();
  await drive.settleData();
  await page.getByRole("checkbox", { name: "Orchestra, row A, seat 4", exact: true }).click();   // the bar appears
  await drive.settleMotion();
  let refused = null;
  try { await page.getByRole("checkbox", { name: "Orchestra, row A, seat 5", exact: true }).click(); } catch (e) { refused = String(e.message).slice(0, 220); }
  log.push({ locatorClick: refused ?? "pressed" });
  await drive.click('app."Orchestra, row A, seat 5"');
  await drive.settleMotion();
  log.push({ afterDriveClick: await page.evaluate(() => window.__declare.find("app").chosen) , winScrollY: await page.evaluate(() => scrollY) });
  throw new Error("FINDINGS " + JSON.stringify(log));
};
