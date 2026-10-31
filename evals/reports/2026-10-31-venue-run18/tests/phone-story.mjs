// The brief's phone story, §10: Friday, three seats across two sections by thumb,
// one taken by someone else meanwhile, sign in at checkout, the saved Visa declined,
// a new card, a mistyped postcode, and three tickets.
// npx declare-verify my-apps/venue/venue.declare --assert my-apps/venue/checks/phone-story.mjs

export const device = { width: 390, height: 844, touch: true };

const API = "http://127.0.0.1:8350";
const free = (page, section) =>
  page.locator(`[aria-label^="${section}, row"][aria-pressed="false"]:not([aria-disabled="true"])`);

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /Fri 13 Nov/ }).click();
  await drive.settleData();

  const names = [
    await free(page, "Orchestra").nth(0).getAttribute("aria-label"),
    await free(page, "Orchestra").nth(1).getAttribute("aria-label"),
    await free(page, "Grand Tier").nth(2).getAttribute("aria-label"),
  ];
  for (const n of names) await page.getByRole("button", { name: n, exact: true }).click();
  await expect(page.getByText(/^3 seats · \$/)).toBeVisible();

  // someone else buys the first while this person decides
  const lostId = await page.evaluate(async (label) => {
    const [sec, row, seat] = label.split(", ");
    const key = { Orchestra: "ORCH", "Grand Tier": "GT" }[sec];
    const id = `${key}-${row.replace("row ", "")}-${seat.replace("seat ", "")}`;
    await fetch("http://127.0.0.1:8350/api/orders", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ performanceId: "p01", seatIds: [id], email: "rival@example.com",
        payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2028, cvc: "123", name: "R" },
          billing: { line1: "1 A St", line2: null, city: "Boston", postalCode: "02110", country: "US" } } }) });
    return id;
  }, names[0]);
  await drive.waitReal(1500);
  await drive.settleMotion();
  await expect(page.getByText(`${names[0]} was just taken by someone else. Choose another seat.`)).toBeVisible();
  await expect(page.getByText(/^2 seats · \$/)).toBeVisible();
  await expect(page.getByRole("button", { name: names[0], exact: true })).toHaveAttribute("aria-disabled", "true");

  // another seat instead
  const another = await free(page, "Orchestra").nth(2).getAttribute("aria-label");
  await page.getByRole("button", { name: another, exact: true }).click();
  await expect(page.getByText(/^3 seats · \$/)).toBeVisible();

  await page.getByRole("button", { name: "Continue to payment" }).click();
  await drive.settleMotion();

  // type a little, then sign in: nothing typed is lost
  await page.getByLabel("Name on card").fill("A. Lovelace");
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleMotion();
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("dialog").getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await expect(page.getByText("That email and password don't match.")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByRole("dialog").getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await drive.settleMotion();

  await expect(page.getByRole("radio", { name: /Visa ending 4242/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /Mastercard ending 4444/ })).toBeDisabled();
  await expect(page.getByText("Expired 08/26")).toBeVisible();

  // the saved Visa, declined
  const pay = page.getByRole("button", { name: /^Pay \$/ });
  await page.getByLabel("Security code").fill("000");
  await pay.click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByText("declined", { exact: false })).toBeVisible();

  // a new card: what was typed before signing in is still there
  await page.getByRole("radio", { name: "A new card" }).click();
  await expect(page.getByLabel("Name on card")).toHaveValue("A. Lovelace");
  await expect(page.getByLabel("Email for your tickets")).toHaveValue("ada@example.com");
  await expect(page.getByLabel("Street address")).toHaveValue("12 Marchmont Street");
  await page.getByLabel("Card number").pressSequentially("4242424242424242");
  await expect(page.getByLabel("Card number")).toHaveValue("4242 4242 4242 4242");
  await page.getByLabel("Expiry (MM / YY)").pressSequentially("1230");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Postcode").fill("WC1N 1A");
  await drive.key("Tab");
  await expect(page.getByText("Enter a postcode like SW1A 2AA.")).toBeVisible();
  await page.getByLabel("Postcode").fill("WC1N 1AB");
  await pay.click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByText("Sent to ada@example.com")).toBeVisible();
  await expect(page.getByText("Ticket 1 of 3")).toBeVisible();
  void lostId;
};
