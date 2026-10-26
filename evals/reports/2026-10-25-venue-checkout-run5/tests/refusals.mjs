// The service's refusals, each landing where it belongs: a field it names, and
// a seat lost to someone else at the moment of paying.
//
//   npx declare-verify my-apps/venue/venue.declare --assert my-apps/venue/checks/refusals.mjs

export const device = { width: 1280, height: 860, touch: false };

const focusedLabel = (page) => page.evaluate(() => {
  const e = document.activeElement;
  return e ? (e.getAttribute("aria-label") || e.getAttribute("name") || e.tagName) : "";
});

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  const seats = await page.evaluate(async () => {
    const d = await (await fetch("http://127.0.0.1:8350/api/performances/p19/seats")).json();
    const out = [];
    for (const s of d.sections) for (const r of s.rows) for (const x of r.seats)
      if (x.status === "available" && s.key === "BALC" && out.length < 2) out.push(x.id);
    return out;
  });
  // other people's purchases are kept from this page, so a seat can be lost at the moment of paying
  await page.evaluate(() => {
    window.EventSource = class { constructor() { this.readyState = 0; } addEventListener() {} removeEventListener() {} close() {} };
    return null;
  });
  await drive.set("app", "location", "p19");
  await drive.settleData();
  for (const id of seats) await page.evaluate((id) => { window.__declare.find("app").toggleSeat(id); return null; }, id);
  await page.evaluate(() => { window.__declare.find("app").toCheckout(); return null; });
  await drive.settleMotion();

  const fill = { email: "ann@example.com", name: "Ann Smith", number: "4000 0000 0000 0127", expiry: "04 / 28",
    cvc: "123", line1: "1 Main St", city: "New York", postal: "94103", country: "US" };
  for (const [k, v] of Object.entries(fill)) await drive.set("app.pay", k, v);

  // 422 on the security code: the field carries the service's sentence and has the focus
  await drive.click('app.checkoutScreen.body.aside.pay."Pay $78.00"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.text("app.form.newCard.dates.cvcF", "The security code doesn't match this card.");
  await expect.equal(await focusedLabel(page), "Security code");
  // editing the field clears the service's verdict
  await drive.selectAll("app.form.newCard.dates.cvcF.box.input");
  await drive.type("124");
  await expect.attr("app.form.newCard.dates.cvcF", "error", "");

  // 409: a seat went at the last moment — nothing charged, back to the hall, the rest kept
  // someone else buys the first seat, and its news is held back from the app
  await page.evaluate(async (id) => {
    await fetch("http://127.0.0.1:8350/api/orders", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ performanceId: "p19", seatIds: [id], email: "x@example.com",
        payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "X" },
          billing: { line1: "1", line2: null, city: "c", postalCode: "94103", country: "US" } } }) });
    return null;
  }, seats[0]);
  await drive.set("app.pay", "number", "4242 4242 4242 4242");
  await drive.click('app.checkoutScreen.body.aside.pay."Pay $78.00"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "screen", "hall");
  await expect.text("app.hallScreen.side", "was just taken by someone else.");
  await expect.equal(await page.evaluate(() => window.__declare.find("app").chosen.length), 1);
  await expect.text("app.hallScreen.side", "1 seat · $35.00");
};
