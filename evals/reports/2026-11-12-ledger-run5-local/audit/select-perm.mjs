export default async ({ drive, expect, page }) => {
  await drive.set("app", "order", Number(process.env.ORDER ?? 0));
  await page.getByRole("button", { name: "Go" }).click();
  await drive.settleMotion();
  await drive.type("Typed");
  await drive.key("Tab");
  await drive.settleMotion();
  await expect.equal(await drive.page.evaluate(() => window.__declare.find("app").saved), "Typed");
};
