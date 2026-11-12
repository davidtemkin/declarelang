// At a desk, with no account: two free seats, a new card, tickets.
export default async ({ page, expect }) => {
  await page.getByRole("button", { name: "Fri 13 Nov, 7:30pm" }).click();
  const seats = page.getByRole("button", { name: /^Orchestra, row/ });
  await expect(seats.first()).toBeVisible();
  const picked = [];
  for (const s of await seats.all()) {
    if (picked.length == 2) break;
    if (await s.isEnabled()) { await s.click(); picked.push(await s.getAttribute("aria-label")); }
  }
  await expect(page.getByText("2 seats · $160.00")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Email").fill("grace@example.com");
  await page.getByLabel("Name on card").fill("Grace Hopper");
  await page.getByLabel("Card number").pressSequentially("4242424242424242");
  await expect(page.getByLabel("Card number")).toHaveValue("4242 4242 4242 4242");
  await page.getByLabel("Expiry").pressSequentially("1228");
  await expect(page.getByLabel("Expiry")).toHaveValue("12 / 28");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Street address").fill("1 Main Street");
  await page.getByLabel("City").fill("New York");
  await page.getByLabel("Postal code").fill("94103");
  await page.getByRole("button", { name: "Pay $174.00" }).click();
  await expect(page.getByText("Sent to grace@example.com")).toBeVisible();
  await expect(page.getByText(picked[0].split(", ")[0]).first()).toBeVisible();
};
