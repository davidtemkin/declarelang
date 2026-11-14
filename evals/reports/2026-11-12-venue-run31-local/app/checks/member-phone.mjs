// §10 on a phone: three seats across two sections, one taken by someone else
// while deciding, sign in at checkout, a declined saved card, then a new card
// with a postcode mistyped and fixed.
export const device = { width: 390, height: 844, touch: true };

const API = "http://127.0.0.1:8350";
const dollars = (c) => `$${(c / 100).toFixed(2)}`;

async function free(perf, sectionKey, n) {
  const map = await (await fetch(`${API}/api/performances/${perf}/seats`)).json();
  const s = map.sections.find((x) => x.key == sectionKey);
  const out = [];
  for (const r of s.rows) for (const x of r.seats)
    if (x.status == "available" && out.length < n)
      out.push({ id: x.id, name: `${s.name}, row ${r.name}, seat ${x.number}`, price: s.priceCents, fee: s.feeCents });
  return out;
}

// Someone else buys a seat, as another customer would.
async function buyElsewhere(perf, id) {
  await fetch(`${API}/api/orders`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ performanceId: perf, seatIds: [id], email: "other@example.com",
      payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "Other" },
        billing: { line1: "1 Road", line2: null, city: "Town", postalCode: "94110", country: "US" } } })
  });
}

// A person scrolls a seat up from under the summary bar before tapping it.
async function tapSeat(page, name) {
  const seat = page.getByRole("checkbox", { name, exact: true });
  await seat.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await seat.click();
}

const shot = (page, name) => page.screenshot({ path: `/tmp/venue-${name}.png` });

export default async ({ drive, expect, page }) => {
  const perf = "p01";
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 13 Nov, 7:30pm/ }).click();
  await drive.settleData();

  const orch = await free(perf, "ORCH", 3);
  const tier = await free(perf, "GT", 1);
  await tapSeat(page, orch[0].name);
  await tapSeat(page, orch[1].name);
  await page.getByRole("button", { name: /^Grand Tier/ }).click();
  await drive.settleMotion();
  await tapSeat(page, tier[0].name);
  await expect(page.getByText(`3 seats · ${dollars(orch[0].price * 2 + tier[0].price)}`)).toBeVisible();
  await shot(page, "phone-chosen");

  // One of them goes while they decide.
  await buyElsewhere(perf, orch[1].id);
  await drive.waitReal(1500);
  await expect(page.getByText(`${orch[1].name} has just been taken by someone else.`).first()).toBeVisible();
  await expect(page.getByText(`2 seats · ${dollars(orch[0].price + tier[0].price)}`)).toBeVisible();
  await page.getByRole("button", { name: /^Orchestra/ }).click();
  await drive.settleMotion();
  await tapSeat(page, orch[2].name);
  const seats = [orch[0], orch[2], tier[0]];
  await expect(page.getByText(`3 seats · ${dollars(seats.reduce((m, s) => m + s.price, 0))}`)).toBeVisible();

  await page.getByRole("button", { name: "Checkout", exact: true }).click();
  await drive.settleMotion();

  // Sign in, wrongly and then rightly.
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await drive.settleMotion();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Email").fill("ada@example.com");
  await sheet.getByLabel("Password").fill("wrong");
  await sheet.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await expect(page.getByText("That email and password don't match.")).toBeVisible();
  await shot(page, "phone-signin-error");
  await sheet.getByLabel("Password").fill("correct horse battery");
  await sheet.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByText("Signed in as Ada Lovelace · ada@example.com")).toBeVisible();

  // The saved cards: the Visa offered, the expired Mastercard not.
  await expect(page.getByRole("radio", { name: "Visa ending 4242, expires 04/28" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Mastercard ending 4444, expired 08/26" })).toBeDisabled();
  await shot(page, "phone-saved-cards");

  const grand = seats.reduce((m, s) => m + s.price + s.fee, 0);
  const pay = page.getByRole("button", { name: `Pay ${dollars(grand)}` });
  await page.getByLabel("Security code").fill("000");
  await pay.click();
  await drive.settleData();
  await expect(page.getByText(/declined/i).first()).toBeVisible();
  await expect(page.getByLabel("Security code")).toHaveValue("");
  await shot(page, "phone-declined");

  // A new card instead; the billing address is the account's.
  await page.getByRole("radio", { name: "A new card" }).click();
  await expect(page.getByLabel("Email")).toHaveValue("ada@example.com");
  await expect(page.getByLabel("Name on card")).toHaveValue("Ada Lovelace");
  await page.getByLabel("Card number").pressSequentially("5555555555554444");
  await expect(page.getByLabel("Card number")).toHaveValue("5555 5555 5555 4444");
  await page.getByLabel("Expiry").pressSequentially("1129");
  await page.getByLabel("Security code").fill("321");
  await page.getByLabel("Postal code").fill("WC1N");
  await page.getByLabel("Street address").focus();
  await expect(page.getByText("Enter a postcode like SW1A 2AA.")).toBeVisible();
  await shot(page, "phone-postcode");
  await page.getByLabel("Postal code").fill("WC1N 1AB");
  await pay.click();
  await drive.settleData();
  await expect(page.getByText("Sent to ada@example.com")).toBeVisible();
  await expect(page.getByText("Ticket 1 of 3", { exact: true })).toBeVisible();
  await drive.settleMotion();
  await shot(page, "phone-tickets");
};
