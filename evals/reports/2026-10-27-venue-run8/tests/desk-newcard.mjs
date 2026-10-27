// Desk, no account: two seats in two sections, a bad postcode caught on leaving,
// a declined card, then a good card and the tickets.
const API = "http://127.0.0.1:8350";
const F = "app.checkoutScreen.col.main.pay.form";
const N = F + ".newPart";

async function freeSeats(perf, n) {
  const map = await (await fetch(`${API}/api/performances/${perf}/seats`)).json();
  const out = [];
  map.sections.forEach((s, si) => {
    for (const [ri, r] of s.rows.entries())
      for (const [ki, seat] of r.seats.entries())
        if (seat.status == "available" && out.filter((o) => o.si == si).length < n) out.push({ si, ri, ki, id: seat.id, price: s.priceCents, fee: s.feeCents });
  });
  return out;
}
const seatPath = (s) => `app.hallScreen.stageBox.hallView.surface.${s.si + 1}.${s.ri + 1}.${s.ki + 2}`;

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.click("app.listScreen.grid.1");          // Sat 14 Nov
  await drive.settleData();
  await drive.settleMotion();
  const seats = await freeSeats("p02", 1);
  const pick = [seats.find((s) => s.si == 0), seats.find((s) => s.si == 1)];
  for (const s of pick) await drive.click(seatPath(s));
  await drive.settleMotion();
  const total = pick.reduce((n, s) => n + s.price, 0) / 100;
  await expect.text("app.hallScreen.side.tally.sum", `2 seats · $${total.toFixed(2)}`);
  await drive.click("app.hallScreen.side.tally.1");     // Continue to checkout
  await drive.settleMotion();

  await drive.click(N + ".emailRow.field"); await drive.type("ada@example.com");
  await drive.click(N + ".nameRow.field"); await drive.type("Ada Lovelace");
  await drive.click(N + ".numberRow.wrap.number"); await drive.type("4000000000000002");
  await expect.attr(N + ".numberRow.wrap.number", "text", "4000 0000 0000 0002");
  await drive.click(N + ".pair.expiryRow.field"); await drive.type("1229");
  await expect.attr(N + ".pair.expiryRow.field", "text", "12 / 29");
  await drive.click(N + ".pair.codeRow.field"); await drive.type("123");
  await drive.click(N + ".countryRow.field.entry"); await drive.type("United States"); await drive.key("Enter");
  await drive.click(N + ".line1Row.field"); await drive.type("1 Main St");
  await drive.click(N + ".pair2.cityRow.field"); await drive.type("Springfield");
  await drive.click(N + ".pair2.postalRow.field"); await drive.type("1234");
  await expect.attr(N + ".pair2.postalRow.field", "error", "");     // not while first typing
  await drive.key("Tab");
  await drive.settleMotion();
  await expect.attr(N + ".pair2.postalRow.field", "error", "Enter a 5-digit ZIP code, like 94103.");
  await drive.click(N + ".pair2.postalRow.field"); await drive.key("End"); await drive.type("5");
  await expect.attr(N + ".pair2.postalRow.field", "error", "");

  const due = pick.reduce((n, s) => n + s.price + s.fee, 0) / 100;
  const pay = "app.summaryDesk.payButton.go";
  await expect.text(pay, `Pay $${due.toFixed(2)}`);
  await drive.click(pay);
  await drive.click(pay);                                // a second press sends nothing
  await drive.settleData(); await drive.settleMotion();
  await expect.request("POST", "/api/orders", { count: 1 });
  await expect.text("app.summaryDesk.payButton.problem", "declined");
  await expect.attr(N + ".pair.codeRow.field", "text", "");
  await expect.attr(N + ".numberRow.wrap.number", "text", "4000 0000 0000 0002");

  // another card
  await drive.selectAll(N + ".numberRow.wrap.number"); await drive.type("4242424242424242");
  await drive.click(N + ".pair.codeRow.field"); await drive.type("321");
  await drive.click(pay);
  await drive.settleData(); await drive.settleMotion();
  await expect.request("POST", "/api/orders", { count: 2 });
  await expect.visible("app.ticketsScreen");
  await expect.text("app.ticketsScreen", "Sent to ada@example.com");
  const reqs = await drive.requests();
  console.log(JSON.stringify(reqs.filter((r) => r.path.startsWith("/api/orders")).map((r) => [r.status, r.body]), null, 1));
};
