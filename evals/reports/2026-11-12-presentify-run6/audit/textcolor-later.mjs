export default async ({ drive, expect, page }) => {
  await drive.set("app", "showing", true);
  await drive.settleMotion();
  expect.equal(await page.evaluate(() => getComputedStyle(document.querySelector("input")).color), "rgba(0, 0, 0, 0)");
};
