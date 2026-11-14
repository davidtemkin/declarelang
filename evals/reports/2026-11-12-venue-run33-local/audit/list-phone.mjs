// The list at phone size, once the live service's performances have arrived.
export const device = { width: 390, height: 844, touch: true };
export default async ({ page, drive, expect }) => {
  await drive.settleData();
  await expect(page.getByRole("button", { name: /^Wed 18 Nov/ })).toBeVisible();
  console.log("DATE BOX", await page.evaluate(() => [...document.querySelectorAll("span,div")].filter(e => e.textContent === "Wed 18 Nov").map(e => { const r = e.getBoundingClientRect(); return `${e.tagName} w=${Math.round(r.width)} sw=${e.scrollWidth}`; }).join("; ")));
};
