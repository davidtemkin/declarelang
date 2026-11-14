export default async ({ drive, expect, page }) => {
  await page.getByRole("button", { name: "Heading stop" }).click();
  const who = () => page.evaluate(() => { const v = window.__declare?.profile?.viewOf?.(document.activeElement)?.view; return (v ?? "?") + " / " + document.activeElement?.tagName; });
  console.log("start:", await who());
  await drive.tab();
  console.log("Tab 1 lands on:", await who());
  await drive.tab();
  console.log("Tab 2 lands on:", await who());
};
