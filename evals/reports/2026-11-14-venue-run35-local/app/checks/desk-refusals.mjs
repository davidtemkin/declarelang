// At a desk: a seat lost between choosing and paying (the service's 409), a
// card the bank says has the wrong security code (422 on cvc), then success;
// signing in, a reload that keeps the session, and signing out.
const API = "http://127.0.0.1:8350";
const buyElsewhere = (page, perf, id) => page.evaluate(async ({ api, perf, id }) => {
  const r = await fetch(api + "/api/orders", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ performanceId: perf, seatIds: [id], email: "someone@example.com",
      payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "Someone" },
        billing: { line1: "1 Road", line2: null, city: "Town", postalCode: "94103", country: "US" } } }) });
  return r.status;
}, { api: API, perf, id });
const idOf = (name) => {
  const [sec, row, num] = name.match(/^(.*), row (.*), seat (\d+)$/).slice(1);
  return { "Orchestra": "ORCH", "Grand Tier": "GT", "Dress Circle": "DC", "Balcony": "BALC" }[sec] + "-" + row + "-" + num;
};

export default async ({ drive, expect, page }) => {
  // No live stream in this run, so the payment is what finds the lost seat.
  await drive.hold({ path: "/api/events" });
  await page.getByRole("button", { name: /^Fri 11 Dec/ }).click();
  await drive.settleData();
  const free = page.getByRole("button", { name: /^Dress Circle, row/, pressed: false, disabled: false });
  const first = await free.nth(3).getAttribute("aria-label");
  const second = await free.nth(8).getAttribute("aria-label");
  await free.nth(3).click();
  await page.getByRole("button", { name: second, exact: true }).click();
  await expect(page.getByText(/^2 seats · \$100\.00$/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();

  await page.getByLabel("Email").fill("edge@example.com");
  await page.getByLabel("Card number").fill("4000000000000127");
  await page.getByLabel("Name on card").fill("Edge Case");
  await page.getByLabel("Expiry").fill("1229");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Street address").fill("5 High Street");
  await page.getByLabel("City").fill("Albany");
  await page.getByLabel("Postal code").fill("12207");

  console.log("bought elsewhere:", await buyElsewhere(page, "p17", idOf(first)));
  await page.getByRole("button", { name: "Pay $110.00" }).click();
  await drive.settleData();
  await drive.settleMotion();
  // back in the hall, the lost seat gone from the choice, the other kept
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  await expect(page.getByText(/^1 seat · \$50\.00$/)).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /./ }).first()).toBeVisible();
  console.log("notice:", await page.getByRole("status").first().innerText());
  await expect(page.getByRole("button", { name: first, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: second, exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "/tmp/venue-shots/d-409.png" });

  // On again: everything typed is still there; the bank refuses the code.
  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();
  await expect(page.getByLabel("Card number")).toHaveValue("4000 0000 0000 0127");
  await page.getByRole("button", { name: "Pay $55.00" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByLabel("Security code")).toBeFocused();
  await expect(page.getByLabel("Security code")).toHaveAttribute("aria-invalid", "true");
  console.log("cvc says:", await page.getByLabel("Security code").getAttribute("aria-errormessage") ,
    await page.getByText(/security code/i).allInnerTexts());
  await page.screenshot({ path: "/tmp/venue-shots/d-422.png" });

  // A card with no trouble.
  await page.getByLabel("Card number").fill("4242424242424242");
  await page.getByLabel("Security code").fill("456");
  await page.getByRole("button", { name: "Pay $55.00" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByText("Sent to edge@example.com")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your ticket" })).toBeVisible();

  // Signing in at a desk; a reload keeps it; signing out ends it.
  await page.getByRole("button", { name: "Book another performance" }).click();
  await drive.settleMotion();
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/venue-shots/d-signin.png" });
  const dlg = page.getByRole("dialog", { name: "Sign in" });
  await dlg.getByLabel("Email").fill("a@a.co");
  await dlg.getByLabel("Password").fill("pass");
  await dlg.getByLabel("Password").press("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeFocused();
  await page.reload();
  await drive.settleData();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await drive.settleData();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect.request("DELETE", "/api/session", { count: 1 });
};
