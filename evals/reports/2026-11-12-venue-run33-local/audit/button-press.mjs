export default async ({ page, drive, expect }) => {
  await page.getByRole("button", { name: "Go" }).click();
  await drive.settleMotion();
  console.log("AFTER CLICK", await page.evaluate(() => document.body.innerText.match(/presses \d+/)?.[0]));
  await page.getByRole("button", { name: "Go" }).focus?.();
  await drive.key(" ");
  await drive.settleMotion();
  console.log("AFTER SPACE", await page.evaluate(() => document.body.innerText.match(/presses \d+/)?.[0]));
};
