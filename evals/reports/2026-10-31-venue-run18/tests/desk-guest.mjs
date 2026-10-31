// A guest at a desk: two seats, a new card, a mistyped postcode, a decline, then paid.
// npx declare-verify my-apps/venue/venue.declare --assert my-apps/venue/checks/desk-guest.mjs
// (The service is live: seats bought here stay sold. The script takes whatever is free.)

const freeSeat = (page, section) =>
  page.locator(`[aria-label^="${section}, row"][aria-pressed="false"]:not([aria-disabled="true"])`);

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /Sun 22 Nov/ }).click();
  await drive.settleData();

  const a = await freeSeat(page, "Dress Circle").nth(3).getAttribute("aria-label");
  const b = await freeSeat(page, "Dress Circle").nth(4).getAttribute("aria-label");
  await page.getByRole("button", { name: a, exact: true }).click();
  await page.getByRole("button", { name: b, exact: true }).click();
  await expect(page.getByRole("button", { name: a, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("2 seats · $100.00")).toBeVisible();

  await page.getByRole("button", { name: "Continue to payment" }).click();
  await drive.settleMotion();
  await expect(page.getByRole("button", { name: "Pay $110.00" })).toBeVisible();

  // the card number groups itself and says its kind
  await page.getByLabel("Card number").pressSequentially("4000000000000002");
  await expect(page.getByLabel("Card number")).toHaveValue("4000 0000 0000 0002");
  await expect(page.getByText("Visa", { exact: true })).toBeVisible();

  await page.getByLabel("Email for your tickets").fill("guest@example.com");
  await page.getByLabel("Name on card").fill("Grace Hopper");
  await page.getByLabel("Expiry (MM / YY)").pressSequentially("0429");
  await expect(page.getByLabel("Expiry (MM / YY)")).toHaveValue("04 / 29");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Country").fill("United Kingdom");
  await drive.key("Enter");
  await page.getByLabel("Street address").fill("1 Mall Road");
  await page.getByLabel("City").fill("London");

  // a postcode that can't be is said when the field is left, not while typing
  await page.getByLabel("Postcode").fill("SW1");
  await expect(page.getByText("Enter a postcode like SW1A 2AA.")).toBeHidden();
  await drive.key("Tab");
  await expect(page.getByText("Enter a postcode like SW1A 2AA.")).toBeVisible();
  await page.getByLabel("Postcode").fill("EC1A 1BB");

  // declined: the service's sentence, the code emptied, the rest kept
  await page.getByRole("button", { name: "Pay $110.00" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByText("declined", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Security code")).toHaveValue("");
  await expect(page.getByLabel("Name on card")).toHaveValue("Grace Hopper");

  // another card, and pay — twice pressed, once sent
  await page.getByLabel("Card number").fill("");
  await page.getByLabel("Card number").pressSequentially("5555555555554444");
  await expect(page.getByText("Mastercard", { exact: true })).toBeVisible();
  await page.getByLabel("Security code").fill("321");
  const pay = page.getByRole("button", { name: "Pay $110.00" });
  await pay.click();
  await pay.click();
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/orders", { count: 2 });   // the decline, then this one
  await expect(page.getByText("Sent to guest@example.com")).toBeVisible();
  await expect(page.getByText("Ticket 1 of 2")).toBeVisible();
};
