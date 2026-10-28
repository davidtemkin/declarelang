// Desk, signed in from the bar: a reload keeps the session; one seat; a new
// card. Amex wants a four-digit code; the service's cvc refusal (card ...0127)
// marks the security code with its sentence and takes the person there. Sign out.
import { freeSeats, roomiest, money, perfName, read } from "./lib.mjs";

const focused = (page) => page.evaluate(() => {
  const e = document.activeElement;
  return e ? (e.getAttribute("aria-label") || e.getAttribute("name") || e.id || e.tagName) : null;
});

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  if (!(await read(drive, "app", "signedIn"))) {
    await drive.click("app.bar.signInButton");
    await drive.settleMotion();
    await drive.click('app.signInSheet."Email"');
    await drive.type("a@a.co");
    await drive.click('app.signInSheet."Password"');
    await drive.type("pass");
    await drive.key("Enter");
    await drive.waitReal(800);
    await drive.settleData();
    await drive.settleMotion();
  }
  await expect.attr("app", "signedIn", true);
  await page.reload();
  await drive.waitReal(1500);
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "signedIn", true);
  await expect.visible("app.bar.signOutButton");

  const perf = await roomiest();
  const free = await freeSeats(perf.id);
  const s = free["Balcony"][3];
  await drive.click(`app.listScreen.col.list."${perfName(perf)}"`);
  await drive.settleData();
  await drive.settleMotion();
  await drive.click(`app.hallScreen."${s.name}"`);
  await drive.settleMotion();
  await drive.click('app.hallScreen.panel.sum."Continue to checkout"');
  await drive.settleMotion();
  // signed in: name and email filled, saved billing used
  await drive.click('app.checkoutScreen."A new card"');
  await drive.settleMotion();
  expect.equal(await read(drive, "app", "email"), "a@a.co");
  expect.equal(await read(drive, "app", "city"), "London");

  await drive.click('app.checkoutScreen."Card number"');
  await drive.type("378282246310005");
  expect.equal(await read(drive, "app", "cardNumber"), "3782 822463 10005");
  await expect.text("app.checkoutScreen", "American Express");
  await drive.click('app.checkoutScreen."Security code"');
  await drive.type("123");
  await drive.key("Tab");
  await drive.settleMotion();
  await expect.text("app.checkoutScreen", "Enter the 4-digit code");

  await drive.selectAll('app.checkoutScreen."Card number"');
  await drive.type("4000000000000127");
  await drive.click('app.checkoutScreen."Expiry (MM / YY)"');
  await drive.type("0430");
  await drive.selectAll('app.checkoutScreen."Security code"');
  await drive.type("123");
  await drive.click('app.checkoutScreen."Address line 2 (optional)"');
  const PAY = `app.checkoutScreen.col.summaryCol."Pay ${money(s.price + s.fee)}"`;
  await drive.click(PAY);
  await drive.waitReal(2200);
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/orders", { count: 1 });
  const r = (await drive.requests()).filter((x) => x.path.startsWith("/api/orders")).pop();
  console.log("CVC422", r.status, JSON.stringify(r.body.payment.billing));
  const f = await focused(page);
  console.log("FOCUS", f);
  await expect.attr("app", "screen", "checkout");
  await expect.text("app.checkoutScreen.col.formCol.form.card.pair.codeField", "");
  const fieldText = await expect.text("app.checkoutScreen.col.formCol.form.card.pair.codeField", "match").then(() => true, () => false);
  if (!fieldText) throw new Error("the service's cvc sentence is not at the security code field");
  if (!/security|cvc/i.test(String(f))) throw new Error("focus is not on the security code after the cvc refusal: " + f);

  await drive.click("app.bar.signOutButton");
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "signedIn", false);
  await page.reload();
  await drive.waitReal(1200);
  await drive.settleData();
  await expect.attr("app", "signedIn", false);
};
