// The service's refusals: a field it names, seats gone before the payment,
// and the account: a session that survives a reload, and signing out.
async function freeSeats(page, section, n) {
  const out = [];
  for (const b of await page.getByRole("button", { name: new RegExp("^" + section + ", row ") }).all()) {
    if (out.length >= n) break;
    if (await b.isEnabled() && (await b.getAttribute("aria-pressed")) !== "true") out.push(b);
  }
  return out;
}
const focusedName = (page) => page.evaluate(() => document.activeElement?.getAttribute("name") ?? "");
export default async ({ drive, expect, page }) => {
  await page.getByRole("button", { name: /^Wed 25 Nov/ }).click();
  await drive.settleData();
  const [a, b] = await freeSeats(page, "Balcony", 2);
  await a.click(); await b.click();
  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();

  await page.getByLabel("Email").fill("b@example.com");
  await page.getByLabel("Name on card").fill("B B");
  await page.getByLabel("Card number").fill("4000000000000127");
  await page.getByLabel("Expiry date").fill("1130");
  await page.getByLabel("Security code").fill("123");
  await page.getByLabel("Street address").fill("1 King St");
  await page.getByLabel("City").fill("Toronto");
  await page.getByRole("combobox", { name: "Country" }).fill("Canada");
  await page.getByLabel("Postal code").fill("M5V 2T6");      // the bank doesn't hold this one
  await page.getByRole("button", { name: /^Pay / }).click();
  await drive.settleData(); await drive.settleMotion();
  await page.screenshot({ path: "/tmp/venue-shots/refused-field.png" });
  const first = await page.evaluate(() => document.body.innerText);
  console.log("after 422:", (first.match(/(security code|postal code)[^\n]*/gi) || []).join(" | "));
  console.log("focused:", await focusedName(page));

  // seats gone before the payment: put a sold seat in the choice
  const soldId = await page.evaluate(() => {
    const secs = window.__declare.find("app.seatMap").value.sections;
    for (const s of secs) for (const r of s.rows) for (const x of r.seats) if (x.status == "sold") return x.id;
  });
  const chosen = await page.evaluate(() => [...window.__declare.find("app").chosen]);
  await drive.set("app", "chosen", [...chosen, soldId]);
  await page.getByLabel("Card number").fill("4242424242424242");
  await page.getByLabel("Postal code").fill("M5V 3L9");
  await page.getByRole("button", { name: /^Pay / }).click();
  await drive.settleData(); await drive.settleMotion();
  await page.screenshot({ path: "/tmp/venue-shots/refused-seat.png" });
  await expect(page.getByRole("heading", { name: /Wed 25 Nov/ })).toBeVisible();
  await expect(page.getByText(/^2 seats · \$/)).toBeVisible();

  // the account
  await page.getByRole("banner").getByRole("button", { name: "Sign in" }).click();
  await drive.settleMotion();
  await page.getByRole("dialog").getByLabel("Email").fill("a@a.co");
  await page.getByRole("dialog").getByLabel("Password").fill("pass");
  await page.getByRole("dialog").getByRole("button", { name: "Sign in" }).click();
  await drive.settleData(); await drive.settleMotion();
  await expect(page.getByRole("banner").getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.reload();
  await drive.settleData(); await drive.settleMotion();
  await expect(page.getByRole("banner").getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.getByRole("banner").getByRole("button", { name: "Sign out" }).click();
  await drive.settleData(); await drive.settleMotion();
  await expect(page.getByRole("banner").getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.reload();
  await drive.settleData();
  await expect(page.getByRole("banner").getByRole("button", { name: "Sign in" })).toBeVisible();
};
