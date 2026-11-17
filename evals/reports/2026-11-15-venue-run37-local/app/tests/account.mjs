// The account at a desk: signing in from the header halfway through choosing,
// the session living with the service across a reload, and signing out.

import { freeSeats, seatName } from "./helpers.mjs";

export default async ({ drive, expect, page }) => {
  await page.getByRole("button", { name: /^Sun 15 Nov/ }).click();
  await drive.settleData();
  const [a] = await freeSeats(page, "BALC", 1);
  await page.getByRole("button", { name: seatName(a), exact: true }).click();
  await expect(page.getByText("1 seat · $35.00", { exact: true })).toBeVisible();

  // Sign in from the header, in the middle of choosing.
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleMotion();
  // while the dialog is open, only it is there to a screen reader
  await expect(page.getByLabel("Email")).toHaveCount(1);
  await expect(page.getByLabel("Password")).toHaveAttribute("type", "password");
  await page.getByRole("checkbox", { name: "Show password" }).click();
  await expect(page.getByLabel("Password")).toHaveAttribute("type", "text");
  await expect(page.getByLabel("Password")).toHaveAttribute("autocomplete", "current-password");
  await expect(page.getByLabel("Email")).toHaveAttribute("autocomplete", /email/);
  await page.getByLabel("Email").fill("a@a.co");
  await page.getByLabel("Password").fill("pass");
  await page.getByLabel("Password").press("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeFocused();
  await expect(page.getByText("1 seat · $35.00", { exact: true })).toBeVisible();     // nothing lost

  // At checkout the account fills in, and the saved card is chosen.
  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();
  await expect(page.getByRole("radio", { name: /Visa ending 4242 · expires 04\/28/ })).toBeChecked();
  await page.getByRole("radio", { name: "A new card" }).click();
  await expect(page.getByLabel("Email")).toHaveValue("a@a.co");
  await expect(page.getByLabel("Street address")).toHaveValue("12 Marchmont Street");
  await expect(page.getByRole("combobox", { name: "Country" })).toHaveValue("United Kingdom");
  // the browser's autofill names on the card fields
  await expect(page.getByLabel("Card number")).toHaveAttribute("autocomplete", "cc-number");
  await expect(page.getByLabel("Expiry")).toHaveAttribute("autocomplete", "cc-exp");
  await expect(page.getByLabel("Security code")).toHaveAttribute("autocomplete", "cc-csc");
  await expect(page.getByLabel("Name on card")).toHaveAttribute("autocomplete", "cc-name");
  await expect(page.getByLabel("Postal code")).toHaveAttribute("autocomplete", "postal-code");

  // The session is the service's: a reload keeps it.
  await page.reload();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // Signing out signs out.
  await page.getByRole("button", { name: "Sign out" }).click();
  await drive.settleData();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  const me = await page.evaluate(async () => (await fetch("http://127.0.0.1:8350/api/me", { credentials: "include" })).status);
  expect(me).toBe(401);
};
