// Desk: another buyer takes one of my seats while I look; then a seat is
// lost at the moment of paying (409) and I'm back in the hall with the rest.
const API = "http://127.0.0.1:8350";
const card = (seatIds, perf) => ({ performanceId: perf, seatIds, email: "other@example.com",
  payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "Other Buyer" },
    billing: { line1: "1 Main St", line2: null, city: "NYC", postalCode: "94103", country: "US" } } });
const seatPath = (s) => `app.hallScreen.stageBox.hallView.surface.${s.si + 1}.${s.ri + 1}.${s.ki + 2}`;

export default async ({ drive, expect, page }) => {
  page.on("pageerror", (e) => console.log("PAGEERROR", e.stack?.slice(0, 1500)));
  const perf = "p08";
  await drive.settleData();
  await drive.click("app.listScreen.grid.7");
  await drive.settleData(); await drive.settleMotion();
  const map = await (await fetch(`${API}/api/performances/${perf}/seats`)).json();
  const free = [];
  map.sections.forEach((s, si) => s.rows.forEach((r, ri) => r.seats.forEach((x, ki) => { if (x.status == "available") free.push({ si, ri, ki, id: x.id }); })));
  const [a, b, c] = [free[10], free[60], free[200]];
  await drive.click(seatPath(a)); await drive.click(seatPath(b)); await drive.click(seatPath(c));
  await drive.settleMotion();
  await expect.text("app.hallScreen.side.tally.sum", "3 seats");

  // someone else buys b
  const r = await fetch(`${API}/api/orders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(card([b.id], perf)) });
  console.log("other buyer:", r.status);
  await drive.waitReal(1500);
  await drive.settleMotion();
  await expect.text("app.hallScreen.side.tally.sum", "2 seats");
  await expect.text("app.hallScreen.side.noticeBox", "has just been taken by someone else");
  console.log("notice:", await page.evaluate(() => window.__declare.find("app").notice));
  const st = await page.evaluate((id) => window.__declare.find("app").seats.isFree(id), b.id);
  if (st) throw new Error("the taken seat still shows free");

  // checkout, then c is sold under me before I pay: the stream is too slow to say so
  await drive.click("app.hallScreen.side.tally.1");
  await drive.settleMotion();
  for (const [k, v] of Object.entries({ email: "ada@example.com", cardName: "Ada", number: "4242 4242 4242 4242", expiry: "04 / 30", cvc: "123", line1: "1 Main", city: "NYC", postalCode: "94103", country: "US" }))
    await drive.set("app.pay", k, v);
  // a seat already gone, which the stream will never mention again: the
  // service refuses the order and names it
  const gone = map.sections[1].rows[0].seats.find((x) => x.status == "sold").id;
  await drive.set("app", "chosen", [a.id, gone]);
  await drive.click("app.summaryDesk.payButton.go");
  await drive.settleData(); await drive.settleMotion();
  console.log("state:", JSON.stringify(await page.evaluate(() => { const a = window.__declare.find("app"); return [a.step, a.order?.code, a.chosen, a.notice, a.checkoutForm?.error]; })));
  console.log(JSON.stringify((await drive.requests()).filter((r) => r.path.startsWith("/api/orders")).map((r) => [r.status, r.body?.seatIds])));
  await expect.visible("app.hallScreen");
  console.log("after 409:", JSON.stringify(await page.evaluate(() => { const a = window.__declare.find("app"); return [a.chosen, a.notice, document.activeElement?.textContent?.slice(0, 80)]; })));
  await expect.text("app.hallScreen.side.tally.sum", "1 seat");
};
