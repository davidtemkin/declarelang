// The phone: a guest chooses seats with a thumb, loses one to someone else
// while deciding, loses another at the moment of paying, and pays with a new
// card after fixing a postcode.
// Run: npx declare-verify my-apps/venue/venue.declare --assert ../checks/phone.mjs

export const device = { width: 390, height: 844, touch: true };

const API = "http://127.0.0.1:8350";
const SHOTS = process.env.VENUE_SHOTS;
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

async function freeSeats(perf, section, n, skip = 0) {
  const map = await (await fetch(`${API}/api/performances/${perf}/seats`)).json();
  const s = map.sections.find((x) => x.key === section);
  const out = [];
  for (const r of s.rows) for (const st of r.seats) {
    if (st.status === "available") out.push({ id: st.id, name: `${s.name}, row ${r.name}, seat ${st.number}` });
  }
  return out.slice(skip, skip + n);
}

// someone else buys a seat
async function buyElsewhere(perf, seatId) {
  const r = await fetch(`${API}/api/orders`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ performanceId: perf, seatIds: [seatId], email: "rival@example.com",
      payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "R" },
        billing: { line1: "1 Main St", line2: null, city: "NYC", postalCode: "94103", country: "US" } } }) });
  if (r.status !== 201) throw new Error("rival purchase failed: " + r.status);
}

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.click('app.listScreen.grid.5');            // Fri 20 Nov
  await drive.settleData();
  await shot(page, "p-hall");
  const perf = "p05";
  const dc = await freeSeats(perf, "DC", 3, 6);
  const balc = await freeSeats(perf, "BALC", 1, 4);
  for (const s of [...dc, balc[0]]) await drive.click(`app.hallScreen.main.pane.room."${s.name}"`);
  await expect.attr("app", "chosen", [...dc.map((s) => s.id), balc[0].id]);
  await shot(page, "p-chosen");

  // one is taken by someone else while they look
  await buyElsewhere(perf, dc[2].id);
  for (let i = 0; i < 40; i++) {
    await drive.wait(250);
    try { await expect.attr("app", "chosen", [dc[0].id, dc[1].id, balc[0].id]); break; } catch (e) { if (i == 39) throw e; }
  }
  await expect.text("app.hallScreen.main.phoneFoot", "just taken by someone else");
  await shot(page, "p-taken");

  await drive.click('app.hallScreen.main.phoneFoot.row.Continue');
  await expect.attr("app", "stage", "pay");
  await shot(page, "p-checkout");

  const f = "app.checkoutScreen.form.col.payment.fresh";
  await drive.click(`${f}.email.entry`);
  await drive.type("grace@example.com");
  await drive.key("Tab");
  await drive.type("Grace Hopper");
  await drive.key("Tab");
  await drive.type("378282246310005");
  await expect.attr("app.form", "number", "3782 822463 10005");
  await expect.attr(`${f}.number`, "aside", "American Express");
  await drive.key("Tab");
  await drive.type("13/30");
  await drive.key("Tab");
  await expect.attr(`${f}.pair.left.expiry`, "shownError", "There's no month 13. Use 01 to 12.");
  await drive.selectAll(`${f}.pair.left.expiry.entry`);
  await drive.type("0130");
  await drive.key("Tab");
  await drive.type("123");
  await drive.key("Tab");
  await expect.attr(`${f}.pair.right.code`, "shownError", "Enter the 4-digit code on the front of the card.");
  await drive.selectAll(`${f}.pair.right.code.entry`);
  await drive.type("1234");
  await drive.click(`${f}.line1.entry`);
  await drive.type("1 Infinite Loop");
  await drive.click(`${f}.city.entry`);
  await drive.type("Cupertino");
  await drive.click(`${f}.place.country.pick.entry`);
  await drive.type("United S");
  await drive.key("Enter");
  await expect.attr("app.form", "country", "US");
  await drive.click(`${f}.place.left.postal.entry`);
  await drive.type("9501");
  await drive.key("Tab");
  await expect.attr(`${f}.place.left.postal`, "shownError", "Enter a ZIP code like 94103.");
  await shot(page, "p-zip");
  await drive.selectAll(`${f}.place.left.postal.entry`);
  await drive.type("95014");

  // a seat goes at the last moment, before the stream can say so: nothing
  // charged, back in the hall with the rest of the choice
  await drive.set("app", "chosen", [dc[0].id, dc[2].id, balc[0].id]);
  await drive.click("app.payBar.pay");
  await drive.settleData();
  await expect.attr("app", "stage", "hall");
  await expect.attr("app", "chosen", [dc[0].id, balc[0].id]);
  await expect.request("POST", "/api/orders", { count: 1 });
  await shot(page, "p-conflict");

  await drive.click('app.hallScreen.main.phoneFoot.row.Continue');
  await expect.attr("app.form", "number", "3782 822463 10005");     // all still there
  await drive.click("app.payBar.pay");
  await drive.settleData();
  await expect.attr("app", "stage", "tickets");
  await expect.request("POST", "/api/orders", { count: 1, body: { seatIds: [dc[0].id, balc[0].id],
    email: "grace@example.com", payment: { card: { number: "378282246310005", expMonth: 1, expYear: 2030, cvc: "1234" },
      billing: { postalCode: "95014", country: "US" } } } });
  await drive.settleMotion();
  await shot(page, "p-tickets");
};
