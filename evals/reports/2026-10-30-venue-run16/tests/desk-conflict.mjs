// A seat bought by someone else while the payment is out: nothing charged,
// the lost seat leaves the choice, back in the hall with the rest, told which.
const API = "http://127.0.0.1:8350";
const shot = (page, name) => page.screenshot({ path: `/tmp/dc-${name}.png` });
export default async ({ drive, expect, page }) => {
  await drive.set("app", "location", "p12");
  await drive.settleData();
  const free = await page.evaluate(() => {
    const out = [];
    for (const s of window.__declare.find("app.hall").value.sections) for (const r of s.rows) for (const x of r.seats)
      if (x.status === "available") out.push({ id: x.id, name: `${s.name}, row ${r.name}, seat ${x.number}` });
    return out.slice(60, 62);
  });
  for (const s of free) await page.getByRole("button", { name: s.name, exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await drive.settleMotion();
  await shot(page, "1-checkout");
  // an empty Pay: every problem at once, focus on the first
  const total = await page.evaluate(() => window.__declare.find("app").totalCents);
  const payName = "Pay $" + (total / 100).toFixed(2);
  await page.getByRole("button", { name: payName }).click();
  await drive.settleMotion();
  await shot(page, "2-empty");
  await page.getByLabel("Email").fill("kit@example.com");
  await page.getByLabel("Name on card").fill("Kit Marlowe");
  await page.getByLabel("Card number").fill("4242 4242 4242 4242");
  await page.getByLabel("Expiry").fill("01/31");
  await page.getByLabel("Security code").fill("999");
  await page.getByLabel("Street address").fill("3 Canal St");
  await page.getByLabel("City").fill("Chicago");
  await page.getByLabel("Postal code").fill("60601");
  const rival = fetch(API + "/api/orders", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ performanceId: "p12", seatIds: [free[1].id], email: "x@example.com",
      payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "X" },
        billing: { line1: "1 A St", line2: null, city: "Boston", postalCode: "02110", country: "US" } } }) });
  await drive.waitReal(150);
  await page.getByRole("button", { name: payName }).click();
  await drive.waitReal(200);
  await shot(page, "3-paying");
  await rival;
  await drive.waitReal(2500);
  await drive.settleData();
  await drive.settleMotion();
  await shot(page, "4-back");
  await expect.attr("app", "step", "hall");
  await expect.attr("app", "chosen", [free[0].id]);
  const notice = await page.evaluate(() => window.__declare.find("app").notice);
  if (!notice) throw new Error("no notice");
  console.log("notice:", notice);
};
