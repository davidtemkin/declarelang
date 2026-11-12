// The session is the service's: a reload keeps it, Sign out ends it. The
// password field is a password field, and can be shown.
export default async ({ page, expect }) => {
  await page.evaluate(() => fetch("http://127.0.0.1:8350/api/session", { method: "DELETE", credentials: "include" }));
  await page.reload();
  await page.getByRole("button", { name: "Sign in" }).click();
  const dlg = page.getByRole("dialog");
  const pw = dlg.getByLabel("Password");
  await expect(pw).toHaveAttribute("type", "password");
  await expect(pw).toHaveAttribute("autocomplete", "current-password");
  await expect(dlg.getByLabel("Email")).toHaveAttribute("autocomplete", /email/);
  await dlg.getByRole("checkbox", { name: "Show password" }).click();
  await expect(pw).toHaveAttribute("type", "text");
  await dlg.getByLabel("Email").fill("a@a.co");
  await pw.fill("pass");
  await pw.press("Enter");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
};
