// At a desk, no account: two seats with the keyboard and pointer, a new card, tickets.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 20 Nov, 7:30pm/ }).click();
  await drive.settleData();
  // two free seats, whichever are free now
  const free = page.locator('[aria-pressed="false"]:not([aria-disabled="true"])');
  const names = await free.evaluateAll((els) => els.slice(0, 2).map((e) => e.getAttribute("aria-label")));
  for (const n of names) await page.getByRole("button", { name: n, exact: true }).click();
  await expect(page.getByText(/^2 seats · \$\d+\.00$/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();
  await page.getByLabel("Email for your tickets").fill("grace@example.com");
  await page.getByLabel("Name on card").fill("Grace Hopper");
  await page.getByLabel("Card number").pressSequentially("4242424242424242");
  await expect(page.getByLabel("Card number")).toHaveValue("4242 4242 4242 4242");
  await page.getByLabel("Expiry").pressSequentially("0429");
  await expect(page.getByLabel("Expiry")).toHaveValue("04 / 29");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Country").fill("United States");
  await page.getByLabel("Street address").fill("1 Main St");
  await page.getByLabel("City").fill("Springfield");
  await page.getByLabel("ZIP code").fill("1234");
  await page.getByLabel("City").focus();
  await expect(page.getByText("Enter a 5-digit ZIP code, like 94103.")).toBeVisible();
  await page.getByLabel("ZIP code").fill("62704");
  const pay = page.getByRole("button", { name: /^Pay \$\d+\.00$/ });
  await pay.click();
  await pay.click();
  await drive.waitReal(2500);
  await drive.settleData();
  await expect(page.getByText("Sent to grace@example.com")).toBeVisible();
  expect.request("POST", "/api/orders", { count: 1 });
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/vshots/tickets.png" });
};
