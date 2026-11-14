// The keyboard path to the same field: does focus land it clear of the bar?
export const device = { width: 390, height: 844 };
export default async ({ page, drive }) => {
  await page.getByLabel("Alpha", { exact: true }).click();
  for (let i = 0; i < 16; i++) await drive.tab();
  await drive.settleMotion();
  const r = await page.evaluate(() => { const a = document.activeElement.getBoundingClientRect(); return { label: document.activeElement.getAttribute("aria-label"), top: Math.round(a.top), bottom: Math.round(a.bottom), h: innerHeight }; });
  console.log("FOCUSED", JSON.stringify(r), "bar top", r.h - 100);
};
