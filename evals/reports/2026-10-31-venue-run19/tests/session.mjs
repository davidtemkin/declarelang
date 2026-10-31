// The session lives with the service: signed in survives a reload; signing out signs out.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleMotion();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill("a@a.co");
  await dialog.getByLabel("Password").fill("pass");
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.reload();
  await drive.settleData();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await drive.settleData();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.reload();
  await drive.settleData();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
};
