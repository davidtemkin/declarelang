// The delivered app, a narrow window with a keyboard: Tab from the hall's heading.
export const device = { width: 390, height: 844, touch: false };
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 13 Nov/ }).click();
  await drive.settleData(); await drive.settleMotion();
  const who = () => page.evaluate(() => { const v = window.__declare?.profile?.viewOf?.(document.activeElement)?.view; return (v ?? "?") + " / " + document.activeElement?.tagName + " / " + (document.activeElement?.getAttribute("aria-label") ?? ""); });
  console.log("after opening:", await who());
  for (let i = 1; i <= 3; i++) { await drive.tab(); console.log("Tab", i, ":", await who()); }
};
