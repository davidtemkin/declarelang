// The brief's phone story (§10): three seats across two sections by thumb; one
// is taken by someone else while they decide; sign in at checkout without
// losing anything; the saved Visa beside an expired card; declined; a new
// card, grouped as typed; a mistyped postcode caught on leaving; paid; three
// tickets, one at a time.
export const device = { width: 390, height: 844, touch: true };
const API = "http://127.0.0.1:8350";

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 13 Nov/ }).click();
  await drive.settleData();
  await drive.settleMotion();

  const seats = await page.evaluate(async (api) => {
    const map = await (await fetch(`${api}/api/performances/p01/seats`)).json();
    const pick = (s, n) => {
      const r = s.rows.find((r) => r.seats.filter((x) => x.status === "available").length >= n);
      return r.seats.filter((x) => x.status === "available").slice(0, n).map((x) => ({ id: x.id, name: `${s.name}, row ${r.name}, seat ${x.number}` }));
    };
    return [...pick(map.sections[0], 2), ...pick(map.sections[1], 3)];
  }, API);
  const [o1, o2, g1, g2] = seats;
  for (const s of [o1, o2, g1]) await page.getByRole("button", { name: s.name, exact: true }).click();
  await drive.settleMotion();
  await expect(page.getByText(/^3 seats · \$225\.00$/)).toBeVisible();

  // Someone else buys g1 while they decide.
  await page.evaluate(async ([api, id]) => {
    await fetch(`${api}/api/orders`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ performanceId: "p01", seatIds: [id], email: "other@example.com",
        payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "Other" },
          billing: { line1: "1 St", line2: null, city: "X", postalCode: "12345", country: "US" } } }) });
  }, [API, g1.id]);
  await drive.waitReal(1500);
  await drive.settleMotion();
  await expect(page.getByText(`${g1.name} was just taken by someone else. Choose another.`)).toBeVisible();
  await expect(page.getByRole("button", { name: g1.name, exact: true })).toBeDisabled();
  await expect(page.getByText(/^2 seats · \$160\.00$/)).toBeVisible();
  await page.getByRole("button", { name: g2.name, exact: true }).click();
  await expect(page.getByText(/^3 seats · \$225\.00$/)).toBeVisible();

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await drive.settleMotion();
  await page.getByLabel("Email").fill("typed-before@example.com");

  // Sign in halfway through.
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await drive.settleMotion();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill("ada@example.com");
  await dialog.getByLabel("Password").fill("wrong");
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await expect(page.getByText("That email and password don't match.")).toBeVisible();
  await dialog.getByLabel("Password").fill("correct horse battery");
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByText("Signed in as Ada Lovelace.")).toBeVisible();
  await page.screenshot({ path: "/tmp/venue-shots/story-signed-in.png" });

  const visa = page.getByRole("radio", { name: /Visa ending 4242/ });
  const mc = page.getByRole("radio", { name: /Mastercard ending 4444/ });
  await expect(visa).toBeChecked();
  await expect(mc).toBeDisabled();
  await page.getByLabel("Security code").fill("000");
  await page.getByRole("button", { name: "Pay $245.00" }).click();
  await drive.settleData();
  await drive.wait(2000);
  await drive.settleData();
  await expect(page.getByText(/declined/i)).toBeVisible();
  await page.screenshot({ path: "/tmp/venue-shots/story-declined.png" });

  // Another card: a new one.
  await page.getByRole("radio", { name: "A new card" }).click();
  await expect(page.getByLabel("Email")).toHaveValue("typed-before@example.com");
  await expect(page.getByLabel("Name on card")).toHaveValue("Ada Lovelace");
  await page.getByLabel("Card number").pressSequentially("5555555555554444");
  await expect(page.getByLabel("Card number")).toHaveValue("5555 5555 5555 4444");
  await expect(page.getByText("Mastercard", { exact: true })).toBeVisible();
  await page.getByLabel("Expiry").pressSequentially("1129");
  await expect(page.getByLabel("Expiry")).toHaveValue("11 / 29");
  await page.getByLabel("Security code").fill("321");
  await page.getByLabel("Postal code").fill("WC1N1A");
  await page.getByLabel("City").focus();
  await expect(page.getByText("Enter a postcode like SW1A 2AA.")).toBeVisible();
  await page.screenshot({ path: "/tmp/venue-shots/story-postcode.png" });
  await page.getByLabel("Postal code").fill("WC1N 1AB");
  await page.getByRole("button", { name: "Pay $245.00" }).click();
  await drive.settleData();
  await drive.wait(2000);
  await drive.settleData();
  await expect(page.getByText("Sent to typed-before@example.com")).toBeVisible();
  await expect(page.getByText("Ticket 1 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Next ticket" }).click();
  await expect(page.getByText("Ticket 2 of 3")).toBeVisible();
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/venue-shots/story-ticket2.png" });
};
