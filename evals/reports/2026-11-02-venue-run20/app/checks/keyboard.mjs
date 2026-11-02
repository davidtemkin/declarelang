// The keyboard alone: a performance, two seats with the arrows, on to checkout.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  // Tab from the top: the masthead, sign in, then the performances
  for (let i = 0; i < 12; i++) {
    await drive.key("Tab");
    const name = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    if (/^Wed 25 Nov/.test(name)) break;
  }
  await drive.key("Enter");
  await drive.settleData(); await drive.settleMotion();
  // into the hall: one Tab stop
  let name = "";
  for (let i = 0; i < 6; i++) {
    await drive.key("Tab");
    name = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    if (/, row /.test(name)) break;
  }
  console.log("entered at", name);
  await drive.key("Space");
  await drive.key("ArrowRight");
  const second = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
  console.log("then", second);
  await drive.key("Enter");
  await expect(page.getByText(/^2 seats · \$\d+\.00$/)).toBeVisible();
  await drive.key("ArrowDown");
  console.log("down to", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? ""));
  for (let i = 0; i < 8; i++) {
    await drive.key("Tab");
    if ((await page.evaluate(() => document.activeElement?.textContent ?? "")).includes("Continue")) break;
  }
  await drive.key("Enter");
  await drive.settleMotion();
  console.log("focus now", await page.evaluate(() => document.activeElement?.textContent ?? ""));
  await drive.key("Tab");
  console.log("next", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent));
  await expect(page.getByLabel("Email for your tickets")).toBeVisible();
};
