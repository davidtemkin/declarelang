// A desk, no account: choose two seats, pay with a new card, get the tickets.
// npx declare-verify my-apps/venue/venue.declare --url http://127.0.0.1:8350/... --assert this
//
// The service remembers what earlier runs bought, so the seats are whichever
// are free now.

const freeSeats = (page, prefix, n) =>
  page.evaluate((prefix, n) => [...document.querySelectorAll('[role="button"][aria-pressed]')]
    .filter((e) => e.getAttribute("aria-disabled") !== "true" && (e.getAttribute("aria-label") || "").startsWith(prefix))
    .slice(0, n).map((e) => e.getAttribute("aria-label")), prefix, n);

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 13 Nov, 7:30pm/ }).click();
  await drive.settleData();
  await drive.settleMotion();

  const names = await freeSeats(page, "Orchestra", 2);
  if (names.length < 2) throw new Error("not enough free seats: " + names);
  for (const n of names) await page.getByRole("button", { name: n, exact: true }).click();
  await expect.text("app", "2 seats · $160.00");

  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await drive.settleMotion();

  await page.getByRole("button", { name: "Pay $174.00" }).click();      // nothing filled: every problem shows
  await expect.text("app", "Enter the email address for your tickets.");
  await expect.text("app", "Enter the card number.");

  await page.getByLabel("Email").fill("grace@example.com");
  await page.getByLabel("Name on card").fill("Grace Hopper");
  await page.getByLabel("Card number").fill("4242424242424242");
  await expect.equal(await page.getByLabel("Card number").inputValue(), "4242 4242 4242 4242");
  await page.getByLabel("Expiry").fill("0429");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Street address").fill("1 Main Street");
  await page.getByLabel("City").fill("Springfield");
  await page.getByLabel("Country").fill("United States");
  await page.getByLabel("ZIP code").fill("12345");

  await page.getByRole("button", { name: "Pay $174.00" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.text("app", "Sent to grace@example.com");
  const SHOTS = process.env.SHOTS || "/tmp/shots";
  await page.screenshot({ path: `${SHOTS}/d-tickets.png` });
  const at = (p) => page.evaluate((p) => { const v = window.__declare.find(p); return [v.x, v.y, v.width, v.height, v.offset ?? null]; }, p);
  console.log("deck", await at("app.ticketsPage.deck"), "card0", await at("app.ticketsPage.deck.0"), "card1", await at("app.ticketsPage.deck.1"));
  await expect.request("POST", "/api/orders", { count: 1 });
};
