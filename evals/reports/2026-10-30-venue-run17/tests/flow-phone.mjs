// Phone: pick three seats across two sections with a finger; someone else takes one; sign in at checkout; pay.
export const device = { width: 390, height: 844, touch: true };
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /Fri 13 Nov/ }).first().click();
  await drive.settleData(); await drive.wait(400);
  const free = await page.$$eval('[aria-pressed="false"]:not([aria-disabled="true"])', (els) => els.map((e) => e.getAttribute("aria-label")));
  const orch = free.filter((n) => n.startsWith("Orchestra, row C") || n.startsWith("Orchestra, row D"));
  const gt = free.filter((n) => n.startsWith("Grand Tier"));
  const pick = [orch[0], orch[1], gt[0]];
  for (const nm of pick) await page.getByRole("button", { name: nm, exact: true }).click();
  await drive.wait(400);
  console.log("pressed:", await page.$$eval('[aria-pressed="true"]', (els) => els.map((e) => e.getAttribute("aria-label"))));
  console.log("summary visible:", await page.getByText(/^3 seats · \$/).count());
  // someone else takes the third seat
  const id = await page.evaluate((nm) => { const m = /^(.*), row (\w+), seat (\d+)$/.exec(nm); const key = { "Orchestra": "ORCH", "Grand Tier": "GT", "Dress Circle": "DC", "Balcony": "BALC" }[m[1]]; return key + "-" + m[2] + "-" + m[3]; }, pick[2]);
  await drive.set("app", "lastTakeTest", null).catch(() => {});
  await page.evaluate((id) => window.__declare.find("app").seatTaken(id), id);
  await drive.wait(400);
  console.log("after taken:", await page.$$eval('[aria-pressed="true"]', (els) => els.map((e) => e.getAttribute("aria-label"))));
  console.log("notice:", await page.evaluate(() => window.__declare.find("app").notice));
  await page.getByRole("button", { name: "Continue" }).click();
  await drive.wait(600);
  console.log("total line:", await page.getByText(/^Pay \$/).count());
};
