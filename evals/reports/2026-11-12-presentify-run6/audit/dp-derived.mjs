export default async ({ drive, expect, page }) => {
  await drive.settleMotion();
  const t1 = await page.evaluate(() => document.body.innerText);
  console.log("before:", JSON.stringify(t1));
  await page.evaluate(() => window.__declare.find("app").moveOn());
  await drive.settleMotion();
  const t2 = await page.evaluate(() => document.body.innerText);
  console.log("after:", JSON.stringify(t2));
};
