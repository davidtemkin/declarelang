// The brief's §10 phone journey, against the live service on :8350.
// Seats are picked from what is free when it runs, since the service remembers
// what earlier runs bought.
export const device = { width: 390, height: 844, touch: true };

const API = "http://127.0.0.1:8350";

export default async ({ drive, expect, page }) => {
  // SHOTS=/some/dir/ keeps a picture of each step
  const shot = async (name) => { if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + name + ".png" }); };
  // start signed out
  await page.evaluate((api) => fetch(api + "/api/session", { method: "DELETE", credentials: "include" }), API);
  await page.reload();
  await drive.settleData();

  // Friday's performance
  await page.getByRole("button", { name: /^Fri 20 Nov/ }).click();
  await drive.settleData();
  await expect(page.getByText("Fri 20 Nov · 7:30pm")).toBeVisible();

  // what is free now: two in the Orchestra, one in the Grand Tier, and one more for someone else to take
  const map = await page.evaluate((api) => fetch(api + "/api/performances/p05/seats").then((r) => r.json()), API);
  const free = (key) => map.sections.find((s) => s.key == key).rows.flatMap((r) =>
    r.seats.filter((x) => x.status == "available").map((x) => ({ id: x.id, name: `${map.sections.find((s) => s.key == key).name}, row ${r.name}, seat ${x.number}` })));
  const orch = free("ORCH"), gt = free("GT");
  const [a, b, victim] = [orch[0], orch[1], gt[0]];
  const spare = gt[1];

  for (const s of [a, b, victim]) {
    const seat = page.getByRole("button", { name: s.name, exact: true });
    await seat.click();
    await expect(seat).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.getByText(/^3 seats · \$/)).toBeVisible();
  await shot("p1-hall-chosen");

  // someone else buys the Grand Tier seat while this person decides
  const other = await page.evaluate(([api, id]) => fetch(api + "/api/orders", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ performanceId: "p05", seatIds: [id], email: "someone@example.com",
      payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "Someone Else" },
        billing: { line1: "1 Main St", line2: null, city: "Springfield", postalCode: "94103", country: "US" } } }) }).then((r) => r.status), [API, victim.id]);
  expect(other).toBe(201);
  await drive.waitReal(1500);
  await expect(page.getByText(`${victim.name} was just taken by someone else`)).toBeVisible();
  await expect(page.getByRole("button", { name: victim.name, exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText(/^2 seats · \$160\.00$/)).toBeVisible();
  await shot("p2-seat-taken");

  // they choose another
  await page.getByRole("button", { name: spare.name, exact: true }).click();
  await expect(page.getByText(/^3 seats · \$225\.00$/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();

  // something typed before signing in survives it
  await page.getByLabel("Name on card").fill("Typed Before");

  // sign in halfway through paying
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await drive.settleMotion();
  const dialog = page.getByRole("dialog", { name: "Sign in" });
  await dialog.getByLabel("Email").fill("ada@example.com");
  await dialog.getByLabel("Password").fill("wrong one");
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await expect(dialog.getByText("That email and password don't match.")).toBeVisible();
  await shot("p3-signin-wrong");
  await dialog.getByLabel("Password").fill("correct horse battery");
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByText("Signed in as Ada Lovelace")).toBeVisible();
  await expect(page.getByText(/^3 seats · \$225\.00$/)).toBeHidden();      // still at checkout, nothing lost:
  await expect(page.getByRole("button", { name: "Pay $245.00" })).toBeVisible();

  // their Visa is offered beside an expired card they can't choose
  const visa = page.getByRole("option", { name: /^Visa ending 4242/ });
  const expired = page.getByRole("option", { name: /^Mastercard ending 4444, Expired 08\/26/ });
  await expect(visa).toBeVisible();
  await expect(expired).toBeDisabled();
  await expect(visa).toHaveAttribute("aria-selected", "true");
  await shot("p4-saved-cards");

  // code 000 is declined by the bank
  await page.getByLabel("Security code").fill("000");
  await page.getByRole("button", { name: "Pay $245.00" }).click();
  await drive.settleData();
  await expect(page.getByText(/declined/i)).toBeVisible();
  await expect(page.getByLabel("Security code")).toHaveValue("");
  await shot("p5-declined");

  // switch to a new card
  await page.getByRole("option", { name: /^A new card/ }).click();
  await drive.settleMotion();
  await expect(page.getByLabel("Email")).toHaveValue("ada@example.com");
  await expect(page.getByLabel("Name on card")).toHaveValue("Typed Before");
  await page.getByLabel("Card number").pressSequentially("4242424242424242");
  await expect(page.getByLabel("Card number")).toHaveValue("4242 4242 4242 4242");
  await page.getByLabel("Expiry date").pressSequentially("1230");
  await expect(page.getByLabel("Expiry date")).toHaveValue("12 / 30");
  await page.getByLabel("Security code").fill("123");
  await expect(page.getByLabel("Street address")).toHaveValue("12 Marchmont Street");

  // the postcode, mistyped, said when they move on
  await page.getByLabel("Postal code").fill("WC1N");
  await expect(page.getByText("A UK postcode looks like SW1A 2AA.")).toBeHidden();
  await page.getByLabel("Postal code").press("Tab");
  await expect(page.getByText("A UK postcode looks like SW1A 2AA.")).toBeVisible();
  await shot("p6-postcode");
  await page.getByLabel("Postal code").fill("WC1N 1AB");
  await expect(page.getByText("A UK postcode looks like SW1A 2AA.")).toBeHidden();

  await page.getByRole("button", { name: "Pay $245.00" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByText("Sent to ada@example.com")).toBeVisible();
  await expect(page.getByText("Ticket 1 of 3", { exact: true })).toBeVisible();
  await shot("p7-tickets");
  await expect.request("POST", "/api/orders", { count: 3 });
};
