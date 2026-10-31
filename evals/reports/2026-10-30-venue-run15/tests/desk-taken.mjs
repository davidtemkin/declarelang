// Other people buying: a chosen seat taken while the person decides leaves
// their choice and they are told which; a seat taken while their payment is
// out comes back as a refusal, nothing is charged, and they are back in the
// hall with the rest of their choice.

const API = "http://127.0.0.1:8350";

// someone else, with no session, buying one seat
const buyElsewhere = (perf, seatId) => fetch(API + "/api/orders", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ performanceId: perf, seatIds: [seatId], email: "other@example.com",
    payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "Other" },
      billing: { line1: "1 Road", line2: null, city: "Town", postalCode: "12345", country: "US" } } }) });

const freeIds = (page, n) =>
  page.evaluate((n) => [...document.querySelectorAll('[role="button"][aria-pressed="false"]')]
    .filter((e) => e.getAttribute("aria-disabled") !== "true" && (e.getAttribute("aria-label") || "").startsWith("Dress Circle"))
    .slice(0, n).map((e) => e.getAttribute("aria-label")), n);

// "Dress Circle, row C, seat 14" → "DC-C-14"
const idOf = (name) => { const m = name.match(/row (\w+), seat (\d+)/); return `DC-${m[1]}-${m[2]}`; };

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /^Sun 15 Nov, 2:00pm/ }).click();
  await drive.settleData();

  const [a, b] = await freeIds(page, 2);
  await page.getByRole("button", { name: a, exact: true }).click();
  await page.getByRole("button", { name: b, exact: true }).click();
  await expect.text("app", "2 seats · $100.00");

  // taken while deciding
  const r = await buyElsewhere("p03", idOf(a));
  if (r.status != 201) throw new Error("could not buy elsewhere: " + r.status);
  await drive.waitReal(1200);
  await expect.text("app", "Someone else just took " + a + ". It's no longer in your choice.");
  await expect.text("app", "1 seat · $50.00");
  await expect.equal(await page.getByRole("button", { name: a, exact: true }).getAttribute("aria-disabled"), "true");

  // taken while paying
  const [c] = await freeIds(page, 1);
  await page.getByRole("button", { name: c, exact: true }).click();
  await expect.text("app", "2 seats · $100.00");
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await page.getByLabel("Email").fill("kb@example.com");
  await page.getByLabel("Name on card").fill("K B");
  await page.getByLabel("Card number").fill("5555555555554444");
  await page.getByLabel("Expiry").fill("1230");
  await page.getByLabel("Security code").fill("321");
  await page.getByLabel("Street address").fill("2 Elm");
  await page.getByLabel("City").fill("Toronto");
  await page.getByLabel("Country").fill("Canada");
  await page.getByLabel("Postal code").fill("K1A 0B1");

  // the other buyer gets there a moment before the press
  const other = buyElsewhere("p03", idOf(c));
  await page.getByRole("button", { name: "Pay $110.00" }).click();
  await other;
  await drive.settleData();
  await drive.waitReal(2500);
  await drive.settleData();
  await expect.text("app", "Nothing was charged.");
  await expect.text("app", "1 seat · $50.00");
  await expect.equal(await page.getByRole("button", { name: b, exact: true }).getAttribute("aria-pressed"), "true");
  await expect.request("POST", "/api/orders", { count: 1 });
};
