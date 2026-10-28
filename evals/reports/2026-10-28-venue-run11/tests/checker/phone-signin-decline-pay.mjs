// Phone, §10's story: Friday's performance, three seats across two sections by
// finger; one is bought by someone else while they decide (the script buys it
// on the service) and they are told which; checkout, type a little, sign in
// halfway (wrong password first), saved Visa offered beside an expired card;
// pay with the saved card and be declined; switch to a new card, mistype the
// postcode, fix it, pay; three tickets, one at a time; sign out.
import { API, freeSeats, money, perfName, read } from "./lib.mjs";

export const device = { width: 390, height: 844, touch: true };

const has = (expect, path, text) => expect.text(path, text).then(() => true, () => false);

export default async ({ drive, expect }) => {
  await drive.settleData();
  if (await read(drive, "app", "signedIn")) { await drive.click("app.bar.signOutButton"); await drive.settleData(); }

  const prod = await (await fetch(`${API}/api/production`)).json();
  const perf = prod.performances.find((p) => new Date(p.startsAt).getDay() == 5 && p.seatsLeft > 30);
  const free = await freeSeats(perf.id);
  const gt = free["Grand Tier"], bal = free["Balcony"];
  const s1 = gt[Math.floor(gt.length / 2)], s2 = gt[Math.floor(gt.length / 2) + 1], s3 = bal[Math.floor(bal.length / 2)];
  const s4 = bal[Math.floor(bal.length / 2) + 2];

  await drive.click(`app.listScreen.col.list."${perfName(perf)}"`);
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "screen", "hall");

  for (const s of [s1, s2, s3]) { await drive.click(`app.hallScreen."${s.name}"`); await drive.settleMotion(); }
  await expect.attr("app", "chosen", [s1.id, s2.id, s3.id]);
  await expect.text("app.hallScreen.tally", `3 seats · ${money(s1.price + s2.price + s3.price)}`);

  // someone else buys s2 while they look
  const other = await fetch(`${API}/api/orders`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ performanceId: perf.id, seatIds: [s2.id], email: "other@example.com",
      payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "Other" },
        billing: { line1: "1 St", line2: null, city: "Town", postalCode: "94105", country: "US" } } }) });
  if (other.status != 201) throw new Error("could not buy the seat from outside: " + other.status);
  await drive.waitReal(1500);
  await drive.settleMotion();
  await expect.attr("app", "chosen", [s1.id, s3.id]);
  await expect.text("app.hallScreen.tally", s2.name);
  await expect.attr(`app.hallScreen."${s2.name}"`, "disabled", true);
  // choose another
  await drive.click(`app.hallScreen."${s4.name}"`);
  await drive.settleMotion();
  const seats = [s1, s3, s4];
  const sub = seats.reduce((n, s) => n + s.price, 0), total = seats.reduce((n, s) => n + s.price + s.fee, 0);
  await expect.text("app.hallScreen.tally", `3 seats · ${money(sub)}`);

  await drive.click('app.hallScreen.tally.row."Continue"');
  await drive.settleMotion();
  await expect.attr("app", "screen", "checkout");
  await expect.visible(`app.payDock."Pay ${money(total)}"`);

  // type something, then sign in halfway
  await drive.click('app.checkoutScreen."Card number"');
  await drive.type("5555555555554444");
  await drive.click('app.checkoutScreen."Street address"');
  await drive.type("9 Typed Road");
  await drive.click('app.checkoutScreen.col.formCol.account."Sign in"');
  await drive.settleMotion();
  await drive.click('app.signInSheet."Email"');
  await drive.type("ada@example.com");
  await drive.click('app.signInSheet."Password"');
  await drive.type("wrong password");
  await expect.attr('app.signInSheet."Password"', "concealed", true);
  await drive.click('app.signInSheet."Show password"');
  await expect.attr('app.signInSheet."Password"', "concealed", false);
  await drive.click('app.signInSheet."Password"');
  await drive.key("Enter");
  await drive.waitReal(800);
  await drive.settleData();
  await drive.settleMotion();
  await expect.text("app.signInSheet", "That email and password don't match.");
  await drive.selectAll('app.signInSheet."Password"');
  await drive.type("correct horse battery");
  await drive.key("Enter");
  await drive.waitReal(800);
  await drive.settleData();
  await drive.wait(600);
  await drive.settleMotion();
  await expect.attr("app", "signedIn", true);
  await expect.attr("app", "chosen", [s1.id, s3.id, s4.id]);
  await expect.attr("app", "screen", "checkout");

  // saved cards: Visa 4242 offered, the expired Mastercard shown expired and not choosable
  await expect.exists('app.checkoutScreen."Visa ending 4242 · expires 04/28"');
  await expect.attr('app.checkoutScreen."Mastercard ending 4444 · expired 08/26"', "disabled", true);
  await expect.attr("app", "payMode", "card_1");

  // declined
  await drive.click('app.checkoutScreen."Security code"');
  await drive.type("000");
  await drive.click(`app.payDock."Pay ${money(total)}"`);
  await drive.waitReal(2200);
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/orders", { count: 1, body: { payment: { savedCardId: "card_1", cvc: "000" } } });
  const declined = (await drive.requests()).filter((r) => r.path.startsWith("/api/orders")).pop();
  console.log("DECLINE", declined.status);
  await expect.text("app.payDock", "declined");

  // switch to a new card: what they typed before signing in is still there
  await drive.click('app.checkoutScreen."A new card"');
  await drive.settleMotion();
  expect.equal(await read(drive, "app", "cardNumber"), "5555 5555 5555 4444");
  expect.equal(await read(drive, "app", "line1"), "9 Typed Road");
  expect.equal(await read(drive, "app", "email"), "ada@example.com");
  expect.equal(await read(drive, "app", "cardName"), "Ada Lovelace");

  await drive.selectAll('app.checkoutScreen."Card number"');
  await drive.type("4242424242424242");
  expect.equal(await read(drive, "app", "cardNumber"), "4242 4242 4242 4242");
  await drive.click('app.checkoutScreen."Expiry (MM / YY)"');
  await drive.type("0430");
  await drive.click('app.checkoutScreen."Security code"');
  await drive.type("123");
  // the saved billing address is GB: mistype the postcode, be told on moving on
  await drive.selectAll('app.checkoutScreen."Postal code"');
  await drive.type("WC1N");
  await drive.key("Tab");
  await drive.settleMotion();
  await expect.text("app.checkoutScreen", "Enter a UK postcode");
  await drive.selectAll('app.checkoutScreen."Postal code"');
  await drive.type("WC1N 1AB");
  await drive.click(`app.payDock."Pay ${money(total)}"`);
  await drive.waitReal(2500);
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/orders", { count: 2 });
  const last = (await drive.requests()).filter((r) => r.path.startsWith("/api/orders")).pop();
  console.log("PAID", last.status, JSON.stringify(last.body.payment.billing));
  await expect.attr("app", "screen", "tickets");
  await expect.text("app.ticketsScreen", "Sent to ada@example.com");
  await expect.text("app.ticketsScreen", "Ticket 1 of 3");
  await expect.text("app.ticketsScreen", "Doors");

  await drive.click('app.ticketsScreen."Book another performance"');
  await drive.settleMotion();
  await drive.click("app.bar.signOutButton");
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "signedIn", false);
  await expect.request("DELETE", "/api/session", { count: 1 });
};
