export default async ({ drive, expect, page }) => {
  await page.evaluate(() => window.__declare.find("app").add());
  await drive.settleData();
  const got = await page.evaluate(() => ["a","b","c","d"].map((k) => window.__declare.find("app.list.0." + k).text));
  console.log("after insert:", JSON.stringify(got));
};
