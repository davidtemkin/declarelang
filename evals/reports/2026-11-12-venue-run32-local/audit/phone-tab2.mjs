// The delivered app, a narrow window with a keyboard: a seat chosen, then Tab out of the hall.
export const device = { width: 390, height: 844, touch: false };
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 13 Nov/ }).click();
  await drive.settleData(); await drive.settleMotion();
  const who = () => page.evaluate(() => { const v = window.__declare?.profile?.viewOf?.(document.activeElement)?.view; return (v ?? "?") + " / " + document.activeElement?.tagName + " / " + (document.activeElement?.getAttribute("aria-label") ?? ""); });
  await drive.tab();
  for (let i = 0; i < 40; i++) {
    const p = await page.evaluate(() => document.activeElement?.getAttribute("aria-pressed") === "false" && document.activeElement?.getAttribute("aria-disabled") !== "true");
    if (p) { await drive.key("Space"); break; }
    await drive.key("ArrowRight");
  }
  console.log("on a chosen seat:", await who());
  for (let i = 1; i <= 3; i++) { await drive.tab(); console.log("Tab", i, ":", await who()); }
  await drive.tab({ shift: true }).catch(() => {});
};
