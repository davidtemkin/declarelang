// At a desk: signing in fills the checkout from the account, the session lives
// with the service (a reload keeps it), and signing out signs out. Buys nothing.

export default async ({ drive, expect, page }) => {
  if (await page.getByRole("button", { name: "Sign out" }).isVisible()) {
    await page.getByRole("button", { name: "Sign out" }).click();
    await drive.settleData();
  }
  await page.getByRole("button", { name: /^Sun 13 Dec, 2:00pm/ }).click();
  await drive.settleData();
  await drive.settleMotion();
  const free = await page.evaluate(() => [...document.querySelectorAll('[aria-pressed="false"]')]
    .filter((e) => /, row [A-Z], seat \d+$/.test(e.getAttribute("aria-label") || "") && e.getAttribute("aria-disabled") != "true")
    .map((e) => e.getAttribute("aria-label")));
  await page.getByRole("button", { name: free[0], exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();
  await page.getByLabel("Card number").pressSequentially("5555555555554444");
  await expect(page.getByLabel("Card number")).toHaveValue("5555 5555 5555 4444");

  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleMotion();
  const sheet = page.getByRole("dialog", { name: "Sign in" });
  await sheet.getByLabel("Email").fill("a@a.co");
  await sheet.getByLabel("Password").fill("pass");
  await sheet.getByLabel("Password").press("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByText(/^Signed in as /).first()).toBeVisible();
  await expect(page.getByRole("option", { name: /Visa ending 4242, expires/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("option", { name: /Mastercard ending 4444, expired/ })).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByLabel("Security code")).toBeVisible();
  await expect(page.getByLabel("Card number")).toBeHidden();
  if (process.env.VENUE_SHOTS) await page.screenshot({ path: process.env.VENUE_SHOTS + "/session-desk.png" });

  // the new card typed before signing in is still there
  await page.getByRole("option", { name: /A new card/ }).click();
  await drive.settleMotion();
  await expect(page.getByLabel("Card number")).toHaveValue("5555 5555 5555 4444");
  await expect(page.getByLabel("City")).toHaveValue("London");
  await expect(page.getByLabel("Postal code")).toHaveValue("WC1N 1AB");
  await expect(page.getByRole("radio", { name: "United Kingdom" })).toBeChecked();

  // a reload keeps the session
  await page.reload();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // signing out signs out, and a reload agrees
  await page.getByRole("button", { name: "Sign out" }).click();
  await drive.settleData();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.reload();
  await drive.settleData();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect.request("DELETE", "/api/session", { count: 1 });
};
