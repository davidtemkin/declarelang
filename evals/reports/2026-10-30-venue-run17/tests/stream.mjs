// The hall follows other people's purchases as they happen.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /Fri 13 Nov/ }).first().click();
  await drive.settleData(); await drive.wait(300);
  const before = await page.evaluate(() => window.__declare.find("app").house.freeCount);
  await drive.waitReal(30000);
  await drive.wait(100);
  const after = await page.evaluate(() => window.__declare.find("app").house.freeCount);
  const status = await page.evaluate(() => window.__declare.find("app").sales.status);
  console.log("free before", before, "after", after, "stream", status);
  if (!(after < before)) throw new Error("no live sales arrived");
};
