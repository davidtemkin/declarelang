export default async ({ drive, expect, page }) => {
  console.log("count", await page.getByLabel("Count").count());
  console.log("roles", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("[aria-label=Count], input, button")].map(e => e.tagName + ":" + (e.getAttribute("role") ?? "") + ":" + (e.getAttribute("aria-label") ?? "")))));
  await expect(page.getByLabel("Count")).toHaveValue("0");
};
