// The brief's phone story: pick a performance, zoom in, choose seats with a
// finger, sign in mid-checkout, a declined saved card, then a new card with a
// postcode mistyped and fixed, and the tickets.
//
//   npx declare-verify my-apps/venue/venue.declare --assert my-apps/venue/checks/phone-flow.mjs

export const device = { width: 390, height: 844, touch: true };

async function freeSeats(page, perf, n) {
  return page.evaluate(async ([perf, n]) => {
    const r = await fetch(`http://127.0.0.1:8350/api/performances/${perf}/seats`);
    const d = await r.json();
    const out = [];
    for (const s of d.sections) for (const row of s.rows) for (const seat of row.seats)
      if (seat.status === "available" && out.filter((o) => o.key === s.key).length < n)
        out.push({ key: s.key, name: s.name, row: row.name, number: seat.number, id: seat.id });
    return out;
  }, [perf, n]);
}

export default async ({ drive, expect, page }) => {
  // a person scrolls a long form to the field they want; so does this
  const field = async (path) => {
    await page.evaluate((p) => { const b = window.__declare.find(p).rootBounds(); window.scrollBy(0, b.y - 160); return null; }, path);
    await drive.wait(300);
    await drive.click(path);
  };
  const retype = async (path) => {
    await page.evaluate((p) => { const b = window.__declare.find(p).rootBounds(); window.scrollBy(0, b.y - 160); return null; }, path);
    await drive.wait(300);
    await drive.selectAll(path);
  };
  await drive.settleData();
  await drive.set("app", "location", "p17");
  await drive.settleData();
  await drive.settleMotion();

  // zoom into the stalls, then pick two orchestra seats and one dress circle seat
  const free = await freeSeats(page, "p17", 2);
  const orch = free.filter((s) => s.key === "ORCH");
  const dc = free.filter((s) => s.key === "DC");
  const label = (s) => `${s.name}, row ${s.row}, seat ${s.number}`;

  await drive.clickAt("app.hallScreen.stagePane.mapBox.catcher", 180, 220);
  await drive.settleMotion();
  await expect.attr("app", "landed", true);

  for (const s of [orch[0], orch[1], dc[0]]) {
    await drive.set("app", "zoomed", true);
    await drive.click(`app."${label(s)}"`);
  }
  await drive.settleMotion();
  const prices = { ORCH: 8000, DC: 5000 };
  await expect.text("app.hallBar", `3 seats · $${((2 * 8000 + 5000) / 100).toFixed(2)}`);

  // someone else takes one of them
  await drive.page.evaluate((id) => window.__declare.find("app").taken(id), dc[0].id);
  await drive.settleMotion();
  await expect.text("app.hallBar", "was just taken by someone else");
  await expect.text("app.hallBar", "2 seats · $160.00");

  // choose another, and go to checkout
  await drive.click(`app."${label(dc[1])}"`);
  await expect.text("app.hallBar", "3 seats · $210.00");
  await drive.click("app.hallBar.Continue");
  await drive.settleMotion();
  await expect.equal(await drive.page.evaluate(() => window.__declare.find("app").screen), "checkout");

  // type an email first, then sign in: nothing typed is lost
  await field('app.form.newCard.numberF.box.input');
  await drive.type("4242");
  await drive.click("app.bar.signIn");
  await drive.settleMotion();
  await drive.click('app.signInDialog.emailF.box.input');
  await drive.type("ada@example.com");
  await drive.click('app.signInDialog.passwordF.box.input');
  await drive.type("wrong password");
  await drive.key("Enter");
  await drive.settleData();
  await expect.text("app.signInDialog", "That email and password don't match.");
  await drive.selectAll('app.signInDialog.passwordF.box.input');
  await drive.type("correct horse battery");
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "signedIn", true);
  await expect.attr("app.pay", "number", "4242");

  // the typed card number kept the new-card choice; pick the saved Visa
  await drive.click('app."Visa ending 4242, expires 04/28"');
  await expect.attr("app.pay", "method", "card_1");
  await expect.attr('app."Mastercard ending 4444, expired 08/26"', "disabled", true);

  await field('app.form.savedCode.box.input');
  await drive.type("000");
  await drive.click('app.payBar."Pay $229.00"');
  await drive.click('app.payBar."Pay $229.00"');
  await drive.settleData();
  await expect.request("POST", "/api/orders", { count: 1 });
  await expect.text("app.payBar", "declined");
  await expect.attr("app.pay", "savedCvc", "");

  // a new card: watch it group, mistype the postcode, fix it, pay
  await drive.click('app."A new card"');
  await drive.settleMotion();
  await retype('app.form.newCard.numberF.box.input');
  await drive.type("4242424242424242");
  await expect.attr("app.pay", "number", "4242 4242 4242 4242");
  await field('app.form.newCard.dates.expiryF.box.input');
  await drive.type("0428");
  await expect.attr("app.pay", "expiry", "04 / 28");
  await field('app.form.newCard.dates.cvcF.box.input');
  await drive.type("123");
  await expect.attr("app.pay", "country", "GB");
  await retype('app.form.newCard.place.postalF.box.input');
  await drive.type("WC1N");
  await field('app.form.newCard.cityF.box.input');
  await drive.settleMotion();
  await expect.text("app.checkoutScreen", "A UK postcode looks like SW1A 2AA.");
  await retype('app.form.newCard.place.postalF.box.input');
  await drive.type("WC1N 1AB");
  await drive.click('app.payBar."Pay $229.00"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.equal(await drive.page.evaluate(() => window.__declare.find("app").screen), "tickets");
  await expect.text("app.ticketsScreen", "Sent to ada@example.com");
  await expect.request("POST", "/api/orders", { count: 2 });
};
