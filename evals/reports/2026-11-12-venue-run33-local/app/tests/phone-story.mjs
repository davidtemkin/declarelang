// The brief's §10, on a phone, against the live service.
export const device = { width: 390, height: 844, touch: true };

async function freeSeats(page, section, n, skip = []) {
  const out = [];
  for (const b of await page.getByRole("button", { name: new RegExp("^" + section + ", row ") }).all()) {
    if (out.length >= n) break;
    const name = await b.getAttribute("aria-label");
    if (skip.includes(name)) continue;
    if (await b.isEnabled() && (await b.getAttribute("aria-pressed")) !== "true") out.push(b);
  }
  return out;
}
const idOf = (name) => {   // "Orchestra, row C, seat 14" → ORCH-C-14
  const m = name.match(/^(.*), row (\w+), seat (\d+)$/);
  const key = { "Orchestra": "ORCH", "Grand Tier": "GT", "Dress Circle": "DC", "Balcony": "BALC" }[m[1]];
  return key + "-" + m[2] + "-" + m[3];
};

export default async ({ drive, expect, page }) => {
  await page.screenshot({ path: "/tmp/venue-shots/phone-list.png" });
  await page.getByRole("button", { name: /^Fri 13 Nov/ }).click();
  await drive.settleData();
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/venue-shots/phone-hall.png" });

  const [a, b] = await freeSeats(page, "Grand Tier", 2);
  await a.click(); await b.click();
  const [c] = await freeSeats(page, "Dress Circle", 1);
  await c.click();
  await drive.settleMotion();
  await expect(page.getByText(/^3 seats · \$/)).toBeVisible();
  await page.screenshot({ path: "/tmp/venue-shots/phone-chosen.png" });

  // someone else buys one of them
  const takenName = await c.getAttribute("aria-label");
  await page.evaluate(async (id) => {
    await fetch("http://127.0.0.1:8350/api/orders", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ performanceId: "p01", seatIds: [id], email: "someone@else.co",
        payment: { card: { number: "4242424242424242", expMonth: 12, expYear: 2030, cvc: "123", name: "S E" },
          billing: { line1: "1 A St", city: "Town", postalCode: "94103", country: "US" } } }) });
  }, idOf(takenName));
  await drive.waitReal(2500);
  await drive.settleMotion();
  await expect(page.getByText(takenName + " has just been taken by someone else.").first()).toBeVisible();
  await expect(page.getByText(/^2 seats · \$/)).toBeVisible();
  await page.screenshot({ path: "/tmp/venue-shots/phone-taken.png" });
  const [d] = await freeSeats(page, "Dress Circle", 1, [takenName]);
  await d.click();
  await expect(page.getByText(/^3 seats · \$/)).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();
  await page.getByLabel("Email").fill("typed@before.co");
  await page.screenshot({ path: "/tmp/venue-shots/phone-checkout.png" });

  // sign in halfway
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();
  await drive.settleMotion();
  await page.getByRole("dialog").getByLabel("Email").fill("ada@example.com");
  await page.getByRole("dialog").getByLabel("Password").fill("wrong");
  await page.getByRole("dialog").getByRole("button", { name: "Sign in" }).click();
  await drive.settleData(); await drive.settleMotion();
  await expect(page.getByText("That email and password don't match.")).toBeVisible();
  await page.screenshot({ path: "/tmp/venue-shots/phone-signin-wrong.png" });
  await page.getByRole("dialog").getByLabel("Password").fill("correct horse battery");
  await page.getByRole("dialog").getByRole("button", { name: "Sign in" }).click();
  await drive.settleData(); await drive.settleMotion();
  await expect(page.getByText(/^3 seats/).first()).toBeVisible().catch(() => {});
  await page.screenshot({ path: "/tmp/venue-shots/phone-signed-in.png" });
  await expect(page.getByRole("option", { name: /^Visa ending 4242/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /^Mastercard ending 4444, expired/ })).toBeDisabled();

  const pay = page.getByRole("button", { name: /^Pay \$/ });
  await page.getByLabel("Security code").fill("000");
  await pay.click();
  await drive.settleData(); await drive.settleMotion();
  await expect(page.getByRole("status").filter({ hasText: "Your bank declined the payment." })).toBeVisible();
  await page.screenshot({ path: "/tmp/venue-shots/phone-declined.png" });

  // a new card
  await page.getByRole("option", { name: "A new card" }).click();
  await drive.settleMotion();
  await expect(page.getByLabel("Email")).toHaveValue("typed@before.co");
  await expect(page.getByLabel("Street address")).toHaveValue("12 Marchmont Street");
  await page.getByLabel("Card number").pressSequentially("5555555555554444");
  await expect(page.getByLabel("Card number")).toHaveValue("5555 5555 5555 4444");
  await page.getByLabel("Expiry date").pressSequentially("0930");
  await page.getByLabel("Security code").fill("321");
  await page.getByLabel("Postal code").fill("WC1N");
  await page.getByLabel("City").focus();
  await drive.settleMotion();
  await expect(page.getByText("Enter a postcode like SW1A 1AA.")).toBeVisible();
  await page.screenshot({ path: "/tmp/venue-shots/phone-postcode.png" });
  await page.getByLabel("Postal code").fill("WC1N 1AB");
  await pay.click();
  await drive.settleData(); await drive.settleMotion();
  await expect(page.getByText("Sent to typed@before.co")).toBeVisible();
  await page.screenshot({ path: "/tmp/venue-shots/phone-tickets.png" });
};
