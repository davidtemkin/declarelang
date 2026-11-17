// The edges: a seat lost at the till (409), focus after things go away, the
// session across a reload, signing out.
const API = "http://127.0.0.1:8350";

export default async ({ drive, expect, page }) => {
  const shot = async (name) => { if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + name + ".png" }); };
  const focused = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.getAttribute("aria-label") || a.textContent || "").trim() : ""; });
  await page.evaluate((api) => fetch(api + "/api/session", { method: "DELETE", credentials: "include" }), API);

  // Hold the live feed, so the program can't hear the seat go before it pays.
  const feed = await drive.hold({ path: "/api/events" });
  await page.goto(page.url().replace(/#.*$/, "") + "#p19");
  await drive.settleData();
  await expect(page.getByRole("heading", { name: "Sun 13 Dec · 2:00pm" })).toBeVisible();

  const map = await page.evaluate((api) => fetch(api + "/api/performances/p19/seats").then((r) => r.json()), API);
  const dc = map.sections.find((s) => s.key == "DC");
  const free = dc.rows.flatMap((r) => r.seats.filter((x) => x.status == "available").map((x) => ({ id: x.id, name: `Dress Circle, row ${r.name}, seat ${x.number}` })));
  const [keep, lose, extra] = free;

  for (const s of [keep, lose, extra]) await page.getByRole("button", { name: s.name, exact: true }).click();
  await expect(page.getByText("3 seats · $150.00", { exact: true })).toBeVisible();

  // removing one from the list gives the focus back to the seats
  await page.getByRole("button", { name: "Remove " + extra.name }).click();
  await expect(page.getByText("2 seats · $100.00", { exact: true })).toBeVisible();
  expect(await focused()).toBe("Continue");

  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();

  // someone else gets one of them first
  const st = await page.evaluate(([api, id]) => fetch(api + "/api/orders", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ performanceId: "p19", seatIds: [id], email: "x@example.com",
      payment: { card: { number: "4242424242424242", expMonth: 1, expYear: 2031, cvc: "123", name: "X" },
        billing: { line1: "1 A St", line2: null, city: "Toronto", postalCode: "K1A 0B1", country: "CA" } } }) }).then((r) => r.status), [API, lose.id]);
  expect(st).toBe(201);

  await page.getByLabel("Email", { exact: true }).fill("lin@example.com");
  await page.getByLabel("Name on card").fill("Lin Wu");
  await page.getByLabel("Card number").fill("378282246310005");
  await expect(page.getByLabel("Card number")).toHaveValue("3782 822463 10005");
  await expect(page.getByLabel("Security code")).toHaveAttribute("placeholder", "4 digits");
  await page.getByLabel("Expiry date").fill("0931");
  await page.getByLabel("Security code").fill("1234");
  await page.getByLabel("Street address").fill("1 Front St");
  await page.getByLabel("City").fill("Toronto");
  await page.getByLabel("Postal code").fill("m5j 2n8");
  await expect(page.getByLabel("Postal code")).toHaveValue("M5J 2N8");
  await page.getByRole("combobox", { name: "Country" }).fill("Canada");
  await page.getByRole("combobox", { name: "Country" }).press("Tab");
  await page.getByRole("button", { name: "Pay $110.00" }).click();
  await drive.settleData();
  await drive.settleMotion();

  // back in the hall, told which, the rest of the choice intact, nothing charged
  await expect(page.getByRole("heading", { name: "Sun 13 Dec · 2:00pm" })).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: /seat/i }).first()).toBeVisible();
  await expect(page.getByText("1 seat · $50.00", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: keep.name, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: lose.name, exact: true })).toBeDisabled();
  await shot("e1-lost-at-till");

  // putting the notice away keeps the focus in the hall
  await page.getByRole("button", { name: "OK" }).click();
  expect(await focused()).not.toBe("");
  await feed.release();

  // the session lives with the service: sign in, reload, still signed in
  await page.evaluate((api) => fetch(api + "/api/session", { method: "POST", credentials: "include",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "a@a.co", password: "pass" }) }), API);
  await page.reload();
  await drive.settleData();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // signing out signs out, and the focus lands on Sign in
  await page.getByRole("button", { name: "Sign out" }).click();
  await drive.settleData();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeFocused();
  const me = await page.evaluate((api) => fetch(api + "/api/me", { credentials: "include" }).then((r) => r.status), API);
  expect(me).toBe(401);
};
