// Desk, no account: pick a performance, choose seats in two sections, check the
// summary, unchoose one, go to checkout, see the form catch mistakes, pay with a
// new card (pressing Pay twice), and get one ticket per seat.
import { freeSeats, roomiest, money, perfName, read } from "./lib.mjs";

export default async ({ drive, expect }) => {
  await drive.settleData();
  const perf = await roomiest();
  const free = await freeSeats(perf.id);
  const a = free["Orchestra"][Math.floor(free["Orchestra"].length / 2)];
  const b = free["Dress Circle"][Math.floor(free["Dress Circle"].length / 2)];
  const c = free["Dress Circle"][Math.floor(free["Dress Circle"].length / 2) + 1];

  // §1 the list: twenty, each with date, time, price from, availability
  await expect.count("app.listScreen.col.list", "PerfRow", 20);
  await expect.text("app.listScreen.col.list.0", "from $");
  await expect.text("app.listScreen.col.list.0", "left");

  await drive.click(`app.listScreen.col.list."${perfName(perf)}"`);
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "screen", "hall");

  // §2 choose three seats across two sections, then let one go
  for (const s of [a, b, c]) { await drive.click(`app.hallScreen."${s.name}"`); await drive.settleMotion(); }
  const three = a.price + b.price + c.price;
  await expect.text("app.hallScreen.panel.sum", `3 seats · ${money(three)}`);
  await drive.click(`app.hallScreen."${c.name}"`);
  await drive.settleMotion();
  const two = a.price + b.price;
  await expect.text("app.hallScreen.panel.sum", `2 seats · ${money(two)}`);
  await expect.attr(`app.hallScreen."${a.name}"`, "accessibilityPressed", true);
  await expect.attr(`app.hallScreen."${c.name}"`, "accessibilityPressed", false);

  // §4 checkout: lines and total
  await drive.click('app.hallScreen.panel.sum."Continue to checkout"');
  await drive.settleMotion();
  await expect.attr("app", "screen", "checkout");
  const total = two + a.fee + b.fee;
  await expect.text("app.checkoutScreen", money(a.price));
  await expect.text("app.checkoutScreen", money(a.fee));
  await expect.text("app.checkoutScreen", money(total));
  const PAY = `app.checkoutScreen.col.summaryCol."Pay ${money(total)}"`;
  await expect.visible(PAY);

  // the form: an impossible number is caught when they leave it, not while typing
  await drive.click('app.checkoutScreen."Email"');
  await drive.type("checker@example.com");
  await drive.click('app.checkoutScreen."Name on card"');
  await drive.type("Check Er");
  await drive.click('app.checkoutScreen."Card number"');
  await drive.type("4242424242424241");
  await drive.settleMotion();
  // not marked wrong while still typing in it the first time
  const early = await expect.text("app.checkoutScreen", "isn't a valid card number").then(() => true, () => false);
  if (early) throw new Error("card number marked wrong while still being typed");
  await drive.key("Tab");
  await drive.settleMotion();
  await expect.text("app.checkoutScreen", "That isn't a valid card number");
  // fix it: grouped as typed, brand shown
  await drive.selectAll('app.checkoutScreen."Card number"');
  await drive.type("4242424242424242");
  await drive.settleMotion();
  expect.equal(await read(drive, "app", "cardNumber"), "4242 4242 4242 4242");
  await expect.text("app.checkoutScreen", "Visa");

  // expiry: a month that isn't one, then one in the past
  await drive.key("Tab");
  await drive.type("13/30");
  await drive.key("Tab");
  await drive.settleMotion();
  await expect.text("app.checkoutScreen", "There's no month 13");
  await drive.selectAll('app.checkoutScreen."Expiry (MM / YY)"');
  await drive.type("0124");
  await drive.key("Tab");
  await drive.settleMotion();
  await expect.text("app.checkoutScreen", "This card has expired");
  await drive.selectAll('app.checkoutScreen."Expiry (MM / YY)"');
  await drive.type("0430");
  await drive.click('app.checkoutScreen."Security code"');
  await drive.type("123");
  await drive.click('app.checkoutScreen."Street address"');
  await drive.type("1 Market St");
  await drive.click('app.checkoutScreen."City"');
  await drive.type("San Francisco");
  await drive.click('app.checkoutScreen."Postal code"');
  await drive.type("9410");
  await drive.key("Tab");
  await drive.settleMotion();
  // no country chosen yet: is a short ZIP caught on leaving?
  console.log("ZIP_CAUGHT_BEFORE_COUNTRY", await expect.text("app.checkoutScreen", "Enter a 5-digit ZIP code").then(() => true, () => false));
  await drive.click('app.checkoutScreen."United States"');
  await drive.settleMotion();
  await expect.text("app.checkoutScreen", "Enter a 5-digit ZIP code");
  await drive.selectAll('app.checkoutScreen."Postal code"');
  await drive.type("94105");
  await drive.settleMotion();

  // Pay, twice, quickly
  await drive.click(PAY);
  await drive.click(PAY).catch(() => {});
  await drive.key("Enter");
  const seen = [];
  for (let i = 0; i < 30; i++) {
    await drive.waitReal(100);
    const st = await drive.page.evaluate(() => { const a = window.__declare.find("app"); return [a.screen, a.chosen.length, a.notice].join("|"); });
    if (seen[seen.length - 1] != st) seen.push(st);
  }
  console.log("DURING", JSON.stringify(seen));
  if (seen.some((x) => x.startsWith("hall"))) throw new Error("the hall showed while the payment was out: " + JSON.stringify(seen));
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/orders", { count: 1, body: { performanceId: perf.id, seatIds: [a.id, b.id], email: "checker@example.com" } });

  const reqs = (await drive.requests()).filter((r) => r.path.startsWith("/api/orders"));
  console.log("ORDERS", JSON.stringify(reqs.map((r) => [r.status, r.body])));
  console.log("STATE", JSON.stringify({ screen: await read(drive, "app", "screen"), notice: await read(drive, "app", "notice"), waypoint: await read(drive, "app", "waypoint"), chosen: await read(drive, "app", "chosen"), loaded: await read(drive, "app.placeOrder", "loaded"), err: await read(drive, "app.placeOrder", "errorBody") }));
  // their own seats, sold to them, are not "taken by someone else"
  await expect.attr("app", "notice", "");
  // §5 tickets
  await expect.attr("app", "screen", "tickets");
  await expect.text("app.ticketsScreen", "Sent to checker@example.com");
  await expect.text("app.ticketsScreen", "Ticket 1 of 2");
  await drive.click('app.ticketsScreen.col.nav."Next"');
  await drive.settleMotion();
  await expect.text("app.ticketsScreen", "Ticket 2 of 2");
  await drive.click('app.ticketsScreen."Book another performance"');
  await drive.settleMotion();
  await expect.attr("app", "screen", "list");
};
