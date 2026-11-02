// On a phone: seats with a thumb, sign in halfway through paying, a decline,
// a new card, a mistyped postcode, and three tickets.
export const device = { width: 390, height: 844, touch: true };
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 13 Nov, 7:30pm/ }).click();
  await drive.settleData();
  const free = page.locator('[aria-pressed="false"]:not([aria-disabled="true"])');
  const names = await free.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).filter((n) => n.startsWith("Orchestra")).slice(0, 3));
  for (const n of names) await page.getByRole("button", { name: n, exact: true }).click();
  await expect(page.getByText("3 seats · $240.00")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();
  // typed as a guest first, then signs in: nothing is lost
  await page.getByLabel("Email for your tickets").fill("someone@example.com");
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await drive.settleMotion();
  await page.getByLabel("Email", { exact: true }).fill("ada@example.com");
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("dialog").getByRole("button", { name: "Sign in" }).click();
  await drive.waitReal(400); await drive.settleData();
  await expect(page.getByText("That email and password don't match.")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByRole("dialog").getByRole("button", { name: "Sign in" }).click();
  await drive.waitReal(400); await drive.settleData(); await drive.settleMotion();
  await expect(page.getByRole("radio", { name: /Visa ending 4242/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /Mastercard ending 4444, Expired/ })).toBeDisabled();
  await page.getByLabel(/Security code for Visa/).fill("000");
  await page.getByRole("button", { name: "Pay $261.00" }).click();
  await drive.waitReal(2200); await drive.settleData(); await drive.settleMotion();
  await expect(page.getByText(/declined/i)).toBeVisible();
  await expect(page.getByLabel(/Security code for Visa/)).toHaveValue("");
  // a new card
  await page.getByRole("radio", { name: /A new card/ }).click();
  await expect(page.getByLabel("Email for your tickets")).toHaveValue("someone@example.com");
  await page.getByLabel("Card number").pressSequentially("5555555555554444");
  await expect(page.getByLabel("Card number")).toHaveValue("5555 5555 5555 4444");
  await page.getByLabel("Expiry").pressSequentially("1230");
  await page.getByLabel("Security code", { exact: true }).fill("321");
  await page.getByLabel("Postcode").fill("WC1N1A");
  await page.getByLabel("Street address").focus();
  await expect(page.getByText("Enter a postcode like SW1A 1AA.")).toBeVisible();
  await page.getByLabel("Postcode").fill("WC1N 1AB");
  await page.getByRole("button", { name: "Pay $261.00" }).click();
  await drive.waitReal(2200); await drive.settleData(); await drive.settleMotion();
  await expect(page.getByText("Sent to someone@example.com")).toBeVisible();
  await expect(page.getByText("Ticket 1 of 3")).toBeVisible();
  await drive.wait(7000); await drive.settleMotion();
  await page.screenshot({ path: "/tmp/vshots/p-tickets.png" });
  await page.getByRole("button", { name: "Next ›" }).click();
  await drive.settleMotion();
  await expect(page.getByText("Ticket 2 of 3")).toBeVisible();
};
