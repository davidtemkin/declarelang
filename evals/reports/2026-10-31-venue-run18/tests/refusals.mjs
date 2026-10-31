// The service's refusals, each where it belongs.
// npx declare-verify my-apps/venue/venue.declare --assert my-apps/venue/checks/refusals.mjs

const free = (page, section) =>
  page.locator(`[aria-label^="${section}, row"][aria-pressed="false"]:not([aria-disabled="true"])`);

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /Sun 29 Nov/ }).click();
  await drive.settleData();
  const a = await free(page, "Balcony").nth(5).getAttribute("aria-label");
  const b = await free(page, "Balcony").nth(6).getAttribute("aria-label");
  await page.getByRole("button", { name: a, exact: true }).click();
  await page.getByRole("button", { name: b, exact: true }).click();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await drive.settleMotion();

  await page.getByLabel("Email for your tickets").fill("kay@example.com");
  await page.getByLabel("Name on card").fill("Kay Smith");
  await page.getByLabel("Card number").pressSequentially("4000000000000127");
  await page.getByLabel("Expiry (MM / YY)").pressSequentially("0130");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Country").fill("Canada");
  await drive.key("Enter");
  await page.getByLabel("Street address").fill("1 King St W");
  await page.getByLabel("City").fill("Toronto");
  await page.getByLabel("Postal code").fill("M5H 1A1");

  // 422 on the code: the service's sentence on that field, and the focus taken there
  await page.getByRole("button", { name: "Pay $78.00" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByLabel("Security code")).toBeFocused();
  const said = await page.evaluate(() => window.__declare.find("app").checkoutScreen.col.body.pane.form.problems.map((p) => p.message).join(" | "));
  console.log("422 said:", said);
  if (!said) throw new Error("the cvc refusal was not laid on a field");

  // 409: a seat in the choice was sold before the payment went through
  await page.getByLabel("Card number").fill("");
  await page.getByLabel("Card number").pressSequentially("4242424242424242");
  await page.getByLabel("Security code").fill("456");
  const plan = await page.evaluate(() => {
    const app = window.__declare.find("app");
    const spot = app.plan.geometry.value.spots.find((s) => s.s.status == "sold" && s.id.startsWith("BALC"));
    app.chosen = [...app.chosen, spot.id];
    return spot.label;
  });
  await drive.settleMotion();
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole("heading", { name: /Sun 29 Nov/ })).toBeVisible();
  await expect(page.getByText(/^2 seats · \$70\.00$/)).toBeVisible();
  const notice = await page.evaluate(() => window.__declare.find("app").notice);
  console.log("409 said:", notice, "— lost:", plan);
  if (!notice) throw new Error("the conflict was not said");
  await expect(page.getByText(notice)).toBeVisible();
};
