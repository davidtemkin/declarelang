// A picture of a seat with the keyboard's focus, and one chosen beside it.
export default async ({ drive, page }) => {
  await drive.settleData();
  await drive.click('app.listScreen.grid.3');
  await drive.settleData();
  await drive.key("Tab");
  await drive.key("ArrowRight");
  await drive.key("Space");
  await drive.key("ArrowRight");
  await drive.settleMotion();
  console.log(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")));
  await page.screenshot({ path: process.env.VENUE_SHOTS + "/focus3.png" });
};
