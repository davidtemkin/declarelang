export default async ({ drive, expect, page }) => {
  await drive.key("Tab");
  await drive.settleMotion();
};
