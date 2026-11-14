// On a phone, the brief's story: pick a performance, zoom into the house and
// choose three seats with a finger; one is bought by someone else meanwhile
// and leaves the choice; choose another in a second section; at checkout sign
// in without losing what was typed; the saved Visa is declined; switch to a new
// card, mistype the postcode, fix it, and pay; the tickets arrive one at a time.

export const device = { width: 390, height: 844, touch: true };

const API = "http://127.0.0.1:8350";

// The free seats whose middle is inside the hall's window, as accessible names.
const seatsInView = (page) => page.evaluate(() => {
  const hall = document.querySelector('[aria-label="Seats in the Grand Hall"]').getBoundingClientRect();
  return [...document.querySelectorAll('[aria-pressed="false"]')]
    .filter((e) => /, row [A-Z], seat \d+$/.test(e.getAttribute("aria-label") || "") && e.getAttribute("aria-disabled") != "true")
    .map((e) => ({ name: e.getAttribute("aria-label"), r: e.getBoundingClientRect() }))
    .filter(({ r }) => r.width >= 40 && r.left + r.width / 2 > hall.left + 8 && r.right - r.width / 2 < hall.right - 8
      && r.top > hall.top + 70 && r.bottom < hall.bottom - 8)
    .map(({ name }) => name);
});

export default async ({ drive, expect, page }) => {
  // start signed out
  if (await page.getByRole("button", { name: "Sign out" }).isVisible()) {
    await page.getByRole("button", { name: "Sign out" }).click();
    await drive.settleData();
  }

  // 1. Friday's performance
  await page.getByRole("button", { name: /^Fri 20 Nov, 7:30pm/ }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole("heading", { name: "Fri 20 Nov · 7:30pm" })).toBeVisible();

  // 2. the whole house first; seats are too small to hit, so a tap zooms
  await expect.attr("app.hall", "zoomed", false);
  await drive.clickAt("app.hall", 195, 250);
  await drive.settleMotion();
  await expect.attr("app.hall", "zoomed", true);
  await expect.attr("app.hall", "s", 1);

  // a drag pans the zoomed house
  const tx0 = await drive.read("app.hall.tx");
  await drive.drag("app.hall", -120, 0);
  await drive.settleMotion();
  const tx1 = await drive.read("app.hall.tx");
  console.log("pan:", tx0, "→", tx1);
  if (!(tx1 < tx0)) throw new Error("dragging did not pan the house");

  let names = await seatsInView(page);
  console.log("in view:", names.length, names.slice(0, 4).join(" | "));
  if (names.length < 3) throw new Error("fewer than three free seats in view");
  const picked = names.slice(0, 3);
  for (const n of picked) await page.getByRole("button", { name: n, exact: true }).tap();
  await drive.settleMotion();
  for (const n of picked) await expect(page.getByRole("button", { name: n, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/^3 seats · \$\d+\.\d\d$/)).toBeVisible();

  // 3. someone else buys one of them while this person decides
  const lost = picked[1];
  const seatId = await page.evaluate((n) => {
    const m = /^(.*), row ([A-Z]), seat (\d+)$/.exec(n);
    const key = { "Orchestra": "ORCH", "Grand Tier": "GT", "Dress Circle": "DC", "Balcony": "BALC" }[m[1]];
    return key + "-" + m[2] + "-" + m[3];
  }, lost);
  const bought = await page.evaluate(async ([api, id]) => {
    const r = await fetch(api + "/api/orders", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ performanceId: "p05", seatIds: [id], email: "someone@example.com",
        payment: { card: { number: "5555555555554444", expMonth: 1, expYear: 2030, cvc: "123", name: "Some One" },
          billing: { line1: "1 Main St", line2: null, city: "Boston", postalCode: "02110", country: "US" } } }) });
    return r.status;
  }, [API, seatId]);
  console.log("someone else bought", seatId, "→", bought);
  await drive.waitReal(2500);
  await drive.settleMotion();
  await expect(page.getByText(lost + " has just been taken by someone else", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: lost, exact: true })).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText(/^2 seats · \$\d+\.\d\d$/)).toBeVisible();

  // ...so they choose another, in another section
  await page.getByRole("button", { name: "Whole house" }).tap();
  await drive.settleMotion();
  await expect.attr("app.hall", "zoomed", false);
  // aim the tap where a free seat in another section is, as a person would
  const aim = await page.evaluate((avoid) => {
    const hall = document.querySelector('[aria-label="Seats in the Grand Hall"]').getBoundingClientRect();
    const e = [...document.querySelectorAll('[aria-pressed="false"]')]
      .filter((e) => /, row [A-Z], seat \d+$/.test(e.getAttribute("aria-label") || "") && e.getAttribute("aria-disabled") != "true"
        && !e.getAttribute("aria-label").startsWith(avoid))[0];
    const r = e.getBoundingClientRect();
    return [Math.round(r.left + r.width / 2 - hall.left), Math.round(r.top + r.height / 2 - hall.top)];
  }, picked[0].split(",")[0]);
  await drive.clickAt("app.hall", aim[0], aim[1]);
  await drive.settleMotion();
  names = (await seatsInView(page)).filter((n) => !n.startsWith(picked[0].split(",")[0]));
  console.log("second section, in view:", names.slice(0, 3).join(" | "));
  if (names.length < 1) throw new Error("no free seat in a second section in view");
  await page.getByRole("button", { name: names[0], exact: true }).tap();
  await drive.settleMotion();
  await expect(page.getByText(/^3 seats · \$\d+\.\d\d$/)).toBeVisible();

  // 4. checkout; type a little, then sign in halfway through
  await page.getByRole("button", { name: "Continue" }).tap();
  await drive.settleMotion();
  await expect(page.getByRole("heading", { name: "Checkout", level: 1 })).toBeVisible();
  await page.getByLabel("Email").fill("me@elsewhere.example");
  await page.getByLabel("Name on card").fill("A. Lovelace");

  await page.getByRole("button", { name: "Sign in" }).tap();
  await drive.settleMotion();
  const sheet = page.getByRole("dialog", { name: "Sign in" });
  await expect(sheet.getByLabel("Password")).toHaveAttribute("type", "password");
  await expect(sheet.getByLabel("Password")).toHaveAttribute("autocomplete", "current-password");
  await sheet.getByLabel("Email").fill("ada@example.com");
  await sheet.getByLabel("Password").fill("wrong one");
  await sheet.getByRole("button", { name: "Sign in" }).tap();
  await drive.settleData();
  await expect(sheet.getByText("That email and password don't match.")).toBeVisible();
  await sheet.getByRole("checkbox", { name: "Show password" }).tap();
  await expect(sheet.getByLabel("Password")).toHaveAttribute("type", "text");
  await sheet.getByLabel("Password").fill("correct horse battery");
  await sheet.getByRole("button", { name: "Sign in" }).tap();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByText(/^Signed in as Ada Lovelace\./)).toBeVisible();
  await expect(page.getByText(/^3 seats · |^3 seats$/).first()).toBeVisible();

  // the saved cards: the Visa offered, the expired Mastercard shown and not choosable
  await expect(page.getByRole("option", { name: /Visa ending 4242, expires 04\/28/ })).toBeVisible();
  const mc = page.getByRole("option", { name: /Mastercard ending 4444, expired 08\/26/ });
  await expect(mc).toBeVisible();
  await expect(mc).toHaveAttribute("aria-disabled", "true");

  // 5. the saved Visa asks only for its code; this one is declined
  const total = (await page.getByRole("button", { name: /^Pay \$/ }).innerText()).trim();
  console.log("pay button reads:", total);
  await page.getByLabel("Security code").fill("000");
  await page.getByRole("button", { name: /^Pay \$/ }).tap();
  await drive.settleData();
  await drive.settleMotion();
  const declined = page.getByText(/declined/i).first();
  await expect(declined).toBeVisible();
  console.log("decline says:", await declined.innerText());
  await expect(page.getByLabel("Security code")).toHaveValue("");

  // 6. a new card: what was typed before signing in is still there
  await page.getByRole("option", { name: /A new card/ }).tap();
  await drive.settleMotion();
  await expect(page.getByLabel("Email")).toHaveValue("me@elsewhere.example");
  await expect(page.getByLabel("Name on card")).toHaveValue("A. Lovelace");
  await expect(page.getByLabel("Street address")).toHaveValue("12 Marchmont Street");
  await page.getByLabel("Card number").pressSequentially("4242424242424242");
  await expect(page.getByLabel("Card number")).toHaveValue("4242 4242 4242 4242");
  await expect(page.getByLabel("Card number")).toHaveAttribute("inputmode", "numeric");
  await page.getByLabel("Expiry").pressSequentially("1230");
  await page.getByLabel("Security code").pressSequentially("321");

  // mistype the postcode; told only once they move on
  await page.getByLabel("Postal code").fill("WC1N 1A");
  await expect(page.getByText("Enter a postcode like SW1A 2AA.")).toBeHidden();
  await page.getByLabel("City").focus();
  await drive.settleMotion();
  await expect(page.getByText("Enter a postcode like SW1A 2AA.")).toBeVisible();
  await page.getByLabel("Postal code").fill("WC1N 1AB");
  await expect(page.getByText("Enter a postcode like SW1A 2AA.")).toBeHidden();

  // 7. pay, and a double tap sends once
  const held = await drive.hold({ method: "POST", path: "/api/orders" });
  await page.getByRole("button", { name: total }).tap();
  await drive.settleMotion();
  await expect(page.getByText(/Processing your payment/).first()).toBeVisible();
  await page.getByRole("button", { name: total }).tap();
  await page.getByRole("button", { name: total }).tap();
  console.log("held order requests:", held.count);
  if (held.count != 1) throw new Error("more than one payment was sent: " + held.count);
  await held.release();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByText("Sent to me@elsewhere.example", { exact: true })).toBeVisible();
  await expect(page.getByText("Ticket 1 of 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).tap();
  await drive.settleMotion();
  await expect(page.getByText("Ticket 2 of 3", { exact: true })).toBeVisible();
  await expect.request("POST", "/api/orders", { count: 3 });  // the other buyer, the decline, the payment
};
