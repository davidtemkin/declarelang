export default async ({ drive, expect, page }) => {
  await drive.key("Tab");
  await drive.key("ArrowDown");
  const f = await drive.page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName);
  await drive.key("Escape");
  await drive.key("Meta+K");
  await drive.key("Control+K");
  const a = await drive.page.evaluate(() => { const a = window.__declare.find("app"); return [a.esc, a.k] });
  await expect.equal(JSON.stringify([f, a]), "x");
};
