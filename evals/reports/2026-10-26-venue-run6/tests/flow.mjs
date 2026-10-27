// The brief's desk flow, driven as a person would: pick a performance, choose
// seats in two sections, sign in halfway through checkout, be declined on the
// saved card, switch to a new card, fix a postcode, pay, and see the tickets.
// Run: npx declare-verify my-apps/venue/venue.declare --assert ../checks/flow.mjs

const API = "http://127.0.0.1:8350";

async function freeSeats(perf, section, n) {
  const map = await (await fetch(`${API}/api/performances/${perf}/seats`)).json();
  const s = map.sections.find((x) => x.key === section);
  const out = [];
  for (const r of s.rows) for (const st of r.seats) {
    if (st.status === "available" && out.length < n) out.push(`${s.name}, row ${r.name}, seat ${st.number}`);
  }
  return out;
}

const SHOTS = process.env.VENUE_SHOTS;
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.click('app.listScreen.grid.1');           // Fri 13 Nov
  await drive.settleData();
  await expect.attr("app", "stage", "hall");

  const orch = await freeSeats("p01", "ORCH", 2);
  const gt = await freeSeats("p01", "GT", 1);
  for (const name of [...orch, ...gt]) await drive.click(`app.hallScreen.main.pane.room."${name}"`);
  await expect.text("app.hallScreen.side.foot", "3 seats · $"); // the running summary

  await drive.click('app.hallScreen.side.foot."Continue to payment"');
  await expect.attr("app", "stage", "pay");

  // type something before signing in: it must survive
  await drive.click('app.checkoutScreen.form.col.payment.fresh.name.entry');
  await drive.type("A Lovelace");

  await drive.click('app.checkoutScreen.form.col.account."Sign in"');
  await drive.settleMotion();
  await drive.type("ada@example.com");
  await drive.key("Tab");
  await drive.type("wrong password");
  await drive.key("Enter");
  await drive.settleData();
  await expect.attr("app", "signInError", "That email and password don't match.");
  await shot(page, "signin-error");
  await drive.selectAll("app.signInSheet.signForm.pass.row.field");
  await drive.type("correct horse battery");
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "signedIn", true);
  await expect.attr("app", "stage", "pay");
  await expect.attr("app.form", "name", "A Lovelace");      // typed before, kept
  await expect.attr("app.form", "method", "card_1");        // the Visa, offered first

  // the expired Mastercard is shown and can't be chosen
  const sem = await page.evaluate(() => document.body.innerText);
  if (!/Expired 08\/26/.test(sem)) throw new Error("expired card not shown as expired");
  await drive.click('app.checkoutScreen.form.col.payment.choice.group.1');
  await expect.attr("app.form", "method", "card_1");

  // the saved card's code, declined
  await drive.click('app.checkoutScreen.form.col.payment.saved.code.entry');
  await drive.type("000");
  await drive.click('app.checkoutScreen.aside.pay');
  await drive.click('app.checkoutScreen.aside.pay');   // a second press sends nothing
  await drive.settleData();
  await expect.request("POST", "/api/orders", { count: 1, body: { payment: { savedCardId: "card_1", cvc: "000" } } });
  await expect.attr("app.form", "savedCode", "");
  const declined = await page.evaluate(() => document.body.innerText);
  if (!/declined/i.test(declined)) throw new Error("decline sentence not shown");
  await shot(page, "declined");

  // a new card
  await drive.click('app.checkoutScreen.form.col.payment.choice.group.2');
  await expect.attr("app.form", "method", "new");
  await expect.attr("app.form", "email", "ada@example.com");   // from the account
  await drive.click('app.checkoutScreen.form.col.payment.fresh.number.entry');
  await drive.type("4242424242424242");
  await expect.attr("app.form", "number", "4242 4242 4242 4242");
  await drive.key("Tab");
  await drive.type("1229");
  await expect.attr("app.form", "expiry", "12 / 29");
  await drive.key("Tab");
  await drive.type("123");
  // a postcode that isn't one, caught when the field is left
  await drive.selectAll("app.checkoutScreen.form.col.payment.fresh.place.left.postal.entry");
  await drive.type("WC1N");
  await expect.attr("app.checkoutScreen.form.col.payment.fresh.place.left.postal", "shownError", "");
  await drive.key("Tab");
  await expect.attr("app.checkoutScreen.form.col.payment.fresh.place.left.postal", "shownError", "Enter a postcode like SW1A 2AA.");
  await shot(page, "postcode");
  await drive.selectAll("app.checkoutScreen.form.col.payment.fresh.place.left.postal.entry");
  await drive.type("WC1N 1AB");
  await drive.click('app.checkoutScreen.aside.pay');
  await drive.settleData();
  await expect.request("POST", "/api/orders", { count: 2 });
  await expect.attr("app", "stage", "tickets");
  await expect.text("app.ticketsScreen", "Sent to ada@example.com");
  await drive.settleMotion();
  await shot(page, "tickets");
};
