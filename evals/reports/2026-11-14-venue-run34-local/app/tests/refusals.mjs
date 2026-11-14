// At a desk: what the form catches itself never reaches the service; each
// refusal the service gives lands where the brief says — on its field (with
// focus taken there), beside the Pay button, or back in the hall with the lost
// seat gone and the rest of the choice intact.

const API = "http://127.0.0.1:8350";

const freeSeats = (page, perf) => page.evaluate(async ([api, perf]) => {
  const d = await (await fetch(api + "/api/performances/" + perf + "/seats")).json();
  const free = [], sold = [];
  for (const s of d.sections) for (const r of s.rows) for (const x of r.seats) (x.status == "available" ? free : sold).push(x.id);
  return { free, sold };
}, [API, perf]);

export default async ({ drive, expect, page }) => {
  if (await page.getByRole("button", { name: "Sign out" }).isVisible()) {
    await page.getByRole("button", { name: "Sign out" }).click();
    await drive.settleData();
  }
  await page.getByRole("button", { name: /^Sat 5 Dec, 7:30pm/ }).click();
  await drive.settleData();
  await drive.settleMotion();

  // two free seats, chosen by clicking them in the hall
  const { free, sold } = await freeSeats(page, "p14");
  const label = (id) => {
    const [k, r, n] = id.split("-");
    return ({ ORCH: "Orchestra", GT: "Grand Tier", DC: "Dress Circle", BALC: "Balcony" })[k] + ", row " + r + ", seat " + n;
  };
  const a = free[free.length - 1], b = free[free.length - 2];
  await page.getByRole("button", { name: label(a), exact: true }).click();
  await page.getByRole("button", { name: label(b), exact: true }).click();
  await page.getByRole("button", { name: label(b), exact: true }).click();   // unchosen the same way
  await page.getByRole("button", { name: label(b), exact: true }).click();
  await drive.settleMotion();
  await expect(page.getByText(/^2 seats · \$\d+\.\d\d$/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();

  // what is required is said on submit, all at once, with focus on the first
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await drive.settleMotion();
  await expect(page.getByText("Enter the email address to send your tickets to.")).toBeVisible();
  await expect(page.getByText("Enter the card number.")).toBeVisible();
  await expect(page.getByText("Choose the country of your billing address.")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeFocused();
  if (process.env.VENUE_SHOTS) await page.screenshot({ path: process.env.VENUE_SHOTS + "/r-required.png" });

  // local checks, each said once the field is left
  await page.getByLabel("Email").fill("refusals@example.com");
  await page.getByLabel("Card number").fill("4242424242424241");
  await page.getByLabel("Expiry").fill("13/29");
  await page.getByLabel("Security code").fill("12");
  await page.getByLabel("Name on card").focus();
  await drive.settleMotion();
  await expect(page.getByText("That isn't a valid card number. Check the digits.")).toBeVisible();
  await expect(page.getByText("There's no month 13. Use 01 to 12.")).toBeVisible();
  await expect(page.getByText("The security code is 3 digits.")).toBeVisible();
  await page.getByLabel("Expiry").fill("01/24");
  await page.getByLabel("Name on card").focus();
  await expect(page.getByText("That date has passed. Check the card, or use another.")).toBeVisible();
  // an American Express number is grouped 4-6-5 and takes four digits
  await page.getByLabel("Card number").fill("");
  await page.getByLabel("Card number").pressSequentially("378282246310005");
  await expect(page.getByLabel("Card number")).toHaveValue("3782 822463 10005");
  await page.getByLabel("Security code").focus();
  await page.getByLabel("Name on card").focus();
  await expect(page.getByText("The security code is 4 digits.")).toBeVisible();
  await expect.request("POST", "/api/orders", { count: 0 });

  // the service: the security code doesn't match — marked on that field, focus taken there
  await page.getByLabel("Card number").fill("4000 0000 0000 0127");
  await page.getByLabel("Expiry").fill("04 / 29");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Name on card").fill("Ref Usal");
  await page.getByRole("radio", { name: "United States" }).click();
  await page.getByLabel("Street address").fill("1 Main St");
  await page.getByLabel("City").fill("Springfield");
  await page.getByLabel("Postal code").fill("62701");
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByLabel("Security code")).toBeFocused();
  const cvcSays = await page.evaluate(() => document.activeElement.getAttribute("aria-describedby")
    && document.getElementById(document.activeElement.getAttribute("aria-describedby").split(" ")[0])?.textContent);
  console.log("cvc refusal:", cvcSays);
  if (process.env.VENUE_SHOTS) await page.screenshot({ path: process.env.VENUE_SHOTS + "/r-cvc.png" });

  // the postal code the bank doesn't hold — marked on that field
  await page.getByLabel("Card number").fill("4242 4242 4242 4242");
  await page.getByLabel("Postal code").fill("10001");
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByLabel("Postal code")).toBeFocused();
  await expect(page.getByLabel("Postal code")).toHaveAttribute("aria-invalid", "true");

  // insufficient funds: the sentence beside the Pay button; only the code is emptied
  await page.getByLabel("Card number").fill("4000 0000 0000 9995");
  await page.getByLabel("Postal code").fill("62701");
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await drive.settleData();
  await drive.settleMotion();
  const funds = page.getByRole("status").filter({ hasText: /funds/i });
  await expect(funds).toBeVisible();
  console.log("funds says:", await funds.innerText());
  if (process.env.VENUE_SHOTS) await page.screenshot({ path: process.env.VENUE_SHOTS + "/r-funds.png" });
  await expect(page.getByLabel("Security code")).toHaveValue("");
  await expect(page.getByLabel("Card number")).toHaveValue("4000 0000 0000 9995");
  await expect(page.getByLabel("City")).toHaveValue("Springfield");

  // a seat taken before the payment went through: nothing charged, back in the
  // hall with the rest of the choice
  const gone = sold[0];
  await drive.set("app", "chosen", [a, b, gone]);
  await page.getByLabel("Card number").fill("4242 4242 4242 4242");
  await page.getByLabel("Security code").fill("123");
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole("heading", { name: "Sat 5 Dec · 7:30pm" })).toBeVisible();
  await expect(page.getByText(/^2 seats · \$\d+\.\d\d$/)).toBeVisible();
  const toast = await page.evaluate(() => document.body.innerText.match(/.*(taken|available|sold).*/i)?.[0]);
  console.log("409 says:", toast);
  if (process.env.VENUE_SHOTS) await page.screenshot({ path: process.env.VENUE_SHOTS + "/r-409.png" });
  await expect(page.getByRole("button", { name: label(a), exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.request("POST", "/api/orders", { count: 4 });
};
