// The brief's §10 at a desk: sign in mid-checkout, saved card declined, new card,
// a wrong postcode caught on leaving, then paid.
export default async ({ drive, expect, page }) => {
  const free = async (key, n) => page.evaluate(([k, n]) => {
    const h = window.__declare.find("app.house");
    return h.seatsAll().filter((s) => s.seat.status == "available" && s.sectionKey == k).slice(0, n).map((s) => s.label);
  }, [key, n]);

  await drive.settleData();
  await drive.click("app.listScreen.list.rows.1");
  await drive.settleData();
  const orch = await free("ORCH", 2), gt = await free("GT", 1);
  for (const l of [...orch, ...gt]) await drive.click(`app."${l}"`);
  await drive.settleMotion();
  await expect.attr("app", "summaryText", "3 seats · $225.00");
  await drive.click("app.hallScreen.side.Continue");
  await expect.attr("app", "screen", "checkout");

  // type an email first, then sign in: it must survive
  await drive.click('app.checkoutScreen.main.form."Email"');
  await drive.type("me@typed.example");
  await drive.click('app.header."Sign in"');
  await drive.settleMotion();
  await drive.click('app.signInSheet."Email"');
  await drive.type("ada@example.com");
  await drive.click('app.signInSheet."Password"');
  await drive.type("wrong");
  await drive.key("Enter");
  await drive.settleData();
  await expect.text("app.signInSheet", "That email and password don't match.");
  await drive.click('app.signInSheet."Password"');
  await drive.key("End");
  for (let i = 0; i < 5; i++) await drive.key("Backspace");
  await drive.type("correct horse battery");
  await drive.click('app.signInSheet."Sign in"');
  await drive.settleData();
  await drive.settleMotion();
  console.log("ORIGIN", await page.evaluate(() => location.href), JSON.stringify((await drive.requests()).map((r) => [r.method, r.path, r.status, r.body])));
  await expect.attr("app", "signedIn", true);
  await expect.attr("app", "screen", "checkout");
  await expect.attr("app.checkout", "email", "me@typed.example");
  await expect.attr("app.checkout", "pay", "card_1");
  await expect.attr("app.checkout", "city", "London");

  // the saved card, declined
  await drive.click('app.checkoutScreen.main.form."Security code"');
  await drive.type("000");
  await drive.click('app.checkoutScreen.aside."Pay $245.00"');
  await drive.click('app.checkoutScreen.aside."Pay $245.00"');
  await drive.settleData();
  await expect.request("POST", "/api/orders", { count: 1, body: { email: "me@typed.example", payment: { savedCardId: "card_1", cvc: "000" } } });
  await expect.text("app.checkoutScreen.aside", "declined");
  await expect.attr("app.checkout", "savedCvc", "");

  // a new card
  await drive.click('app.checkoutScreen.main.form."A new card"');
  await drive.click('app.checkoutScreen.main.form."Card number"');
  await drive.type("4242424242424242");
  await expect.equal(await page.evaluate(() => document.activeElement.value), "4242 4242 4242 4242");
  await expect.attr("app.checkout", "brand", "visa");
  await drive.click('app.checkoutScreen.main.form."Expiry"');
  await drive.type("0428");
  await drive.click('app.checkoutScreen.main.form.newCard.pair."Security code"');
  await drive.type("123");
  await drive.click('app.checkoutScreen.main.form."Postal code"');
  await drive.key("End");
  for (let i = 0; i < 10; i++) await drive.key("Backspace");
  await drive.type("WC1N");
  await drive.key("Tab");
  await expect.text("app.checkoutScreen.main.form", "Enter a postcode like SW1A 2AA.");
  await drive.click('app.checkoutScreen.main.form."Postal code"');
  await drive.key("End");
  for (let i = 0; i < 10; i++) await drive.key("Backspace");
  await drive.type("WC1N 1AB");
  await drive.click('app.checkoutScreen.aside."Pay $245.00"');
  await drive.settleData();
  await expect.attr("app", "screen", "tickets");
  await expect.text("app.ticketsScreen", "Sent to me@typed.example");
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/venue-shots/tickets.png" });
  await drive.click('app.ticketsScreen."Next"');
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/venue-shots/tickets2.png" });
  console.log(JSON.stringify((await drive.requests()).filter((r) => r.path.startsWith("/api/orders")).map((r) => [r.status, r.body])));
};
