// A seat taken before payment: nothing charged, back in the hall, the rest kept.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /Sat 14 Nov/ }).first().click();
  await drive.settleData(); await drive.wait(300);
  const ids = await page.evaluate(() => {
    const h = window.__declare.find("app").house.value;
    const free = [], sold = [];
    h.sections.forEach((s) => s.rows.forEach((r) => r.seats.forEach((x) => (x.status == "sold" ? sold : free).push(x.id))));
    return [free[0], sold[0]];
  });
  await drive.set("app", "picked", ids);
  await drive.wait(200);
  await page.getByRole("button", { name: "Continue" }).click();
  await drive.wait(400);
  await page.getByLabel("Email for your tickets").fill("grace@example.com");
  await page.getByLabel("Name on card").fill("G Hopper");
  await page.getByLabel("Card number").fill("4242 4242 4242 4242");
  await page.getByLabel(/Expiry/).fill("04 / 29");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Street address").fill("1 Main St");
  await page.getByLabel("City").fill("Boston");
  await page.getByLabel("Postal code").fill("02110");
  await page.getByLabel("Country").last().click();
  await drive.type("United States");
  await drive.key("Enter");
  await drive.wait(200);
  await page.getByRole("button", { name: /^Pay \$/ }).first().click();
  await drive.settleData(); await drive.waitReal(2200); await drive.settleData(); await drive.wait(400);
  const app = await page.evaluate(() => { const a = window.__declare.find("app"); return { screen: a.screen, picked: a.picked, notice: a.notice }; });
  console.log(app);
  await expect.equal(app.screen, "hall");
  await expect.equal(app.picked.length, 1);
};
