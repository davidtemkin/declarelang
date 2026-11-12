export default async ({ drive, expect, page }) => {
  await drive.key("Tab");
  const who = () => page.evaluate(() => document.activeElement?.textContent);
  console.log("focused:", await who());
  await drive.key("ArrowDown");
  console.log("after ArrowDown, focused:", await who(), "moved =", await page.evaluate(() => window.__declare.find("app").moved));
  await drive.key("End");
  console.log("after End, focused:", await who(), "ended =", await page.evaluate(() => window.__declare.find("app").ended));
};
