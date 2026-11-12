// The service's refusals: a field it names, and a card without funds.
export default async ({ page, expect }) => {
  await page.getByRole("button", { name: "Sat 14 Nov, 7:30pm" }).click();
  const seats = page.getByRole("button", { name: /^Dress Circle, row/ });
  await expect(seats.first()).toBeVisible();
  for (const s of await seats.all()) if (await s.isEnabled()) { await s.click(); break; }
  await expect(page.getByText("1 seat · $50.00")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  // nothing typed yet: Pay shows every problem and sends nothing
  await page.getByRole("button", { name: "Pay $55.00" }).click();
  await expect(page.getByText("Enter the email address to send your tickets to.")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.getByLabel("Email").fill("r@example.com");
  await page.getByLabel("Name on card").fill("R Test");
  await page.getByLabel("Card number").pressSequentially("4000000000000127");
  await page.getByLabel("Expiry").pressSequentially("1329");
  await page.getByLabel("Security code").focus();
  await expect(page.getByText("There's no month 13. Use 01 to 12.")).toBeVisible();
  await page.getByLabel("Expiry").fill("");
  await page.getByLabel("Expiry").pressSequentially("0129");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Street address").fill("1 Main St");
  await page.getByLabel("City").fill("Toronto");
  await page.getByRole("combobox", { name: "Country" }).fill("Canada");
  await page.getByLabel("Postal code").fill("M5V 2T6");
  await page.getByRole("button", { name: "Pay $55.00" }).click();
  // the service names the security code
  await expect(page.getByLabel("Security code")).toBeFocused();
  console.log("cvc msg:", await page.evaluate(() => document.body.innerText.match(/security code[^\n]*/gi)));
  // a card without funds: the sentence is shown, the code is emptied
  await page.getByLabel("Card number").fill("");
  await page.getByLabel("Card number").pressSequentially("4000000000009995");
  await page.getByLabel("Security code").fill("123");
  await page.getByRole("button", { name: "Pay $55.00" }).click();
  await expect(page.getByLabel("Security code")).toHaveValue("");
  console.log("funds msg:", await page.evaluate(() => document.body.innerText.match(/[^\n]*funds[^\n]*/gi)));
  // the bank's postcode check
  await page.getByLabel("Card number").fill("");
  await page.getByLabel("Card number").pressSequentially("4242424242424242");
  await page.getByLabel("Security code").fill("123");
  await page.getByRole("button", { name: "Pay $55.00" }).click();
  await expect(page.getByLabel("Postal code")).toBeFocused();
  console.log("postal msg:", await page.evaluate(() => document.body.innerText.match(/[^\n]*postal[^\n]*/gi)));
  await page.getByLabel("Postal code").fill("K1A 0B1");
  await page.getByRole("button", { name: "Pay $55.00" }).click();
  await expect(page.getByText("Sent to r@example.com")).toBeVisible();
};
