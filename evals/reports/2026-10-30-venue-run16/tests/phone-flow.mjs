// On a phone: Friday's performance, three seats across two sections, one of
// them bought by someone else meanwhile; sign in at checkout without losing
// anything; the saved Visa declined, the expired card not choosable; then a
// new card, a mistyped postcode, and three tickets.
export const device = { width: 390, height: 844, touch: true };

const API = "http://127.0.0.1:8350";
const freeSeats = (page, perf) => page.evaluate(() => {
  const secs = window.__declare.find("app.hall").value.sections;
  const out = [];
  for (const s of secs) for (const r of s.rows) for (const x of r.seats)
    if (x.status === "available") out.push({ id: x.id, name: `${s.name}, row ${r.name}, seat ${x.number}`, section: s.key });
  return out;
});
const shot = (page, name) => page.screenshot({ path: `/tmp/pf-${name}.png` });

export default async ({ drive, expect, page }) => {
  await drive.set("app", "location", "p01");
  await drive.settleData();
  await drive.settleMotion();
  const free = await freeSeats(page);
  const orch = free.filter((s) => s.section === "ORCH");
  const gt = free.filter((s) => s.section === "GT");
  const picks = [orch[orch.length - 5], orch[orch.length - 6], gt[3]];

  for (const seat of picks) {
    // zoom about the seat, then take it with a finger
    const [x, y] = await page.evaluate((id) => {
      const m = window.__declare.find("app.hallMap");
      const secs = window.__declare.find("app.hall.plan").value.sections;
      for (const s of secs) for (const t of s.seats) if (t.id === id)
        return [m.width / 2 + (t.x - m.cx) * m.z, m.height / 2 + (t.y - m.cy) * m.z];
      return [0, 0];
    }, seat.id);
    if (!(await page.evaluate(() => window.__declare.find("app.hallMap").detail))) {
      await drive.clickAt("app.hallMap", x, y);
      await drive.settleMotion();
    }
    // a seat outside the window: go back to the whole hall first
    await page.getByRole("button", { name: seat.name, exact: true }).click().catch(async () => {
      await drive.click("app.hallScreen.mapArea.\"Whole hall\"");
      await drive.settleMotion();
      throw new Error("could not reach " + seat.name);
    });
    await drive.settleMotion();
    await drive.click("app.hallScreen.mapArea.\"Whole hall\"").catch(() => {});
    await drive.settleMotion();
  }
  await shot(page, "1-chosen");
  await expect.attr("app", "chosen", picks.map((s) => s.id));

  // someone else buys the second one
  const r = await fetch(API + "/api/orders", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ performanceId: "p01", seatIds: [picks[1].id], email: "x@example.com",
      payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "X" },
        billing: { line1: "1 A St", line2: null, city: "Boston", postalCode: "02110", country: "US" } } }) });
  if (r.status !== 201) throw new Error("rival order " + r.status);
  await drive.waitReal(1500);
  await drive.settleMotion();
  await expect.attr("app", "chosen", [picks[0].id, picks[2].id]);
  await shot(page, "2-taken");

  // choose another
  const more = (await freeSeats(page)).filter((s) => s.section === "ORCH");
  const another = more[more.length - 8];
  await drive.click("app.hallScreen.mapArea.\"Whole hall\"").catch(() => {});
  const [ax, ay] = await page.evaluate((id) => {
    const m = window.__declare.find("app.hallMap");
    for (const s of window.__declare.find("app.hall.plan").value.sections) for (const t of s.seats) if (t.id === id)
      return [m.width / 2 + (t.x - m.cx) * m.z, m.height / 2 + (t.y - m.cy) * m.z];
    return [0, 0];
  }, another.id);
  await drive.clickAt("app.hallMap", ax, ay);
  await drive.settleMotion();
  await page.getByRole("button", { name: another.name, exact: true }).click();
  await drive.settleMotion();

  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();
  await page.getByLabel("Email").fill("someone@example.com");
  await page.getByLabel("Name on card").fill("Ada L");
  await shot(page, "3-checkout");

  // sign in halfway
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await drive.settleMotion();
  await shot(page, "4-signin");
  await page.getByLabel("Email").last().fill("ada@example.com");
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await drive.waitReal(600);
  await drive.settleData();
  await expect.text("app.signInSheet", "That email and password don't match.");
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await drive.waitReal(800);
  await drive.settleData();
  await drive.settleMotion();
  await shot(page, "5-signed-in");
  await expect.attr("app.pay", "email", "someone@example.com");
  await expect.attr("app.pay", "method", "card_1");
  const expired = page.getByRole("radio", { name: /Mastercard ending 4444/ });
  if (!(await expired.isDisabled())) throw new Error("the expired card can be chosen");

  const total = await page.evaluate(() => window.__declare.find("app").totalCents);
  const payName = "Pay $" + (total / 100).toFixed(2);
  await page.getByLabel("Security code").fill("000");
  await page.getByRole("button", { name: payName }).click();
  await drive.waitReal(2500);
  await drive.settleData();
  await shot(page, "6-declined");
  await expect.text("app.payBar", "declined");

  await page.getByRole("radio", { name: "A new card" }).click();
  await drive.settleMotion();
  await page.getByLabel("Card number").fill("5555555555554444");
  await page.getByLabel("Expiry").fill("12/29");
  await page.getByLabel("Security code").fill("321");
  await page.getByLabel("Postal code").fill("WC1N");
  await drive.key("Tab");
  await drive.settleMotion();
  await shot(page, "7-postcode");
  await page.getByLabel("Postal code").fill("WC1N 1AB");
  await page.getByRole("button", { name: payName }).click();
  await drive.waitReal(2500);
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "step", "tickets");
  await shot(page, "8-tickets");
};
