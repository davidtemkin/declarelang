export default async ({ drive, expect }) => {
  await drive.click("app.0");
  await drive.settleMotion();
  await expect.visible("app.pill");
  console.log("pill width", await drive.page.evaluate(() => window.__declare.find("app.pill").width));
};
