// A seat taken between choosing it and paying (the stream silenced, so only
// the service can say): nothing is charged, the seat leaves the choice, the
// rest stays, and the person is back in the hall with the service's sentence.
const API = "http://127.0.0.1:8350";
export default async ({ page, expect }) => {
  await page.evaluateOnNewDocument(() => {
    const real = window.fetch;
    window.fetch = (u, o) => String(u).includes("/api/events") ? new Promise(() => {}) : real(u, o);
    window.EventSource = class { constructor() { this.readyState = 0; } addEventListener() {} removeEventListener() {} close() {} };
  });
  await page.reload();
  await page.getByRole("button", { name: "Sun 15 Nov, 2:00pm" }).click();
  const seats = page.getByRole("button", { name: /^Balcony, row/ });
  await expect(seats.first()).toBeVisible();
  const picked = [];
  for (const s of await seats.all()) {
    if (picked.length == 2) break;
    if (await s.isEnabled()) { await s.click(); picked.push(await s.getAttribute("aria-label")); }
  }
  await expect(page.getByText("2 seats · $70.00")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Email").fill("c@example.com");
  await page.getByLabel("Name on card").fill("C Test");
  await page.getByLabel("Card number").pressSequentially("4242424242424242");
  await page.getByLabel("Expiry").pressSequentially("0130");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Street address").fill("1 Main St");
  await page.getByLabel("City").fill("Austin");
  await page.getByLabel("Postal code").fill("78701");
  // someone else buys the second
  const m = /, row (\w+), seat (\d+)$/.exec(picked[1]);
  const id = "BALC-" + m[1] + "-" + m[2];
  await page.evaluate(async ([api, id]) => {
    await fetch(api + "/api/orders", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ performanceId: "p03", seatIds: [id], email: "x@example.com",
        payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "X" },
          billing: { line1: "1 St", line2: null, city: "Town", postalCode: "94103", country: "US" } } }) });
  }, [API, id]);
  await page.getByRole("button", { name: "Pay $78.00" }).click();
  await expect(page.getByText("1 seat · $35.00")).toBeVisible();
  await expect(page.getByRole("button", { name: picked[1] })).toBeDisabled();
  await expect(page.getByRole("button", { name: picked[0] })).toHaveAttribute("aria-pressed", "true");
  console.log("notice:", await page.evaluate(() => document.body.innerText.match(/[^\n]*(taken|longer|available)[^\n]*/gi)));
  // what was typed is still there
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("Card number")).toHaveValue("4242 4242 4242 4242");
  await page.getByRole("button", { name: "Pay $39.00" }).click();
  await expect(page.getByText("Sent to c@example.com")).toBeVisible();
};
