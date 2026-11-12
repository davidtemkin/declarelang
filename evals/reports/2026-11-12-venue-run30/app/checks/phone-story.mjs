// The brief's §10, on a phone: seats in two sections, one taken by someone
// else while deciding; sign in at checkout; a declined saved card; a new card
// with a wrong postcode caught on leaving; tickets.
export const device = { width: 390, height: 844, touch: true };

const API = "http://127.0.0.1:8350";

export default async ({ page, expect }) => {
  // make sure we start signed out
  await page.evaluate((api) => fetch(api + "/api/session", { method: "DELETE", credentials: "include" }), API);
  await page.reload();

  await page.getByRole("button", { name: "Fri 13 Nov, 7:30pm" }).click();
  const free = async (prefix, n) => {
    const out = [];
    for (const s of await page.getByRole("button", { name: new RegExp("^" + prefix + ", row") }).all()) {
      if (out.length == n) break;
      if (await s.isEnabled() && (await s.getAttribute("aria-pressed")) != "true") out.push(s);
    }
    return out;
  };
  const orch = await free("Orchestra", 3);
  const gt = await free("Grand Tier", 1);
  await orch[0].click(); await orch[1].click(); await gt[0].click();
  await expect(page.getByText("3 seats · $225.00")).toBeVisible();

  // someone else buys one of them
  const taken = await orch[1].getAttribute("aria-label");
  const m = /^(.*), row (\w+), seat (\d+)$/.exec(taken);
  const id = (m[1] == "Orchestra" ? "ORCH" : "GT") + "-" + m[2] + "-" + m[3];
  await page.evaluate(async ([api, id]) => {
    await fetch(api + "/api/orders", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ performanceId: "p01", seatIds: [id], email: "x@example.com",
        payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "X" },
          billing: { line1: "1 St", line2: null, city: "Town", postalCode: "94103", country: "US" } } }) });
  }, [API, id]);
  await expect(page.getByText(taken + " has just been taken by someone else, so it has left your choice.")).toBeVisible();
  await expect(page.getByText("2 seats · $145.00")).toBeVisible();
  await expect(orch[1]).toBeDisabled();
  await orch[2].click();
  await expect(page.getByText("3 seats · $225.00")).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Email").fill("someone@example.com");

  // sign in halfway
  await page.getByRole("button", { name: "Sign in" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Email").fill("ada@example.com");
  await dlg.getByLabel("Password").fill("wrong");
  await dlg.getByRole("button", { name: "Sign in" }).click();
  await expect(dlg.getByText("That email and password don't match.")).toBeVisible();
  await dlg.getByLabel("Password").fill("correct horse battery");
  await dlg.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByText("3 seats at $225.00, plus $20.00 in booking fees.")).toBeVisible();

  await expect(page.getByRole("radio", { name: "Visa ending 4242" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Mastercard ending 4444, expired" })).toBeDisabled();
  await page.getByLabel("Security code").fill("000");
  await page.getByRole("button", { name: "Pay $245.00" }).click();
  await expect(page.getByText(/declined/i)).toBeVisible();
  await expect(page.getByLabel("Security code")).toHaveValue("");

  await page.getByRole("radio", { name: "A new card" }).click();
  await expect(page.getByLabel("Email")).toHaveValue("someone@example.com");
  await expect(page.getByLabel("Name on card")).toHaveValue("Ada Lovelace");
  await page.getByLabel("Card number").pressSequentially("5555555555554444");
  await expect(page.getByLabel("Card number")).toHaveValue("5555 5555 5555 4444");
  await page.getByLabel("Expiry").pressSequentially("0429");
  await page.getByLabel("Security code").fill("321");
  await expect(page.getByLabel("Street address")).toHaveValue("12 Marchmont Street");
  await page.getByLabel("Postal code").fill("WC1N");
  await page.getByLabel("City").focus();
  await expect(page.getByText("Enter a postcode like SW1A 1AA.")).toBeVisible();
  await page.getByLabel("Postal code").fill("WC1N 1AB");
  await page.getByRole("button", { name: "Pay $245.00" }).click();
  await expect(page.getByText("Sent to someone@example.com")).toBeVisible();
  await expect(page.getByText("1 of 3")).toBeVisible();
};
