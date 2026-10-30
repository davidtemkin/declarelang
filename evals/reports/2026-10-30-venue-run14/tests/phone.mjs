// The brief's "done": a phone, Friday, three seats across two sections, one
// taken by someone else, sign in mid-checkout, a declined saved card, then a
// new card with a mistyped postcode, and three tickets.
export const device = { width: 390, height: 844, touch: true };
const API = "http://127.0.0.1:8350";
async function free(perf, key, n) {
  const d = await (await fetch(`${API}/api/performances/${perf}/seats`)).json();
  const out = [];
  for (const s of d.sections) if (s.key === key)
    for (const row of s.rows) for (const x of row.seats)
      if (x.status === "available" && out.length < n) out.push({ id: x.id, name: `${s.name}, row ${row.name}, seat ${x.number}` });
  return out;
}
async function buyElsewhere(perf, id) {
  const r = await fetch(`${API}/api/orders`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ performanceId: perf, seatIds: [id], email: "x@example.com",
      payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2029, cvc: "123", name: "X" },
        billing: { line1: "1 A St", line2: null, city: "B", postalCode: "94110", country: "US" } } }) });
  return r.status;
}
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await page.getByRole("button", { name: /^Fri 13 Nov, 7:30pm/ }).click();
  await drive.settleData();
  const orch = await free("p01", "ORCH", 3);
  const gt = await free("p01", "GT", 1);
  await page.getByRole("button", { name: orch[0].name, exact: true }).click();
  await page.getByRole("button", { name: orch[1].name, exact: true }).click();
  await page.getByRole("button", { name: gt[0].name, exact: true }).click();
  await expect.text("app.hallBar", "3 seats · $225.00");
  await page.screenshot({ path: "/tmp/shots/p-three.png" });
  console.log("other buyer:", await buyElsewhere("p01", orch[1].id));
  await drive.waitReal(1500);
  await drive.settleMotion();
  await expect.text("app.hallBar", "2 seats · $145.00");
  await expect.text("app.hallBar", orch[1].name);
  await page.screenshot({ path: "/tmp/shots/p-taken.png" });
  await page.getByRole("button", { name: orch[2].name, exact: true }).click();
  await expect.text("app.hallBar", "3 seats · $225.00");
  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();
  await page.getByLabel("Email").fill("someone@example.com");
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleMotion();
  await page.getByLabel("Email").nth(0).fill("ada@example.com");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData(); await drive.settleMotion();
  await expect.text("app.signInSheet", "That email and password don't match.");
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await drive.settleData(); await drive.settleMotion();
  await page.screenshot({ path: "/tmp/shots/p-signedin.png" });
  const visa = page.getByRole("radio", { name: /Visa ending 4242/ });
  console.log("visa checked:", await visa.isChecked());
  console.log("mc disabled:", await page.getByRole("radio", { name: /Mastercard ending 4444/ }).getAttribute("aria-disabled"));
  await page.getByLabel("Security code").fill("000");
  await page.getByRole("button", { name: "Pay $245.00" }).click();
  await drive.waitReal(2200); await drive.settleData(); await drive.settleMotion();
  await page.screenshot({ path: "/tmp/shots/p-declined.png" });
  await expect.text("app.checkoutScreen", "declined");
  await page.getByRole("radio", { name: "A new card" }).click();
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/shots/p-newcard.png", fullPage: false });
  console.log("email kept:", await page.getByLabel("Email").inputValue());
  await page.getByLabel("Card number").fill("5555555555554444");
  await page.getByLabel("Expiry (MM/YY)").fill("09/29");
  await page.getByLabel("Security code").fill("321");
  await page.getByLabel("Postal code").fill("WC1N");
  await drive.key("Tab");
  await drive.settleMotion();
  await expect.text("app.checkoutScreen", "Enter a postcode like SW1A 2AA.");
  await page.getByLabel("Postal code").fill("WC1N 1AB");
  await page.getByRole("button", { name: "Pay $245.00" }).click();
  await drive.waitReal(2200); await drive.settleData(); await drive.settleMotion();
  await page.screenshot({ path: "/tmp/shots/p-tickets.png" });
  await expect.text("app.ticketsScreen", "Sent to");
  await expect.request("POST", "/api/orders", { count: 2 });
};
