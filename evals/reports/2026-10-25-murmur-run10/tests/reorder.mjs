export const device = { width: 390, height: 844, touch: true };
export default async ({ drive, page }) => {
  const t0 = Date.now();
  while (Date.now() - t0 < 12600) await drive.wait(200);
  await page.screenshot({ path: "/tmp/mm/re1.png" });
  await drive.wait(150);
  await page.screenshot({ path: "/tmp/mm/re2.png" });
  await drive.wait(1500);
  await page.screenshot({ path: "/tmp/mm/re3.png" });
};
