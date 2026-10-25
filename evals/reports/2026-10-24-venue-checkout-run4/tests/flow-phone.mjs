// On a phone: three seats across two sections, one bought by someone else while they
// decide; sign in at checkout without losing anything; the saved Visa is declined; a new
// card, a mistyped postcode caught on leaving it, then paid.

export const device = { width: 390, height: 844, touch: true };

const API = "http://127.0.0.1:8350";
const F = "app.payScreen.formPane.col.form";

const read = (page, path, attr) =>
  page.evaluate((p, a) => { const v = window.__declare.find(p)[a]; return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, path, attr);

// the person scrolls the page until the thing named `label` is in the middle of the
// screen, presses into the field, selects what is there and types
async function reach(drive, page, label) {
  await page.evaluate((l) => { document.querySelector(`[aria-label="${l}"]`)?.scrollIntoView({ block: "center" }); return null; }, label);
  await drive.wait(200);
}
async function fill(drive, page, path, text, label) {
  if (label) await reach(drive, page, label);
  await drive.click(path);
  await page.evaluate(() => { document.activeElement?.select?.(); return null; });
  await drive.type(text);
}

// someone else, buying one seat
async function buyElsewhere(perf, seatId) {
  const r = await fetch(API + "/api/orders", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ performanceId: perf, seatIds: [seatId], email: "other@example.com",
      payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "O" },
                 billing: { line1: "1 St", line2: null, city: "C", postalCode: "94103", country: "US" } } }) });
  return r.status;
}

export default async ({ drive, expect, page }) => {
  page.on("pageerror", (e) => console.log("PAGEERROR", e.stack?.slice(0, 1500)));
  await drive.settleData();
  await drive.click("app.listScreen.col.rows.18");           // p19
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "closeUp", true);

  // seats a thumb can reach in the part of the room on screen
  const hall = await read(page, "app.seatMap.hall", "value");
  const unit = await read(page, "app", "unit");
  const P = "app.hallScreen.house.pane";
  const sx = await read(page, P, "scrollX"), sy = await read(page, P, "scrollY");
  const pw = await read(page, P, "width"), ph = await read(page, P, "height");
  const inView = (s) => s.x * unit > sx + 30 && s.x * unit < sx + pw - 30 && s.y * unit > sy + 30 && s.y * unit < sy + ph - 30;
  const free = hall.seats.filter((s) => s.seat.status == "available" && inView(s));
  console.log("in view:", free.length, free.map((s) => s.id).join(" "));
  const orch = free.filter((s) => s.section == "ORCH");
  const [a, b] = [orch[0], orch[1]];
  for (const s of [a, b]) await drive.click(`app."${s.label}"`);

  // the Grand Tier is further back: a tap on the map of the house takes the room there
  const M = "app.hallScreen.house.overview.map";
  const gtAll = hall.seats.filter((s) => s.section == "GT" && s.seat.status == "available");
  const target = gtAll[Math.floor(gtAll.length / 2)];
  const k = await read(page, M, "k"), ox = await read(page, M, "ox"), oy = await read(page, M, "oy");
  await drive.clickAt(M, ox + target.x * k, oy + target.y * k);
  await drive.wait(800);
  await drive.settleMotion();
  const sx2 = await read(page, P, "scrollX"), sy2 = await read(page, P, "scrollY");
  const inView2 = (s) => s.x * unit > sx2 + 30 && s.x * unit < sx2 + pw - 30 && s.y * unit > sy2 + 30 && s.y * unit < sy2 + ph - 30;
  const c = hall.seats.find((s) => s.section == "GT" && s.seat.status == "available" && inView2(s));
  console.log("grand tier seat:", c?.id);
  await drive.click(`app."${c.label}"`);
  await drive.settleMotion();
  await expect.equal((await read(page, "app", "chosen")).length, 3);

  // someone else takes b
  console.log("other buyer:", await buyElsewhere("p19", b.id));
  await drive.wait(1500);
  await drive.settleMotion();
  await expect.equal((await read(page, "app", "chosen")).length, 2);
  await expect.text("app.hallScreen.foot", b.label);
  const d = (await read(page, "app.seatMap.hall", "value")).seats.find((s) => s.seat.status == "available" && inView2(s) && ![a.id, b.id, c.id].includes(s.id));
  await drive.click(`app."${d.label}"`);
  await drive.settleMotion();
  const total = await read(page, "app", "summary");
  console.log("summary:", total);

  await drive.click("app.hallScreen.foot.Continue");
  await drive.settleMotion();

  // type an email before signing in; it must survive
  await fill(drive, page, `${F}.card.email.entry`, "ada.at.home@example.com", "Email");

  await reach(drive, page, "Sign in to use saved cards");
  await drive.click(`${F}.signInHint."Sign in to use saved cards"`);
  await drive.settleMotion();
  await fill(drive, page, "app.signInSheet.signInForm.emailField.entry", "ada@example.com");
  await fill(drive, page, "app.signInSheet.signInForm.passwordField.row.entry", "wrong one");
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect.text("app.signInSheet", "That email and password don't match.");
  await fill(drive, page, "app.signInSheet.signInForm.passwordField.row.entry", "correct horse battery");
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app.account", "signedIn", true);
  await expect.equal((await read(page, "app", "chosen")).length, 3);
  await expect.attr("app.checkout", "email", "ada.at.home@example.com");
  await expect.attr("app.checkout", "method", "card_1");
  await expect.attr(`${F}.how.cards.1`, "disabled", true);       // the expired Mastercard

  // the saved Visa, declined (code 000)
  await fill(drive, page, `${F}.saved.savedCvc.entry`, "000", "Security code");
  const payLabel = await read(page, "app.payBar.1", "label");
  console.log("pay label:", payLabel);
  await drive.click("app.payBar.1");
  await drive.settleData();
  await drive.settleMotion();
  await expect.text(`${F}.refusal`, "declined");

  // a new card instead; the postcode mistyped, caught on leaving it
  await reach(drive, page, "New card");
  await drive.click(`${F}.how."New card"`);
  await drive.settleMotion();
  await expect.attr("app.checkout", "line1", "12 Marchmont Street");
  await fill(drive, page, `${F}.card.number.entry`, "5555555555554444", "Card number");
  await expect.attr(`${F}.card.number.entry`, "text", "5555 5555 5555 4444");
  await fill(drive, page, `${F}.card.pair.expiry.entry`, "0830", "Expiry (MM / YY)");
  await fill(drive, page, `${F}.card.pair.cvc.entry`, "456", "Security code");
  await fill(drive, page, `${F}.address.pair.postal.entry`, "WC1N1A", "Postal code");
  await expect.attr(`${F}.address.pair.postal.entry`, "error", "");
  await reach(drive, page, "City");
  await drive.click(`${F}.address.city.entry`);
  await expect.text(`${F}.address.pair.postal`, "A postcode looks like");
  await fill(drive, page, `${F}.address.pair.postal.entry`, "WC1N 1AB", "Postal code");
  await drive.click("app.payBar.1");
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "stage", "tickets");
  await expect.text("app.ticketScreen", "Sent to ada.at.home@example.com");
  await expect.text("app.ticketScreen", "Ticket 1 of 3");
  await drive.click("app.ticketScreen.col.pager.Next");
  await drive.settleMotion();
  await expect.text("app.ticketScreen", "Ticket 2 of 3");

  // sign out, so the next run starts signed out
  await drive.click("app.bar.signOutButton");
  await drive.settleData();
};
