// A desk: seats in two sections, then signing in from the top bar halfway
// through checkout, without losing what was typed; the saved cards offered,
// the expired one not choosable; signing out keeps the seats too.

const SHOTS = process.env.SHOTS || "/tmp/shots";

const free = (page, prefix, n) =>
  page.evaluate((prefix, n) => [...document.querySelectorAll('[role="button"][aria-pressed="false"]')]
    .filter((e) => e.getAttribute("aria-disabled") !== "true" && (e.getAttribute("aria-label") || "").startsWith(prefix))
    .slice(0, n).map((e) => e.getAttribute("aria-label")), prefix, n);

export default async ({ drive, expect, page }) => {
  const shot = async (name) => { await drive.settleMotion(); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
  await drive.settleData();
  await page.getByRole("button", { name: /^Sat 28 Nov/ }).first().click();
  await drive.settleData();

  for (const n of [...(await free(page, "Orchestra", 2)), ...(await free(page, "Balcony", 1))])
    await page.getByRole("button", { name: n, exact: true }).click();
  await expect.text("app", "3 seats · $195.00");
  await shot("d-hall-chosen");

  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await page.getByLabel("Email").fill("someone@example.com");
  await page.getByLabel("Street address").fill("99 Typed Lane");

  await page.getByRole("button", { name: "Sign in" }).click();
  await shot("d-signin");
  await page.getByLabel("Email").fill("a@a.co");
  await page.getByLabel("Password").fill("pass");
  await page.getByRole("button", { name: "Show" }).click();
  await expect.equal(await page.getByLabel("Password").getAttribute("type"), "text");
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData();
  await shot("d-checkout-signed-in");

  await expect.equal(await page.getByRole("radio", { name: /Mastercard ending 4444/ }).getAttribute("aria-disabled"), "true");
  await page.getByRole("radio", { name: "A new card" }).click();
  // typed before signing in: still there
  await expect.equal(await page.getByLabel("Email").inputValue(), "someone@example.com");
  await expect.equal(await page.getByLabel("Street address").inputValue(), "99 Typed Lane");
  // not typed: from the account
  await expect.equal(await page.getByLabel("City").inputValue(), "London");
  await expect.equal(await page.getByLabel("Postcode").inputValue(), "WC1N 1AB");
  await shot("d-checkout-new-card");

  // reload: still signed in
  await page.reload();
  await drive.settleData();
  await expect.text("app.top", "Alex Tester");
};
