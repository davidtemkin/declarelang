// The session lives with the service: a reload keeps the person signed in,
// and signing out signs them out, reload or not.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await expect.attr("app", "signedIn", false);
  await drive.click('app.header."Sign in"');
  await drive.settleMotion();
  await drive.type("ada@example.com");
  await drive.key("Tab");
  await drive.type("correct horse battery");
  await drive.key("Enter");
  await drive.settleData();
  await expect.attr("app", "signedIn", true);
  await page.reload();
  await drive.settleData();
  await expect.attr("app", "signedIn", true);
  await expect.text("app.header", "Ada Lovelace");
  await drive.click('app.header."Sign out"');
  await drive.settleData();
  await expect.attr("app", "signedIn", false);
  await page.reload();
  await drive.settleData();
  await expect.attr("app", "signedIn", false);
};
