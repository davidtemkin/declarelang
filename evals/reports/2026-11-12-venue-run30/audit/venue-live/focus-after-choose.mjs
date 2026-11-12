// Venue 30, d18: where focus is after Return on a performance hides the list.
export default async ({ page, expect }) => {
  await expect(page.getByRole("button", { name: "Fri 13 Nov, 7:30pm" })).toBeVisible();
  const who = () => page.evaluate(() => { const a = document.activeElement; return (a?.tagName ?? "") + " role=" + (a?.getAttribute("role") ?? "") + " name=" + (a?.getAttribute("aria-label") ?? (a?.textContent ?? "").slice(0, 30)); });
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    if ((await who()).includes("Nov")) break;
  }
  console.log("before Return:", await who());
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Orchestra, row A, seat 1" })).toBeVisible();
  console.log("after Return:", await who());
  for (let i = 0; i < 3; i++) { await page.keyboard.press("Tab"); console.log("Tab:", await who()); }
};
