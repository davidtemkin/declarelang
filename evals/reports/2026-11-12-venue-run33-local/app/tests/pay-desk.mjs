// Desk, no account: two seats, a declined card, a postcode caught on leaving
// the field, then a good card and the tickets. Runs against the live service.
async function freeSeats(page, section, n) {
  const out = [];
  for (const b of await page.getByRole("button", { name: new RegExp("^" + section + ", row ") }).all()) {
    if (out.length >= n) break;
    if (await b.isEnabled() && (await b.getAttribute("aria-pressed")) !== "true") out.push(b);
  }
  return out;
}
export default async ({ drive, expect, page }) => {
  await page.getByRole("button", { name: /^Sat 14 Nov/ }).click();
  await drive.settleData();
  const [a] = await freeSeats(page, "Orchestra", 1);
  const [b] = await freeSeats(page, "Grand Tier", 1);
  await a.click(); await b.click();
  await expect(page.getByText("2 seats · $145.00")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();

  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Name on card").fill("Ada Lovelace");
  await page.getByLabel("Card number").pressSequentially("4000000000000002");
  await expect(page.getByLabel("Card number")).toHaveValue("4000 0000 0000 0002");
  await page.getByLabel("Expiry date").pressSequentially("1229");
  await expect(page.getByLabel("Expiry date")).toHaveValue("12 / 29");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Street address").fill("1 Main St");
  await page.getByLabel("City").fill("Springfield");
  await page.getByRole("combobox", { name: "Country" }).fill("United States");
  await page.getByLabel("Postal code").fill("1234");
  await page.getByLabel("City").focus();      // leave the postal field
  await drive.settleMotion();
  await expect(page.getByText("Enter a 5-digit ZIP code, like 94103.")).toBeVisible();
  await page.getByLabel("Postal code").fill("94103");
  await page.screenshot({ path: "/tmp/venue-shots/pay-filled.png" });

  await page.getByRole("button", { name: "Pay $158.00" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/venue-shots/pay-declined.png" });
  await expect(page.getByRole("status").filter({ hasText: "Your bank declined the payment." })).toBeVisible();
  await expect.request("POST", "/api/orders", { count: 1 });
  await expect(page.getByLabel("Security code")).toHaveValue("");
  await expect(page.getByLabel("Card number")).toHaveValue("4000 0000 0000 0002");

  await page.getByLabel("Card number").fill("4242424242424242");
  await page.getByLabel("Security code").fill("123");
  await page.getByRole("button", { name: "Pay $158.00" }).click({ clickCount: 2 });   // a double press sends once
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/orders", { count: 2 });
  await expect(page.getByText("Sent to ada@example.com")).toBeVisible();
  await page.screenshot({ path: "/tmp/venue-shots/tickets.png" });
};
