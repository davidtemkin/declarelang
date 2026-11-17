// §10, on a phone: Friday's performance, three seats across two sections by
// thumb, one taken by someone else mid-choice, sign in at checkout, a declined
// saved card, a new card with a mistyped postcode, and three tickets.
//
//   npx declare-verify my-apps/venue/venue.declare --url http://127.0.0.1:8600/my-apps/venue/venue.declare \
//       --assert my-apps/venue/tests/phone-flow.mjs
//
// The service remembers what it sells, so the seats are picked from what is
// free now.

import { freeSeats, seatName, buyElsewhere } from "./helpers.mjs";

export const device = { width: 390, height: 844, touch: true };

export default async ({ drive, expect, page }) => {
  await page.getByRole("button", { name: /^Fri 13 Nov/ }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole("heading", { name: "Fri 13 Nov · 7:30pm" })).toBeVisible();

  // The overview: a seat is too small for a thumb, so a tap flies in.
  const orch = await freeSeats(page, "ORCH", 4);
  const first = page.getByRole("button", { name: seatName(orch[0]), exact: true });
  await first.click();
  await drive.settleMotion();
  expect(await drive.read("app.hall.fit")).toBe(false);
  expect(await drive.read("app.hall.canPick")).toBe(true);
  await expect(first).toHaveAttribute("aria-pressed", "false");       // flew in, chose nothing

  // Now each tap is the seat it lands on.
  await first.click();
  await drive.settleMotion();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1 seat · $80.00", { exact: true })).toBeVisible();

  const second = page.getByRole("button", { name: seatName(orch[1]), exact: true });
  await second.click();
  await drive.settleMotion();
  await expect(page.getByText("2 seats · $160.00", { exact: true })).toBeVisible();

  // Across to the Grand Tier by its button, and a seat there.
  await page.getByRole("button", { name: /^Show Grand Tier/ }).click();
  await drive.settleMotion();
  const gt = await freeSeats(page, "GT", 2);
  const third = page.getByRole("button", { name: seatName(gt[0]), exact: true });
  await third.click();
  await drive.settleMotion();
  await expect(page.getByText("3 seats · $225.00", { exact: true })).toBeVisible();

  // Someone else buys the second seat while this person looks.
  await buyElsewhere(page, orch[1]);
  await drive.waitReal(2500);
  await drive.settleMotion();
  await expect(page.getByText(seatName(orch[1]) + " was just taken by someone else.", { exact: false })).toBeVisible();
  await expect(page.getByText("2 seats · $145.00", { exact: true })).toBeVisible();
  await expect(second).toBeDisabled();

  // They choose another in the Orchestra.
  await page.getByRole("button", { name: /^Show Orchestra/ }).click();
  await drive.settleMotion();
  const again = await freeSeats(page, "ORCH", 1, [orch[0]]);
  await page.getByRole("button", { name: seatName(again[0]), exact: true }).click();
  await drive.settleMotion();
  await expect(page.getByText("3 seats · $225.00", { exact: true })).toBeVisible();

  // Checkout, signed out.
  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay $245.00" })).toBeVisible();

  // Something typed before signing in survives it.
  await page.getByLabel("Name on card").fill("Ada L");

  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await drive.settleMotion();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill("ada@example.com");
  await dialog.getByLabel("Password").fill("wrong");
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await expect(dialog.getByText("That email and password don't match.")).toBeVisible();
  await dialog.getByLabel("Password").fill("correct horse battery");
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByText("Signed in as Ada Lovelace", { exact: false })).toBeVisible();

  // The Visa is offered and chosen; the expired Mastercard can't be.
  const visa = page.getByRole("radio", { name: /Visa ending 4242/ });
  const mc = page.getByRole("radio", { name: /Mastercard ending 4444/ });
  await expect(visa).toBeChecked();
  await expect(mc).toBeDisabled();
  await expect(mc).toHaveAccessibleName(/expired 08\/26/);

  // A code the bank declines.
  await page.getByLabel("Security code").fill("000");
  await page.getByRole("button", { name: "Pay $245.00" }).click();
  await drive.settleData();
  await expect(page.getByText("declined", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Security code")).toHaveValue("");

  // A new card instead. What they typed before signing in is still there.
  await page.getByRole("radio", { name: "A new card" }).click();
  await drive.settleMotion();
  await expect(page.getByLabel("Name on card")).toHaveValue("Ada L");
  await expect(page.getByLabel("Email")).toHaveValue("ada@example.com");
  const number = page.getByLabel("Card number");
  await number.pressSequentially("4242424242424242");
  await expect(number).toHaveValue("4242 4242 4242 4242");
  await expect(page.getByText("VISA", { exact: true })).toBeVisible();
  await page.getByLabel("Expiry").pressSequentially("1228");
  await expect(page.getByLabel("Expiry")).toHaveValue("12 / 28");
  await page.getByLabel("Security code").pressSequentially("123");

  // The saved billing address came with the account; mistype the postcode.
  const postal = page.getByLabel("Postal code");
  await expect(postal).toHaveValue("WC1N 1AB");
  await postal.fill("WC1N");
  await expect(page.getByText("Enter a postcode like SW1A 2AA.")).toHaveCount(0);   // not while typing
  await page.getByLabel("City").focus();
  await drive.settleMotion();
  await expect(page.getByText("Enter a postcode like SW1A 2AA.")).toBeVisible();
  await postal.fill("WC1N 1AB");
  await page.getByLabel("City").focus();
  await expect(page.getByText("Enter a postcode like SW1A 2AA.")).toHaveCount(0);

  // Pay, pressed twice: one payment.
  const before = (await drive.requests()).filter((r) => r.method == "POST" && r.path.startsWith("/api/orders")).length;
  const pay = page.getByRole("button", { name: "Pay $245.00" });
  await pay.dblclick();
  await drive.settleData();
  await drive.settleMotion();
  const after = (await drive.requests()).filter((r) => r.method == "POST" && r.path.startsWith("/api/orders")).length;
  expect(after - before).toBe(1);

  // Three tickets, one at a time.
  await expect(page.getByText("Sent to ada@example.com", { exact: true })).toBeVisible();
  await expect(page.getByText("1 of 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next ticket" }).click();
  await drive.settleMotion();
  await expect(page.getByText("2 of 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next ticket" }).click();
  await drive.settleMotion();
  await expect(page.getByText("3 of 3", { exact: true })).toBeVisible();

  // and start again
  await page.getByRole("button", { name: "Book another performance" }).click();
  await drive.settleMotion();
  await expect(page.getByRole("heading", { name: "The Marriage of Figaro" })).toBeVisible();
};
