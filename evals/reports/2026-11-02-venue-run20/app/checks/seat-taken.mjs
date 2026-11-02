// Someone else buys a seat this person has chosen: it leaves their choice and they are told which.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 27 Nov, 7:30pm/ }).click();
  await drive.settleData();
  const free = page.locator('[aria-pressed="false"]:not([aria-disabled="true"])');
  const names = await free.evaluateAll((els) => els.slice(0, 2).map((e) => e.getAttribute("aria-label")));
  for (const n of names) await page.getByRole("button", { name: n, exact: true }).click();
  const [sec, row, seat] = names[0].split(", ");
  const key = { "Orchestra": "ORCH", "Grand Tier": "GT", "Dress Circle": "DC", "Balcony": "BALC" }[sec];
  const id = key + "-" + row.slice(4) + "-" + seat.slice(5);
  // another buyer, elsewhere
  await page.evaluate(async (id) => {
    await fetch("http://127.0.0.1:8350/api/orders", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ performanceId: "p09", seatIds: [id], email: "other@example.com",
        payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "Other" },
          billing: { line1: "1 A St", line2: null, city: "X", postalCode: "94103", country: "US" } } }) });
  }, id);
  await drive.waitReal(2500);
  await drive.settleData();
  await expect(page.getByText(names[0] + " was just taken by someone else.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: names[0], exact: true })).toBeDisabled();
  await expect(page.getByText(/^1 seat · \$\d+\.00$/)).toBeVisible();
  await page.screenshot({ path: "/tmp/vshots/taken.png" });
};
