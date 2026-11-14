export default async ({ drive, expect, page }) => {
  console.log("count", await page.getByLabel("Count").count());
  console.log("els", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("[aria-label*=Count i], [aria-labelledby]")].map(e => e.tagName + ":" + (e.getAttribute("role") ?? "") + ":" + (e.getAttribute("aria-label") ?? e.getAttribute("aria-labelledby"))))));
  await drive.click("app.pages.counter.row.button");
  await expect(page.getByLabel("Count")).toHaveValue("1");
};
