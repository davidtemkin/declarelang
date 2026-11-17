// §10, at a desk: someone with no account books two seats with the keyboard
// alone. Then the refusals the service can give, each answered where it
// belongs.
//
//   npx declare-verify my-apps/venue/venue.declare --url http://127.0.0.1:8600/my-apps/venue/venue.declare \
//       --assert my-apps/venue/tests/desk-keyboard.mjs

import { freeSeats, seatName, startElsewhere } from "./helpers.mjs";

const focusedName = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return a ? (a.getAttribute("aria-label") ?? a.textContent ?? "").trim() : "";
});
const orders = async (drive) => (await drive.requests()).filter((r) => r.method == "POST" && r.path.startsWith("/api/orders"));

async function tabTo(drive, page, pattern, limit = 60) {
  for (let i = 0; i < limit; i++) {
    await drive.tab();
    if (pattern.test(await focusedName(page))) return;
  }
  throw new Error("Tab never reached " + pattern + "; last: " + (await focusedName(page)));
}

export default async ({ drive, expect, page }) => {
  // ── the performance, by keyboard: the header's Sign in comes first, then the list
  await drive.tab();
  expect(await focusedName(page)).toBe("Sign in");
  await tabTo(drive, page, /^Sat 14 Nov/);
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole("heading", { name: "Sat 14 Nov · 7:30pm" })).toBeFocused();

  // ── into the seats: one Tab stop, then the arrows
  await tabTo(drive, page, /^(Orchestra|Grand Tier|Dress Circle|Balcony), row/);
  const start = await focusedName(page);
  await drive.key("ArrowDown");
  await drive.key("ArrowDown");
  await drive.key("ArrowLeft");
  const firstSeat = await focusedName(page);
  expect(firstSeat).not.toBe(start);
  await drive.key("Space");
  await drive.settleMotion();
  await expect(page.getByRole("button", { name: firstSeat, exact: true })).toHaveAttribute("aria-pressed", "true");
  await drive.key("ArrowLeft");
  const secondSeat = await focusedName(page);
  await drive.key("Space");
  await drive.settleMotion();
  await expect(page.getByText(/^2 seats · \$\d+\.00$/)).toBeVisible();
  // and unchosen the same way, then chosen again
  await drive.key("Space");
  await expect(page.getByText(/^1 seat · \$\d+\.00$/)).toBeVisible();
  await drive.key("Space");
  await expect(page.getByText(/^2 seats · \$\d+\.00$/)).toBeVisible();
  console.log("chose", firstSeat, "and", secondSeat);

  // ── on to checkout
  await tabTo(drive, page, /^Continue$/);
  await drive.key("Enter");
  await drive.settleMotion();
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeFocused();

  // ── the form, field by field; nothing is marked wrong while first typed
  const fill = async (label, text) => {
    await tabTo(drive, page, new RegExp("^" + label.replace(/[()]/g, "\\$&") + "$"));
    await drive.type(text);
  };
  await fill("Email", "grace@example.com");
  await fill("Name on card", "Grace Hopper");
  await fill("Card number", "5555555555554444");
  await expect(page.getByLabel("Card number")).toHaveValue("5555 5555 5555 4444");
  await expect(page.getByText("MASTERCARD", { exact: true })).toBeVisible();
  await fill("Expiry", "13");
  await drive.tab();
  await expect(page.getByText("The month must be between 01 and 12.")).toBeVisible();     // caught on leaving
  await page.getByLabel("Expiry").fill("");
  await page.getByLabel("Expiry").pressSequentially("0526");
  await expect(page.getByText("This card has expired.")).toBeVisible();                   // a past expiry
  await page.getByLabel("Expiry").fill("");
  await page.getByLabel("Expiry").pressSequentially("0830");
  await expect(page.getByText("This card has expired.")).toHaveCount(0);
  await page.getByLabel("Expiry").focus();
  await fill("Security code", "321");
  await fill("Street address", "1 Infinite Loop");
  await fill("City", "Cupertino");
  await fill("Postal code", "95014");
  await expect(page.getByLabel("Apartment, suite, etc. (optional)")).toHaveValue("");

  // Enter pays; Enter again sends nothing more.
  await drive.key("Enter");
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByText("Sent to grace@example.com", { exact: true })).toBeVisible();
  const sent = await orders(drive);
  expect(sent.length).toBe(1);
  expect(sent[0].body.payment.card.number).toBe("5555555555554444");
  expect(sent[0].body.payment.billing).toEqual({ line1: "1 Infinite Loop", line2: null, city: "Cupertino", postalCode: "95014", country: "US" });
  await expect(page.getByText("1 of 2", { exact: true })).toBeVisible();

  // ── the refusals, on a fresh basket
  await page.getByRole("button", { name: "Book another performance" }).click();
  await drive.settleData();
  await page.getByRole("button", { name: /^Sat 14 Nov/ }).click();
  await drive.settleData();
  const picks = await freeSeats(page, "DC", 2);
  for (const id of picks) await page.getByRole("button", { name: seatName(id), exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();

  // Pay with nothing typed: every problem at once, focus on the first.
  await page.getByRole("button", { name: "Pay $110.00" }).click();
  await drive.settleMotion();
  await expect(page.getByLabel("Email")).toBeFocused();
  await expect(page.getByText("Enter the card number.")).toBeVisible();
  expect((await orders(drive)).length).toBe(1);                                   // nothing sent

  await page.getByLabel("Email").fill("grace@example.com");
  await page.getByLabel("Name on card").fill("Grace Hopper");
  await page.getByLabel("Card number").pressSequentially("4242424242424241");
  await page.getByLabel("Expiry").focus();
  await expect(page.getByText("That isn't a valid card number.", { exact: false })).toBeVisible();   // caught before paying
  await page.getByLabel("Card number").fill("");
  await page.getByLabel("Card number").pressSequentially("4000000000000127");
  await page.getByLabel("Expiry").pressSequentially("0830");
  await page.getByLabel("Security code").pressSequentially("123");
  await page.getByLabel("Street address").fill("1 Infinite Loop");
  await page.getByLabel("City").fill("Cupertino");
  await page.getByLabel("Postal code").fill("95014");

  // The bank says the security code is wrong: on that field, and taken there.
  await page.getByRole("button", { name: "Pay $110.00" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByLabel("Security code")).toBeFocused();
  const cvcRefusal = (await orders(drive)).at(-1);
  console.log("cvc refusal status", cvcRefusal.status);

  // Insufficient funds: the service's sentence; everything else kept.
  await page.getByLabel("Card number").fill("");
  await page.getByLabel("Card number").pressSequentially("4000000000009995");
  await page.getByLabel("Security code").fill("123");
  await page.getByRole("button", { name: "Pay $110.00" }).click();
  await drive.settleData();
  await expect(page.getByRole("status").filter({ hasText: /fund/i })).toBeVisible();
  await expect(page.getByLabel("Security code")).toHaveValue("");
  await expect(page.getByLabel("City")).toHaveValue("Cupertino");

  // American Express wants four digits.
  await page.getByLabel("Card number").fill("");
  await page.getByLabel("Card number").pressSequentially("378282246310005");
  await expect(page.getByLabel("Card number")).toHaveValue("3782 822463 10005");
  await page.getByLabel("Security code").pressSequentially("123");
  await page.getByLabel("City").focus();
  await expect(page.getByText("Enter the 4-digit code on the front of the card.")).toBeVisible();

  // A seat sold the moment before paying: back in the hall, the rest kept.
  await page.getByLabel("Security code").fill("1234");
  await startElsewhere(page, picks[0], "p02");
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await drive.settleData();
  await drive.settleMotion();
  expect((await orders(drive)).at(-1).status).toBe(409);
  await expect(page.getByRole("status").filter({ hasText: /taken|no longer|available/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sat 14 Nov · 7:30pm" })).toBeVisible();
  await expect(page.getByText("1 seat · $50.00", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: seatName(picks[0]), exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: seatName(picks[1]), exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1 seat · $50.00", { exact: true })).toBeVisible();
};
